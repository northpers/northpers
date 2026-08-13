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
const { safeExtensionFromMime, detectImageExtFromFile } = require("./utils/uploadValidation");

function csrfProtection(req, res, next) {
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken) return res.status(403).json({ success: false, message: 'CSRF token required' });
  Promise.resolve().then(() => {
    return db.execute('SELECT csrf_token FROM user_northline WHERE id=?', [req.user.id]);
  }).then(([rows]) => {
    if (rows.length === 0 || rows[0].csrf_token !== headerToken) {
      return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    }
    next();
  }).catch((e) => {
    res.status(500).json({ success: false, message: 'CSRF validation error' });
  });
}

const bcrypt = require("bcrypt");
const sellerRoutes = require("./routes/seller");
const productRoutes = require("./routes/productRoutes");
const catalogRoutes = require("./routes/catalog");
const studentsRoutes = require("./routes/students");
const adminRoutes = require("./routes/admin");
const npinjamRoutes = require("./routes/npinjam");
const voucherHelpers = require("./voucher");
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

async function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.split(" ")[1];
  } else {
    token = getCookie(req, 'nl_jwt');
  }
  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  try {
    const authData = jwt.verify(token, JWT_SECRET);
    const [[user]] = await db.execute('SELECT auth_version FROM user_northline WHERE id = ?', [authData.id]);
    if (!user || (authData.authVersion || 0) !== user.auth_version) {
      return res.status(401).json({ success: false, message: "Sesi berakhir, silakan login ulang" });
    }
    req.user = authData;
    next();
  } catch (e) {
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

app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        'https://nl.hostinesia.my.id',
        'http://localhost:9000',
        'https://localhost:9000',
        'http://127.0.0.1:9000'
      ];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.tailwindcss.com", "unpkg.com", "cdn.jsdelivr.net", "img.icons8.com", "https://www.gstatic.com", "https://apis.google.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net", "unpkg.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        mediaSrc: ["'self'"],
        fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
        frameSrc: ["'self'", "https://accounts.google.com", "https://www.gstatic.com", "https://apis.google.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "500kb", extended: true }));

app.use(compression());

const BLOCKED_BOT_UA = [
  'gptbot', 'chatgpt-user', 'oai-searchbot', 'claude-', 'anthropic', 'claudebot',
  'perplexity', 'ccbot', 'google-extended', 'bytespider', 'applebot-extended',
  'meta-externalagent', 'cohere-ai', 'exabot', 'amazonbot', 'ahrefsbot',
  'semrushbot', 'mj12bot', 'dataforseobot', 'petalbot', 'diffbot', 'dotbot',
  'facebookexternalhit', 'python-requests', 'python-urllib', 'httpx', 'scrapy',
  'headlesschrome', 'phantomjs',
];

app.use((req, res, next) => {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  if (BLOCKED_BOT_UA.some((b) => ua.includes(b))) {
    res.status(403).type('text/plain').send('403 Forbidden');
    return;
  }
  const isApi = req.path.startsWith('/api/');
  res.setHeader('X-Robots-Tag', isApi ? 'noai, noarchive, noindex, nofollow' : 'noai, noarchive, notranslate');
  next();
});

const isLocalDev = process.env.NODE_ENV !== 'production';
const STATIC_CACHE_MAX_AGE = isLocalDev ? 0 : 7 * 24 * 60 * 60;
const STATIC_CACHE_MAX_AGE_IMMUTABLE = isLocalDev ? 0 : 365 * 24 * 60 * 60;

const generalLimiter = isLocalDev ? (req, res, next) => next() : rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

const strictLimiter = isLocalDev ? (req, res, next) => next() : rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

const authLimiter = isLocalDev ? (req, res, next) => next() : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: "Terlalu banyak percobaan login, coba lagi 15 menit." }
});

const searchLimiter = isLocalDev ? (req, res, next) => next() : rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

const catalogLimiter = isLocalDev ? (req, res, next) => next() : rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

app.use("/api/products/search", searchLimiter);
app.use("/api/catalog", catalogLimiter);
app.use("/api", generalLimiter);
app.use("/api/chat/send", strictLimiter);
app.use("/api/auth/chat", strictLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.get("/googlec36545397c19bb82.html", (req, res) => {
  res.type("text/plain");
  res.send("google-site-verification: googlec36545397c19bb82.html");
});

app.use((req, res, next) => {
  if (req.path !== '/' && req.path.endsWith('.html') && !req.path.startsWith('/api/')) {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const bare = req.path.slice(0, -5);
    const legacy = LEGACY_PAGE_MAP[bare];
    return res.redirect(301, (legacy || bare) + query);
  }
  next();
});

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
  extensions: ["html"],
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

app.use("/models", express.static(path.join(__dirname, "public/models"), {
  maxAge: STATIC_CACHE_MAX_AGE * 1000,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", `public, max-age=${STATIC_CACHE_MAX_AGE}`);
  },
}));

app.use("/api/products", productRoutes);
app.use("/api/catalog", catalogRoutes.router);

app.get("/googlec36545397c19bb82.html", (req, res) => {
  res.type("text/plain");
  res.send("google-site-verification: googlec36545397c19bb82.html");
});

app.get("/index.html", (req, res) => {
  res.redirect("/");
});

app.get("/orders", (req, res) => {
  res.redirect(301, "/AppNorthOrders");
});

app.get("/wishlist", (req, res) => {
  res.redirect(301, "/AppNorthWishlist");
});

app.get("/voucher", (req, res) => {
  res.redirect(301, "/AppNorthVoucher");
});

app.get("/sitemap.xml", (req, res) => {
  const base = "https://nl.hostinesia.my.id";
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    ["/", "1.0", "daily"],
    ["/AppNorthPromo", "0.8", "weekly"],
    ["/AppNorthSupermarket", "0.8", "weekly"],
    ["/AppNorthFreeShipping", "0.8", "weekly"],
    ["/AppNorthFlashSale", "0.8", "daily"],
    ["/AppNorthFitCheck", "0.7", "weekly"],
    ["/AppNorthRefund", "0.6", "monthly"],
    ["/AppNorthLocal", "0.8", "weekly"],
    ["/AppNorthAbout", "0.5", "monthly"],
    ["/AppNorthBlog", "0.8", "weekly"],
    ["/AppNorthCareer", "0.5", "monthly"],
    ["/AppNorthAffiliate", "0.6", "weekly"],
    ["/AppNorthMall", "0.7", "weekly"],
    ["/AppNorthPaymentMethod", "0.7", "monthly"],
    ["/AppNorthChatStore", "0.6", "weekly"],
    ["/AppNorthManaged", "0.6", "weekly"],
    ["/AppNorthWishlist", "0.6", "weekly"],
    ["/AppNorthVoucher", "0.7", "weekly"],
    ["/AppNorthOrders", "0.5", "monthly"],
  ];
  const productUrls = (catalogRoutes.NORTHLINE_CATALOG || []).map((p) =>
    `  <url><loc>${base}/product/${encodeURIComponent(catalogRoutes.getProductCode(p.id))}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`
  );
  const urlset = pages.map(([path, prio, freq]) =>
    `  <url><loc>${base}${path}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`
  );
  res.type("application/xml");
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset.join("\n")}\n${productUrls.join("\n")}\n</urlset>`
  );
});

const LEGACY_PAGE_MAP = {
  "/account": "/AppNorthAccount",
  "/affiliate": "/AppNorthAffiliate",
  "/auth": "/AppNorthAuth",
  "/AppNorthAuthAdmin": "/AppNorthAuthAdmin",
  "/blog": "/AppNorthBlog",
  "/contact": "/AppNorthContact",
  "/dikelola-northline": "/AppNorthManaged",
  "/fitcheck": "/AppNorthFitCheck",
  "/flash-sale": "/AppNorthFlashSale",
  "/gratis-ongkir": "/AppNorthFreeShipping",
  "/karir": "/AppNorthCareer",
  "/metode-pembayaran": "/AppNorthPaymentMethod",
  "/northline-product": "/AppNorthProduct",
  "/northMall": "/AppNorthMall",
  "/npinjam": "/AppNorthPinjam",
  "/nrtAdminPanel": "/AppNorthAdmin",
  "/nrtChatStore": "/AppNorthChatStore",
  "/nrtModalProducts": "/AppNorthModalProduct",
  "/nrtStore": "/AppNorthStore",
  "/orders": "/AppNorthOrders",
  "/pengembalian-dana": "/AppNorthRefund",
  "/pilih-lokal": "/AppNorthLocal",
  "/semua-promo": "/AppNorthPromo",
  "/supermarket": "/AppNorthSupermarket",
  "/tentang-kami": "/AppNorthAbout",
  "/voucher": "/AppNorthVoucher",
  "/wishlist": "/AppNorthWishlist",
  "/404": "/AppNorthNotFound",
  "/html/SCTONRT": "/html/AppNorthProductSection",
  "/html/FTORNRT": "/html/AppNorthFooter",
  "/seller/register": "/seller/AppNorthSellerRegister",
  "/seller/dashboard": "/seller/AppNorthSellerDashboard",
  "/seller-products/seller-modal-template": "/seller-products/AppNorthSellerModal",
  "/java/account.js": "/java/AppNorthAccount.js",
  "/java/auth.js": "/java/AppNorthAuth.js",
  "/java/global_loader.js": "/java/AppNorthGlobalLoader.js",
  "/java/language.js": "/java/AppNorthLanguage.js",
  "/java/language-manager.js": "/java/AppNorthLanguageManager.js",
  "/java/nrtAdminPanel.js": "/java/AppNorthAdmin.js",
  "/java/nrtChatStore.js": "/java/AppNorthChatStore.js",
  "/java/nrtProductsDetail.js": "/java/AppNorthCatalog.js",
  "/java/product-detail.js": "/java/AppNorthCatalog.js",
  "/java/nrtStore.js": "/java/AppNorthStore.js",
  "/java/payment.js": "/java/AppNorthPayment.js",
  "/java/script.js": "/java/AppNorthScript.js",
  "/java/slide.js": "/java/AppNorthSlide.js",
  "/java/translation-loader.js": "/java/AppNorthTranslationLoader.js",
  "/java/voucher.js": "/java/AppNorthVoucher.js",
  "/src/services/ai-service.js": "/src/services/AppNorthAiService.js",
  "/src/services/global.js": "/src/services/AppNorthGlobal.js",
  "/src/services/global_notif.js": "/src/services/AppNorthNotification.js",
  "/src/services/orders.js": "/src/services/AppNorthOrders.js",
  "/src/services/search.js": "/src/services/AppNorthSearch.js",
  "/src/services/storage-config.js": "/src/services/AppNorthStorageConfig.js",
  "/src/services/wishlist.js": "/src/services/AppNorthWishlist.js",
  "/seller-products/seller-card.js": "/seller-products/AppNorthSellerCard.js",
  "/seller-products/seller-product-detail.js": "/seller-products/AppNorthSellerProductDetail.js",
  "/seller/add-product.js": "/seller/AppNorthAddProduct.js",
  "/seller/blocked-product.js": "/seller/AppNorthBlockedProduct.js",
  "/seller/dashboard-seller.js": "/seller/AppNorthSellerDashboard.js",
  "/seller/edit_product.js": "/seller/AppNorthEditProduct.js",
  "/seller/my-product.js": "/seller/AppNorthMyProduct.js",
  "/seller/register.js": "/seller/AppNorthSellerRegister.js",
  "/seller/seller-common.js": "/seller/AppNorthSellerCommon.js",
};

app.get("/:page.html", (req, res) => {
  const legacy = LEGACY_PAGE_MAP["/" + req.params.page];
  res.redirect(301, legacy || `/${req.params.page}`);
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

if (process.env.WHATSAPP_WORKER === '0') {
  console.log("[WhatsApp] Worker ini tidak menjalankan WhatsApp client (WHATSAPP_WORKER=0).");
} else if (!executablePath) {
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

app.post("/api/save-order", verifyToken, csrfProtection, strictLimiter, async (req, res) => {
  const {
    productId,
    productName,
    productImage = '',
    totalPrice: clientTotalPrice,
    quantity,
    chosenColor = '',
    chosenSize = '',
    chosenModel = '',
    chosenSizeGroup = '',
    orderId,
    status = "pending",
    paymentMethod,
  } = req.body;

  const userId = req.user.id;

  if (!orderId || !productId) {
    return res.status(400).json({
      success: false,
      message: "Data pesanan tidak lengkap!",
    });
  }

  const productCode = typeof req.body.code === "string" ? req.body.code.trim() : "";
  const catalogProduct = catalogRoutes.findCatalogProduct(productCode || productId);

  if (!catalogProduct) {
    return res.status(400).json({
      success: false,
      message: "Produk tidak ditemukan",
    });
  }

  const productIdNum = catalogProduct.id;

  const quantityNum = Math.max(1, parseInt(quantity) || 1);
  const unitPrice = catalogRoutes.computeUnitPrice(catalogProduct, chosenModel, chosenSize, chosenSizeGroup);
  const computedSubtotal = unitPrice * quantityNum;

  const voucherId = typeof req.body.voucherId === "string" ? req.body.voucherId.trim() : "";
  const voucherMeta = voucherId ? voucherHelpers.findVoucher(voucherId) : null;
  const voucherDiscount = await computeServerDiscount(userId, voucherId, computedSubtotal, quantityNum, catalogRoutes.getCategories(catalogProduct));

  let isDiscounted = voucherDiscount.discountAmount > 0;
  let discountAmount = voucherDiscount.discountAmount;

  if (!isDiscounted && !(voucherMeta && voucherMeta.claimRequired)) {
    try {
      const [userPromo] = await db.execute(
        'SELECT id FROM transactions WHERE user_id = ? AND is_discounted = 1 AND status != \'cancelled\' LIMIT 1',
        [userId]
      );
      if (userPromo.length === 0) {
        const [quota] = await db.execute(
          'SELECT COUNT(DISTINCT user_id) AS total FROM transactions WHERE is_discounted = 1 AND status != \'cancelled\''
        );
        if (quota[0].total < 10) {
          isDiscounted = true;
          discountAmount = Math.round(computedSubtotal * 0.05);
        }
      }
    } catch (e) {
      console.log('Diskon cek skip:', e.message);
    }
  }

  const computedTotalPrice = computedSubtotal - discountAmount;

  const clientTotal = parseInt(clientTotalPrice);
  if (Number.isFinite(clientTotal) && clientTotal < computedTotalPrice) {
    return res.status(400).json({
      success: false,
      message: "Harga produk tidak valid",
    });
  }

  const subtotal = computedSubtotal;
  const totalPrice = computedTotalPrice;

  const sanitize = (str) => String(str || '').replace(/[<>\"'&]/g, '').trim().slice(0, 255);
  
  const sanitizedProductName = sanitize(productName);
  const sanitizedProductImage = sanitize(productImage);
  const sanitizedChosenColor = sanitize(chosenColor);
  const sanitizedChosenSize = sanitize(chosenSize);
  const sanitizedChosenModel = sanitize(chosenModel);
  const sanitizedOrderId = sanitize(orderId);

  let affiliateUserId = null;
  try {
    const affCookie = getCookie(req, 'nl_aff');
    const affPayload = affiliateRoutes.verifyAffCookie(affCookie);
    if (affPayload && affPayload.aid && Number(affPayload.aid) !== Number(userId)) {
      const [affChk] = await db.execute(
        'SELECT id FROM user_northline WHERE id = ? AND affiliate_enabled = 1',
        [affPayload.aid]
      );
      if (affChk.length > 0) affiliateUserId = Number(affPayload.aid);
    }
  } catch (e) {
    console.log('[affiliate] atribusi skip:', e.message);
  }

  let shippingAddress = '';
  try {
    const [addrRows] = await db.execute('SELECT address FROM user_northline WHERE id=?', [userId]);
    if (addrRows.length > 0 && addrRows[0].address) {
      shippingAddress = addrRows[0].address;
    }
  } catch (e) {}

  try {
    if (paymentMethod === 'northpay') {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [balRows] = await conn.execute(
          'SELECT northpay_balance, northpay_enabled FROM user_northline WHERE id=?',
          [userId]
        );
        const balance = parseFloat(balRows[0]?.northpay_balance || 0);

        if (balRows[0]?.northpay_enabled === 0) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            success: false,
            message: "NorthPay sedang dinonaktifkan",
          });
        }

        if (balance < totalPrice) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            success: false,
            message: "Saldo NorthPay tidak mencukupi",
          });
        }

        await conn.execute(
          'UPDATE user_northline SET northpay_balance = northpay_balance - ? WHERE id=?',
          [totalPrice, userId]
        );

        const sql = `
          INSERT INTO transactions (
              order_id, user_id, product_id, product_name, product_image,
              chosen_color, chosen_size, chosen_model, quantity, subtotal,
              discount_amount, total_price, status, is_discounted,
              payment_method, shipping_address, affiliate_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
          sanitizedOrderId, userId, productIdNum, sanitizedProductName, sanitizedProductImage,
          sanitizedChosenColor, sanitizedChosenSize, sanitizedChosenModel, quantity, subtotal,
          discountAmount, totalPrice, 'success', isDiscounted ? 1 : 0,
          'northpay', shippingAddress, affiliateUserId,
        ];
        await conn.execute(sql, values);

        await conn.execute(
          'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
          [userId, 'Pembayaran Berhasil',
           'Pembayaran ' + (productName || 'produk') + ' sebesar Rp ' + parseInt(totalPrice).toLocaleString('id-ID') + ' berhasil via NorthPay.']
        );

        await conn.commit();
        conn.release();

        if (affiliateUserId) {
          affiliateRoutes.grantCommission(orderId);
        }

        await markVoucherUsed(userId, voucherId, orderId);

        return res.json({
          success: true,
          orderId,
          totalPrice,
          subtotal,
          discountAmount,
          isDiscounted,
        });
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        throw txErr;
      }
    }

    const sql = `
        INSERT INTO transactions (
            order_id, user_id, product_id, product_name, product_image,
            chosen_color, chosen_size, chosen_model, quantity, subtotal,
            discount_amount, total_price, status, is_discounted,
            payment_method, shipping_address, affiliate_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    const values = [
      sanitizedOrderId, userId, productIdNum, sanitizedProductName, sanitizedProductImage,
      sanitizedChosenColor, sanitizedChosenSize, sanitizedChosenModel, quantity, subtotal,
      discountAmount, totalPrice, status, isDiscounted ? 1 : 0,
      paymentMethod || 'qris', shippingAddress, affiliateUserId,
    ];

    await db.query(sql, values);

    await markVoucherUsed(userId, voucherId, orderId);

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

app.post("/api/save-order/bulk", verifyToken, csrfProtection, strictLimiter, async (req, res) => {
  const { items, totalPrice: clientTotalPrice, status = "pending", paymentMethod } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Data pesanan tidak lengkap!" });
  }
  if (items.length > 20) {
    return res.status(400).json({ success: false, message: "Terlalu banyak item dalam satu checkout" });
  }

  const sanitize = (str) => String(str || '').replace(/[<>\"'&]/g, '').trim().slice(0, 255);
  const voucherId = typeof req.body.voucherId === "string" ? req.body.voucherId.trim() : "";
  const voucherMeta = voucherId ? voucherHelpers.findVoucher(voucherId) : null;
  let fixedVoucherApplied = false;

  let affiliateUserId = null;
  try {
    const affCookie = getCookie(req, 'nl_aff');
    const affPayload = affiliateRoutes.verifyAffCookie(affCookie);
    if (affPayload && affPayload.aid && Number(affPayload.aid) !== Number(userId)) {
      const [affChk] = await db.execute(
        'SELECT id FROM user_northline WHERE id = ? AND affiliate_enabled = 1',
        [affPayload.aid]
      );
      if (affChk.length > 0) affiliateUserId = Number(affPayload.aid);
    }
  } catch (e) {
    console.log('[affiliate] atribusi skip:', e.message);
  }

  let shippingAddress = '';
  try {
    const [addrRows] = await db.execute('SELECT address FROM user_northline WHERE id=?', [userId]);
    if (addrRows.length > 0 && addrRows[0].address) {
      shippingAddress = addrRows[0].address;
    }
  } catch (e) {}

  const prepared = [];
  let computedTotal = 0;
  let totalDiscount = 0;
  let userUsedPromo = false;

  for (const item of items) {
    const orderId = typeof item.orderId === 'string' ? item.orderId.trim() : '';
    const productCode = typeof item.code === 'string' ? item.code.trim() : "";
    const catalogProduct = catalogRoutes.findCatalogProduct(productCode || item.productId);

    if (!catalogProduct || !orderId) {
      return res.status(400).json({
        success: false,
        message: "Produk tidak ditemukan atau data pesanan tidak lengkap",
      });
    }

    const quantityNum = Math.max(1, parseInt(item.quantity) || 1);
    const unitPrice = catalogRoutes.computeUnitPrice(catalogProduct, item.chosenModel || '', item.chosenSize || '', item.chosenSizeGroup || '');
    const computedSubtotal = unitPrice * quantityNum;

    const voucherDiscount = await computeServerDiscount(userId, voucherId, computedSubtotal, quantityNum, catalogRoutes.getCategories(catalogProduct));
    let isDiscounted = voucherDiscount.discountAmount > 0;
    let discountAmount = voucherDiscount.discountAmount;

    if (voucherMeta && voucherMeta.claimRequired && voucherMeta.discountAmount > 0) {
      if (fixedVoucherApplied) {
        isDiscounted = false;
        discountAmount = 0;
      } else if (discountAmount > 0) {
        fixedVoucherApplied = true;
      }
    }

    if (!isDiscounted && !userUsedPromo && !(voucherMeta && voucherMeta.claimRequired)) {
      try {
        const [userPromo] = await db.execute(
          'SELECT id FROM transactions WHERE user_id = ? AND is_discounted = 1 AND status != \'cancelled\' LIMIT 1',
          [userId]
        );
        if (userPromo.length === 0) {
          const [quota] = await db.execute(
            'SELECT COUNT(DISTINCT user_id) AS total FROM transactions WHERE is_discounted = 1 AND status != \'cancelled\''
          );
          if (quota[0].total < 10) {
            isDiscounted = true;
            discountAmount = Math.round(computedSubtotal * 0.05);
          }
        }
      } catch (e) {
        console.log('Diskon cek skip:', e.message);
      }
    }

    if (isDiscounted && voucherDiscount.discountAmount <= 0) {
      userUsedPromo = true;
    }

    const itemTotal = computedSubtotal - discountAmount;
    computedTotal += itemTotal;
    totalDiscount += discountAmount;

    prepared.push({
      orderId: sanitize(orderId),
      productIdNum: catalogProduct.id,
      productName: sanitize(item.productName || catalogProduct.name),
      productImage: sanitize(item.productImage || ''),
      chosenColor: sanitize(item.chosenColor),
      chosenSize: sanitize(item.chosenSize),
      chosenModel: sanitize(item.chosenModel),
      quantity: quantityNum,
      subtotal: computedSubtotal,
      discountAmount,
      totalPrice: itemTotal,
      isDiscounted: isDiscounted ? 1 : 0,
    });
  }

  const clientTotal = parseInt(clientTotalPrice);
  if (Number.isFinite(clientTotal) && clientTotal < computedTotal) {
    return res.status(400).json({
      success: false,
      message: "Total harga tidak valid",
    });
  }

  const insertQris = async () => {
    const sql = `
      INSERT INTO transactions (
          order_id, user_id, product_id, product_name, product_image,
          chosen_color, chosen_size, chosen_model, quantity, subtotal,
          discount_amount, total_price, status, is_discounted,
          payment_method, shipping_address, affiliate_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (const p of prepared) {
      await db.query(sql, [
        p.orderId, userId, p.productIdNum, p.productName, p.productImage,
        p.chosenColor, p.chosenSize, p.chosenModel, p.quantity, p.subtotal,
        p.discountAmount, p.totalPrice, status, p.isDiscounted,
        paymentMethod || 'qris', shippingAddress, affiliateUserId,
      ]);
    }
  };

  try {
    if (paymentMethod === 'northpay') {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [balRows] = await conn.execute(
          'SELECT northpay_balance, northpay_enabled FROM user_northline WHERE id=?',
          [userId]
        );
        const balance = parseFloat(balRows[0]?.northpay_balance || 0);

        if (balRows[0]?.northpay_enabled === 0) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            success: false,
            message: "NorthPay sedang dinonaktifkan",
          });
        }

        if (balance < computedTotal) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            success: false,
            message: "Saldo NorthPay tidak mencukupi",
          });
        }

        await conn.execute(
          'UPDATE user_northline SET northpay_balance = northpay_balance - ? WHERE id=?',
          [computedTotal, userId]
        );

        const sql = `
          INSERT INTO transactions (
              order_id, user_id, product_id, product_name, product_image,
              chosen_color, chosen_size, chosen_model, quantity, subtotal,
              discount_amount, total_price, status, is_discounted,
              payment_method, shipping_address, affiliate_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        for (const p of prepared) {
          await conn.execute(sql, [
            p.orderId, userId, p.productIdNum, p.productName, p.productImage,
            p.chosenColor, p.chosenSize, p.chosenModel, p.quantity, p.subtotal,
            p.discountAmount, p.totalPrice, 'success', p.isDiscounted,
            'northpay', shippingAddress, affiliateUserId,
          ]);
        }

        await conn.execute(
          'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
          [userId, 'Pembayaran Berhasil',
           'Pembayaran ' + prepared.length + ' produk sebesar Rp ' + parseInt(computedTotal).toLocaleString('id-ID') + ' berhasil via NorthPay.']
        );

        await conn.commit();
        conn.release();

        if (affiliateUserId) {
          for (const p of prepared) {
            try { affiliateRoutes.grantCommission(p.orderId); } catch (e) { console.log('[affiliate] komisi skip:', e.message); }
          }
        }

        await markVoucherUsed(userId, voucherId, prepared[0]?.orderId);

        return res.json({
          success: true,
          totalPrice: computedTotal,
          subtotal: computedTotal + totalDiscount,
          discountAmount: totalDiscount,
          orders: prepared.map((p) => ({
            orderId: p.orderId,
            subtotal: p.subtotal,
            discountAmount: p.discountAmount,
            totalPrice: p.totalPrice,
            isDiscounted: p.isDiscounted,
          })),
        });
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        throw txErr;
      }
    }

    await insertQris();

    await markVoucherUsed(userId, voucherId, prepared[0]?.orderId);

    res.json({
      success: true,
      totalPrice: computedTotal,
      subtotal: computedTotal + totalDiscount,
      discountAmount: totalDiscount,
      orders: prepared.map((p) => ({
        orderId: p.orderId,
        subtotal: p.subtotal,
        discountAmount: p.discountAmount,
        totalPrice: p.totalPrice,
        isDiscounted: p.isDiscounted,
      })),
    });
  } catch (err) {
    console.error("Gagal save bulk ke DB:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get("/api/check-discount/:userId", verifyToken, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (parseInt(userId) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

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

    if (!uid || !email) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }

    const [rows] = await db.query(
      "SELECT * FROM user_northline WHERE email = ?",
      [email],
    );

    let userId;

    if (rows.length === 0) {
      const username = email.split("@")[0].toLowerCase().replace(/\s+/g, "");
      const randomPass = await bcrypt.hash(uid, 10);

      const [result] = await db.query(
        `INSERT INTO user_northline (username, name, email, password, avatar, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [username, name || username, email, randomPass, avatar || "/frontend/public/icons/default.png"],
      );
      userId = result.insertId;
    } else {
      userId = rows[0].id;
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || '';
    await db.query(
      'UPDATE user_northline SET last_login_ip=?, last_login_ua=? WHERE id=?',
      [ip, ua, userId]
    );

    const [[authUser]] = await db.query('SELECT auth_version FROM user_northline WHERE id = ?', [userId]);
    const token = jwt.sign({ id: userId, email, authVersion: authUser?.auth_version || 0 }, JWT_SECRET, { expiresIn: "1d" });

    res.cookie("nl_jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.cookie("logged_in", "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });

    const [userData] = await db.query(
      "SELECT id, username, name, email, phone, avatar FROM user_northline WHERE id = ?",
      [userId],
    );

    res.json({ success: true, user: userData[0] });
  } catch (err) {
    console.error("[Google Login Error]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.delete("/api/cancel-order/:orderId", verifyToken, async (req, res) => {
  const { orderId } = req.params;

  try {
    const [result] = await db.execute(
      "UPDATE transactions SET status = 'cancelled' WHERE order_id = ? AND user_id = ? AND status = 'pending'",
      [orderId, req.user.id],
    );

    if (result.affectedRows > 0) {
      res.json({
        success: true,
        message: "Order dibatalkan.",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Gagal batalkan, mungkin sudah terbayar.",
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

app.get("/api/check-order/:orderId", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM transactions WHERE order_id = ? AND user_id = ?",
      [req.params.orderId, req.user.id],
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

app.get("/api/user-profile/:id", verifyToken, async (req, res) => {
  try {
    if (parseInt(req.params.id) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
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


function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#39;';
    return m;
  });
}

async function computeServerDiscount(userId, voucherId, subtotal, quantity, productCategories) {
  const voucher = voucherId ? voucherHelpers.findVoucher(voucherId) : null;
  if (!voucher) return { discountAmount: 0, voucherLabel: '' };
  if (voucherHelpers.isVoucherExpired(voucher)) return { discountAmount: 0, voucherLabel: voucher.label };
  if (!voucherHelpers.productMatchesCategories(voucher, productCategories)) return { discountAmount: 0, voucherLabel: voucher.label };
  if (voucher.claimRequired && userId) {
    const [claimRows] = await db.execute(
      "SELECT id FROM voucher_claims WHERE user_id = ? AND voucher_code = ? AND status = 'claimed'",
      [userId, voucher.code]
    );
    if (claimRows.length === 0) return { discountAmount: 0, voucherLabel: voucher.label };
  }
  if (voucher.category !== 'general' && userId) {
    let categoryOk = false;
    if (voucher.category === 'northpay') {
      const [[u]] = await db.execute('SELECT northpay_enabled FROM user_northline WHERE id=?', [userId]);
      categoryOk = !!(u && u.northpay_enabled === 1);
    } else if (voucher.category === 'npinjam') {
      const [[p]] = await db.execute('SELECT is_active FROM npinjam_profiles WHERE user_id=?', [userId]);
      categoryOk = !!(p && p.is_active === 1);
    }
    if (!categoryOk) return { discountAmount: 0, voucherLabel: voucher.label };
  }
  return voucherHelpers.computeVoucherDiscount(voucher, subtotal, quantity);
}

async function markVoucherUsed(userId, voucherId, orderId) {
  if (!voucherId || !userId) return;
  const v = voucherHelpers.findVoucher(voucherId);
  if (!v || !v.claimRequired) return;
  try {
    await db.execute(
      "UPDATE voucher_claims SET status = 'used', used_at = NOW(), order_id = ? WHERE user_id = ? AND voucher_code = ? AND status = 'claimed'",
      [orderId || null, userId, v.code]
    );
  } catch (e) {
    console.log('markVoucherUsed skip:', e.message);
  }
}

app.get("/product/:id", (req, res) => {
    const raw = String(req.params.id || "").trim();
    let product = catalogRoutes.findCatalogProduct(raw);

    if (!product) {
        return res.status(404).send("Not Found");
    }

    const code = catalogRoutes.getProductCode(product.id);
    const shareUrl = `https://${req.get("host")}/product/${encodeURIComponent(code)}`;
    const image = product.images && product.images[0] ? product.images[0] : "";

    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="${escapeHtml(shareUrl)}">
<title>${escapeHtml(product.name)} - Northline Indonesia</title>
<meta name="description" content="${escapeHtml(product.name)} - Northline Indonesia. Harga mulai IDR ${escapeHtml((product.priceShort || product.price || 0).toLocaleString("id-ID"))}.">
<meta property="og:title" content="${escapeHtml(product.name)}">
<meta property="og:description" content="Harga mulai IDR ${escapeHtml((product.price || 0).toLocaleString("id-ID"))}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(shareUrl)}">
<meta property="og:type" content="product">

<meta name="twitter:card" content="summary_large_image">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": ${JSON.stringify(product.name)},
  "description": ${JSON.stringify(product.name + " - Produk asli Northline Indonesia, brand fashion lokal UMKM Indonesia.")},
  "image": ${JSON.stringify(image)},
  "url": ${JSON.stringify(shareUrl)},
  "brand": { "@type": "Brand", "name": "Northline Indonesia" },
  "sku": ${JSON.stringify(code)},
  "offers": {
    "@type": "Offer",
    "url": ${JSON.stringify(shareUrl)},
    "priceCurrency": "IDR",
    "price": ${JSON.stringify(String(product.priceShort || product.price || 0))},
    "availability": "https://schema.org/InStock"
  }
}
</script>

<script>
window.location.href='/?product=${escapeHtml(code)}';
</script>

</head>
<body></body>
</html>
    `);
});

app.post("/api/follow-store", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

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

async function adminRoleCheck(req, res, next) {
  try {
    const [users] = await db.execute('SELECT role FROM user_northline WHERE id = ?', [req.user.id]);
    if (users.length === 0 || users[0].role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

app.delete(
    "/api/admin/chat/:userId",
    verifyToken,
    adminRoleCheck,
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

app.post("/api/admin/reply", verifyToken, adminRoleCheck, async (req, res) => {
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

app.post("/api/admin/read/:userId", verifyToken, adminRoleCheck, async (req,res)=>{
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

app.post("/api/admin/typing", verifyToken, adminRoleCheck, (req, res) => {
    const { userId, isTyping } = req.body;
    io.to(`chat_${userId}`).emit("typing", { isTyping });
    res.sendStatus(200);
});

app.post("/api/admin/send", verifyToken, adminRoleCheck, async (req, res) => {
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
                    SELECT DATE_FORMAT(cm.created_at,'%H:%i')
                    FROM chat_messages cm
                    WHERE cm.user_id = u.id
                    ORDER BY cm.id DESC
                    LIMIT 1
                ) AS last_time,

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
        const ext = safeExtensionFromMime(file.mimetype) || ".jpg";
        cb(
            null,
            Date.now() + "-" + Math.round(Math.random() * 1e9) + ext
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
    verifyToken,
    upload.single("image"),
    async (req,res)=>{
        try {
            const { userId } = req.body;
            if (parseInt(userId) !== req.user.id) {
              return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!req.file) {
              return res.status(400).json({ success: false, message: 'File tidak ada' });
            }

            const filePath = path.join(__dirname, "uploads", "chat", req.file.filename);
            if (!detectImageExtFromFile(filePath)) {
              fs.unlink(filePath, () => {});
              return res.status(400).json({ success: false, message: 'File bukan gambar yang valid' });
            }

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

const searchUploadLimiter = isLocalDev ? (req, res, next) => next() : rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti." }
});

app.post(
    "/api/upload-search-image",
    searchUploadLimiter,
    searchUpload.single("image"),
    (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "File tidak ada" });
            }
            const filePath = path.join(__dirname, "uploads", "temp", req.file.filename);
            if (!detectImageExtFromFile(filePath)) {
                fs.unlink(filePath, () => {});
                return res.status(400).json({ success: false, message: "File bukan gambar yang valid" });
            }
            const url = `/uploads/temp/${req.file.filename}`;
            res.json({ success: true, url });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

const authRoutes = require("./routes/auth");
const aiRoutes = require("./routes/ai");
const wishlistRoutes = require("./routes/wishlist");
const voucherRoutes = require("./routes/voucher");
const affiliateRoutes = require("./routes/affiliate");
const reviewRoutes = require("./routes/reviews");

app.use("/api", studentsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", authRoutes);
app.use("/api", aiRoutes);
app.use("/api/auth", aiRoutes);
app.use("/api", sellerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/npinjam", npinjamRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/reviews", reviewRoutes);

const { runAutoPayout } = require("./utils/payout");
runAutoPayout().catch((e) => console.error("Auto payout startup:", e));
setInterval(() => {
  runAutoPayout().catch((e) => console.error("Auto payout interval:", e));
}, 6 * 60 * 60 * 1000);

function cleanupTempUploads() {
  const tempDir = path.join(__dirname, "uploads", "temp");
  fs.readdir(tempDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    const MAX_AGE = 24 * 60 * 60 * 1000;
    files.forEach((f) => {
      fs.stat(path.join(tempDir, f), (statErr, stat) => {
        if (statErr) return;
        if (now - stat.mtimeMs > MAX_AGE) {
          fs.unlink(path.join(tempDir, f), () => {});
        }
      });
    });
  });
}
setInterval(cleanupTempUploads, 6 * 60 * 60 * 1000);
cleanupTempUploads();

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
  res.sendFile(path.join(__dirname, "../frontend", "AppNorthAuth.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.get("/seller/register", (req, res) => {
  res.redirect(301, "/seller/AppNorthSellerRegister");
});

app.get("/seller/dashboard", (req, res) => {
  res.redirect(301, "/seller/AppNorthSellerDashboard");
});

app.get("/seller/pengiriman", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/pesanan", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/produk", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/keuangan", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/pembatalan", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/retur", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/mass-ship", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/pengaturan-pengiriman", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/saldo", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/rekening-bank", (req, res) => {
  res.redirect("/seller/dashboard");
});

app.get("/seller/dashboard/:storeSlug-:code", (req, res) => {
  res.redirect(301, `/seller/AppNorthSellerDashboard/${req.params.storeSlug}-${req.params.code}`);
});

app.get("/seller/AppNorthSellerDashboard/:storeSlug-:code", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/public/seller/AppNorthSellerDashboard.html"));
});

app.get("/*", (req, res, next) => {
  let reqPath = req.path;

  if (reqPath.startsWith("/api")) return next();

  const legacy = LEGACY_PAGE_MAP[reqPath];
  if (legacy) return res.redirect(301, legacy);

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
