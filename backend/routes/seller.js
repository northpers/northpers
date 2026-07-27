const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const db = require("../config/db");

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
    const ext = path.extname(file.originalname);
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
    const ext = path.extname(file.originalname);
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
      } = req.body;

      const [existing] = await db.query(
        "SELECT id FROM sellers WHERE user_id = ?",
        [user_id],
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

router.get("/seller/status/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

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
  uploadProduct.array("images", 9),
  async (req, res) => {
    try {
      const {
        user_id,
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

      if (!user_id || !name || !price) {
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
  uploadProduct.array("images", 9),
  async (req, res) => {
    try {
      const { id } = req.params;

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

module.exports = router;
