const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { grantCommission } = require('./affiliate');
const { getDeliveryTransitionIssue } = require('../utils/orderValidation');
const aiRoutes = require('./ai');
const { listCopilotModels, sendCopilotPrompt } = require('../services/copilotAiClient');
const CHAT_AI_QUOTA_MESSAGES = aiRoutes.CHAT_AI_QUOTA_MESSAGES || 500;
const CHAT_AI_QUOTA_BYTES = aiRoutes.CHAT_AI_QUOTA_BYTES || (2 * 1024 * 1024);

const JWT_SECRET = process.env.JWT_SECRET;
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login admin. Coba lagi dalam 15 menit.' },
});

const adminAuth = async (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const normalizedIp = ip.replace('::ffff:', '');
  const isLocalhost = normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp === '';

  // Block non-localhost IPs entirely
  if (!isLocalhost) {
    return res.status(403).json({ success: false, message: 'Forbidden: admin panel only accessible from localhost' });
  }

  let token = null;
  const bearer = req.headers['authorization'];
  if (bearer) {
    token = bearer.split(' ')[1];
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)nl_jwt=([^;]*)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: token required' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (!Number.isSafeInteger(Number(decoded.id)) || Number(decoded.id) < 1) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  try {
    const [users] = await db.execute(
      'SELECT id, username, role, auth_version FROM user_northline WHERE id = ?',
      [decoded.id],
    );
    if (users.length === 0 || users[0].role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
    }
    if (Number(decoded.authVersion || 0) !== Number(users[0].auth_version || 0)) {
      return res.status(401).json({ success: false, message: 'Sesi admin berakhir, silakan login ulang' });
    }
    req.user = users[0];
    return next();
  } catch (err) {
    console.error('Gagal memvalidasi akses admin:', err);
    return res.status(500).json({ success: false, message: 'Gagal memvalidasi sesi admin.' });
  }
};

router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }
    const [users] = await db.execute('SELECT id, username, role, password, auth_version FROM user_northline WHERE username=?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Kredensial admin tidak valid' });
    }
    const user = users[0];
    const bcrypt = require('bcrypt');
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Kredensial admin tidak valid' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Hanya admin yang boleh login' });
    }
    const token = jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      authVersion: Number(user.auth_version) || 0,
    }, JWT_SECRET, { expiresIn: '24h' });
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    };
    res.cookie('nl_jwt', token, cookieOpts);
    res.cookie('logged_in', '1', { ...cookieOpts, httpOnly: false });
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.use(adminAuth);

async function ensureAdminOperationsTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_order_notes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(100) NOT NULL,
      admin_user_id BIGINT UNSIGNED NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_admin_order_notes_order_created (order_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_order_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(100) NOT NULL,
      admin_user_id BIGINT UNSIGNED NOT NULL,
      action VARCHAR(40) NOT NULL,
      from_status VARCHAR(50) NULL,
      to_status VARCHAR(50) NOT NULL,
      details TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_admin_order_audit_order_created (order_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getStoreOrigin() {
  try {
    const [rows] = await db.execute(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('store_origin_lat','store_origin_lng')"
    );
    const s = {};
    rows.forEach((r) => { s[r.setting_key] = parseFloat(r.setting_value); });
    if (!isNaN(s.store_origin_lat) && !isNaN(s.store_origin_lng)) {
      return { lat: s.store_origin_lat, lng: s.store_origin_lng };
    }
  } catch (e) { /* ignore */ }
  return null;
}

router.get('/dashboard', async (req, res) => {
  try {
    const [[totalUsers]] = await db.execute('SELECT COUNT(*) as total FROM user_northline');
    const [[totalOrders]] = await db.execute('SELECT COUNT(*) as total FROM transactions');
    const [[revenue]] = await db.execute("SELECT COALESCE(SUM(total_price),0) as total FROM transactions WHERE status='success'");
    const [[pendingOrders]] = await db.execute("SELECT COUNT(*) as total FROM transactions WHERE status='pending'");
    const [[pendingOverdue]] = await db.execute("SELECT COUNT(*) as total FROM transactions WHERE status='pending' AND created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND wa_reminded=0");
    const [[orderOperations]] = await db.execute(`
      SELECT
        COALESCE(SUM(status='success'), 0) AS paid_orders,
        COALESCE(SUM(status='cancelled'), 0) AS cancelled_orders,
        COALESCE(SUM(status='success' AND (delivery_status IS NULL OR delivery_status='' OR delivery_status='Pesanan Diproses')), 0) AS pending_shipments
      FROM transactions
    `);
    const [[pendingReports]] = await db.execute(
      "SELECT COUNT(*) AS total FROM product_reports WHERE status='pending'",
    );
    const [[unreadSupportMessages]] = await db.execute(
      "SELECT COUNT(*) AS total FROM chat_messages WHERE sender='user' AND is_read=0",
    );

    const [salesChart] = await db.execute(`
      SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(total_price),0) as revenue
      FROM transactions WHERE status='success' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at) ORDER BY date ASC
    `);

    const [topProducts] = await db.execute(`
      SELECT product_name, COUNT(*) as total_sold, COALESCE(SUM(total_price),0) as total_revenue
      FROM transactions WHERE status='success'
      GROUP BY product_name ORDER BY total_sold DESC LIMIT 5
    `);

    const [recentOrders] = await db.execute(`
      SELECT order_id, product_name, total_price, status, delivery_status, created_at
      FROM transactions ORDER BY id DESC LIMIT 5
    `);

    const [[totalReviews]] = await db.execute('SELECT COUNT(*) as total FROM product_reviews');

    const [[totalProducts]] = await db.execute("SELECT COUNT(*) as total FROM products WHERE status='active'");

    const [[pendingNpinjam]] = await db.execute("SELECT COUNT(*) as total FROM npinjam_applications WHERE status='pending'");

    const [[pendingLoans]] = await db.execute("SELECT COUNT(*) as total FROM npinjam_loans WHERE status='pending'");

    // AI Usage Stats
    const [[aiUsage]] = await db.execute(`
      SELECT 
        COUNT(*) as total_messages,
        COALESCE(SUM(CHAR_LENGTH(text) + IFNULL(JSON_LENGTH(products),0)),0) as total_bytes
      FROM ai_chat_history
    `);

    res.json({
      success: true,
      totalUsers: totalUsers.total,
      totalOrders: totalOrders.total,
      revenue: revenue.total,
      pendingOrders: pendingOrders.total,
      pendingOverdue: pendingOverdue.total,
      paidOrders: orderOperations.paid_orders,
      cancelledOrders: orderOperations.cancelled_orders,
      pendingShipments: orderOperations.pending_shipments,
      pendingReports: pendingReports.total,
      unreadSupportMessages: unreadSupportMessages.total,
      totalReviews: totalReviews.total,
      totalProducts: totalProducts.total,
      pendingNpinjam: pendingNpinjam.total,
      pendingLoans: pendingLoans.total,
      salesChart,
      topProducts,
      recentOrders,
      aiUsage: {
        totalMessages: aiUsage.total_messages,
        totalBytes: aiUsage.total_bytes,
        limitMessages: CHAT_AI_QUOTA_MESSAGES,
        limitBytes: CHAT_AI_QUOTA_BYTES
      }
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const { status, deliveryStatus, search, page = '1', limit = '20', from, to } = req.query;
    const pageNumber = typeof page === 'string' && /^\d+$/.test(page) ? Number(page) : NaN;
    const limitNumber = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : NaN;
    const validDate = (value) => {
      if (value === undefined || value === '') return true;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000000 ||
        !Number.isSafeInteger(limitNumber) || limitNumber < 1 || limitNumber > 100 ||
        (status !== undefined && (typeof status !== 'string' || status.length > 30)) ||
        (deliveryStatus !== undefined && (typeof deliveryStatus !== 'string' || deliveryStatus.length > 50)) ||
        (search !== undefined && (typeof search !== 'string' || search.length > 100)) ||
        !validDate(from) || !validDate(to) || (from && to && from > to)) {
      return res.status(400).json({ success: false, message: 'Filter atau paginasi pesanan tidak valid.' });
    }
    const offset = (pageNumber - 1) * limitNumber;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND t.status=?'; params.push(status); }
    if (deliveryStatus) { where += ' AND t.delivery_status=?'; params.push(deliveryStatus); }
    if (from) { where += ' AND t.created_at >= ?'; params.push(`${from} 00:00:00`); }
    if (to) { where += ' AND t.created_at <= ?'; params.push(`${to} 23:59:59`); }
    if (search) {
      where += ' AND (t.order_id LIKE ? OR t.product_name LIKE ? OR COALESCE(t.shipping_name, u.name) LIKE ? OR COALESCE(t.shipping_phone, u.phone) LIKE ? OR t.guest_ip_address LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id ${where}`, params);
    const [orders] = await db.execute(`
      SELECT t.*, COALESCE(t.shipping_name, u.name) as user_name, u.username,
             COALESCE(t.shipping_phone, u.phone) as user_phone
      FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id
      ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?
    `, [...params, limitNumber, offset]);
    res.json({ success: true, orders, total: count.total, page: pageNumber, limit: limitNumber });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/operations/queue', async (req, res) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const limitValue = req.query.limit === undefined ? '50' : req.query.limit;
    const limit = typeof limitValue === 'string' && /^\d+$/.test(limitValue) ? Number(limitValue) : NaN;
    if (!['', 'order', 'report', 'chat'].includes(type) ||
        (req.query.search !== undefined && (typeof req.query.search !== 'string' || search.length > 100)) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, message: 'Filter antrean operasional tidak valid.' });
    }

    const needle = `%${search}%`;
    const include = (itemType) => !type || type === itemType;
    const [orders, reports, chats] = await Promise.all([
      include('order')
        ? db.execute(
          `SELECT t.order_id, t.product_name, t.status, t.delivery_status, t.total_price,
                  t.shipping_name, t.shipping_phone, t.guest_ip_address, t.created_at,
                  COALESCE(t.shipping_name, u.name) AS customer_name,
                  COALESCE(t.shipping_phone, u.phone) AS customer_phone
           FROM transactions t LEFT JOIN user_northline u ON t.user_id = u.id
           WHERE t.status = 'pending' AND t.created_at <= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
             AND (? = '' OR t.order_id LIKE ? OR t.product_name LIKE ?
                  OR COALESCE(t.shipping_name, u.name) LIKE ?
                  OR COALESCE(t.shipping_phone, u.phone) LIKE ?
                  OR t.guest_ip_address LIKE ?)
           ORDER BY t.created_at ASC LIMIT ?`,
          [search, needle, needle, needle, needle, needle, limit],
        ).then(([rows]) => rows)
        : Promise.resolve([]),
      include('report')
        ? db.execute(
          `SELECT id, product_id, product_name, reason, details, status, created_at
           FROM product_reports
           WHERE status = 'pending' AND (? = '' OR product_id LIKE ? OR product_name LIKE ? OR details LIKE ?)
           ORDER BY created_at ASC LIMIT ?`,
          [search, needle, needle, needle, limit],
        ).then(([rows]) => rows)
        : Promise.resolve([]),
      include('chat')
        ? db.execute(
          `SELECT u.id AS user_id, u.username, u.name, u.phone,
                  COUNT(cm.id) AS unread_count, MAX(cm.created_at) AS created_at,
                    (SELECT latest.message FROM chat_messages latest
                     WHERE latest.user_id = u.id ORDER BY latest.id DESC LIMIT 1) AS last_message
           FROM chat_messages cm
           JOIN user_northline u ON u.id = cm.user_id
           WHERE cm.sender = 'user' AND cm.is_read = 0
             AND (? = '' OR u.username LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)
           GROUP BY u.id, u.username, u.name, u.phone
           ORDER BY created_at ASC LIMIT ?`,
          [search, needle, needle, needle, limit],
        ).then(([rows]) => rows)
        : Promise.resolve([]),
    ]);

    const items = [
      ...orders.map((order) => ({ type: 'order', id: order.order_id, createdAt: order.created_at, order })),
      ...reports.map((report) => ({ type: 'report', id: report.id, createdAt: report.created_at, report })),
      ...chats.map((chat) => ({ type: 'chat', id: chat.user_id, createdAt: chat.created_at, chat })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(0, limit);

    return res.json({
      success: true,
      items,
      counts: { orders: orders.length, reports: reports.length, chats: chats.length },
      limit,
    });
  } catch (err) {
    console.error('Gagal memuat antrean operasional:', err);
    return res.status(500).json({ success: false, message: 'Gagal memuat antrean operasional.' });
  }
});

router.get('/operations/export', async (req, res) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const { from, to, search } = req.query;
    const validDate = (value) => {
      if (value === undefined || value === '') return true;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (!['orders', 'reports'].includes(type) ||
        !validDate(from) || !validDate(to) || (from && to && from > to) ||
        (search !== undefined && (typeof search !== 'string' || search.length > 100))) {
      return res.status(400).json({ success: false, message: 'Filter ekspor tidak valid.' });
    }

    const params = [];
    let rows;
    let columns;
    if (type === 'orders') {
      let where = 'WHERE 1=1';
      if (from) { where += ' AND t.created_at >= ?'; params.push(`${from} 00:00:00`); }
      if (to) { where += ' AND t.created_at <= ?'; params.push(`${to} 23:59:59`); }
      if (search) {
        where += ` AND (t.order_id LIKE ? OR t.product_name LIKE ?
          OR COALESCE(t.shipping_name, u.name) LIKE ?
          OR COALESCE(t.shipping_phone, u.phone) LIKE ? OR t.guest_ip_address LIKE ?)`;
        params.push(...Array(5).fill(`%${search}%`));
      }
      [rows] = await db.execute(
        `SELECT t.order_id, t.product_name, t.status, t.delivery_status, t.total_price,
                COALESCE(t.shipping_name, u.name) AS customer_name,
                COALESCE(t.shipping_phone, u.phone) AS customer_phone,
                t.guest_ip_address, t.created_at
         FROM transactions t LEFT JOIN user_northline u ON t.user_id = u.id
         ${where} ORDER BY t.created_at DESC LIMIT 10000`,
        params,
      );
      columns = ['Order ID', 'Produk', 'Pembayaran', 'Pengiriman', 'Total', 'Penerima', 'Telepon', 'IP Guest', 'Dibuat'];
    } else {
      let where = 'WHERE 1=1';
      if (from) { where += ' AND created_at >= ?'; params.push(`${from} 00:00:00`); }
      if (to) { where += ' AND created_at <= ?'; params.push(`${to} 23:59:59`); }
      if (search) {
        where += ' AND (product_id LIKE ? OR product_name LIKE ? OR details LIKE ?)';
        params.push(...Array(3).fill(`%${search}%`));
      }
      [rows] = await db.execute(
        `SELECT id, product_id, product_name, reason, details, status, admin_note, created_at
         FROM product_reports ${where} ORDER BY created_at DESC LIMIT 10000`,
        params,
      );
      columns = ['ID', 'Product ID', 'Produk', 'Alasan', 'Detail', 'Status', 'Catatan Admin', 'Dibuat'];
    }

    const csvCell = (value) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csvRows = [
      columns,
      ...rows.map((row) => Object.values(row)),
    ].map((row) => row.map(csvCell).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=northline-${type}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    return res.send(`\uFEFF${csvRows.join('\r\n')}\r\n`);
  } catch (err) {
    console.error('Gagal mengekspor data operasional:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengekspor data operasional.' });
  }
});

router.post('/orders/confirm', async (req, res) => {
  let conn;
  try {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId || orderId.length > 100) {
      return res.status(400).json({ success: false, message: 'ID pesanan tidak valid.' });
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      `SELECT t.user_id, t.status, t.product_name, t.chosen_size, t.chosen_color,
              t.chosen_model, t.quantity, t.total_price,
              COALESCE(t.shipping_name, u.name) AS customer_name,
              COALESCE(t.shipping_phone, u.phone) AS customer_phone
       FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id
       WHERE t.order_id=? LIMIT 1 FOR UPDATE`,
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    }
    if (order.status === 'success') {
      await conn.commit();
      return res.json({ success: true, message: 'Sudah dikonfirmasi' });
    }
    if (order.status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Pesanan yang dibatalkan tidak dapat dikonfirmasi.' });
    }
    await conn.execute("UPDATE transactions SET status='success' WHERE order_id=? AND status='pending'", [orderId]);
    await conn.execute(
      `INSERT INTO tracking_events (order_id, status, description, location, lat, lng)
       VALUES (?, 'Pembayaran Dikonfirmasi', 'Pembayaran pesanan telah dikonfirmasi', NULL, NULL, NULL)`,
      [orderId],
    );
    await conn.execute(
      `INSERT INTO admin_order_audit
       (order_id, admin_user_id, action, from_status, to_status, details)
       VALUES (?, ?, 'payment_confirmed', 'pending', 'success', NULL)`,
      [orderId, req.user.id],
    );
    if (order.user_id !== null) {
      await conn.execute(
        'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
        [order.user_id, 'Pembayaran Berhasil', `Pembayaran pesanan ${orderId} telah dikonfirmasi.`],
      );
    }
    await conn.commit();
    conn.release();
    conn = null;

    await grantCommission(orderId).catch(e => console.error('grantCommission:', e.message));
    const { ensureSellerFinance } = require('../utils/payout');
    ensureSellerFinance(orderId).catch(e => console.error('ensureSellerFinance:', e.message));
    let whatsappSent = false;
    if (req.whatsappClient && order.customer_phone) {
      const d = order;
      let phone = String(d.customer_phone || '').replace(/\D/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.slice(1);
      const msg = `*NORTHLINE ORDER CONFIRMED*\n\nHalo kak *${d.customer_name}*,\nPembayaran untuk Order *${orderId}* telah kami verifikasi!\n\n📦 Produk: ${d.product_name}\n🎨 Warna: ${d.chosen_color || '-'}\n👕 Ukuran: ${d.chosen_size || '-'}\n🔢 Qty: ${d.quantity}\n💰 Total: Rp ${parseInt(d.total_price).toLocaleString('id-ID')}\n\nStatus: *LUNAS* ✅\n\nMakasih! - Northline Team`;
      if (phone.length >= 7) {
        if (phone.startsWith('0')) phone = '62' + phone.slice(1);
        try {
          await req.whatsappClient.sendMessage(`${phone}@c.us`, msg);
          whatsappSent = true;
        } catch (e) {
          console.error('WA send error:', e);
        }
      }
    }
    res.json({ success: true, message: 'Pembayaran dikonfirmasi.', whatsappSent });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (rollbackError) {
        console.error('Gagal rollback konfirmasi pembayaran:', rollbackError);
      }
    }
    console.error('Gagal mengonfirmasi pembayaran:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/orders/delivery', async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    const deliveryStatus = typeof body.deliveryStatus === 'string' ? body.deliveryStatus.trim() : '';
    const estimatedArrival = typeof body.estimatedArrival === 'string' ? body.estimatedArrival.trim() : '';
    const courier = typeof body.courier === 'string' ? body.courier.trim() : '';
    const trackingNumber = typeof body.trackingNumber === 'string' ? body.trackingNumber.trim() : '';
    const allowedStatuses = new Set(['Pesanan Diproses', 'Pesanan Dikirim', 'Pesanan Selesai']);

    if (!orderId || orderId.length > 100 || !allowedStatuses.has(deliveryStatus)) {
      return res.status(400).json({ success: false, message: 'Pesanan atau status pengiriman tidak valid.' });
    }
    if (estimatedArrival) {
      const parsedArrival = new Date(`${estimatedArrival}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(estimatedArrival) ||
          Number.isNaN(parsedArrival.getTime()) ||
          parsedArrival.toISOString().slice(0, 10) !== estimatedArrival) {
        return res.status(400).json({ success: false, message: 'Tanggal estimasi tiba tidak valid.' });
      }
    }
    if (courier.length > 80 || trackingNumber.length > 100) {
      return res.status(400).json({ success: false, message: 'Nama kurir atau nomor resi terlalu panjang.' });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      'SELECT user_id, status, delivery_status, tracking_number, tracking_courier FROM transactions WHERE order_id=? LIMIT 1 FOR UPDATE',
      [orderId]
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }
    if (order.status !== 'success') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Pengiriman hanya dapat diatur untuk pesanan yang sudah dibayar.' });
    }

    const finalCourier = courier || order.tracking_courier || '';
    const finalTrackingNumber = trackingNumber || order.tracking_number || '';
    if (deliveryStatus === 'Pesanan Dikirim' && (!finalCourier || !finalTrackingNumber)) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Kurir dan nomor resi wajib diisi sebelum pesanan ditandai dikirim.' });
    }
    const transitionIssue = getDeliveryTransitionIssue(order.delivery_status, deliveryStatus);
    if (transitionIssue === 'shipped_to_processing') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Pesanan yang sudah dikirim tidak dapat dikembalikan ke status diproses.' });
    }
    if (transitionIssue === 'completed_to_previous') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Pesanan yang sudah selesai tidak dapat dikembalikan ke status sebelumnya.' });
    }
    if (transitionIssue === 'complete_before_shipping') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Pesanan harus ditandai dikirim sebelum dapat diselesaikan.' });
    }

    const trackingChanged = finalTrackingNumber !== (order.tracking_number || '') ||
      finalCourier !== (order.tracking_courier || '') ||
      deliveryStatus !== order.delivery_status;
    const deliveryStatusChanged = deliveryStatus !== order.delivery_status;
    const origin = deliveryStatus === 'Pesanan Dikirim' && trackingChanged
      ? await getStoreOrigin()
      : null;

    await conn.execute(
      `UPDATE transactions
       SET delivery_status=?,
           estimated_arrival=COALESCE(?, estimated_arrival),
           tracking_number=?,
           tracking_courier=?,
           shipped_at=CASE WHEN ?='Pesanan Dikirim' THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END
       WHERE order_id=? AND status='success'`,
      [
        deliveryStatus,
        estimatedArrival || null,
        finalTrackingNumber || null,
        finalCourier || null,
        deliveryStatus,
        orderId
      ]
    );
    if (deliveryStatusChanged || (deliveryStatus === 'Pesanan Dikirim' && trackingChanged)) {
      await conn.execute(
        `INSERT INTO tracking_events (order_id, status, description, location, lat, lng)
         VALUES (?, ?, ?, '', ?, ?)`,
        [
          orderId,
          deliveryStatus,
          deliveryStatus === 'Pesanan Dikirim'
            ? `Pesanan dikirim dengan ${finalCourier}. No. Resi: ${finalTrackingNumber}`
            : deliveryStatus,
          origin ? origin.lat : null,
          origin ? origin.lng : null,
        ],
      );
    }
    if (deliveryStatusChanged && order.user_id !== null && order.user_id !== undefined) {
      await conn.execute(
        'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
        [order.user_id, deliveryStatus, `Status pesanan ${orderId} berubah menjadi ${deliveryStatus}.`],
      );
    }
    if (deliveryStatusChanged || trackingChanged) {
      await conn.execute(
        `INSERT INTO admin_order_audit
         (order_id, admin_user_id, action, from_status, to_status, details)
         VALUES (?, ?, 'delivery_updated', ?, ?, ?)`,
        [
          orderId,
          req.user.id,
          order.delivery_status || null,
          deliveryStatus,
          `Kurir: ${finalCourier || '-'}; resi: ${finalTrackingNumber || '-'}`,
        ],
      );
    }
    await conn.commit();
    return res.json({ success: true, message: 'Status pengiriman berhasil diperbarui.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Gagal rollback status pengiriman:', rollbackError);
      }
    }
    console.error('Gagal memperbarui status pengiriman:', err);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui status pengiriman.' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/orders/:orderId/notes', async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!orderId || orderId.length > 100 || !note || note.length > 2000) {
      return res.status(400).json({ success: false, message: 'ID pesanan atau catatan tidak valid.' });
    }
    const [[order]] = await db.execute(
      'SELECT order_id FROM transactions WHERE order_id = ? LIMIT 1',
      [orderId],
    );
    if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    const [result] = await db.execute(
      'INSERT INTO admin_order_notes (order_id, admin_user_id, note) VALUES (?, ?, ?)',
      [orderId, req.user.id, note],
    );
    return res.status(201).json({ success: true, noteId: result.insertId });
  } catch (err) {
    console.error('Gagal menyimpan catatan internal pesanan:', err);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan catatan internal.' });
  }
});

router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (typeof orderId !== 'string' || !orderId.trim() || orderId.length > 100) {
      return res.status(400).json({ success: false, message: 'ID pesanan tidak valid.' });
    }
    const [orders] = await db.execute(`
      SELECT t.*, COALESCE(t.shipping_name, u.name) as user_name, u.username,
             COALESCE(t.shipping_phone, u.phone) as user_phone
      FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id
      WHERE t.order_id=? LIMIT 1
    `, [orderId]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    const [events] = await db.execute(
      'SELECT id, order_id, status, description, location, lat, lng, created_at FROM tracking_events WHERE order_id=? ORDER BY id ASC',
      [orderId],
    );
    const [sellerRow] = await db.execute(
      `SELECT s.store_name, s.store_slug, s.city, s.address, s.whatsapp, s.business_email
       FROM sellers s
       JOIN products p ON p.seller_id = s.id
       JOIN transactions t ON t.product_id = p.id
       WHERE t.order_id=? LIMIT 1`,
      [orderId],
    );
    const [notes] = await db.execute(
      `SELECT id, order_id, admin_user_id, note, created_at
       FROM admin_order_notes WHERE order_id=? ORDER BY id DESC LIMIT 100`,
      [orderId],
    );
    const [audit] = await db.execute(
      `SELECT id, order_id, admin_user_id, action, from_status, to_status, details, created_at
       FROM admin_order_audit WHERE order_id=? ORDER BY id DESC LIMIT 200`,
      [orderId],
    );
    res.json({ success: true, order: orders[0], events, seller: sellerRow[0] || null, notes, audit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders/:orderId/tracking', async (req, res) => {
  let conn;
  try {
    const orderId = String(req.params.orderId || '').trim();
    const body = req.body || {};
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const lat = body.lat;
    const lng = body.lng;
    if (!orderId || orderId.length > 50 || !status || status.length > 50) {
      return res.status(400).json({ success: false, message: 'ID pesanan atau status tracking tidak valid.' });
    }
    if (description.length > 2000 || location.length > 255) {
      return res.status(400).json({ success: false, message: 'Keterangan atau lokasi tracking terlalu panjang.' });
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      'SELECT status FROM transactions WHERE order_id=? LIMIT 1 FOR UPDATE',
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }
    if (order.status !== 'success') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Update tracking hanya dapat ditambahkan ke pesanan yang sudah dibayar.' });
    }

    const hasLat = lat !== undefined && lat !== null && lat !== '';
    const hasLng = lng !== undefined && lng !== null && lng !== '';
    if (hasLat !== hasLng) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Latitude dan longitude harus diisi berpasangan.' });
    }
    let latVal = null;
    let lngVal = null;
    if (hasLat) {
      latVal = Number(lat);
      if (!Number.isFinite(latVal) || latVal < -90 || latVal > 90) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Latitude tidak valid' });
      }
    }
    if (hasLng) {
      lngVal = Number(lng);
      if (!Number.isFinite(lngVal) || lngVal < -180 || lngVal > 180) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Longitude tidak valid' });
      }
    }
    await conn.execute(
      'INSERT INTO tracking_events (order_id, status, description, location, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, status, description || null, location || null, latVal, lngVal],
    );
    await conn.execute(
      `INSERT INTO admin_order_audit
       (order_id, admin_user_id, action, from_status, to_status, details)
       VALUES (?, ?, 'tracking_event_added', NULL, ?, ?)`,
      [orderId, req.user.id, status, description || location || null],
    );
    await conn.commit();
    return res.json({ success: true, message: 'Update tracking berhasil ditambahkan.' });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (rollbackError) {
        console.error('Gagal rollback update tracking manual:', rollbackError);
      }
    }
    console.error('Gagal menambahkan update tracking:', err);
    return res.status(500).json({ success: false, message: 'Gagal menambahkan update tracking.' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/orders/wa-remind', async (req, res) => {
  try {
    const { orderId } = req.body;
    const [rows] = await db.execute(`
      SELECT t.order_id, t.product_name, t.chosen_color, t.chosen_size, t.chosen_model, t.quantity, t.total_price,
             COALESCE(t.shipping_name, u.name) as customer_name,
             COALESCE(t.shipping_phone, u.phone) as customer_phone
      FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id WHERE t.order_id=? AND t.wa_reminded=0
    `, [orderId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Tidak ditemukan atau sudah diingatkan' });
    const d = rows[0];
    let phone = d.customer_phone;
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);
    const msg = `Halo kak ${d.customer_name}!\nYuk lanjutkan pembayaran untuk order kamu:\n\n🧾 Order: ${d.order_id}\n📦 Produk: ${d.product_name}\n🎨 Warna: ${d.chosen_color || '-'}\n👕 Ukuran: ${d.chosen_size || '-'}\n🔢 Qty: ${d.quantity}\n💰 Total: Rp ${parseInt(d.total_price).toLocaleString('id-ID')}\n\nKlik link berikut untuk checkout:\nhttps://nl.hostinesia.my.id/AppNorthOrders\n\nMakasih! - Northline Team`;
    if (req.whatsappClient) {
      try { await req.whatsappClient.sendMessage(`${phone}@c.us`, msg); } catch (e) { console.error('WA error:', e); }
    }
    await db.execute("UPDATE transactions SET wa_reminded=1 WHERE order_id=?", [orderId]);
    res.json({ success: true, message: 'WA reminder terkirim' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders/cancel', async (req, res) => {
  let conn;
  try {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId || orderId.length > 100) {
      return res.status(400).json({ success: false, message: 'ID pesanan tidak valid.' });
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      'SELECT user_id, status FROM transactions WHERE order_id=? LIMIT 1 FOR UPDATE',
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }
    if (order.status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Hanya pesanan yang belum dibayar yang dapat dibatalkan.' });
    }
    await conn.execute(
      "UPDATE transactions SET status='cancelled' WHERE order_id=? AND status='pending'",
      [orderId],
    );
    await conn.execute(
      `INSERT INTO tracking_events (order_id, status, description, location, lat, lng)
       VALUES (?, 'Pesanan Dibatalkan', 'Pesanan dibatalkan sebelum pembayaran', NULL, NULL, NULL)`,
      [orderId],
    );
    await conn.execute(
      `INSERT INTO admin_order_audit
       (order_id, admin_user_id, action, from_status, to_status, details)
       VALUES (?, ?, 'order_cancelled', 'pending', 'cancelled', NULL)`,
      [orderId, req.user.id],
    );
    if (order.user_id !== null) {
      await conn.execute(
        'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
        [order.user_id, 'Pesanan Dibatalkan', `Pesanan ${orderId} telah dibatalkan oleh admin.`],
      );
    }
    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (rollbackError) {
        console.error('Gagal rollback pembatalan pesanan:', rollbackError);
      }
    }
    console.error('Gagal membatalkan pesanan:', err);
    return res.status(500).json({ success: false, message: 'Gagal membatalkan pesanan.' });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (name LIKE ? OR username LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM user_northline ${where}`, params);
    const [users] = await db.execute(`
      SELECT u.*,
        (SELECT COUNT(*) FROM transactions WHERE user_id=u.id) as total_orders,
        (SELECT COALESCE(SUM(total_price),0) FROM transactions WHERE user_id=u.id AND status='success') as total_spent
      FROM user_northline u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, users, total: count.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users/:id/orders', async (req, res) => {
  try {
    const [orders] = await db.execute(
      'SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC', [req.params.id]
    );
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const search = req.query.search === undefined ? '' : req.query.search;
    if (typeof search !== 'string' || search.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Pencarian produk tidak valid.' });
    }
    const term = search.trim();
    const [dbProducts] = term
      ? await db.execute(
        "SELECT * FROM products WHERE status='active' AND (name LIKE ? OR CAST(id AS CHAR) LIKE ?) ORDER BY id DESC LIMIT 20",
        [`%${term}%`, `%${term}%`],
      )
      : await db.execute("SELECT * FROM products WHERE status='active'");
    let productSales = [];
    if (!term) {
      [productSales] = await db.execute(`
        SELECT product_name, COUNT(*) as total_sold, COALESCE(SUM(total_price),0) as total_revenue
        FROM transactions WHERE status='success' GROUP BY product_name ORDER BY total_sold DESC
      `);
    }
    res.json({ success: true, products: dbProducts, productSales });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const { rating, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (rating) { where += ' AND rating=?'; params.push(parseInt(rating)); }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM product_reviews ${where}`, params);
    const [reviews] = await db.execute(`
      SELECT c.*, p.name as product_name
      FROM product_reviews c LEFT JOIN products p ON c.product_id=p.id
      ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, reviews, total: count.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/reviews/:id/reply', async (req, res) => {
  try {
    const { replyText } = req.body || {};
    if (!replyText || !String(replyText).trim()) {
      return res.status(400).json({ success: false, message: 'Balasan wajib diisi' });
    }
    await db.execute(
      'UPDATE product_reviews SET reply_text=?, reply_at=NOW(), reply_by=? WHERE id=?',
      [String(replyText).trim(), req.user.username || 'Admin', req.params.id]
    );
    const { invalidateByPrefix } = require('../config/redis');
    await invalidateByPrefix('catalog:reviews');
    res.json({ success: true, message: 'Balasan disimpan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM product_reviews WHERE id=?', [req.params.id]);
    const { invalidateByPrefix } = require('../config/redis');
    await invalidateByPrefix('catalog:reviews');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/sellers', async (req, res) => {
  try {
    const { status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND s.status=?'; params.push(status); }
    const [sellers] = await db.execute(`
      SELECT s.*, u.name as user_name, u.email as user_email, u.phone as user_phone
      FROM sellers s JOIN user_northline u ON s.user_id=u.id ${where} ORDER BY s.id DESC
    `, params);
    res.json({ success: true, sellers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sellers/:id/approve', async (req, res) => {
  try {
    await db.execute("UPDATE sellers SET status='approved' WHERE id=?", [req.params.id]);
    const [seller] = await db.execute('SELECT user_id FROM sellers WHERE id=?', [req.params.id]);
    if (seller.length > 0) {
      await db.execute("UPDATE user_northline SET seller=1 WHERE id=?", [seller[0].user_id]);
      const [user] = await db.execute("SELECT id, username FROM user_northline WHERE id=?", [seller[0].user_id]);
      if (user.length > 0) {
        const sellerToken = jwt.sign(
          { id: user[0].id, username: user[0].username, seller: 1 },
          JWT_SECRET,
          { expiresIn: '30d' }
        );
        res.cookie('seller_token', sellerToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sellers/:id/reject', async (req, res) => {
  try {
    await db.execute("UPDATE sellers SET status='rejected' WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/notifications', async (req, res) => {
  try {
    const { title, message, targetUserId } = req.body;
    if (targetUserId) {
      await db.execute('INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)', [targetUserId, title, message]);
    } else {
      await db.execute("INSERT INTO user_notifications (user_id, title, message, is_global) SELECT id, ?, ?, 1 FROM user_northline", [title, message]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const [notifs] = await db.execute('SELECT * FROM user_notifications ORDER BY id DESC LIMIT 50');
    res.json({ success: true, notifications: notifs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/whatsapp/status', async (req, res) => {
  try {
    const wa = require('../config/whatsapp');
    const client = (wa && wa.getClient()) || null;
    const s = (wa && wa.getState && wa.getState()) || {};
    const connected = Boolean(client && client.info && client.info.wid);
    res.json({
      success: true,
      connected,
      connectedSince: connected ? s.connectedSince || null : null,
      number: connected ? client.info.wid.user : s.number || null,
      platform: connected ? client.info.platform : s.platform || null,
      qr: (wa && wa.getQr()) || null,
      phase: s.phase || (connected ? 'ready' : 'idle'),
      error: s.error || null,
      errorDetail: s.errorDetail || null,
      restartCount: s.restartCount || 0,
      qrUpdatedAt: s.qrUpdatedAt || null,
      nextRetryAt: s.nextRetryAt || null,
      serverTime: Date.now()
    });
  } catch (err) {
    res.json({ success: true, connected: false, qr: null, phase: 'error', error: err.message });
  }
});

/**
 * Generate QR baru.
 * body: { resetSession?: boolean, logout?: boolean }
 *  - default          : restart client, session LocalAuth dipertahankan
 *  - resetSession:true : hapus session, WA minta pairing dari nol
 */
router.post('/whatsapp/rescan', async (req, res) => {
  try {
    const wa = require('../config/whatsapp');
    if (!wa || typeof wa.restart !== 'function') {
      return res.status(400).json({ success: false, message: 'WA manager tidak tersedia' });
    }
    const resetSession = Boolean(
      (req.body && (req.body.resetSession || req.body.logout)) || false
    );
    const result = await wa.restart({ resetSession });
    const warning = result && result.warning ? result.warning : null;
    res.json({
      success: true,
      resetSession,
      warning,
      message: warning
        ? warning
        : resetSession
        ? 'Session direset, QR pairing baru akan muncul. Scan dari WhatsApp ponsel kamu.'
        : 'Client WA di-restart, QR baru akan muncul. Scan dari WhatsApp ponsel kamu.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/whatsapp/test', async (req, res) => {
  try {
    const { phone } = req.body;
    const client = req.whatsappClient;
    if (!client) return res.status(400).json({ success: false, message: 'WA client not available' });
    let p = phone.replace(/[^0-9]/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    await client.sendMessage(`${p}@c.us`, 'Test message from Northline Admin Panel');
    res.json({ success: true, message: 'Test WA terkirim' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/northpay', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM user_northline WHERE northpay_balance>0 ${where.replace('WHERE 1=1', '').replace('AND', 'WHERE 1=1 AND')}`, params);
    const [users] = await db.execute(`
      SELECT id, username, name, email, phone, northpay_balance FROM user_northline ${where} ORDER BY northpay_balance DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    const [[totalBalance]] = await db.execute('SELECT COALESCE(SUM(northpay_balance),0) as total FROM user_northline');
    res.json({ success: true, users, total: count.total, totalBalance: totalBalance.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/northpay/adjust', async (req, res) => {
  try {
    const { userId, amount, type, reason } = req.body;
    if (type === 'topup') {
      await db.execute('UPDATE user_northline SET northpay_balance = northpay_balance + ? WHERE id=?', [amount, userId]);
    } else if (type === 'deduct') {
      await db.execute('UPDATE user_northline SET northpay_balance = GREATEST(northpay_balance - ?, 0) WHERE id=?', [amount, userId]);
    }
    await db.execute('INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)', [userId, 'NorthPay Adjustment', reason || `Saldo kamu telah di-${type} sebesar Rp ${parseInt(amount).toLocaleString('id-ID')}`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/northpay/requests', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND nr.status=?'; params.push(status); }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM northpay_requests nr ${where}`, params);
    const [requests] = await db.execute(`
      SELECT nr.*, u.name as user_name, u.username, u.phone as user_phone
      FROM northpay_requests nr JOIN user_northline u ON nr.user_id=u.id
      ${where} ORDER BY nr.id DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, requests, total: count.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/northpay/approve', async (req, res) => {
  try {
    const { requestId, adminNote } = req.body;
    const adminId = req.user.id;
    const [rows] = await db.execute('SELECT user_id, amount FROM northpay_requests WHERE id=? AND status="pending"', [requestId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Request tidak ditemukan atau sudah diproses' });
    const { user_id, amount } = rows[0];
    await db.execute('UPDATE user_northline SET northpay_balance = northpay_balance + ? WHERE id=?', [amount, user_id]);
    await db.execute("UPDATE northpay_requests SET status='success', admin_id=?, admin_note=? WHERE id=?", [adminId, adminNote || '', requestId]);
    await db.execute('INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)', [user_id, 'Top Up Berhasil', `Top-up NorthPay sebesar Rp ${parseInt(amount).toLocaleString('id-ID')} telah dikonfirmasi. Saldo kamu bertambah!`]);

    const [userData] = await db.execute('SELECT name, phone FROM user_northline WHERE id=?', [user_id]);
    if (userData.length > 0 && userData[0].phone && req.whatsappClient) {
      try {
        await req.whatsappClient.sendMessage(`${userData[0].phone}@c.us`, `*NorthPay - Top Up Berhasil*\n\nHalo! Top-up NorthPay kamu sebesar Rp ${parseInt(amount).toLocaleString('id-ID')} telah dikonfirmasi ✅\n\nSaldo NorthPay kamu sekarang bertambah. Terima kasih telah menggunakan NorthPay!`);
      } catch (e) { console.error('WA approve notif error:', e); }
    }

    res.json({
      success: true,
      requestId: requestId,
      userName: userData.length > 0 ? (userData[0].name || '-') : '-',
      amount: parseInt(amount),
      createdAt: new Date().toISOString(),
      invoiceNumber: 'INV-NP-' + requestId.toString().padStart(6, '0')
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/northpay/reject', async (req, res) => {
  try {
    const { requestId, adminNote } = req.body;
    const adminId = req.user.id;
    const [rows] = await db.execute('SELECT user_id, amount FROM northpay_requests WHERE id=? AND status="pending"', [requestId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Request tidak ditemukan' });
    await db.execute("UPDATE northpay_requests SET status='cancelled', admin_id=?, admin_note=? WHERE id=?", [adminId, adminNote || '', requestId]);
    await db.execute('INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)', [rows[0].user_id, 'Top Up Ditolak', `Permintaan top-up sebesar Rp ${parseInt(rows[0].amount).toLocaleString('id-ID')} ditolak.${adminNote ? ' Alasan: ' + adminNote : ''} Silakan hubungi admin.`]);

    const [userData] = await db.execute('SELECT phone FROM user_northline WHERE id=?', [rows[0].user_id]);
    if (userData.length > 0 && userData[0].phone && req.whatsappClient) {
      try {
        await req.whatsappClient.sendMessage(`${userData[0].phone}@c.us`, `*NorthPay - Top Up Ditolak*\n\nHalo! Permintaan top-up NorthPay kamu sebesar Rp ${parseInt(rows[0].amount).toLocaleString('id-ID')} ditolak ❌\n${adminNote ? 'Alasan: ' + adminNote + '\n' : ''}\nSilakan hubungi admin untuk informasi lebih lanjut.`);
      } catch (e) { console.error('WA reject notif error:', e); }
    }

    res.json({ success: true, message: 'Request ditolak' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/northpay/transfers', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND nt.status=?'; params.push(status); }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM northpay_transfers nt ${where}`, params);
    const [transfers] = await db.execute(`
      SELECT nt.*, u.name as user_name, u.username, u.phone as user_phone
      FROM northpay_transfers nt JOIN user_northline u ON nt.user_id=u.id
      ${where} ORDER BY nt.id DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, transfers, total: count.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Admin transfers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/northpay/transfer/approve', async (req, res) => {
  try {
    const { transferId, adminNote } = req.body;
    const adminId = req.user.id;
    const [rows] = await db.execute('SELECT user_id, amount, method_name, account_number, account_name FROM northpay_transfers WHERE id=? AND status="pending"', [transferId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Transfer tidak ditemukan atau sudah diproses' });
    const { user_id, amount, method_name } = rows[0];
    await db.execute("UPDATE northpay_transfers SET status='success', admin_id=?, admin_note=? WHERE id=?", [adminId, adminNote || '', transferId]);
    await db.execute('INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)', [user_id, 'Transfer Berhasil', `Transfer sebesar Rp ${parseInt(amount).toLocaleString('id-ID')} ke ${method_name} telah diproses. Dana sudah dikirim.`]);

    const [userData] = await db.execute('SELECT phone FROM user_northline WHERE id=?', [user_id]);
    if (userData.length > 0 && userData[0].phone && req.whatsappClient) {
      try {
        await req.whatsappClient.sendMessage(`${userData[0].phone}@c.us`, `*NorthPay - Transfer Berhasil*\n\nHalo! Transfer NorthPay kamu sebesar Rp ${parseInt(amount).toLocaleString('id-ID')} ke ${method_name} telah diproses ✅\n\nTerima kasih telah menggunakan NorthPay!`);
      } catch (e) { console.error('WA transfer approve notif error:', e); }
    }

    res.json({ success: true, message: 'Transfer disetujui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/northpay/transfer/reject', async (req, res) => {
  try {
    const { transferId, adminNote } = req.body;
    const adminId = req.user.id;
    const [rows] = await db.execute('SELECT user_id, total, method_name, amount FROM northpay_transfers WHERE id=? AND status="pending"', [transferId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Transfer tidak ditemukan atau sudah diproses' });
    const { user_id, total } = rows[0];
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE user_northline SET northpay_balance = northpay_balance + ? WHERE id=?', [total, user_id]);
      await conn.execute("UPDATE northpay_transfers SET status='cancelled', admin_id=?, admin_note=? WHERE id=?", [adminId, adminNote || '', transferId]);
      await conn.commit();
      conn.release();
    } catch (txErr) {
      await conn.rollback();
      conn.release();
      throw txErr;
    }
    await db.execute('INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)', [user_id, 'Transfer Ditolak', `Permintaan transfer sebesar Rp ${parseInt(rows[0].amount).toLocaleString('id-ID')} ditolak. Dana dikembalikan ke saldo.${adminNote ? ' Alasan: ' + adminNote : ''}`]);
    res.json({ success: true, message: 'Transfer ditolak, dana dikembalikan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/northpay/settings', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (name LIKE ? OR username LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM user_northline ${where}`, params);
    const [users] = await db.execute(`
      SELECT id, username, name, email, phone, northpay_balance, northpay_pin, northpay_pin_set_at,
             northpay_security_question, northpay_auto_topup_enabled, northpay_auto_topup_amount,
             northpay_auto_topup_threshold, northpay_daily_limit, northpay_biometric_enabled,
             northpay_last_security_change
      FROM user_northline ${where} ORDER BY id DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, users, total: count.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/northpay/user/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, username, name, email, phone, northpay_balance, northpay_pin, northpay_pin_set_at, ' +
      'northpay_security_question, northpay_auto_topup_enabled, northpay_auto_topup_amount, ' +
      'northpay_auto_topup_threshold, northpay_daily_limit, northpay_biometric_enabled, ' +
      'northpay_last_security_change FROM user_northline WHERE id=?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    const u = rows[0];
    res.json({
      success: true,
      user: {
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        phone: u.phone,
        balance: parseFloat(u.northpay_balance || 0),
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

router.post('/northpay/user/:id/reset-pin', async (req, res) => {
  try {
    await db.execute('UPDATE user_northline SET northpay_pin=NULL, northpay_pin_set_at=NULL, northpay_last_security_change=NOW() WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'PIN berhasil direset' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/northpay/user/:id/disable', async (req, res) => {
  try {
    await db.execute('UPDATE user_northline SET northpay_balance=0, northpay_auto_topup_enabled=0 WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'NorthPay dinonaktifkan, saldo dikosongkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/product-reports', async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM product_reports ${where}`, params);
    const [reports] = await db.execute(
      `SELECT id, product_id, product_code, product_name, product_image, reporter_user_id,
              reason, details, status, admin_note, reviewed_by, reviewed_at, created_at
       FROM product_reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ success: true, reports, total: count.total, page, limit });
  } catch (err) {
    console.error('Gagal memuat laporan produk:', err);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan produk.' });
  }
});

router.put('/product-reports/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    const adminNote = String(req.body.adminNote || '').trim();
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: 'ID laporan tidak valid.' });
    }
    if (!['reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status laporan tidak valid.' });
    }
    if (adminNote.length > 1000) {
      return res.status(400).json({ success: false, message: 'Catatan admin maksimal 1000 karakter.' });
    }
    const [result] = await db.execute(
      `UPDATE product_reports
       SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [status, adminNote || null, req.user.id, id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Status laporan berhasil diperbarui.' });
  } catch (err) {
    console.error('Gagal memperbarui laporan produk:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui laporan produk.' });
  }
});

router.get('/reports/sales', async (req, res) => {
  try {
    const { start, end } = req.query;
    const [rows] = await db.execute(`
      SELECT DATE(created_at) as date, COUNT(*) as total_orders, COALESCE(SUM(total_price),0) as total_revenue
      FROM transactions WHERE status='success' AND created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at) ORDER BY date ASC
    `, [start || '2000-01-01', end || '2099-12-31']);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reports/users', async (req, res) => {
  try {
    const { start, end } = req.query;
    const [rows] = await db.execute(`
      SELECT DATE(created_at) as date, COUNT(*) as total
      FROM user_northline WHERE created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at) ORDER BY date ASC
    `, [start || '2000-01-01', end || '2099-12-31']);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    await db.execute('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=?', [key, value, value]);
    const flashDiscount = require('../utils/flashDiscount');
    if (String(key).startsWith('flash_')) {
      flashDiscount.invalidateCache();
      const { broadcast } = require('../config/io');
      try {
        broadcast('flash-updated', { key, at: new Date().toISOString() });
      } catch (e) {}
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM app_settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- Database Management (phpMyAdmin-style) ----------
const DEFAULT_DB = process.env.DB_NAME || 'northline';
const NAME_RE = /^[a-zA-Z0-9_$]+$/;
const TYPE_RE = /^[a-zA-Z0-9_(), ]+$/;

function validDb(db) { return !db || db === DEFAULT_DB || NAME_RE.test(db); }

// get a dedicated connection, optionally switched to target database
async function getConn(targetDb) {
  const conn = await db.getConnection();
  try {
    if (targetDb && targetDb !== DEFAULT_DB && NAME_RE.test(targetDb)) {
      await conn.query('USE ??', [targetDb]);
    }
  } catch (e) { conn.release(); throw e; }
  return conn;
}

router.get('/database', async (req, res) => {
  let conn;
  try {
    var targetDb = req.query.db || DEFAULT_DB;
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    conn = await getConn(targetDb);
    const [tables] = await conn.query('SHOW TABLES');
    var keyName = 'Tables_in_' + targetDb;
    if (targetDb !== DEFAULT_DB) {
      // SHOW TABLES FROM returns Tables_in_<db>
      keyName = 'Tables_in_' + targetDb;
    }
    var tableNames = tables.map(function (t) { return t[keyName]; });
    var rowCounts = {};
    for (var i = 0; i < tableNames.length; i++) {
      try {
        const [rows] = await conn.query('SELECT COUNT(*) as count FROM ??', [tableNames[i]]);
        rowCounts[tableNames[i]] = rows[0].count;
      } catch (e) { rowCounts[tableNames[i]] = 0; }
    }
    res.json({ success: true, db: targetDb, tables: tableNames, rowCounts: rowCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

router.get('/database/count', async (req, res) => {
  let conn;
  try {
    var targetDb = req.query.db || DEFAULT_DB;
    var table = req.query.table;
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (!table || !NAME_RE.test(table)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
    conn = await getConn(targetDb);
    const [rows] = await conn.query('SELECT COUNT(*) as count FROM ??', [table]);
    res.json({ success: true, count: rows[0].count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// List all databases (phpMyAdmin-style: show everything)
router.get('/database/databases', async (req, res) => {
  let conn;
  try {
    conn = await getConn();
    const [rows] = await conn.query("SHOW DATABASES");
    var dbs = rows.map(function (r) { return r.Database; });
    res.json({ success: true, databases: dbs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

const SQL_ALLOW = ['SELECT','SHOW','DESCRIBE','DESC','EXPLAIN','INSERT','UPDATE','DELETE','REPLACE','CREATE','ALTER','DROP','TRUNCATE','RENAME','USE','SET','CALL','BEGIN','COMMIT','ROLLBACK','GRANT','REVOKE','ANALYZE','OPTIMIZE','REPAIR','CHECK','FLUSH','DO','WITH','VALUES'];

router.get('/database/query', async (req, res) => {
  let conn;
  try {
    var query = req.query.query;
    var targetDb = req.query.db || DEFAULT_DB;
    if (!query) return res.status(400).json({ success: false, message: 'Query required' });
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    var firstWord = query.trim().split(/\s+/)[0].toUpperCase().replace(/;$/, '');
    if (SQL_ALLOW.indexOf(firstWord) === -1) {
      return res.status(403).json({ success: false, message: 'Perintah tidak diizinkan. Diizinkan: ' + SQL_ALLOW.join(', ') });
    }
    conn = await getConn(targetDb);
    const [result] = await conn.query(query);
    var isRows = Array.isArray(result);
    res.json({ success: true, result: isRows ? result : [], affectedRows: isRows ? result.length : (result.affectedRows || 0), info: isRows ? null : { affectedRows: result.affectedRows, insertId: result.insertId, message: result.message, warningCount: result.warningCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// Column + primary key info for a table
router.get('/database/columns', async (req, res) => {
  let conn;
  try {
    var targetDb = req.query.db || DEFAULT_DB;
    var table = req.query.table;
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (!table || !NAME_RE.test(table)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
    conn = await getConn(targetDb);
    const [cols] = await conn.query('SHOW FULL COLUMNS FROM ??', [table]);
    let pk = [];
    try {
      const [keys] = await conn.query("SHOW KEYS FROM ?? WHERE Key_name = 'PRIMARY'", [table]);
      pk = keys.map(function (k) { return k.Column_name; });
    } catch (e) { pk = []; }
    let indexes = [];
    try {
      const [idx] = await conn.query('SHOW INDEX FROM ??', [table]);
      indexes = idx;
    } catch (e) { indexes = []; }
    const [create] = await conn.query('SHOW CREATE TABLE ??', [table]).catch(function () { return [[]]; });
    let status = {};
    try {
      const [st] = await conn.query('SHOW TABLE STATUS FROM ?? LIKE ?', [targetDb, table]);
      status = st[0] || {};
    } catch (e) { status = {}; }
    res.json({ success: true, columns: cols, pk: pk, indexes: indexes, create: create[0] || null, status: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// Generic row CRUD (insert / update / delete) using parameterized queries
router.post('/database/row', async (req, res) => {
  let conn;
  try {
    var targetDb = req.body.db || DEFAULT_DB;
    var table = req.body.table;
    var action = req.body.action; // insert | update | delete
    var values = req.body.values || {};
    var original = req.body.original || {};
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (!table || !NAME_RE.test(table)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
    if (!['insert', 'update', 'delete'].includes(action)) return res.status(400).json({ success: false, message: 'Aksi tidak valid' });

    conn = await getConn(targetDb);
    const [cols] = await conn.query('SHOW FULL COLUMNS FROM ??', [table]);
    let pk = [];
    try {
      const [keys] = await conn.query("SHOW KEYS FROM ?? WHERE Key_name = 'PRIMARY'", [table]);
      pk = keys.map(function (k) { return k.Column_name; });
    } catch (e) { pk = []; }
    var colInfo = {};
    cols.forEach(function (c) { colInfo[c.Field] = c; });

    function norm(colName, raw) {
      var info = colInfo[colName] || {};
      if (raw === '' || raw === null || raw === undefined) {
        if (info.Extra && info.Extra.indexOf('auto_increment') !== -1) return undefined;
        if (info.Null === 'YES') return null;
        if (info.Type && /^(int|bigint|smallint|tinyint|mediumint|decimal|float|double|numeric)/i.test(info.Type)) return 0;
        return '';
      }
      if (info.Type && /^(int|bigint|smallint|tinyint|mediumint|decimal|float|double|numeric)/i.test(info.Type)) {
        var n = Number(raw);
        return isNaN(n) ? raw : n;
      }
      return raw;
    }

    if (action === 'insert') {
      var insCols = [], insPh = [], insVals = [];
      Object.keys(values).forEach(function (col) {
        if (!(col in colInfo)) return;
        var v = norm(col, values[col]);
        if (v === undefined) return;
        insCols.push(col);
        insPh.push('?');
        insVals.push(v);
      });
      if (!insCols.length) return res.status(400).json({ success: false, message: 'Tidak ada kolom untuk diisi' });
      var sql = 'INSERT INTO ?? (' + insCols.map(function () { return '??'; }).join(',') + ') VALUES (' + insPh.join(',') + ')';
      var params = [table].concat(insCols).concat(insVals);
      const [r] = await conn.query(sql, params);
      res.json({ success: true, id: r.insertId, message: 'Data berhasil ditambahkan' });
    } else if (action === 'update') {
      if (!pk.length) return res.status(400).json({ success: false, message: 'Tabel tidak punya primary key, update dibatalkan untuk keamanan' });
      var setCols = [], setVals = [];
      Object.keys(values).forEach(function (col) {
        if (pk.indexOf(col) !== -1) return;
        if (!(col in colInfo)) return;
        var v = norm(col, values[col]);
        if (v === undefined) return;
        setCols.push(col);
        setVals.push(v);
      });
      var whereCols = [], whereVals = [];
      pk.forEach(function (col) {
        whereCols.push(col);
        whereVals.push(norm(col, original[col]));
      });
      if (!setCols.length) return res.status(400).json({ success: false, message: 'Tidak ada kolom yang diubah' });
      var usql = 'UPDATE ?? SET ' + setCols.map(function (c) { return '?? = ?'; }).join(', ') + ' WHERE ' + whereCols.map(function (c) { return '?? = ?'; }).join(' AND ');
      var uparams = [table].concat(setCols).concat(setVals).concat(whereCols).concat(whereVals);
      const [r] = await conn.query(usql, uparams);
      res.json({ success: true, affected: r.affectedRows, message: 'Data berhasil diperbarui' });
    } else if (action === 'delete') {
      if (!pk.length) return res.status(400).json({ success: false, message: 'Tabel tidak punya primary key, delete dibatalkan untuk keamanan' });
      var dCols = [], dVals = [];
      pk.forEach(function (col) {
        dCols.push(col);
        dVals.push(norm(col, original[col]));
      });
      var dsql = 'DELETE FROM ?? WHERE ' + dCols.map(function (c) { return '?? = ?'; }).join(' AND ');
      var dparams = [table].concat(dCols).concat(dVals);
      const [r] = await conn.query(dsql, dparams);
      res.json({ success: true, affected: r.affectedRows, message: 'Data berhasil dihapus' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// DDL operations (database + table + column + index management)
const SYSTEM_DBS = ['mysql', 'information_schema', 'performance_schema', 'sys'];
router.post('/database/ddl', async (req, res) => {
  let conn;
  try {
    var targetDb = req.body.db || DEFAULT_DB;
    var op = req.body.op;
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (!op) return res.status(400).json({ success: false, message: 'Operasi tidak valid' });
    // Protect server-critical / system databases from destructive ops
    var opDb = (op === 'create_db' || op === 'drop_db') ? req.body.name : targetDb;
    if (SYSTEM_DBS.indexOf(opDb) !== -1 && op !== 'create_db') {
      return res.status(403).json({ success: false, message: 'Database sistem (' + opDb + ') dilindungi dan tidak dapat diubah/hapus dari panel.' });
    }
    if (op === 'drop_db' && req.body.name === DEFAULT_DB) {
      return res.status(403).json({ success: false, message: 'Database utama (' + DEFAULT_DB + ') tidak dapat dihapus.' });
    }
    if ((op === 'drop_table' || op === 'truncate_table' || op === 'rename_table') && SYSTEM_DBS.indexOf(targetDb) !== -1) {
      return res.status(403).json({ success: false, message: 'Tabel di database sistem tidak dapat diubah dari panel.' });
    }
    if ((op === 'add_column' || op === 'drop_column' || op === 'create_index' || op === 'drop_index') && SYSTEM_DBS.indexOf(targetDb) !== -1) {
      return res.status(403).json({ success: false, message: 'Struktur database sistem tidak dapat diubah dari panel.' });
    }
    conn = await getConn(targetDb);

    if (op === 'create_db') {
      var ndb = req.body.name;
      if (!NAME_RE.test(ndb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
      await conn.query('CREATE DATABASE IF NOT EXISTS ??', [ndb]);
      return res.json({ success: true, message: 'Database ' + ndb + ' dibuat' });
    }
    if (op === 'drop_db') {
      var ddb = req.body.name;
      if (!NAME_RE.test(ddb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
      if (ddb === DEFAULT_DB) return res.status(400).json({ success: false, message: 'Tidak bisa menghapus database utama' });
      await conn.query('DROP DATABASE ??', [ddb]);
      return res.json({ success: true, message: 'Database ' + ddb + ' dihapus' });
    }
    if (op === 'create_table') {
      var tname = req.body.name;
      var columns = req.body.columns || [];
      if (!NAME_RE.test(tname)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
      if (!columns.length) return res.status(400).json({ success: false, message: 'Minimal satu kolom' });
      var defs = [], pkCols = [];
      for (var i = 0; i < columns.length; i++) {
        var c = columns[i];
        if (!NAME_RE.test(c.name)) return res.status(400).json({ success: false, message: 'Nama kolom tidak valid: ' + (c.name || '') });
        if (!TYPE_RE.test(c.type)) return res.status(400).json({ success: false, message: 'Tipe kolom tidak valid: ' + (c.type || '') });
        var def = '?? ' + c.type;
        def = def.replace('??', '`' + c.name + '`');
        if (c.unsigned) def += ' UNSIGNED';
        def += (c.nullable ? ' NULL' : ' NOT NULL');
        if (c.default !== undefined && c.default !== '' && c.default !== null) def += ' DEFAULT ' + conn.escape(c.default);
        else if (c.nullable && (c.default === null || c.default === '')) def += ' DEFAULT NULL';
        if (c.ai) def += ' AUTO_INCREMENT';
        if (c.comment) def += " COMMENT " + conn.escape(c.comment);
        if (c.pk) pkCols.push('`' + c.name + '`');
        defs.push(def);
      }
      if (pkCols.length) defs.push('PRIMARY KEY (' + pkCols.join(', ') + ')');
      var csql = 'CREATE TABLE ?? (' + defs.join(', ') + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
      await conn.query(csql, [tname]);
      return res.json({ success: true, message: 'Tabel ' + tname + ' dibuat' });
    }
    if (op === 'drop_table') {
      var dt = req.body.name;
      if (!NAME_RE.test(dt)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
      await conn.query('DROP TABLE ??', [dt]);
      return res.json({ success: true, message: 'Tabel ' + dt + ' dihapus' });
    }
    if (op === 'truncate_table') {
      var tt = req.body.name;
      if (!NAME_RE.test(tt)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
      await conn.query('TRUNCATE TABLE ??', [tt]);
      return res.json({ success: true, message: 'Tabel ' + tt + ' dikosongkan' });
    }
    if (op === 'rename_table') {
      var from = req.body.from, to = req.body.to;
      if (!NAME_RE.test(from) || !NAME_RE.test(to)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
      await conn.query('RENAME TABLE ?? TO ??', [from, to]);
      return res.json({ success: true, message: 'Tabel ' + from + ' diubah menjadi ' + to });
    }
    if (op === 'add_column') {
      var at = req.body.table, ac = req.body.column;
      if (!NAME_RE.test(at) || !NAME_RE.test(ac.name) || !TYPE_RE.test(ac.type)) return res.status(400).json({ success: false, message: 'Nama/kolom tidak valid' });
      var acdef = '`' + ac.name + '` ' + ac.type;
      if (ac.unsigned) acdef += ' UNSIGNED';
      acdef += (ac.nullable ? ' NULL' : ' NOT NULL');
      if (ac.default !== undefined && ac.default !== '' && ac.default !== null) acdef += ' DEFAULT ' + conn.escape(ac.default);
      else if (ac.nullable) acdef += ' DEFAULT NULL';
      if (ac.ai) acdef += ' AUTO_INCREMENT';
      var acparams = [at];
      var acsql = 'ALTER TABLE ?? ADD COLUMN ' + acdef;
      if (ac.after) { acsql += ' AFTER ??'; acparams.push(ac.after); }
      await conn.query(acsql, acparams);
      return res.json({ success: true, message: 'Kolom ' + ac.name + ' ditambahkan' });
    }
    if (op === 'drop_column') {
      var dct = req.body.table, dcc = req.body.column;
      if (!NAME_RE.test(dct) || !NAME_RE.test(dcc)) return res.status(400).json({ success: false, message: 'Nama tidak valid' });
      await conn.query('ALTER TABLE ?? DROP COLUMN ??', [dct, dcc]);
      return res.json({ success: true, message: 'Kolom ' + dcc + ' dihapus' });
    }
    if (op === 'create_index') {
      var it = req.body.table, iname = req.body.name, icols = req.body.columns || [], iuniq = req.body.unique;
      if (!NAME_RE.test(it) || !NAME_RE.test(iname) || !icols.every(function (x) { return NAME_RE.test(x); })) return res.status(400).json({ success: false, message: 'Nama tidak valid' });
      await conn.query('CREATE ' + (iuniq ? 'UNIQUE ' : '') + 'INDEX ?? ON ?? (' + icols.map(function () { return '??'; }).join(', ') + ')', [iname, it].concat(icols));
      return res.json({ success: true, message: 'Index ' + iname + ' dibuat' });
    }
    if (op === 'drop_index') {
      var dit = req.body.table, diname = req.body.name;
      if (!NAME_RE.test(dit) || !NAME_RE.test(diname)) return res.status(400).json({ success: false, message: 'Nama tidak valid' });
      await conn.query('DROP INDEX ?? ON ??', [diname, dit]);
      return res.json({ success: true, message: 'Index ' + diname + ' dihapus' });
    }
    if (op === 'modify_column') {
      var mt = req.body.table, mcc = req.body.column;
      if (!NAME_RE.test(mt) || !NAME_RE.test(mcc.name) || !TYPE_RE.test(mcc.type)) return res.status(400).json({ success: false, message: 'Nama/kolom tidak valid' });
      var mcdef = '`' + mcc.name + '` ' + mcc.type;
      if (mcc.unsigned) mcdef += ' UNSIGNED';
      mcdef += (mcc.nullable ? ' NULL' : ' NOT NULL');
      if (mcc.default !== undefined && mcc.default !== '' && mcc.default !== null) mcdef += ' DEFAULT ' + conn.escape(mcc.default);
      else if (mcc.nullable) mcdef += ' DEFAULT NULL';
      if (mcc.ai) mcdef += ' AUTO_INCREMENT';
      if (mcc.comment) mcdef += " COMMENT " + conn.escape(mcc.comment);
      if (mcc.after) { mcdef += ' AFTER ??'; }
      var mcparams = [mt, mcdef];
      if (mcc.after) mcparams.push(mcc.after);
      await conn.query('ALTER TABLE ?? MODIFY COLUMN ' + mcdef, mcparams);
      return res.json({ success: true, message: 'Kolom ' + mcc.name + ' diperbarui' });
    }
    if (op === 'table_options') {
      var ot = req.body.table;
      if (!NAME_RE.test(ot)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
      var opts = [];
      if (req.body.engine) { if (!/^[A-Za-z0-9_]+$/.test(req.body.engine)) return res.status(400).json({ success: false, message: 'Engine tidak valid' }); opts.push('ENGINE=' + req.body.engine); }
      if (req.body.collation) { if (!/^[a-zA-Z0-9_]+$/.test(req.body.collation)) return res.status(400).json({ success: false, message: 'Collation tidak valid' }); opts.push('DEFAULT COLLATE ' + req.body.collation); }
      if (req.body.comment !== undefined && req.body.comment !== null && req.body.comment !== '') opts.push('COMMENT=' + conn.escape(req.body.comment));
      if (req.body.auto_increment) { var aiVal = Number(req.body.auto_increment); if (!isNaN(aiVal)) opts.push('AUTO_INCREMENT=' + aiVal); }
      if (!opts.length) return res.status(400).json({ success: false, message: 'Tidak ada opsi diubah' });
      await conn.query('ALTER TABLE ?? ' + opts.join(' , '), [ot]);
      return res.json({ success: true, message: 'Opsi tabel ' + ot + ' diperbarui' });
    }
    return res.status(400).json({ success: false, message: 'Operasi tidak dikenal: ' + op });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// Split SQL text into individual statements (supports DELIMITER + comments)
function splitSql(sql) {
  var out = [];
  var buf = '';
  var delim = ';';
  var lines = String(sql).split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var dm = line.match(/^\s*DELIMITER\s+(\S+)/i);
    if (dm) {
      if (buf.trim()) { out.push(buf.trim()); buf = ''; }
      delim = dm[1];
      continue;
    }
    var trimmed = line.trim();
    if (trimmed === '' || trimmed.indexOf('--') === 0 || trimmed.indexOf('#') === 0 || trimmed.indexOf('/*') === 0) continue;
    buf += line + '\n';
    var bt = buf.trim();
    if (bt.length >= delim.length && bt.slice(bt.length - delim.length) === delim) {
      var stmt = bt.slice(0, bt.length - delim.length).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// Export SQL dump (table or whole database)
router.get('/database/export', async (req, res) => {
  let conn;
  try {
    var targetDb = req.query.db || DEFAULT_DB;
    var table = req.query.table;
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (table && !NAME_RE.test(table)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
    conn = await getConn(targetDb);
    var tables = [];
    if (table) tables = [table];
    else { const [ts] = await conn.query('SHOW TABLES'); tables = ts.map(function (t) { return t['Tables_in_' + targetDb]; }); }
    var dump = '-- Northline SQL Database Manager Export\n-- Database: ' + targetDb + '\n-- Tanggal: ' + new Date().toISOString() + '\n\n';
    for (var ti = 0; ti < tables.length; ti++) {
      var t = tables[ti];
      const [c] = await conn.query('SHOW CREATE TABLE ??', [t]);
      dump += 'DROP TABLE IF EXISTS `' + t + '`;\n' + c[0]['Create Table'] + ';\n\n';
      const [cols] = await conn.query('SHOW COLUMNS FROM ??', [t]);
      var colNames = cols.map(function (x) { return x.Field; });
      var off = 0; var LIMIT = 500;
      while (true) {
        const [rows] = await conn.query('SELECT * FROM ?? LIMIT ? OFFSET ?', [t, LIMIT, off]);
        if (!rows.length) break;
        for (var ri = 0; ri < rows.length; ri++) {
          var vals = colNames.map(function (cn) { return conn.escape(rows[ri][cn]); });
          dump += 'INSERT INTO `' + t + '` (`' + colNames.join('`,`') + '`) VALUES (' + vals.join(', ') + ');\n';
        }
        if (rows.length < LIMIT) break;
        off += LIMIT;
      }
      dump += '\n';
    }
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + targetDb + (table ? '_' + table : '') + '_export.sql"');
    res.send(dump);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// Import SQL (runs multiple statements)
router.post('/database/import', async (req, res) => {
  let conn;
  try {
    var targetDb = req.body.db || DEFAULT_DB;
    var sql = req.body.sql;
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (!sql || !String(sql).trim()) return res.status(400).json({ success: false, message: 'SQL kosong' });
    conn = await getConn(targetDb);
    var stmts = splitSql(sql);
    var executed = 0;
    var errors = [];
    for (var i = 0; i < stmts.length; i++) {
      try { await conn.query(stmts[i]); executed++; }
      catch (e) { errors.push(stmts[i].slice(0, 90).replace(/\n/g, ' ') + ' — ' + e.message); }
    }
    res.json({ success: true, executed: executed, errors: errors, message: executed + ' statement dijalankan' + (errors.length ? ', ' + errors.length + ' gagal' : '') });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// Table maintenance (OPTIMIZE / ANALYZE / CHECK / REPAIR)
router.post('/database/maintenance', async (req, res) => {
  let conn;
  try {
    var targetDb = req.body.db || DEFAULT_DB;
    var table = req.body.table;
    var mop = (req.body.op || '').toLowerCase();
    var allowed = { optimize: 1, analyze: 1, check: 1, repair: 1 };
    if (!validDb(targetDb)) return res.status(400).json({ success: false, message: 'Nama database tidak valid' });
    if (!NAME_RE.test(table)) return res.status(400).json({ success: false, message: 'Nama tabel tidak valid' });
    if (!allowed[mop]) return res.status(400).json({ success: false, message: 'Operasi maintenance tidak valid' });
    conn = await getConn(targetDb);
    const [r] = await conn.query(mop.toUpperCase() + ' TABLE ??', [table]);
    res.json({ success: true, result: r, message: mop.toUpperCase() + ' selesai' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// ---------- AI Models (chat) ----------
router.get('/ai-models', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, provider, model_id, display_name, is_active, enabled, last_error, last_checked_at, total_messages, total_tokens, last_used_at FROM ai_models ORDER BY is_active DESC, id ASC');
    const [activeRows] = await db.execute("SELECT provider, model_id FROM ai_models WHERE is_active=1 AND enabled=1 LIMIT 1");

    const [[totals]] = await db.execute(`
      SELECT 
        COALESCE(SUM(total_messages),0) AS total_messages,
        COALESCE(SUM(total_tokens),0) AS total_tokens,
        COALESCE(SUM(CASE WHEN provider NOT IN ('opencode', 'copilot') THEN total_tokens * 0.000003 ELSE 0 END),0) AS est_cost,
        COUNT(CASE WHEN enabled=1 THEN 1 END) AS total_enabled,
        COUNT(CASE WHEN is_active=1 AND enabled=1 THEN 1 END) AS total_active,
        MAX(last_used_at) AS last_used_at
      FROM ai_models
    `);

    res.json({
      success: true,
      models: rows,
      active: activeRows[0] || null,
      activeName: activeRows[0] ? `${activeRows[0].provider}/${activeRows[0].model_id}` : null,
      summary: {
        totalMessages: totals.total_messages,
        totalTokens: totals.total_tokens,
        estCost: totals.est_cost,
        totalEnabled: totals.total_enabled,
        totalActive: totals.total_active,
        lastUsedAt: totals.last_used_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ai-models/select', async (req, res) => {
  try {
    const { provider, model_id } = req.body;
    if (!provider || !model_id) return res.status(400).json({ success: false, message: 'provider dan model_id wajib diisi' });
    if (provider !== 'copilot') return res.status(400).json({ success: false, message: 'Pilih model GitHub Copilot.' });
    const [rows] = await db.execute('SELECT id FROM ai_models WHERE provider=? AND model_id=?', [provider, model_id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Model tidak ditemukan' });
    await db.execute('UPDATE ai_models SET is_active=0 WHERE is_active=1');
    await db.execute('UPDATE ai_models SET is_active=1, enabled=1 WHERE provider=? AND model_id=?', [provider, model_id]);
    aiRoutes.invalidateAiModelsCache();
    res.json({ success: true, message: `Model AI diganti ke ${provider}/${model_id}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ai-models/sync', async (req, res) => {
  let connection;
  let transactionStarted = false;
  try {
    const availableModels = await listCopilotModels();
    const models = Array.from(new Map(
      availableModels
        .filter(model => model.id)
        .map(model => [model.id, { id: model.id, name: model.name || model.id }])
    ).values());
    if (models.length === 0) {
      return res.status(502).json({ success: false, message: 'GitHub Copilot tidak mengembalikan daftar model.' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [activeRows] = await connection.execute(
      "SELECT model_id FROM ai_models WHERE provider='copilot' AND is_active=1 AND enabled=1 LIMIT 1",
    );
    const activeModelId = activeRows[0]?.model_id;
    const selectedModelId = models.some(model => model.id === activeModelId)
      ? activeModelId
      : models[0].id;

    await connection.execute('UPDATE ai_models SET is_active=0, enabled=0');
    for (const model of models) {
      const [existingRows] = await connection.execute(
        'SELECT id FROM ai_models WHERE provider=? AND model_id=? LIMIT 1',
        ['copilot', model.id],
      );
      if (existingRows.length) {
        await connection.execute(
          'UPDATE ai_models SET display_name=?, is_active=?, enabled=1, last_error=NULL WHERE provider=? AND model_id=?',
          [model.name, model.id === selectedModelId ? 1 : 0, 'copilot', model.id],
        );
      } else {
        await connection.execute(
          'INSERT INTO ai_models (provider, model_id, display_name, is_active, enabled) VALUES (?, ?, ?, ?, 1)',
          ['copilot', model.id, model.name, model.id === selectedModelId ? 1 : 0],
        );
      }
    }
    await connection.commit();
    transactionStarted = false;
    aiRoutes.invalidateAiModelsCache();
    res.json({
      success: true,
      message: `${models.length} model GitHub Copilot disinkronkan.`,
      activeModel: selectedModelId,
    });
  } catch (err) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Copilot model sync rollback error:', rollbackError.message);
      }
    }
    console.error('Copilot model sync error:', err.message);
    res.status(503).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/ai-models/check', async (req, res) => {
  const { provider, model_id } = req.body;
  if (!provider || !model_id) return res.status(400).json({ success: false, message: 'provider dan model_id wajib diisi' });
  if (provider !== 'copilot') {
    return res.status(400).json({ success: false, message: 'Hanya model GitHub Copilot yang dapat diuji.' });
  }
  try {
    const reply = await sendCopilotPrompt({
      model: model_id,
      prompt: 'Balas dengan satu kata: OK',
      systemPrompt: 'Kamu adalah bot uji. Balas HANYA dengan satu kata: OK',
      timeout: 30000,
    });
    await db.execute('UPDATE ai_models SET last_error=NULL, last_checked_at=NOW() WHERE provider=? AND model_id=?', [provider, model_id]);
    res.json({ success: true, reply, message: `Model ${provider}/${model_id} aktif & merespons` });
  } catch (err) {
    const msg = err.message || 'Model tidak merespons (mungkin kena limit)';
    await db.execute('UPDATE ai_models SET last_error=?, last_checked_at=NOW() WHERE provider=? AND model_id=?', [String(msg).substring(0, 290), req.body.provider, req.body.model_id]);
    res.status(503).json({ success: false, message: `Model ${provider}/${model_id} gagal: ${msg}`, error: String(msg) });
  }
});

router.get('/affiliates', async (req, res) => {
  try {
    const { status = '', search = '' } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) {
      where += ' AND ac.status = ?';
      params.push(status);
    }
    if (search) {
      where += ` AND (ac.order_id LIKE ? OR ac.product_name LIKE ? OR u.username LIKE ?)`;
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [[agg]] = await db.execute(`
      SELECT COALESCE(SUM(ac.commission_amount),0) AS totalCommission,
             COALESCE(SUM(CASE WHEN ac.status='success' THEN ac.commission_amount ELSE 0 END),0) AS totalPaid,
             COUNT(*) AS totalCount,
             COUNT(DISTINCT ac.affiliate_user_id) AS totalAffiliates
      FROM affiliate_commissions ac
      LEFT JOIN user_northline u ON u.id = ac.affiliate_user_id
      ${where.replace('ac.status', 'ac.status')}
    `, params);

    const [commissions] = await db.execute(`
      SELECT ac.id, ac.affiliate_user_id, ac.order_id, ac.product_id, ac.product_name,
             ac.total_price, ac.commission_rate, ac.commission_amount, ac.status, ac.created_at,
             u.username AS affiliate_name, u.email AS affiliate_email,
             t.user_id AS buyer_id,
             (SELECT username FROM user_northline WHERE id = t.user_id) AS buyer_name
      FROM affiliate_commissions ac
      LEFT JOIN user_northline u ON u.id = ac.affiliate_user_id
      LEFT JOIN transactions t ON t.order_id = ac.order_id
      ${where}
      ORDER BY ac.created_at DESC
      LIMIT 100
    `, params);

    res.json({
      success: true,
      totalCommission: parseInt(agg?.totalCommission || 0),
      totalPaid: parseInt(agg?.totalPaid || 0),
      totalCount: parseInt(agg?.totalCount || 0),
      totalAffiliates: parseInt(agg?.totalAffiliates || 0),
      commissions: commissions.map(c => ({ ...c, commission_amount: parseInt(c.commission_amount), total_price: parseInt(c.total_price), commission_rate: parseFloat(c.commission_rate) }))
    });
  } catch (err) {
    console.error('admin affiliates error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- NPinjam Admin ----------
router.get('/npinjam/applications', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const [rows] = await db.execute(
      `SELECT na.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM npinjam_applications na JOIN user_northline u ON na.user_id=u.id
       WHERE na.status=? ORDER BY na.created_at DESC LIMIT 50`,
      [status]
    );
    res.json({ success: true, applications: rows });
  } catch (err) {
    console.error("Admin applications error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/npinjam/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [app] = await db.execute(
      "SELECT na.*, u.name as user_name, u.email as user_email, u.phone as user_phone FROM npinjam_applications na JOIN user_northline u ON na.user_id=u.id WHERE na.id=?",
      [id]
    );
    if (app.length === 0) return res.status(404).json({ success: false, message: "Tidak ditemukan" });
    res.json({ success: true, application: app[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/npinjam/applications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const [app] = await db.execute("SELECT * FROM npinjam_applications WHERE id=?", [id]);
    if (app.length === 0) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
    if (app[0].status !== "pending") return res.status(400).json({ success: false, message: "Sudah diproses" });

    const appData = app[0];

    await db.execute("UPDATE npinjam_applications SET status='approved', reviewed_by=?, reviewed_at=NOW() WHERE id=?", [adminId, id]);

    const [rules] = await db.execute("SELECT * FROM npinjam_scoring_rules WHERE is_active=1");
    let score = 0;
    for (const rule of rules) {
      let value = 0;
      switch (rule.factor_key) {
        case "repayment_rate": value = 85; break;
        case "avg_northpay_balance": value = Math.min(100, parseFloat(appData.monthly_income_range?.split("-")?.[1] || 0) / 10000000 * 100); break;
        case "monthly_tx_count": value = 20; break;
        case "account_age_days": value = Math.min(100, (Date.now() - new Date(appData.created_at).getTime()) / (1000 * 60 * 60 * 24) / 30 * 10); break;
        case "income_stability": value = 75; break;
        case "ktp_verified": {
          // Fail-closed. Kolom ini dulu diisi dari face_match_score yang
          // dikirim browser, jadi nilainya bisa dipalsukan dan tidak boleh
          // lagi dipakai. face_verify_score + facial_verification_status
          // keduanya berasal dari verifyFaces() di routes/npinjam.js.
          // Kalau statusnya bukan 'verified' (mesin mati, atau pengajuan
          // manual/legacy) kontribusinya 0 - bukan nilai default yang
          // optimistic.
          const faceVerified = appData.facial_verification_status === "verified";
          const similarity = faceVerified ? parseFloat(appData.face_verify_score) : NaN;
          value = Number.isFinite(similarity) ? Math.max(0, Math.min(1, similarity)) : 0;
          break;
        }
      }
      const normalized = Math.max(0, Math.min(1, (value - rule.min_value) / (rule.max_value - rule.min_value)));
      score += Math.round(rule.score_min + normalized * (rule.score_max - rule.score_min));
    }

    const tierQuery = "SELECT * FROM npinjam_tiers WHERE ? BETWEEN min_score AND max_score";
    const [tiers] = await db.execute(tierQuery, [score]);
    let tier = tiers[0];
    if (!tier) {
      const [allTiers] = await db.execute("SELECT * FROM npinjam_tiers ORDER BY min_score ASC LIMIT 1");
      tier = allTiers[0] || { tier_key: "bronze", base_limit: 500000, max_limit: 500000 };
    }

    const baseLimit = parseFloat(tier.base_limit);
    const maxLimit = parseFloat(tier.max_limit);
    const availableLimit = baseLimit;

    await db.execute(
      `INSERT INTO npinjam_profiles
      (user_id, score, tier, max_limit, available_limit, used_limit, is_active, activated_at)
      VALUES (?,?,?,?,?,?,TRUE,NOW())
      ON DUPLICATE KEY UPDATE score=VALUES(score), tier=VALUES(tier), max_limit=VALUES(max_limit), available_limit=VALUES(available_limit), used_limit=VALUES(used_limit), is_active=TRUE, activated_at=NOW()`,
      [appData.user_id, score, tier.tier_key, maxLimit, availableLimit, 0]
    );

    await db.execute(
      "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
      [appData.user_id, "NPinjam Aktif!", `Selamat! Akun NPinjam Anda telah diaktifkan. Limit tersedia: Rp ${Math.round(availableLimit).toLocaleString('id-ID')}. Nikmati layanan pinjaman Anda.`]
    );

    res.json({ success: true, message: "Pengajuan disetujui, profil NPinjam aktif", score, tier: tier.tier_key });
  } catch (err) {
    console.error("Admin approve error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/npinjam/applications/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;
    const [app] = await db.execute("SELECT * FROM npinjam_applications WHERE id=?", [id]);
    if (app.length === 0) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
    if (app[0].status !== "pending") return res.status(400).json({ success: false, message: "Sudah diproses" });

    await db.execute("UPDATE npinjam_applications SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?", [reason || "Ditolak", adminId, id]);

    res.json({ success: true, message: "Pengajuan ditolak" });
  } catch (err) {
    console.error("Admin reject error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/npinjam/score/:userId', async (req, res) => {
  try {
    const [profile] = await db.execute("SELECT * FROM npinjam_profiles WHERE user_id=?", [req.params.userId]);
    res.json({ success: true, profile: profile[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- NPinjam Loans Admin ----------
router.get('/npinjam/loans', async (req, res) => {
  try {
    const { status = 'pending,active' } = req.query;
    let where = '';
    const params = [];
    if (status !== 'all') {
      const statuses = String(status).split(',').filter(Boolean);
      if (statuses.length > 0) {
        where = 'WHERE nl.status IN (' + statuses.map(() => '?').join(',') + ')';
        params.push(...statuses);
      }
    }
    const [rows] = await db.execute(
      `SELECT nl.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
        (SELECT COUNT(*) FROM npinjam_installments ni WHERE ni.loan_id=nl.id AND ni.status='paid') as paid_count,
        (SELECT COUNT(*) FROM npinjam_installments ni WHERE ni.loan_id=nl.id) as total_count
       FROM npinjam_loans nl JOIN user_northline u ON nl.user_id=u.id
       ${where} ORDER BY nl.created_at DESC LIMIT 50`,
      params
    );
    res.json({ success: true, loans: rows });
  } catch (err) {
    console.error("Admin loans error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/npinjam/loans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [loans] = await db.execute(
      "SELECT nl.*, u.name as user_name, u.email as user_email, u.phone as user_phone FROM npinjam_loans nl JOIN user_northline u ON nl.user_id=u.id WHERE nl.id=?",
      [id]
    );
    if (loans.length === 0) return res.status(404).json({ success: false, message: "Pinjaman tidak ditemukan" });
    const [installments] = await db.execute(
      "SELECT * FROM npinjam_installments WHERE loan_id=? ORDER BY installment_no ASC",
      [id]
    );
    res.json({ success: true, loan: loans[0], installments });
  } catch (err) {
    console.error("Admin loan detail error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/npinjam/loans/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const [loans] = await db.execute("SELECT * FROM npinjam_loans WHERE id=?", [id]);
    if (loans.length === 0) return res.status(404).json({ success: false, message: "Pinjaman tidak ditemukan" });
    if (loans[0].status !== 'pending') return res.status(400).json({ success: false, message: "Pinjaman sudah diproses" });

    const loan = loans[0];
    const userId = loan.user_id;
    const amount = parseFloat(loan.principal);
    const tenure = parseInt(loan.tenor_months);
    const weeklyInstallment = parseFloat(loan.monthly_installment);

    const [profile] = await db.execute("SELECT * FROM npinjam_profiles WHERE user_id=?", [userId]);
    if (profile.length === 0 || !profile[0].is_active) {
      return res.status(400).json({ success: false, message: "Profil NPinjam user tidak aktif" });
    }

    const firstDueDate = new Date();
    firstDueDate.setDate(firstDueDate.getDate() + 7);
    const maturityDate = new Date(firstDueDate);
    maturityDate.setDate(maturityDate.getDate() + (tenure - 1) * 7);

    await db.execute(
      "UPDATE npinjam_loans SET status='active', reviewed_by=?, reviewed_at=NOW(), disbursed_at=NOW(), first_due_date=?, maturity_date=? WHERE id=?",
      [adminId, firstDueDate.toISOString().split("T")[0], maturityDate.toISOString().split("T")[0], id]
    );

    for (let i = 1; i <= tenure; i++) {
      const dueDate = new Date(firstDueDate);
      dueDate.setDate(dueDate.getDate() + (i - 1) * 7);
      const dueDateStr = dueDate.toISOString().split("T")[0];
      await db.execute(
        `INSERT INTO npinjam_installments
        (loan_id, installment_no, due_date, principal_portion, interest_portion, total_amount, status)
        VALUES (?,?,?,?,?,?,'pending')`,
        [id, i, dueDateStr, Math.round(amount / tenure * 100) / 100,
         Math.round((weeklyInstallment - amount / tenure) * 100) / 100, weeklyInstallment]
      );
    }

    await db.execute(
      "UPDATE npinjam_profiles SET used_limit = used_limit + ?, available_limit = available_limit - ?, total_outstanding = total_outstanding + ? WHERE user_id=?",
      [amount, amount, amount, userId]
    );

    await db.execute(
      "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
      [userId, "Pinjaman Disetujui", `Pinjaman Rp ${amount.toLocaleString('id-ID')} (tenor ${tenure} minggu) telah cair ke rekening ${loan.bank_name}. Cicilan pertama jatuh tempo ${firstDueDate.toLocaleDateString('id-ID')}.`]
    );

    res.json({ success: true, message: "Pinjaman disetujui dan dicairkan" });
  } catch (err) {
    console.error("Admin loan approve error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/npinjam/loans/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;
    const [loans] = await db.execute("SELECT * FROM npinjam_loans WHERE id=?", [id]);
    if (loans.length === 0) return res.status(404).json({ success: false, message: "Pinjaman tidak ditemukan" });
    if (loans[0].status !== 'pending') return res.status(400).json({ success: false, message: "Pinjaman sudah diproses" });

    await db.execute(
      "UPDATE npinjam_loans SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
      [reason || "Pengajuan ditolak", adminId, id]
    );

    await db.execute(
      "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
      [loans[0].user_id, "Pinjaman Ditolak", `Pengajuan pinjaman Rp ${parseFloat(loans[0].principal).toLocaleString('id-ID')} ditolak. ${reason ? 'Alasan: ' + reason : ''}`]
    );

    res.json({ success: true, message: "Pinjaman ditolak" });
  } catch (err) {
    console.error("Admin loan reject error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/seller-earnings', async (req, res) => {
  try {
    const { getFeeRates } = require('../utils/payout');
    const { feeRate, taxRate } = await getFeeRates();
    const [sellers] = await db.query(
      `SELECT s.id, s.store_name, s.store_slug, s.city, s.address, s.whatsapp, s.business_email,
        u.id as user_id, u.name as user_name, u.username, u.phone as user_phone
       FROM sellers s
       JOIN user_northline u ON u.id = s.user_id`
    );
    const result = [];
    for (const seller of sellers) {
      const [products] = await db.query(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN status="active" THEN 1 ELSE 0 END) AS active FROM products WHERE seller_id=?',
        [seller.id]
      );
      const [txSummary] = await db.query(
        `SELECT
          COUNT(*) AS totalOrders,
          SUM(CASE WHEN t.status='success' THEN 1 ELSE 0 END) AS soldOrders,
          SUM(CASE WHEN t.status='success' THEN t.total_price ELSE 0 END) AS grossRevenue,
          SUM(CASE WHEN t.status='success' THEN t.admin_fee ELSE 0 END) AS totalFee,
          SUM(CASE WHEN t.status='success' THEN t.seller_net ELSE 0 END) AS netRevenue,
          SUM(CASE WHEN t.status='success' AND (t.payout_status IS NULL OR t.payout_status='pending') THEN t.seller_net ELSE 0 END) AS pendingRevenue,
          SUM(CASE WHEN t.status='success' AND t.payout_status='released' THEN t.seller_net ELSE 0 END) AS releasedRevenue,
          MIN(CASE WHEN t.status='success' AND (t.payout_status IS NULL OR t.payout_status='pending') THEN t.payout_release_at ELSE NULL END) AS nextRelease
        FROM transactions t
        JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
        WHERE p.seller_id=?`,
        [seller.id]
      );
      result.push({
        id: seller.id,
        store_name: seller.store_name,
        store_slug: seller.store_slug,
        city: seller.city,
        user_name: seller.user_name,
        user_phone: seller.user_phone,
        total_products: Number(products[0].total) || 0,
        available_products: Number(products[0].active) || 0,
        total_orders: Number(txSummary[0].totalOrders) || 0,
        sold_orders: Number(txSummary[0].soldOrders) || 0,
        gross_revenue: Number(txSummary[0].grossRevenue) || 0,
        total_fee: Number(txSummary[0].totalFee) || 0,
        net_revenue: Number(txSummary[0].netRevenue) || 0,
        pending_revenue: Number(txSummary[0].pendingRevenue) || 0,
        released_revenue: Number(txSummary[0].releasedRevenue) || 0,
        next_release: txSummary[0].nextRelease || null,
        fee_rate: feeRate,
        tax_rate: taxRate,
      });
    }
    res.json({ success: true, earnings: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.adminAuth = adminAuth;
module.exports.ensureAdminOperationsTables = ensureAdminOperationsTables;
