const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const jwt = require('jsonwebtoken');
const { safeExtensionFromMime, detectImageExtFromFile } = require("../utils/uploadValidation");

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/seller";
    if (file.fieldname === "ktp") folder += "/ktp";
    if (file.fieldname === "selfie") folder += "/selfie";
    if (file.fieldname === "npwp") folder += "/npwp";
    if (file.fieldname === "logo") folder += "/logo";
    if (file.fieldname === "banner") folder += "/banner";
    cb(null, folder);
  },

  filename: (req, file, cb) => {
    const ext = safeExtensionFromMime(file.mimetype) || ".jpg";
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Format file harus JPG, JPEG, PNG, atau WebP"));
    }
    cb(null, true);
  },
});
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/product");
  },
  filename: (req, file, cb) => {
    const ext = safeExtensionFromMime(file.mimetype) || ".jpg";
    cb(null, Date.now() + "-" + Math.floor(Math.random() * 1000000) + ext);
  },
});

const uploadProduct = multer({
  storage: productStorage,
  limits: {
    fileSize: 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Format file harus JPG, JPEG atau PNG"));
    }
    cb(null, true);
  },
});

router.post(
  "/seller/register",
  verifyToken,
  upload.fields([
    { name: "ktp", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "npwp", maxCount: 1 },
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        store_name,
        store_slug,
        business_email,
        whatsapp,
        city,
        address,
        bank_name,
        bank_account,
        store_description,
      } = req.body;

      const [existing] = await db.query(
        "SELECT id FROM sellers WHERE user_id = ?",
        [req.user.id],
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Akun sudah pernah mendaftar seller",
        });
      }

      const ktp = req.files?.ktp?.[0]?.filename || null;

      const selfie = req.files?.selfie?.[0]?.filename || null;

      const npwp = req.files?.npwp?.[0]?.filename || null;

      const logo = req.files?.logo?.[0]?.filename || null;

      const banner = req.files?.banner?.[0]?.filename || null;

      const uploadedFiles = { ktp, selfie, npwp, logo, banner };
      for (const [key, fname] of Object.entries(uploadedFiles)) {
        if (!fname) continue;
        const filePath = path.join(__dirname, "..", "uploads", "seller", key, fname);
        if (!detectImageExtFromFile(filePath)) {
          fs.unlink(filePath, () => {});
          return res.status(400).json({ success: false, message: "Salah satu file bukan gambar yang valid" });
        }
      }

      await db.query(
        `
                INSERT INTO sellers
                (
                    user_id,
                    store_name,
                    store_slug,
                    business_email,
                    whatsapp,
                    city,
                    address,
                    bank_name,
                    bank_account,
                    store_description,
                    logo_url,
                    banner_url,
                    ktp_url,
                    selfie_ktp_url,
                    npwp_url,
                    status,
                    created_at
                )
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
                `,
        [
          req.user.id,
          store_name,
          store_slug,
          business_email,
          whatsapp,
          city,
          address,
          bank_name,
          bank_account,
          store_description,
          logo,
          banner,
          ktp,
          selfie,
          npwp,
        ],
      );

      res.json({
        success: true,
        message: "Pendaftaran seller berhasil",
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  },
);

router.get("/seller/status/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [rows] = await db.query(
      `
            SELECT
                id,
                store_name,
                store_slug,
                business_email,
                whatsapp,
                address,
                bank_name,
                bank_account,
                logo_url,
                banner_url,
                ktp_url,
                npwp_url,
                selfie_ktp_url,
                status,
                created_at
            FROM sellers
            WHERE user_id = ?
        `,
      [user_id],
    );

    if (rows.length > 0) {
      res.json({
        success: true,
        seller: rows[0],
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Data seller tidak ditemukan",
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post(
  "/product/create",
  verifyToken,
  uploadProduct.array("images", 9),
  async (req, res) => {
    try {
      const user_id = req.user.id;
      const {
        name,
        description,
        price,
        stock,
        weight,
        category_id,
        brand,
        sku,
        condition_type,
        min_order,
        sizes,
      } = req.body;

      if (!name || !price) {
        return res.status(400).json({
          success: false,
          message: "Data tidak lengkap",
        });
      }

      const [sellerRows] = await db.query(
        `
        SELECT id
        FROM sellers
        WHERE user_id = ?
        `,
        [user_id],
      );

      if (!sellerRows.length) {
        return res.status(404).json({
          success: false,
          message: "Seller tidak ditemukan",
        });
      }

      const sellerId = sellerRows[0].id;

      const slug =
        name
          .toLowerCase()
          .replace(/[^\w ]+/g, "")
          .replace(/\s+/g, "-") +
        "-" +
        Date.now();

      const [productResult] = await db.query(
        `
        INSERT INTO products (
          seller_id,
          category_id,
          name,
          slug,
          description,
          brand,
          sku,
          condition_type,
          min_order,
          price,
          stock,
          weight,
          sizes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          sellerId,
          category_id || null,
          name,
          slug,
          description,
          brand || null,
          sku || null,
          condition_type || "baru",
          min_order || 1,
          price,
          stock || 0,
          weight || 0,
          sizes || null,
        ],
      );

      const productId = productResult.insertId;

      if (req.files?.length) {
        for (let i = 0; i < req.files.length; i++) {
          await db.query(
            `
            INSERT INTO product_images (
              product_id,
              image_url,
              sort_order
            )
            VALUES (?, ?, ?)
            `,
            [productId, req.files[i].filename, i],
          );
        }
      }

      res.json({
        success: true,
        message: "Produk berhasil dibuat",
        product_id: productId,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },
);

router.get("/seller/products/:seller_id", async (req, res) => {
  try {
    const { seller_id } = req.params;

    const [products] = await db.query(
      `
      SELECT
          p.*,
          s.store_name,
          s.city,
          (
              SELECT image_url
              FROM product_images
              WHERE product_id = p.id
              ORDER BY sort_order ASC
              LIMIT 1
          ) AS thumbnail
      FROM products p
      JOIN sellers s
          ON s.id = p.seller_id
      WHERE p.seller_id = ?
      ORDER BY p.id DESC
      `,
      [seller_id],
    );

    res.json({
      success: true,
      products,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

router.get("/product/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [product] = await db.query(
      `
        SELECT
          p.*,
          s.store_name
        FROM products p
        LEFT JOIN sellers s
          ON s.id = p.seller_id
        WHERE p.id = ?
      `,
      [id],
    );

    const [images] = await db.query(
      `
                    SELECT *
                    FROM product_images
                    WHERE product_id = ?
                    ORDER BY sort_order ASC
                `,
      [id],
    );

    res.json({
      success: true,
      product: product[0],
      images,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

router.get("/seller/blocked-products/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [seller] = await db.query(
      `SELECT id FROM sellers WHERE user_id = ?`,
      [user_id],
    );

    if (!seller.length) {
      return res.json({
        success: false,
      });
    }

    const sellerId = seller[0].id;

    const [products] = await db.query(
      `
                    SELECT *
                    FROM products
                    WHERE seller_id = ?
                    AND status = 'blocked'
                    ORDER BY id DESC
                `,
      [sellerId],
    );

    res.json({
      success: true,
      products,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

router.get("/products", async (req, res) => {
  try {
    const [products] = await db.query(`
            SELECT
                p.*,
                s.store_name,
                s.store_slug,
                s.city,
                (
                    SELECT image_url
                    FROM product_images
                    WHERE product_id = p.id
                    ORDER BY sort_order ASC
                    LIMIT 1
                ) AS image
            FROM products p
            JOIN sellers s
                ON s.id = p.seller_id
            WHERE p.status = 'active'
            ORDER BY p.id DESC
        `);

    res.json({
      success: true,
      products,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

router.put(
  "/product/:id",
  verifyToken,
  uploadProduct.array("images", 9),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [prod] = await db.query(
        'SELECT p.id FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.id = ? AND s.user_id = ?',
        [id, req.user.id]
      );
      if (!prod.length) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const { name, description, price, stock, weight } = req.body;

      await db.query(
        `
        UPDATE products
        SET
          name = ?,
          description = ?,
          price = ?,
          stock = ?,
          weight = ?
        WHERE id = ?
        `,
        [name, description, price, stock, weight, id],
      );

      if (req.files?.length) {
        await db.query(`DELETE FROM product_images WHERE product_id = ?`, [id]);

        for (let i = 0; i < req.files.length; i++) {
          await db.query(
            `
            INSERT INTO product_images
            (
              product_id,
              image_url,
              sort_order
            )
            VALUES (?, ?, ?)
            `,
            [id, req.files[i].filename, i],
          );
        }
      }

      res.json({
        success: true,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
      });
    }
  },
);

async function getSellerByUserId(userId) {
  const [rows] = await db.query(
    "SELECT * FROM sellers WHERE user_id = ? LIMIT 1",
    [userId],
  );
  return rows.length ? rows[0] : null;
}

const SELLER_ORDER_FILTERS = {
  all: "",
  pending: "t.status = 'pending'",
  success: "t.status = 'success'",
  cancelled: "t.status = 'cancelled'",
  processing: "t.delivery_status = 'Pesanan Diproses'",
  shipped: "t.delivery_status = 'Pesanan Dikirim'",
  delivered: "t.delivery_status = 'Pesanan Diterima'",
  completed: "t.delivery_status = 'Selesai'",
};

router.get("/seller/dashboard/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }

    const [productStats] = await db.query(
      `SELECT
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeProducts,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blockedProducts,
        SUM(CASE WHEN status = 'active' AND stock <= 5 THEN 1 ELSE 0 END) AS lowStockCount
      FROM products
      WHERE seller_id = ?`,
      [seller.id],
    );

    const [orderStats] = await db.query(
      `SELECT
        COUNT(*) AS totalOrders,
        SUM(CASE WHEN DATE(t.created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayOrders,
        SUM(CASE WHEN t.status = 'success' THEN t.total_price ELSE 0 END) AS totalRevenue,
        SUM(CASE WHEN DATE(t.created_at) = CURDATE() AND t.status = 'success' THEN t.total_price ELSE 0 END) AS todayRevenue,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pendingOrders,
        SUM(CASE WHEN t.delivery_status = 'Pesanan Diproses' THEN 1 ELSE 0 END) AS processingOrders,
        SUM(CASE WHEN t.delivery_status = 'Selesai' THEN 1 ELSE 0 END) AS completedOrders
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?`,
      [seller.id],
    );

    const [revenue7] = await db.query(
      `SELECT DATE(t.created_at) AS day, SUM(t.total_price) AS revenue
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ? AND t.status = 'success'
        AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(t.created_at)
      ORDER BY day ASC`,
      [seller.id],
    );

    const [revenue30] = await db.query(
      `SELECT DATE(t.created_at) AS day, SUM(t.total_price) AS revenue
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ? AND t.status = 'success'
        AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      GROUP BY DATE(t.created_at)
      ORDER BY day ASC`,
      [seller.id],
    );

    const [orderStatusCounts] = await db.query(
      `SELECT t.status AS status, t.delivery_status AS delivery_status, COUNT(*) AS count
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?
      GROUP BY t.status, t.delivery_status`,
      [seller.id],
    );

    const [topProducts] = await db.query(
      `SELECT p.id, p.name, p.price, p.stock, p.status,
        (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS thumbnail,
        COALESCE(SUM(t.quantity), 0) AS sold,
        COALESCE(SUM(CASE WHEN t.status = 'success' THEN t.total_price ELSE 0 END), 0) AS revenue
      FROM products p
      LEFT JOIN transactions t ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?
      GROUP BY p.id
      ORDER BY sold DESC
      LIMIT 5`,
      [seller.id],
    );

    const [recentOrders] = await db.query(
      `SELECT t.order_id, t.product_name, t.quantity, t.total_price, t.status,
        t.delivery_status, t.created_at, u.name AS buyer_name, u.username AS buyer_username
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      LEFT JOIN user_northline u ON u.id = t.user_id
      WHERE p.seller_id = ?
      ORDER BY t.created_at DESC
      LIMIT 5`,
      [seller.id],
    );

    res.json({
      success: true,
      seller: {
        id: seller.id,
        store_name: seller.store_name,
        store_slug: seller.store_slug,
        logo_url: seller.logo_url,
        banner_url: seller.banner_url,
        status: seller.status,
      },
      stats: {
        ...productStats[0],
        ...orderStats[0],
        totalRevenue: orderStats[0].totalRevenue || 0,
        todayRevenue: orderStats[0].todayRevenue || 0,
        totalOrders: orderStats[0].totalOrders || 0,
        todayOrders: orderStats[0].todayOrders || 0,
        pendingOrders: orderStats[0].pendingOrders || 0,
        processingOrders: orderStats[0].processingOrders || 0,
        completedOrders: orderStats[0].completedOrders || 0,
        totalProducts: productStats[0].totalProducts || 0,
        activeProducts: productStats[0].activeProducts || 0,
        blockedProducts: productStats[0].blockedProducts || 0,
        lowStockCount: productStats[0].lowStockCount || 0,
      },
      revenueByDay: { last7: revenue7, last30: revenue30 },
      orderStatusCounts,
      topProducts,
      recentOrders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/seller/orders/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }

    const filter = SELLER_ORDER_FILTERS[req.query.status] || SELLER_ORDER_FILTERS.all;
    let where = "p.seller_id = ?";
    const params = [seller.id];

    if (req.query.search) {
      where += " AND (t.order_id LIKE ? OR t.product_name LIKE ? OR u.name LIKE ? OR u.username LIKE ?)";
      const like = `%${req.query.search}%`;
      params.push(like, like, like, like);
    }
    if (filter) {
      where += " AND " + filter;
    }

    const [orders] = await db.query(
      `SELECT t.order_id, t.product_id, t.product_name, t.product_image, t.quantity,
        t.total_price, t.subtotal, t.discount_amount, t.status, t.delivery_status,
        t.payment_method, t.shipping_address, t.chosen_color, t.chosen_size,
        t.chosen_model, t.created_at, u.name AS buyer_name, u.username AS buyer_username,
        u.phone AS buyer_phone
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      LEFT JOIN user_northline u ON u.id = t.user_id
      WHERE ${where}
      ORDER BY t.created_at DESC
      LIMIT 200`,
      params,
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS count
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      LEFT JOIN user_northline u ON u.id = t.user_id
      WHERE ${where}`,
      params,
    );

    res.json({ success: true, orders, total: countRows[0].count || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/seller/order/:order_id/delivery", verifyToken, async (req, res) => {
  try {
    const { order_id } = req.params;
    const { delivery_status } = req.body;
    const allowed = [
      "Pesanan Diproses",
      "Pesanan Dikirim",
      "Pesanan Diterima",
      "Selesai",
      "Pesanan Dibatalkan",
    ];
    if (!allowed.includes(delivery_status)) {
      return res.status(400).json({ success: false, message: "Status pengiriman tidak valid" });
    }

    const [sellerRow] = await db.query(
      `SELECT s.id FROM sellers s
      JOIN products p ON p.seller_id = s.id
      WHERE s.user_id = ? AND p.id = CAST(? AS UNSIGNED)
      LIMIT 1`,
      [req.user.id, order_id],
    );

    const [orderRow] = await db.query(
      `SELECT t.order_id FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE t.order_id = ? AND p.seller_id = ?
      LIMIT 1`,
      [order_id, sellerRow[0]?.id],
    );

    if (!orderRow.length) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await db.query(
      "UPDATE transactions SET delivery_status = ? WHERE order_id = ?",
      [delivery_status, order_id],
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/seller/finance/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }

    const [summary] = await db.query(
      `SELECT
        COUNT(*) AS totalOrders,
        SUM(CASE WHEN t.status = 'success' THEN t.total_price ELSE 0 END) AS totalRevenue,
        SUM(CASE WHEN t.status = 'pending' THEN t.total_price ELSE 0 END) AS pendingRevenue,
        SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) AS paidOrders,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS unpaidOrders
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?`,
      [seller.id],
    );

    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month,
        SUM(CASE WHEN t.status = 'success' THEN t.total_price ELSE 0 END) AS revenue,
        COUNT(*) AS orders
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?
        AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(t.created_at, '%Y-%m')
      ORDER BY month ASC`,
      [seller.id],
    );

    const [paymentMethods] = await db.query(
      `SELECT COALESCE(t.payment_method, 'lainnya') AS method,
        COUNT(*) AS count,
        SUM(t.total_price) AS revenue
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?
      GROUP BY COALESCE(t.payment_method, 'lainnya')`,
      [seller.id],
    );

    res.json({
      success: true,
      summary: {
        totalOrders: summary[0].totalOrders || 0,
        totalRevenue: summary[0].totalRevenue || 0,
        pendingRevenue: summary[0].pendingRevenue || 0,
        paidOrders: summary[0].paidOrders || 0,
        unpaidOrders: summary[0].unpaidOrders || 0,
      },
      monthly,
      paymentMethods,
      bank: {
        bank_name: seller.bank_name,
        bank_account: seller.bank_account,
        bank_holder: seller.bank_holder,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ==================== WALLET / SALDO ==================== */

router.get("/seller/wallet/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }

    const { getFeeRates, addWorkingDays } = require("../utils/payout");
    const { feeRate, taxRate } = await getFeeRates();

    const [[balance]] = await db.query(
      "SELECT northpay_balance AS balance FROM user_northline WHERE id = ?",
      [seller.user_id],
    );

    const [summary] = await db.query(
      `SELECT
        COUNT(*) AS totalOrders,
        SUM(CASE WHEN t.status = 'success' THEN t.total_price ELSE 0 END) AS grossIncome,
        SUM(CASE WHEN t.status = 'success' THEN t.admin_fee ELSE 0 END) AS totalFee,
        SUM(CASE WHEN t.status = 'success' THEN t.seller_net ELSE 0 END) AS netIncome,
        SUM(CASE WHEN t.status = 'success' AND (t.payout_status IS NULL OR t.payout_status = 'pending') THEN t.seller_net ELSE 0 END) AS pendingIncome,
        SUM(CASE WHEN t.status = 'success' AND t.payout_status = 'released' THEN t.seller_net ELSE 0 END) AS releasedIncome,
        MIN(CASE WHEN t.status = 'success' AND (t.payout_status IS NULL OR t.payout_status = 'pending') THEN t.payout_release_at ELSE NULL END) AS nextRelease
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?`,
      [seller.id],
    );

    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month,
        SUM(CASE WHEN t.status = 'success' THEN t.total_price ELSE 0 END) AS revenue,
        SUM(CASE WHEN t.status = 'success' THEN t.seller_net ELSE 0 END) AS net
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ? AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(t.created_at, '%Y-%m')
      ORDER BY month ASC`,
      [seller.id],
    );

    const [recent] = await db.query(
      `SELECT t.order_id, t.product_name, t.product_image, t.total_price,
        t.seller_net, t.admin_fee, t.status, t.delivery_status, t.payout_status,
        t.payout_release_at, t.created_at
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ?
      ORDER BY t.created_at DESC
      LIMIT 15`,
      [seller.id],
    );

    res.json({
      success: true,
      balance: Number(balance?.balance) || 0,
      feeConfig: { feeRate, taxRate, workingDays: 30 },
      summary: {
        totalOrders: summary[0].totalOrders || 0,
        grossIncome: Number(summary[0].grossIncome) || 0,
        totalFee: Number(summary[0].totalFee) || 0,
        netIncome: Number(summary[0].netIncome) || 0,
        pendingIncome: Number(summary[0].pendingIncome) || 0,
        releasedIncome: Number(summary[0].releasedIncome) || 0,
        nextRelease: summary[0].nextRelease || null,
      },
      monthly,
      recent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ==================== PENGATURAN PENGIRIMAN ==================== */

router.get("/seller/shipping-settings/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    const [rows] = await db.query(
      "SELECT * FROM seller_shipping_settings WHERE seller_id = ? LIMIT 1",
      [seller.id],
    );
    let settings = rows.length ? rows[0] : {};
    let couriers = [];
    try {
      couriers = JSON.parse(settings.courier_enabled || "[]");
    } catch (e) {
      couriers = [];
    }
    res.json({
      success: true,
      settings: {
        seller_id: seller.id,
        origin_city: settings.origin_city || seller.city || "",
        shipping_cost: Number(settings.shipping_cost) || 0,
        processing_days: Number(settings.processing_days) || 1,
        est_min: Number(settings.est_min) || 2,
        est_max: Number(settings.est_max) || 5,
        couriers,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/seller/shipping-settings/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    const {
      origin_city,
      shipping_cost,
      processing_days,
      est_min,
      est_max,
      couriers,
    } = req.body;
    const courierJson = JSON.stringify(Array.isArray(couriers) ? couriers : []);
    const [existing] = await db.query(
      "SELECT id FROM seller_shipping_settings WHERE seller_id = ? LIMIT 1",
      [seller.id],
    );
    if (existing.length) {
      await db.query(
        `UPDATE seller_shipping_settings SET
          courier_enabled = ?, shipping_cost = ?, origin_city = ?,
          processing_days = ?, est_min = ?, est_max = ? WHERE seller_id = ?`,
        [
          courierJson,
          Number(shipping_cost) || 0,
          origin_city || seller.city || null,
          Number(processing_days) || 1,
          Number(est_min) || 2,
          Number(est_max) || 5,
          seller.id,
        ],
      );
    } else {
      await db.query(
        `INSERT INTO seller_shipping_settings
          (seller_id, courier_enabled, shipping_cost, origin_city, processing_days, est_min, est_max)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          seller.id,
          courierJson,
          Number(shipping_cost) || 0,
          origin_city || seller.city || null,
          Number(processing_days) || 1,
          Number(est_min) || 2,
          Number(est_max) || 5,
        ],
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ==================== MASS SHIP ==================== */

router.post("/seller/mass-ship", verifyToken, async (req, res) => {
  try {
    const { order_ids, delivery_status } = req.body;
    const allowed = [
      "Pesanan Diproses",
      "Pesanan Dikirim",
      "Pesanan Diterima",
      "Selesai",
      "Pesanan Dibatalkan",
    ];
    if (!Array.isArray(order_ids) || !order_ids.length) {
      return res.status(400).json({ success: false, message: "Tidak ada pesanan dipilih" });
    }
    if (!allowed.includes(delivery_status)) {
      return res.status(400).json({ success: false, message: "Status pengiriman tidak valid" });
    }
    const seller = await getSellerByUserId(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    const placeholders = order_ids.map(() => "?").join(",");
    const [orders] = await db.query(
      `SELECT t.order_id FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE p.seller_id = ? AND t.order_id IN (${placeholders})`,
      [seller.id, ...order_ids],
    );
    if (!orders.length) {
      return res.status(403).json({ success: false, message: "Tidak ada pesanan valid untuk toko ini" });
    }
    const validOrderIds = orders.map((o) => o.order_id);
    const updatePlaceholders = validOrderIds.map(() => "?").join(",");
    await db.query(
      `UPDATE transactions SET delivery_status = ?
       WHERE order_id IN (${updatePlaceholders})`,
      [delivery_status, ...validOrderIds],
    );
    res.json({
      success: true,
      message: `${validOrderIds.length} pesanan diperbarui ke "${delivery_status}".`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ==================== RETUR / PENGEMBALIAN ==================== */

router.get("/seller/returns/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    const [returns] = await db.query(
      `SELECT r.*, u.name AS buyer_name, u.username AS buyer_username,
        t.product_name, t.total_price
      FROM returns r
      LEFT JOIN user_northline u ON u.id = r.user_id
      LEFT JOIN transactions t ON t.order_id = r.order_id
      WHERE r.seller_id = ? OR r.order_id IN (
        SELECT t.order_id FROM transactions t
        JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
        WHERE p.seller_id = ?
      )
      ORDER BY r.created_at DESC`,
      [seller.id, seller.id],
    );
    res.json({ success: true, returns });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/seller/returns/:order_id/:action", verifyToken, async (req, res) => {
  try {
    const { order_id, action } = req.params;
    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ success: false, message: "Aksi tidak valid" });
    }
    const seller = await getSellerByUserId(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    const [orderRow] = await db.query(
      `SELECT t.order_id, t.user_id, t.total_price FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      WHERE t.order_id = ? AND p.seller_id = ?
      LIMIT 1`,
      [order_id, seller.id],
    );
    if (!orderRow.length) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const [existing] = await db.query(
      "SELECT id, status FROM returns WHERE order_id = ? LIMIT 1",
      [order_id],
    );
    if (existing.length) {
      await db.query("UPDATE returns SET status = ?, updated_at = NOW() WHERE order_id = ?", [
        action === "approved" ? "approved" : "rejected",
        order_id,
      ]);
    } else {
      await db.query(
        `INSERT INTO returns (order_id, user_id, seller_id, reason, status, refund_method)
         VALUES (?, ?, ?, 'Pengajuan retur dari seller', ?, 'northpay')`,
        [order_id, orderRow[0].user_id, seller.id, action === "approved" ? "approved" : "rejected"],
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ==================== BANK ==================== */

router.put("/seller/bank", verifyToken, async (req, res) => {
  try {
    const { bank_name, bank_account, bank_holder } = req.body;
    const seller = await getSellerByUserId(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    await db.query(
      "UPDATE sellers SET bank_name = ?, bank_account = ?, bank_holder = ? WHERE id = ?",
      [bank_name || null, bank_account || null, bank_holder || null, seller.id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/seller/store", verifyToken, async (req, res) => {
  try {
    const {
      store_name,
      store_slug,
      business_email,
      whatsapp,
      city,
      address,
      store_description,
    } = req.body;
    const seller = await getSellerByUserId(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }
    await db.query(
      `UPDATE sellers SET
        store_name = ?,
        store_slug = ?,
        business_email = ?,
        whatsapp = ?,
        city = ?,
        address = ?,
        store_description = ?
      WHERE id = ?`,
      [
        store_name || null,
        store_slug || null,
        business_email || null,
        whatsapp || null,
        city || null,
        address || null,
        store_description || null,
        seller.id,
      ],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ==================== TRACKING / RESI ==================== */

async function sellerOwnsOrder(userId, orderId) {
  const [rows] = await db.query(
    `SELECT t.order_id FROM transactions t
     JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
     JOIN sellers s ON s.id = p.seller_id
     WHERE s.user_id = ? AND t.order_id = ? LIMIT 1`,
    [userId, orderId],
  );
  return rows.length > 0;
}

async function getOrderTracking(orderId) {
  const [events] = await db.query(
    "SELECT id, order_id, status, description, location, created_at FROM tracking_events WHERE order_id = ? ORDER BY id ASC",
    [orderId],
  );
  return events;
}

router.get("/seller/shipping/:user_id", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const seller = await getSellerByUserId(user_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller tidak ditemukan" });
    }

    const [orders] = await db.query(
      `SELECT t.order_id, t.product_id, t.product_name, t.product_image, t.quantity,
        t.total_price, t.status, t.delivery_status, t.tracking_number, t.tracking_courier,
        t.shipped_at, t.estimated_arrival, t.payment_method, t.shipping_address,
        t.chosen_color, t.chosen_size, t.chosen_model, t.created_at,
        t.seller_net, t.admin_fee, t.payout_status, t.payout_release_at, t.payout_at,
        u.name AS buyer_name, u.username AS buyer_username, u.phone AS buyer_phone
      FROM transactions t
      JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
      LEFT JOIN user_northline u ON u.id = t.user_id
      WHERE p.seller_id = ?
      ORDER BY t.created_at DESC`,
      [seller.id],
    );

    const needResi = orders.filter(
      (o) => o.status === "success" && (o.delivery_status === "Pesanan Diproses" || o.delivery_status === "Pesanan Dikirim") && !o.tracking_number,
    );
    const withResi = orders.filter((o) => o.tracking_number);
    const summary = {
      needResi: needResi.length,
      shipped: orders.filter((o) => o.delivery_status === "Pesanan Dikirim").length,
      delivered: orders.filter((o) => o.delivery_status === "Pesanan Diterima").length,
      completed: orders.filter((o) => o.delivery_status === "Selesai").length,
    };

    res.json({ success: true, orders, needResi, withResi, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/seller/order/:order_id/ship", verifyToken, async (req, res) => {
  try {
    const { order_id } = req.params;
    const { courier, tracking_number } = req.body;
    if (!tracking_number || !String(tracking_number).trim()) {
      return res.status(400).json({ success: false, message: "Nomor resi wajib diisi" });
    }
    if (!(await sellerOwnsOrder(req.user.id, order_id))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const courierName = String(courier || "Lainnya").trim();
    await db.query(
      `UPDATE transactions SET tracking_number = ?, tracking_courier = ?,
        delivery_status = 'Pesanan Dikirim', shipped_at = NOW()
       WHERE order_id = ?`,
      [String(tracking_number).trim(), courierName, order_id],
    );
    await db.query(
      `INSERT INTO tracking_events (order_id, status, description, location)
       VALUES (?, 'Pesanan Dikirim', 'Pesanan dikirim dengan ${courierName}. No. Resi: ${tracking_number}', ?)`,
      [order_id, ""],
    );
    const { ensureSellerFinance } = require("../utils/payout");
    ensureSellerFinance(order_id).catch((e) => console.error("ensureSellerFinance:", e.message));
    res.json({ success: true, message: "Pesanan ditandai dikirim" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/seller/tracking/:order_id", verifyToken, async (req, res) => {
  try {
    const { order_id } = req.params;
    const { status, description, location } = req.body;
    if (!(await sellerOwnsOrder(req.user.id, order_id))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (!status || !String(status).trim()) {
      return res.status(400).json({ success: false, message: "Status wajib diisi" });
    }
    await db.query(
      "INSERT INTO tracking_events (order_id, status, description, location) VALUES (?, ?, ?, ?)",
      [order_id, String(status).trim(), description || null, location || null],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/seller/tracking/:order_id", verifyToken, async (req, res) => {
  try {
    const { order_id } = req.params;
    if (!(await sellerOwnsOrder(req.user.id, order_id))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const [order] = await db.query(
      `SELECT t.order_id, t.tracking_number, t.tracking_courier, t.shipped_at,
        t.delivery_status, t.estimated_arrival, t.product_name, t.product_image,
        t.chosen_color, t.chosen_size, t.chosen_model, t.quantity, t.total_price,
        t.shipping_address, u.name AS buyer_name, u.username AS buyer_username, u.phone AS buyer_phone
      FROM transactions t
      LEFT JOIN user_northline u ON u.id = t.user_id
      WHERE t.order_id = ? LIMIT 1`,
      [order_id],
    );
    const events = await getOrderTracking(order_id);
    const [sellerRow] = await db.query(
      `SELECT s.store_name, s.store_slug, s.city, s.address, s.whatsapp, s.business_email
       FROM sellers s
       JOIN products p ON p.seller_id = s.id
       JOIN transactions t ON t.product_id = p.id
       WHERE t.order_id = ? LIMIT 1`,
      [order_id],
    );
    res.json({
      success: true,
      order: order[0] || null,
      seller: sellerRow[0] || null,
      events,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
