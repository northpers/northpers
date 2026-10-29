// northlineScanStore.js
// Penyimpanan hasil pindaian KTP/KK untuk dikelola admin.
//
// PRIVASI: tidak ada kolom NIK / nomor KK di tabel npinjam_scans, dan fungsi
// di file ini tidak pernah menerima atau menyimpannya. Foto dokumen juga tidak
// disimpan - foto sudah diproses di memori lalu dibuang oleh route.

const db = require("../config/db");

const SCAN_COLUMNS = [
  "document_type",
  "document_type_confidence",
  "nama",
  "alamat",
  "rt_rw",
  "kelurahan_desa",
  "kecamatan",
  "kabupaten_kota",
  "provinsi",
  "confidence_address",
  "confidence_overall",
  "confidence_fields",
  "low_confidence_fields",
  "review_status",
  "review_reason",
  "region_provinsi_match",
  "region_kabupaten_match",
  "latitude",
  "longitude",
  "place_id",
  "location_formatted_address",
  "geocoding_status",
  "geocoding_precision",
  "geocoding_provider",
  "ai_provider",
  "processing_time_ms",
  "admin_id",
];

function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value) {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

/**
 * Simpan hasil pindaian. Geocoding boleh belum dijalankan (location null).
 * Mengembalikan id baris yang baru dibuat.
 */
async function createScan({ scan, location, adminId }) {
  const conf = scan.confidence || {};
  const region = scan.region_check || {};

  const values = {
    document_type: scan.document_type || null,
    document_type_confidence: numOrNull(scan.document_type_confidence),
    nama: scan.nama || null,
    alamat: scan.address ? scan.address.alamat || null : null,
    rt_rw: scan.address ? scan.address.rt_rw || null : null,
    kelurahan_desa: scan.address ? scan.address.kelurahan_desa || null : null,
    kecamatan: scan.address ? scan.address.kecamatan || null : null,
    kabupaten_kota: scan.address ? scan.address.kabupaten_kota || null : null,
    provinsi: scan.address ? scan.address.provinsi || null : null,
    confidence_address: numOrNull(conf.address),
    confidence_overall: numOrNull(conf.overall),
    confidence_fields: JSON.stringify(conf.per_field || {}),
    low_confidence_fields: JSON.stringify(scan.low_confidence_fields || []),
    review_status: scan.review_status || null,
    review_reason: scan.review_reason || null,
    region_provinsi_match: boolOrNull(region.provinsi),
    region_kabupaten_match: boolOrNull(region.kabupaten_kota),
    latitude: location ? numOrNull(location.latitude) : null,
    longitude: location ? numOrNull(location.longitude) : null,
    place_id: location && location.place_id ? String(location.place_id).slice(0, 255) : null,
    location_formatted_address:
      location && location.formatted_address
        ? String(location.formatted_address).slice(0, 255)
        : null,
    geocoding_status: location ? location.geocoding_status || null : null,
    geocoding_precision: location ? location.match_precision || null : null,
    geocoding_provider: location ? location.provider || null : null,
    ai_provider: scan.ai_provider || null,
    processing_time_ms: numOrNull(scan.processing_time_ms),
    admin_id: adminId || null,
  };

  const placeholders = SCAN_COLUMNS.map(() => "?").join(", ");
  const [result] = await db.execute(
    `INSERT INTO npinjam_scans (${SCAN_COLUMNS.join(", ")}) VALUES (${placeholders})`,
    SCAN_COLUMNS.map((c) => values[c])
  );

  return result.insertId;
}

/** Perbarui bagian geocoding + koordinat dari hasil pencarian lokasi. */
async function attachLocation(scanId, location) {
  if (!scanId || !location) return;
  await db.execute(
    `UPDATE npinjam_scans
        SET latitude = ?, longitude = ?, place_id = ?, location_formatted_address = ?,
            geocoding_status = ?, geocoding_precision = ?, geocoding_provider = ?
      WHERE id = ?`,
    [
      numOrNull(location.latitude),
      numOrNull(location.longitude),
      location.place_id ? String(location.place_id).slice(0, 255) : null,
      location.formatted_address ? String(location.formatted_address).slice(0, 255) : null,
      location.geocoding_status || null,
      location.match_precision || null,
      location.provider || null,
      scanId,
    ]
  );
}

/** Tandai bahwa alamat sudah dikirim ke nomor WhatsApp tertentu. */
async function markShared(scanId, phone) {
  if (!scanId) return;
  await db.execute(
    "UPDATE npinjam_scans SET shared_phone = ?, shared_at = NOW() WHERE id = ?",
    [String(phone).slice(0, 20), scanId]
  );
}

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

/** Ubah baris DB jadi bentuk yang enak dipakai UI. */
function rowToScan(row) {
  if (!row) return null;
  return {
    id: row.id,
    document_type: row.document_type,
    document_label: row.document_type,
    document_type_confidence: numOrNull(row.document_type_confidence),
    nama: row.nama,
    address: {
      alamat: row.alamat,
      rt_rw: row.rt_rw,
      kelurahan_desa: row.kelurahan_desa,
      kecamatan: row.kecamatan,
      kabupaten_kota: row.kabupaten_kota,
      provinsi: row.provinsi,
      formatted_address:
        [
          row.alamat,
          row.rt_rw ? `RT ${row.rt_rw}` : "",
          row.kelurahan_desa,
          row.kecamatan,
          row.kabupaten_kota,
          row.provinsi,
        ]
          .filter(Boolean)
          .join(", ") || null,
    },
    confidence: {
      address: numOrNull(row.confidence_address),
      overall: numOrNull(row.confidence_overall),
      per_field: parseJsonColumn(row.confidence_fields, {}),
    },
    low_confidence_fields: parseJsonColumn(row.low_confidence_fields, []),
    review_status: row.review_status,
    review_reason: row.review_reason,
    region_check: {
      provinsi: row.region_provinsi_match === null ? null : !!row.region_provinsi_match,
      kabupaten_kota:
        row.region_kabupaten_match === null ? null : !!row.region_kabupaten_match,
    },
    location:
      row.latitude === null || row.longitude === null
        ? null
        : {
            latitude: numOrNull(row.latitude),
            longitude: numOrNull(row.longitude),
            place_id: row.place_id,
            formatted_address: row.location_formatted_address,
          },
    geocoding_status: row.geocoding_status,
    match_precision: row.geocoding_precision,
    geocoder_provider: row.geocoding_provider,
    ai_provider: row.ai_provider,
    processing_time_ms: row.processing_time_ms,
    shared_phone: row.shared_phone,
    shared_at: row.shared_at,
    created_at: row.created_at,
  };
}

/**
 * Daftar pindaian untuk halaman pengelolaan.
 * filter: { search, status, limit, offset }
 */
async function listScans(filter = {}) {
  const where = [];
  const params = [];

  const search = String(filter.search || "").trim();
  if (search) {
    where.push(
      "(nama LIKE ? OR alamat LIKE ? OR kelurahan_desa LIKE ? OR kecamatan LIKE ? OR kabupaten_kota LIKE ? OR provinsi LIKE ?)"
    );
    for (let i = 0; i < 6; i++) params.push(`%${search}%`);
  }

  const status = String(filter.status || "").trim();
  if (status && status !== "all") {
    where.push("review_status = ?");
    params.push(status);
  }

  const limit = Math.min(Math.max(parseInt(filter.limit, 10) || 25, 1), 100);
  const offset = Math.max(parseInt(filter.offset, 10) || 0, 0);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await db.execute(
    `SELECT * FROM npinjam_scans ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM npinjam_scans ${clause}`,
    params
  );

  return {
    total: Number(countRows[0] ? countRows[0].total : 0),
    limit,
    offset,
    scans: rows.map(rowToScan),
  };
}

async function getScan(id) {
  const [rows] = await db.execute("SELECT * FROM npinjam_scans WHERE id = ?", [id]);
  return rowToScan(rows[0]);
}

async function deleteScan(id) {
  const [result] = await db.execute("DELETE FROM npinjam_scans WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  attachLocation,
  createScan,
  deleteScan,
  getScan,
  listScans,
  markShared,
  rowToScan,
};
