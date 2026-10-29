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
const crypto = require("crypto");
const net = require("net");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./config/db");
const { stopCopilotClient } = require("./services/copilotAiClient");
const { safeExtensionFromMime, detectImageExtFromFile } = require("./utils/uploadValidation");
const {
  parseOrderQuantity,
  validateShippingCustomer,
  validateCatalogOptions,
} = require("./utils/orderValidation");

function getGuestOrderIp(req) {
  const ip = req.ip || req.connection?.remoteAddress || "";
  const normalizedIp = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return net.isIP(normalizedIp) ? normalizedIp : null;
}

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

function verifyTokenIfPresent(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(" ")[1] : getCookie(req, "nl_jwt");
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const authData = jwt.verify(token, JWT_SECRET);
    db.execute('SELECT auth_version FROM user_northline WHERE id = ?', [authData.id])
      .then(([[user]]) => {
        if (!user || (authData.authVersion || 0) !== user.auth_version) {
          return res.status(401).json({ success: false, message: "Sesi berakhir, silakan login ulang" });
        }
        req.user = authData;
        next();
      })
      .catch((err) => {
        console.error("Gagal memvalidasi sesi order:", err);
        res.status(500).json({ success: false, message: "Gagal memvalidasi sesi" });
      });
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

function orderCsrfIfAuthenticated(req, res, next) {
  if (!req.user) return next();
  return csrfProtection(req, res, next);
}

async function resolveOrderCustomer(req) {
  let profile = {};
  if (req.user) {
    try {
      const [rows] = await db.execute(
        'SELECT name, phone, address FROM user_northline WHERE id = ?',
        [req.user.id],
      );
      profile = rows[0] || {};
    } catch (err) {
      console.error("Gagal memuat profil penerima order:", err);
      return { serverError: true };
    }
  }

  const body = req.body || {};
  const chooseValue = (key, profileValue) => (
    Object.prototype.hasOwnProperty.call(body, key) && typeof body[key] === "string"
      ? body[key].trim()
      : String(profileValue || "").trim()
  );
  const name = chooseValue("shippingName", profile.name);
  const phone = chooseValue("shippingPhone", profile.phone);
  const address = chooseValue("shippingAddress", profile.address);
  const validationError = validateShippingCustomer({ name, phone, address });
  if (validationError) return { error: validationError };
  return { name, phone, address };
}

const bcrypt = require("bcrypt");
const sellerRoutes = require("./routes/seller");
const productRoutes = require("./routes/productRoutes");
const productReportRoutes = require("./routes/productReports");
const catalogRoutes = require("./routes/catalog");
const studentsRoutes = require("./routes/students");
const adminRoutes = require("./routes/admin");
const npinjamRoutes = require("./routes/npinjam");
const mysqlManagerRoutes = require("./routes/mysqlManager");
const adminLogsRoutes = require("./routes/adminLogs");
const adminDomainRoutes = require("./routes/adminDomain");
const adminFileManagerRoutes = require("./routes/adminFileManager");
const adminTechStackRoutes = require("./routes/adminTechStack");
const adminSecurityRoutes = require("./routes/adminSecurity");
const adminDomainManagerRoutes = require("./routes/adminDomainManager");
const adminNpinjamScannerRoutes = require("./routes/adminNpinjamScanner");
const requestLogger = require("./middleware/requestLogger");
const { startLogCleanupCron } = require("./cron/logCleanup");
const voucherHelpers = require("./voucher");
const shippingModule = { exports: {} };
const shippingSource = fs.readFileSync(path.join(__dirname, "../frontend/java/AppNorthShipping.js"), "utf8");
new Function("module", "exports", "self", shippingSource)(shippingModule, shippingModule.exports, undefined);
const shippingHelper = shippingModule.exports;
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
require("./config/io").setIO(io);

const redisReconnectStrategy = (retries) => Math.min(1000 + retries * 2000, 60000);
const redisConnectOptions = {
  socket: {
    host: process.env.REDIS_HOST || '::1',
    port: Number(process.env.REDIS_PORT) || 6379,
    reconnectStrategy: redisReconnectStrategy,
  },
  password: process.env.REDIS_PASSWORD || 'Ue7f5kQz2TbN9mXw4RvY8HsC3LgP6JdA',
};
try {
  const pubClient = createClient(redisConnectOptions);
  const subClient = pubClient.duplicate();
  const redisErrorHandler = (label) => (err) => console.warn(`[Socket.IO Redis ${label}] ${err.message}`);
  pubClient.on('error', redisErrorHandler('pub'));
  pubClient.on('end', () => console.warn('[Socket.IO Redis pub] Koneksi terputus, mencoba reconnect otomatis'));
  subClient.on('error', redisErrorHandler('sub'));
  subClient.on('end', () => console.warn('[Socket.IO Redis sub] Koneksi terputus, mencoba reconnect otomatis'));
  pubClient.connect().catch((e) => console.warn('[Socket.IO Redis pub] Connect failed:', e.message));
  subClient.connect().catch((e) => console.warn('[Socket.IO Redis sub] Connect failed:', e.message));
  io.adapter(createAdapter(pubClient, subClient));
  console.log('[Socket.IO] Redis adapter aktif (load-balanced broadcast)');
} catch (e) {
  console.warn('[Socket.IO] Redis adapter gagal diinisialisasi:', e.message);
}

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
      if (process.env.APP_ORIGIN) {
        allowedOrigins.push(...String(process.env.APP_ORIGIN).split(',').map((s) => s.trim()).filter(Boolean));
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Loopback dengan port apa pun tetap boleh. Server ini listens di IPv6
      // loopback (log startup Cetak "[::1]"), sementara Allowlist di atas hanya
      // memuat localhost/127.0.0.1 port 9000. Akibatnya POST dari
      // http://[::1]:9000 - yang sah untuk dev lokal - ditolak CORS dan
      // menjadi 500 untuk semua request yang mengubah state. Hanya host
      // loopback yang diloloskan, jadi ini tidak memperluas akses dari
      // jaringan.
      let loopback = false;
      try {
        const h = new URL(origin).hostname;
        loopback = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
      } catch (e) { /* origin tidak valid -> tolak di bawah */ }
      if (loopback && /^https?:$/.test(new URL(origin).protocol)) {
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
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.tailwindcss.com", "unpkg.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "img.icons8.com", "https://www.gstatic.com", "https://apis.google.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net", "unpkg.com"],
        // blob: wajib untuk pratinjau upload. Tanpa ini CSP memblokir
        // <img src="blob:..."> sehingga preview KTP/KK tidak pernah tampil
        // (error "Loading the image 'blob:...' violates ... img-src").
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
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
app.use(requestLogger);

function forbiddenPage(code, title, desc) {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${code} | Northline</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;font-family:'DM Sans',-apple-system,sans-serif}.wrap{text-align:center;padding:40px}.code{font-size:96px;font-weight:700;color:#DF414F;line-height:1}.title{font-size:18px;font-weight:600;color:#111;margin:16px 0 8px}.desc{font-size:13px;color:#6b7280;line-height:1.6}</style></head><body><div class="wrap"><div class="code">${code}</div><div class="title">${title}</div><div class="desc">${desc}</div></div></body></html>`;
}

// Block admin panel, auth admin, DB manager, and domain manager from public access
app.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const normalizedIp = ip.replace('::ffff:', '');
  const isLocalhost = normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp === '';

  const adminPages = ['/AppNorthAdmin', '/AppNorthAuthAdmin', '/AppNorthDbManager'];
  const adminApiPaths = ['/api/admin/login', '/api/admin/dashboard', '/api/admin/orders',
    '/api/admin/users', '/api/admin/products', '/api/admin/reviews', '/api/admin/sellers',
    '/api/admin/settings', '/api/admin/database', '/api/admin/notifications', '/api/admin/whatsapp',
    '/api/admin/reports', '/api/admin/northpay', '/api/admin/affiliate', '/api/admin/npinjam',
    '/api/admin/seller-earnings', '/api/admin/flash-discount', '/api/admin/ai-models',
    '/api/admin/domain', '/api/admin/filemanager', '/api/admin/techstack', '/api/admin/security',
    '/api/admin/domain-manager', '/api/admin/product-reports'];

  const isPage = adminPages.some(p => req.path === p || req.path === p + '.html');
  const isApi = adminApiPaths.some(p => req.path.startsWith(p));
  const isStaticAdmin = req.path.startsWith('/java/AppNorthAdmin') || req.path.startsWith('/java/AppNorthAuth');

  if ((isPage || isApi || isStaticAdmin) && !isLocalhost) {
    if (isApi) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.status(403).setHeader('Cache-Control', 'no-store');
    return res.send(forbiddenPage(403, 'Forbidden', 'Anda tidak memiliki akses ke halaman ini.'));
  }
  next();
});

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
    res.status(403).setHeader('Cache-Control', 'no-store');
    return res.send(forbiddenPage(403, 'Forbidden', 'Akses ditolak.'));
  }
  const isApi = req.path.startsWith('/api/');
  res.setHeader('X-Robots-Tag', isApi ? 'noai, noarchive, noindex, nofollow' : 'noai, noarchive, notranslate');
  next();
});

const isLocalDev = process.env.NODE_ENV !== 'production';
const STATIC_CACHE_MAX_AGE = isLocalDev ? 0 : 7 * 24 * 60 * 60;
const STATIC_CACHE_MAX_AGE_IMMUTABLE = isLocalDev ? 0 : 365 * 24 * 60 * 60;

app.get("/health/live", (req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) });
});

app.get("/health/ready", async (req, res) => {
  try {
    await db.execute("SELECT 1");
    return res.json({ status: "ready", checks: { database: "ok" } });
  } catch (err) {
    console.error("[Health] Database readiness check failed:", err.message);
    return res.status(503).json({ status: "not_ready", checks: { database: "unavailable" } });
  }
});

// Diskon pembeli pertama di checkout biasa (bukan affiliate).
// Hanya 10 pembeli pertama yang mendapatkan, Afterwards 0.
const FIRST_BUYER_DISCOUNT_RATE = 0.005; // 0,5%
const FIRST_BUYER_QUOTA = 10;

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

const PUBLIC_DOMAINS = ['nl.hostinesia.my.id'];
const ADMIN_PATHS = ['/AppNorthAdmin', '/AppNorthAuthAdmin', '/nrtAdminPanel', '/AppNorthAdmin.html', '/AppNorthAuthAdmin.html', '/AppNorthDbManager', '/AppNorthDbManager.html'];

function isPublicDomain(host) {
  if (!host) return false;
  const h = host.split(':')[0].toLowerCase().replace(/^www\./, '');
  return PUBLIC_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

app.use((req, res, next) => {
  if (isPublicDomain(req.headers.host) && ADMIN_PATHS.includes(req.path)) {
    res.status(403).setHeader('Cache-Control', 'no-store');
    return res.send(forbiddenPage(403, 'Forbidden', 'Anda tidak memiliki akses ke halaman ini.'));
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

process.env.WHATSAPP_WORKER !== '0'
    ? (() => {
        const wa = require("./config/whatsapp");
        const executablePath = getBrowserExecutable();
        if (!executablePath) {
          console.warn("[WARNING] No browser executable found. WhatsApp client disabled.");
          return;
        }
        console.log(`[WhatsApp] Selected browser executable: ${executablePath}`);
        try {
          wa.makeClient({ executablePath });
        } catch (err) {
          console.error("[WARNING] Failed to instantiate WhatsApp client:", err.message || err);
        }
      })()
    : console.log("[WhatsApp] Worker ini tidak menjalankan WhatsApp client (WHATSAPP_WORKER=0).");

app.use((req, res, next) => {
  const wa = require("./config/whatsapp");
  req.whatsappClient = (wa && wa.getClient()) || null;
  // req.whatsappClient itu snapshot per-request, jadi bisa null padahal client
  // sedang restart. Route yang kirim pesan ke user harus pakai ini supaya
  // menunggu sampai WA benar-benar siap.
  req.waitWaClient = (ms) =>
    wa && typeof wa.waitForReady === "function" ? wa.waitForReady(ms) : Promise.resolve(req.whatsappClient);
  next();
});

app.post("/api/save-order", verifyTokenIfPresent, orderCsrfIfAuthenticated, strictLimiter, async (req, res) => {
  const body = req.body || {};
  const {
    productId,
    totalPrice: clientTotalPrice,
    quantity,
    chosenColor = '',
    chosenSize = '',
    chosenModel = '',
    chosenSizeGroup = '',
    orderId,
    paymentMethod,
  } = body;

  const userId = req.user ? req.user.id : null;

  if (typeof orderId !== "string" || !orderId.trim() || orderId !== orderId.trim() || orderId.length > 50 || !productId) {
    return res.status(400).json({
      success: false,
      message: "Data pesanan tidak lengkap!",
    });
  }
  const sanitizedOrderId = orderId.replace(/[<>\"'&]/g, '');
  if (sanitizedOrderId !== orderId) {
    return res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
  }

  const productCode = typeof body.code === "string" ? body.code.trim() : "";
  const catalogProduct = catalogRoutes.findCatalogProduct(productCode || productId);

  if (!catalogProduct) {
    return res.status(400).json({
      success: false,
      message: "Produk tidak ditemukan",
    });
  }

  const productIdNum = catalogProduct.id;
  const customer = await resolveOrderCustomer(req);
  if (customer.serverError) {
    return res.status(500).json({ success: false, message: "Gagal memuat data penerima" });
  }
  if (customer.error) {
    return res.status(400).json({ success: false, message: customer.error });
  }
  if (paymentMethod && !["qris", "northpay"].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: "Metode pembayaran tidak valid" });
  }
  if (paymentMethod === "northpay" && !userId) {
    return res.status(401).json({ success: false, message: "Login diperlukan untuk menggunakan NorthPay" });
  }
  const orderStatus = paymentMethod === "northpay" ? "success" : "pending";
  const guestIpAddress = userId ? null : getGuestOrderIp(req);
  const guestOrderToken = userId ? null : crypto.randomBytes(32).toString("hex");
  const guestOrderTokenHash = guestOrderToken
    ? crypto.createHash("sha256").update(guestOrderToken).digest("hex")
    : null;

  const quantityNum = parseOrderQuantity(quantity);
  if (quantityNum === null) {
    return res.status(400).json({ success: false, message: "Jumlah produk harus antara 1 dan 99" });
  }
  const optionError = validateCatalogOptions(catalogProduct, {
    color: chosenColor,
    size: chosenSize,
    model: chosenModel,
    sizeGroup: chosenSizeGroup,
  });
  if (optionError) return res.status(400).json({ success: false, message: optionError });
  const unitPrice = await catalogRoutes.computeUnitPriceWithFlash(catalogProduct, chosenModel, chosenSize, chosenSizeGroup);
  const computedSubtotal = unitPrice * quantityNum;

  const requestedVoucherId = typeof req.body.voucherId === "string" ? req.body.voucherId.trim() : "";
  if (!userId && requestedVoucherId && requestedVoucherId !== "free_shipping") {
    return res.status(401).json({ success: false, message: "Login diperlukan untuk menggunakan voucher akun" });
  }
  const voucherId = (userId || requestedVoucherId === "free_shipping") ? requestedVoucherId : "";
  const voucherMeta = voucherId ? voucherHelpers.findVoucher(voucherId) : null;
  const voucherDiscount = userId
    ? await computeServerDiscount(userId, voucherId, computedSubtotal, quantityNum, catalogRoutes.getCategories(catalogProduct))
    : { discountAmount: 0, voucherLabel: '' };

  let isDiscounted = voucherDiscount.discountAmount > 0;
  let discountAmount = voucherDiscount.discountAmount;

  if (userId && !isDiscounted && !(voucherMeta && voucherMeta.claimRequired)) {
    try {
      const [userPromo] = await db.execute(
        'SELECT id FROM transactions WHERE user_id = ? AND is_discounted = 1 AND status != \'cancelled\' LIMIT 1',
        [userId]
      );
      if (userPromo.length === 0) {
        const [quota] = await db.execute(
          'SELECT COUNT(DISTINCT user_id) AS total FROM transactions WHERE is_discounted = 1 AND status != \'cancelled\''
        );
        if (quota[0].total < FIRST_BUYER_QUOTA) {
          isDiscounted = true;
          discountAmount = Math.round(computedSubtotal * FIRST_BUYER_DISCOUNT_RATE);
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
  let totalPrice = computedTotalPrice;
  const sanitize = (str) => String(str || '').replace(/[<>\"'&]/g, '').trim().slice(0, 255);
  
  const sanitizedProductName = sanitize(catalogProduct.name);
  const sanitizedProductImage = sanitize(catalogProduct.images?.[0] || '');
  const sanitizedChosenColor = sanitize(chosenColor);
  const sanitizedChosenSize = sanitize(chosenSize);
  const sanitizedChosenModel = sanitize(chosenModel);

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

  const shippingAddress = customer.address;

  const shippingQuote = shippingHelper.getQuote(shippingAddress);
  if (!shippingQuote.canShip) {
    return res.status(400).json({
      success: false,
      message: shippingQuote.reason || "Pengiriman ke luar Indonesia belum tersedia",
    });
  }
  let shippingFee = shippingQuote.fee;
  if (voucherId === 'free_shipping' && shippingQuote.zone === 'karawang') {
    shippingFee = 0;
  }
  totalPrice = computedTotalPrice + shippingFee;

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
                payment_method, shipping_address, shipping_name, shipping_phone, shipping_cost, affiliate_user_id,
                guest_access_token_hash, guest_ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            sanitizedOrderId, userId, productIdNum, sanitizedProductName, sanitizedProductImage,
            sanitizedChosenColor, sanitizedChosenSize, sanitizedChosenModel, quantityNum, subtotal,
            discountAmount, totalPrice, 'success', isDiscounted ? 1 : 0,
            'northpay', shippingAddress, customer.name, customer.phone, shippingFee, affiliateUserId, guestOrderTokenHash, guestIpAddress,
        ];
        await conn.execute(sql, values);

        await conn.execute(
          'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
          [userId, 'Pembayaran Berhasil',
           'Pembayaran ' + catalogProduct.name + ' sebesar Rp ' + parseInt(totalPrice).toLocaleString('id-ID') + ' berhasil via NorthPay.']
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
          shippingFee,
          isDiscounted,
          guestOrderToken,
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
            payment_method, shipping_address, shipping_name, shipping_phone, shipping_cost, affiliate_user_id,
            guest_access_token_hash, guest_ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    const values = [
      sanitizedOrderId, userId, productIdNum, sanitizedProductName, sanitizedProductImage,
      sanitizedChosenColor, sanitizedChosenSize, sanitizedChosenModel, quantityNum, subtotal,
      discountAmount, totalPrice, orderStatus, isDiscounted ? 1 : 0,
      paymentMethod || 'qris', shippingAddress, customer.name, customer.phone, shippingFee, affiliateUserId, guestOrderTokenHash, guestIpAddress,
    ];

    await db.query(sql, values);

    await markVoucherUsed(userId, voucherId, orderId);

    res.json({
      success: true,
      orderId,
      totalPrice,
      subtotal,
      discountAmount,
      shippingFee,
      isDiscounted,
      guestOrderToken,
    });
  } catch (err) {
    console.error("Gagal save ke DB:", err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: "ID pesanan sudah digunakan. Muat ulang checkout dan coba lagi." });
    }
    res.status(500).json({
      success: false,
      message: "Pesanan gagal disimpan. Silakan coba lagi.",
    });
  }
});

app.post("/api/save-order/bulk", verifyTokenIfPresent, orderCsrfIfAuthenticated, strictLimiter, async (req, res) => {
  const body = req.body || {};
  const { items, totalPrice: clientTotalPrice, paymentMethod } = body;
  const userId = req.user ? req.user.id : null;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Data pesanan tidak lengkap!" });
  }
  if (items.length > 20) {
    return res.status(400).json({ success: false, message: "Terlalu banyak item dalam satu checkout" });
  }
  if (!items.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    return res.status(400).json({ success: false, message: "Data produk dalam checkout tidak valid" });
  }
  const customer = await resolveOrderCustomer(req);
  if (customer.serverError) {
    return res.status(500).json({ success: false, message: "Gagal memuat data penerima" });
  }
  if (customer.error) {
    return res.status(400).json({ success: false, message: customer.error });
  }
  if (paymentMethod && !["qris", "northpay"].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: "Metode pembayaran tidak valid" });
  }
  if (paymentMethod === "northpay" && !userId) {
    return res.status(401).json({ success: false, message: "Login diperlukan untuk menggunakan NorthPay" });
  }
  const orderStatus = paymentMethod === "northpay" ? "success" : "pending";
  const guestIpAddress = userId ? null : getGuestOrderIp(req);
  const guestOrderToken = userId ? null : crypto.randomBytes(32).toString("hex");
  const guestOrderTokenHash = guestOrderToken
    ? crypto.createHash("sha256").update(guestOrderToken).digest("hex")
    : null;
  const sanitize = (str) => String(str || '').replace(/[<>\"'&]/g, '').trim().slice(0, 255);
  const requestedVoucherId = typeof req.body.voucherId === "string" ? req.body.voucherId.trim() : "";
  if (!userId && requestedVoucherId && requestedVoucherId !== "free_shipping") {
    return res.status(401).json({ success: false, message: "Login diperlukan untuk menggunakan voucher akun" });
  }
  const voucherId = (userId || requestedVoucherId === "free_shipping") ? requestedVoucherId : "";
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

  const shippingAddress = customer.address;

  const shippingQuote = shippingHelper.getQuote(shippingAddress);
  if (!shippingQuote.canShip) {
    return res.status(400).json({
      success: false,
      message: shippingQuote.reason || "Pengiriman ke luar Indonesia belum tersedia",
    });
  }
  let shippingFee = shippingQuote.fee;
  const bulkVoucherId = typeof voucherId === 'string' ? voucherId : '';

  const prepared = [];
  const seenOrderIds = new Set();
  let computedTotal = 0;
  let totalDiscount = 0;
  let userUsedPromo = false;

  const preCheckProductIds = items.map(it => {
    const cp = catalogRoutes.findCatalogProduct(typeof it.code === 'string' ? it.code.trim() : '' || it.productId);
    return cp ? cp.id : null;
  }).filter(Boolean);
  const willBeCombo = preCheckProductIds.length === 2 && preCheckProductIds.includes(13) && preCheckProductIds.includes(37);

  if (!willBeCombo && bulkVoucherId === 'free_shipping' && shippingQuote.zone === 'karawang') {
    shippingFee = 0;
  }

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return res.status(400).json({ success: false, message: "Data produk dalam checkout tidak valid" });
    }
    const orderId = typeof item?.orderId === 'string' ? item.orderId.trim() : '';
    const productCode = typeof item.code === 'string' ? item.code.trim() : "";
    const catalogProduct = catalogRoutes.findCatalogProduct(productCode || item.productId);

    if (!catalogProduct || !orderId || orderId.length > 50 || sanitize(orderId) !== orderId || seenOrderIds.has(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Produk tidak ditemukan atau ID pesanan tidak valid/duplikat",
      });
    }
    seenOrderIds.add(orderId);

    const quantityNum = parseOrderQuantity(item.quantity);
    if (quantityNum === null) {
      return res.status(400).json({ success: false, message: "Jumlah setiap produk harus antara 1 dan 99" });
    }
    const optionError = validateCatalogOptions(catalogProduct, {
      color: item.chosenColor,
      size: item.chosenSize,
      model: item.chosenModel,
      sizeGroup: item.chosenSizeGroup,
    });
    if (optionError) return res.status(400).json({ success: false, message: optionError });
    const unitPrice = await catalogRoutes.computeUnitPriceWithFlash(catalogProduct, item.chosenModel || '', item.chosenSize || '', item.chosenSizeGroup || '');
    const computedSubtotal = unitPrice * quantityNum;

    let voucherDiscount = { discountAmount: 0, voucherLabel: '' };
    if (userId && !willBeCombo) {
      voucherDiscount = await computeServerDiscount(userId, voucherId, computedSubtotal, quantityNum, catalogRoutes.getCategories(catalogProduct));
    }
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

    if (userId && !isDiscounted && !userUsedPromo && !(voucherMeta && voucherMeta.claimRequired)) {
      try {
        const [userPromo] = await db.execute(
          'SELECT id FROM transactions WHERE user_id = ? AND is_discounted = 1 AND status != \'cancelled\' LIMIT 1',
          [userId]
        );
        if (userPromo.length === 0) {
          const [quota] = await db.execute(
            'SELECT COUNT(DISTINCT user_id) AS total FROM transactions WHERE is_discounted = 1 AND status != \'cancelled\''
          );
          if (quota[0].total < FIRST_BUYER_QUOTA) {
            isDiscounted = true;
            discountAmount = Math.round(computedSubtotal * FIRST_BUYER_DISCOUNT_RATE);
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
      productName: sanitize(catalogProduct.name),
      productImage: sanitize(catalogProduct.images?.[0] || ''),
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

  const checkedProductIds = prepared.map(p => p.productIdNum);
  const isComboPromo = userId ? await isComboPromoEligible(userId, checkedProductIds) : false;

  let comboDiscount = 0;
  if (isComboPromo) {
    comboDiscount = computedTotal - COMBO_PROMO_PRICE;
    if (comboDiscount < 0) comboDiscount = 0;
  }

  const clientTotal = parseInt(clientTotalPrice);
  const finalComputedTotal = isComboPromo ? COMBO_PROMO_PRICE : computedTotal;
  if (Number.isFinite(clientTotal) && clientTotal < finalComputedTotal) {
    return res.status(400).json({
      success: false,
      message: "Total harga tidak valid",
    });
  }

  const totalPaid = finalComputedTotal + shippingFee;
  if (prepared.length > 0) {
    prepared[0].totalPrice += shippingFee;
    prepared[0].shipping_cost = shippingFee;
  }
  for (const p of prepared) {
    if (p.shipping_cost === undefined) p.shipping_cost = 0;
  }

  if (isComboPromo) {
    const totalSubAll = prepared.reduce((a, p) => a + p.subtotal, 0);
    const ratio = totalSubAll > 0 ? COMBO_PROMO_PRICE / totalSubAll : 0.5;
    let allocated = 0;
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i];
      const share = i === prepared.length - 1
        ? COMBO_PROMO_PRICE - allocated
        : Math.round(p.subtotal * ratio);
      p.discountAmount = p.subtotal - share;
      p.totalPrice = share;
      p.isDiscounted = 1;
      allocated += share;
    }
    totalDiscount = comboDiscount;
  }

  const insertQris = async () => {
    const sql = `
      INSERT INTO transactions (
          order_id, user_id, product_id, product_name, product_image,
          chosen_color, chosen_size, chosen_model, quantity, subtotal,
          discount_amount, total_price, status, is_discounted,
          payment_method, shipping_address, shipping_name, shipping_phone, shipping_cost, affiliate_user_id,
          guest_access_token_hash, guest_ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const p of prepared) {
        await conn.execute(sql, [
          p.orderId, userId, p.productIdNum, p.productName, p.productImage,
          p.chosenColor, p.chosenSize, p.chosenModel, p.quantity, p.subtotal,
          p.discountAmount, p.totalPrice, orderStatus, p.isDiscounted,
          paymentMethod || 'qris', shippingAddress, customer.name, customer.phone, p.shipping_cost, affiliateUserId, guestOrderTokenHash, guestIpAddress,
        ]);
      }
      await conn.commit();
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Gagal rollback checkout bulk:", rollbackError);
      }
      throw error;
    } finally {
      conn.release();
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

        if (balance < totalPaid) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            success: false,
            message: "Saldo NorthPay tidak mencukupi",
          });
        }

        await conn.execute(
          'UPDATE user_northline SET northpay_balance = northpay_balance - ? WHERE id=?',
          [totalPaid, userId]
        );

        const sql = `
          INSERT INTO transactions (
              order_id, user_id, product_id, product_name, product_image,
              chosen_color, chosen_size, chosen_model, quantity, subtotal,
              discount_amount, total_price, status, is_discounted,
              payment_method, shipping_address, shipping_name, shipping_phone, shipping_cost, affiliate_user_id,
              guest_access_token_hash, guest_ip_address
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        for (const p of prepared) {
          await conn.execute(sql, [
            p.orderId, userId, p.productIdNum, p.productName, p.productImage,
            p.chosenColor, p.chosenSize, p.chosenModel, p.quantity, p.subtotal,
            p.discountAmount, p.totalPrice, 'success', p.isDiscounted,
            'northpay', shippingAddress, customer.name, customer.phone, p.shipping_cost, affiliateUserId, guestOrderTokenHash, guestIpAddress,
          ]);
        }

        await conn.execute(
          'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
          [userId, 'Pembayaran Berhasil',
           'Pembayaran ' + prepared.length + ' produk sebesar Rp ' + parseInt(totalPaid).toLocaleString('id-ID') + ' berhasil via NorthPay.']
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
          totalPrice: totalPaid,
          subtotal: computedTotal + totalDiscount,
          discountAmount: totalDiscount,
          shippingFee,
          guestOrderToken,
          isComboPromo,
          orders: prepared.map((p) => ({
            orderId: p.orderId,
            subtotal: p.subtotal,
            discountAmount: p.discountAmount,
            totalPrice: p.totalPrice,
            shipping_cost: p.shipping_cost,
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
      totalPrice: totalPaid,
      subtotal: computedTotal + totalDiscount,
      discountAmount: totalDiscount,
      shippingFee,
      isComboPromo,
      orders: prepared.map((p) => ({
        orderId: p.orderId,
        subtotal: p.subtotal,
        discountAmount: p.discountAmount,
        totalPrice: p.totalPrice,
        shipping_cost: p.shipping_cost,
        isDiscounted: p.isDiscounted,
      })),
    });
  } catch (err) {
    console.error("Gagal save bulk ke DB:", err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: "Salah satu ID pesanan sudah digunakan. Muat ulang checkout dan coba lagi." });
    }
    res.status(500).json({
      success: false,
      message: "Pesanan gagal disimpan. Silakan coba lagi.",
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

    const isSecure = process.env.NODE_ENV === "production";
    const cookieBase = { httpOnly: true, secure: isSecure, sameSite: "lax", path: "/", maxAge: 24 * 60 * 60 * 1000 };
    res.cookie("nl_jwt", token, cookieBase);
    res.cookie("logged_in", "1", { ...cookieBase, httpOnly: false });

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

app.delete("/api/cancel-order/:orderId", verifyTokenIfPresent, async (req, res) => {
  const { orderId } = req.params;

  try {
    let result;
    if (req.user) {
      [result] = await db.execute(
        "UPDATE transactions SET status = 'cancelled' WHERE order_id = ? AND user_id = ? AND status = 'pending'",
        [orderId, req.user.id],
      );
    } else {
      const guestToken = req.headers['x-guest-order-token'];
      if (typeof guestToken !== 'string' || !/^[a-f0-9]{64}$/i.test(guestToken)) {
        return res.status(401).json({ success: false, message: "Token pesanan guest tidak valid" });
      }
      const guestTokenHash = crypto.createHash("sha256").update(guestToken).digest("hex");
      [result] = await db.execute(
        "UPDATE transactions SET status = 'cancelled' WHERE order_id = ? AND user_id IS NULL AND guest_access_token_hash = ? AND status = 'pending'",
        [orderId, guestTokenHash],
      );
    }

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

app.get("/api/check-order/:orderId", verifyTokenIfPresent, async (req, res) => {
  try {
    let rows;
    if (req.user) {
      [rows] = await db.query(
        "SELECT * FROM transactions WHERE order_id = ? AND user_id = ?",
        [req.params.orderId, req.user.id],
      );
    } else {
      const guestToken = req.headers['x-guest-order-token'];
      if (typeof guestToken !== 'string' || !/^[a-f0-9]{64}$/i.test(guestToken)) {
        return res.status(401).json({ success: false, status: "unauthorized", isPaid: false });
      }
      const guestTokenHash = crypto.createHash("sha256").update(guestToken).digest("hex");
      [rows] = await db.query(
        "SELECT * FROM transactions WHERE order_id = ? AND user_id IS NULL AND guest_access_token_hash = ?",
        [req.params.orderId, guestTokenHash],
      );
    }
    if (rows.length === 0) {
      return res.json({
        success: false,
        status: "not_found",
        isPaid: false,
      });
    }
    delete rows[0].guest_access_token_hash;
    delete rows[0].guest_ip_address;
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

app.get("/api/shipping/quote", verifyTokenIfPresent, async (req, res) => {
  try {
    let address = typeof req.query.address === "string" ? req.query.address.trim() : "";
    if (address.length > 2000) {
      return res.status(400).json({ success: false, canShip: false, reason: "Alamat pengiriman terlalu panjang", fee: 0, label: "", zone: null });
    }
    if (!address && req.user) {
      const [rows] = await db.query(
        "SELECT address FROM user_northline WHERE id = ?",
        [req.user.id],
      );
      address = rows[0]?.address || "";
    }
    if (!address) {
      return res.status(400).json({ success: false, canShip: false, reason: "Alamat pengiriman wajib diisi", fee: 0, label: "", zone: null });
    }
    const quote = shippingHelper.getQuote(address);
    res.json({ success: quote.success, ...quote, address });
  } catch (err) {
    console.error("Shipping quote error:", err.message);
    res.status(500).json({ success: false, canShip: false, reason: "Gagal menghitung ongkir", fee: 0, label: "", zone: null });
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

const COMBO_PROMO_PRODUCT_IDS = [13, 37];
const COMBO_PROMO_PRICE = 200000;

async function isComboPromoEligible(userId, productIds) {
  if (productIds.length !== 2) return false;
  if (!productIds.includes(13) || !productIds.includes(37)) return false;

  try {
    const [rows] = await db.execute(
      "SELECT DISTINCT product_id FROM transactions WHERE user_id = ? AND product_id IN (?, ?) AND status != 'cancelled'",
      [userId, 13, 37]
    );
    return rows.length < 2;
  } catch (e) {
    console.log('isComboPromoEligible error:', e.message);
    return false;
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
    const targetUserId = Number(userId);
    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: "ID pengguna tidak valid." });
    }
    if (Number(req.user.id) !== targetUserId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Anda tidak memiliki akses ke chat ini." });
    }

    const finalMessage =
        typeof message === "object"
            ? JSON.stringify(message)
            : message;

    const [insertResult] = await db.query(
        `
        INSERT INTO chat_messages (user_id, sender, type, message)
        VALUES (?, ?, ?, ?)
        `,
        [
            targetUserId,
            sender,
            type || "text",
            finalMessage
        ]
    );

    const msgData = {
        userId: targetUserId,
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

    res.json({ success: true, id: insertResult.insertId });
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
                caption,
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
            if (m.type === "product" || m.type === "shipping") {
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

app.delete("/api/chat/clear/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const requestedUserId = Number(userId);
        if (!Number.isSafeInteger(requestedUserId) || requestedUserId <= 0) {
            return res.status(400).json({ success: false, message: "ID pengguna tidak valid." });
        }
        if (Number(req.user.id) !== requestedUserId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Anda tidak memiliki akses untuk menghapus chat ini." });
        }
        await db.query("DELETE FROM chat_messages WHERE user_id = ?", [requestedUserId]);
        io.to(`chat_${requestedUserId}`).emit("chat_deleted");
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Chat gagal dihapus. Silakan coba lagi." });
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
        success: true,
        imageUrl
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
        cb(null, path.join(__dirname, "uploads", "chat"));
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
    (req, res, next) => {
        upload.single("image")(req, res, (err) => {
            if (err) {
                const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
                return res.status(status).json({ success: false, message: err.message });
            }
            next();
        });
    },
    async (req,res)=>{
        try {
            const { userId } = req.body;
            const caption = typeof req.body.caption === "string" ? req.body.caption.trim().slice(0, 1000) : "";
            if (parseInt(userId, 10) !== req.user.id) {
              if (req.file) fs.unlink(req.file.path, () => {});
              return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!req.file) {
              return res.status(400).json({ success: false, message: 'File tidak ada' });
            }

            const filePath = path.join(__dirname, "uploads", "chat", req.file.filename);
            if (!detectImageExtFromFile(filePath)) {
              fs.unlink(req.file.path, () => {});
              return res.status(400).json({ success: false, message: 'File bukan gambar yang valid' });
            }

            const imageUrl =
                `/uploads/chat/${req.file.filename}`;

            const [imageResult] = await db.query(
                `
                INSERT INTO chat_messages
                (
                    user_id,
                    sender,
                    type,
                    message,
                    caption
                )
                VALUES
                (?, 'user', 'image', ?, ?)
                `,
                [
                    userId,
                    imageUrl,
                    caption || null
                ]
            );

            const data = {
                id: imageResult.insertId,
                userId,
                sender:"user",
                type:"image",
                message:imageUrl,
                caption,
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
                success: true,
                imageUrl,
                caption,
                imageId: imageResult.insertId,
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
app.use("/api", productReportRoutes);
// NPinjam Scanner dimount sebelum /api/admin agar tidak tertangkap router
// admin yang sudah punya banyak rute /npinjam/* lain.
app.use("/api/admin/npinjam", adminNpinjamScannerRoutes);
app.use("/api/admin/domain", adminDomainRoutes);
app.use("/api/admin/filemanager", adminFileManagerRoutes);
app.use("/api/admin/techstack", adminTechStackRoutes);
app.use("/api/admin/security", adminSecurityRoutes);
app.use("/api/admin/domain-manager", adminDomainManagerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminLogsRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/npinjam", npinjamRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/mysql-manager", mysqlManagerRoutes);

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
  const aff = typeof req.query.aff === "string" ? req.query.aff.trim() : "";
  const affValid = /^nrt[a-z0-9]{2,}$/i.test(aff);
  if (affValid && !req.query.product) {
    return res.redirect(302, `/affiliate/${encodeURIComponent(aff)}?aff=${encodeURIComponent(aff)}`);
  }
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

// Crawler link preview (WhatsApp/Telegram/X/Facebook) tidak menjalankan JS,
// jadi tag Open Graph harus ada di HTML yang dikirim server.
function escMeta(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildAffiliateOgTags(req, code) {
  const origin = `${req.protocol}://${req.get("host")}`;
  const pageUrl = `${origin}/affiliate/${encodeURIComponent(code)}`;
  const imageUrl = `${origin}/api/affiliate/avatar/${encodeURIComponent(code)}`;

  const SITE_NAME = "Northline";
  let title = "Affiliate Northline";
  let desc = `Link affiliate ${SITE_NAME}. Beli lewat link ini agar komisi masuk ke profil.`;
  let name = SITE_NAME;

  if (/^nrt[a-z0-9]{2,}$/i.test(code)) {
    try {
      const [rows] = await db.execute(
        `SELECT name, affiliate_tagline, affiliate_bio FROM user_northline
         WHERE affiliate_code = ? AND affiliate_enabled = 1 AND affiliate_profile_visible = 1
         LIMIT 1`,
        [code]
      );
      if (rows.length > 0) {
        name = rows[0].name || name;
        title = `${name} | Affiliate ${SITE_NAME}`;
        // pakai teks profil yang cukup panjang, kalau tidak generate sendiri
        const own = [rows[0].affiliate_tagline, rows[0].affiliate_bio]
          .map((v) => String(v || "").trim())
          .find((v) => v.length >= 15);
        desc = own
          ? own.slice(0, 160)
          : `Link affiliate ${name} di ${SITE_NAME}. Beli lewat link ini agar komisi masuk ke profil.`;
      }
    } catch (e) {
      // gagal query -> tetap kirim tag generik, jangan gagalkan halaman
    }
  }

  return [
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="Northline">`,
    `<meta property="og:title" content="${escMeta(title)}">`,
    `<meta property="og:description" content="${escMeta(desc)}">`,
    `<meta property="og:url" content="${escMeta(pageUrl)}">`,
    `<meta property="og:image" content="${escMeta(imageUrl)}">`,
    `<meta property="og:image:alt" content="${escMeta(name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escMeta(title)}">`,
    `<meta name="twitter:description" content="${escMeta(desc)}">`,
    `<meta name="twitter:image" content="${escMeta(imageUrl)}">`,
  ].join("\n    ");
}

async function servePublicAffiliate(req, res) {
  const file = path.join(__dirname, "../frontend/AppNorthAffiliate.html");
  const code = String((req.params && req.params.code) || "").trim();
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    const og = await buildAffiliateOgTags(req, code);
    const html = raw.replace("</head>", `    ${og}\n</head>`);
    res.set("Cache-Control", "public, max-age=60");
    return res.type("html").send(html);
  } catch (e) {
    return res.sendFile(file);
  }
}

app.get("/affiliate/:code", servePublicAffiliate);

app.get("/affiliate/:code/*", servePublicAffiliate);

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

app.use((req, res) => {
  res.redirect("/");
});

const PORT = process.env.PORT || 9000;

startLogCleanupCron();

Promise.all([
  productReportRoutes.ensureProductReportsTable(),
  adminRoutes.ensureAdminOperationsTables(),
])
  .then(() => {
    server.listen(PORT, "::1", () => {
      console.log(`Server jalan di port ${PORT} (IPv6 loopback)`);
    });
  })
  .catch((error) => {
    console.error("Gagal menyiapkan tabel operasional:", error);
    process.exit(1);
  });

let shutdownStarted = false;
function gracefulShutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`[SHUTDOWN] ${signal} received; closing server and Copilot client.`);
  const shutdownTimeout = setTimeout(() => {
    console.error("[SHUTDOWN] Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);

  server.close((error) => {
    if (error) console.error("[SHUTDOWN] HTTP server close error:", error.message);
    stopCopilotClient()
      .catch((clientError) => console.error("[SHUTDOWN] Copilot client close error:", clientError.message))
      .finally(() => {
        clearTimeout(shutdownTimeout);
        process.exitCode = error ? 1 : 0;
        process.exit();
      });
  });
}

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
