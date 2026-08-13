const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { grantCommission } = require('./affiliate');

const JWT_SECRET = process.env.JWT_SECRET;

const adminAuth = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ success: false, message: 'Forbidden: localhost only' });
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
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [users] = await db.execute('SELECT id, username, role FROM user_northline WHERE id = ?', [decoded.id]);
    if (users.length === 0 || users[0].role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
    }
    req.user = users[0];
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

router.use(adminAuth);

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

    res.json({
      success: true,
      totalUsers: totalUsers.total,
      totalOrders: totalOrders.total,
      revenue: revenue.total,
      pendingOrders: pendingOrders.total,
      pendingOverdue: pendingOverdue.total,
      totalReviews: totalReviews.total,
      totalProducts: totalProducts.total,
      pendingNpinjam: pendingNpinjam.total,
      pendingLoans: pendingLoans.total,
      salesChart,
      topProducts,
      recentOrders
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND t.status=?'; params.push(status); }
    if (search) { where += ' AND (t.order_id LIKE ? OR t.product_name LIKE ? OR u.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const [[count]] = await db.execute(`SELECT COUNT(*) as total FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id ${where}`, params);
    const [orders] = await db.execute(`
      SELECT t.*, u.name as user_name, u.username, u.phone as user_phone
      FROM transactions t LEFT JOIN user_northline u ON t.user_id=u.id
      ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, orders, total: count.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders/confirm', async (req, res) => {
  try {
    const { orderId } = req.body;
    const [orderCheck] = await db.execute("SELECT status FROM transactions WHERE order_id=?", [orderId]);
    if (orderCheck.length === 0) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    if (orderCheck[0].status === 'success') return res.json({ success: true, message: 'Sudah dikonfirmasi' });
    await db.execute("UPDATE transactions SET status='success' WHERE order_id=?", [orderId]);
    await grantCommission(orderId).catch(e => console.error('grantCommission:', e.message));
    const { ensureSellerFinance } = require('../utils/payout');
    ensureSellerFinance(orderId).catch(e => console.error('ensureSellerFinance:', e.message));
    const [rows] = await db.execute(`
      SELECT t.product_name, t.chosen_size, t.chosen_color, t.chosen_model, t.quantity, t.total_price,
             u.name as customer_name, u.phone as customer_phone
      FROM transactions t JOIN user_northline u ON t.user_id=u.id WHERE t.order_id=?
    `, [orderId]);
    if (rows.length > 0 && req.whatsappClient) {
      const d = rows[0];
      let phone = d.customer_phone;
      if (phone.startsWith('0')) phone = '62' + phone.slice(1);
      const msg = `*NORTHLINE ORDER CONFIRMED*\n\nHalo kak *${d.customer_name}*,\nPembayaran untuk Order *${orderId}* telah kami verifikasi!\n\n📦 Produk: ${d.product_name}\n🎨 Warna: ${d.chosen_color || '-'}\n👕 Ukuran: ${d.chosen_size || '-'}\n🔢 Qty: ${d.quantity}\n💰 Total: Rp ${parseInt(d.total_price).toLocaleString('id-ID')}\n\nStatus: *LUNAS* ✅\n\nMakasih! - Northline Team`;
      try { await req.whatsappClient.sendMessage(`${phone}@c.us`, msg); } catch (e) { console.error('WA send error:', e); }
    }
    res.json({ success: true, message: 'Pembayaran dikonfirmasi & WA terkirim' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders/delivery', async (req, res) => {
  try {
    const { orderId, deliveryStatus, estimatedArrival, courier, trackingNumber } = req.body;
    if (estimatedArrival) {
      await db.execute("UPDATE transactions SET delivery_status=?, estimated_arrival=?, tracking_number=?, tracking_courier=?, shipped_at=? WHERE order_id=?", [deliveryStatus, estimatedArrival, trackingNumber || null, courier || null, deliveryStatus === 'Pesanan Dikirim' && trackingNumber ? new Date() : null, orderId]);
    } else {
      await db.execute("UPDATE transactions SET delivery_status=?, tracking_number=?, tracking_courier=?, shipped_at=? WHERE order_id=?", [deliveryStatus, trackingNumber || null, courier || null, deliveryStatus === 'Pesanan Dikirim' && trackingNumber ? new Date() : null, orderId]);
    }
    if (trackingNumber && courier) {
      const origin = await getStoreOrigin();
      await db.execute(
        `INSERT INTO tracking_events (order_id, status, description, location, lat, lng)
         VALUES (?, 'Pesanan Dikirim', ?, '', ?, ?)`,
        [orderId, `Pesanan dikirim dengan ${courier}. No. Resi: ${trackingNumber}`, origin ? origin.lat : null, origin ? origin.lng : null],
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const [orders] = await db.execute(`
      SELECT t.*, u.name as user_name, u.username, u.phone as user_phone
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
    res.json({ success: true, order: orders[0], events, seller: sellerRow[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders/:orderId/tracking', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, description, location, lat, lng } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status wajib diisi' });
    let latVal = null;
    let lngVal = null;
    if (lat !== undefined && lat !== null && lat !== '') {
      latVal = parseFloat(lat);
      if (isNaN(latVal) || latVal < -90 || latVal > 90) {
        return res.status(400).json({ success: false, message: 'Latitude tidak valid' });
      }
    }
    if (lng !== undefined && lng !== null && lng !== '') {
      lngVal = parseFloat(lng);
      if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
        return res.status(400).json({ success: false, message: 'Longitude tidak valid' });
      }
    }
    await db.execute(
      'INSERT INTO tracking_events (order_id, status, description, location, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, status, description || null, location || null, latVal, lngVal],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders/wa-remind', async (req, res) => {
  try {
    const { orderId } = req.body;
    const [rows] = await db.execute(`
      SELECT t.order_id, t.product_name, t.chosen_color, t.chosen_size, t.chosen_model, t.quantity, t.total_price,
             u.name as customer_name, u.phone as customer_phone
      FROM transactions t JOIN user_northline u ON t.user_id=u.id WHERE t.order_id=? AND t.wa_reminded=0
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
  try {
    const { orderId } = req.body;
    await db.execute("UPDATE transactions SET status='cancelled' WHERE order_id=?", [orderId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
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
    const [dbProducts] = await db.execute("SELECT * FROM products WHERE status='active'");
    const [productSales] = await db.execute(`
      SELECT product_name, COUNT(*) as total_sold, COALESCE(SUM(total_price),0) as total_revenue
      FROM transactions WHERE status='success' GROUP BY product_name ORDER BY total_sold DESC
    `);
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
    const client = req.whatsappClient;
    const connected = client && client.info && client.info.wid ? true : false;
    res.json({
      success: true,
      connected,
      number: connected ? client.info.wid.user : null,
      platform: connected ? client.info.platform : null
    });
  } catch (err) {
    res.json({ success: true, connected: false });
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
        case "ktp_verified": value = parseFloat(appData.face_match_score || appData.face_verify_score || 0); break;
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
