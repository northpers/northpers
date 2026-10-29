// northlineAiProvider.js
// Abstraction provider AI untuk NPinjam Scanner (baca KTP / Kartu Keluarga).
//
// Chat memakai GitHub Copilot melalui routes/ai.js; ekstraksi dokumen tetap
// memakai Gemini karena membutuhkan kemampuan vision.
//
// Aturan penting (anti-hallucination, lihat spec bagian 26):
//   - AI hanya boleh Mengekstrak apa yang TERLIHAT pada dokumen.
//   - Field yang tidak terbaca harus null, BUKAN hasil tebakan.
//   - Confidences dikembalikan apa adanya oleh AI; matematika confidence
//     (min field wajib / status review) dihitung di routes, bukan di sini.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const REQUIRED_ADDRESS_FIELDS = [
  "alamat",
  "rt_rw",
  "kelurahan_desa",
  "kecamatan",
  "kabupaten_kota",
  "provinsi",
];

const SYSTEM_PROMPT = [
  "Kamu adalah pembaca dokumen identitas Indonesia (KTP dan Kartu Keluarga).",
  "Tugasmu membaca teks yang TERLIHAT pada foto dan mengekstrak bagian alamat.",
  "",
  "ATURAN WAJIB:",
  "1. Kamu MEMBACA dokumen, bukan memverifikasi ke Dukcapil. Jangan pernah mengarang.",
  "2. Jika tidak terbaca, hasilkan null. JANGAN menebak nomor rumah, desa, kelurahan,",
  "   kecamatan, kabupaten/kota, provinsi, atau koordinat.",
  "3. Perbaiki hanya typo OCR yang jelas (mis. 'TIMR' -> 'TIMUR', 'KARAWANG' -> 'Karawang').",
  "   Jika tidak yakin itu salah ketik, biarkan apa adanya dan turunkan confidence.",
  "4. Field yang tidak ada pada dokumen (mis. KK yang tidak menulis RT/RW terpisah)",
  "   tetap dikembalikan sebagai objek field dengan value null dan confidence rendah.",
  "5. NIK dan nomor KK boleh kamu baca untuk memahami konteks, tetapi JANGAN pernah",
  "   menuliskannya di dalam JSON output.",
  "",
  "Format KTP yang perlu dipahami:",
  "  ALAMAT / ALAMAT DI ...  -> alamat (jalan, nomor, kampung/dusun)",
  "  RT/RW ...               -> rt_rw (format 'NN/NN', mis. '02/05')",
  "  KELURAHAN/DESA ...      -> kelurahan_desa",
  "  KECAMATAN ...           -> kecamatan",
  "  KABUPATEN/KOTA ...      -> kabupaten_kota",
  "  PROVINSI ...            -> provinsi",
  "",
  "Format Kartu Keluarga yang perlu dipahami:",
  "  Alamat Kadaluarsa ada di bagian header sebelum kolom 'Nama Kepala Keluarga'.",
  "  Alamat itu dapat terpecah jadi beberapa baris dan sering ditulis tanpa label per baris,",
  "  contoh:",
  "    'ALAMAT : JL. RAYA TELUKJAMBE RT 02 RW 05'",
  "    '         DESA TELUKJAMBE'",
  "    '         KECAMATAN TELUKJAMBE TIMUR KAB. KARAWANG'",
  "    '         PROVINSI JAWA BARAT'",
  "  Pecah baris-baris itu ke field yang sesuai. Pastikan yang diambil adalah bagian",
  "  'Alamat' KK (alamat kepala keluarga), bukan kolom alamat anggota keluarga.",
  "",
  "Kewaspadaan khusus:",
  "  - Foto KTP terpotong / gelap / buram / miring adalah kondisi nyata.",
  "    Dans kondisi itu turunkan confidence dan null-kan field yang tidak terbaca.",
  "  - Bedakan 'Kartu Tanda Penduduk' (KTP, foto, ada kolom NIK) vs",
  "    'Kartu Keluarga' (KK, ada tabel anggota keluarga, ada nomor KK).",
  "  - Foto KTP sisi belakang (ada hologram, tidak ada portrait) tidak bisa dibaca ->",
  "    document_type UNKNOWN dengan document_type_confidence rendah.",
].join("\n");

const RESPONSE_SCHEMA_TEXT = [
  "Kembalikan HANYA satu objek JSON valid tanpa penjelasan, tanpa markdown, tanpa teks lain:",
  "{",
  '  "document_type": "KTP" | "KK" | "UNKNOWN",',
  '  "document_type_confidence": 0.0-1.0,',
  '  "nama": string|null,',
  '  "address": {',
  '    "alamat": string|null,',
  '    "rt_rw": string|null,',
  '    "kelurahan_desa": string|null,',
  '    "kecamatan": string|null,',
  '    "kabupaten_kota": string|null,',
  '    "provinsi": string|null',
  "  },",
  '  "fields": {',
  '    "<nama_field>": { "value": string|null, "confidence": 0.0-1.0 }',
  "  },",
  '  "readability": {',
  '    "blurred": boolean,',
  '    "too_dark": boolean,',
  '    "cropped": boolean,',
  '    "glare": boolean',
  "  },",
  '  "notes": "catatan singkat singkat dalam Bahasa Indonesia, maksimal 200 karakter"',
  "}",
  "",
  'Setiap field WAJIB yang tidak kamu baca harus punya "value": null dengan',
  '"confidence": 0.0 sampai dengan 0.3.',
].join("\n");

class AiProviderError extends Error {
  constructor(code, message, cause, status) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.cause = cause || null;
    this.status = status || null;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Gemini tidak selalu mengembalikan JSON murni: bisa dibungkus fence ```json,
 * bisa ada teks sebelum/sesudahnya. Ambil objek JSON pertama yang balanced.
 */
function parseJsonLoose(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;

  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

function clampConfidence(value) {
  const num = parseFloat(value);
  if (!isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1) return num > 10 ? num / 100 : 1;
  return num;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text;
}

/**
 * Buang field yang jelas bukan alamat agar tidak bisa dipakai sebagai
 * formatted_address (anti-hallucination: jangan diam-diam pakai input lain).
 */
function looksLikeOtherField(key) {
  return /^(nama|nik|kk_number|no_kk|nomor_kk|ttl|tempat_lahir|tanggal_lahir|gender|jenis_kelamin|golongan_darah|golongan_blood|pekerjaan|penghasilan|pendidikan|status_kawin|ayah|ibu|nama_ibu|nama_ayah)$/i.test(
    key
  );
}

/**
 * Rapikan hasil AI menjadi struktur canonical. Tidak menambahkan nilai baru:
 * hanya membatasi field ke daftar field yang sah dan menandai key yang Unexpected.
 */
function normalizeAiResult(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const rawAddress =
    source.address && typeof source.address === "object" ? source.address : {};

  const address = {};
  const fields = {};

  for (const key of REQUIRED_ADDRESS_FIELDS) {
    const direct = rawAddress[key];
    const fieldMeta =
      source.fields && typeof source.fields === "object" ? source.fields[key] : null;

    let value = null;
    if (direct !== undefined) value = cleanText(direct);

    if (value === null && fieldMeta && typeof fieldMeta === "object") {
      value = cleanText(fieldMeta.value);
    }

    let confidence = 0;
    if (fieldMeta && typeof fieldMeta === "object") {
      confidence = clampConfidence(fieldMeta.confidence);
    }
    if (value === null) confidence = 0;

    address[key] = value;
    fields[key] = { value, confidence };
  }

  let documentType = String(source.document_type || "").toUpperCase().trim();
  if (documentType !== "KTP" && documentType !== "KK") documentType = "UNKNOWN";

  const readability = {
    blurred: !!(source.readability && source.readability.blurred),
    too_dark: !!(source.readability && source.readability.too_dark),
    cropped: !!(source.readability && source.readability.cropped),
    glare: !!(source.readability && source.readability.glare),
  };

  const extraKeys = source.address && typeof source.address === "object"
    ? Object.keys(source.address).filter((k) => !REQUIRED_ADDRESS_FIELDS.includes(k))
    : [];

  return {
    document_type: documentType,
    document_type_confidence: clampConfidence(source.document_type_confidence),
    nama: cleanText(source.nama),
    address,
    fields,
    readability,
    notes: cleanText(source.notes),
    // Hanya nama key-nya, BUKAN nilainya: field tak terduga bisa saja berisi
    // NIK atau nomor KK yang tidak boleh keluar dari backend.
    unexpected_keys: extraKeys.filter((k) => !looksLikeOtherField(k)),
  };
}

// ---------------------------------------------------------------------------
// Provider: Gemini (vision)
// ---------------------------------------------------------------------------

async function geminiExtract({ buffer, mime, apiKey, model }) {
  const endpoint = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${SYSTEM_PROMPT}\n\n${RESPONSE_SCHEMA_TEXT}` },
          { inline_data: { mime_type: mime, data: buffer.toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.8,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  let response;
  try {
    response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new AiProviderError("AI_TIMEOUT", "AI timeout.");
    }
    throw new AiProviderError("AI_UNAVAILABLE", "AI tidak dapat dihubungi.", err);
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();

  if (!response.ok) {
    if (response.status === 429) {
      throw new AiProviderError("AI_RATE_LIMIT", "AI sedang sibuk.");
    }
    if (response.status === 404) {
      // Model sudah tidak tersedia untuk key ini (Google aktifalkan model
      // baru dan menarik model lama). Ini masalah konfigurasi, bukan kegagalan
      // sesaat, jadi jangan disamarkan sebagai AI_ERROR yang biasa diulang user.
      throw new AiProviderError(
        "AI_CONFIG_ERROR",
        "Model AI yang dikonfigurasi tidak tersedia untuk API key ini.",
        null,
        response.status
      );
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new AiProviderError("AI_CONFIG_ERROR", "Konfigurasi AI tidak valid.", null, response.status);
    }
    throw new AiProviderError("AI_ERROR", "AI gagal memproses dokumen.", null, response.status);
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (e) {
    throw new AiProviderError("AI_BAD_RESPONSE", "Respons AI tidak valid.", e);
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];

  const finishReason = first && first.finishReason;
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT" || finishReason === "BLOCKLIST") {
    throw new AiProviderError("AI_BLOCKED", "AI menolak memproses gambar ini.");
  }

  const parts = first && first.content && Array.isArray(first.content.parts)
    ? first.content.parts
    : [];
  const text = parts.map((p) => (p && p.text) || "").join("");

  if (!text) {
    throw new AiProviderError("AI_BAD_RESPONSE", "Respons AI kosong.");
  }

  const parsed = parseJsonLoose(text);
  if (!parsed) {
    throw new AiProviderError("AI_BAD_RESPONSE", "Format JSON dari AI tidak dapat dibaca.");
  }

  return normalizeAiResult(parsed);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers = {
  gemini: {
    id: "gemini",
    name: "Gemini",
    supportsVision: true,
    isConfigured() {
      return Boolean(process.env.GEMINI_API_KEY);
    },
    async extract({ buffer, mime }) {
      const model = process.env.NPINJAM_AI_MODEL || "gemini-flash-lite-latest";
      return geminiExtract({ buffer, mime, apiKey: process.env.GEMINI_API_KEY, model });
    },
  },
};

function listProviders() {
  return Object.keys(providers).map((id) => ({
    id,
    name: providers[id].name,
    supportsVision: providers[id].supportsVision,
    configured: providers[id].isConfigured(),
  }));
}

function getProvider(id) {
  const wanted = String(id || process.env.NPINJAM_AI_PROVIDER || "gemini").toLowerCase();
  const provider = providers[wanted];
  if (!provider) {
    throw new AiProviderError("AI_PROVIDER_UNKNOWN", `Provider AI tidak dikenal: ${wanted}`);
  }
  return provider;
}

/**
 * Fallback berurutan: provider yang diminta dulu, lalu provider vision lain yang
 * terkonfigurasi. Tidak pernah fallback ke provider tanpa kemampuan vision.
 */
function resolveChain(id) {
  const chain = [];
  try {
    const primary = getProvider(id);
    if (primary.supportsVision) chain.push(primary);
  } catch (e) {
    // diastolic; akan muncul sebagai AI_PROVIDER_UNKNOWN di bawah bila kosong
  }
  for (const key of Object.keys(providers)) {
    if (key === (id || "").toLowerCase()) continue;
    const candidate = providers[key];
    if (candidate.supportsVision && candidate.isConfigured() && !chain.includes(candidate)) {
      chain.push(candidate);
    }
  }
  if (chain.length === 0) {
    throw new AiProviderError(
      "AI_NOT_CONFIGURED",
      "Provider AI vision belum dikonfigurasi. Isi GEMINI_API_KEY di environment backend."
    );
  }
  return chain;
}

/**
 * Jalankan vision extraction dengan fallback antar provider.
 * Error lempar sebagai AiProviderError dengan .code yang stabil untuk dipetakan
 * ke pesan user-safe oleh routes.
 */
async function extractAddressFromImage({ buffer, mime, provider }) {
  const chain = resolveChain(provider);
  let lastError = null;

  for (const item of chain) {
    if (!item.isConfigured()) {
      lastError = new AiProviderError(
        "AI_NOT_CONFIGURED",
        `Provider AI ${item.id} belum dikonfigurasi.`
      );
      continue;
    }
    try {
      const result = await item.extract({ buffer, mime });
      return { ...result, provider: item.id, provider_name: item.name };
    } catch (err) {
      lastError = err;
      if (err instanceof AiProviderError && err.code === "AI_CONFIG_ERROR") continue;
    }
  }

  throw (
    lastError ||
    new AiProviderError("AI_UNAVAILABLE", "Semua provider AI gagal merespons.")
  );
}

module.exports = {
  AiProviderError,
  REQUIRED_ADDRESS_FIELDS,
  clampConfidence,
  cleanText,
  parseJsonLoose,
  normalizeAiResult,
  extractAddressFromImage,
  listProviders,
  getProvider,
};