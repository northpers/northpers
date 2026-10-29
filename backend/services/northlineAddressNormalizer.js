// northlineAddressNormalizer.js
// Normalisasi deterministik untuk field alamat hasil OCR AI.
//
// TUJUAN: memperbaiki kapitalisasi dan prefiks wilayah (mis. "KAB KARAWANG"
// -> "Karawang", "JAWA BARAT" -> "Jawa Barat") dengan MEMACAKAI daftar wilayah
// resmi yang sudah ada di project (data/wilayah.json).
//
// Ini koreksi format, bukaninferensi: nilai hanya diganti kalau cocok dengan
// entri di wilayah.json. Kalau tidak cocok, nilai AI dikembalikan apa adanya
// dan ditandai tidak terverifikasi - tidak pernah ditebak penggantinya.
//
// Zhongjing: data/wilayah.json hanya memuat provinsi dan kabupaten/kota, jadi
// alamat, RT/RW, kelurahan, dan kecamatan TIDAK bisa diverifikasi di sini.

const WILAYAH = require("../data/wilayah.json");

const PROVINCE_KEYS = new Set(WILAYAH.provinces);

const PREFIX_PATTERN =
  /^(kab\.?|kabupaten|kota|kabr?\.?|kec\.?|kecamatan|kel\.?|kelurahan|desa|prov\.?|provinsi)\s+/i;

function stripPunctuation(value) {
  return String(value || "")
    .replace(/[.,/\\()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kunci perbandingan: uppercase, tanpa titik/koma/slash, prefiks wilayah dibuang,
 * spasi dirapatkan. "KAB. KARAWANG" dan "Karawang" jadi kunci yang sama.
 */
function comparisonKey(value) {
  let text = stripPunctuation(value).toUpperCase();
  // Buang prefiks berulang di depan ("KABUPATEN KABUPATEN X").
  let previous;
  do {
    previous = text;
    text = text.replace(PREFIX_PATTERN, "").trim();
  } while (text !== previous);
  return text.replace(/\s+/g, " ").trim();
}

const ACRONYMS = new Set([
  // Wilayah
  "DKI", "DIY", "NTB", "NTT",
  // Singkatan yang lazim ditulis kapital penuh (bukan "Jl." / "dsb.")
  "RT", "RW", "KP", "GG", "PERUM", "KEC", "KAB",
]);

/**
 * Title case Indonesia: setiap kata diawali kapital, kecuali singkatan yang
 * memang lazim ditulis kapital (DKI Jakarta, Jl. Raya Telukjambe).
 */
function toTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .join(" ");
}

let cityIndex = null;

function getCityIndex() {
  if (cityIndex) return cityIndex;
  cityIndex = new Map();
  for (const [province, cities] of Object.entries(WILAYAH.citiesByProvince || {})) {
    for (const city of cities) {
      const key = comparisonKey(city);
      if (!key) continue;
      // Satu kunci per nama kota supaya lookup tidak ambigu lintas provinsi.
      if (!cityIndex.has(key)) cityIndex.set(key, { province, canonical: city });
    }
  }
  return cityIndex;
}

function normalizeProvince(value) {
  const raw = String(value || "").trim();
  if (!raw) return { value: null, matched: false };

  const bare = comparisonKey(raw);
  if (!bare) return { value: null, matched: false };

  if (PROVINCE_KEYS.has(bare)) {
    return { value: toTitleCase(bare), matched: true };
  }

  // Coconut "JAWA BARAT" persis ada di daftar tapitoTitleCase mungkin
  // menghasilkan kapitalisasi berbeda dari daftar; tetap diterima.
  const found = WILAYAH.provinces.find((p) => comparisonKey(p) === bare);
  if (found) return { value: toTitleCase(found), matched: true };

  return { value: raw, matched: false };
}

function normalizeCity(value, province) {
  const raw = String(value || "").trim();
  if (!raw) return { value: null, matched: false };

  const bare = comparisonKey(raw);
  if (!bare) return { value: null, matched: false };

  const index = getCityIndex();

  // CobaIDCocokkan dengan provinsi bila tersedia supaya "Kota Bandung" tidak
  // tertukar dengancounty bernama sama di provinsi lain.
  const provinceBare = comparisonKey(province || "");
  if (provinceBare) {
    const scoped = index.get(bare);
    if (scoped && comparisonKey(scoped.province) === provinceBare) {
      return { value: toTitleCase(bare), matched: true };
    }
  }

  const entry = index.get(bare);
  if (entry) return { value: toTitleCase(bare), matched: true };

  return { value: raw, matched: false };
}

/**
 * RT/RW -> "02/05". Menyeragamkan "RT 02 RW 05", "002/005", "2/5".
 * Mengembalikan null kalau tidak ada pola RT/RW yang masuk akal.
 */
function normalizeRtRw(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const combined = raw.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (combined) {
    return `${String(parseInt(combined[1], 10)).padStart(2, "0")}/${String(
      parseInt(combined[2], 10)
    ).padStart(2, "0")}`;
  }

  const rt = raw.match(/\brt\.?\s*(\d{1,3})/i);
  const rw = raw.match(/\brw\.?\s*(\d{1,3})/i);
  if (rt && rw) {
    return `${String(parseInt(rt[1], 10)).padStart(2, "0")}/${String(
      parseInt(rw[1], 10)
    ).padStart(2, "0")}`;
  }

  // Bentuk tanpa spasi: "RT002RW005".
  const glued = raw.match(/rt\.?(\d{1,3})rw\.?(\d{1,3})/i);
  if (glued) {
    return `${String(parseInt(glued[1], 10)).padStart(2, "0")}/${String(
      parseInt(glued[2], 10)
    ).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Bersihkan field alamat biasa: rapikan spasi, buang label sisa yang tidak
 * berarti, kapitalisasi, DAN terdeteksi pola. Tidak pernah menambah isi baru.
 *
 * CATATAN: label yang dibuang hanya label metadata ("ALAMAT :", "RT/RW:").
 * Singkatan jalan seperti "Jl." atau "Jalan" TIDAK dibuang karena justru
 * dibutuhkan geocoder untuk mengenali tipe jalan.
 */
function normalizeFreeText(value, { stripLabels = [] } = {}) {
  let text = stripPunctuation(value);
  if (!text) return null;

  for (const label of stripLabels) {
    const re = new RegExp(`^\\s*${label}\\s*:?\\s*`, "i");
    text = text.replace(re, "");
  }

  text = text
    .replace(/\s*[-–—]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  // Kalau sudah mixed-case, itu mungkin hasil AI yang sudah rapi - hormati saja.
  if (/[a-z]/.test(text)) return text;

  return toTitleCase(text);
}

// Pola RT/RW yang muncul "inline" di dalam field alamat, mis.
// "JL RAYA TELUKJAMBE RT 02 RW 05" atau "Jl. Mawar RT03/RW07".
// Info ini TERLIHAT pada dokumen, jadi memindahkannya ke field rt_rw adalah
// parsing, bukan mengarang.
const INLINE_RT_RW =
  /\s*,?\s*\b(?:rt\.?\s*\d{1,3}\s*(?:rw\.?\s*\d{1,3}|\/\s*\d{1,3})|rw\.?\s*\d{1,3}\s*\/\s*\d{1,3})\b\.?\s*$/i;

function extractInlineRtRw(text) {
  const match = String(text || "").match(INLINE_RT_RW);
  if (!match) return { text, rtRw: null };
  return {
    text: String(text).replace(INLINE_RT_RW, "").replace(/[\s,]+$/, "").trim(),
    rtRw: match[0].trim(),
  };
}

function normalizeAddressFields(fields, provinceHint) {
  const province = normalizeProvince(fields.provinsi);
  const city = normalizeCity(fields.kabupaten_kota, province.value || provinceHint);

  let alamat = normalizeFreeText(fields.alamat, {
    // Hanya label metadata yang dibuang, bukan "jl"/"jalan".
    stripLabels: ["alamat\\s*(di|pada)?", "alamat"],
  });

  // RT/RW bisa saja hanya muncul inline di dalam baris alamat.
  let inlineRtRw = null;
  if (alamat) {
    const extracted = extractInlineRtRw(alamat);
    alamat = extracted.text || null;
    inlineRtRw = extracted.rtRw;
  }

  const rtRw = normalizeRtRw(fields.rt_rw) || normalizeRtRw(inlineRtRw);

  return {
    alamat,
    rt_rw: rtRw,
    kelurahan_desa: normalizeFreeText(fields.kelurahan_desa, {
      stripLabels: ["kelurahan", "kel", "desa"],
    }),
    kecamatan: normalizeFreeText(fields.kecamatan, {
      stripLabels: ["kecamatan", "kec"],
    }),
    kabupaten_kota: city.value,
    provinsi: province.value,
  };
}

module.exports = {
  comparisonKey,
  getCityIndex,
  normalizeAddressFields,
  normalizeCity,
  normalizeFreeText,
  normalizeProvince,
  normalizeRtRw,
  toTitleCase,
};