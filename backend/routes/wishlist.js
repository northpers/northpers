const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

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

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, product_id, name, price, img, color, model, size, quantity, created_at FROM wishlist WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    res.json({ success: true, items: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { product_id, name, price, img, color, model, size, quantity } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Nama produk wajib diisi' });

    const [existing] = await db.execute(
      'SELECT id, quantity FROM wishlist WHERE user_id=? AND name=? AND COALESCE(color,"")=? AND COALESCE(model,"")=? AND COALESCE(size,"")=?',
      [req.user.id, name, color || '', model || '', size || '']
    );

    if (existing.length > 0) {
      const newQty = (existing[0].quantity || 1) + (quantity || 1);
      await db.execute('UPDATE wishlist SET quantity=? WHERE id=?', [newQty, existing[0].id]);
      return res.json({ success: true, message: 'Quantity diperbarui', id: existing[0].id, quantity: newQty });
    }

    const [result] = await db.execute(
      'INSERT INTO wishlist (user_id, product_id, name, price, img, color, model, size, quantity) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user.id, product_id || null, name, price || null, img || null, color || null, model || null, size || null, quantity || 1]
    );
    res.json({ success: true, message: 'Produk ditambahkan ke wishlist', id: result.insertId, quantity: quantity || 1 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/remove/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute('SELECT id FROM wishlist WHERE id=? AND user_id=?', [id, req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    await db.execute('DELETE FROM wishlist WHERE id=?', [id]);
    res.json({ success: true, message: 'Item dihapus dari wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/remove', async (req, res) => {
  try {
    const { name, color, model, size } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Nama produk wajib diisi' });
    await db.execute(
      "DELETE FROM wishlist WHERE user_id=? AND name=? AND COALESCE(color,'')=? AND COALESCE(model,'')=? AND COALESCE(size,'')=?",
      [req.user.id, name, color || '', model || '', size || '']
    );
    res.json({ success: true, message: 'Item dihapus dari wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/migrate', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.json({ success: true, migrated: 0 });

    let migrated = 0;
    for (const item of items) {
      if (!item.name) continue;
      const [existing] = await db.execute(
        'SELECT id, quantity FROM wishlist WHERE user_id=? AND name=? AND COALESCE(color,"")=? AND COALESCE(model,"")=? AND COALESCE(size,"")=?',
        [req.user.id, item.name, item.color || '', item.model || '', item.size || '']
      );
      if (existing.length > 0) {
        const newQty = (existing[0].quantity || 1) + (item.quantity || 1);
        await db.execute('UPDATE wishlist SET quantity=? WHERE id=?', [newQty, existing[0].id]);
      } else {
        await db.execute(
          'INSERT INTO wishlist (user_id, product_id, name, price, img, color, model, size, quantity) VALUES (?,?,?,?,?,?,?,?,?)',
          [req.user.id, item.product_id || null, item.name, item.price || null, item.img || null, item.color || null, item.model || null, item.size || null, item.quantity || 1]
        );
      }
      migrated++;
    }
    res.json({ success: true, migrated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
