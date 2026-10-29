const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getOrderReceiptState } = require('../utils/orderValidation');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set!");
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

function setAuthCookies(res, token) {
    const cookieOpts = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
    };
    res.cookie('nl_jwt', token, cookieOpts);
    res.cookie('logged_in', '1', {
        ...cookieOpts,
        httpOnly: false
    });
}

function clearAuthCookies(res) {
    const clearOpts = { path: '/' };
    res.clearCookie('nl_jwt', clearOpts);
    res.clearCookie('logged_in', clearOpts);
    res.clearCookie('session', clearOpts);
    res.clearCookie('user_session', clearOpts);
    res.clearCookie('nrt_aff', clearOpts);
    res.clearCookie('nl_aff', clearOpts);
}

function normalizeGuestTokens(input) {
    const raw = Array.isArray(input) ? input : [input];
    const tokens = [];
    for (const value of raw) {
        if (typeof value !== 'string') continue;
        const token = value.trim();
        if (/^[a-f0-9]{64}$/i.test(token)) tokens.push(token);
    }
    return [...new Set(tokens)];
}

function normalizeGuestOrderMigrationDecision(input) {
    if (typeof input === 'boolean') return input ? 'move' : 'skip';
    if (typeof input !== 'string') return null;
    const value = input.trim().toLowerCase();
    if (['yes', 'true', 'move', 'migrate', 'transfer'].includes(value)) return 'move';
    if (['no', 'false', 'skip', 'later', 'cancel'].includes(value)) return 'skip';
    return null;
}

function getGuestTokensFromRequest(req) {
    const rawValue = req.headers?.['x-guest-order-token'] || req.cookies?.guest_order_tokens || req.body?.guestOrderTokens || req.body?.guestOrderToken || req.query?.guestOrderTokens;
    return normalizeGuestTokens(rawValue);
}

async function countGuestOrdersForTokens(guestTokens) {
    if (!Array.isArray(guestTokens) || guestTokens.length === 0) return 0;
    const hashes = guestTokens.map((token) => crypto.createHash('sha256').update(token).digest('hex'));
    const placeholders = hashes.map(() => '?').join(',');
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM transactions
         WHERE user_id IS NULL
           AND guest_access_token_hash IN (${placeholders})
           AND status != 'cancelled'`,
        hashes
    );
    return Number(rows?.[0]?.total || 0);
}

async function migrateGuestOrdersToUser(userId, guestTokens) {
    if (!userId || !Array.isArray(guestTokens) || guestTokens.length === 0) {
        return { migrated: 0, skipped: guestTokens?.length || 0 };
    }

    let migrated = 0;
    for (const token of guestTokens) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [result] = await db.execute(
            `UPDATE transactions
             SET user_id = ?, guest_access_token_hash = NULL
             WHERE user_id IS NULL AND guest_access_token_hash = ? AND status != 'cancelled'`,
            [userId, tokenHash]
        );
        migrated += result && result.affectedRows ? result.affectedRows : 0;
    }

    return { migrated, skipped: Math.max(0, guestTokens.length - migrated) };
}

async function completeOrderReceipt({ orderId, userId = null, guestTokenHash = null }) {
    const conn = await db.getConnection();
    const ownerClause = userId === null
        ? 'user_id IS NULL AND guest_access_token_hash = ?'
        : 'user_id = ?';
    const ownerParams = userId === null ? [guestTokenHash] : [userId];
    try {
        await conn.beginTransaction();
        const [[order]] = await conn.execute(
            `SELECT order_id, user_id, status, delivery_status
             FROM transactions WHERE order_id = ? AND ${ownerClause} LIMIT 1 FOR UPDATE`,
            [orderId, ...ownerParams],
        );
        if (!order) {
            await conn.rollback();
            return { result: 'not_found' };
        }
        const receiptState = getOrderReceiptState(order.status, order.delivery_status);
        if (receiptState === 'not_paid') {
            await conn.rollback();
            return { result: 'not_paid' };
        }
        if (receiptState === 'already_complete') {
            await conn.commit();
            return { result: 'already_complete' };
        }
        if (receiptState === 'not_shipped') {
            await conn.rollback();
            return { result: 'not_shipped' };
        }

        await conn.execute(
            `UPDATE transactions SET delivery_status='Pesanan Selesai'
             WHERE order_id = ? AND ${ownerClause} AND status = 'success'`,
            [orderId, ...ownerParams],
        );
        await conn.execute(
            `INSERT INTO tracking_events (order_id, status, description, location, lat, lng)
             VALUES (?, 'Pesanan Selesai', 'Pelanggan mengonfirmasi pesanan diterima', NULL, NULL, NULL)`,
            [orderId],
        );
        if (order.user_id !== null) {
            await conn.execute(
                'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
                [order.user_id, 'Pesanan Selesai', `Pesanan ${orderId} telah dikonfirmasi diterima.`],
            );
        }
        await conn.commit();
        return { result: 'completed' };
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.error('Gagal rollback konfirmasi penerimaan order:', rollbackError);
        }
        throw error;
    } finally {
        conn.release();
    }
}

const getCookie = (req, name) => {
    if (!req.headers || !req.headers.cookie) return null;
    const cookies = req.headers.cookie.split(';');
    for (let c of cookies) {
        c = c.trim();
        if (c.startsWith(name + '=')) {
            return decodeURIComponent(c.substring(name.length + 1));
        }
    }
    return null;
};

async function verifyTokenIfPresent(req, res, next) {
    const authorization = req.headers.authorization || '';
    const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    let cookieToken = null;
    try {
        cookieToken = getCookie(req, 'nl_jwt');
    } catch (error) {
        if (bearerToken) {
            return res.status(401).json({ success: false, message: 'Token login tidak valid' });
        }
        req.user = null;
        return next();
    }
    const token = bearerToken || cookieToken;
    if (!token) {
        req.user = null;
        return next();
    }
    let authData;
    try {
        authData = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        if (bearerToken) {
            return res.status(401).json({ success: false, message: 'Token login tidak valid atau sudah kedaluwarsa' });
        }
        req.user = null;
        return next();
    }
    try {
        const [[user]] = await db.execute(
            'SELECT auth_version FROM user_northline WHERE id = ?',
            [authData.id]
        );
        if (!user || (authData.authVersion || 0) !== user.auth_version) {
            return res.status(401).json({ success: false, message: 'Sesi berakhir, silakan login ulang' });
        }
        req.user = authData;
        return next();
    } catch (error) {
        console.error('Gagal memvalidasi sesi tracking:', error);
        return res.status(500).json({ success: false, message: 'Gagal memvalidasi sesi login' });
    }
}

router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: "Email/Nomor HP dan password wajib diisi, Der!" });
    }

    try {
        const [users] = await db.execute(
            'SELECT * FROM user_northline WHERE email = ? OR phone = ?',
            [identifier, identifier]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: "Email/Nomor HP atau password salah!" });
        }

        const user = users[0];

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Email/Nomor HP atau password salah!" });
        }

        const qrToken = crypto.randomBytes(32).toString('hex');

        await db.execute(
            `UPDATE user_northline
            SET qr_token = ?,
                qr_token_expired = ?
            WHERE id = ?`,
            [
                qrToken,
                Date.now() + (30 * 24 * 60 * 60 * 1000),
                user.id
            ]
        );

        const csrfToken = crypto.randomBytes(32).toString('hex');
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || '';

        await db.execute(
            'UPDATE user_northline SET csrf_token=?, last_login_ip=?, last_login_ua=? WHERE id=?',
            [csrfToken, ip, ua, user.id]
        );

        const token = jwt.sign(
            { id: user.id, username: user.username, authVersion: user.auth_version || 0 }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        const userPayload = {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            created_at: user.created_at,
            address: user.address,
            last_login_ip: ip,
            last_login_ua: ua
        };

        setAuthCookies(res, token);

        return res.status(200).json({
            message: "Login sukses!",
            token,
            csrfToken,
            qrToken,
            user: userPayload
        });

    } catch (error) {
        console.error("Error saat login:", error);
return res.status(500).json({ message: "Terjadi kesalahan pada server, Der." });
    }
});

router.get('/create-login-qr', async (req, res) => {
    const sessionId = crypto.randomUUID();
    qrLoginSessions.set(sessionId, {
        approved: false,
        createdAt: Date.now()
    });
    res.json({
        success: true,
        sessionId
    });
});

const verifyToken = async (req, res, next) => {
    let bearerToken = null;
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        bearerToken = bearerHeader.split(' ')[1];
    } else {
        bearerToken = getCookie(req, 'nl_jwt');
    }

    if (bearerToken) {
        try {
            const authData = jwt.verify(bearerToken, JWT_SECRET);
            const [[user]] = await db.execute('SELECT auth_version FROM user_northline WHERE id = ?', [authData.id]);
            if (!user || (authData.authVersion || 0) !== user.auth_version) {
                return res.status(401).json({ error: "Sesi berakhir, silakan login ulang" });
            }
            req.user = authData;
            next();
        } catch (err) {
            return res.status(403).json({ error: "Token tidak valid / expired" });
        }
    } else {
        res.status(401).json({ error: "Sesi login tidak ditemukan, token kosong" });
    }
};

router.post('/logout', (req, res) => {
    clearAuthCookies(res);
    res.json({ success: true, message: "Logout berhasil" });
});

router.get('/northpay/balance', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; 
        
        const [rows] = await db.execute(
            'SELECT name, northpay_balance, northpay_enabled FROM user_northline WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan" });
        }

        return res.status(200).json({
            success: true,
            name: rows[0].name, 
            balance: rows[0].northpay_balance,
            enabled: rows[0].northpay_enabled !== 0
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});

async function csrfProtection(req, res, next) {
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken) return res.status(403).json({ success: false, message: 'CSRF token required' });
  try {
    const [rows] = await db.execute('SELECT csrf_token FROM user_northline WHERE id=?', [req.user.id]);
    if (rows.length === 0 || rows[0].csrf_token !== headerToken) {
      return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    }
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: 'CSRF validation error' });
  }
}

router.get('/csrf-token', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT csrf_token FROM user_northline WHERE id=?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    let token = rows[0].csrf_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await db.execute('UPDATE user_northline SET csrf_token=? WHERE id=?', [token, req.user.id]);
    }
    res.json({ success: true, csrfToken: token });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

const topupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => 'topup_' + req.user.id,
    message: { success: false, message: "Terlalu banyak permintaan top-up. Maksimal 5 kali per jam." }
});

router.post('/northpay/topup', verifyToken, csrfProtection, topupLimiter, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;
        if (!amount || amount < 10000 || amount > 500000) {
            return res.status(400).json({ success: false, message: "Nominal top-up harus Rp 10.000 - Rp 500.000" });
        }
        const [statusRows] = await db.execute('SELECT northpay_enabled FROM user_northline WHERE id=?', [userId]);
        if (statusRows.length > 0 && statusRows[0].northpay_enabled === 0) {
            return res.status(400).json({ success: false, message: 'NorthPay sedang dinonaktifkan. Aktifkan kembali di Pengaturan.' });
        }
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || '';
        const [insertResult] = await db.execute(
            'INSERT INTO northpay_requests (user_id, amount, ip_address, user_agent, status) VALUES (?, ?, ?, ?, ?)',
            [userId, amount, ip, ua, 'pending']
        );
        const requestId = insertResult.insertId;
        await logNotification(userId, "Top Up NorthPay", "Permintaan top-up NorthPay sebesar Rp " + parseInt(amount).toLocaleString('id-ID') + " sedang diproses.");
        res.json({ success: true, requestId, message: "Permintaan top-up berhasil dikirim. Silakan transfer ke QRIS Northline dan admin akan mengkonfirmasi." });
    } catch (err) {
        console.error("Topup error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/cancel', verifyToken, async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ success: false, message: "ID permintaan diperlukan" });
        const [rows] = await db.execute(
            'SELECT id, user_id, status FROM northpay_requests WHERE id=?', [requestId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Permintaan tidak ditemukan" });
        if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, message: "Bukan permintaan kamu" });
        if (rows[0].status !== 'pending') return res.status(400).json({ success: false, message: "Permintaan sudah diproses" });
        await db.execute("DELETE FROM northpay_requests WHERE id=?", [requestId]);
        res.json({ success: true, message: "Permintaan top-up dibatalkan" });
    } catch (err) {
        console.error("Cancel topup error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/northpay/request/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.execute(
            'SELECT nr.id, nr.amount, nr.status, nr.created_at, u.name as user_name FROM northpay_requests nr JOIN user_northline u ON nr.user_id=u.id WHERE nr.id=? AND nr.user_id=?',
            [id, req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Request tidak ditemukan' });
        res.json({ success: true, request: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/northpay/history', verifyToken, async (req, res) => {
    try {
        const all = req.query.all === 'true';
        const limit = all ? 100 : 5;
        const [rows] = await db.execute(
            'SELECT id, amount, status, created_at FROM northpay_requests WHERE user_id=? ORDER BY id DESC LIMIT ?',
            [req.user.id, limit]
        );
        const [[{ total }]] = await db.execute(
            'SELECT COUNT(*) as total FROM northpay_requests WHERE user_id=?',
            [req.user.id]
        );
        res.json({ success: true, history: rows, total });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/northpay/transfer/methods', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, method_name, method_type, logo, admin_fee, min_amount, max_amount FROM northpay_transfer_methods WHERE is_active=1 ORDER BY sort_order ASC'
        );
        res.json({ success: true, methods: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/transfer', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { methodId, accountNumber, accountName, amount } = req.body;
        const userId = req.user.id;

        if (!methodId || !accountNumber || !accountName || !amount) {
            return res.status(400).json({ success: false, message: "Data transfer tidak lengkap" });
        }
        const [methods] = await db.execute(
            'SELECT method_name, method_type, admin_fee, min_amount, max_amount FROM northpay_transfer_methods WHERE id=? AND is_active=1',
            [methodId]
        );
        if (methods.length === 0) {
            return res.status(400).json({ success: false, message: "Metode transfer tidak ditemukan" });
        }
        const method = methods[0];
        const nominal = parseInt(amount);
        if (!nominal || nominal < method.min_amount || nominal > method.max_amount) {
            return res.status(400).json({ success: false, message: `Nominal harus Rp ${parseInt(method.min_amount).toLocaleString('id-ID')} - Rp ${parseInt(method.max_amount).toLocaleString('id-ID')}` });
        }
        if (!/^[A-Za-z0-9 -]{3,40}$/.test(accountNumber)) {
            return res.status(400).json({ success: false, message: "Nomor rekening/e-wallet tidak valid" });
        }
        if (!accountName.trim() || accountName.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Nama pemilik akun tidak valid" });
        }
        const adminFee = parseInt(method.admin_fee);
        const total = nominal + adminFee;

        const [balRows] = await db.execute(
            'SELECT northpay_balance, northpay_pin, northpay_enabled FROM user_northline WHERE id=?',
            [userId]
        );
        if (balRows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        if (balRows[0].northpay_enabled === 0) return res.status(400).json({ success: false, message: 'NorthPay sedang dinonaktifkan. Aktifkan kembali di Pengaturan.' });
        if (!balRows[0].northpay_pin) return res.status(400).json({ success: false, message: 'Atur PIN NorthPay terlebih dahulu di Pengaturan' });
        const balance = parseFloat(balRows[0].northpay_balance || 0);
        if (balance < total) {
            return res.status(400).json({ success: false, message: `Saldo tidak mencukupi. Total dibutuhkan Rp ${total.toLocaleString('id-ID')} (termasuk biaya admin)` });
        }

        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || '';

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute(
                'UPDATE user_northline SET northpay_balance = northpay_balance - ? WHERE id=?',
                [total, userId]
            );
            const [ins] = await conn.execute(
                `INSERT INTO northpay_transfers
                   (user_id, method_name, method_type, account_number, account_name, amount, admin_fee, total, status, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
                [userId, method.method_name, method.method_type, accountNumber, accountName.trim(), nominal, adminFee, total, ip, ua]
            );
            await conn.commit();
            conn.release();
            await logNotification(userId, "Transfer NorthPay", `Permintaan transfer ke ${method.method_name} sebesar Rp ${nominal.toLocaleString('id-ID')} (biaya admin Rp ${adminFee.toLocaleString('id-ID')}) sedang diproses.`);
            res.json({ success: true, transferId: ins.insertId, message: "Permintaan transfer berhasil dikirim. Admin akan memproses." });
        } catch (txErr) {
            await conn.rollback();
            conn.release();
            throw txErr;
        }
    } catch (err) {
        console.error("Transfer error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/northpay/transfer/history', verifyToken, async (req, res) => {
    try {
        const all = req.query.all === 'true';
        const limit = all ? 100 : 5;
        const [rows] = await db.execute(
            'SELECT id, method_name, method_type, account_number, account_name, amount, admin_fee, total, status, created_at FROM northpay_transfers WHERE user_id=? ORDER BY id DESC LIMIT ?',
            [req.user.id, limit]
        );
        const [[{ total }]] = await db.execute(
            'SELECT COUNT(*) as total FROM northpay_transfers WHERE user_id=?',
            [req.user.id]
        );
        res.json({ success: true, history: rows, total });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/transfer/cancel', verifyToken, async (req, res) => {
    try {
        const { transferId } = req.body;
        if (!transferId) return res.status(400).json({ success: false, message: "ID transfer diperlukan" });
        const [rows] = await db.execute(
            'SELECT id, user_id, status, total FROM northpay_transfers WHERE id=?',
            [transferId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Transfer tidak ditemukan" });
        if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, message: "Bukan transfer kamu" });
        if (rows[0].status !== 'pending') return res.status(400).json({ success: false, message: "Transfer sudah diproses" });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('UPDATE user_northline SET northpay_balance = northpay_balance + ? WHERE id=?', [rows[0].total, req.user.id]);
            await conn.execute("UPDATE northpay_transfers SET status='cancelled' WHERE id=?", [transferId]);
            await conn.commit();
            conn.release();
            res.json({ success: true, message: "Transfer dibatalkan, dana dikembalikan" });
        } catch (txErr) {
            await conn.rollback();
            conn.release();
            throw txErr;
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


router.get('/northpay/settings', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT northpay_balance, northpay_pin, northpay_pin_set_at, northpay_security_question,
                    northpay_auto_topup_enabled, northpay_auto_topup_amount, northpay_auto_topup_threshold,
                    northpay_daily_limit, northpay_biometric_enabled, northpay_last_security_change,
                    northpay_enabled
             FROM user_northline WHERE id=?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        const u = rows[0];
        res.json({
            success: true,
            settings: {
                enabled: u.northpay_enabled !== 0,
                hasPin: !!u.northpay_pin,
                pinSetAt: u.northpay_pin_set_at,
                hasSecurityQuestion: !!u.northpay_security_question,
                securityQuestion: u.northpay_security_question || null,
                autoTopupEnabled: !!u.northpay_auto_topup_enabled,
                autoTopupAmount: parseFloat(u.northpay_auto_topup_amount || 0),
                autoTopupThreshold: parseFloat(u.northpay_auto_topup_threshold || 0),
                dailyLimit: parseFloat(u.northpay_daily_limit || 5000000),
                biometricEnabled: !!u.northpay_biometric_enabled,
                lastSecurityChange: u.northpay_last_security_change
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/pin', verifyToken, async (req, res) => {
    try {
        const { currentPin, newPin } = req.body;
        if (!newPin || !/^\d{6}$/.test(newPin)) return res.status(400).json({ success: false, message: 'PIN harus 6 digit angka' });
        if (/^(\d)\1{5}$/.test(newPin)) return res.status(400).json({ success: false, message: 'PIN tidak boleh sama semua' });
        if (/^012345|^123456|^234567|^345678|^456789|^567890|^678901|^789012|^890123|^901234/.test(newPin)) return res.status(400).json({ success: false, message: 'PIN tidak boleh berurutan' });

        const [rows] = await db.execute('SELECT northpay_pin FROM user_northline WHERE id=?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        const bcrypt = require('bcrypt');
        const hasPin = !!rows[0].northpay_pin;

        if (hasPin) {
            if (!currentPin) return res.status(400).json({ success: false, message: 'PIN saat ini diperlukan' });
            const match = await bcrypt.compare(currentPin, rows[0].northpay_pin);
            if (!match) return res.status(400).json({ success: false, message: 'PIN saat ini salah' });
        }

        const hash = await bcrypt.hash(newPin, 12);
        await db.execute('UPDATE user_northline SET northpay_pin=?, northpay_pin_set_at=NOW(), northpay_last_security_change=NOW() WHERE id=?', [hash, req.user.id]);
        res.json({ success: true, message: hasPin ? 'PIN berhasil diubah' : 'PIN berhasil dibuat' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/pin/verify', verifyToken, async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin || !/^\d{6}$/.test(pin)) return res.status(400).json({ success: false, message: 'PIN tidak valid' });
        const [rows] = await db.execute('SELECT northpay_pin FROM user_northline WHERE id=?', [req.user.id]);
        if (rows.length === 0 || !rows[0].northpay_pin) return res.status(400).json({ success: false, message: 'PIN belum diset' });
        const bcrypt = require('bcrypt');
        const match = await bcrypt.compare(pin, rows[0].northpay_pin);
        if (!match) return res.status(400).json({ success: false, message: 'PIN salah' });
        res.json({ success: true, message: 'PIN valid' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/pin/forgot', verifyToken, async (req, res) => {
    try {
        const { securityAnswer, newPin } = req.body;
        if (!securityAnswer) return res.status(400).json({ success: false, message: 'Jawaban keamanan diperlukan' });
        if (!newPin || !/^\d{6}$/.test(newPin)) return res.status(400).json({ success: false, message: 'PIN baru harus 6 digit angka' });

        const [rows] = await db.execute('SELECT northpay_security_answer, northpay_security_question FROM user_northline WHERE id=?', [req.user.id]);
        if (rows.length === 0 || !rows[0].northpay_security_answer) return res.status(400).json({ success: false, message: 'Pertanyaan keamanan belum diset' });

        const bcrypt = require('bcrypt');
        const match = await bcrypt.compare(securityAnswer, rows[0].northpay_security_answer);
        if (!match) return res.status(400).json({ success: false, message: 'Jawaban keamanan salah' });

        const hash = await bcrypt.hash(newPin, 12);
        await db.execute('UPDATE user_northline SET northpay_pin=?, northpay_pin_set_at=NOW(), northpay_last_security_change=NOW() WHERE id=?', [hash, req.user.id]);
        res.json({ success: true, message: 'PIN berhasil direset' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/security-question', verifyToken, async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) return res.status(400).json({ success: false, message: 'Pertanyaan dan jawaban wajib diisi' });
        if (question.length > 255 || answer.length > 255) return res.status(400).json({ success: false, message: 'Input terlalu panjang' });

        const bcrypt = require('bcrypt');
        const answerHash = await bcrypt.hash(answer, 12);
        await db.execute('UPDATE user_northline SET northpay_security_question=?, northpay_security_answer=?, northpay_last_security_change=NOW() WHERE id=?', [question, answerHash, req.user.id]);
        res.json({ success: true, message: 'Pertanyaan keamanan berhasil disimpan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/auto-topup', verifyToken, async (req, res) => {
    try {
        const { enabled, amount, threshold } = req.body;
        if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: 'Enabled harus boolean' });
        if (enabled) {
            if (!amount || amount < 10000 || amount > 500000) return res.status(400).json({ success: false, message: 'Jumlah auto topup 10.000 - 500.000' });
            if (!threshold || threshold < 1000 || threshold >= amount) return res.status(400).json({ success: false, message: 'Ambang batas minimal 1.000 dan kurang dari jumlah topup' });
        }
        await db.execute('UPDATE user_northline SET northpay_auto_topup_enabled=?, northpay_auto_topup_amount=?, northpay_auto_topup_threshold=? WHERE id=?', [enabled, amount || 0, threshold || 0, req.user.id]);
        res.json({ success: true, message: 'Auto topup ' + (enabled ? 'diaktifkan' : 'dinonaktifkan') });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/daily-limit', verifyToken, async (req, res) => {
    try {
        const { limit } = req.body;
        const lim = parseInt(limit);
        if (isNaN(lim) || lim < 100000 || lim > 50000000) return res.status(400).json({ success: false, message: 'Limit harian 100.000 - 50.000.000' });
        await db.execute('UPDATE user_northline SET northpay_daily_limit=? WHERE id=?', [lim, req.user.id]);
        res.json({ success: true, message: 'Limit harian diperbarui' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/biometric', verifyToken, async (req, res) => {
    try {
        const { enabled, deviceToken } = req.body;
        if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: 'Enabled harus boolean' });
        if (enabled && !deviceToken) return res.status(400).json({ success: false, message: 'Device token diperlukan' });

        const crypto = require('crypto');
        const encryptedToken = deviceToken ? crypto.publicEncrypt(
            { key: process.env.RSA_PUBLIC_KEY || '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----' },
            Buffer.from(deviceToken)
        ).toString('base64') : null;

        await db.execute('UPDATE user_northline SET northpay_biometric_enabled=?, northpay_device_token=?, northpay_last_security_change=NOW() WHERE id=?', [enabled, encryptedToken, req.user.id]);
        res.json({ success: true, message: 'Biometric ' + (enabled ? 'diaktifkan' : 'dinonaktifkan') });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/logout-all', verifyToken, async (req, res) => {
    try {
        const crypto = require('crypto');
        const newCsrf = crypto.randomBytes(32).toString('hex');
        await db.execute(
            'UPDATE user_northline SET csrf_token=?, auth_version = auth_version + 1, northpay_device_token=NULL, northpay_biometric_enabled=0 WHERE id=?',
            [newCsrf, req.user.id]
        );
        clearAuthCookies(res);
        res.json({ success: true, message: 'Berhasil logout dari semua perangkat' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/toggle', verifyToken, async (req, res) => {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: 'Parameter enabled wajib boolean' });
        await db.execute('UPDATE user_northline SET northpay_enabled=? WHERE id=?', [enabled ? 1 : 0, req.user.id]);
        const { invalidateByPrefix } = require('../config/redis');
        await invalidateByPrefix(`user:flags:${req.user.id}`);
        await invalidateByPrefix(`user:vouchers:${req.user.id}`);
        res.json({ success: true, message: enabled ? 'NorthPay diaktifkan kembali' : 'NorthPay dinonaktifkan sementara, saldo tetap tersimpan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/delete', verifyToken, async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin) return res.status(400).json({ success: false, message: 'PIN diperlukan' });
        
        const [rows] = await db.execute('SELECT northpay_pin FROM user_northline WHERE id=?', [req.user.id]);
        if (rows.length === 0 || !rows[0].northpay_pin) return res.status(400).json({ success: false, message: 'PIN belum diset' });
        
        const bcrypt = require('bcrypt');
        const match = await bcrypt.compare(pin, rows[0].northpay_pin);
        if (!match) return res.status(400).json({ success: false, message: 'PIN salah' });
        
        await db.execute('UPDATE user_northline SET northpay_balance=0, northpay_pin=NULL, northpay_pin_set_at=NULL, northpay_security_question=NULL, northpay_security_answer=NULL, northpay_auto_topup_enabled=0, northpay_auto_topup_amount=0, northpay_auto_topup_threshold=0, northpay_biometric_enabled=0, northpay_device_token=NULL WHERE id=?', [req.user.id]);
        res.json({ success: true, message: 'Akun NorthPay dihapus permanen' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/northpay/settings/pin/verify', verifyToken, async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin || !/^\d{6}$/.test(pin)) return res.status(400).json({ success: false, message: 'PIN tidak valid' });
        const [rows] = await db.execute('SELECT northpay_pin FROM user_northline WHERE id=?', [req.user.id]);
        if (rows.length === 0 || !rows[0].northpay_pin) return res.status(400).json({ success: false, message: 'PIN belum diset' });
        const bcrypt = require('bcrypt');
        const match = await bcrypt.compare(pin, rows[0].northpay_pin);
        if (!match) return res.status(400).json({ success: false, message: 'PIN salah' });
        res.json({ success: true, message: 'PIN valid' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/api/user/profile', verifyToken, async (req, res) => {
    const loggedInUsername = req.user.username; 

    const query = "SELECT username, name, email, phone, gender, birth_date, avatar, created_at FROM user_northline WHERE username = ?";
    
    db.query(query, [loggedInUsername], (err, results) => {
        if (err) {
            console.error("Gagal query database, Der:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        
        if (results.length > 0) {
            res.json({
                success: true,
                data: results[0]
            }); 
        } else {
            res.status(404).json({ error: "Data akun tidak ditemukan di database" });
        }
    });
});

function normalizeBirthDate(value) {
    if (value === undefined) return { provided: false };
    if (value === null || value === '') return { provided: true, value: null };

    const raw = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { error: "Tanggal lahir tidak valid" };
    }

    const [y, m, d] = raw.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        return { error: "Tanggal lahir tidak valid" };
    }

    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (dt.getTime() > today) {
        return { error: "Tanggal lahir tidak boleh di masa depan" };
    }
    const minDate = Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate());
    if (dt.getTime() < minDate) {
        return { error: "Tanggal lahir tidak valid" };
    }

    return { provided: true, value: raw };
}

router.put('/user/profile/update', verifyToken, async (req, res) => {
    try {
        const { name, email, phone, gender } = req.body;
        const userId = req.user.id;

        const birth = normalizeBirthDate(req.body.birth_date);
        if (birth.error) {
            return res.status(400).json({ success: false, message: birth.error });
        }

        if (birth.provided) {
            await db.execute(
                "UPDATE user_northline SET name = ?, email = ?, phone = ?, gender = ?, birth_date = ? WHERE id = ?",
                [name, email, phone, gender, birth.value, userId]
            );
        } else {
            await db.execute(
                "UPDATE user_northline SET name = ?, email = ?, phone = ?, gender = ? WHERE id = ?",
                [name, email, phone, gender, userId]
            );
        }

        await logNotification(userId, "Profile Updated", "Your profile information has been updated.");

        res.json({ success: true, message: "Profile updated" });
    } catch (err) {
        console.error("Error update profile:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post("/upload-avatar", verifyToken, async (req, res) => { 
    try {
        const base64Avatar = req.body.avatar;

        if (!base64Avatar) {
            return res.status(400).json({ success: false, message: "Data avatar kosong!" });
        }

        const userId = req.user.id; 

        const queryStr = "UPDATE user_northline SET avatar = ? WHERE id = ?";
        const [result] = await db.query(queryStr, [base64Avatar, userId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan di DB" });
        }

        return res.status(200).json({ success: true, avatarUrl: base64Avatar });
    } catch (err) {
        console.error("Error update avatar:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/me', async (req, res) => {
    try {
        let token = null;
        const bearer = req.headers['authorization'];
        if (typeof bearer !== 'undefined') {
            token = bearer.split(' ')[1];
        } else {
            token = getCookie(req, 'nl_jwt');
        }
        if (!token) {
            return res.status(200).json({ success: false, user: null });
        }
        jwt.verify(token, JWT_SECRET, async (err, authData) => {
            if (err) {
                return res.status(200).json({ success: false, user: null });
            }
            const [users] = await db.execute(
                'SELECT id, username, name, email, phone, gender, birth_date, created_at, avatar, address, last_login_ip, last_login_ua, seller, role FROM user_northline WHERE id = ?',
                [authData.id]
            );
            if (users.length === 0) {
                return res.status(200).json({ success: false, user: null });
            }
            return res.status(200).json({ success: true, user: users[0] });
        });
    } catch (error) {
        return res.status(200).json({ success: false, user: null });
    }
});

router.post('/check-phone-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Nomor handphone wajib diisi!" });

    const waClient = req.waitWaClient ? await req.waitWaClient(20000) : req.whatsappClient;
    if (!waClient) {
        return res.status(503).json({
            success: false,
            message: "WhatsApp sedang tersambung ulang, coba kirim ulang OTP dalam 30 detik."
        });
    }

    try {
        const [users] = await db.execute('SELECT id, username, phone FROM user_northline WHERE phone = ?', [phone]);
        const isRegistered = users.length > 0;
        const matchedUser = isRegistered ? users[0] : null;

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiredAt = new Date(Date.now() + 3 * 60 * 1000); 

        await db.execute(
            'INSERT INTO otp_sessions (phone, otp_code, expired_at) VALUES (?, ?, ?)',
            [phone, otpCode, expiredAt]
        );

        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        const targetId = `${formattedPhone}@c.us`;

        const msgText = `*Northline Security Code*\n\nKode verifikasi Anda adalah: *${otpCode}*.\nKode ini rahasia dan berlaku selama 3 menit.`;
        await waClient.sendMessage(targetId, msgText);

        return res.status(200).json({
            message: "OTP berhasil dikirim ke WhatsApp!",
            isRegistered: isRegistered,
            user: matchedUser
        });

    } catch (error) {
        console.error("Gagal kirim OTP WA:", error);
        return res.status(500).json({ message: "Gagal mengirim OTP. Pastikan WA Server aktif." });
    }
});

const tempOtpStorage = {};
router.post('/send-otp-only', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Nomor HP wajib diisi!"
            });
        }
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        const existingOtp = tempOtpStorage[formattedPhone];
        if (existingOtp && existingOtp.cooldown > Date.now()) {
            const remaining = Math.ceil(
                (existingOtp.cooldown - Date.now()) / 1000
            );
            return res.status(429).json({
                success: false,
                message: `Tunggu ${remaining} detik sebelum request OTP lagi.`
            });
        }
        const secretOtp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();
        const messageText =
`*Northline Authentication*
Kode verifikasi kamu adalah: *${secretOtp}*
Jangan bagikan kode ini ke siapa pun.`;
        const waBot = req.waitWaClient ? await req.waitWaClient(20000) : req.whatsappClient;
        if (!waBot) {
            return res.status(503).json({
                success: false,
                message: "WhatsApp sedang tersambung ulang, coba kirim ulang OTP dalam 30 detik."
            });
        }
        console.log(`[OTP] Checking number ${formattedPhone}`);
        const numberDetails = await waBot.getNumberId(formattedPhone);
        if (!numberDetails) {
            return res.status(400).json({
                success: false,
                message: "Nomor tidak terdaftar di WhatsApp."
            });
        }
        const finalTargetId = numberDetails._serialized;
        await waBot.sendMessage(finalTargetId, messageText, {
            linkPreview: false,
            sendSeen: false
        });
        tempOtpStorage[formattedPhone] = {
            otp: secretOtp,
            expires: Date.now() + (5 * 60 * 1000), 
            cooldown: Date.now() + (60 * 1000) 
        };
        console.log(`[OTP] OTP terkirim ke ${formattedPhone}`);
        return res.status(200).json({
            success: true,
            message: "OTP berhasil dikirim!"
        });
    } catch (error) {
        console.error("[OTP] Gagal kirim OTP:", error);
        return res.status(502).json({
            success: false,
            message: "Gagal mengirim OTP lewat WhatsApp. Coba lagi sebentar lagi."
        });
    }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Terlalu banyak percobaan OTP, coba lagi 15 menit." }
});

router.post('/verify-otp', otpLimiter, async (req, res) => {
    try {
        const { phone, otpCode } = req.body;
        if (!phone || !otpCode) {
            return res.status(400).json({
                success: false,
                message: "Data tidak lengkap!"
            });
        }
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        const savedOtp = tempOtpStorage[formattedPhone];
        if (!savedOtp) {
            return res.status(400).json({
                success: false,
                message: "OTP tidak ditemukan."
            });
        }
        if (Date.now() > savedOtp.expires) {
            delete tempOtpStorage[formattedPhone];
            return res.status(400).json({
                success: false,
                message: "OTP sudah expired."
            });
        }
        if (savedOtp.otp !== otpCode) {
            return res.status(400).json({
                success: false,
                message: "Kode OTP salah."
            });
        }
        delete tempOtpStorage[formattedPhone];
        const [users] = await db.execute(
            `
            SELECT 
                id,
                username,
                email,
                phone,
                avatar
            FROM user_northline
            WHERE phone = ?
            `,
            [formattedPhone]
        );
        if (users.length > 0) {
            return res.status(200).json({
                success: true,
                isRegistered: true,
                user: users[0]
            });
        }
        return res.status(200).json({
            success: true,
            isRegistered: false
        });
    } catch (error) {
        console.error("Verify OTP Error:", error);
        return res.status(500).json({
            success: false,
            message: "Gagal verifikasi OTP"
        });
    }
});

router.post('/register-complete', async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;

        if (!username || !email || !password || !phone) {
            return res.status(400).json({ success: false, message: "Semua field wajib diisi" });
        }

        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        const [existingUser] = await db.execute(
            'SELECT id FROM user_northline WHERE phone = ? OR email = ?', 
            [formattedPhone, email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: "Nomor HP atau Email lu udah keburu dipake orang lain" });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const [result] = await db.execute(
            'INSERT INTO user_northline (username, email, password, phone, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, email, hashedPassword, formattedPhone, '/frontend/public/icons/default.png']
        );

        const guestTokens = getGuestTokensFromRequest(req);
        const migrationChoice = normalizeGuestOrderMigrationDecision(req.body?.guestOrderMigration || req.body?.migrateGuestOrders || req.body?.moveGuestOrders);
        const migrated = guestTokens.length > 0 && (migrationChoice === null || migrationChoice === 'move')
            ? await migrateGuestOrdersToUser(result.insertId, guestTokens)
            : { migrated: 0, skipped: guestTokens.length || 0 };

        const csrfToken = crypto.randomBytes(32).toString('hex');
        await db.execute('UPDATE user_northline SET csrf_token=? WHERE id=?', [csrfToken, result.insertId]);

        const token = jwt.sign(
            { id: result.insertId, username: username, authVersion: 0 },
            JWT_SECRET,            { expiresIn: '1d' }
        );

        const userPayload = { id: result.insertId, username, email, phone: formattedPhone };
        setAuthCookies(res, token);

        return res.status(201).json({
            success: true,
            message: "Akun Northline lu berhasil dibuat dengan aman, Der! Otomatis masuk sistem.",
            userId: result.insertId,
            token: token,
            csrfToken,
            user: userPayload,
            migratedGuestOrders: migrated.migrated || 0,
            guestMigrationMessage: migrated.migrated > 0
                ? `Kami memindahkan ${migrated.migrated} pesanan dari guest ke akun kamu.`
                : "Tidak ada pesanan guest yang perlu dipindahkan."
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal server error pas simpan akun." });
    }
});

router.post('/login-otp-success', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: "Nomor HP wajib dikirim" });
        }

        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        const [users] = await db.execute(
            'SELECT id, username, email, phone, avatar FROM user_northline WHERE phone = ?',
            [formattedPhone]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: "Akun mendadak hilang dari DB" });
        }

        const user = users[0];

        const guestTokens = getGuestTokensFromRequest(req);
        const migrationChoice = normalizeGuestOrderMigrationDecision(req.body?.guestOrderMigration || req.body?.migrateGuestOrders || req.body?.moveGuestOrders);
        const migrated = guestTokens.length > 0 && (migrationChoice === null || migrationChoice === 'move')
            ? await migrateGuestOrdersToUser(user.id, guestTokens)
            : { migrated: 0, skipped: guestTokens.length || 0 };

        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || '';

        const csrfToken = crypto.randomBytes(32).toString('hex');
        await db.execute(
            'UPDATE user_northline SET csrf_token=?, last_login_ip=?, last_login_ua=? WHERE id=?',
            [csrfToken, ip, ua, user.id]
        );

        const token = jwt.sign(
            { id: user.id, username: user.username, authVersion: user.auth_version || 0 },
            JWT_SECRET,            { expiresIn: '1d' }
        );

        setAuthCookies(res, token);

        console.log(`[Bypass Login] User ${user.username} berhasil login langsung via OTP WhatsApp.`);

        return res.status(200).json({
            success: true,
            message: `Selamat datang kembali, ${user.username}!`,
            token,
            csrfToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                last_login_ip: ip,
                last_login_ua: ua
            },
            migratedGuestOrders: migrated.migrated || 0,
            guestMigrationMessage: migrated.migrated > 0
                ? `Kami memindahkan ${migrated.migrated} pesanan dari guest ke akun kamu.`
                : "Tidak ada pesanan guest yang perlu dipindahkan."
        });

    } catch (error) {
        console.error("Crash bypass login OTP:", error);
        return res.status(500).json({ success: false, message: "Gagal memproses login otomatis." });
    }
});

router.get('/products/:productId/comments', async (req, res) => {
    try {
        const { productId } = req.params;

        const [rows] = await db.execute(
            'SELECT * FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC, id DESC',
            [productId]
        );

        const [metaRows] = await db.execute(
            'SELECT COUNT(*) as totalReviews, AVG(rating) as avgRating, AVG(rating_bahan) as avgBahan, AVG(rating_ukuran) as avgUkuran, AVG(rating_warna) as avgWarna FROM product_reviews WHERE product_id = ?',
            [productId]
        );

        const [[deliveryAgg]] = await db.execute(
            `SELECT AVG(t.delivery_rating) as avgDelivery, COUNT(t.delivery_rating) as deliveryCount
             FROM transactions t
             JOIN product_reviews pr ON pr.order_id = t.order_id AND pr.product_id = t.product_id
             WHERE pr.product_id = ? AND t.delivery_rating IS NOT NULL`,
            [productId]
        );

        const totalReviews = metaRows[0].totalReviews || 0;
        const round1 = (v) => (v === null || v === undefined) ? null : Math.round(Number(v) * 10) / 10;
        const averageRating = totalReviews > 0 ? round1(metaRows[0].avgRating) : 0;

        const formattedComments = rows.map(row => ({
            id: row.id,
            productId: row.product_id,
            userName: row.username,
            userAvatar: row.user_avatar,
            rating: row.rating,
            ratingBahan: row.rating_bahan,
            ratingUkuran: row.rating_ukuran,
            ratingWarna: row.rating_warna,
            variantColor: row.variant_color,
            variantSize: row.variant_size,
            variantModel: row.variant_model,
            images: row.images ? JSON.parse(row.images) : [],
            verified: !!row.verified_purchase,
            replyText: row.reply_text,
            replyAt: row.reply_at,
            replyBy: row.reply_by,
            text: row.review_text,
            createdAt: row.created_at
        }));

        res.status(200).json({
            totalReviews: totalReviews,
            averageRating: averageRating,
            averageBahan: round1(metaRows[0].avgBahan),
            averageUkuran: round1(metaRows[0].avgUkuran),
            averageWarna: round1(metaRows[0].avgWarna),
            averageDelivery: deliveryAgg && deliveryAgg.avgDelivery !== null ? round1(deliveryAgg.avgDelivery) : null,
            deliveryCount: (deliveryAgg && deliveryAgg.deliveryCount) || 0,
            comments: formattedComments
        });
    } catch (err) {
        console.error("Gagal mengambil ulasan MySQL:", err);
        res.status(500).json({ message: "Server error gagal memuat ulasan." });
    }
});

router.post('/products/comments', async (req, res) => {
    try {
        const { productId, rating, text } = req.body;

        if (!productId || !rating || !text) {
            return res.status(400).json({ message: "Data ulasan tidak lengkap" });
        }

        const authHeader = req.headers['authorization'];
        let token = (authHeader && authHeader.split(' ')[1]) || getCookie(req, 'nl_jwt');

        if (!token) {
            return res.status(401).json({ message: "Sesi habis, token kagak dikirim dari frontend!" });
        }

        let decodedUser;
        try {
            decodedUser = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            console.error("JWT Verify Error:", jwtErr.message);
            return res.status(403).json({ message: "Login Ulang Ya!" });
        }

        try {
            const [[user]] = await db.execute('SELECT auth_version FROM user_northline WHERE id = ?', [decodedUser.id]);
            if (!user || (decodedUser.authVersion || 0) !== user.auth_version) {
                return res.status(403).json({ message: "Sesi berakhir, silakan login ulang" });
            }
        } catch (dbErr) {
            console.error("auth_version check error:", dbErr.message);
            return res.status(500).json({ message: "Terjadi kesalahan server" });
        }

        const userId = decodedUser.id;

        const [userRows] = await db.execute(
            `
            SELECT
                username,
                avatar
            FROM user_northline
            WHERE id = ?
            LIMIT 1
            `,
            [userId]
        );

        if (!userRows.length) {
            return res.status(404).json({
                message: "User tidak ditemukan"
            });
        }

        const username =
            userRows[0].username ||
            "Pembeli Northline";

        const userAvatar =
            userRows[0].avatar ||
            "/public/icons/default.png";

        await db.execute(
            `INSERT INTO comment_product (product_id, user_id, username, user_avatar, rating, comment_text, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [productId, userId, username, userAvatar, rating, text]
        );

        const { invalidateByPrefix } = require('../config/redis');
        await invalidateByPrefix(`catalog:reviews`);

        const [metaRows] = await db.execute(
            'SELECT COUNT(*) as totalReviews, AVG(rating) as avgRating FROM comment_product WHERE product_id = ?',
            [productId]
        );

        const totalReviews = metaRows[0].totalReviews || 0;
        const averageRating = totalReviews > 0 ? Math.round(metaRows[0].avgRating) : 0;

        res.status(201).json({ 
            message: "Ulasan berhasil disimpan ke database hmessage_db!", 
            totalReviews: totalReviews,
            averageRating: averageRating
        });

    } catch (err) {
        console.error("Gagal menyimpan ulasan MySQL:", err);
        res.status(500).json({ message: "Server error gagal mengirim ulasan." });
    }
});

router.get('/products/rating-summary', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT product_id, COUNT(*) as totalReviews, AVG(rating) as avgRating 
             FROM product_reviews 
             GROUP BY product_id`
        );

        const summary = {};
        rows.forEach(row => {
            summary[row.product_id] = {
                totalReviews: parseInt(row.totalReviews) || 0,
                avgRating: row.avgRating ? Math.round(Number(row.avgRating) * 10) / 10 : 0
            };
        });

        const catalogData = require('./catalog');
        catalogData.NORTHLINE_CATALOG.forEach(p => {
            const real = summary[p.id];
            summary[p.id] = catalogData.mergeRealReviews(p.id, real ? real.totalReviews : 0, real ? real.avgRating : 0);
        });

        res.status(200).json(summary);
    } catch (err) {
        console.error("Gagal mengambil summary rating MySQL:", err);
        res.status(500).json({ message: "Server error gagal mengambil summary rating." });
    }
});

router.post('/checkout', async (req, res) => {
    try {
        const { totalPrice } = req.body;

        const [rows] = await db.execute("SELECT COUNT(*) as count FROM transactions WHERE is_discounted = 1");
        const usedCount = rows[0].count;

        let finalPrice = parseInt(totalPrice);
        let gotDiscount = false;

        if (usedCount < 10) {
            finalPrice = Math.round(finalPrice * 0.95);
            gotDiscount = true;
        }

        res.json({
            success: true,
            finalPrice: finalPrice,
            isDiscounted: gotDiscount,
            message: "Data diskon siap."
        });
    } catch (error) {
        console.error("Checkout Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/confirm-manual-payment', verifyToken, async (req, res) => {
    try {
        const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
        if (!orderId || orderId.length > 100) {
            return res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        }
        const [orderCheck] = await db.query(
            "SELECT user_id, status FROM transactions WHERE order_id = ?",
            [orderId],
        );
        if (orderCheck.length === 0) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
        }
        if (Number(orderCheck[0].user_id) !== Number(req.user.id)) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }
        if (orderCheck[0].status === 'success') {
            return res.json({ success: true, message: "Pesanan ini sudah dikonfirmasi sebelumnya." });
        }
        return res.status(409).json({
            success: false,
            message: "Pembayaran belum dapat dianggap lunas dari konfirmasi pelanggan. Pesanan perlu diverifikasi admin.",
        });
    } catch (error) {
        console.error("Manual payment confirmation failed:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/user-orders/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.id != userId) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        const [orders] = await db.query(`
            SELECT 
                order_id,
                product_id,
                product_name,
                product_image,
                chosen_color,
                chosen_size,
                chosen_model,
                quantity,
                total_price,
                status AS payment_status,
                delivery_status,
                delivery_rating,
                tracking_number,
                tracking_courier,
                shipped_at,
                is_discounted,
                estimated_arrival,
                created_at,
                payment_method,
                shipping_address,
                EXISTS(SELECT 1 FROM product_reviews pr WHERE pr.order_id = transactions.order_id AND pr.product_id = transactions.product_id) AS reviewed
            FROM transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            success: true,
            orders
        });

    } catch (error) {
        console.error("Error Get Orders:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get('/guest-orders', async (req, res) => {
    const guestToken = req.headers['x-guest-order-token'];
    if (typeof guestToken !== 'string' || !/^[a-f0-9]{64}$/i.test(guestToken)) {
        return res.status(401).json({ success: false, message: "Token pesanan guest tidak valid" });
    }

    try {
        const guestTokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
        const [orders] = await db.query(`
            SELECT
                order_id,
                product_id,
                product_name,
                product_image,
                chosen_color,
                chosen_size,
                chosen_model,
                quantity,
                total_price,
                status AS payment_status,
                delivery_status,
                tracking_number,
                tracking_courier,
                shipped_at,
                is_discounted,
                estimated_arrival,
                created_at,
                payment_method,
                shipping_address,
                EXISTS(SELECT 1 FROM product_reviews pr WHERE pr.order_id = transactions.order_id AND pr.product_id = transactions.product_id) AS reviewed
            FROM transactions
            WHERE user_id IS NULL AND guest_access_token_hash = ?
            ORDER BY created_at DESC
        `, [guestTokenHash]);

        res.json({ success: true, orders });
    } catch (error) {
        console.error("Error Get Guest Orders:", error);
        res.status(500).json({ success: false, message: "Gagal memuat pesanan guest" });
    }
});

router.post('/guest-orders/confirm-receipt', async (req, res) => {
    const guestToken = req.headers['x-guest-order-token'];
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId || orderId.length > 100) {
        return res.status(400).json({ success: false, message: "orderId tidak valid" });
    }
    if (typeof guestToken !== 'string' || !/^[a-f0-9]{64}$/i.test(guestToken)) {
        return res.status(401).json({ success: false, message: "Token pesanan guest tidak valid" });
    }

    try {
        const guestTokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
        const { result } = await completeOrderReceipt({ orderId, guestTokenHash });
        if (result === 'not_found') {
            return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
        }
        if (result === 'not_paid') {
            return res.status(409).json({ success: false, message: "Pesanan belum dibayar" });
        }
        if (result === 'already_complete') {
            return res.json({ success: true, message: "Pesanan sudah selesai" });
        }
        if (result === 'not_shipped') {
            return res.status(400).json({ success: false, message: "Pesanan belum dikirim, tidak bisa dikonfirmasi" });
        }
        return res.json({ success: true, message: "Pesanan diterima, terima kasih!" });
    } catch (error) {
        console.error("Guest confirm receipt error:", error);
        return res.status(500).json({ success: false, message: "Gagal mengonfirmasi pesanan" });
    }
});

router.post('/orders/confirm-receipt', verifyToken, async (req, res) => {
    try {
        const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
        if (!orderId || orderId.length > 100) {
            return res.status(400).json({ success: false, message: "orderId tidak valid" });
        }
        const { result } = await completeOrderReceipt({ orderId, userId: req.user.id });
        if (result === 'not_found') {
            return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
        }
        if (result === 'not_paid') {
            return res.status(409).json({ success: false, message: "Pesanan belum dibayar" });
        }
        if (result === 'already_complete') {
            return res.json({ success: true, message: "Pesanan sudah selesai" });
        }
        if (result === 'not_shipped') {
            return res.status(400).json({ success: false, message: "Pesanan belum dikirim, tidak bisa dikonfirmasi" });
        }
        res.json({ success: true, message: "Pesanan diterima, terima kasih!" });
    } catch (err) {
        console.error("confirm receipt error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/update-address', verifyToken, async (req, res) => {
    try {
        const { address } = req.body;
        const userId = req.user.id;

        if (!address) {
            return res.status(400).json({ success: false, message: "Alamat wajib diisi!" });
        }

        const [result] = await db.query(
            "UPDATE user_northline SET address = ? WHERE id = ?", 
            [address, userId]
        );

        if (result.affectedRows > 0) {
            await logNotification(userId, "Address Updated", "Your delivery address has been successfully updated.");
            return res.json({ success: true, message: "Address updated successfully!" });
        } else {
            return res.status(404).json({ success: false, message: "User tidak ditemukan." });
        }
    } catch (error) {
        console.error("Error Update Address:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post("/update-password", verifyToken, async (req, res) => {
    try {
        const { current, newPass, otp } = req.body;
        const userId = req.user.id;

        const [users] = await db.query("SELECT password, phone FROM user_northline WHERE id = ?", [userId]);
        const user = users[0];

        const stored = tempOtpStorage[user.phone];
        if (!stored || stored.otp !== otp) {
            return res.status(400).json({ success: false, message: "Kode OTP salah!" });
        }
        if (Date.now() > stored.expires) {
            delete tempOtpStorage[user.phone];
            return res.status(400).json({ success: false, message: "OTP sudah expired!" });
        }

        const isMatch = await bcrypt.compare(current, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Incorrect current password!" });

        const hashedPassword = await bcrypt.hash(newPass, 10);
        await db.query("UPDATE user_northline SET password = ? WHERE id = ?", [hashedPassword, userId]);

        delete tempOtpStorage[user.phone];
        await logNotification(userId, "Security Update", "Your password has been successfully changed.");

        return res.json({ success: true, message: "Password updated successfully!" });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error during update." });
    }
});

router.post('/send-otp-for-password', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [rows] = await db.query("SELECT phone FROM user_northline WHERE id = ?", [userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found!" });
        }

        const phone = rows[0].phone;
        
        const secretOtp = Math.floor(100000 + Math.random() * 900000).toString();
        
        tempOtpStorage[phone] = { otp: secretOtp, expires: Date.now() + (5 * 60 * 1000) };

        const waBot = req.waitWaClient ? await req.waitWaClient(20000) : req.whatsappClient;
        if (!waBot) {
            return res.status(503).json({
                success: false,
                message: "WhatsApp sedang tersambung ulang, coba kirim ulang OTP dalam 30 detik."
            });
        }
        const messageText = `*Northline Security*\n\nYour verification code is: *${secretOtp}*\nDo not share this code with anyone.`;
        
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        await waBot.sendMessage(formattedPhone + "@c.us", messageText);

        return res.status(200).json({ success: true, message: "OTP sent successfully!" });

    } catch (err) {
        console.error("Error sending OTP:", err);
        return res.status(500).json({ success: false, message: "Failed to send OTP. Server error." });
    }
});

async function logNotification(userId, title, message) {
    try {
        await db.execute(
            'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
            [userId, title, message]
        );
    } catch (err) {
        console.error("Gagal kirim log notif:", err);
    }
}

router.get('/notifications', verifyToken, async (req, res) => {
    try {
        const [notifs] = await db.execute(
            `SELECT * FROM user_notifications 
             WHERE user_id = ? OR is_global = 1 
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(notifs);
    } catch (err) {
        console.error(err); 
        res.status(500).json({ message: "Error loading notifications" });
    }
});

router.get('/notifications/latest', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id FROM user_notifications 
             WHERE user_id = ? OR is_global = 1 
             ORDER BY created_at DESC LIMIT 1`,
            [req.user.id]
        );
        res.json({ latestId: rows.length > 0 ? rows[0].id : 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error" });
    }
});

router.get('/settings/po-date', async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT setting_value FROM app_settings WHERE setting_key = ?", 
            ['po_target_date']
        );

        if (rows.length > 0 && rows[0].setting_value) {
            res.json({ targetDate: rows[0].setting_value });
        } else {
            res.json({ targetDate: null });
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ message: "Database Error" });
    }
});


// ===========================================
// WebAuthn (Face ID / Passkey) Endpoints
// ===========================================
const { 
    generateRegistrationOptions, 
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const WEBAUTHN_RP_NAME = 'Northline';
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:9000';

// In-memory challenge storage (use Redis in production)
const webauthnChallenges = new Map();

// Store QR login sessions
const qrLoginSessions = new Map();

// Helper: get user from DB
async function getUserById(userId) {
    const [rows] = await db.execute(
        `SELECT id, username, name, email, face_id_credential_id, face_id_public_key, 
         face_id_counter, face_id_enabled FROM user_northline WHERE id = ?`,
        [userId]
    );
    return rows[0] || null;
}

// ===========================================
// Face ID / WebAuthn Registration (Setup Face ID)

// Cleanup intervals - run after module is fully loaded
setImmediate(() => {
    // Cleanup expired QR login sessions periodically
    setInterval(() => {
        const now = Date.now();
        for (const [id, session] of qrLoginSessions.entries()) {
            if (session.expiresAt < now) {
                qrLoginSessions.delete(id);
            }
        }
    }, 60000);

    // Cleanup webauthn challenges
    setInterval(() => {
        const now = Date.now();
        for (const [userId, challenge] of webauthnChallenges.entries()) {
            if (challenge.expiresAt < now) {
                webauthnChallenges.delete(userId);
            }
        }
    }, 60000);
});

// Helper: get user from DB
async function getUserById(userId) {
    const [rows] = await db.execute(
        `SELECT id, username, name, email, face_id_credential_id, face_id_public_key, 
         face_id_counter, face_id_enabled FROM user_northline WHERE id = ?`,
        [userId]
    );
    return rows[0] || null;
}

// ===========================================
// Face ID / WebAuthn Registration (Setup Face ID)
// ===========================================

// Get Face ID status
router.get('/user/face-id/status', verifyToken, async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        res.json({
            success: true,
            faceIdEnabled: !!user.face_id_enabled,
            hasCredential: !!user.face_id_credential_id
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start Face ID registration (get challenge)
router.post('/user/face-id/register/begin', verifyToken, async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        if (user.face_id_enabled) {
            return res.status(400).json({ success: false, message: 'Face ID sudah terdaftar' });
        }

        const options = generateRegistrationOptions({
            rpName: WEBAUTHN_RP_NAME,
            rpID: WEBAUTHN_RP_ID,
            userID: Buffer.from(String(req.user.id)),
            userName: user.username,
            userDisplayName: user.name || user.username,
            attestationType: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                requireResidentKey: true
            },
            supportedAlgorithmIDs: [-7, -257], // ES256, RS256
            excludeCredentials: user.face_id_credential_id ? [{
                id: Buffer.from(user.face_id_credential_id, 'base64'),
                type: 'public-key',
                transports: ['internal']
            }] : []
        });

        // Store challenge
        webauthnChallenges.set(req.user.id, {
            challenge: options.challenge,
            type: 'registration',
            expiresAt: Date.now() + 60000 // 1 minute
        });

        res.json({ success: true, options });
    } catch (err) {
        console.error('WebAuthn register begin error:', err);
        res.status(500).json({ success: false, message: 'Gagal memulai registrasi Face ID' });
    }
});

// Complete Face ID registration
router.post('/user/face-id/register/complete', verifyToken, async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        const challengeData = webauthnChallenges.get(req.user.id);
        if (!challengeData || challengeData.type !== 'registration' || challengeData.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'Challenge expired atau tidak valid' });
        }

        const verification = await verifyRegistrationResponse({
            credential: req.body,
            expectedChallenge: challengeData.challenge,
            expectedOrigin: WEBAUTHN_ORIGIN,
            expectedRPID: WEBAUTHN_RP_ID,
            requireUserVerification: true
        });

        if (!verification.verified) {
            return res.status(400).json({ success: false, message: 'Registrasi Face ID gagal' });
        }

        // Save credential to database
        const credentialIdBase64 = Buffer.from(verification.registrationInfo.credentialID).toString('base64');
        const publicKeyBase64 = Buffer.from(verification.registrationInfo.credentialPublicKey).toString('base64');

        await db.execute(
            `UPDATE user_northline SET 
                face_id_credential_id = ?,
                face_id_public_key = ?,
                face_id_counter = ?,
                face_id_enabled = 1,
                northpay_last_security_change = NOW()
            WHERE id = ?`,
            [credentialIdBase64, publicKeyBase64, verification.registrationInfo.counter, req.user.id]
        );

        // Clean up challenge
        webauthnChallenges.delete(req.user.id);

        res.json({ success: true, message: 'Face ID berhasil didaftarkan' });
    } catch (err) {
        console.error('WebAuthn register complete error:', err);
        res.status(500).json({ success: false, message: 'Gagal menyelesaikan registrasi Face ID' });
    }
});

// Disable Face ID
router.post('/user/face-id/disable', verifyToken, async (req, res) => {
    try {
        await db.execute(
            `UPDATE user_northline SET 
                face_id_credential_id = NULL,
                face_id_public_key = NULL,
                face_id_counter = 0,
                face_id_enabled = 0,
                northpay_last_security_change = NOW()
            WHERE id = ?`,
            [req.user.id]
        );
        res.json({ success: true, message: 'Face ID dinonaktifkan' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menonaktifkan Face ID' });
    }
});

// ===========================================
// Face ID / WebAuthn Authentication (Login with Face ID)
// ===========================================

// Start Face ID authentication (get challenge)
router.post('/user/face-id/authenticate/begin', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username diperlukan' });
        }

        const [rows] = await db.execute(
            `SELECT id, username, face_id_credential_id, face_id_public_key, face_id_counter, face_id_enabled 
             FROM user_northline WHERE username = ? AND face_id_enabled = 1`,
            [username]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Face ID tidak terdaftar untuk user ini' });
        }

        const user = rows[0];

        const options = generateAuthenticationOptions({
            rpID: WEBAUTHN_RP_ID,
            allowCredentials: [{
                id: Buffer.from(user.face_id_credential_id, 'base64'),
                type: 'public-key',
                transports: ['internal']
            }],
            userVerification: 'required'
        });

        // Store challenge
        webauthnChallenges.set(user.id, {
            challenge: options.challenge,
            type: 'authentication',
            expiresAt: Date.now() + 60000
        });

        res.json({ success: true, options });
    } catch (err) {
        console.error('WebAuthn auth begin error:', err);
        res.status(500).json({ success: false, message: 'Gagal memulai autentikasi Face ID' });
    }
});

// Complete Face ID authentication
router.post('/user/face-id/authenticate/complete', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username diperlukan' });
        }

        const [rows] = await db.execute(
            `SELECT id, username, face_id_credential_id, face_id_public_key, face_id_counter, face_id_enabled 
             FROM user_northline WHERE username = ? AND face_id_enabled = 1`,
            [username]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Face ID tidak terdaftar' });
        }

        const user = rows[0];
        const challengeData = webauthnChallenges.get(user.id);
        if (!challengeData || challengeData.type !== 'authentication' || challengeData.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'Challenge expired atau tidak valid' });
        }

        const verification = await verifyAuthenticationResponse({
            credential: req.body,
            expectedChallenge: challengeData.challenge,
            expectedOrigin: WEBAUTHN_ORIGIN,
            expectedRPID: WEBAUTHN_RP_ID,
            credential: {
                id: Buffer.from(user.face_id_credential_id, 'base64'),
                publicKey: Buffer.from(user.face_id_public_key, 'base64'),
                counter: user.face_id_counter
            },
            requireUserVerification: true
        });

        if (!verification.verified) {
            return res.status(400).json({ success: false, message: 'Autentikasi Face ID gagal' });
        }

        // Update counter
        await db.execute(
            'UPDATE user_northline SET face_id_counter = ?, last_login_at = NOW() WHERE id = ?',
            [verification.authenticationInfo.newCounter, user.id]
        );

        // Generate JWT token
        const token = jwt.sign({ id: user.id, username: user.username, authVersion: user.auth_version || 0 }, JWT_SECRET, { expiresIn: '1d' });

        // Set cookie
        setAuthCookies(res, token);

        webauthnChallenges.delete(user.id);

        res.json({ 
            success: true, 
            message: 'Login dengan Face ID berhasil',
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        console.error('WebAuthn auth complete error:', err);
        res.status(500).json({ success: false, message: 'Gagal menyelesaikan autentikasi Face ID' });
    }
});

// ===========================================
// QR Cross-Device Login (Mobile scans Desktop QR)
// ===========================================

// Generate QR login session (for desktop to display QR)
router.get('/user/qr-login/generate', verifyToken, async (req, res) => {
    try {
        const sessionId = crypto.randomUUID();
        const code = crypto.randomBytes(16).toString('hex');
        
        qrLoginSessions.set(sessionId, {
            userId: req.user.id,
            code,
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        });

        // QR data contains sessionId and code for mobile to scan
        const qrData = JSON.stringify({
            type: 'northline_login',
            sessionId,
            code,
            origin: WEBAUTHN_ORIGIN
        });

        res.json({ 
            success: true, 
            sessionId, 
            code,
            qrData,
            expiresIn: 300 // 5 minutes
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal generate QR login' });
    }
});

// Mobile scans QR - initiates WebAuthn authentication
router.post('/user/qr-login/scan', async (req, res) => {
    try {
        const { sessionId, credential } = req.body;
        
        const session = qrLoginSessions.get(sessionId);
        if (!session || session.status !== 'pending' || session.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'QR session expired atau tidak valid' });
        }

        const user = await getUserById(session.userId);
        if (!user || !user.face_id_enabled || !user.face_id_credential_id) {
            return res.status(400).json({ success: false, message: 'Face ID tidak terdaftar untuk user ini' });
        }

        // Verify the WebAuthn assertion
        const verification = await verifyAuthenticationResponse({
            credential: req.body.credential,
            expectedChallenge: session.challenge || 'qr-login-' + session.code,
            expectedOrigin: WEBAUTHN_ORIGIN,
            expectedRPID: WEBAUTHN_RP_ID,
            credential: {
                id: Buffer.from(user.face_id_credential_id, 'base64'),
                publicKey: Buffer.from(user.face_id_public_key, 'base64'),
                counter: user.face_id_counter
            },
            requireUserVerification: true
        });

        if (!verification.verified) {
            return res.status(400).json({ success: false, message: 'Verifikasi Face ID gagal' });
        }

        // Update counter and session
        await db.execute(
            'UPDATE user_northline SET face_id_counter = ?, last_login_at = NOW() WHERE id = ?',
            [verification.authenticationInfo.newCounter, user.id]
        );

        session.status = 'approved';
        session.userData = { id: user.id, username: user.username, authVersion: user.auth_version || 0 };

        // Generate token for the scanned device
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });

        res.json({ 
            success: true, 
            message: 'Login via QR berhasil',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        console.error('QR scan error:', err);
        res.status(500).json({ success: false, message: 'Gagal verifikasi QR login' });
    }
});

// Check QR login status (polling from desktop)
router.get('/user/qr-login/status/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = qrLoginSessions.get(sessionId);

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session tidak ditemukan' });
        }

        if (session.expiresAt < Date.now()) {
            qrLoginSessions.delete(sessionId);
            return res.json({ success: true, status: 'expired' });
        }

        if (session.status === 'approved') {
            const token = jwt.sign({ id: session.userData.id, username: session.userData.username }, JWT_SECRET, { expiresIn: '1d' });
            qrLoginSessions.delete(sessionId);
            return res.json({ success: true, status: 'approved', token, user: session.userData });
        }

        res.json({ success: true, status: 'pending' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===========================================
// Per-account AI Chat History Storage
// (pindah ke routes/ai.js)
// ===========================================

router.get('/tracking/:orderId', verifyTokenIfPresent, async (req, res) => {
    try {
        const { orderId } = req.params;
        const [orders] = await db.query(
            `SELECT t.order_id, t.user_id, t.product_id, t.product_name, t.product_image,
                t.chosen_color, t.chosen_size, t.chosen_model, t.quantity,
                t.total_price, t.status AS payment_status, t.delivery_status,
                t.tracking_number, t.tracking_courier, t.shipped_at,
                t.estimated_arrival, t.created_at, t.shipping_address
            FROM transactions t WHERE t.order_id = ? LIMIT 1`,
            [orderId],
        );
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
        }
        if (orders[0].user_id === null) {
            const guestToken = req.headers['x-guest-order-token'];
            if (typeof guestToken !== 'string' || !/^[a-f0-9]{64}$/i.test(guestToken)) {
                return res.status(401).json({ success: false, message: "Token pesanan guest tidak valid" });
            }
            const guestTokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
            const [authorizedOrders] = await db.query(
                'SELECT order_id FROM transactions WHERE order_id=? AND user_id IS NULL AND guest_access_token_hash=? LIMIT 1',
                [orderId, guestTokenHash]
            );
            if (authorizedOrders.length === 0) {
                return res.status(403).json({ success: false, message: "Tidak memiliki akses ke pesanan ini" });
            }
        } else if (!req.user) {
            return res.status(401).json({ success: false, message: "Login diperlukan untuk melihat tracking pesanan ini" });
        } else if (Number(orders[0].user_id) !== Number(req.user.id)) {
            return res.status(403).json({ success: false, message: "Tidak memiliki akses ke pesanan ini" });
        }
        delete orders[0].user_id;
        const [events] = await db.query(
            "SELECT id, order_id, status, description, location, lat, lng, created_at FROM tracking_events WHERE order_id = ? ORDER BY id ASC",
            [orderId],
        );
        let origin = null;
        try {
            const [settingsRows] = await db.query(
                "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('store_origin_lat','store_origin_lng')"
            );
            const s = {};
            settingsRows.forEach((r) => { s[r.setting_key] = parseFloat(r.setting_value); });
            if (!isNaN(s.store_origin_lat) && !isNaN(s.store_origin_lng)) {
                origin = { lat: s.store_origin_lat, lng: s.store_origin_lng };
            }
        } catch (e) { /* ignore */ }
        res.json({ success: true, order: orders[0], events, origin });
    } catch (error) {
        console.error("Error Get Tracking:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;