const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { VOUCHERS, findVoucher, isVoucherExpired, isVoucherClaimable, toPublicVoucher } = require('../voucher');
const { cachedQuery, invalidate, invalidateByPrefix } = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET;

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

router.use(verifyToken);

async function getUserFlags(userId) {
  const cacheKey = `user:flags:${userId}`;
  return cachedQuery(cacheKey, 600, async () => {
    const [[user]] = await db.execute(
      'SELECT northpay_enabled FROM user_northline WHERE id = ?',
      [userId]
    );
    const [[profile]] = await db.execute(
      'SELECT is_active FROM npinjam_profiles WHERE user_id = ?',
      [userId]
    );
    return {
      northpay: !!(user && user.northpay_enabled === 1),
      npinjam: !!(profile && profile.is_active === 1),
    };
  });
}

async function getClaims(userId) {
  const cacheKey = `user:claims:${userId}`;
  return cachedQuery(cacheKey, 300, async () => {
    const [rows] = await db.execute(
      'SELECT voucher_code, status, claimed_at, used_at FROM voucher_claims WHERE user_id = ?',
      [userId]
    );
    const map = {};
    rows.forEach((r) => {
      map[r.voucher_code] = {
        status: r.status,
        claimedAt: r.claimed_at,
        usedAt: r.used_at,
      };
    });
    return map;
  });
}

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `user:vouchers:${userId}`;

    const data = await cachedQuery(cacheKey, 300, async () => {
      const flags = await getUserFlags(userId);
      const claims = await getClaims(userId);
      const list = VOUCHERS.map((v) => {
        const pub = toPublicVoucher(v);
        const expired = isVoucherExpired(v);
        const claimWindow = isVoucherClaimable(v);
        const claim = claims[v.code];
        pub.expired = expired;
        pub.claimable = claimWindow.ok;
        pub.claimableMessage = claimWindow.message || null;
        pub.claimed = !!(claim && claim.status !== 'expired');
        pub.claimStatus = claim ? claim.status : null;
        pub.eligible = v.category === 'general' || (v.category === 'northpay' && flags.northpay) || (v.category === 'npinjam' && flags.npinjam);
        return pub;
      });
      return { success: true, vouchers: list, flags };
    });

    res.json(data);
  } catch (err) {
    console.error('vouchers list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/claim/:code', async (req, res) => {
  try {
    const userId = req.user.id;
    const code = String(req.params.code || '').trim();
    const voucher = findVoucher(code);
    if (!voucher || !voucher.claimRequired) {
      return res.status(404).json({ success: false, message: 'Voucher tidak ditemukan' });
    }
    if (isVoucherExpired(voucher)) {
      return res.status(400).json({ success: false, message: 'Voucher sudah kedaluwarsa' });
    }
    const claimWindow = isVoucherClaimable(voucher);
    if (!claimWindow.ok) {
      return res.status(400).json({ success: false, message: claimWindow.message || 'Voucher belum bisa diklaim' });
    }
    if (voucher.category !== 'general') {
      const flags = await getUserFlags(userId);
      if (voucher.category === 'northpay' && !flags.northpay) {
        return res.status(400).json({ success: false, message: 'Aktifkan NorthPay dulu untuk klaim voucher ini' });
      }
      if (voucher.category === 'npinjam' && !flags.npinjam) {
        return res.status(400).json({ success: false, message: 'Aktifkan NPinjam dulu untuk klaim voucher ini' });
      }
    }
    try {
      await db.execute(
        'INSERT INTO voucher_claims (user_id, voucher_code, status) VALUES (?, ?, ?)',
        [userId, code, 'claimed']
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'Voucher sudah diklaim' });
      }
      throw e;
    }
    await invalidate(`user:claims:${userId}`, `user:vouchers:${userId}`);
    res.json({ success: true, message: 'Voucher berhasil diklaim', voucher: toPublicVoucher(voucher) });
  } catch (err) {
    console.error('voucher claim error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.execute(
      'SELECT voucher_code, status, claimed_at, used_at, order_id FROM voucher_claims WHERE user_id = ? ORDER BY claimed_at DESC',
      [userId]
    );
    const list = rows
      .filter((r) => r.status !== 'used')
      .map((r) => {
        const v = findVoucher(r.voucher_code);
        if (!v) return null;
        const expired = isVoucherExpired(v);
        return {
          ...toPublicVoucher(v),
          claimStatus: expired ? 'expired' : r.status,
          claimedAt: r.claimed_at,
          usedAt: r.used_at,
          orderId: r.order_id,
        };
      })
      .filter(Boolean);
    res.json({ success: true, vouchers: list });
  } catch (err) {
    console.error('vouchers my error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/use', async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, orderId } = req.body || {};
    const voucher = findVoucher(String(code || '').trim());
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher tidak ditemukan' });
    const [result] = await db.execute(
      "UPDATE voucher_claims SET status = 'used', used_at = NOW(), order_id = ? WHERE user_id = ? AND voucher_code = ? AND status = 'claimed'",
      [orderId || null, userId, voucher.code]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ success: false, message: 'Voucher tidak ditemukan atau sudah dipakai' });
    }
    await invalidate(`user:claims:${userId}`, `user:vouchers:${userId}`);
    res.json({ success: true, message: 'Voucher digunakan' });
  } catch (err) {
    console.error('voucher use error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
