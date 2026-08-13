const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const catalogRoutes = require("./catalog");

const JWT_SECRET = process.env.JWT_SECRET;

function getCookie(req, name) {
  if (!req.headers || !req.headers.cookie) return null;
  const cookies = req.headers.cookie.split(';');
  for (let c of cookies) {
    c = c.trim();
    if (c.startsWith(name + '=')) {
      return decodeURIComponent(c.substring(name.length + 1));
    }
  }
  return null;
}

async function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    token = authHeader.split(' ')[1];
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)nl_jwt=([^;]*)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
        const authData = jwt.verify(token, JWT_SECRET);
    const [[user]] = await db.execute("SELECT auth_version FROM user_northline WHERE id = ?", [authData.id]);
    if (!user || (authData.authVersion || 0) !== user.auth_version) {
      return res.status(401).json({ success: false, message: "Sesi berakhir, silakan login ulang" });
    }
    req.user = authData;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function signAffCookie(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyAffCookie(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function getCommissionRate(totalPrice) {
  const price = parseInt(totalPrice || 0);
  if (price < 200000) return 5;
  if (price < 300000) return 4;
  return 3;
}

async function generateAffiliateCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 20; i++) {
    let code = 'nrt';
    for (let j = 0; j < 14; j++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    const [rows] = await db.execute('SELECT id FROM user_northline WHERE affiliate_code = ?', [code]);
    if (rows.length === 0) return code;
  }
  return 'nrt' + Date.now().toString(36) + crypto.randomInt(100000, 999999).toString(36);
}

async function ensureAffiliateCode(userId) {
  const [rows] = await db.execute('SELECT affiliate_code, affiliate_enabled FROM user_northline WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  if (rows[0].affiliate_code) {
    return rows[0].affiliate_enabled ? rows[0].affiliate_code : null;
  }
  const code = await generateAffiliateCode();
  await db.execute('UPDATE user_northline SET affiliate_code = ? WHERE id = ?', [code, userId]);
  return code;
}

async function grantCommission(orderId) {
  try {
    const [txs] = await db.execute(
      `SELECT t.order_id, t.user_id, t.affiliate_user_id, t.product_id, t.product_name,
              t.total_price, t.status
       FROM transactions t WHERE t.order_id = ? LIMIT 1`,
      [orderId]
    );
    if (txs.length === 0) return { granted: false, reason: 'not_found' };

    const tx = txs[0];
    if (tx.status !== 'success') return { granted: false, reason: 'not_success' };
    if (!tx.affiliate_user_id) return { granted: false, reason: 'no_affiliate' };
    if (Number(tx.affiliate_user_id) === Number(tx.user_id)) {
      return { granted: false, reason: 'self_purchase' };
    }

    const [existing] = await db.execute(
      'SELECT id FROM affiliate_commissions WHERE order_id = ? LIMIT 1',
      [orderId]
    );
    if (existing.length > 0) return { granted: false, reason: 'already_granted' };

    const [affRows] = await db.execute(
      'SELECT id, affiliate_enabled FROM user_northline WHERE id = ? AND affiliate_enabled = 1',
      [tx.affiliate_user_id]
    );
    if (affRows.length === 0) return { granted: false, reason: 'affiliate_disabled' };

    const rate = getCommissionRate(tx.total_price);
    const amount = Math.round((tx.total_price || 0) * rate / 100);
    if (amount <= 0) return { granted: false, reason: 'zero_amount' };

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO affiliate_commissions
           (affiliate_user_id, order_id, product_id, product_name, total_price, commission_rate, commission_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
        [tx.affiliate_user_id, tx.order_id, tx.product_id, tx.product_name, tx.total_price, rate, amount]
      );

      await conn.execute(
        'UPDATE user_northline SET northpay_balance = northpay_balance + ? WHERE id = ?',
        [amount, tx.affiliate_user_id]
      );

      await conn.execute(
        'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
        [tx.affiliate_user_id, 'Komisi Affiliate Masuk',
         `Komisi affiliate Rp ${parseInt(amount).toLocaleString('id-ID')} untuk order ${orderId} telah masuk ke saldo NorthPay Anda.`]
      );

      await conn.commit();
      conn.release();
      return { granted: true, amount, rate };
    } catch (txErr) {
      await conn.rollback();
      conn.release();
      throw txErr;
    }
  } catch (err) {
    console.error('grantCommission error:', err.message);
    return { granted: false, reason: 'error', message: err.message };
  }
}

router.post('/enable', verifyToken, async (req, res) => {
  try {
    const code = await ensureAffiliateCode(req.user.id);
    if (!code) return res.status(400).json({ success: false, message: 'Program affiliate dinonaktifkan' });
    await db.execute('UPDATE user_northline SET affiliate_enabled = 1 WHERE id = ?', [req.user.id]);
    res.json({ success: true, code });
  } catch (err) {
    console.error('affiliate enable error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const code = await ensureAffiliateCode(userId);
    if (!code) return res.status(400).json({ success: false, message: 'Program affiliate dinonaktifkan' });

    const [[clickCount]] = await db.execute(
      'SELECT COUNT(*) AS total FROM affiliate_clicks WHERE affiliate_code = ?',
      [code]
    );

    const [[commAgg]] = await db.execute(
      `SELECT COALESCE(SUM(commission_amount), 0) AS totalCommission,
              COALESCE(SUM(CASE WHEN status = 'success' THEN commission_amount ELSE 0 END), 0) AS paidCommission,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pendingCommission,
              COUNT(*) AS totalOrders
       FROM affiliate_commissions WHERE affiliate_user_id = ?`,
      [userId]
    );

    const [[buyerCount]] = await db.execute(
      `SELECT COUNT(DISTINCT t.user_id) AS total
       FROM transactions t
       INNER JOIN affiliate_commissions ac ON ac.order_id = t.order_id
       WHERE ac.affiliate_user_id = ?`,
      [userId]
    );

    const [commissions] = await db.execute(
      `SELECT ac.*, t.user_id AS buyer_id,
              (SELECT u.username FROM user_northline u WHERE u.id = t.user_id) AS buyer_name
       FROM affiliate_commissions ac
       LEFT JOIN transactions t ON t.order_id = ac.order_id
       WHERE ac.affiliate_user_id = ?
       ORDER BY ac.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const clicks = parseInt(clickCount?.total || 0);
    const buyers = parseInt(buyerCount?.total || 0);
    const conversion = clicks > 0 ? Math.round((buyers / clicks) * 1000) / 10 : 0;

    res.json({
      success: true,
      code,
      linkBase: '/?product=',
      clicks,
      buyers,
      conversion,
      totalCommission: parseInt(commAgg?.totalCommission || 0),
      paidCommission: parseInt(commAgg?.paidCommission || 0),
      pendingCommission: parseInt(commAgg?.pendingCommission || 0),
      totalOrders: parseInt(commAgg?.totalOrders || 0),
      commissions: commissions.map(c => ({
        ...c,
        commission_amount: parseInt(c.commission_amount),
        total_price: parseInt(c.total_price),
        commission_rate: parseFloat(c.commission_rate),
        created_at: c.created_at
      }))
    });
  } catch (err) {
    console.error('affiliate dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const [dbProducts] = await db.execute(
      `SELECT p.id, p.name, p.price,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image
       FROM products p
       WHERE p.status = 'active'
       ORDER BY p.name`
    );

    const localProducts = catalogRoutes.NORTHLINE_CATALOG
      .slice()
      .reverse()
      .map((p) => {
        const price = p.price || p.priceShort || 0;
        return {
          id: p.id,
          code: catalogRoutes.getProductCode(p.id),
          name: p.name,
          price,
          image: (p.images && p.images[0]) || '/public/icons/default.png',
          source: 'local',
          categories: catalogRoutes.getCategories(p),
          models: p.models || null,
          colors: p.colors || [],
          aiPick: catalogRoutes.aiPickIds().has(p.id),
          commissionRate: getCommissionRate(price),
          commissionLabel: 'Komisi ' + getCommissionRate(price) + '%',
        };
      });

    const localIds = new Set(localProducts.map((p) => p.id));
    const uniqueDbProducts = dbProducts.filter((p) => !localIds.has(p.id));

    res.json({
      success: true,
      products: uniqueDbProducts.map(p => {
        const price = Number(p.price) || 0;
        return {
          id: p.id,
          name: p.name,
          price,
          image: p.image || '/public/icons/default.png',
          source: 'database',
          categories: [],
          models: null,
          colors: [],
          commissionRate: getCommissionRate(price),
          commissionLabel: 'Komisi ' + getCommissionRate(price) + '%',
        };
      }).concat(localProducts)
    });
  } catch (err) {
    console.error('affiliate products error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/hit', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, message: 'Kode affiliate tidak valid' });
    }

    const [rows] = await db.execute(
      'SELECT id FROM user_northline WHERE affiliate_code = ? AND affiliate_enabled = 1',
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kode affiliate tidak ditemukan' });
    }

    const affiliateUserId = rows[0].id;
    const exp = Date.now() + (30 * 24 * 60 * 60 * 1000);
    const cookieVal = signAffCookie({ aid: affiliateUserId, exp });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
    await db.execute('INSERT INTO affiliate_clicks (affiliate_code, referrer_ip) VALUES (?, ?)', [code, ip]);

    res.cookie('nl_aff', cookieVal, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } catch (err) {
    console.error('affiliate hit error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/check', async (req, res) => {
  try {
    const val = getCookie(req, 'nl_aff');
    const payload = verifyAffCookie(val);
    if (!payload) return res.json({ success: false, active: false });
    res.json({ success: true, active: true, affiliateUserId: payload.aid });
  } catch (e) {
    res.json({ success: false, active: false });
  }
});

module.exports = router;
module.exports.grantCommission = grantCommission;
module.exports.verifyAffCookie = verifyAffCookie;
module.exports.getCommissionRate = getCommissionRate;
