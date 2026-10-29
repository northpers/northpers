const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { safeExtensionFromMime, detectImageExtFromFile } = require("../utils/uploadValidation");

const JWT_SECRET = process.env.JWT_SECRET;

// Ambang similarity (cosine) untuk menyatakan selfie Cocok dengan foto KTP.
// Harus sama dengan SIMILARITY_THRESHOLD di services/face_verify.py.
const FACE_MATCH_THRESHOLD = 0.5;

async function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    token = authHeader.split(" ")[1];
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)nl_jwt=([^;]*)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
        const authData = jwt.verify(token, JWT_SECRET);
    const [[user]] = await db.execute("SELECT auth_version FROM user_northline WHERE id = ?", [authData.id]);
    if (!user || (authData.authVersion || 0) !== user.auth_version) {
      return res.status(401).json({ success: false, message: "Sesi berakhir, silakan login ulang" });
    }
    req.user = authData;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

const multer = require("multer");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, "../uploads/npinjam");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = safeExtensionFromMime(file.mimetype) || ".jpg";
      cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Format harus JPG/PNG/WebP"));
    cb(null, true);
  },
});

function generateLoanNumber() {
  const now = new Date();
  const ym = now.getFullYear().toString().slice(2) + String(now.getMonth() + 1).padStart(2, "0");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return "NPJ-" + ym + "-" + rand;
}

// Hasil verifikasi wajah dari service InsightFace.
//
// Penting: `available` membedakan dua kondisi yang TIDAK BOLEH dicampur:
//   available=false -> mesinnya tidak jalan (python hilang, model tak ada,
//                      gambar tidak terbaca). Ini bukan "wajah cocok".
//   available=true  -> mesin jalan dan memang menilai kecocokan.
// Sebelumnya semua kegagalan dikembalikan sebagai { success: true, score: 0 },
// sehingga "tidak bisa diverifikasi" terlihat identik dengan "lolos".
function faceUnavailable(message) {
  return { available: false, success: false, score: null, message };
}

// Hapus file yang sudah ditulis multer ke disk.
//
// WAJIB dipanggil di setiap jalur keluar sebelum file di-commit ke database.
// diskStorage menulis file SEBELUM handler berjalan, jadi setiap return
// 400/403/500 setelah upload akan meninggalkan file yatim di uploads/ kalau
// tidak dibersihkan. Kalau tidak, setiap percobaan gagal menumpuk file.
function discardUploads(files) {
  const list = Array.isArray(files) ? files : files ? [files] : [];
  for (const f of list) {
    if (!f || !f.filename) continue;
    fs.unlink(path.join(__dirname, "../uploads/npinjam", f.filename), () => {});
  }
}

function verifyFaces(ktpPath, selfiePath) {
  return new Promise((resolve) => {
    const pythonBin = process.env.FACE_VERIFY_PYTHON || "/home/hostinesia/northline/.venv/bin/python3";
    const pythonProcess = spawn(pythonBin, [
      "/home/hostinesia/northline/backend/services/face_verify.py",
      ktpPath,
      selfiePath
    ]);

    let stdout = "";
    let stderr = "";

    pythonProcess.on("error", (err) => {
      console.error("Face verify spawn error:", err);
      resolve(faceUnavailable("Verifikasi wajah tidak tersedia"));
    });
    pythonProcess.stdout.on("data", (data) => { stdout += data.toString(); });
    pythonProcess.stderr.on("data", (data) => { stderr += data.toString(); });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Face verify error:", stderr);
        resolve(faceUnavailable("Verifikasi wajah tidak tersedia"));
        return;
      }
      try {
        const lines = stdout.trim().split("\n");
        const result = JSON.parse(lines[lines.length - 1]);
        const score = Number.isFinite(parseFloat(result.score)) ? parseFloat(result.score) : null;
        // Percayai flag available dari python: ia yang tahu apakah mesinnya
        // bisa dipakai. Default true supaya script versi lama yang tidak
        // mengirim flag ini tetap dianggap "mesin jalan".
        const available = result.available !== false;
        resolve({
          available,
          success: available && result.success === true && score !== null && score >= FACE_MATCH_THRESHOLD,
          score: available ? score : null,
          message: result.message || "",
        });
      } catch (e) {
        console.error("Face verify parse error:", stdout.slice(-300), e.message);
        resolve(faceUnavailable("Verifikasi wajah tidak tersedia"));
      }
    });
  });
}

router.get("/status", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [profile] = await db.execute("SELECT * FROM npinjam_profiles WHERE user_id=?", [userId]);
    const [application] = await db.execute(
      "SELECT * FROM npinjam_applications WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    const [loans] = await db.execute(
      "SELECT * FROM npinjam_loans WHERE user_id=? AND status IN ('pending','active') ORDER BY created_at DESC",
      [userId]
    );
    const [bills] = await db.execute(
      `SELECT ni.*, nl.loan_number, nl.principal, nl.tenor_months
       FROM npinjam_installments ni
       JOIN npinjam_loans nl ON ni.loan_id=nl.id
       WHERE nl.user_id=? AND ni.status IN ('pending','overdue')
       ORDER BY ni.due_date ASC LIMIT 10`,
      [userId]
    );
    res.json({
      success: true,
      application: application[0] || null,
      profile: profile[0] || null,
      activeLoans: loans,
      bills,
    });
  } catch (err) {
    console.error("NPinjam status error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/apply", verifyToken, upload.fields([
  { name: "ktp_front", maxCount: 1 },
  { name: "ktp_selfie", maxCount: 1 },
]), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      nik, full_name, birth_place, birth_date, gender,
      address_province, address_city, address_district, address_village,
      address_rt_rw, address_postal_code, address_detail,
      job_type, job_industry, monthly_income_range, income_source,
      mother_maiden_name,
      emergency_contact_1_name, emergency_contact_1_phone,
      emergency_contact_2_name, emergency_contact_2_phone,
    } = req.body;

    if (!nik || !full_name || !birth_date || !gender || !address_city || !mother_maiden_name) {
      discardUploads(req.files);
      return res.status(400).json({ success: false, message: "Data diri wajib dilengkapi" });
    }
    if (nik.length !== 16) {
      discardUploads(req.files);
      return res.status(400).json({ success: false, message: "NIK harus 16 digit" });
    }
    if (!emergency_contact_1_name || !emergency_contact_1_phone || !emergency_contact_2_name || !emergency_contact_2_phone) {
      discardUploads(req.files);
      return res.status(400).json({ success: false, message: "Kontak darurat wajib dilengkapi" });
    }

    const [existing] = await db.execute(
      "SELECT id FROM npinjam_applications WHERE user_id=?",
      [userId]
    );
    if (existing.length > 0) {
      discardUploads(req.files);
      return res.status(400).json({ success: false, message: "Akun ini sudah memiliki pengajuan NPinjam. Tidak dapat mengajukan kembali." });
    }

    const ktpFront = req.files?.ktp_front?.[0];
    const ktpSelfie = req.files?.ktp_selfie?.[0];

    if (!ktpFront || !ktpSelfie) {
      discardUploads(req.files);
      return res.status(400).json({ success: false, message: "Foto KTP depan dan selfie KTP wajib diupload" });
    }

    const ktpFrontPath = path.join(__dirname, "../uploads/npinjam", ktpFront.filename);
    const ktpSelfiePath = path.join(__dirname, "../uploads/npinjam", ktpSelfie.filename);
    for (const fp of [ktpFrontPath, ktpSelfiePath]) {
      if (!detectImageExtFromFile(fp)) {
        discardUploads(req.files);
        return res.status(400).json({ success: false, message: "Salah satu file bukan gambar yang valid" });
      }
    }

    // Verifikasi wajah WAJIB dijalankan server. Nilai face_match_score dan
    // liveness_passed dari req.body TIDAK lagi dipercaya: keduanya bisa
    // dipalsukan siapa saja, dan sebelumnya nilai itulah yang ditampilkan ke
    // admin serta ikut menghitung skor kredit.
    const verification = await verifyFaces(ktpFrontPath, ktpSelfiePath);

    // Kalau mesinnya jalan dan menyatakan tidak cocok, pengajuan ditolak di
    // sini. Admin tidak perlu memeriksa manual hanya untuk kasus ini.
    // Kalau mesinnya tidak tersedia (available=false) pengajuan tetap
    // diterima dan ditandai untuk review manual - unggahan KTP tidak bisa
    // ditolak hanya karena server sedang bermasalah.
    if (verification.available && !verification.success) {
      discardUploads(req.files);
      return res.status(400).json({
        success: false,
        code: "FACE_MISMATCH",
        face_verify_score: verification.score,
        message:
          verification.message ||
          "Wajah pada selfie tidak cocok dengan foto KTP. Silakan ulangi dengan wajah terlihat jelas dan pencahayaan cukup.",
      });
    }

    const ktpFrontUrl = ktpFront.filename;
    const ktpSelfieUrl = ktpSelfie.filename;

    await db.execute(
      `INSERT INTO npinjam_applications
      (user_id, nik, full_name, birth_place, birth_date, gender,
       address_province, address_city, address_district, address_village,
       address_rt_rw, address_postal_code, address_detail,
       job_type, job_industry, monthly_income_range, income_source,
       mother_maiden_name,
       emergency_contact_1_name, emergency_contact_1_phone,
       emergency_contact_2_name, emergency_contact_2_phone,
       ktp_front_url, ktp_selfie_url,
       face_match_score, liveness_passed, face_verify_score, face_verify_message,
       facial_verification_status, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
      [userId, nik, full_name, birth_place, birth_date, gender,
       address_province, address_city, address_district, address_village,
       address_rt_rw, address_postal_code, address_detail,
       job_type, job_industry, monthly_income_range, income_source,
       mother_maiden_name,
       emergency_contact_1_name, emergency_contact_1_phone,
       emergency_contact_2_name, emergency_contact_2_phone,
       ktpFrontUrl, ktpSelfieUrl,
       // face_match_score diisi dari hasil server, bukan dari klien.
       verification.score,
       // Liveness hanya dianggap lulus bila selfie memang terdeteksi wajah dan
       // engine menilai wajah pada foto selfie. Tidak ada lagi nilai dari klien.
       verification.available && verification.success ? 1 : 0,
       verification.score,
       (verification.message || null),
       verification.available ? (verification.success ? "verified" : "mismatch") : "unavailable"]
    );

    await db.execute(
      "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
      [userId, "Pengajuan NPinjam", "Pengajuan aktivasi NPinjam Anda berhasil dikirim. Tim kami akan memverifikasi dalam 1-2 hari kerja."]
    );

    res.json({ success: true, message: "Pengajuan NPinjam berhasil dikirim. Silakan tunggu verifikasi." });
  } catch (err) {
    console.error("NPinjam apply error:", err);
    // Jangan sisakan file yatim kalau INSERT gagal.
    discardUploads(req.files);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [profile] = await db.execute("SELECT * FROM npinjam_profiles WHERE user_id=?", [userId]);
    const p = profile[0];

    if (!p || !p.is_active) {
      return res.json({
        success: true,
        active: false,
        message: "Akun NPinjam belum diaktifkan",
      });
    }

    const [loans] = await db.execute(
      "SELECT * FROM npinjam_loans WHERE user_id=? AND status='active' ORDER BY created_at DESC",
      [userId]
    );
    const [bills] = await db.execute(
      `SELECT ni.*, nl.loan_number, nl.principal, nl.tenor_months
       FROM npinjam_installments ni JOIN npinjam_loans nl ON ni.loan_id=nl.id
       WHERE nl.user_id=? AND ni.status IN ('pending','overdue') ORDER BY ni.due_date ASC`,
      [userId]
    );

    let totalOutstanding = 0;
    let totalOverdue = 0;
    for (const loan of loans) {
      const [installments] = await db.execute(
        "SELECT SUM(total_amount) as total, SUM(CASE WHEN status='pending' OR status='overdue' THEN total_amount ELSE 0 END) as outstanding, SUM(CASE WHEN status='overdue' THEN total_amount ELSE 0 END) as overdue FROM npinjam_installments WHERE loan_id=?",
        [loan.id]
      );
      totalOutstanding += parseFloat(installments[0].outstanding || 0);
      totalOverdue += parseFloat(installments[0].overdue || 0);
    }

    res.json({
      success: true,
      active: true,
      profile: p,
      totalOutstanding,
      totalOverdue,
      activeLoans: loans,
      bills,
      availableLimit: parseFloat(p.available_limit || 0),
    });
  } catch (err) {
    console.error("NPinjam dashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/loans", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    let where = "WHERE user_id=?";
    const params = [userId];
    if (status && status !== "all") {
      where += " AND status=?";
      params.push(status);
    }
    const [loans] = await db.execute(
      `SELECT nl.*, 
        (SELECT COUNT(*) FROM npinjam_installments ni WHERE ni.loan_id=nl.id AND ni.status='paid') as paid_count,
        (SELECT COUNT(*) FROM npinjam_installments ni WHERE ni.loan_id=nl.id) as total_count
       FROM npinjam_loans nl ${where} ORDER BY nl.created_at DESC`,
      params
    );
    res.json({ success: true, loans });
  } catch (err) {
    console.error("NPinjam loans error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/loans/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const [loans] = await db.execute(
      "SELECT * FROM npinjam_loans WHERE id=? AND user_id=?",
      [id, userId]
    );
    if (loans.length === 0) return res.status(404).json({ success: false, message: "Pinjaman tidak ditemukan" });

    const [installments] = await db.execute(
      "SELECT * FROM npinjam_installments WHERE loan_id=? ORDER BY installment_no ASC",
      [id]
    );

    const loan = loans[0];
    const paidCount = installments.filter(i => i.status === "paid").length;
    const overdueCount = installments.filter(i => i.status === "overdue").length;
    const remainingAmount = installments
      .filter(i => i.status !== "paid")
      .reduce((sum, i) => sum + parseFloat(i.total_amount), 0);

    res.json({
      success: true,
      loan,
      installments,
      paidCount,
      overdueCount,
      remainingAmount,
      totalInstallments: installments.length,
    });
  } catch (err) {
    console.error("NPinjam loan detail error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/bills", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [bills] = await db.execute(
      `SELECT ni.*, nl.loan_number, nl.principal, nl.tenor_months
       FROM npinjam_installments ni JOIN npinjam_loans nl ON ni.loan_id=nl.id
       WHERE nl.user_id=? AND ni.status IN ('pending','overdue') ORDER BY ni.due_date ASC`,
      [userId]
    );
    res.json({ success: true, bills });
  } catch (err) {
    console.error("NPinjam bills error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Multipart untuk selfie verifikasi saat mengajukan pinjaman.
// Dipisah dari `upload` (diskStorage) karena foto ini hanya perlu hidup
// selama proses verifikasi - tidak perlu disimpan ke uploads/.
const loanSelfieUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Format harus JPG/PNG/WebP"));
    cb(null, true);
  },
});

// Foto KTP yang disetujui admin saat pendaftaran. Ini foto yang benar-benar
// harus dibandingkan dengan selfie baru - bukan foto selfie yang dulu, karena itu
// hanya membuktikan "orang yang sama lagi", bukan "pemohon KTP ini".
router.post("/loans", verifyToken, loanSelfieUpload.single("selfie"), async (req, res) => {
  try {
    const userId = req.user.id;
    const { loan_amount, tenure_months, purpose, bank_name, bank_account_number, bank_account_name } = req.body;
    const purposeClean = purpose || null;

    const amount = parseFloat(loan_amount);
    const tenure = parseInt(tenure_months);

    if (!amount || amount < 50000) {
      return res.status(400).json({ success: false, message: "Nominal pinjaman minimal Rp 50.000" });
    }
    if (tenure < 1 || tenure > 4) {
      return res.status(400).json({ success: false, message: "Tenor harus 1-4 minggu" });
    }
    if (!bank_name) {
      return res.status(400).json({ success: false, message: "Nama bank wajib diisi" });
    }
    if (!bank_account_number || !/^\d{6,20}$/.test(String(bank_account_number))) {
      return res.status(400).json({ success: false, message: "Nomor rekening bank tidak valid (6-20 digit)" });
    }
    if (!bank_account_name) {
      return res.status(400).json({ success: false, message: "Nama pemilik rekening wajib diisi" });
    }

    const [profile] = await db.execute("SELECT * FROM npinjam_profiles WHERE user_id=?", [userId]);
    if (profile.length === 0 || !profile[0].is_active) {
      return res.status(403).json({ success: false, message: "Akun NPinjam belum aktif" });
    }

    const p = profile[0];
    const tier = p.tier;
    if (amount > parseFloat(p.available_limit)) {
      return res.status(400).json({ success: false, message: "Nominal melebihi limit tersedia" });
    }

    const [tierConfig] = await db.execute("SELECT * FROM npinjam_tiers WHERE tier_key=?", [tier]);
    if (tierConfig.length === 0) {
      return res.status(500).json({ success: false, message: "Tier konfigurasi tidak ditemukan" });
    }

    const tc = tierConfig[0];
    const flatRate = parseFloat(tc.interest_rate_monthly) / 100;
    const rawTotal = amount * (1 + flatRate);
    const weeklyInstallment = Math.round((rawTotal / tenure) * 100) / 100;
    const totalPayable = Math.round(weeklyInstallment * tenure * 100) / 100;
    const firstDueDate = new Date();
    firstDueDate.setDate(firstDueDate.getDate() + 7);
    const maturityDate = new Date(firstDueDate);
    maturityDate.setDate(maturityDate.getDate() + (tenure - 1) * 7);

    // --- Verifikasi wajah wajib, dilakukan server ---
    // req.body.face_verify_score sengaja DIABAIKAN: nilai itu dikirim browser
    // dan bisa diubah siapa saja. Foto KTP dari pendaftaran yang jadi acuan.
    const selfieFile = req.file;
    if (!selfieFile) {
      return res.status(400).json({
        success: false,
        code: "FACE_SELFIE_REQUIRED",
        message: "Selfie wajah wajib diupload untuk mengajukan pinjaman.",
      });
    }

    const [apps] = await db.execute(
      `SELECT ktp_front_url FROM npinjam_applications
       WHERE user_id=? AND status='approved'
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (apps.length === 0 || !apps[0].ktp_front_url) {
      return res.status(400).json({
        success: false,
        code: "KTP_NOT_FOUND",
        message: "Foto KTP tidak ditemukan pada pengajuan yang telah disetujui.",
      });
    }

    const ktpRefPath = path.join(__dirname, "../uploads/npinjam", apps[0].ktp_front_url);
    if (!fs.existsSync(ktpRefPath) || !detectImageExtFromFile(ktpRefPath)) {
      return res.status(400).json({
        success: false,
        code: "KTP_FILE_MISSING",
        message: "File foto KTP tidak tersedia. Hubungi admin untuk upload ulang.",
      });
    }

    // Tulis selfie ke file sementara supaya bisa dibaca subprocess InsightFace.
    const tmpSelfiePath = path.join(
      __dirname,
      "../uploads/npinjam",
      `tmp-selfie-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
    );
    fs.writeFileSync(tmpSelfiePath, selfieFile.buffer);
    let verification;
    try {
      verification = await verifyFaces(ktpRefPath, tmpSelfiePath);
    } finally {
      fs.unlink(tmpSelfiePath, () => {});
    }

    if (verification.available && !verification.success) {
      return res.status(400).json({
        success: false,
        code: "FACE_MISMATCH",
        face_verify_score: verification.score,
        message:
          verification.message ||
          "Wajah pada selfie tidak cocok dengan foto KTP Anda. Silakan ulangi dengan wajah terlihat jelas.",
      });
    }

    const faceScore = verification.score;
    // null score berarti engine tidak jalan, bukan "nilai 0".
    const faceStatus = verification.available ? (verification.success ? "verified" : "mismatch") : "unavailable";
    const loanNumber = generateLoanNumber();
    const [existing] = await db.execute(
      "SELECT id FROM npinjam_loans WHERE user_id=? AND status IN ('pending','active') LIMIT 1",
      [userId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Anda masih memiliki pinjaman yang belum lunas. Selesaikan pinjaman terlebih dahulu sebelum mengajukan yang baru." });
    }

    const [result] = await db.execute(
      `INSERT INTO npinjam_loans
      (user_id, loan_number, principal, interest_rate_monthly, tenor_months,
       monthly_installment, total_payable, status, purpose, first_due_date, maturity_date,
       bank_name, bank_account_number, bank_account_name, face_verify_score, facial_verification_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, loanNumber, amount, tc.interest_rate_monthly, tenure,
       weeklyInstallment, totalPayable, "pending", purposeClean,
       firstDueDate.toISOString().split("T")[0], maturityDate.toISOString().split("T")[0],
       bank_name, String(bank_account_number), bank_account_name,
       faceScore, faceStatus]
    );

    const loanId = result.insertId;

    await db.execute(
      "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
      [userId, "Pengajuan Pinjaman Dikirim", `Pengajuan pinjaman Rp ${amount.toLocaleString('id-ID')} (tenor ${tenure} minggu) telah dikirim. Tim kami akan memverifikasi maksimal 1x24 jam kerja.`]
    );

    res.json({
      success: true,
      loanNumber,
      loanId,
      amount,
      weeklyInstallment,
      totalPayable,
      tenure,
      message: "Pengajuan pinjaman dikirim. Menunggu verifikasi admin.",
    });
  } catch (err) {
    console.error("NPinjam create loan error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/pay/:installmentId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { installmentId } = req.params;
    const { payment_method } = req.body;

    const [installment] = await db.execute(
      "SELECT ni.*, nl.user_id, nl.loan_number FROM npinjam_installments ni JOIN npinjam_loans nl ON ni.loan_id=nl.id WHERE ni.id=? AND nl.user_id=?",
      [installmentId, userId]
    );
    if (installment.length === 0) return res.status(404).json({ success: false, message: "Cicilan tidak ditemukan" });
    if (installment[0].status === "paid") return res.status(400).json({ success: false, message: "Cicilan sudah dibayar" });

    const ins = installment[0];
    const [paymentResult] = await db.execute(
      `INSERT INTO npinjam_payments (loan_id, installment_id, amount, payment_method, status)
       VALUES (?,?,?,?,'pending')`,
      [ins.loan_id, installmentId, ins.total_amount, payment_method]
    );
    const paymentId = paymentResult.insertId;

    await db.execute(
      "UPDATE npinjam_installments SET status='paid', paid_amount=?, paid_at=NOW(), payment_method=?, transaction_id=? WHERE id=?",
      [ins.total_amount, payment_method, "TXN-" + paymentId, installmentId]
    );

    await db.execute(
      "UPDATE npinjam_payments SET status='success', transaction_id=? WHERE id=?",
      ["TXN-" + paymentId, paymentId]
    );

    await db.execute(
      "UPDATE npinjam_profiles SET total_outstanding = GREATEST(total_outstanding - ?, 0), used_limit = GREATEST(used_limit - ?, 0), available_limit = LEAST(max_limit, available_limit + ?) WHERE user_id=?",
      [ins.total_amount, ins.total_amount, ins.total_amount, userId]
    );

    const [allInstallments] = await db.execute(
      "SELECT * FROM npinjam_installments WHERE loan_id=? AND status!='paid'",
      [ins.loan_id]
    );
    const allPaid = allInstallments.length === 0;
    if (allPaid) {
      await db.execute("UPDATE npinjam_loans SET status='paid' WHERE id=?", [ins.loan_id]);
      await db.execute(
        "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
        [userId, "Pinjaman Lunas", `Pinjaman ${ins.loan_number} telah lunas. Limit Anda telah dipulihkan.`]
      );
    } else {
      const [remainingBills] = await db.execute(
        "SELECT * FROM npinjam_installments WHERE loan_id=? AND status IN ('pending','overdue') ORDER BY due_date ASC LIMIT 1",
        [ins.loan_id]
      );
      if (remainingBills.length > 0) {
        const nextDue = new Date(remainingBills[0].due_date);
        await db.execute(
          "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
          [userId, "Cicilan Berhasil", `Cicilan ke-${remainingBills[0].installment_no} berhasil dibayar. Cicilan berikutnya jatuh tempo ${nextDue.toLocaleDateString('id-ID')}.`]
        );
      }
    }

    res.json({ success: true, message: "Pembayaran cicilan berhasil", paymentId });
  } catch (err) {
    console.error("NPinjam pay error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/early-pay/:loanId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { loanId } = req.params;
    const [loan] = await db.execute(
      "SELECT * FROM npinjam_loans WHERE id=? AND user_id=? AND status='active'",
      [loanId, userId]
    );
    if (loan.length === 0) return res.status(404).json({ success: false, message: "Pinjaman tidak ditemukan" });

    const l = loan[0];
    const [remaining] = await db.execute(
      "SELECT * FROM npinjam_installments WHERE loan_id=? AND status NOT IN ('paid') ORDER BY installment_no ASC",
      [loanId]
    );

    let totalRemaining = 0;
    for (const ins of remaining) {
      const lateDays = Math.max(0, Math.floor((new Date() - new Date(ins.due_date)) / (1000 * 60 * 60 * 24)));
      const lateFee = lateDays > 0 ? Math.round(parseFloat(ins.total_amount) * 0.001 * lateDays * 100) / 100 : 0;
      totalRemaining += parseFloat(ins.total_amount) + lateFee;
    }

    const discount = Math.round(totalRemaining * 0.05 * 100) / 100;
    const finalAmount = Math.round((totalRemaining - discount) * 100) / 100;

    res.json({
      success: true,
      loanNumber: l.loan_number,
      remainingBalance: totalRemaining,
      earlySettlementDiscount: discount,
      finalAmount,
      remainingInstallments: remaining.length,
    });
  } catch (err) {
    console.error("NPinjam early pay error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const WILAYAH = require("../data/wilayah.json");
const PROVINCES = WILAYAH.provinces;

router.get("/provinces", async (req, res) => {
  res.json({ success: true, provinces: PROVINCES });
});

router.get("/cities", async (req, res) => {
  const province = (req.query.province || "").trim().toUpperCase();
  const cities = WILAYAH.citiesByProvince[province];
  if (!cities) {
    return res.status(400).json({ success: false, message: "Provinsi tidak ditemukan" });
  }
  res.json({ success: true, cities });
});

router.post("/activate", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [app] = await db.execute(
      "SELECT * FROM npinjam_applications WHERE user_id=? AND status='approved' ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (app.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada pengajuan yang disetujui" });
    }
    const [existing] = await db.execute("SELECT user_id FROM npinjam_profiles WHERE user_id=?", [userId]);
    if (existing.length === 0) {
      await db.execute(
        "INSERT INTO npinjam_profiles (user_id, score, tier, max_limit, available_limit, used_limit, is_active, activated_at) VALUES (?, 0, 'none', 0, 0, 0, TRUE, NOW())",
        [userId]
      );
    } else {
      await db.execute("UPDATE npinjam_profiles SET is_active=TRUE, activated_at=NOW() WHERE user_id=?", [userId]);
    }
    const { invalidateByPrefix } = require('../config/redis');
    await invalidateByPrefix(`user:flags:${userId}`);
    await invalidateByPrefix(`user:vouchers:${userId}`);
    await db.execute(
      "INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)",
      [userId, "NPinjam Aktif!", "Akun NPinjam Anda telah diaktifkan. Anda sekarang dapat mengajukan pinjaman."]
    );
    res.json({ success: true, message: "NPinjam berhasil diaktifkan" });
  } catch (err) {
    console.error("NPinjam activate error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
