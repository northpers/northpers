const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const BASE = path.resolve(__dirname, "..");
const AUTH_DIR = path.join(BASE, ".wwebjs_auth");
const CACHE_DIR = path.join(BASE, ".wwebjs_cache");

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;

let client = null;
let currentQr = null;
let lastExecutablePath = null;
let reconnectTimer = null;
let destroying = false;

const state = {
  phase: "idle",
  connected: false,
  error: null,
  errorDetail: null,
  connectedSince: null,
  number: null,
  platform: null,
  restartCount: 0,
  qrUpdatedAt: null,
  startedAt: null,
  nextRetryAt: null,
  attempts: 0,
};

function setState(patch, event) {
  Object.assign(state, patch);
  if (event === false) return;
  emit("wa_status", snapshot());
}

function snapshot() {
  return {
    connected: state.connected,
    connectedSince: state.connectedSince,
    phase: state.phase,
    error: state.error,
    errorDetail: state.errorDetail || null,
    number: state.number,
    platform: state.platform,
    restartCount: state.restartCount,
    qrUpdatedAt: state.qrUpdatedAt,
    startedAt: state.startedAt,
    nextRetryAt: state.nextRetryAt,
  };
}

function getCachedWebVersion() {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter((f) => /^2\.3000\.[0-9]+\.html$/.test(f));
    if (!files.length) return null;
    files.sort((a, b) => {
      const n = (s) => parseInt(s.replace(/[^0-9]/g, ""), 10);
      return n(a) - n(b);
    });
    return files[files.length - 1].replace(/\.html$/, "");
  } catch (e) {
    return null;
  }
}

function emit(event, data) {
  try {
    require("./io").broadcast(event, data);
  } catch (e) {}
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  state.nextRetryAt = null;
}

/** Buang folder session LocalAuth supaya WA benar-benar minta pairing ulang. */
function wipeSession() {
  const dir = path.join(AUTH_DIR, "session");
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log("[WhatsApp] Session folder dihapus, pairing ulang diperlukan.");
    return { ok: true };
  } catch (e) {
    console.warn("[WhatsApp] Gagal hapus session folder:", e.code || e.message);
    return {
      ok: false,
      reason:
        "Folder session WA tidak bisa dihapus (EACCES). Jalankan sekali di server: " +
        `sudo chown -R ${process.env.USER || "hostinesia"}:${process.env.USER || "hostinesia"} ` +
        `${AUTH_DIR}/session`,
    };
  }
}

/**
 * Chromium sisa dari initialize() yang gagal sering tetap hidup sehingga
 * SingletonLock menahan userDataDir dan initialize berikutnya gagal
 * "browser is already running". Bersihkan paksa sebelum client baru dibuat.
 */
function killStaleBrowsers() {
  const dir = path.join(AUTH_DIR, "session");
  let pids = [];
  try {
    const out = execSync(`pgrep -f -- "--user-data-dir=${dir}" || true`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    pids = out ? out.split(/\s+/).filter(Boolean).map(Number) : [];
  } catch (e) {
    /* pgrep tidak tersedia / tidak ada match */
  }
  let killed = 0;
  for (const pid of pids) {
    if (!pid || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGKILL");
      killed += 1;
    } catch (e) {
      /* proses sudah mati */
    }
  }
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.rmSync(path.join(dir, name), { force: true, recursive: true });
    } catch (e) {}
  }
  if (killed) console.log(`[WhatsApp] ${killed} proses browser yatim dibersihkan.`);
  return killed;
}

/**
 * Profile Chromium pernah dibuat proses yang jalan sebagai root, jadi handful file
 * (Local State, Default/Preferences, ...) jadi tidak bisa dibaca ditulis user aplikasi.
 * Akibatnya WhatsApp Web tidak pernah selesai load => window.Debug tidak pernah ada => QR tidak keluar.
 */
function sessionOwnershipProblem() {
  const uid = process.getuid && process.getuid();
  if (uid === undefined) return null;
  const dir = path.join(AUTH_DIR, "session");
  const targets = [
    "Local State",
    path.join("Default", "Preferences"),
    path.join("Default", "LOCK"),
    path.join("Default", "IndexedDB"),
    path.join("Default", "Local Storage"),
    path.join("Default", "Cookies"),
  ];
  for (const rel of targets) {
    const p = path.join(dir, rel);
    try {
      if (fs.lstatSync(p).uid !== uid) {
        return {
          path: p,
          hint:
            `sudo chown -R $(id -un):$(id -gn) ${AUTH_DIR}/session && ` +
            `sudo rm -rf ${AUTH_DIR}/session && pm2 reload northline`,
        };
      }
    } catch (e) {
      /* tidak ada -> skip */
    }
  }
  return null;
}

function scheduleReconnect(reason) {
  if (destroying || reconnectTimer) return;
  state.attempts += 1;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, state.attempts - 1), RECONNECT_MAX_MS);
  state.nextRetryAt = Date.now() + delay;
  setState({ phase: "reconnecting", error: reason || null });
  console.warn(`[WhatsApp] Auto reconnect dalam ${Math.round(delay / 1000)}s (alasan: ${reason})`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    state.nextRetryAt = null;
    await restart({ resetSession: false, fromAuto: true });
  }, delay);
}

async function destroyClient() {
  if (!client) return;
  const dying = client;
  client = null;
  currentQr = null;
  const proc =
    dying.puppeteer && typeof dying.puppeteer.process === "function"
      ? dying.puppeteer.process()
      : null;
  try {
    await dying.destroy();
  } catch (e) {
    console.warn("[WhatsApp] destroy client:", e.message);
  }
  if (proc && !proc.killed) {
    try {
      proc.kill("SIGKILL");
    } catch (e) {}
  }
}

function makeClient({ executablePath, resetSession } = {}) {
  if (executablePath) lastExecutablePath = executablePath;
  if (resetSession) wipeSession();
  // bebaskan userDataDir dari proses browser sisa sebelum start baru
  killStaleBrowsers();

  const perm = sessionOwnershipProblem();
  if (perm) {
    console.error(
      "[WhatsApp] BLOKIR: file profile WA milik user lain (root), QR tidak akan keluar. Jalankan:\n  " +
        perm.hint
    );
    setState({
      phase: "error",
      connected: false,
      error: "session_permission",
      errorDetail: perm.hint,
    });
    clearReconnect();
    state.nextRetryAt = Date.now() + 30000;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      restart({ resetSession: false, fromAuto: true });
    }, 30000);
    return null;
  }

  currentQr = null;
  state.error = null;
  state.errorDetail = null;
  state.attempts = 0;
  state.startedAt = Date.now();
  setState({
    phase: "starting",
    connected: false,
    connectedSince: null,
    number: null,
    platform: null,
    qrUpdatedAt: null,
    restartCount: state.restartCount + 1,
  });

  const puppeteer = {
    headless: true,
    executablePath: lastExecutablePath,
    pipe: true,
    protocolTimeout: 180000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  };

  const webVersion = getCachedWebVersion();
  const opts = {
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    webVersionCache: { type: "local", path: CACHE_DIR },
    puppeteer,
  };
  if (webVersion) {
    opts.webVersion = webVersion;
    console.log(`[WhatsApp] Pin web version: ${webVersion}`);
  } else {
    console.warn("[WhatsApp] No cached web version found; using live page.");
  }

  client = new Client(opts);

  client.on("qr", (qr) => {
    currentQr = qr;
    state.qrUpdatedAt = Date.now();
    try { qrcode.generate(qr, { small: true }); } catch (e) {}
    console.log("[WhatsApp] QR baru tersedia - scan di Panel Admin > WA Notifikasi");
    setState({ phase: "awaiting_scan", error: null });
    emit("wa_qr", { qr });
  });

  client.on("ready", () => {
    clearReconnect();
    currentQr = null;
    state.attempts = 0;
    const info = (client && client.info) || {};
    console.log("WhatsApp Bot Northline SIAP DIGUNAKAN!");
    setState({
      phase: "ready",
      connected: true,
      connectedSince: Date.now(),
      error: null,
      number: info.wid ? info.wid.user : null,
      platform: info.platform || null,
      qrUpdatedAt: null,
    });
  });

  client.on("authenticated", () => {
    console.log("[WhatsApp] Authenticated");
    if (!state.connected) setState({ phase: "authenticating" }, false);
  });

  client.on("auth_failure", (msg) => {
    currentQr = null;
    console.error("[WhatsApp] authentication failed:", msg);
    setState({ phase: "error", connected: false, error: "auth_failure" });
    scheduleReconnect("auth_failure");
  });

  client.on("disconnected", (reason) => {
    currentQr = null;
    console.warn("[WhatsApp] disconnected:", reason);
    const r = String(reason || "disconnected");
    setState({ phase: "disconnected", connected: false, connectedSince: null, error: r, number: null });
    if (r === "LOGOUT") return;
    scheduleReconnect(r);
  });

  client
    .initialize()
    .then(() => {
      if (!state.connected && !currentQr) {
        setState({ phase: "restoring" }, false);
      }
    })
    .catch((err) => {
      const msg = (err && err.message) || String(err);
      console.error("[WhatsApp] client initialization error:", msg);
      if (err && err.stack) console.error("[WhatsApp] stack:", err.stack.split("\n").slice(0, 6).join("\n"));
      setState({ phase: "error", connected: false, error: "init_error", errorDetail: msg });
      scheduleReconnect("init_error");
    });

  return client;
}

/**
 * Restart client WA.
 * @param {object}  opts
 * @param {boolean} opts.resetSession  true = hapus session, WA minta scan QR dari nol
 * @param {boolean} opts.fromAuto      true = dipicu scheduler, bukan klik admin
 */
async function restart({ resetSession = false, fromAuto = false } = {}) {
  clearReconnect();
  destroying = true;
  try {
    await destroyClient();
  } finally {
    destroying = false;
  }
  let warning = null;
  if (resetSession) {
    const r = wipeSession();
    if (!r.ok) warning = r.reason;
  }
  killStaleBrowsers();
  // beri OS waktu melepas lock + file profile
  await new Promise((r) => setTimeout(r, 1200));
  console.log(
    `[WhatsApp] Restart client${resetSession ? " (reset session)" : ""}${fromAuto ? " [auto]" : " [manual]"}`
  );
  const c = makeClient({ resetSession: false });
  return warning ? { client: c, warning } : c;
}

function getClient() {
  return client;
}

function isReady() {
  return Boolean(client && client.info && client.info.wid);
}

/**
 * Tunggu sampai client WA benar-benar siap (bukan cuma ada di memori).
 * Dipakai route yang kirim pesan ke user supaya request tidak gagal
 * hanya karena client sedang di-restart.
 *
 * @param {number} timeoutMs
 * @returns {Promise<object|null>} client siap, atau null kalau tidak jadi siap
 */
async function waitForReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  // kondisi yang tidak akan membaik dengan sendirian, gagal cepat
  const fatal = () =>
    state.error === "session_permission" || state.error === "auth_failure";

  for (;;) {
    if (isReady()) return client;
    if (fatal()) return null;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 250));
  }
}

function getQr() {
  return currentQr;
}

function getState() {
  return snapshot();
}

module.exports = {
  getClient,
  getQr,
  getState,
  isReady,
  waitForReady,
  makeClient,
  restart,
  getCachedWebVersion,
};
