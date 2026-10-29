#!/usr/bin/env node
/**
 * Bersihkan file upload NPinjam yang tidak lagi direferensikan database.
 *
 * PENTING: jangan pernah `rm -f backend/uploads/npinjam/*`. Folder itu berisi
 * foto KTP asli yang masih ditunjuk baris npinjam_applications /
 * npinjam_loans. Menghapus file yang masih dipakai membuat pengajuan tidak
 * bisa direview dan pengajuan pinjaman berikutnya gagal dengan
 * KTP_FILE_MISSING - dan file-nya tidak bisa dipulihkan karena uploads/
 * di-gitignore.
 *
 * Script ini hanya menghapus file yang:
 *   1. namanya cocok pola file upload (timestamp-prefixed), DAN
 *   2. tidak disebut di kolom ktp_front_url / ktp_selfie_url mana pun.
 *
 * Jalankan dari root repo:
 *   node backend/scripts/cleanupNpinjamUploads.js          # dry-run
 *   node backend/scripts/cleanupNpinjamUploads.js --apply
 */

const path = require("path");
const fs = require("fs");
const db = require("../config/db");

const UPLOAD_DIR = path.join(__dirname, "../uploads/npinjam");
const APPLY = process.argv.includes("--apply");

// Samakan dengan multer di routes/npinjam.js: Date.now()-<random><ext>
const UPLOAD_NAME_RE = /^\d{13}-\d+\.(jpg|jpeg|png|webp)$/i;

async function referencedFiles() {
  const referenced = new Set();
  const queries = [
    ["npinjam_applications", "ktp_front_url"],
    ["npinjam_applications", "ktp_selfie_url"],
  ];
  for (const [table, column] of queries) {
    const [rows] = await db.execute(`SELECT ${column} AS f FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`);
    for (const row of rows) referenced.add(row.f);
  }
  // Loans memakai ktp_front_url dari application yang di-approve; tabel
  // npinjam_loans tidak menyimpan filename sendiri.
  return referenced;
}

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log("Folder upload tidak ada:", UPLOAD_DIR);
    return;
  }

  const referenced = await referencedFiles();
  const entries = fs.readdirSync(UPLOAD_DIR).filter((name) => fs.statSync(path.join(UPLOAD_DIR, name)).isFile());

  const orphans = [];
  const kept = [];
  for (const name of entries) {
    if (referenced.has(name)) kept.push(name);
    else if (UPLOAD_NAME_RE.test(name)) orphans.push(name);
    // File yang bukan pola upload (mis. tmp-selfie-*) dibiarkan: nama
    // tersebut belum tentu milik lifecycle yang kita kenal.
  }

  console.log(`Total file       : ${entries.length}`);
  console.log(`Dipakai database : ${kept.length}`);
  console.log(`Yatim (dihapus)  : ${orphans.length}`);

  // File yang ditunjuk database tapi sudah tidak ada di disk. Dicek terhadap
  // daftar `referenced` secara langsung - bukan terhadap `entries`, karena
  // file yang hilang memang tidak akan pernah muncul di iterasi.
  const missing = [...referenced].filter((n) => !fs.existsSync(path.join(UPLOAD_DIR, n)));
  if (missing.length > 0) {
    console.warn("\nPERINGATAN: baris database menunjuk file yang sudah hilang:");
    for (const n of missing) console.warn("  -", n);
    console.warn("  Pengajuan terkait perlu minta user upload ulang KTP.");
  }

  if (!APPLY) {
    console.log("\nDry-run. Jalankan dengan --apply untuk benar-benar menghapus.");
    if (orphans.length) console.log("Contoh:", orphans.slice(0, 5).join(", "));
    return;
  }

  for (const name of orphans) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, name));
    } catch (e) {
      console.error("Gagal hapus", name, e.message);
    }
  }
  console.log(`\n${orphans.length} file yatim dihapus.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
