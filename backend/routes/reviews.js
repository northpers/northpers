const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { safeExtensionFromMime, detectImageExtFromFile } = require('../utils/uploadValidation');
const { invalidateByPrefix } = require('../config/redis');

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

async function csrfProtection(req, res, next) {
  const headerToken = req.headers['x-csrf-token'];
  try {
    const [rows] = await db.execute('SELECT csrf_token FROM user_northline WHERE id=?', [req.user.id]);
    if (rows.length === 0 || rows[0].csrf_token !== headerToken) {
      return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

const reviewsDir = path.join(__dirname, '..', 'uploads', 'reviews');
const reviewsTempDir = path.join(__dirname, '..', 'uploads', 'reviews', 'temp');
for (const dir of [reviewsDir, reviewsTempDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reviewsDir),
  filename: (req, file, cb) => {
    const ext = safeExtensionFromMime(file.mimetype) || '.jpg';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});

const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reviewsTempDir),
  filename: (req, file, cb) => {
    const ext = safeExtensionFromMime(file.mimetype) || '.jpg';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = safeExtensionFromMime(file.mimetype);
    if (!ext || !['.jpg', '.png', '.gif', '.webp'].includes(ext)) {
      return cb(null, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 3 }
});

const uploadTemp = multer({
  storage: tempStorage,
  fileFilter: (req, file, cb) => {
    const ext = safeExtensionFromMime(file.mimetype);
    if (!ext || !['.jpg', '.png', '.gif', '.webp'].includes(ext)) {
      return cb(null, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

function deleteFile(filePath) {
  try {
    if (filePath) fs.unlinkSync(filePath);
  } catch (err) { /* ignore */ }
}

router.post('/upload-temp', verifyToken, (req, res) => {
  uploadTemp.single('photos')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Foto maksimal 5MB' : err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File foto tidak valid' });
    }
    const realExt = detectImageExtFromFile(req.file.path);
    if (!realExt) {
      deleteFile(req.file.path);
      return res.status(400).json({ success: false, message: 'File bukan gambar valid' });
    }
    if (realExt !== path.extname(req.file.path)) {
      const newPath = req.file.path.slice(0, req.file.path.length - path.extname(req.file.path).length) + realExt;
      fs.renameSync(req.file.path, newPath);
      req.file.path = newPath;
    }
    res.json({ success: true, url: '/uploads/reviews/temp/' + path.basename(req.file.path) });
  });
});

router.get('/orders/:orderId/reviewable', verifyToken, async (req, res) => {  try {
    const orderId = req.params.orderId;
    const [orders] = await db.execute(
      'SELECT order_id, product_id, product_name, product_image, chosen_color, chosen_size, chosen_model, quantity, total_price, delivery_status, status, delivery_rating, tracking_number, tracking_courier, shipped_at, estimated_arrival FROM transactions WHERE order_id=? AND user_id=?',
      [orderId, req.user.id]
    );
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
    }
    const completed = orders[0].delivery_status && orders[0].delivery_status.toLowerCase().includes('selesai');
    if (!completed) {
      return res.status(400).json({ success: false, message: 'Pesanan belum selesai, belum bisa memberi ulasan' });
    }
    const productIds = orders.map((o) => String(o.product_id));
    const placeholders = productIds.map(() => '?').join(',');
    const [reviewedRows] = await db.execute(
      `SELECT product_id FROM product_reviews WHERE order_id=? AND product_id IN (${placeholders})`,
      [orderId, ...productIds]
    );
    const reviewed = new Set(reviewedRows.map((r) => String(r.product_id)));
    const items = orders.map((o) => ({
      orderId: o.order_id,
      productId: o.product_id,
      productName: o.product_name,
      productImage: o.product_image,
      chosenColor: o.chosen_color,
      chosenSize: o.chosen_size,
      chosenModel: o.chosen_model,
      quantity: o.quantity,
      totalPrice: o.total_price,
      reviewed: reviewed.has(String(o.product_id)),
      trackingNumber: o.tracking_number,
      trackingCourier: o.tracking_courier,
      shippedAt: o.shipped_at,
      estimatedArrival: o.estimated_arrival,
    }));
    res.json({ success: true, orderId, deliveryRating: orders[0].delivery_rating || null, items });
  } catch (err) {
    console.error('reviewable error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/submit', verifyToken, csrfProtection, (req, res) => {
  upload.array('photos', 3)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Foto maksimal 5MB per file' : (err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Maksimal 3 foto' : err.message) });
    }
    let savedFiles = req.files || [];
    try {
      const { orderId, productId, rating, ratingBahan, ratingUkuran, ratingWarna, reviewText, deliveryRating, photoUrls } = req.body || {};
      if (!orderId || !productId) {
        return res.status(400).json({ success: false, message: 'orderId dan productId wajib diisi' });
      }
      const starRating = parseInt(rating, 10);
      if (isNaN(starRating) || starRating < 1 || starRating > 5) {
        return res.status(400).json({ success: false, message: 'Rating wajib antara 1-5' });
      }

      const [orders] = await db.execute(
        'SELECT * FROM transactions WHERE order_id=? AND user_id=?',
        [orderId, req.user.id]
      );
      if (orders.length === 0) {
        return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
      }
      const order = orders[0];
      if (!(order.delivery_status && order.delivery_status.toLowerCase().includes('selesai'))) {
        return res.status(400).json({ success: false, message: 'Pesanan belum selesai, belum bisa memberi ulasan' });
      }
      const realProductId = String(order.product_id);
      if (String(productId) !== realProductId) {
        return res.status(400).json({ success: false, message: 'Produk tidak cocok dengan pesanan' });
      }

      const [[dup]] = await db.execute(
        'SELECT id FROM product_reviews WHERE order_id=? AND product_id=?',
        [orderId, realProductId]
      );
      if (dup) {
        savedFiles.forEach((f) => deleteFile(f.path));
        return res.status(400).json({ success: false, message: 'Anda sudah memberi ulasan untuk produk ini' });
      }

      const [[userRow]] = await db.execute(
        'SELECT username, avatar FROM user_northline WHERE id=?',
        [req.user.id]
      );

      const rawAvatar = (userRow && userRow.avatar) || '/public/icons/default.png';
      const avatar = rawAvatar.length > 250 ? '/public/icons/default.png' : rawAvatar;

      const validFiles = [];
      for (const f of savedFiles) {
        const realExt = detectImageExtFromFile(f.path);
        if (!realExt) {
          deleteFile(f.path);
          continue;
        }
        if (realExt !== path.extname(f.path)) {
          const newPath = f.path.slice(0, f.path.length - path.extname(f.path).length) + realExt;
          fs.renameSync(f.path, newPath);
          f.path = newPath;
        }
        validFiles.push('/uploads/reviews/' + path.basename(f.path));
      }

      const movedUrls = [];
      const tempPrefix = '/uploads/reviews/temp/';
      const rawUrls = Array.isArray(photoUrls) ? photoUrls : (typeof photoUrls === 'string' ? photoUrls.split(',') : []);
      for (const u of rawUrls) {
        const url = String(u || '').trim();
        if (!url || !url.startsWith(tempPrefix)) continue;
        const oldPath = path.join(__dirname, '..', 'uploads', 'reviews', 'temp', path.basename(url));
        if (!fs.existsSync(oldPath)) continue;
        const newName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(oldPath);
        const newPath = path.join(reviewsDir, newName);
        fs.renameSync(oldPath, newPath);
        movedUrls.push('/uploads/reviews/' + newName);
      }
      const allImages = validFiles.concat(movedUrls).slice(0, 3);

      const intOrNull = (v) => {
        const n = parseInt(v, 10);
        return isNaN(n) || n < 1 || n > 5 ? null : n;
      };

      const [result] = await db.execute(
        `INSERT INTO product_reviews
          (product_id, order_id, user_id, username, user_avatar, rating, rating_bahan, rating_ukuran, rating_warna,
           variant_color, variant_size, variant_model, review_text, images, verified_purchase)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          realProductId, orderId, req.user.id,
          (userRow && userRow.username) || 'Pembeli Northline',
          avatar,
          starRating,
          intOrNull(ratingBahan), intOrNull(ratingUkuran), intOrNull(ratingWarna),
          order.chosen_color || null, order.chosen_size || null, order.chosen_model || null,
          reviewText || null,
          allImages.length > 0 ? JSON.stringify(allImages) : null,
        ]
      );

      const dRating = intOrNull(deliveryRating);
      if (dRating) {
        await db.execute(
          'UPDATE transactions SET delivery_rating=?, delivery_rated_at=NOW() WHERE order_id=? AND user_id=?',
          [dRating, orderId, req.user.id]
        );
      }

      await invalidateByPrefix('catalog:reviews');

      res.status(201).json({ success: true, message: 'Ulasan berhasil dikirim', reviewId: result.insertId });
    } catch (err) {
      console.error('review submit error:', err);
      savedFiles.forEach((f) => deleteFile(f.path));
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

module.exports = router;
