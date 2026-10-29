const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const path = require("path");
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

// Aturan komisi affiliate Northline:
// - 10 pembelian pertama  -> komisi 0,5% dari nilai transaksi
// - pembelian ke-11 dan seterusnya -> tanpa komisi
//
// Harga produk tidak lagi memengaruhi tarif.
//
// Catatan: penghitung membaca affiliate_commissions. Karena komisi berhenti
// dibuat setelah 10 pembelian, hitungannya bekU di 10 sehingga aturan
// "ke-11 dan seterusnya tanpa komisi" otomatis terus berlaku.
const COMMISSION_STARTER_AFTER = 10;
const COMMISSION_STARTER_RATE = 0.5;
const COMMISSION_AFTER_RATE = 0;

function getCommissionRate(totalPrice, purchaseCount) {
  const done = Number(purchaseCount);
  const prior = Number.isFinite(done) && done > 0 ? done : 0;
  return prior < COMMISSION_STARTER_AFTER ? COMMISSION_STARTER_RATE : COMMISSION_AFTER_RATE;
}

function commissionLabel(rate) {
  const r = Number(rate) || 0;
  if (r <= 0) return 'Tanpa komisi';
  return 'Komisi ' + String(r).replace('.', ',') + '%';
}

// Jumlah pembelian yang sudah digenerate komisi (dasar hitungan 10 pembelian)
async function countAffiliatePurchases(affiliateUserId, conn) {
  const runner = conn || db;
  const [[row]] = await runner.execute(
    'SELECT COUNT(*) AS n FROM affiliate_commissions WHERE affiliate_user_id = ?',
    [affiliateUserId]
  );
  return Number(row && row.n ? row.n : 0);
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

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // dihitung DI DALAM transaksi supaya dua order bersamaan tidak salah dapat tarif
      const priorPurchases = await countAffiliatePurchases(tx.affiliate_user_id, conn);
      const priceNum = Number(tx.total_price);
      const basePrice = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : 0;
      const rate = getCommissionRate(basePrice, priorPurchases);
      const amount = Math.round(basePrice * rate / 100);
      if (!Number.isFinite(amount) || amount <= 0) {
        await conn.rollback();
        conn.release();
        return {
          granted: false,
          reason: rate <= 0 ? 'no_commission_after_starter' : 'zero_amount'
        };
      }

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
         `Komisi affiliate ${rate}% (Rp ${parseInt(amount).toLocaleString('id-ID')}) untuk order ${orderId} telah masuk ke saldo NorthPay Anda.`]
      );

      await conn.commit();
      conn.release();
      return { granted: true, amount, rate, priorPurchases };
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
    // dipakai agar label komisi di kartu produk sama dengan yang benar-benar dibayar
    let purchases = 0;
    try {
      const qCode = String(req.query.code || '').trim();
      let affId = null;
      if (qCode) {
        const [[byCode]] = await db.execute(
          'SELECT id FROM user_northline WHERE affiliate_enabled = 1 AND affiliate_code = ? LIMIT 1',
          [qCode]
        );
        if (byCode) affId = byCode.id;
      } else if (req.user && req.user.id) {
        affId = req.user.id;
      }
      if (affId) purchases = await countAffiliatePurchases(affId);
    } catch (e) {
      purchases = 0;
    }

    const [dbProducts] = await db.execute(
      `SELECT p.id, p.name, p.price, p.stock,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image
       FROM products p
       WHERE p.status = 'active' AND p.stock > 0
       ORDER BY p.name`
    );

    const localProducts = catalogRoutes.NORTHLINE_CATALOG
      .filter(p => (p.stock || 0) > 0)
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
          commissionRate: getCommissionRate(price, purchases),
          commissionLabel: commissionLabel(getCommissionRate(price, purchases)),
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
          commissionRate: getCommissionRate(price, purchases),
          commissionLabel: commissionLabel(getCommissionRate(price, purchases)),
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

const TAGLINE_MAX = 140;
const BIO_MAX = 500;

function cleanText(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanBio(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return null;
  return s.slice(0, BIO_MAX);
}

router.get('/profile/mine', verifyToken, async (req, res) => {
  try {
    const code = await ensureAffiliateCode(req.user.id);
    if (!code) return res.status(400).json({ success: false, message: 'Program affiliate dinonaktifkan' });

    const [[row]] = await db.execute(
      `SELECT affiliate_tagline, affiliate_bio, affiliate_profile_visible
       FROM user_northline WHERE id = ?`,
      [req.user.id]
    );

    res.json({
      success: true,
      code,
      tagline: (row && row.affiliate_tagline) || '',
      bio: (row && row.affiliate_bio) || '',
      profileVisible: !!(row && row.affiliate_profile_visible),
      profilePath: '/affiliate/' + code
    });
  } catch (err) {
    console.error('affiliate profile/mine error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/profile', verifyToken, async (req, res) => {
  try {
    const code = await ensureAffiliateCode(req.user.id);
    if (!code) return res.status(400).json({ success: false, message: 'Program affiliate dinonaktifkan' });

    const tagline = cleanText(req.body.tagline, TAGLINE_MAX);
    const bio = cleanBio(req.body.bio);
    const visible = req.body.profileVisible;

    if (tagline !== undefined && tagline !== null && String(tagline).length > TAGLINE_MAX) {
      return res.status(400).json({ success: false, message: 'Tagline maksimal ' + TAGLINE_MAX + ' karakter' });
    }

    const sets = [];
    const params = [];
    if (tagline !== undefined) { sets.push('affiliate_tagline = ?'); params.push(tagline); }
    if (bio !== undefined) { sets.push('affiliate_bio = ?'); params.push(bio); }
    if (visible !== undefined) {
      sets.push('affiliate_profile_visible = ?');
      params.push(visible ? 1 : 0);
    }

    if (sets.length > 0) {
      params.push(req.user.id);
      await db.execute(
        'UPDATE user_northline SET ' + sets.join(', ') + ' WHERE id = ?',
        params
      );
    }

    res.json({ success: true, profilePath: '/affiliate/' + code });
  } catch (err) {
    console.error('affiliate profile update error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

function stockProducts(purchases) {
  return catalogRoutes.NORTHLINE_CATALOG
    .filter((p) => (p.stock || 0) > 0)
    .map((p) => {
      const price = p.price || p.priceShort || 0;
      return {
        id: p.id,
        code: catalogRoutes.getProductCode(p.id),
        name: p.name,
        price: Number(price) || 0,
        stock: Number(p.stock) || 0,
        image: (p.images && p.images[0]) || '/public/icons/default.png',
        categories: catalogRoutes.getCategories(p),
        commissionRate: getCommissionRate(price, purchases)
      };
    })
    .sort((a, b) => b.id - a.id);
}

router.get('/avatar/:code', async (req, res) => {
  const FALLBACK_AVATAR = path.join(__dirname, "../../frontend/public/icons/Favicon.png");
  try {
    const code = String(req.params.code || '').trim();
    if (!/^nrt[a-z0-9]{2,}$/i.test(code)) {
      return res.status(404).end();
    }

    const [rows] = await db.execute(
      `SELECT avatar FROM user_northline
       WHERE affiliate_code = ? AND affiliate_enabled = 1 AND affiliate_profile_visible = 1
       LIMIT 1`,
      [code]
    );

    if (rows.length === 0) return res.status(404).end();

    const raw = rows[0].avatar;
    res.set('Cache-Control', 'public, max-age=300');

    // tanpa avatar -> pakai logo toko supaya preview tidak rusak
    if (!raw) return res.sendFile(FALLBACK_AVATAR);

    // avatar berupa http(s) URL -> arahkan saja
    if (/^https?:\/\//i.test(raw)) return res.redirect(302, raw);

    // avatar disimpan sebagai data URI base64 (lihat /api/auth/upload-avatar)
    const m = /^data:([\w.+/-]+);base64,([\s\S]+)$/i.exec(raw);
    if (!m) return res.sendFile(FALLBACK_AVATAR);

    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) return res.sendFile(FALLBACK_AVATAR);

    res.set('Content-Type', m[1].toLowerCase());
    res.set('Content-Length', buf.length);
    return res.end(buf);
  } catch (e) {
    console.error('Error affiliate avatar:', e);
    return res.status(500).end();
  }
});

router.get('/profile/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!/^nrt[a-z0-9]{2,}$/i.test(code)) {
      return res.status(404).json({ success: false, available: false });
    }

    const [rows] = await db.execute(
      `SELECT id, username, name, avatar, created_at, affiliate_tagline, affiliate_bio
       FROM user_northline
       WHERE affiliate_code = ? AND affiliate_enabled = 1 AND affiliate_profile_visible = 1
       LIMIT 1`,
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, available: false });
    }

    const aff = rows[0];

    const [[clickAgg]] = await db.execute(
      `SELECT COUNT(*) AS total FROM affiliate_clicks WHERE affiliate_code = ?`,
      [code]
    );
    const [[orderAgg]] = await db.execute(
      `SELECT COUNT(*) AS totalOrders,
              COALESCE(SUM(commission_amount), 0) AS totalCommission
       FROM affiliate_commissions WHERE affiliate_user_id = ?`,
      [aff.id]
    );
    const [[buyerAgg]] = await db.execute(
      `SELECT COUNT(DISTINCT t.user_id) AS total
       FROM transactions t
       INNER JOIN affiliate_commissions ac ON ac.order_id = t.order_id
       WHERE ac.affiliate_user_id = ?`,
      [aff.id]
    );

    const clicks = parseInt(clickAgg?.total || 0);
    const buyers = parseInt(buyerAgg?.total || 0);
    const purchaseCount = await countAffiliatePurchases(aff.id);

    res.json({
      success: true,
      available: true,
      profile: {
        code,
        purchaseCount,
        username: aff.username,
        name: aff.name || aff.username,
        avatar: aff.avatar || null,
        tagline: aff.affiliate_tagline || null,
        bio: aff.affiliate_bio || null,
        joinedAt: aff.created_at,
        stats: {
          clicks,
          buyers,
          orders: parseInt(orderAgg?.totalOrders || 0),
          totalCommission: parseInt(orderAgg?.totalCommission || 0),
          conversion: clicks > 0 ? Math.round((buyers / clicks) * 1000) / 10 : 0
        }
      },
      products: stockProducts(purchaseCount)
    });
  } catch (err) {
    console.error('affiliate profile error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.grantCommission = grantCommission;
module.exports.verifyAffCookie = verifyAffCookie;
module.exports.getCommissionRate = getCommissionRate;
module.exports.countAffiliatePurchases = countAffiliatePurchases;
module.exports.COMMISSION_STARTER_AFTER = COMMISSION_STARTER_AFTER;
module.exports.COMMISSION_STARTER_RATE = COMMISSION_STARTER_RATE;
module.exports.COMMISSION_AFTER_RATE = COMMISSION_AFTER_RATE;
module.exports.COMMISSION_FULL_AFTER = COMMISSION_STARTER_AFTER;
module.exports.commissionLabel = commissionLabel;
