require("dotenv").config();

process.on("unhandledRejection", (reason, promise) => {
    console.error("[WARNING] Unhandled Promise Rejection:", reason && reason.message ? reason.message : reason);
});

process.on("uncaughtException", (err) => {
    console.error("[WARNING] Uncaught Exception:", err && err.message ? err.message : err);
});

const express = require("express");
const compression = require("compression");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const db = require("./config/db");
const sellerRoutes = require("./routes/seller");
const productRoutes = require("./routes/productRoutes");
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Restore original IPs when behind Cloudflare proxy
app.set("trust proxy", 1);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set!");
  process.exit(1);
}

function getCookie(req, name) {
  if (!req.headers || !req.headers.cookie) return null;
  const cookies = req.headers.cookie.split(';');
  for (let c of cookies) {
    const eqIdx = c.indexOf('=');
    if (eqIdx === -1) continue;
    const key = c.substring(0, eqIdx).trim();
    if (key === name) return c.substring(eqIdx + 1).trim();
  }
  return null;
}

function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  console.log("[verifyToken] cookies:", req.headers?.cookie);
  if (authHeader) {
    token = authHeader.split(" ")[1];
    console.log("[verifyToken] from Authorization header");
  } else {
    token = getCookie(req, 'token');
    console.log("[verifyToken] from cookie, token length:", token?.length);
  }
  if (!token) {
    console.log("[verifyToken] no token found");
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    console.log("[verifyToken] verified, user:", req.user.id);
    next();
  } catch (e) {
    console.log("[verifyToken] jwt error:", e.message);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

io.on("connection", (socket) => {
    socket.on("join", (userId) => {
        socket.join(`chat_${userId}`);
        console.log(
            `User ${userId} joined room chat_${userId}`
        );
    });

    socket.on("join_admin", () => {
        socket.join("admin_room");
        console.log("Admin joined");
    });
    socket.on("disconnect", () => {
        console.log("Disconnected");
    });
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "unpkg.com", "cdn.jsdelivr.net", "img.icons8.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        mediaSrc: ["'self'"],
        fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https:"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
}));
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://nl.hostinesia.my.id', 'https://hostinesia.my.id']
        : true,
    credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "500kb", extended: true }));

app.use(compression());

const STATIC_CACHE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const STATIC_CACHE_MAX_AGE_IMMUTABLE = 365 * 24 * 60 * 60; // 1 year for hashed files

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

const strictLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: "Terlalu banyak percobaan login, coba lagi 15 menit." }
});

app.use("/api", generalLimiter);
app.use("/api/chat/send", strictLimiter);
app.use("/api/auth/chat", strictLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(
  express.static(path.join(__dirname, "../frontend"), {
    extensions: ["html"],
    index: false,
    redirect: false,
    maxAge: STATIC_CACHE_MAX_AGE * 1000,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      } else if (filePath.includes("tailwind")) {
        res.setHeader("Cache-Control", `public, max-age=${STATIC_CACHE_MAX_AGE_IMMUTABLE}, immutable`);
      } else {
        res.setHeader("Cache-Control", `public, max-age=${STATIC_CACHE_MAX_AGE}`);
      }
    },
  }),
);

app.use(express.static(path.join(__dirname, "../frontend/public"), {
  maxAge: STATIC_CACHE_MAX_AGE * 1000,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", `public, max-age=${STATIC_CACHE_MAX_AGE}`);
  },
}));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  maxAge: STATIC_CACHE_MAX_AGE * 1000,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", `public, max-age=${STATIC_CACHE_MAX_AGE}`);
  },
}));

app.use("/api/products", productRoutes);

app.get("/googlec36545397c19bb82.html", (req, res) => {
  res.type("text/plain");
  res.send("google-site-verification: googlec36545397c19bb82.html");
});

app.get("/index.html", (req, res) => {
  res.redirect("/");
});

app.get("/:page.html", (req, res) => {
  res.redirect(`/${req.params.page}`);
});

function getBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && process.env.PUPPETEER_EXECUTABLE_PATH.trim() !== "") {
    return process.env.PUPPETEER_EXECUTABLE_PATH.trim();
  }

  const platform = process.platform;

  if (platform === "win32") {
    const programFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";

    const winCandidates = [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    ];

    for (const cand of winCandidates) {
      if (cand && fs.existsSync(cand)) {
        return cand;
      }
    }

    try {
      const puppeteer = require("puppeteer");
      const bundledPath = puppeteer.executablePath();
      if (bundledPath && fs.existsSync(bundledPath)) {
        return bundledPath;
      }
    } catch (e) {}

    return null;
  } else if (platform === "linux") {
    const linuxCandidates = [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ];

    for (const cand of linuxCandidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }

    try {
      const puppeteer = require("puppeteer");
      const bundledPath = puppeteer.executablePath();
      if (bundledPath && fs.existsSync(bundledPath)) {
        return bundledPath;
      }
    } catch (e) {}

    return null;
  } else {
    try {
      const puppeteer = require("puppeteer");
      const bundledPath = puppeteer.executablePath();
      if (bundledPath && fs.existsSync(bundledPath)) {
        return bundledPath;
      }
    } catch (e) {}
    return null;
  }
}

let client = null;
const executablePath = getBrowserExecutable();

if (!executablePath) {
  console.warn("[WARNING] No browser executable found. WhatsApp client disabled.");
} else {
  console.log(`[WhatsApp] Selected browser executable: ${executablePath}`);
  try {
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: "./.wwebjs_auth",
      }),

      webVersionCache: {
        type: "local",
        path: "./.wwebjs_cache",
      },

      puppeteer: {
        headless: true,
        executablePath: executablePath,
        pipe: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
        ],
      },
    });

    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
    });

    client.on("ready", () => {
      console.log("WhatsApp Bot Northline SIAP DIGUNAKAN!");
    });

    client.on("auth_failure", (msg) => {
      console.error("[WARNING] WhatsApp authentication failed:", msg);
    });

    client.initialize().catch((err) => {
      console.error("[WARNING] WhatsApp client initialization error:", err.message || err);
    });
  } catch (err) {
    console.error("[WARNING] Failed to instantiate WhatsApp client:", err.message || err);
    client = null;
  }
}

app.use((req, res, next) => {
  req.whatsappClient = client;
  next();
});

app.post("/api/save-order", verifyToken, async (req, res) => {
  const {
    productId,
    productName,
    productImage,
    totalPrice,
    quantity,
    chosenColor,
    chosenSize,
    chosenModel,
    orderId,
    subtotal = totalPrice,
    discountAmount = 0,
    isDiscounted = false,
    status = "pending",
  } = req.body;

  const userId = req.user.id;

  if (!orderId || !productId || !totalPrice) {
    return res.status(400).json({
      success: false,
      message: "Data pesanan tidak lengkap!",
    });
  }

  try {
    const sql = `
        INSERT INTO transactions (
            order_id,
            user_id,
            product_id,
            product_name,
            product_image,
            chosen_color,
            chosen_size,
            chosen_model,
            quantity,
            subtotal,
            discount_amount,
            total_price,
            status,
            is_discounted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    const values = [
      orderId,
      userId,
      productId,
      productName,
      productImage,
      chosenColor,
      chosenSize,
      chosenModel,
      quantity,
      subtotal,
      discountAmount,
      totalPrice,
      status,
      isDiscounted ? 1 : 0,
    ];

    await db.query(sql, values);

    res.json({
      success: true,
      orderId,
      totalPrice,
      subtotal,
      discountAmount,
      isDiscounted,
    });
  } catch (err) {
    console.error("Gagal save ke DB:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get("/api/check-discount/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const [userPromo] = await db.query(
      `
            SELECT id
            FROM transactions
            WHERE user_id = ?
            AND is_discounted = 1
            LIMIT 1
        `,
      [userId],
    );

    if (userPromo.length > 0) {
      return res.json({
        eligible: false,
        reason: "already_used",
      });
    }

    const [quota] = await db.query(`
            SELECT COUNT(DISTINCT user_id) AS total
            FROM transactions
            WHERE is_discounted = 1
        `);

    if (quota[0].total >= 10) {
      return res.json({
        eligible: false,
        reason: "quota_full",
      });
    }

    return res.json({
      eligible: true,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      eligible: false,
      error: err.message,
    });
  }
});

app.post("/api/google-login", async (req, res) => {
  try {
    const { uid, name, email, avatar } = req.body;

    const [rows] = await db.query(
      "SELECT * FROM user_northline WHERE email = ?",
      [email],
    );

    if (rows.length === 0) {
      const username = email.split("@")[0].toLowerCase().replace(/\s+/g, "");

      const randomPass = await bcrypt.hash(uid, 10);

      await db.query(
        `
                INSERT INTO user_northline
                (
                    username,
                    name,
                    email,
                    password,
                    avatar,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, NOW(), NOW())
            `,
        [username, name, email, randomPass, avatar],
      );
    }

    const [userData] = await db.query(
      "SELECT * FROM user_northline WHERE email = ?",
      [email],
    );

    res.json({
      success: true,
      user: userData[0],
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
});

app.delete("/api/cancel-order/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const [result] = await db.execute(
      "DELETE FROM transactions WHERE order_id = ? AND status = 'pending'",
      [orderId],
    );

    if (result.affectedRows > 0) {
      res.json({
        success: true,
        message: "Order dibatalkan, data dihapus.",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Gagal hapus, mungkin sudah terbayar.",
      });
    }
  } catch (err) {
    console.error("Gagal batalin order:", err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.get("/api/check-order/:orderId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM transactions WHERE order_id = ?",
      [req.params.orderId],
    );
    if (rows.length === 0) {
      return res.json({
        success: false,
        status: "not_found",
        isPaid: false,
      });
    }
    res.json({
      success: true,
      status: rows[0].status,
      isPaid: rows[0].status === "success",
      order: rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error" });
  }
});

app.get("/api/user-profile/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT address FROM user_northline WHERE id = ?",
      [req.params.id],
    );
    res.json(rows[0] || { address: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ address: null });
  }
});

const crypto = require("crypto");

app.post("/api/students", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama siswa wajib diisi",
      });
    }
    const qrToken = crypto.randomUUID();
    const [result] = await db.execute(
      `
                INSERT INTO students
                (
                    name,
                    qr_token
                )
                VALUES
                (
                    ?, ?
                )
                `,
      [name.trim(), qrToken],
    );
    const studentId = result.insertId;
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const nis = `${year}${month}${day}${hour}${minute}${String(studentId).padStart(4, "0")}`;
    await db.execute(
      `
            UPDATE students
            SET nis = ?
            WHERE id = ?
            `,
      [nis, studentId],
    );

    res.json({
      success: true,
      message: "Siswa berhasil ditambahkan",
      student: {
        id: studentId,
        name: name.trim(),
        nis,
        qrToken,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan",
    });
  }
});

app.get("/api/students", async (req, res) => {
  try {
    const [rows] = await db.execute(`
            SELECT
                id,
                name,
                nis,
                qr_token,
                created_at
            FROM students
            ORDER BY id DESC
        `);

    res.json(rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil data siswa",
    });
  }
});

app.post("/api/attendance/scan", async (req, res) => {
  try {
    const { token } = req.body;
    const [studentRows] = await db.execute(
      `
                SELECT *
                FROM students
                WHERE qr_token = ?
                `,
      [token],
    );
    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "QR tidak ditemukan",
      });
    }
    const student = studentRows[0];
    const [todayAttendance] = await db.execute(
      `
                SELECT *
                FROM attendance
                WHERE student_id = ?
                AND attendance_date = CURDATE()
                `,
      [student.id],
    );
    if (todayAttendance.length > 0) {
      return res.json({
        success: true,
        already: true,
        student,
      });
    }
    await db.execute(
      `
  INSERT INTO attendance
  (
      student_id,
      attendance_date,
      attendance_time,
      status
  )
  VALUES
  (
      ?,
      CURDATE(),
      CURTIME(),
      'Hadir'
  )
  `,
      [student.id],
    );

    const [attendance] = await db.execute(
      `
  SELECT attendance_time
  FROM attendance
  WHERE student_id = ?
  AND attendance_date = CURDATE()
  LIMIT 1
  `,
      [student.id],
    );

    res.json({
      success: true,
      already: false,
      student,
      attendance_time: attendance[0].attendance_time,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

app.get("/api/attendance/today", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        s.name,
        s.nis,
        a.attendance_time,
        a.status
      FROM attendance a
      JOIN students s
        ON s.id = a.student_id
      WHERE a.attendance_date = CURDATE()
      AND a.status = 'hadir'
      ORDER BY a.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get("/api/attendance/count", async (req, res) => {
  try {
    const [[hadir]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'hadir'
    `);

    const [[izin]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'izin'
    `);

    const [[sakit]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'sakit'
    `);

    const [[alpha]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'alpha'
    `);

    res.json({
      hadir: hadir.total,
      izin: izin.total,
      sakit: sakit.total,
      alpha: alpha.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ hadir: 0, izin: 0, sakit: 0, alpha: 0 });
  }
});

app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const [students] = await db.execute(`
      SELECT COUNT(*) AS total_students FROM students
    `);

    const [attendance] = await db.execute(`
      SELECT COUNT(*) AS total_attendance
      FROM attendance
      WHERE attendance_date = CURDATE()
    `);

    res.json({
      totalStudents: students[0].total_students,
      totalAttendance: attendance[0].total_attendance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/dashboard/chart", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        attendance_date,
        COUNT(*) as total
      FROM attendance
      WHERE attendance_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY attendance_date
      ORDER BY attendance_date ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get("/api/attendance/today-full", async (req, res) => {
  try {
    const [students] = await db.execute(`
      SELECT id, name, nis FROM students
    `);

    const [attendance] = await db.execute(`
      SELECT student_id, status
      FROM attendance
      WHERE attendance_date = CURDATE()
    `);

    const map = {};
    attendance.forEach((a) => {
      map[a.student_id] = a.status;
    });

    const result = students.map((s) => ({
      id: s.id,
      name: s.name,
      nis: s.nis,
      status: map[s.id] || "alpha",
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post("/api/attendance/manual", async (req, res) => {
  const { student_id, status } = req.body;

  try {
    const [rows] = await db.execute(
      `
      SELECT id
      FROM attendance
      WHERE student_id = ?
      AND attendance_date = CURDATE()
      `,
      [student_id],
    );

    if (rows.length > 0) {
      await db.execute(
        `
        UPDATE attendance
        SET status = ?
        WHERE id = ?
        `,
        [status, rows[0].id],
      );
    } else {
      await db.execute(
        `
        INSERT INTO attendance (
          student_id,
          attendance_date,
          attendance_time,
          status
        )
        VALUES (?, CURDATE(), CURTIME(), ?)
        `,
        [student_id, status],
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/students/absent", async (req, res) => {
  const [rows] = await db.query(`
    SELECT 
      s.id,
      s.name,
      s.nis,
      a.status
    FROM students s
    LEFT JOIN attendance a
      ON s.id = a.student_id
      AND a.attendance_date = CURDATE()
    WHERE a.status IS NULL OR a.status != 'hadir'
  `);

  res.json(rows);
});

app.get("/api/attendance/by-week", async (req, res) => {
  const { start, end } = req.query;

  const [rows] = await db.execute(`
    SELECT
      attendance_date,
      COUNT(CASE WHEN status='hadir' THEN 1 END) AS hadir,
      COUNT(CASE WHEN status='izin' THEN 1 END) AS izin,
      COUNT(CASE WHEN status='sakit' THEN 1 END) AS sakit,
      COUNT(CASE WHEN status='alpha' THEN 1 END) AS alpha,
      COUNT(*) AS total
    FROM attendance
    WHERE attendance_date BETWEEN ? AND ?
    GROUP BY attendance_date
    ORDER BY attendance_date DESC
  `,[start,end]);

  res.json(
    rows.map(r => ({
      date: new Date(r.attendance_date)
        .toLocaleDateString("id-ID"),
      hadir: r.hadir,
      izin: r.izin,
      sakit: r.sakit,
      alpha: r.alpha,
      total: r.total
    }))
  );
});

app.post("/api/settings", async (req, res) => {
  const {
    school_name,
    attendance_start,
    attendance_end,
    attendance_days,
    auto_reset,
    scan_notif,
  } = req.body;

  await db.execute(
    `
    UPDATE settings
    SET
      school_name = ?,
      attendance_start = ?,
      attendance_end = ?,
      attendance_days = ?,
      auto_reset = ?,
      scan_notif = ?
    WHERE id = 1
    `,
    [
      school_name,
      attendance_start,
      attendance_end,
      JSON.stringify(attendance_days),
      auto_reset,
      scan_notif,
    ]
  );

  res.json({
    success: true,
  });
});

app.get("/api/settings", async (req, res) => {
  const [rows] = await db.execute(`
    SELECT *
    FROM settings
    LIMIT 1
  `);

  res.json(rows[0]);
});

app.get("/api/product/:id", (req, res) => {
    const product = products.find(
        p => p.id == req.params.id
    );

    if (!product) {
        return res.status(404).send("Not Found");
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>

<meta property="og:title" content="${product.name}">
<meta property="og:description" content="Harga mulai IDR ${product.price.toLocaleString("id-ID")}">
<meta property="og:image" content="${product.images[0]}">
<meta property="og:url" content="https://northline.id/product/${product.id}">
<meta property="og:type" content="product">

<meta name="twitter:card" content="summary_large_image">

<script>
window.location.href='/?product=${product.id}';
</script>

</head>
<body></body>
</html>
    `);
});

app.post("/api/follow-store", async (req, res) => {
    try {
        const { userId } = req.body;

        await db.query(
            `INSERT IGNORE INTO followers (user_id) VALUES (?)`,
            [userId]
        );

        const [[count]] = await db.query(
            `SELECT COUNT(*) as total FROM followers`
        );

        res.json({
            success: true,
            followers: 10000 + count.total
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

app.get("/api/followers-count", async (req, res) => {
    try {
        const [[count]] = await db.query(
            `SELECT COUNT(*) as total FROM followers`
        );

        res.json({
            success: true,
            followers: 10000 + count.total
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

app.get("/api/check-follow/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await db.query(
            "SELECT id FROM followers WHERE user_id = ? LIMIT 1",
            [userId]
        );

        res.json({
            success: true,
            following: rows.length > 0
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false
        });
    }
});

app.get("/api/following-count/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM followers
             WHERE user_id = ?`,
            [userId]
        );

        res.json({
            success: true,
            total: rows[0].total
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            total: 0
        });
    }
});

// Api Admin & Chat User
app.post("/api/chat/send", verifyToken, async (req, res) => {
    const { userId, message, type, sender = 'user' } = req.body;

    const finalMessage =
        typeof message === "object"
            ? JSON.stringify(message)
            : message;

    await db.query(
        `
        INSERT INTO chat_messages (user_id, sender, type, message)
        VALUES (?, ?, ?, ?)
        `,
        [
            userId,
            sender,
            type || "text",
            finalMessage
        ]
    );

    const msgData = {
        userId,
        sender,
        type: type || "text",
        message: typeof message === "object"
            ? message
            : message,
        time: new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })
    };

    if (sender === 'user') {
        io.to("admin_room").emit("new_message", msgData);
    }

    res.json({ success: true });
});

app.get("/api/chat/:userId", verifyToken, async (req, res) => {
    try {

        const { userId } = req.params;

        if (req.user.id != userId) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }

        const [messages] = await db.query(
            `
            SELECT
                id,
                sender,
                type,
                message,
                DATE_FORMAT(created_at,'%H:%i') as time
            FROM chat_messages
            WHERE user_id = ?
            ORDER BY id ASC
            `,
            [userId]
        );

        const parsed = messages.map(m => {
            let msg = m.message;

            // 🔥 FIX UTAMA DI SINI
            if (m.type === "product") {
                try {
                    msg = typeof m.message === "string"
                        ? JSON.parse(m.message)
                        : m.message;
                } catch (e) {
                    msg = {};
                }
            }

            return {
                ...m,
                message: msg
            };
        });

        res.json({
            success: true,
            messages: parsed
        });

    } catch (err) {
        console.error("Gagal ambil chat:", err);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
});

app.get("/api/chat/unread/:userId", verifyToken, async (req, res) => {
    try {

        const { userId } = req.params;

        if (req.user.id != userId) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }

        const [rows] = await db.query(
            `
            SELECT COUNT(*) AS total
            FROM chat_messages
            WHERE user_id = ?
            AND sender = 'admin'
            AND is_read = 0
            `,
            [userId]
        );

        res.json({
            success: true,
            unread: rows[0].total
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false
        });

    }
});

app.post("/api/chat/read/:userId", verifyToken, async (req, res) => {

    if (req.user.id != req.params.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await db.query(
        `
        UPDATE chat_messages
        SET is_read = 1
        WHERE user_id = ?
        AND sender = 'admin'
        `,
        [req.params.userId]
    );

    res.json({
        success: true
    });

});

app.delete(
    "/api/admin/chat/:userId",
    verifyToken,
    async (req, res) => {
        try {
            const { userId } =
                req.params;
            await db.query(
                `
                DELETE FROM chat_messages
                WHERE user_id = ?
                `,
                [userId]
            );
            io.to(`chat_${userId}`).emit("chat_deleted");
            res.json({
                success: true
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                success: false
            });
        }
    }
);

app.delete("/api/chat/message/:messageId", verifyToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const [rows] = await db.query("SELECT user_id FROM chat_messages WHERE id = ?", [messageId]);
        if (rows.length === 0) return res.status(404).json({ success: false });
        if (rows[0].user_id !== userId) return res.status(403).json({ success: false });

        await db.query("DELETE FROM chat_messages WHERE id = ?", [messageId]);
        io.to(`chat_${userId}`).emit("message_deleted", { messageId: parseInt(messageId) });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.post("/api/admin/reply", verifyToken, async (req, res) => {
    const { userId, message } = req.body;
    await db.query("INSERT INTO chat_messages (user_id, sender, message) VALUES (?, 'admin', ?)", [userId, message]);
    
    io.to(`chat_${userId}`).emit("new_message", {
        userId,
        message,
        sender: "admin",
        time: new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })
    });
    res.json({ success: true });
});

app.post("/api/admin/read/:userId", verifyToken, async (req,res)=>{
    await db.query(
        `
        UPDATE chat_messages
        SET is_read = 1
        WHERE user_id = ?
        AND sender='user'
        `,
        [req.params.userId]
    );
    res.json({
        success:true
    });
});

app.post("/api/admin/typing", verifyToken, (req, res) => {
    const { userId, isTyping } = req.body;
    io.to(`chat_${userId}`).emit("typing", { isTyping });
    res.sendStatus(200);
});

app.post("/api/admin/send", verifyToken, async (req, res) => {
    const { userId, message } = req.body;
    await db.query(
        `
        INSERT INTO chat_messages
        (user_id,sender,message,created_at)
        VALUES
        (?, 'admin', ?, NOW())
        `,
        [userId, message]
    );
    io.to(`chat_${userId}`).emit(
        "new_message",
        {
            userId,
            sender: "admin",
            message,
            time: new Date()
                .toLocaleTimeString(
                    "id-ID",
                    {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                    }
                )
        }
    );
    io.to(`chat_${userId}`).emit(
        "chat_notification"
    );
    res.json({
        success: true
    });
});

app.get("/api/admin/chat-users", verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                u.id,
                u.username AS name,

                (
                    SELECT message
                    FROM chat_messages cm
                    WHERE cm.user_id = u.id
                    ORDER BY cm.id DESC
                    LIMIT 1
                ) AS last_message,

                (
                    SELECT COUNT(*)
                    FROM chat_messages cm
                    WHERE cm.user_id = u.id
                    AND cm.sender = 'user'
                    AND cm.is_read = 0
                ) AS unread

            FROM user_northline u

            WHERE EXISTS (
                SELECT 1
                FROM chat_messages c
                WHERE c.user_id = u.id
            )

            ORDER BY (
                SELECT MAX(id)
                FROM chat_messages c
                WHERE c.user_id = u.id
            ) DESC
        `);

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

const storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,"uploads/chat");
    },
    filename:(req,file,cb)=>{
        cb(
            null,
            Date.now() +
            path.extname(file.originalname)
        );
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Hanya file gambar (JPEG/PNG/GIF/WebP) yang diizinkan"));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post(
    "/api/chat/upload",
    upload.single("image"),
    async (req,res)=>{
        try {
            const { userId } = req.body;

            const imageUrl =
                `/uploads/chat/${req.file.filename}`;

            await db.query(
                `
                INSERT INTO chat_messages
                (
                    user_id,
                    sender,
                    type,
                    message
                )
                VALUES
                (?, 'user', 'image', ?)
                `,
                [
                    userId,
                    imageUrl
                ]
            );

            const data = {
                userId,
                sender:"user",
                type:"image",
                message:imageUrl,
                time:new Date()
            };

            io.to(
                `chat_${userId}`
            ).emit(
                "new_message",
                data
            );

            io.to(
                "admin_room"
            ).emit(
                "new_message",
                data
            );

            res.json({
                success:true
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false });
        }
    }
);

const searchUpload = multer({
    dest: "uploads/temp/",
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Hanya file gambar yang diizinkan"));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post(
    "/api/upload-search-image",
    searchUpload.single("image"),
    (req, res) => {
        try {
            const url = `/uploads/temp/${req.file.filename}`;
            res.json({ success: true, url });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

const authRoutes = require("./routes/auth");

app.use("/api/auth", authRoutes);
app.use("/api", sellerRoutes);

app.use("/api", authRoutes);

function generateCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.get("/auth", (req, res) => {
  const code = generateCode();
  res.redirect(`/auth/northline.id-${code}`);
});

app.get("/auth/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "auth.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.get("/seller/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/public/seller/register.html"));
});

app.get("/*", (req, res, next) => {
  let reqPath = req.path;

  if (reqPath.startsWith("/api")) return next();

  if (reqPath.endsWith(".html")) {
    return res.redirect(reqPath.replace(".html", ""));
  }

  let filePath = path.join(
    __dirname,
    "../frontend",
    reqPath + ".html"
  );

  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 9000;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Server jalan di http://127.0.0.1:${PORT}`);
});
