const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;

async function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.split(' ')[1];
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)nl_jwt=([^;]*)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
        const authData = jwt.verify(token, JWT_SECRET);
    const [[user]] = await db.execute("SELECT auth_version FROM user_northline WHERE id = ?", [authData.id]);
    if (!user || (authData.authVersion || 0) !== user.auth_version) {
      return res.status(401).json({ success: false, message: "Sesi berakhir, silakan login ulang" });
    }
    req.user = authData;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

router.post('/students', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nama siswa wajib diisi',
      });
    }
    const qrToken = crypto.randomUUID();
    const [result] = await db.execute(
      `
                INSERT INTO students
                (
                    name,
                    qr_token
                )
                VALUES
                (
                    ?, ?
                )
                `,
      [name.trim(), qrToken],
    );
    const studentId = result.insertId;
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const nis = `${year}${month}${day}${hour}${minute}${String(studentId).padStart(4, '0')}`;
    await db.execute(
      `
            UPDATE students
            SET nis = ?
            WHERE id = ?
            `,
      [nis, studentId],
    );

    res.json({
      success: true,
      message: 'Siswa berhasil ditambahkan',
      student: {
        id: studentId,
        name: name.trim(),
        nis,
        qrToken,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan',
    });
  }
});

router.get('/students', async (req, res) => {
  try {
    const [rows] = await db.execute(`
            SELECT
                id,
                name,
                nis,
                qr_token,
                created_at
            FROM students
            ORDER BY id DESC
        `);

    res.json(rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data siswa',
    });
  }
});

router.post('/attendance/scan', async (req, res) => {
  try {
    const { token } = req.body;
    const [studentRows] = await db.execute(
      `
                SELECT *
                FROM students
                WHERE qr_token = ?
                `,
      [token],
    );
    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'QR tidak ditemukan',
      });
    }
    const student = studentRows[0];
    const [todayAttendance] = await db.execute(
      `
                SELECT *
                FROM attendance
                WHERE student_id = ?
                AND attendance_date = CURDATE()
                `,
      [student.id],
    );
    if (todayAttendance.length > 0) {
      return res.json({
        success: true,
        already: true,
        student,
      });
    }
    await db.execute(
      `
  INSERT INTO attendance
  (
      student_id,
      attendance_date,
      attendance_time,
      status
  )
  VALUES
  (
      ?,
      CURDATE(),
      CURTIME(),
      'Hadir'
  )
  `,
      [student.id],
    );

    const [attendance] = await db.execute(
      `
  SELECT attendance_time
  FROM attendance
  WHERE student_id = ?
  AND attendance_date = CURDATE()
  LIMIT 1
  `,
      [student.id],
    );

    res.json({
      success: true,
      already: false,
      student,
      attendance_time: attendance[0].attendance_time,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

router.get('/attendance/today', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        s.name,
        s.nis,
        a.attendance_time,
        a.status
      FROM attendance a
      JOIN students s
        ON s.id = a.student_id
      WHERE a.attendance_date = CURDATE()
      AND a.status = 'hadir'
      ORDER BY a.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.get('/attendance/count', async (req, res) => {
  try {
    const [[hadir]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'hadir'
    `);

    const [[izin]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'izin'
    `);

    const [[sakit]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'sakit'
    `);

    const [[alpha]] = await db.execute(`
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'alpha'
    `);

    res.json({
      hadir: hadir.total,
      izin: izin.total,
      sakit: sakit.total,
      alpha: alpha.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ hadir: 0, izin: 0, sakit: 0, alpha: 0 });
  }
});

router.get('/dashboard/stats', async (req, res) => {
  try {
    const [students] = await db.execute(`
      SELECT COUNT(*) AS total_students FROM students
    `);

    const [attendance] = await db.execute(`
      SELECT COUNT(*) AS total_attendance
      FROM attendance
      WHERE attendance_date = CURDATE()
    `);

    res.json({
      totalStudents: students[0].total_students,
      totalAttendance: attendance[0].total_attendance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.get('/dashboard/chart', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        attendance_date,
        COUNT(*) as total
      FROM attendance
      WHERE attendance_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY attendance_date
      ORDER BY attendance_date ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.get('/attendance/today-full', async (req, res) => {
  try {
    const [students] = await db.execute(`
      SELECT id, name, nis FROM students
    `);

    const [attendance] = await db.execute(`
      SELECT student_id, status
      FROM attendance
      WHERE attendance_date = CURDATE()
    `);

    const map = {};
    attendance.forEach((a) => {
      map[a.student_id] = a.status;
    });

    const result = students.map((s) => ({
      id: s.id,
      name: s.name,
      nis: s.nis,
      status: map[s.id] || 'alpha',
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.post('/attendance/manual', async (req, res) => {
  const { student_id, status } = req.body;

  try {
    const [rows] = await db.execute(
      `
      SELECT id
      FROM attendance
      WHERE student_id = ?
      AND attendance_date = CURDATE()
      `,
      [student_id],
    );

    if (rows.length > 0) {
      await db.execute(
        `
        UPDATE attendance
        SET status = ?
        WHERE id = ?
        `,
        [status, rows[0].id],
      );
    } else {
      await db.execute(
        `
        INSERT INTO attendance (
          student_id,
          attendance_date,
          attendance_time,
          status
        )
        VALUES (?, CURDATE(), CURTIME(), ?)
        `,
        [student_id, status],
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.get('/students/absent', async (req, res) => {
  const [rows] = await db.query(`
    SELECT 
      s.id,
      s.name,
      s.nis,
      a.status
    FROM students s
    LEFT JOIN attendance a
      ON s.id = a.student_id
      AND a.attendance_date = CURDATE()
    WHERE a.status IS NULL OR a.status != 'hadir'
  `);

  res.json(rows);
});

router.get('/attendance/by-week', async (req, res) => {
  const { start, end } = req.query;

  const [rows] = await db.execute(`
    SELECT
      attendance_date,
      COUNT(CASE WHEN status='hadir' THEN 1 END) AS hadir,
      COUNT(CASE WHEN status='izin' THEN 1 END) AS izin,
      COUNT(CASE WHEN status='sakit' THEN 1 END) AS sakit,
      COUNT(CASE WHEN status='alpha' THEN 1 END) AS alpha,
      COUNT(*) AS total
    FROM attendance
    WHERE attendance_date BETWEEN ? AND ?
    GROUP BY attendance_date
    ORDER BY attendance_date DESC
  `, [start, end]);

  res.json(
    rows.map(r => ({
      date: new Date(r.attendance_date)
        .toLocaleDateString('id-ID'),
      hadir: r.hadir,
      izin: r.izin,
      sakit: r.sakit,
      alpha: r.alpha,
      total: r.total,
    }))
  );
});

router.post('/settings', verifyToken, async (req, res) => {
  const {
    school_name,
    attendance_start,
    attendance_end,
    attendance_days,
    auto_reset,
    scan_notif,
  } = req.body;

  await db.execute(
    `
    UPDATE settings
    SET
      school_name = ?,
      attendance_start = ?,
      attendance_end = ?,
      attendance_days = ?,
      auto_reset = ?,
      scan_notif = ?
    WHERE id = 1
    `,
    [
      school_name,
      attendance_start,
      attendance_end,
      JSON.stringify(attendance_days),
      auto_reset,
      scan_notif,
    ]
  );

  res.json({
    success: true,
  });
});

router.get('/settings', async (req, res) => {
  const [rows] = await db.execute(`
    SELECT *
    FROM settings
    LIMIT 1
  `);

  res.json(rows[0]);
});

module.exports = router;
