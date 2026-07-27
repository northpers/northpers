const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const knowledge = fs.readFileSync(
    path.join(__dirname, '../knowlage.txt'),
    'utf8'
);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set!");
  process.exit(1);
}

const getCookie = (req, name) => {
    if (!req.headers || !req.headers.cookie) return null;
    const cookies = req.headers.cookie.split(';');
    for (let c of cookies) {
        c = c.trim();
        if (c.startsWith(name + '=')) {
            return decodeURIComponent(c.substring(name.length + 1));
        }
    }
    return null;
};

router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: "Email/Nomor HP dan password wajib diisi, Der!" });
    }

    try {
        const [users] = await db.execute(
            'SELECT * FROM user_northline WHERE email = ? OR phone = ?',
            [identifier, identifier]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: "Email/Nomor HP atau password salah!" });
        }

        const user = users[0];

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Email/Nomor HP atau password salah!" });
        }

        const qrToken = crypto.randomBytes(32).toString('hex');

        await db.execute(
            `UPDATE user_northline
            SET qr_token = ?,
                qr_token_expired = ?
            WHERE id = ?`,
            [
                qrToken,
                Date.now() + (30 * 24 * 60 * 60 * 1000),
                user.id
            ]
        );

        const token = jwt.sign(
            { id: user.id, username: user.username }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        const userPayload = {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            created_at: user.created_at,
            address: user.address
        };

        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60 * 1000 });

        return res.status(200).json({
            message: "Login sukses!",
            token,
            qrToken,
            user: userPayload
        });

    } catch (error) {
        console.error("Error saat login:", error);
        return res.status(500).json({ message: "Terjadi kesalahan pada server, Der." });
    }
});

const qrLoginSessions = {};
router.get('/create-login-qr', async (req, res) => {
    const sessionId =
        crypto.randomUUID();
    qrLoginSessions[sessionId] = {
        approved: false,
        createdAt: Date.now()
    };
    res.json({
        success: true,
        sessionId
    });

});

const verifyToken = (req, res, next) => {
    let bearerToken = null;
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        bearerToken = bearerHeader.split(' ')[1];
    } else {
        bearerToken = getCookie(req, 'token');
    }

    if (bearerToken) {
        jwt.verify(bearerToken, JWT_SECRET, (err, authData) => {
            if (err) {
                return res.status(403).json({ error: "Token tidak valid / expired" });
            }
            req.user = authData; 
            next();
        });
    } else {
        res.status(401).json({ error: "Sesi login tidak ditemukan, token kosong" });
    }
};

router.post('/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.clearCookie('session', { path: '/' });
    res.clearCookie('user_session', { path: '/' });
    res.json({ success: true, message: "Logout berhasil" });
});

router.get('/northpay/balance', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; 
        
        const [rows] = await db.execute(
            'SELECT name, northpay_balance FROM user_northline WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan" });
        }

        return res.status(200).json({
            success: true,
            name: rows[0].name, 
            balance: rows[0].northpay_balance
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});

router.get('/api/user/profile', verifyToken, (req, res) => {
    const loggedInUsername = req.user.username; 

    const query = "SELECT username, name, email, phone, gender, avatar, created_at FROM user_northline WHERE username = ?";
    
    db.query(query, [loggedInUsername], (err, results) => {
        if (err) {
            console.error("Gagal query database, Der:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        
        if (results.length > 0) {
            res.json({
                success: true,
                data: results[0]
            }); 
        } else {
            res.status(404).json({ error: "Data akun tidak ditemukan di database" });
        }
    });
});

router.put('/user/profile/update', verifyToken, async (req, res) => {
    try {
        const { name, email, phone, gender } = req.body;
        const userId = req.user.id;

        await db.execute(
            "UPDATE user_northline SET name = ?, email = ?, phone = ?, gender = ? WHERE id = ?",
            [name, email, phone, gender, userId]
        );
        
        await logNotification(userId, "Profile Updated", "Your profile information has been updated.");
        
        res.json({ success: true, message: "Profile updated" });
    } catch (err) {
        console.error("Error update profile:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post("/upload-avatar", verifyToken, async (req, res) => { 
    try {
        const base64Avatar = req.body.avatar;
        console.log("DEBUG: User ID yang melakukan update:", req.user.id); 

        if (!base64Avatar) {
            return res.status(400).json({ success: false, message: "Data avatar kosong!" });
        }

        const userId = req.user.id; 

        const queryStr = "UPDATE user_northline SET avatar = ? WHERE id = ?";
        const [result] = await db.query(queryStr, [base64Avatar, userId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan di DB" });
        }

        return res.status(200).json({ success: true, avatarUrl: base64Avatar });
    } catch (err) {
        console.error("Error update avatar:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/me', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; 
        const [users] = await db.execute(
            'SELECT id, username, name, email, phone, gender, created_at, avatar FROM user_northline WHERE id = ?',
            [userId]
        );
        if (users.length === 0) {
        }
        return res.status(200).json({
            success: true,
            user: users[0]
        });

    } catch (error) {
    }
});

router.post('/check-phone-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Nomor handphone wajib diisi!" });

    try {
        const [users] = await db.execute('SELECT id, username, phone FROM user_northline WHERE phone = ?', [phone]);
        const isRegistered = users.length > 0;
        const matchedUser = isRegistered ? users[0] : null;

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiredAt = new Date(Date.now() + 3 * 60 * 1000); 

        await db.execute(
            'INSERT INTO otp_sessions (phone, otp_code, expired_at) VALUES (?, ?, ?)',
            [phone, otpCode, expiredAt]
        );

        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        const targetId = `${formattedPhone}@c.us`;

        const msgText = `*Northline Security Code*\n\nKode verifikasi Anda adalah: *${otpCode}*.\nKode ini rahasia dan berlaku selama 3 menit.`;
        await client.sendMessage(targetId, msgText);

        return res.status(200).json({
            message: "OTP berhasil dikirim ke WhatsApp!",
            isRegistered: isRegistered,
            user: matchedUser
        });

    } catch (error) {
        console.error("Gagal kirim OTP WA:", error);
        return res.status(500).json({ message: "Gagal mengirim OTP. Pastikan WA Server aktif." });
    }
});

const tempOtpStorage = {};
router.post('/send-otp-only', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Nomor HP wajib diisi!"
            });
        }
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        const existingOtp = tempOtpStorage[formattedPhone];
        if (existingOtp && existingOtp.cooldown > Date.now()) {
            const remaining = Math.ceil(
                (existingOtp.cooldown - Date.now()) / 1000
            );
            return res.status(429).json({
                success: false,
                message: `Tunggu ${remaining} detik sebelum request OTP lagi.`
            });
        }
        const secretOtp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();
        tempOtpStorage[formattedPhone] = {
            otp: secretOtp,
            expires: Date.now() + (5 * 60 * 1000), 
            cooldown: Date.now() + (60 * 1000) 
        };
        const messageText =
`*Northline Authentication*
Kode verifikasi kamu adalah: *${secretOtp}*
Jangan bagikan kode ini ke siapa pun.`;
        if (!req.whatsappClient) {
            throw new Error("WhatsApp bot offline!");
        }
        const waBot = req.whatsappClient;
        console.log(`[OTP] Checking number ${formattedPhone}`);
        const numberDetails = await waBot.getNumberId(formattedPhone);
        if (!numberDetails) {
            return res.status(400).json({
                success: false,
                message: "Nomor tidak terdaftar di WhatsApp."
            });
        }
        const finalTargetId = numberDetails._serialized;
        await waBot.sendMessage(finalTargetId, messageText, {
            linkPreview: false,
            sendSeen: false
        });
        console.log(`[OTP] OTP terkirim ke ${formattedPhone}`);
        return res.status(200).json({
            success: true,
            message: "OTP berhasil dikirim!"
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Terlalu banyak percobaan OTP, coba lagi 15 menit." }
});

router.post('/verify-otp', otpLimiter, async (req, res) => {
    try {
        const { phone, otpCode } = req.body;
        if (!phone || !otpCode) {
            return res.status(400).json({
                success: false,
                message: "Data tidak lengkap!"
            });
        }
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        const savedOtp = tempOtpStorage[formattedPhone];
        if (!savedOtp) {
            return res.status(400).json({
                success: false,
                message: "OTP tidak ditemukan."
            });
        }
        if (Date.now() > savedOtp.expires) {
            delete tempOtpStorage[formattedPhone];
            return res.status(400).json({
                success: false,
                message: "OTP sudah expired."
            });
        }
        if (savedOtp.otp !== otpCode) {
            return res.status(400).json({
                success: false,
                message: "Kode OTP salah."
            });
        }
        delete tempOtpStorage[formattedPhone];
        const [users] = await db.execute(
            `
            SELECT 
                id,
                username,
                email,
                phone,
                avatar
            FROM user_northline
            WHERE phone = ?
            `,
            [formattedPhone]
        );
        if (users.length > 0) {
            return res.status(200).json({
                success: true,
                isRegistered: true,
                user: users[0]
            });
        }
        return res.status(200).json({
            success: true,
            isRegistered: false
        });
    } catch (error) {
        console.error("Verify OTP Error:", error);
        return res.status(500).json({
            success: false,
            message: "Gagal verifikasi OTP"
        });
    }
});

router.post('/register-complete', async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;

        if (!username || !email || !password || !phone) {
            return res.status(400).json({ success: false, message: "Semua field wajib diisi" });
        }

        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        const [existingUser] = await db.execute(
            'SELECT id FROM user_northline WHERE phone = ? OR email = ?', 
            [formattedPhone, email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: "Nomor HP atau Email lu udah keburu dipake orang lain" });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const [result] = await db.execute(
            'INSERT INTO user_northline (username, email, password, phone, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, email, hashedPassword, formattedPhone, '/frontend/public/icons/default.png']
        );


        const token = jwt.sign(
            { id: result.insertId, username: username },
            JWT_SECRET,            { expiresIn: '1d' }
        );

        const userPayload = { id: result.insertId, username, email, phone: formattedPhone };
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60 * 1000 });

        return res.status(201).json({
            success: true,
            message: "Akun Northline lu berhasil dibuat dengan aman, Der! Otomatis masuk sistem.",
            userId: result.insertId,
            token: token,
            user: userPayload
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal server error pas simpan akun." });
    }
});

router.post('/login-otp-success', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: "Nomor HP wajib dikirim" });
        }

        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        const [users] = await db.execute(
            'SELECT id, username, email, phone, avatar FROM user_northline WHERE phone = ?',
            [formattedPhone]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: "Akun mendadak hilang dari DB" });
        }

        const user = users[0];

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,            { expiresIn: '1d' }
        );

        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60 * 1000 });

        console.log(`[Bypass Login] User ${user.username} berhasil login langsung via OTP WhatsApp.`);

        return res.status(200).json({
            success: true,
            message: `Selamat datang kembali, ${user.username}!`,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error("Crash bypass login OTP:", error);
        return res.status(500).json({ success: false, message: "Gagal memproses login otomatis." });
    }
});

router.get('/products/:productId/comments', async (req, res) => {
    try {
        const { productId } = req.params;

        const [rows] = await db.execute(
            'SELECT * FROM comment_product WHERE product_id = ? ORDER BY created_at DESC',
            [productId]
        );

        const [metaRows] = await db.execute(
            'SELECT COUNT(*) as totalReviews, AVG(rating) as avgRating FROM comment_product WHERE product_id = ?',
            [productId]
        );

        const totalReviews = metaRows[0].totalReviews || 0;
        const averageRating = totalReviews > 0 ? Math.round(metaRows[0].avgRating) : 0;

        const formattedComments = rows.map(row => ({
            id: row.id,
            productId: row.product_id,
            userId: row.user_id,
            userName: row.username,
            userAvatar: row.user_avatar,
            rating: row.rating,
            text: row.comment_text,
            createdAt: row.created_at
        }));

        res.status(200).json({
            totalReviews: totalReviews,
            averageRating: averageRating,
            comments: formattedComments
        });
    } catch (err) {
        console.error("Gagal mengambil ulasan MySQL:", err);
        res.status(500).json({ message: "Server error gagal memuat ulasan." });
    }
});

router.post('/products/comments', async (req, res) => {
    try {
        const { productId, rating, text } = req.body;

        if (!productId || !rating || !text) {
            return res.status(400).json({ message: "Data ulasan tidak lengkap" });
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; 

        if (!token) {
            return res.status(401).json({ message: "Sesi habis, token kagak dikirim dari frontend!" });
        }

        let decodedUser;
        try {
            decodedUser = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            console.error("JWT Verify Error:", jwtErr.message);
            return res.status(403).json({ message: "Login Ulang Ya!" });
        }

        const userId = decodedUser.id;

        const [userRows] = await db.execute(
            `
            SELECT
                username,
                avatar
            FROM user_northline
            WHERE id = ?
            LIMIT 1
            `,
            [userId]
        );

        if (!userRows.length) {
            return res.status(404).json({
                message: "User tidak ditemukan"
            });
        }

        const username =
            userRows[0].username ||
            "Pembeli Northline";

        const userAvatar =
            userRows[0].avatar ||
            "/public/icons/default.png";

        await db.execute(
            `INSERT INTO comment_product (product_id, user_id, username, user_avatar, rating, comment_text, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [productId, userId, username, userAvatar, rating, text]
        );

        const [metaRows] = await db.execute(
            'SELECT COUNT(*) as totalReviews, AVG(rating) as avgRating FROM comment_product WHERE product_id = ?',
            [productId]
        );

        const totalReviews = metaRows[0].totalReviews || 0;
        const averageRating = totalReviews > 0 ? Math.round(metaRows[0].avgRating) : 0;

        res.status(201).json({ 
            message: "Ulasan berhasil disimpan ke database hmessage_db!", 
            totalReviews: totalReviews,
            averageRating: averageRating
        });

    } catch (err) {
        console.error("Gagal menyimpan ulasan MySQL:", err);
        res.status(500).json({ message: "Server error gagal mengirim ulasan." });
    }
});

router.get('/products/rating-summary', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT product_id, COUNT(*) as totalReviews, AVG(rating) as avgRating 
             FROM comment_product 
             GROUP BY product_id`
        );

        const summary = {};
        rows.forEach(row => {
            summary[row.product_id] = {
                totalReviews: parseInt(row.totalReviews) || 0,
                avgRating: Math.round(row.avgRating) || 0
            };
        });

        res.status(200).json(summary);
    } catch (err) {
        console.error("Gagal mengambil summary rating MySQL:", err);
        res.status(500).json({ message: "Server error gagal mengambil summary rating." });
    }
});

router.post('/checkout', async (req, res) => {
    try {
        const { totalPrice } = req.body;

        const [rows] = await db.execute("SELECT COUNT(*) as count FROM transactions WHERE is_discounted = 1");
        const usedCount = rows[0].count;

        let finalPrice = parseInt(totalPrice);
        let gotDiscount = false;

        if (usedCount < 10) {
            finalPrice = Math.round(finalPrice * 0.95);
            gotDiscount = true;
        }

        res.json({
            success: true,
            finalPrice: finalPrice,
            isDiscounted: gotDiscount,
            message: "Data diskon siap."
        });
    } catch (error) {
        console.error("Checkout Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/confirm-manual-payment', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.body; 

        const [orderCheck] = await db.query("SELECT user_id, status FROM transactions WHERE order_id = ?", [orderId]);
        if (orderCheck.length === 0) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
        }
        if (orderCheck[0].user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }
        if (orderCheck[0].status === 'success') {
            return res.json({ success: true, message: "Pesanan ini sudah dikonfirmasi sebelumnya." });
        }

        await db.query("UPDATE transactions SET status = 'success' WHERE order_id = ?", [orderId]);
        
        const [rows] = await db.query(`
            SELECT t.product_name, t.chosen_size, t.chosen_color, t.total_price, 
                   u.username as customer_name, u.phone as customer_phone
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE t.order_id = ?
        `, [orderId]);

        if (rows.length > 0) {
            const orderData = rows[0];
            const client = global.whatsappClient;

            let rawPhone = orderData.customer_phone;
            if (rawPhone.startsWith('0')) rawPhone = '62' + rawPhone.slice(1);
            const targetWhatsAppId = `${rawPhone}@c.us`;

            const message = `*NORTHLINE ORDER CONFIRMED* 🏎️🔥\n\n` +
                            `Halo Bro *${orderData.customer_name}*,\n` +
                            `Pembayaran manual untuk Order ID *${orderId}* telah kami verifikasi!\n\n` +
                            `*DETAIL ITEM BELANJAAN:* \n` +
                            `👕 Produk: ${orderData.product_name}\n` +
                            `💰 Total Bayar: *Rp ${parseInt(orderData.total_price).toLocaleString('id-ID')}*\n\n` +
                            `Status: *LUNAS (PAID)* ✅`;

            await client.sendMessage(targetWhatsAppId, message);
            res.json({ success: true, message: "Manual payment confirmed & WA sent!" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/user-orders/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.id != userId) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        const [orders] = await db.query(`
            SELECT 
                order_id,
                product_id,
                product_name,
                product_image,
                chosen_color,
                chosen_size,
                chosen_model,
                quantity,
                total_price,
                status AS payment_status,
                delivery_status,
                is_discounted,
                estimated_arrival,
                created_at
            FROM transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            success: true,
            orders
        });

    } catch (error) {
        console.error("Error Get Orders:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post('/update-address', verifyToken, async (req, res) => {
    try {
        const { address } = req.body;
        const userId = req.user.id;

        if (!address) {
            return res.status(400).json({ success: false, message: "Alamat wajib diisi!" });
        }

        const [result] = await db.query(
            "UPDATE user_northline SET address = ? WHERE id = ?", 
            [address, userId]
        );

        if (result.affectedRows > 0) {
            await logNotification(userId, "Address Updated", "Your delivery address has been successfully updated.");
            return res.json({ success: true, message: "Address updated successfully!" });
        } else {
            return res.status(404).json({ success: false, message: "User tidak ditemukan." });
        }
    } catch (error) {
        console.error("Error Update Address:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post("/update-password", verifyToken, async (req, res) => {
    try {
        const { current, newPass, otp } = req.body;
        const userId = req.user.id;

        const [users] = await db.query("SELECT password, phone FROM user_northline WHERE id = ?", [userId]);
        const user = users[0];

        const stored = tempOtpStorage[user.phone];
        if (!stored || stored.otp !== otp) {
            return res.status(400).json({ success: false, message: "Kode OTP salah!" });
        }
        if (Date.now() > stored.expires) {
            delete tempOtpStorage[user.phone];
            return res.status(400).json({ success: false, message: "OTP sudah expired!" });
        }

        const isMatch = await bcrypt.compare(current, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Incorrect current password!" });

        const hashedPassword = await bcrypt.hash(newPass, 10);
        await db.query("UPDATE user_northline SET password = ? WHERE id = ?", [hashedPassword, userId]);

        delete tempOtpStorage[user.phone];
        await logNotification(userId, "Security Update", "Your password has been successfully changed.");

        return res.json({ success: true, message: "Password updated successfully!" });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error during update." });
    }
});

router.post('/send-otp-for-password', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [rows] = await db.query("SELECT phone FROM user_northline WHERE id = ?", [userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found!" });
        }

        const phone = rows[0].phone;
        
        const secretOtp = Math.floor(100000 + Math.random() * 900000).toString();
        
        tempOtpStorage[phone] = { otp: secretOtp, expires: Date.now() + (5 * 60 * 1000) };

        const waBot = req.whatsappClient;
        const messageText = `*Northline Security*\n\nYour verification code is: *${secretOtp}*\nDo not share this code with anyone.`;
        
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        await waBot.sendMessage(formattedPhone + "@c.us", messageText);

        console.log(`[OTP] OTP sent to ${formattedPhone}: ${secretOtp}`); 
        return res.status(200).json({ success: true, message: "OTP sent successfully!" });

    } catch (err) {
        console.error("Error sending OTP:", err);
        return res.status(500).json({ success: false, message: "Failed to send OTP. Server error." });
    }
});

async function logNotification(userId, title, message) {
    try {
        await db.execute(
            'INSERT INTO user_notifications (user_id, title, message) VALUES (?, ?, ?)',
            [userId, title, message]
        );
    } catch (err) {
        console.error("Gagal kirim log notif:", err);
    }
}

router.get('/notifications', verifyToken, async (req, res) => {
    console.log("User ID yang request:", req.user.id); 
    try {
        const [notifs] = await db.execute(
            `SELECT * FROM user_notifications 
             WHERE user_id = ? OR is_global = 1 
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(notifs);
    } catch (err) {
        console.error(err); 
        res.status(500).json({ message: "Error loading notifications" });
    }
});

router.get('/settings/po-date', async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT setting_value FROM app_settings WHERE setting_key = ?", 
            ['po_target_date']
        );

        if (rows.length > 0) {
            res.json({ targetDate: rows[0].setting_value });
        } else {
            res.status(404).json({ message: "Setting tidak ditemukan" });
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ message: "Database Error" });
    }
});

const products = [
    {
        id: 1,
        name: "Northline Longsleeve & Shortsleeve Boxy 919 NRT - 24s Cotton Combed Kaos Boxy",
        price: 138000,
        priceShort: 138000,
        priceLong: 158000,
        oldPrice: 250000,
        colors: ["PUTIH"],
        sizes: ["S", "M", "L", "XL"],
        models: ["PANJANG", "PENDEK"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtWhiteLong919.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtWhiteShort919.jpeg",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 2,
        name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
        price: 138000,
        priceShort: 138000,
        priceLong: 158000,
        oldPrice: 250000,
        colors: ["PUTIH", "HITAM"],
        sizes: ["S", "M", "L", "XL"],
        models: ["PANJANG", "PENDEK"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtwhiteLongNorth.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtwhiteShortNorth.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtBlackLongNorth.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtBlackShortNorth.jpeg",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 3,
        name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
        price: 138000,
        priceShort: 138000,
        priceLong: 158000,
        oldPrice: 250000,
        colors: ["PUTIH", "HITAM"],
        sizes: ["S", "M", "L", "XL"],
        models: ["PANJANG", "PENDEK"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtWhiteLong.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtWhiteShort.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtBlackLong.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtBlackShort.jpeg",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 4,
        name: "Northline Longsleeve & Shortsleeve Boxy Arabic - 24s Cotton Combed Kaos Boxy",
        price: 138000,
        priceShort: 138000,
        priceLong: 158000,
        oldPrice: 250000,
        colors: ["PUTIH", "HITAM"],
        sizes: ["S", "M", "L", "XL"],
        models: ["PANJANG", "PENDEK"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtWhiteLongArabic.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtWhiteShortArabic.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtBlackLongArabic.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtBlackShortArabic.jpeg",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 5,
        name: "Northline Workshirt Zipper Black Boxy - Workshirt Zipper Boxy",
        price: 188000,
        oldPrice: 250000,
        colors: ["HITAM"],
        sizes: ["S", "M", "L", "XL"],
        images: [
            "https://nl.hostinesia.my.id/public/image/NorthWorkshirtZipper.jpeg",
            "https://nl.hostinesia.my.id/public/image/NorthlineWorkshirtZipper.jpeg",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 6,
        name: "Northline Longsleeve 111 White Boxy - 24s Cotton Combed Longsleeve White Boxy",
        price: 138000,
        priceShort: 138000,
        priceLong: 158000,
        oldPrice: 250000,
        colors: ["PUTIH"],
        sizes: ["S", "M", "L", "XL"],
        models: ["PANJANG", "PENDEK"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtwhite111Long.jpeg",
            "https://nl.hostinesia.my.id/public/image/nrtwhite111Short.jpeg",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 7,
        name: "Northline Shortsleeve NORTNL White Boxy - 24s Cotton Combed Shortsleeve White Boxy",
        price: 138000,
        priceShort: 138000,
        priceLong: 158000,
        oldPrice: 250000,
        colors: ["PUTIH"],
        sizes: ["S", "M", "L", "XL"],
        models: ["PANJANG", "PENDEK"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtNORTNLWhiteShort.webp",
            "https://nl.hostinesia.my.id/public/image/nrtNORTNLWhiteLong.webp",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 8,
        name: "Northline Afterall Boxy Work Shirt Zipper - NORTNL Afterall Boxy Work Shirt Zipper",
        price: 240000,
        oldPrice: 280000,
        colors: ["HITAM"],
        sizes: ["S", "M", "L", "XL"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtNORTNLKemejaZipper.webp",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
    {
        id: 9,
        name: "Northline HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB - NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
        price: 310000,
        oldPrice: 320000,
        colors: ["HITAM"],
        sizes: ["S", "M", "L", "XL"],
        images: [
            "https://nl.hostinesia.my.id/public/image/nrtNORTNLHoodieBoxyZipper.webp",
        ],
        avgRating: 4,
        totalReviews: 0,
    },
];

function formatHistory(history) {
    if (!history || history.length === 0) return '';
    const recent = history.slice(-6);
    const lines = recent.map(msg => {
        const role = msg.role === 'user' ? 'Customer' : 'Northline Support';
        return `${role}: ${msg.text}`;
    });
    return `\nRiwayat Percakapan Sebelumnya:\n${lines.join('\n')}\n`;
}

function buildSystemPrompt(products, history = []) {
    const historyBlock = formatHistory(history);

    const productLines = products.map((p, i) => {
        let priceInfo;
        if (p.priceShort && p.priceLong) {
            priceInfo = `- Harga: Mulai Rp${p.priceShort.toLocaleString('id-ID')} (Pendek) / Rp${p.priceLong.toLocaleString('id-ID')} (Panjang)`;
        } else {
            priceInfo = `- Harga: Rp${p.price.toLocaleString('id-ID')}`;
        }

        const parts = [
            `${i + 1}. ${p.name}`,
            priceInfo,
        ];

        if (p.oldPrice) {
            parts.push(`- Harga Sebelumnya: Rp${p.oldPrice.toLocaleString('id-ID')}`);
        }

        parts.push(`- Warna Tersedia: ${p.colors.join(', ')}`);
        parts.push(`- Ukuran: ${p.sizes.join(', ')}`);

        if (p.models) {
            parts.push(`- Model: ${p.models.join(', ')}`);
        }

        parts.push(`- Ready Order: ${p.readyStart} - ${p.readyEnd}`);

        return parts.join('\n');
    }).join('\n\n');

    return `Kamu adalah Northline Support, customer service resmi dari brand fashion Northline.

Informasi Brand Northline:
- Pendiri/Owner: Hata Supriatna & M. Alfian Nur Hadiansyah
- Brand berasal dari: Karawang, Jawa Barat
- Northline adalah brand fashion streetwear premium asli Karawang yang beroprasi pada tahun 2025 oleh PT Northline Indonesia di bawah naungan PT Hostinesia.
- Desain Norhtline ada @hadabeltee sekaligus dibalik layar website ini dan pendiri Hostinesia Infrastruktur yang anda pakai ini adalah hasil payah dia sendiri.
- Northline fokus pada kualitas bahan, kenyamanan, dan desain boxy fit modern.
- Northline menjual produk apparel seperti t-shirt, longsleeve, dan koleksi eksklusif lainnya.
- Northline menggunakan sistem pre-order untuk beberapa produk.
- Jawaban harus profesional, ramah, singkat, dan membantu customer.
- Selalu gunakan Bahasa Indonesia.
- jawab menggunakan emoji.
- Jangan menjawab di luar konteks customer service jika tidak diperlukan.${historyBlock}

Data Produk Saat Ini:

${productLines}

Aturan Penting:

1. Jika customer bertanya harga produk:
Berikan harga sesuai data di atas.

2. Jika customer bertanya ukuran:
Berikan ukuran yang tersedia sesuai data.

3. Jika customer bertanya warna:
Berikan warna yang tersedia sesuai data.

4. Jika customer bertanya stok:
Jawab bahwa produk tersedia selama stock ready berlangsung.

5. Jika customer bertanya kapan pesanan diproses:
Jawab bahwa pesanan akan diproses setelah pesanan selesai.

6. Jika customer bertanya tentang Northline:
Jelaskan bahwa Northline adalah brand streetwear premium dengan fokus pada kualitas bahan dan desain modern boxy fit.

7. Jangan pernah:
- Mengarang produk baru.
- Mengarang harga baru.
- Mengarang ukuran baru.
- Mengarang warna baru.
- Mengaku mengetahui informasi yang tidak diberikan.

8. Jika informasi tidak tersedia:
Jawab: "Silakan hubungi admin Northline untuk informasi lebih lanjut."

9. Jika customer hanya menyapa:
Balas dengan: "Halo, selamat datang di Northline. Ada yang bisa kami bantu terkait produk atau pesanan Anda?"

10. Jika customer bertanya cara order:
Jawab dengan langkah-langkah berikut:
- Pilih produk yang tersedia di Shop Northline atau tanya apa yang sedang ready.
- Pilih size dan warna yang tertera di detail produk.
- Lakukan pembayaran melalui QRIS Northline.
- Tunggu sampai pembayaran berhasil dan pesanan diproses oleh tim Northline.
- Lihat pada menu Orders dan pantau pengembangan pesanan yang akan diupdate oleh tim Northline.

Format penting untuk referensi produk:
- Jika kamu menyebut produk tertentu, sertakan [product:ID] setelah menyebutnya (contoh: "Kaos Boxy 919 NRT [product:1]")
- Jika kamu menyebut semua produk, sertakan [products:all] di akhir kalimat.
- Jangan gunakan format lain selain [product:ID] atau [products:all].
- Tag ini akan digunakan sistem untuk menampilkan gambar produk ke customer.`;
}

function buildStoreSystemPrompt(products, history = []) {
    const historyBlock = formatHistory(history);

    const productLines = products.map((p, i) => {
        let priceInfo;
        if (p.priceShort && p.priceLong) {
            priceInfo = `- Harga: Mulai Rp${p.priceShort.toLocaleString('id-ID')} (Pendek) / Rp${p.priceLong.toLocaleString('id-ID')} (Panjang)`;
        } else {
            priceInfo = `- Harga: Rp${p.price.toLocaleString('id-ID')}`;
        }

        const parts = [
            `${i + 1}. ${p.name}`,
            priceInfo,
        ];

        if (p.oldPrice) {
            parts.push(`- Harga Sebelumnya: Rp${p.oldPrice.toLocaleString('id-ID')}`);
        }

        parts.push(`- Warna Tersedia: ${p.colors.join(', ')}`);
        parts.push(`- Ukuran: ${p.sizes.join(', ')}`);

        if (p.models) {
            parts.push(`- Model: ${p.models.join(', ')}`);
        }

        parts.push(`- Ready Order: ${p.readyStart} - ${p.readyEnd}`);

        return parts.join('\n');
    }).join('\n\n');

    return `Kamu adalah admin dari toko Northline Official. Tugasmu adalah membantu pelanggan dengan ramah dan natural, seperti admin toko beneran.

Informasi Brand Northline:
- Pendiri/Owner: Hata Supriatna & M. Alfian Nur Hadiansyah
- Brand berasal dari: Karawang, Jawa Barat
- Northline adalah brand fashion streetwear premium asli Karawang yang beroprasi pada tahun 2025.
- Northline fokus pada kualitas bahan, kenyamanan, dan desain boxy fit modern.
- Northline menjual produk apparel seperti t-shirt, longsleeve, dan koleksi eksklusif lainnya.
- Northline menggunakan sistem pre-order untuk beberapa produk.

Gaya bicara:
- Panggil pelanggan dengan "kak"
- Bicara natural dan santai, kayak lagi ngobrol sama temen
- Jangan kedengeran kayak robot atau AI
- Jawab dengan hangat dan helpful
- Gunakan bahasa Indonesia sehari-hari yang natural
- JANGAN gunakan emoji sama sekali
- JANGAN sebut dirimu AI, robot, bot, atau asisten virtual
- Jawab singkat dan to the point, nggak perlu bertele-tele${historyBlock}

Data Produk Saat Ini:

${productLines}

Aturan Penting:

1. Jika customer bertanya harga produk:
Berikan harga sesuai data di atas.

2. Jika customer bertanya ukuran:
Berikan ukuran yang tersedia sesuai data.

3. Jika customer bertanya warna:
Berikan warna yang tersedia sesuai data.

4. Jika customer bertanya stok:
Jawab bahwa produk tersedia selama stock ready berlangsung.

5. Jika customer bertanya kapan pesanan diproses:
Jawab bahwa pesanan akan diproses setelah pesanan selesai.

6. Jika customer bertanya tentang Northline:
Jelaskan bahwa Northline adalah brand streetwear premium dengan fokus pada kualitas bahan dan desain modern boxy fit.

7. Jangan pernah:
- Mengarang produk baru.
- Mengarang harga baru.
- Mengarang ukuran baru.
- Mengarang warna baru.
- Mengaku mengetahui informasi yang tidak diberikan.

8. Jika informasi tidak tersedia:
Jawab dengan natural seperti: "Maaf kak, untuk info itu saya kurang tahu pastinya. Menunggu konfirmasi admin northline dulu kak."

9. Jika customer bertanya cara order:
Jawab dengan langkah-langkah berikut:
- Pilih produk yang tersedia di Shop Northline atau tanya apa yang sedang ready.
- Pilih size dan warna yang tertera di detail produk.
- Lakukan pembayaran melalui QRIS Northline.
- Tunggu sampai pembayaran berhasil dan pesanan diproses oleh tim Northline.
- Lihat pada menu Orders dan pantau pengembangan pesanan yang akan diupdate oleh tim Northline.`;
}

function findMentionedProducts(replyText, products) {
    const lowerReply = replyText.toLowerCase();
    const matched = [];

    for (const product of products) {
        const nameLower = product.name.toLowerCase();
        const significantPart = nameLower.substring(0, 50);
        if (lowerReply.includes(significantPart)) {
            matched.push(product);
            continue;
        }
        for (const color of product.colors) {
            if (color.toLowerCase() === 'hitam' || color.toLowerCase() === 'putih') continue;
            if (lowerReply.includes(color.toLowerCase())) {
                matched.push(product);
                break;
            }
        }
    }

    return matched;
}

const OPENCODE_SERVER = 'http://127.0.0.1:11436';
let opencodeSessionId = null;

async function getOrCreateSession() {
    if (opencodeSessionId) return opencodeSessionId;
    const { data } = await axios.post(`${OPENCODE_SERVER}/session`, {}, { timeout: 5000 });
    opencodeSessionId = data.id;
    return opencodeSessionId;
}

router.post('/chat', async (req, res) => {
    try {
        const { message, history, mode } = req.body;
        if (!message || message.length > 1000) {
            return res.status(400).json({ reply: 'Pesan tidak valid.' });
        }

        const sessionId = await getOrCreateSession();

        const systemPrompt = mode === 'store'
            ? buildStoreSystemPrompt(products, history || [])
            : buildSystemPrompt(products, history || []);

        const { data } = await axios.post(`${OPENCODE_SERVER}/session/${sessionId}/message`, {
            model: { providerID: 'opencode', modelID: 'north-mini-code-free' },
            parts: [{ type: 'text', text: message }],
            system: systemPrompt
        }, { timeout: 120000 });

        let reply = data.parts?.find(p => p.type === 'text')?.text || 'Maaf, saya tidak dapat menjawab saat ini.';

        let matchedProducts = [];

        const productTagRegex = /\[product:(\d+)\]/gi;
        const allProductsTag = /\[products:all\]/gi;
        let match;
        const matchIds = new Set();

        while ((match = productTagRegex.exec(reply)) !== null) {
            matchIds.add(parseInt(match[1]));
        }

        const hasAllProducts = allProductsTag.test(reply);

        reply = reply.replace(/\[product:\d+\]/gi, '').replace(/\[products:all\]/gi, '').trim();

        if (hasAllProducts) {
            matchedProducts = products;
        } else if (matchIds.size > 0) {
            matchedProducts = products.filter(p => matchIds.has(p.id));
        } else {
            matchedProducts = findMentionedProducts(reply, products);
        }

        const productData = matchedProducts.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            oldPrice: p.oldPrice || null,
            image: p.images?.[0] || null,
            colors: p.colors,
            sizes: p.sizes,
            models: p.models || null,
        }));

        res.json({ reply, products: productData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ reply: 'Northline Support sedang tidak tersedia.', products: [] });
    }
});

module.exports = router;