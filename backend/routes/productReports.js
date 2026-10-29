const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { findCatalogProduct, getProductCode } = require('./catalog');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak laporan. Coba lagi beberapa saat.' }
});

async function ensureProductReportsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_reports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      product_code VARCHAR(100) NULL,
      product_name VARCHAR(255) NOT NULL,
      product_image VARCHAR(1000) NULL,
      reporter_user_id BIGINT UNSIGNED NULL,
      reason VARCHAR(32) NOT NULL,
      details TEXT NOT NULL,
      status ENUM('pending', 'reviewed', 'dismissed') NOT NULL DEFAULT 'pending',
      admin_note TEXT NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      reviewed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_product_reports_status_created (status, created_at),
      INDEX idx_product_reports_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function getOptionalReporterId(req) {
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)nl_jwt=([^;]*)/);
  let token = bearer;
  try {
    if (!token && cookie) token = decodeURIComponent(cookie[1]);
  } catch {
    return null;
  }
  if (!token || !JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return Number.isSafeInteger(Number(payload.id)) && Number(payload.id) > 0 ? Number(payload.id) : null;
  } catch {
    return null;
  }
}

router.post('/products/report', reportLimiter, async (req, res) => {
  const body = req.body || {};
  const productId = String(body.productId || '').trim();
  const reason = String(body.reason || '').trim();
  const details = String(body.details || '').trim();
  const allowedReasons = new Set(['misleading', 'counterfeit', 'prohibited', 'other']);

  const product = findCatalogProduct(productId);
  if (!product) {
    return res.status(400).json({ success: false, message: 'Informasi produk tidak valid.' });
  }
  if (!allowedReasons.has(reason)) {
    return res.status(400).json({ success: false, message: 'Pilih alasan laporan yang valid.' });
  }
  if (details.length < 5 || details.length > 2000) {
    return res.status(400).json({ success: false, message: 'Keterangan harus berisi 5 sampai 2000 karakter.' });
  }

  try {
    const reporterId = getOptionalReporterId(req);
    await db.execute(
      `INSERT INTO product_reports
        (product_id, product_code, product_name, product_image, reporter_user_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(product.id),
        getProductCode(product.id),
        product.name.slice(0, 255),
        product.images?.[0] || null,
        reporterId,
        reason,
        details,
      ]
    );
    return res.status(201).json({ success: true, message: 'Laporan berhasil dikirim dan akan ditinjau oleh admin.' });
  } catch (error) {
    console.error('Gagal menyimpan laporan produk:', error);
    return res.status(500).json({ success: false, message: 'Laporan gagal dikirim. Silakan coba lagi.' });
  }
});

module.exports = router;
module.exports.ensureProductReportsTable = ensureProductReportsTable;
