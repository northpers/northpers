const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const db = require('../config/db');
const catalogRoutes = require('./catalog');

const JWT_SECRET = process.env.JWT_SECRET;

const products = catalogRoutes.NORTHLINE_CATALOG.slice().reverse();

async function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
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

// ===========================================
// AI Chat (prompt + model)
// ===========================================
function formatHistory(history) {
    if (!history || history.length === 0) return '';
    const recent = history.slice(-6);
    const lines = recent.map(msg => {
        const role = msg.role === 'user' ? 'Customer' : 'Northline Support';
        return `${role}: ${msg.text}`;
    });
    return `\nRiwayat Percakapan Sebelumnya:\n${lines.join('\n')}\n`;
}

function buildChildrenArticleBlock() {
    return `

Artikel Baru Northline - Boxy Kids (Ukuran Anak-anak):
- Northline baru meluncurkan artikel baru khusus anak-anak pada Kaos Shortsleeve Black Boxy: [product:18] dan [product:19].
- Ukuran anak-anak yang tersedia: S, M, L, XL, XXL.
- Harga khusus ukuran anak-anak: Rp88.000.
- Panduan ukuran anak berdasarkan usia (1 sampai 10 tahun):
  - Usia 1-2 tahun: Size S
  - Usia 3-4 tahun: Size M
  - Usia 5-6 tahun: Size L
  - Usia 7-8 tahun: Size XL
  - Usia 9-10 tahun: Size XXL
- Ukuran dewasa tetap tersedia (M, L, XL) dengan harga normal.
- Jika customer bertanya tentang ukuran anak-anak, artikel baru, atau ukuran untuk anak usia 1-10 tahun: jelaskan artikel Boxy Kids ini, sampaikan panduan ukuran di atas, harga Rp88.000, dan sertakan [product:18] dan [product:19].`;
}

function buildSystemPrompt(products, history = []) {
    const historyBlock = formatHistory(history);
    const childrenArticleBlock = buildChildrenArticleBlock();

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

        if (p.sizesChildren && p.sizesChildren.length) {
            parts.push(`- Ukuran Anak-anak (usia 1-10 tahun): ${p.sizesChildren.join(', ')}`);
        }

        if (p.childrenPrice) {
            parts.push(`- Harga Khusus Ukuran Anak: Rp${p.childrenPrice.toLocaleString('id-ID')}`);
        }

        if (p.models) {
            parts.push(`- Model: ${p.models.join(', ')}`);
        }

        return parts.join('\n');
    }).join('\n\n');

    return `Kamu adalah Northline Support, customer service resmi dari brand fashion Northline.

Informasi Brand Northline:
- Pendiri/Owner: Hata Supriatna & M. Alfian Nur Hadiansyah
- Brand berasal dari: Karawang, Jawa Barat
- Northline adalah brand fashion streetwear premium asli Karawang yang beroprasi pada tahun 2025 oleh PT Northline Indonesia di bawah naungan PT Hostinesia Karawang.
- Desainer Northline adalah @hadabelteee sekaligus dibalik layar website ini dan pendiri Hostinesia Infrastruktur yang anda pakai ini adalah hasil payah dia sendiri.
- Hostinesia adalah perusahaan gitial website yang membangun Northline dan didirikan oleh Kak Hata Supriatna @hadabelteee di Karawang, Jawa Barat
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

11. Jika customer bertanya tentang Program Affiliate Northline:
Jawab dengan informasi berikut:
- Northline memiliki program affiliate tempat pengguna bisa mendapatkan komisi dari setiap penjualan melalui link affiliate pribadi mereka.
- Untuk bergabung, kunjungi halaman Affiliate di website Northline (menu Affiliate) dan link affiliate otomatis dibuat setelah akun diaktifkan.
- Tarif komisi: 7% untuk transaksi di bawah Rp 200.000, 6% untuk transaksi Rp 200.000–299.000, dan 5% untuk transaksi Rp 300.000 ke atas.
- Komisi dihitung dari transaksi yang berhasil dan tidak dibatalkan melalui link affiliate.
- Pencairan komisi dilakukan setelah komisi berstatus paid dan diverifikasi oleh admin Northline.
- Dilarang spam link, pemasaran menyesatkan, atau menyalahgunakan kode affiliate orang lain. Komisi bisa dibatalkan jika ada transaksi palsu atau pelanggaran kebijakan.
- Arahkan customer untuk mengecek detail syarat dan kebijakan di halaman Affiliate Northline.

Format penting untuk referensi produk:
- Jika kamu menyebut produk tertentu, sertakan [product:ID] setelah menyebutnya (contoh: "Kaos Boxy 919 NRT [product:1]")
- Jika kamu menyebut semua produk, sertakan [products:all] di akhir kalimat.
- Jangan gunakan format lain selain [product:ID] atau [products:all].
- Tag ini akan digunakan sistem untuk menampilkan gambar produk ke customer.${childrenArticleBlock}`;
}

function buildStoreSystemPrompt(products, history = []) {
    const historyBlock = formatHistory(history);
    const childrenArticleBlock = buildChildrenArticleBlock();

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

        if (p.sizesChildren && p.sizesChildren.length) {
            parts.push(`- Ukuran Anak-anak (usia 1-10 tahun): ${p.sizesChildren.join(', ')}`);
        }

        if (p.childrenPrice) {
            parts.push(`- Harga Khusus Ukuran Anak: Rp${p.childrenPrice.toLocaleString('id-ID')}`);
        }

        if (p.models) {
            parts.push(`- Model: ${p.models.join(', ')}`);
        }

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
- Lihat pada menu Orders dan pantau pengembangan pesanan yang akan diupdate oleh tim Northline.

10. Jika customer bertanya tentang Program Affiliate Northline:
Jawab dengan informasi berikut:
- Northline punya program affiliate di mana pengguna bisa dapat komisi dari tiap penjualan lewat link affiliate pribadi.
- Cara daftar: buka halaman Affiliate di website Northline, link affiliate otomatis dibuat setelah akun aktif.
- Tarif komisi: 7% untuk transaksi di bawah Rp 200.000, 6% untuk Rp 200.000–299.000, dan 5% untuk Rp 300.000 ke atas.
- Komisi dihitung dari transaksi yang berhasil dan tidak dibatalkan lewat link affiliate.
- Pencairan komisi setelah status paid dan diverifikasi admin Northline.
- Dilarang spam link atau menyalahgunakan kode affiliate orang lain; komisi bisa dibatalkan jika ada pelanggaran.
- Arahkan customer cek detail syarat dan kebijakan di halaman Affiliate Northline.${childrenArticleBlock}`;
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

const recommendCache = new Map();
const RECOMMEND_TTL = 10 * 60 * 1000;
const RECOMMEND_LIMIT = 4;

function buildRecommendPrompt(keyword) {
    const productLines = products.slice(0, 25).map((p, i) => {
        const parts = [
            `${i + 1}. ID: ${p.id} - ${p.name}`,
            `- Harga: Rp${p.price.toLocaleString('id-ID')}`,
            `- Warna: ${p.colors.join(', ')}`,
            `- Ukuran: ${p.sizes.join(', ')}`,
        ];
        if (p.oldPrice) parts.push(`- Harga Sebelumnya: Rp${p.oldPrice.toLocaleString('id-ID')}`);
        return parts.join('\n');
    }).join('\n\n');

    return `Kamu adalah mesin rekomendasi produk fashion Northline.
Customer mencari dengan kata kunci: "${keyword}"

Pilih maksimal ${RECOMMEND_LIMIT} produk dari daftar yang PALING COCOK dengan kata kunci tersebut.
Balas HANYA dengan tag [product:ID] yang dipisah spasi, urut dari yang paling relevan. Contoh: [product:3] [product:8]
JANGAN menulis teks lain, kalimat, atau penjelasan apapun selain tag.

Data Produk:
${productLines}

Aturan:
1. Cocokkan kata kunci dengan nama produk, warna, model, dan jenis (tshirt, longsleeve, hoodie, sweatpants, boxy, polos, dll).
2. Pilih produk yang paling masuk akal untuk kata kunci tersebut.
3. Jika tidak ada produk yang cocok, balas dengan HANYA kata "tidak" tanpa tag apapun.
4. Jangan mengarang produk baru.`;
}

function recommendFallback(keyword) {
    return findMentionedProducts(keyword, products).slice(0, RECOMMEND_LIMIT);
}

router.get('/search-recommend', async (req, res) => {
    try {
        const keyword = (req.query.q || '').trim();
        if (!keyword || keyword.length < 2) {
            return res.json({ success: true, products: [] });
        }

        const cacheKey = keyword.toLowerCase();
        const cached = recommendCache.get(cacheKey);
        if (cached) {
            return res.json({ success: true, products: cached });
        }

        let matched = [];
        try {
            const sessionId = await getOrCreateSession();
            const { data } = await axios.post(`${OPENCODE_SERVER}/session/${sessionId}/message`, {
                model: { providerID: 'opencode', modelID: 'deepseek-v4-flash-free' },
                parts: [{ type: 'text', text: `Rekomendasikan produk untuk kata kunci: ${keyword}` }],
                system: buildRecommendPrompt(keyword)
            }, { timeout: 30000 });

            let reply = data.parts?.find(p => p.type === 'text')?.text || '';
            const productTagRegex = /\[product:(\d+)\]/gi;
            let match;
            const matchIds = new Set();
            while ((match = productTagRegex.exec(reply)) !== null) {
                matchIds.add(parseInt(match[1]));
            }
            if (matchIds.size > 0) {
                matched = products.filter(p => matchIds.has(p.id));
            }
        } catch (e) {
            console.error('search-recommend AI error:', e.message);
        }

        if (matched.length === 0) {
            matched = recommendFallback(keyword);
        }

        const result = matched.slice(0, RECOMMEND_LIMIT).map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            oldPrice: p.oldPrice || null,
            image: p.images?.[0] || null,
            code: catalogRoutes.getProductCode(p.id),
            colors: p.colors,
            sizes: p.sizes,
        }));

        recommendCache.set(cacheKey, result);
        setTimeout(() => recommendCache.delete(cacheKey), RECOMMEND_TTL);

        res.json({ success: true, products: result });
    } catch (err) {
        console.error(err);
        res.json({ success: false, products: [] });
    }
});

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
            model: { providerID: 'opencode', modelID: 'deepseek-v4-flash-free' },
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

// ===========================================
// Per-account AI Chat History Storage
// ===========================================
const CHAT_AI_QUOTA_MESSAGES = 500;
const CHAT_AI_QUOTA_BYTES = 2 * 1024 * 1024;

function chatAiMessageBytes(msg) {
    let size = (msg.text || '').length;
    if (msg.products && Array.isArray(msg.products)) size += JSON.stringify(msg.products).length;
    if (msg.feedback) size += msg.feedback.length;
    return size;
}

router.get('/chat-ai/history', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, role, text, products, feedback, timestamp FROM ai_chat_history WHERE user_id=? ORDER BY id ASC',
            [req.user.id]
        );
        const messages = rows.map(r => ({
            id: r.id,
            role: r.role,
            text: r.text,
            products: r.products ? JSON.parse(r.products) : null,
            feedback: r.feedback || null,
            timestamp: r.timestamp
        }));
        const bytes = rows.reduce((sum, r) => sum + chatAiMessageBytes(r), 0);
        res.json({
            success: true,
            messages,
            usage: {
                count: rows.length,
                bytes,
                limitBytes: CHAT_AI_QUOTA_BYTES,
                limitMessages: CHAT_AI_QUOTA_MESSAGES
            }
        });
    } catch (err) {
        console.error('Chat AI history error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/chat-ai/history', verifyToken, async (req, res) => {
    try {
        const { role, text, products, timestamp } = req.body;
        if (!['user', 'bot'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Role tidak valid' });
        }
        if (typeof text !== 'string' || text.length > 10000) {
            return res.status(400).json({ success: false, message: 'Pesan tidak valid' });
        }

        const msg = {
            role,
            text,
            products: Array.isArray(products) ? products : (products ? [products] : null),
            feedback: null,
            timestamp: timestamp || Date.now()
        };

        const bytes = chatAiMessageBytes(msg);

        const [usage] = await db.execute(
            'SELECT COUNT(*) AS cnt, COALESCE(SUM(CHAR_LENGTH(text)),0) AS txt_len FROM ai_chat_history WHERE user_id=?',
            [req.user.id]
        );
        let currentBytes = 0;
        try {
            const [all] = await db.execute(
                'SELECT id, text, products, feedback FROM ai_chat_history WHERE user_id=?',
                [req.user.id]
            );
            currentBytes = all.reduce((sum, r) => sum + chatAiMessageBytes(r), 0);
        } catch (e) {}

        if (usage[0].cnt >= CHAT_AI_QUOTA_MESSAGES || (currentBytes + bytes) > CHAT_AI_QUOTA_BYTES) {
            await db.execute(
                'DELETE FROM ai_chat_history WHERE user_id=? AND id NOT IN (SELECT id FROM (SELECT id FROM ai_chat_history WHERE user_id=? ORDER BY id DESC LIMIT ?) t)',
                [req.user.id, req.user.id, Math.floor(CHAT_AI_QUOTA_MESSAGES * 0.8)]
            );
        }

        const [result] = await db.execute(
            'INSERT INTO ai_chat_history (user_id, role, text, products, feedback, timestamp) VALUES (?,?,?,?,?,?)',
            [req.user.id, msg.role, msg.text, msg.products ? JSON.stringify(msg.products) : null, msg.feedback, msg.timestamp]
        );

        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Chat AI save error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.patch('/chat-ai/history/:id', verifyToken, async (req, res) => {
    try {
        const { feedback } = req.body;
        if (feedback !== null && !['liked', 'disliked'].includes(feedback)) {
            return res.status(400).json({ success: false, message: 'Feedback tidak valid' });
        }
        const [result] = await db.execute(
            'UPDATE ai_chat_history SET feedback=? WHERE id=? AND user_id=?',
            [feedback, req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Pesan tidak ditemukan' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Chat AI feedback error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/chat-ai/history', verifyToken, async (req, res) => {
    try {
        await db.execute('DELETE FROM ai_chat_history WHERE user_id=?', [req.user.id]);
        res.json({ success: true, message: 'Riwayat chat berhasil dihapus' });
    } catch (err) {
        console.error('Chat AI clear error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
