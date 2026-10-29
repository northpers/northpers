const db = require("../config/db");
const { isFlashScheduleActive } = require("./flashSchedule");

let cfgCache = null;
let cfgCacheAt = 0;
const CACHE_TTL = 10000;

const SETTING_KEYS = [
  "flash_active",
  "flash_date",
  "flash_start_date",
  "flash_end_date",
  "flash_start",
  "flash_end",
  "flash_prices",
];

function nowWib() {
  const now = new Date();
  let minutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60;
  const dayRoll = Math.floor(minutes / 1440);
  minutes = minutes % 1440;
  const dateUtc = new Date(now.getTime());
  dateUtc.setUTCDate(dateUtc.getUTCDate() + dayRoll);
  return {
    minutes,
    date: dateUtc.toISOString().slice(0, 10),
  };
}

async function loadFlashConfig() {
  if (cfgCache && Date.now() - cfgCacheAt < CACHE_TTL) return cfgCache;
  const defaults = {
    flash_active: "0",
    flash_date: "",
    flash_start_date: "",
    flash_end_date: "",
    flash_start: "17:45",
    flash_end: "00:00",
    flash_prices: "{}",
  };
  const cfg = { ...defaults };
  try {
    const placeholders = SETTING_KEYS.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${placeholders})`,
      SETTING_KEYS
    );
    rows.forEach((r) => {
      if (r.setting_key in defaults) cfg[r.setting_key] = r.setting_value;
    });
  } catch (e) {
    console.error("flashDiscount load skip:", e.message);
  }
  let prices = {};
  try {
    prices = JSON.parse(cfg.flash_prices || "{}");
  } catch (e) {
    prices = {};
  }
  cfg.prices = prices;
  cfgCache = cfg;
  cfgCacheAt = Date.now();
  return cfg;
}

function invalidateCache() {
  cfgCache = null;
  cfgCacheAt = 0;
}

function isFlashActive(cfg) {
  return isFlashScheduleActive(cfg, nowWib());
}

async function getFlashState() {
  const cfg = await loadFlashConfig();
  const active = isFlashActive(cfg);
  let prices = {};
  if (active) {
    Object.keys(cfg.prices || {}).forEach((k) => {
      const v = Number(cfg.prices[k]);
      if (Number.isFinite(v) && v > 0) prices[String(k)] = v;
    });
  }
  return { active, prices, config: cfg };
}

module.exports = {
  loadFlashConfig,
  getFlashState,
  isFlashActive,
  invalidateCache,
  nowWib,
};