// adminNpinjamScanner.js
// NPinjam Scanner - baca alamat dari KTP / Kartu Keluarga memakai AI Vision,
// lalu geocoding ke peta.
//
// Integrasi: memakai auth admin yang sudah ada (adminAuth dari routes/admin.js),
// struktur respons mengikuti routes/admin.js dan routes/npinjam.js.
//
// PRIVASI (paling penting di file ini):
//   - Upload memakai multer.memoryStorage(), jadi file KTP/KK TIDAK PERNAH
//     menyentuh disk. Tidak ada nama file asli yang jadi path, tidak ada path
//     file yang dikembalikan ke client, dan tidak ada file yang perlu dihapus
//     karena tidak pernah disimpan. Ini memenuhi alur "DELETE ORIGINAL DOCUMENT"
//     secara struktural, bukan lewat promise.
//   - NIK, nomor KK, dan data anggota keluarga tidak pernah dibaca, tidak
//     pernah dikembalikan, dan tidak pernah di-log. Field yang dikembalikan
//     hanya 6 field alamat wajib + nama (opsional) + label dokumen.
//   - Tabel npinjam_scans juga tidak punya kolom NIK/nomor KK. Yang disimpan
//     hanya alamat, keyakinan, dan koordinat.
//   - Log hanya berisi metadata: kode processing, jenis dokumen, status, dan
//     waktu proses. Tidak ada isi dokumen.

const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const db = require("../config/db");
const { adminAuth } = require("./admin");
const { detectImageExt } = require("../utils/uploadValidation");
const {
  extractAddressFromImage,
  listProviders,
  AiProviderError,
  REQUIRED_ADDRESS_FIELDS,
} = require("../services/northlineAiProvider");
const {
  normalizeAddressFields,
  normalizeProvince,
  normalizeCity,
} = require("../services/northlineAddressNormalizer");
const northlineGeocoder = require("../services/northlineGeocoder");
const scanStore = require("../services/northlineScanStore");

const router = express.Router();

// ---------------------------------------------------------------------------
// Rate limit per BIAYA, bukan satu bucket untuk seluruh /api/admin/npinjam
// ---------------------------------------------------------------------------
// Sebelumnya semua route memakai satu bucket 10/menit. Akibatnya membuka
// panel saja (config + scans) menghabiskan kuota, lalu mengetik di kolom
// pencarian (debounce 300ms = 1 request per ketikan) menghabiskan sisanya.
// Request murah seperti GET /scans membuat POST /scanner dan /geocode dapat
// 429 padahal admin tidak memanggil AI sama sekali.
//
// Dipecah jadi dua:
//   - aiLimiter  : pemanggilan Gemini/Nominatim, mahal, dilindungi ketat.
//   - readLimiter: baca daftar/konfigurasi/hapus/kirim, murah, longgar.
//
// Catatan: backend ini di-mount di belakang nginx, jadi req.ip selalu
// 127.0.0.1 untuk semua admin. express-rate-limit memakai IP sebagai kunci,
// sehingga seluruh admin masih berbagi satu bucket. Batas di sini sengaja
// dibuat cukup longgar untuk penggunaan admin normal; proteksi sesungguhnya
// ada di adminAuth, bukan di sini.
const isLocalDev = process.env.NODE_ENV !== "production";
const skipLimit = (req, res, next) => next();

const RATE_MSG = {
  success: false,
  code: "RATE_LIMITED",
  message: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
};

const aiLimiter = isLocalDev
  ? skipLimit
  : rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      message: { ...RATE_MSG, message: "Terlalu banyak permintaan pembacaan dokumen atau pencarian lokasi. Tunggu sebentar lalu coba lagi." },
    });

const readLimiter = isLocalDev
  ? skipLimit
  : rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      message: RATE_MSG,
    });

// ---------------------------------------------------------------------------
// Konstanta & konfigurasi
// ---------------------------------------------------------------------------

const DEFAULT_MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

function maxUploadSize() {
  const parsed = parseInt(process.env.MAX_UPLOAD_SIZE, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_UPLOAD_SIZE;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

// MIME -> ekstensi untuk deteksi magic byte.
const MIME_TO_EXPECTED_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const DOCUMENT_LABELS = {
  KTP: "Kartu Tanda Penduduk (KTP)",
  KK: "Kartu Keluarga (KK)",
  UNKNOWN: "Tidak Diketahui",
};

// Ambang confidence (spec bagian 10).
const THRESHOLD_AUTO_PASS = 0.95;
const THRESHOLD_REVIEW = 0.85;
const THRESHOLD_MANUAL = 0.7;

const SCAN_STEPS = [
  "Foto diterima",
  "Menganalisis dokumen",
  "Mendeteksi jenis dokumen",
  "Membaca teks",
  "Mengekstrak alamat",
  "Menormalisasi alamat",
];

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

const upload = multer({
  // Memory storage: file tidak pernah ditulis ke disk (lihat catatan PRIVASI).
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadSize(),
    files: 1,
    fields: 4,
  },
  fileFilter(req, file, cb) {
    const mime = String(file.mimetype || "").toLowerCase();

    if (!ALLOWED_MIME.has(mime)) {
      // `code` harus di-set eksplisit: `new Error("X")` hanya mengisi
      // `message`, sehingga pemetaan error di bawah tidak akan mengenalinya.
      const err = new Error("Format file tidak didukung.");
      err.code = "UNSUPPORTED_MIME";
      err.userMessage = "Format file tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.";
      return cb(err);
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Confidence & status (spec bagian 9-14)
// ---------------------------------------------------------------------------

/**
 * Confidence per field + final_address_confidence.
 *
 * final_address_confidence = minimum dari seluruh field alamat wajib.
 * Ini disengaja: confidence global tidak boleh menyembunyikan satu field
 * bermasalah pun (contoh spec: District 72% => status tetap MANUAL_REVIEW
 * walau overall terlihat tinggi).
 */
function buildConfidence(fields, documentTypeConfidence) {
  const perField = {};
  let minRequired = 1;
  const missing = [];

  for (const key of REQUIRED_ADDRESS_FIELDS) {
    const meta = fields[key] || { value: null, confidence: 0 };
    const confidence = meta.value ? Number(meta.confidence) || 0 : 0;
    perField[key] = confidence;
    if (!meta.value) missing.push(key);
    if (confidence < minRequired) minRequired = confidence;
  }

  const addressConfidence = REQUIRED_ADDRESS_FIELDS.length ? minRequired : 0;

  // Overall sengaja memakai min(), bukan rata-rata, supaya tidak pernah
  // menutupi field terburuk.
  const overall = Math.min(documentTypeConfidence || 0, addressConfidence);

  return {
    document_type: documentTypeConfidence || 0,
    address: addressConfidence,
    overall,
    per_field: perField,
    missing_fields: missing,
  };
}

/**
 * Status review mengikuti ambang di spec bagian 10-14. Urutan pemeriksaan penting:
 * yang paling buruk lebih dulu.
 */
function buildReviewStatus({ documentType, documentTypeConfidence, confidence, readability }) {
  const missing = confidence.missing_fields;

  const imageTooPoor =
    !!(readability && (readability.blurred || readability.too_dark || readability.cropped));

  if (documentType === "UNKNOWN" || documentTypeConfidence < THRESHOLD_MANUAL) {
    return {
      review_status: "RESCAN_REQUIRED",
      reason: "document_type_unknown",
      message:
        "Dokumen tidak dapat dikenali. Upload foto KTP atau Kartu Keluarga yang lebih jelas.",
    };
  }

  if (confidence.address < THRESHOLD_MANUAL || missing.length > 0 || imageTooPoor) {
    let message =
      "Foto dokumen kurang jelas untuk dibaca dengan akurat. Silakan upload foto KTP atau KK yang lebih jelas.";
    if (missing.length > 0) {
      message = "Alamat belum terbaca lengkap. Silakan koreksi atau upload ulang dokumen yang lebih jelas.";
    } else if (imageTooPoor) {
      message = "Foto dokumen kurang terbaca (buram/gelap/terpotong). Silakan upload ulang foto yang lebih jelas.";
    }
    return {
      review_status: "RESCAN_REQUIRED",
      reason: missing.length > 0 ? "missing_required_fields" : "low_confidence",
      message,
      missing_fields: missing,
    };
  }

  const belowManual = Object.entries(confidence.per_field).filter(
    ([, value]) => value < THRESHOLD_REVIEW
  );

  if (belowManual.length > 0) {
    const labels = belowManual.map(([key]) => key);
    return {
      review_status: "MANUAL_REVIEW",
      reason: "low_field_confidence",
      message:
        "Sebagian field alamat dibaca dengan keyakinan rendah. Koreksi atau konfirmasi field berikut sebelum mencari lokasi.",
      low_confidence_fields: labels,
    };
  }

  const belowReview = Object.entries(confidence.per_field).filter(
    ([, value]) => value < THRESHOLD_AUTO_PASS
  );

  if (belowReview.length > 0) {
    return {
      review_status: "REVIEW_REQUIRED",
      reason: "medium_field_confidence",
      message: "Periksa kembali hasil pembacaan AI sebelum mencari lokasi.",
      low_confidence_fields: belowReview.map(([key]) => key),
    };
  }

  const autoPass =
    documentTypeConfidence >= THRESHOLD_AUTO_PASS &&
    confidence.address >= THRESHOLD_AUTO_PASS;

  if (!autoPass) {
    return {
      review_status: "REVIEW_REQUIRED",
      reason: "document_type_confidence",
      message: "Periksa kembali hasil pembacaan AI sebelum mencari lokasi.",
    };
  }

  return {
    review_status: "AUTO_PASS",
    reason: "high_confidence",
    message: "Alamat berhasil dibaca dengan tingkat keyakinan tinggi.",
  };
}

/** Field yang wajib dikonfirmasi user sebelum geocoding. */
function requiresConfirmation(reviewStatus) {
  return reviewStatus === "REVIEW_REQUIRED" || reviewStatus === "MANUAL_REVIEW";
}

// ---------------------------------------------------------------------------
// Pesan error yang aman untuk user (spec bagian 27)
// ---------------------------------------------------------------------------

const AI_ERROR_MESSAGES = {
  AI_TIMEOUT: "AI membutuhkan waktu terlalu lama. Silakan coba lagi.",
  AI_RATE_LIMIT: "AI sedang sibuk. Silakan coba beberapa saat lagi.",
  AI_CONFIG_ERROR: "Konfigurasi AI belum benar. Hubungi administrator.",
  AI_NOT_CONFIGURED: "Fitur AI belum dikonfigurasi di server. Hubungi administrator.",
  AI_BLOCKED: "AI tidak dapat memproses gambar ini. Silakan upload foto lain.",
  AI_BAD_RESPONSE: "Hasil pembacaan AI tidak dapat diproses. Silakan coba lagi.",
  AI_PROVIDER_UNKNOWN: "Provider AI tidak dikenal. Hubungi administrator.",
  AI_UNAVAILABLE: "Layanan AI sedang tidak tersedia. Silakan coba lagi.",
  AI_ERROR: "Terjadi masalah saat membaca dokumen. Silakan coba lagi.",
};

const GEOCODER_ERROR_MESSAGES = {
  ADDRESS_EMPTY: "Alamat belum diisi lengkap.",
  GEOCODER_TIMEOUT: "Pencarian lokasi terlalu lama. Silakan coba lagi.",
  GEOCODER_RATE_LIMIT: "Layanan peta sedang membatasi permintaan. Silakan coba lagi nanti.",
  GEOCODER_UNAVAILABLE: "Layanan peta sedang tidak tersedia. Silakan coba lagi.",
  GEOCODER_ERROR: "Pencarian lokasi gagal. Silakan coba lagi.",
};

function uploadErrorPayload(err) {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return {
      status: 413,
      body: {
        success: false,
        code: "FILE_TOO_LARGE",
        message: `Ukuran file terlalu besar. Maksimal ${Math.round(
          maxUploadSize() / (1024 * 1024)
        )} MB.`,
      },
    };
  }
  if (err && err.code === "UNSUPPORTED_MIME") {
    return {
      status: 415,
      body: { success: false, code: "UNSUPPORTED_MIME", message: err.userMessage },
    };
  }
  if (err && (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT")) {
    return {
      status: 400,
      body: {
        success: false,
        code: "INVALID_UPLOAD",
        message: "Permintaan upload tidak valid. Gunakan satu file gambar pada field 'image'.",
      },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ringkasan hasil scan
// ---------------------------------------------------------------------------

function buildScanSummary(addressFields, confidence) {
  const formattedAddress = [
    addressFields.alamat,
    addressFields.rt_rw ? `RT ${addressFields.rt_rw}` : "",
    addressFields.kelurahan_desa,
    addressFields.kecamatan,
    addressFields.kabupaten_kota,
    addressFields.provinsi,
  ]
    .filter(Boolean)
    .join(", ");

  const regionCheck = {
    provinsi: normalizeProvince(addressFields.provinsi).matched,
    kabupaten_kota: normalizeCity(addressFields.kabupaten_kota, addressFields.provinsi).matched,
  };

  return {
    address: {
      ...addressFields,
      formatted_address: formattedAddress || null,
    },
    confidence: {
      document_type: confidence.document_type,
      overall: confidence.overall,
      address: confidence.address,
      per_field: confidence.per_field,
      missing_fields: confidence.missing_fields,
    },
    fields: Object.fromEntries(
      REQUIRED_ADDRESS_FIELDS.map((key) => [
        key,
        {
          value: addressFields[key],
          confidence: confidence.per_field[key],
        },
      ])
    ),
    // Kalau provinsi/kota tidak cocok dengan data wilayah resmi, user diberi
    // tahu agar memeriksa ulang. Nilainya sendiri TIDAK diganti.
    region_check: regionCheck,
  };
}

// ---------------------------------------------------------------------------
// POST /scanner  ->  baca dokumen dengan AI
// ---------------------------------------------------------------------------

router.post("/scanner", aiLimiter, adminAuth, (req, res) => {
  upload.single("image")(req, res, async (uploadErr) => {
    if (uploadErr) {
      const mapped = uploadErrorPayload(uploadErr);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      console.warn("[npinjam-scanner] upload gagal:", uploadErr.code || uploadErr.message);
      return res.status(400).json({
        success: false,
        code: "UPLOAD_FAILED",
        message: "Upload gagal. Silakan coba lagi.",
      });
    }

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        code: "NO_FILE",
        message: "Tidak ada gambar yang diunggah.",
      });
    }

    const mime = String(file.mimetype || "").toLowerCase();
    const expectedExt = MIME_TO_EXPECTED_EXT[mime];

    // Validasi kedua: cocokkan magic byte dengan MIME yang diklaim. Melindungi
    // dari file yang menyamar sebagai gambar (mis. script rename .jpg).
    const actualExt = detectImageExt(file.buffer);
    if (!actualExt || actualExt !== expectedExt) {
      return res.status(415).json({
        success: false,
        code: "INVALID_IMAGE",
        message: "File yang diunggah bukan gambar yang valid.",
      });
    }

    const processingId = `nps_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const startedAt = Date.now();

    // Metadata saja. Isi dokumen tidak pernah di-log.
    console.log(
      `[npinjam-scanner] mulai proses ${processingId} admin=${req.user && req.user.id} ` +
        `bytes=${file.size} mime=${mime}`
    );

    try {
      const aiResult = await extractAddressFromImage({
        buffer: file.buffer,
        mime,
        provider: req.body && req.body.provider,
      });

      // Normalisasi deterministik terhadap data wilayah project.
      const normalized = normalizeAddressFields(aiResult.address, aiResult.address.provinsi);

      const confidence = buildConfidence(
        Object.fromEntries(
          REQUIRED_ADDRESS_FIELDS.map((key) => [
            key,
            {
              value: normalized[key],
              confidence: (aiResult.fields[key] || {}).confidence || 0,
            },
          ])
        ),
        aiResult.document_type_confidence
      );

      const review = buildReviewStatus({
        documentType: aiResult.document_type,
        documentTypeConfidence: aiResult.document_type_confidence,
        confidence,
        readability: aiResult.readability,
      });

      const summary = buildScanSummary(normalized, confidence);
      const processingTime = Date.now() - startedAt;

      // Simpan ke DB agar bisa dikelola admin. Foto dokumen tidak ikut disimpan.
      // Kegagalan penyimpanan tidak boleh membuat scan yang sudah berhasil jadi
      // gagal di mata user, jadi error dicatat lalu diteruskan.
      const storedScan = {
        ...summary,
        document_type: aiResult.document_type,
        document_type_confidence: aiResult.document_type_confidence,
        nama: aiResult.nama,
        review_status: review.review_status,
        review_reason: review.reason,
        low_confidence_fields: review.low_confidence_fields || [],
        ai_provider: aiResult.provider,
        processing_time_ms: processingTime,
      };

      let scanId = null;
      try {
        scanId = await scanStore.createScan({
          scan: storedScan,
          location: null,
          adminId: req.user && req.user.id,
        });
      } catch (storeErr) {
        console.warn("[npinjam-scanner] gagal menyimpan hasil:", storeErr.message);
      }

      console.log(
        `[npinjam-scanner] selesai ${processingId} type=${aiResult.document_type} ` +
          `addr_conf=${confidence.address.toFixed(2)} status=${review.review_status} ` +
          `ms=${processingTime} scan_id=${scanId || "-"}`
      );

      return res.json({
        success: true,
        data: {
          processing_id: processingId,
          scan_id: scanId,
          document_type: aiResult.document_type,
          document_label: DOCUMENT_LABELS[aiResult.document_type] || DOCUMENT_LABELS.UNKNOWN,
          document_type_confidence: aiResult.document_type_confidence,
          // NIK / nomor KK sengaja tidak ada di respons ini.
          nama: aiResult.nama,
          address: summary.address,
          confidence: summary.confidence,
          fields: summary.fields,
          region_check: summary.region_check,
          review_status: review.review_status,
          review_reason: review.reason,
          review_message: review.message,
          low_confidence_fields: review.low_confidence_fields || [],
          requires_confirmation: requiresConfirmation(review.review_status),
          readability: aiResult.readability,
          notes: aiResult.notes,
          ai_provider: aiResult.provider,
          processing_time_ms: processingTime,
          // location belum ada: geocoding hanya berjalan atas alamat yang
          // sudah dikonfirmasi user.
          location: null,
        },
      });
    } catch (err) {
      const processingTime = Date.now() - startedAt;
      console.warn(
        `[npinjam-scanner] gagal ${processingId} code=${err && err.code} ms=${processingTime}`
      );

      if (err instanceof AiProviderError) {
        const status = err.code === "AI_NOT_CONFIGURED" || err.code === "AI_CONFIG_ERROR" ? 503 : 502;
        return res.status(status).json({
          success: false,
          code: err.code,
          message: AI_ERROR_MESSAGES[err.code] || AI_ERROR_MESSAGES.AI_ERROR,
        });
      }

      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Terjadi kesalahan saat memproses dokumen. Silakan coba lagi.",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /geocode  ->  cari lokasi dari alamat yang sudah dikonfirmasi
// ---------------------------------------------------------------------------

router.post("/geocode", aiLimiter, adminAuth, async (req, res) => {
  const body = req.body || {};
  const scanId = parseInt(body.scan_id, 10);
  const hasScanId = Number.isFinite(scanId) && scanId > 0;

  let address = {
    alamat: body.alamat,
    rt_rw: body.rt_rw,
    kelurahan_desa: body.kelurahan_desa,
    kecamatan: body.kecamatan,
    kabupaten_kota: body.kabupaten_kota,
    provinsi: body.provinsi,
  };

  // Kalau body tidak membawa wilayah (UI cukup kirim scan_id), ambil alamat
  // dari rekaman pindaian. Tanpa ini scan_id hanya berguna untuk menempelkan
  // koordinat, tidak untuk mencari koordinatnya sendiri.
  let addressFromScan = false;
  if (hasScanId) {
    const bodyHasRegion = [address.kelurahan_desa, address.kecamatan, address.kabupaten_kota, address.provinsi]
      .map((v) => String(v || "").trim())
      .some(Boolean);
    if (!bodyHasRegion) {
      try {
        const scan = await scanStore.getScan(scanId);
        if (!scan) {
          return res.status(404).json({
            success: false,
            code: "NOT_FOUND",
            message: "Data pindaian tidak ditemukan.",
          });
        }
        address = {
          alamat: address.alamat || (scan.address && scan.address.alamat) || null,
          rt_rw: address.rt_rw || (scan.address && scan.address.rt_rw) || null,
          kelurahan_desa: address.kelurahan_desa || (scan.address && scan.address.kelurahan_desa) || null,
          kecamatan: address.kecamatan || (scan.address && scan.address.kecamatan) || null,
          kabupaten_kota: address.kabupaten_kota || (scan.address && scan.address.kabupaten_kota) || null,
          provinsi: address.provinsi || (scan.address && scan.address.provinsi) || null,
        };
        addressFromScan = true;
      } catch (err) {
        return res.status(500).json({
          success: false,
          code: "SERVER_ERROR",
          message: "Gagal membaca data pindaian.",
        });
      }
    }
  }

  // Wajib minimal ada nama wilayah agar geocoding punya sesuatu untuk dicari.
  const hasRegion = [address.kelurahan_desa, address.kecamatan, address.kabupaten_kota, address.provinsi]
    .map((v) => String(v || "").trim())
    .some(Boolean);

  if (!hasRegion) {
    return res.status(400).json({
      success: false,
      code: "ADDRESS_EMPTY",
      message:
        "Isi minimal kelurahan/desa, kecamatan, atau kabupaten/kota sebelum mencari lokasi.",
    });
  }

  try {
    const result = await northlineGeocoder.geocodeAddress(address);

    // Kalau UI mengirim scan_id, ikutkan koordinatnya ke rekaman DB.
    if (hasScanId) {
      try {
        await scanStore.attachLocation(scanId, {
          latitude: result.primary ? result.primary.latitude : null,
          longitude: result.primary ? result.primary.longitude : null,
          place_id: result.primary ? result.primary.place_id : null,
          formatted_address: result.primary ? result.primary.formatted_address : null,
          geocoding_status: result.status,
          match_precision: result.match_precision,
          provider: result.provider,
        });
      } catch (storeErr) {
        console.warn("[npinjam-scanner] gagal menyimpan koordinat:", storeErr.message);
      }
    }

    return res.json({
      success: true,
      data: {
        geocoding_status: result.status,
        provider: result.provider,
        query: result.query,
        full_address: result.full_address || null,
        attempted_queries: result.attempted_queries || [],
        match_level: result.match_level,
        address_source: addressFromScan ? "scan" : "request",
        match_precision: result.match_precision,
        requested_precision: result.requested_precision || null,
        precision_warning: result.precision_warning || null,
        primary: result.primary,
        candidates: result.candidates,
        // true = provider hanya menemukan nama yang sama di wilayah lain,
        // sehingga koordinat sengaja tidak dikembalikan.
        region_mismatch: !!result.region_mismatch,
        message:
          result.status === "LOCATION_NOT_FOUND"
            ? result.message ||
              "Lokasi tidak ditemukan berdasarkan alamat tersebut. Periksa kembali alamat."
            : null,
      },
    });
  } catch (err) {
    if (err instanceof northlineGeocoder.GeocoderError) {
      return res.status(502).json({
        success: false,
        code: err.code,
        message: GEOCODER_ERROR_MESSAGES[err.code] || GEOCODER_ERROR_MESSAGES.GEOCODER_ERROR,
      });
    }

    console.warn("[npinjam-scanner] geocode gagal:", err && err.message);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Terjadi kesalahan saat mencari lokasi. Silakan coba lagi.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /share  ->  kirim alamat + peta ke nomor WhatsApp
// ---------------------------------------------------------------------------

/** 08xx / 62xx -> 62xx (format yang dibutuhkan whatsapp-web.js). */
function normalizeWaPhone(raw) {
  let digits = String(raw || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!/^62\d{8,13}$/.test(digits)) return null;
  return digits;
}

function buildShareMessage(scan, mapsUrl) {
  const a = scan.address || {};
  const addressText =
    a.formatted_address ||
    [a.alamat, a.kelurahan_desa, a.kecamatan, a.kabupaten_kota, a.provinsi]
      .filter(Boolean)
      .join(", ");

  const lines = ["*Alamat dari Northline*"];
  if (scan.nama) lines.push(`Nama: ${scan.nama}`);
  lines.push("", addressText);

  if (scan.location && Number.isFinite(Number(scan.location.latitude))) {
    lines.push("", "Lokasi: " + mapsUrl);
    lines.push(
      `Titik: ${Number(scan.location.latitude).toFixed(6)}, ${Number(scan.location.longitude).toFixed(6)}`
    );
    if (scan.match_precision && scan.match_precision !== "street") {
      const label = PRECISION_LABEL_ID[scan.match_precision] || scan.match_precision;
      lines.push(`Catatan: titik ini adalah ${label}, bukan posisi persis alamat.`);
    }
  }

  lines.push("", "Dikirim dari NPanel Northline.");
  return lines.join("\n");
}

const PRECISION_LABEL_ID = {
  street: "titik jalan",
  village: "pusat desa/kelurahan",
  district: "pusat kecamatan",
  city: "pusat kota/kabupaten",
};

router.post("/share", readLimiter, adminAuth, async (req, res) => {
  const body = req.body || {};
  const phone = normalizeWaPhone(body.phone);

  if (!phone) {
    return res.status(400).json({
      success: false,
      code: "INVALID_PHONE",
      message: "Nomor WhatsApp tidak valid. Gunakan format 08xx atau 62xx.",
    });
  }

  const scanId = parseInt(body.scan_id, 10);
  let scan = null;

  if (Number.isFinite(scanId) && scanId > 0) {
    try {
      scan = await scanStore.getScan(scanId);
    } catch (err) {
      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Gagal membaca data pindaian.",
      });
    }
    if (!scan) {
      return res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Data pindaian tidak ditemukan.",
      });
    }
  } else {
    // Fallback: kirim dari state di UI tanpa scan_id.
    scan = {
      nama: body.nama || null,
      address: {
        formatted_address: body.formatted_address || null,
        alamat: body.alamat,
        rt_rw: body.rt_rw,
        kelurahan_desa: body.kelurahan_desa,
        kecamatan: body.kecamatan,
        kabupaten_kota: body.kabupaten_kota,
        provinsi: body.provinsi,
      },
      location:
        Number.isFinite(parseFloat(body.latitude)) && Number.isFinite(parseFloat(body.longitude))
          ? { latitude: parseFloat(body.latitude), longitude: parseFloat(body.longitude) }
          : null,
      match_precision: body.match_precision || null,
    };
  }

  if (!scan.address || !scan.address.formatted_address) {
    return res.status(400).json({
      success: false,
      code: "ADDRESS_EMPTY",
      message: "Belum ada alamat untuk dikirim. Jalankan pencarian lokasi dulu.",
    });
  }

  const mapsUrl =
    scan.location && Number.isFinite(Number(scan.location.latitude))
      ? `https://www.google.com/maps/search/?api=1&query=${scan.location.latitude},${scan.location.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(scan.address.formatted_address)}`;

  const message = buildShareMessage(scan, mapsUrl);
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  // Coba kirim lewat sesi WhatsApp server. Kalau tidak tersambung, kembalikan
  // tautan wa.me supaya admin tetap bisa mengirim dari phonesnya.
  const client = req.whatsappClient;
  if (client) {
    try {
      await client.sendMessage(`${phone}@c.us`, message);
      if (Number.isFinite(scanId) && scanId > 0) {
        try {
          await scanStore.markShared(scanId, phone);
        } catch (storeErr) {
          console.warn("[npinjam-scanner] gagal menandai shared:", storeErr.message);
        }
      }
      return res.json({
        success: true,
        data: { delivered: true, via: "whatsapp", phone, message, wa_url: waUrl },
      });
    } catch (err) {
      console.warn("[npinjam-scanner] gagal kirim WA:", err && err.message);
    }
  }

  // Fallback: sesi WhatsApp server tidak tersambung. Tetap tandai rekaman
  // sebagai "sudah dibagikan" supaya admin punya jejak kapan link dibuat -
  // tanpa ini daftar pindaian tidak akan pernah menunjukkan bahwa alamat
  // sudah pernah diserahkan ke admin untuk dikirim manual.
  if (Number.isFinite(scanId) && scanId > 0) {
    try {
      await scanStore.markShared(scanId, phone);
    } catch (storeErr) {
      console.warn("[npinjam-scanner] gagal menandai shared:", storeErr.message);
    }
  }

  return res.json({
    success: true,
    data: { delivered: false, via: "link", phone, message, wa_url: waUrl },
  });
});

// ---------------------------------------------------------------------------
// Rekaman pindaian (dikelola admin)
// ---------------------------------------------------------------------------

router.get("/scans", readLimiter, adminAuth, async (req, res) => {
  try {
    const result = await scanStore.listScans({
      search: req.query.search,
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.warn("[npinjam-scanner] list scans gagal:", err && err.message);
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Gagal memuat daftar pindaian.",
    });
  }
});

router.get("/scans/:id", readLimiter, adminAuth, async (req, res) => {
  try {
    const scan = await scanStore.getScan(req.params.id);
    if (!scan) {
      return res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Data pindaian tidak ditemukan.",
      });
    }
    res.json({ success: true, data: scan });
  } catch (err) {
    console.warn("[npinjam-scanner] get scan gagal:", err && err.message);
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Gagal memuat data pindaian.",
    });
  }
});

router.delete("/scans/:id", readLimiter, adminAuth, async (req, res) => {
  try {
    const removed = await scanStore.deleteScan(req.params.id);
    if (!removed) {
      return res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Data pindaian tidak ditemukan.",
      });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.warn("[npinjam-scanner] delete scan gagal:", err && err.message);
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Gagal menghapus data pindaian.",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /config  ->  status konfigurasi untuk ditampilkan di UI
// ---------------------------------------------------------------------------

router.get("/scanner/config", readLimiter, adminAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      max_upload_size: maxUploadSize(),
      allowed_extensions: ["jpg", "jpeg", "png", "webp"],
      steps: SCAN_STEPS,
      ai_providers: listProviders(),
      geocoder_provider: northlineGeocoder.activeProvider(),
      google_maps_configured: northlineGeocoder.isGoogleConfigured(),
      // Diberi tahu ke UI supaya tidak menjanjikan presisi yang tidak ada.
      geocoder_note: northlineGeocoder.isGoogleConfigured()
        ? "Geocoding memakai Google Maps Platform."
        : "GOOGLE_MAPS_API_KEY belum diatur, memakai Nominatim (OpenStreetMap) dengan presisi lebih terbatas.",
    },
  });
});

module.exports = router;
module.exports.adminAuth = adminAuth;
module.exports.buildConfidence = buildConfidence;
module.exports.buildReviewStatus = buildReviewStatus;