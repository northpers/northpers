const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const { sendCopilotPrompt } = require('../services/copilotAiClient');
const { aiRecAllowed } = require('../utils/aiRecGate');
const { detectImageExt, safeExtensionFromMime } = require('../utils/uploadValidation');
const { loadStorePolicies, formatStorePolicies } = require('../utils/storePolicies');
let catalogModule = require('./catalog');

const JWT_SECRET = process.env.JWT_SECRET;
const aiChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: 'Terlalu banyak pesan. Coba lagi sebentar.' },
});
const visualSearchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { success: false, message: 'Terlalu banyak pencarian gambar, coba lagi sebentar.' },
});
const visualSearchUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
        if (safeExtensionFromMime(file.mimetype)) return callback(null, true);
        callback(new Error('Unggah file gambar JPG, PNG, GIF, atau WebP.'));
    },
});

const CATALOG_FILE = path.join(__dirname, 'catalog.js');

function loadCatalogProducts() {
    const resolved = require.resolve('./catalog');
    delete require.cache[resolved];
    catalogModule = require('./catalog');
    return catalogModule.NORTHLINE_CATALOG.filter(p => (p.stock || 0) > 0).slice().reverse();
}

let products = loadCatalogProducts();
const visualReferenceCache = new Map();
const VISUAL_REFERENCE_CACHE_MS = 15 * 60 * 1000;
const VISUAL_REFERENCE_MAX_BYTES = 2 * 1024 * 1024;

function reloadCatalogProducts(reason) {
    try {
        products = loadCatalogProducts();
        recommendCache.clear();
        console.log(`[AI] Katalog dimuat ulang (${reason}). Total produk ready stok: ${products.length}`);
    } catch (e) {
        console.error('[AI] Gagal memuat ulang katalog:', e.message);
    }
}

fs.watchFile(CATALOG_FILE, { interval: 3000 }, (curr, prev) => {
    if (!curr || !prev || curr.mtimeMs === prev.mtimeMs) return;
    if (process.env.pm_id !== undefined) {
        console.log('[AI] Produk baru/perubahan katalog terdeteksi, restart otomatis via PM2...');
        setTimeout(() => process.exit(0), 100);
    } else {
        reloadCatalogProducts('perubahan file katalog');
    }
});

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
        const role = msg.role === 'user' ? 'Customer' : 'MiNorth';
        return `${role}: ${msg.text}`;
    });
    return `\nRiwayat Percakapan Sebelumnya:\n${lines.join('\n')}\n`;
}

function buildChildrenArticleBlock() {
    const kidsAvailable = [18, 19].every(id => products.some(p => p.id === id));
    if (!kidsAvailable) return '';
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

function buildSystemPrompt(products, history = [], policies = {}) {
    const historyBlock = formatHistory(history);
    const childrenArticleBlock = buildChildrenArticleBlock();
    const storePolicyBlock = formatStorePolicies(policies);

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

    return `Kamu adalah MiNorth, customer service resmi dari brand fashion Northline.

Informasi Brand Northline:
- Pendiri/Owner: Hata Supriatna & M. Alfian Nur Hadiansyah
- Brand berasal dari: Karawang, Jawa Barat
- Northline adalah brand fashion streetwear premium asli Karawang yang beroprasi pada tahun 2025 oleh PT Northline Indonesia di bawah naungan PT Hostinesia Karawang.
- Desainer Northline adalah @hadabelteee sekaligus dibalik layar website ini dan pendiri Hostinesia Infrastruktur yang anda pakai ini adalah hasil payah dia sendiri.
- Hostinesia adalah perusahaan gitial website yang membangun Northline dan didirikan oleh Kak Hata Supriatna @hadabelteee di Karawang, Jawa Barat
- Northline fokus pada kualitas bahan, kenyamanan, dan desain boxy fit modern.

Gaya bicara:
- Panggil pelanggan dengan "kak"
- Bicara natural dan santai, kayak lagi ngobrol sama temen
- Jangan kedengeran kayak robot atau AI
- Jawab dengan hangat dan helpful
- Gunakan bahasa Indonesia sehari-hari yang natural
- JANGAN gunakan emoji sama sekali
- JANGAN sebut dirimu AI, robot, bot, atau asisten virtual
- Jawab singkat dan to the point, nggak perlu bertele-tele${historyBlock}

Kebijakan dan bantuan resmi yang saat ini dikonfigurasi:
${storePolicyBlock}

Data Produk Saat Ini (HANYA produk yang ready stok):
- PENTING: Daftar di bawah adalah satu-satunya produk yang boleh kamu sebut, tampilkan, atau rekomendasikan.
- JANGAN PERNAH menyebutkan, menampilkan tag [product:ID], atau merekomendasikan produk apapun yang TIDAK ada dalam daftar ini (produk tersebut sedang stok habis dan tidak boleh muncul di chat).

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
- Jika customer menanyakan produk yang TIDAK ada di daftar Data Produk, jawab bahwa produk tersebut sedang tidak tersedia/stok habis, lalu sarankan produk lain dari daftar.

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

11. Jika customer bertanya tentang pengiriman, retur, pembatalan, garansi, atau cara menghubungi bantuan:
- Gunakan hanya informasi yang tertera pada bagian Kebijakan dan bantuan resmi di atas.
- Jangan menyebut mitra kurir, jaminan keamanan, biaya, wilayah layanan, tenggat, atau syarat yang tidak tercantum di sana.
- Jika informasinya belum tersedia, arahkan dengan sopan ke admin Northline dan jangan menebak.

12. Jika customer bertanya tentang Program Affiliate Northline:
Jawab dengan informasi berikut:
- Northline memiliki program affiliate tempat pengguna bisa mendapatkan komisi dari setiap penjualan melalui link affiliate pribadi mereka.
- Untuk bergabung, kunjungi halaman Affiliate di website Northline (menu Affiliate) dan link affiliate otomatis dibuat setelah akun diaktifkan.
- Tarif komisi: 7% untuk transaksi di bawah Rp 200.000, 6% untuk transaksi Rp 200.000–299.000, dan 5% untuk transaksi Rp 300.000 ke atas.
- Komisi dihitung dari transaksi yang berhasil dan tidak dibatalkan melalui link affiliate.
- Pencairan komisi dilakukan setelah komisi berstatus paid dan diverifikasi oleh admin Northline.
- Dilarang spam link, pemasaran menyesatkan, atau menyalahgunakan kode affiliate orang lain. Komisi bisa dibatalkan jika ada transaksi palsu atau pelanggaran kebijakan.
- Arahkan customer untuk mengecek detail syarat dan kebijakan di halaman Affiliate Northline.

13. PERTANYAAN DI LUAR TOPIK NORTHLINE (PALING PENTING):
- Kamu HANYA boleh membantu terkait produk Northline, harga, ukuran, warna, stok, pesanan, pengiriman, brand Northline, cara order, dan program affiliate.
- Jika customer bertanya tentang hal di luar itu semua (misal: politik, agama, kesehatan, hukum, cuaca, mata pelajaran, lowongan kerja, resep masakan, teknologi, pengetahuan umum, atau hal pribadi):
  - JANGAN PERNAH menjawab isi pertanyaannya.
  - JANGAN beropini, JANGAN mengarang, dan JANGAN menebak-nebak jawaban.
  - Langsung balas dengan: "Mohon maaf, saya hanya bisa membantu seputar produk, pesanan, dan layanan Northline. Untuk pertanyaan tersebut, silakan hubungi admin Northline ya."
- Jika ragu pertanyaan itu berkaitan dengan Northline atau tidak, anggap sebagai pertanyaan di luar topik dan arahkan ke admin Northline.
- Jangan pernah menjawab "asal" atau halu dari pertanyaan di luar data yang kamu punya.

Format penting untuk referensi produk:
- Jika kamu menyebut produk tertentu, sertakan [product:ID] setelah menyebutnya (contoh: "Kaos Boxy 919 NRT [product:1]")
- Jika kamu menyebut semua produk, sertakan [products:all] di akhir kalimat.
- Jangan gunakan format lain selain [product:ID] atau [products:all].
- Tag ini akan digunakan sistem untuk menampilkan gambar produk ke customer.${childrenArticleBlock}`;
}

function buildStoreSystemPrompt(products, history = [], policies = {}) {
    const historyBlock = formatHistory(history);
    const childrenArticleBlock = buildChildrenArticleBlock();
    const storePolicyBlock = formatStorePolicies(policies);

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

Gaya bicara:
- Panggil pelanggan dengan "kak"
- Bicara natural dan santai, kayak lagi ngobrol sama temen
- Jangan kedengeran kayak robot atau AI
- Jawab dengan hangat dan helpful
- Gunakan bahasa Indonesia sehari-hari yang natural
- JANGAN gunakan emoji sama sekali
- JANGAN sebut dirimu AI, robot, bot, atau asisten virtual
- Jawab singkat dan to the point, nggak perlu bertele-tele${historyBlock}

Kebijakan dan bantuan resmi yang saat ini dikonfigurasi:
${storePolicyBlock}

Data Produk Saat Ini (HANYA produk yang ready stok):
- PENTING: Daftar di bawah adalah satu-satunya produk yang boleh kamu sebut, tampilkan, atau rekomendasikan.
- JANGAN PERNAH menyebutkan, menampilkan tag [product:ID], atau merekomendasikan produk apapun yang TIDAK ada dalam daftar ini (produk tersebut sedang stok habis dan tidak boleh muncul di chat).

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
- Jika customer menanyakan produk yang TIDAK ada di daftar Data Produk, jawab bahwa produk tersebut sedang tidak tersedia/stok habis, lalu sarankan produk lain dari daftar.

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

10. Untuk pertanyaan pengiriman, retur, pembatalan, garansi, atau kontak bantuan, gunakan hanya kebijakan resmi yang tertera di atas. Jangan menebak jika belum dikonfigurasi; arahkan ke admin.

11. Jika customer bertanya tentang Program Affiliate Northline:
Jawab dengan informasi berikut:
- Northline punya program affiliate di mana pengguna bisa dapat komisi dari tiap penjualan lewat link affiliate pribadi.
- Cara daftar: buka halaman Affiliate di website Northline, link affiliate otomatis dibuat setelah akun aktif.
- Tarif komisi: 7% untuk transaksi di bawah Rp 200.000, 6% untuk Rp 200.000–299.000, dan 5% untuk Rp 300.000 ke atas.
- Komisi dihitung dari transaksi yang berhasil dan tidak dibatalkan lewat link affiliate.
- Pencairan komisi setelah status paid dan diverifikasi admin Northline.
- Dilarang spam link atau menyalahgunakan kode affiliate orang lain; komisi bisa dibatalkan jika ada pelanggaran.
- Arahkan customer cek detail syarat dan kebijakan di halaman Affiliate Northline.

12. PERTANYAAN DI LUAR TOPIK NORTHLINE (PALING PENTING):
- Kamu HANYA boleh membantu seputar produk Northline, harga, ukuran, warna, stok, pesanan, pengiriman, brand Northline, cara order, dan program affiliate.
- Jika customer nanya di luar itu semua (misal: politik, agama, kesehatan, hukum, cuaca, pelajaran, lowongan kerja, resep masakan, teknologi, pengetahuan umum, atau hal pribadi):
  - JANGAN PERNAH jawab isi pertanyaannya.
  - JANGAN beropini, JANGAN mengarang, JANGAN ngarang-ngarang jawaban.
  - Langsung balas natural: "Maaf kak, aku cuma bisa bantu soal produk, pesanan, sama layanan Northline. Untuk pertanyaan itu, silakan hubungi admin Northline ya kak."
- Kalau ragu pertanyaannya nyambung atau nggak sama Northline, anggap aja di luar topik dan arahkan ke admin Northline.
- Jangan pernah jawab asal-asalan atau ngarang dari pertanyaan yang nggak ada di data.${childrenArticleBlock}`;
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

const recommendCache = new Map();
const RECOMMEND_TTL = 10 * 60 * 1000;
const RECOMMEND_LIMIT = 4;
const RECOMMEND_POOL = 8;

function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

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

Pilih maksimal ${RECOMMEND_POOL} produk dari daftar yang PALING COCOK dengan kata kunci tersebut, urutkan dari yang paling relevan.
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
    return shuffleArray(findMentionedProducts(keyword, products)).slice(0, RECOMMEND_POOL);
}

async function fetchVisualReference(product) {
    const imageUrl = product.images?.[0];
    if (!imageUrl) return null;

    const cached = visualReferenceCache.get(product.id);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const url = new URL(imageUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'nl.hostinesia.my.id') return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        const extension = safeExtensionFromMime(contentType);
        if (!extension || !contentType.startsWith('image/')) return null;
        const contentLength = Number(response.headers.get('content-length'));
        if (contentLength > VISUAL_REFERENCE_MAX_BYTES) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        const detectedExtension = detectImageExt(buffer);
        if (!detectedExtension || buffer.length > VISUAL_REFERENCE_MAX_BYTES) return null;

        const reference = {
            buffer,
            extension: detectedExtension,
            expiresAt: Date.now() + VISUAL_REFERENCE_CACHE_MS,
        };
        visualReferenceCache.set(product.id, reference);
        return reference;
    } catch (error) {
        console.warn(`[AI visual search] Gambar katalog produk ${product.id} gagal diambil:`, error.message);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function getVisualSearchReferences(catalogProducts) {
    const references = new Array(catalogProducts.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(4, catalogProducts.length) }, async () => {
        while (nextIndex < catalogProducts.length) {
            const index = nextIndex++;
            references[index] = await fetchVisualReference(catalogProducts[index]);
        }
    });
    await Promise.all(workers);
    return references
        .map((reference, index) => reference ? { product: catalogProducts[index], ...reference } : null)
        .filter(Boolean);
}

function buildVisualSearchPrompt(candidates) {
    const candidateList = candidates.map(({ product }) =>
        `- ID ${product.id}: ${product.name}; warna: ${(product.colors || []).join(', ')}; ciri: ${(product.deskripsi || '').slice(0, 220)}`
    ).join('\n');
    return `Kamu adalah mesin pencarian visual untuk katalog produk Northline.
Customer mengunggah foto dan lampiran gambar lain adalah foto referensi produk katalog. Cocokkan foto customer dengan foto referensi katalog secara visual, dengan mempertimbangkan siluet pakaian, warna, motif, grafis, dan detail yang terlihat.

Daftar ID kandidat sesuai nama lampiran:
${candidateList}

Balas hanya dengan tag [product:ID] untuk maksimal 6 kandidat yang paling mirip, urutkan dari kemiripan tertinggi. ID harus berasal dari daftar di atas. Jika tidak ada kandidat yang cukup mirip, balas hanya dengan kata "tidak". Jangan menebak atau memilih produk hanya karena namanya mirip.`;
}

router.post('/search/image', visualSearchLimiter, (req, res, next) => {
    visualSearchUpload.single('image')(req, res, (error) => {
        if (!error) return next();
        const status = error instanceof multer.MulterError ? 400 : 415;
        return res.status(status).json({
            success: false,
            message: error.code === 'LIMIT_FILE_SIZE'
                ? 'Ukuran gambar maksimal 5 MB.'
                : error.message,
        });
    });
}, async (req, res) => {
    let tempDirectory;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Pilih gambar untuk mencari produk.' });
        }
        const uploadedImageExtension = detectImageExt(req.file.buffer);
        if (!uploadedImageExtension || uploadedImageExtension !== safeExtensionFromMime(req.file.mimetype)) {
            return res.status(400).json({ success: false, message: 'File yang diunggah bukan gambar yang valid.' });
        }
        const candidates = products.filter(product => product.images?.[0]);
        const references = await getVisualSearchReferences(candidates);
        if (!references.length) {
            throw new Error('Foto referensi katalog tidak dapat dimuat.');
        }

        tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'northline-visual-search-'));
        const uploadedImagePath = path.join(tempDirectory, `search-image${uploadedImageExtension}`);
        await fs.promises.writeFile(uploadedImagePath, req.file.buffer, { flag: 'wx' });
        const attachments = [{
            type: 'file',
            path: uploadedImagePath,
            displayName: `customer-search-image${uploadedImageExtension}`,
        }];
        const candidateLines = [];
        for (const { product, buffer, extension } of references) {
            const referencePath = path.join(tempDirectory, `catalog-product-${product.id}${extension}`);
            await fs.promises.writeFile(referencePath, buffer, { flag: 'wx' });
            candidateLines.push({ product });
            attachments.push({
                type: 'file',
                path: referencePath,
                displayName: `catalog-product-${product.id}${extension}`,
            });
        }

        const { reply } = await sendChatWithFallback(
            'Bandingkan gambar customer dengan foto-foto referensi katalog yang terlampir.',
            buildVisualSearchPrompt(candidateLines),
            attachments,
        );

        const ids = [];
        const tagRegex = /\[product:(\d+)\]/gi;
        let match;
        while ((match = tagRegex.exec(reply)) !== null && ids.length < 6) {
            const id = Number(match[1]);
            if (!ids.includes(id)) ids.push(id);
        }
        const productsById = new Map(references.map(({ product }) => [product.id, product]));
        const matchedProducts = ids.map(id => productsById.get(id)).filter(Boolean);
        const results = matchedProducts.map(product => ({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.images?.[0] || null,
            code: catalogModule.getProductCode(product.id),
            colors: product.colors,
            sizes: product.sizes,
            source: 'catalog',
            ai: true,
        }));

        return res.json({
            success: true,
            products: results,
            message: results.length ? '' : 'Belum ada produk katalog yang cukup mirip dengan gambar ini.',
        });
    } catch (error) {
        console.error('[AI visual search] Pencarian gambar gagal:', error);
        return res.status(500).json({
            success: false,
            message: 'Pencarian AI gagal memproses gambar. Silakan coba lagi.',
        });
    } finally {
        if (tempDirectory) {
            try {
                await fs.promises.rm(tempDirectory, { recursive: true, force: true });
            } catch (error) {
                console.error('[AI visual search] Gagal membersihkan file sementara:', error);
            }
        }
    }
});

router.get('/search-recommend', async (req, res) => {
    try {
        const keyword = (req.query.q || '').trim();
        if (!keyword || keyword.length < 2) {
            return res.json({ success: true, products: [] });
        }

        if (!(await aiRecAllowed(req))) {
            return res.json({ success: true, products: [] });
        }

        const cacheKey = keyword.toLowerCase();
        const cached = recommendCache.get(cacheKey);
        if (cached) {
            return res.json({ success: true, products: cached });
        }

        let matched = [];
        let active = null;
        try {
            active = await getActiveChatModel();
            const reply = await sendCopilotPrompt({
                model: active.modelID,
                prompt: `Rekomendasikan produk untuk kata kunci: ${keyword}`,
                systemPrompt: buildRecommendPrompt(keyword),
                timeout: 30000,
            });
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
            if (active) await markModelError(active.provider, active.modelID, e.message);
            console.error('search-recommend AI error:', e.message);
        }

        if (matched.length === 0) {
            matched = recommendFallback(keyword);
        }

        const pool = matched.slice(0, RECOMMEND_POOL).map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            oldPrice: p.oldPrice || null,
            image: p.images?.[0] || null,
            code: catalogModule.getProductCode(p.id),
            colors: p.colors,
            sizes: p.sizes,
        }));

        recommendCache.set(cacheKey, pool);
        setTimeout(() => recommendCache.delete(cacheKey), RECOMMEND_TTL);

        res.json({ success: true, products: shuffleArray(pool).slice(0, RECOMMEND_LIMIT) });
    } catch (err) {
        console.error(err);
        res.json({ success: false, products: [] });
    }
});

let aiModelsCache = null;
let aiModelsCacheAt = 0;
const AI_MODELS_TTL = 30000;

async function getAiModels() {
    if (aiModelsCache && Date.now() - aiModelsCacheAt < AI_MODELS_TTL) return aiModelsCache;
    try {
        const [rows] = await db.execute('SELECT provider, model_id, is_active, enabled FROM ai_models ORDER BY id ASC');
        aiModelsCache = rows;
        aiModelsCacheAt = Date.now();
        return rows;
    } catch (e) {
        console.error('[AI] Gagal membaca konfigurasi model:', e.message);
        throw e;
    }
}

async function getActiveChatModel() {
    const models = await getAiModels();
    const copilotModels = models.filter(m => m.provider === 'copilot' && m.enabled === 1);
    const active = copilotModels.find(m => m.is_active === 1) || copilotModels[0];
    if (active) return { provider: active.provider, modelID: active.model_id };
    throw new Error('Belum ada model GitHub Copilot aktif. Sinkronkan model Copilot dari halaman admin.');
}

async function markModelError(provider, modelID, msg) {
    try {
        await db.execute('UPDATE ai_models SET last_error=?, last_checked_at=NOW() WHERE provider=? AND model_id=?', [String(msg).substring(0, 290), provider, modelID]);
        aiModelsCache = null;
    } catch (e) {}
}

async function recordModelUsage(provider, modelID, replyText) {
    try {
        const estTokens = Math.max(1, Math.ceil((replyText || '').length / 4));
        await db.execute(
            'UPDATE ai_models SET total_messages = total_messages + 1, total_tokens = total_tokens + ?, last_used_at = NOW(), last_error=NULL, last_checked_at=NOW() WHERE provider=? AND model_id=?',
            [estTokens, provider, modelID]
        );
        aiModelsCache = null;
    } catch (e) {}
}

async function getChatModelFallbackOrder() {
    const models = await getAiModels();
    return models.filter(m => m.provider === 'copilot' && m.enabled === 1)
        .map(m => ({ provider: m.provider, modelID: m.model_id }));
}

async function sendChatWithFallback(prompt, systemPrompt, attachments = []) {
    const active = await getActiveChatModel();
    const fallbacks = (await getChatModelFallbackOrder()).filter(m => !(m.provider === active.provider && m.modelID === active.modelID));
    const queue = [active, ...fallbacks.slice(0, 8)];

    let lastError = null;
    for (const m of queue) {
        try {
            const reply = await sendCopilotPrompt({
                model: m.modelID,
                prompt,
                systemPrompt,
                attachments,
                timeout: 120000,
            });
            if (reply) {
                await recordModelUsage(m.provider, m.modelID, reply);
                return { reply, usedModel: `${m.provider}/${m.modelID}` };
            }
            lastError = new Error('Kosong');
        } catch (e) {
            lastError = e;
            await markModelError(m.provider, m.modelID, e.message);
            console.warn(`chat model ${m.provider}/${m.modelID} gagal:`, e.message);
        }
    }
    throw lastError || new Error('Semua model AI gagal');
}

router.post('/chat', aiChatLimiter, (req, res, next) => {
    const hasImage = Boolean(req.body?.imageUrl);
    const hasOrderContext = Boolean(req.body?.orderId);
    if (!hasImage && !hasOrderContext) return next();
    const hasToken = Boolean(
        req.headers.authorization ||
        (req.headers.cookie && /(?:^|;\s*)nl_jwt=[^;]+/.test(req.headers.cookie)),
    );
    if (!hasImage && !hasToken) return next();
    return verifyToken(req, res, next);
}, async (req, res) => {
    try {
        const { message, history, mode, imageUrl, userId } = req.body;
        const normalizedMessage = typeof message === 'string' ? message.trim() : '';
        if (normalizedMessage.length > 1000) {
            return res.status(400).json({ reply: 'Pesan tidak valid.' });
        }
        if (!normalizedMessage && !imageUrl) {
            return res.status(400).json({ reply: 'Pesan atau gambar wajib dikirim.' });
        }

        let orderContext = '';
        if (req.body.orderId) {
            const orderId = typeof req.body.orderId === 'string' ? req.body.orderId.trim() : '';
            if (!orderId || orderId.length > 100) {
                return res.status(400).json({ reply: 'ID pesanan tidak valid.' });
            }

            let orderRows;
            if (req.user) {
                [orderRows] = await db.execute(
                    `SELECT order_id, product_name, status, delivery_status, tracking_number,
                            tracking_courier, estimated_arrival
                     FROM transactions WHERE order_id = ? AND user_id = ? LIMIT 1`,
                    [orderId, req.user.id],
                );
            } else {
                const guestToken = req.headers['x-guest-order-token'] || req.body.guestOrderToken;
                if (typeof guestToken !== 'string' || !/^[a-f0-9]{64}$/i.test(guestToken)) {
                    return res.status(401).json({ reply: 'Token pesanan guest tidak valid.' });
                }
                const tokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
                [orderRows] = await db.execute(
                    `SELECT order_id, product_name, status, delivery_status, tracking_number,
                            tracking_courier, estimated_arrival
                     FROM transactions
                     WHERE order_id = ? AND user_id IS NULL AND guest_access_token_hash = ? LIMIT 1`,
                    [orderId, tokenHash],
                );
            }
            if (orderRows.length === 0) {
                return res.status(404).json({ reply: 'Pesanan tidak ditemukan atau tidak dapat diakses.' });
            }
            const order = orderRows[0];
            orderContext = [
                `Konteks pesanan terverifikasi ${order.order_id}:`,
                `Produk: ${order.product_name}.`,
                `Pembayaran: ${order.status}.`,
                `Status pengiriman: ${order.delivery_status || 'belum diperbarui'}.`,
                order.tracking_courier ? `Kurir: ${order.tracking_courier}.` : '',
                order.tracking_number ? `Nomor resi: ${order.tracking_number}.` : '',
                order.estimated_arrival ? `Estimasi tiba: ${order.estimated_arrival}.` : '',
                'Gunakan hanya data order di atas dan jangan menyimpulkan tanggal atau status yang tidak tercatat.',
            ].filter(Boolean).join('\n');
        }

        const attachments = [];
        if (imageUrl) {
            const match = typeof imageUrl === 'string'
                ? imageUrl.match(/^\/uploads\/chat\/([A-Za-z0-9_-]+\.(?:jpe?g|png|gif|webp))$/i)
                : null;
            if (!match) {
                return res.status(400).json({ reply: 'Gambar tidak valid.' });
            }
            const parsedUserId = Number(userId);
            if (!Number.isSafeInteger(parsedUserId) || parsedUserId <= 0) {
                return res.status(400).json({ reply: 'Pengguna gambar tidak valid.' });
            }
            if (!req.user || req.user.id !== parsedUserId) {
                return res.status(403).json({ reply: 'Gambar hanya dapat dianalisis oleh pemilik chat.' });
            }
            const [uploadedImages] = await db.execute(
                "SELECT id FROM chat_messages WHERE user_id=? AND sender='user' AND type='image' AND message=? LIMIT 1",
                [parsedUserId, imageUrl],
            );
            if (uploadedImages.length === 0) {
                return res.status(403).json({ reply: 'Gambar tidak ditemukan di chat pengguna ini.' });
            }
            const imagePath = path.resolve(__dirname, '../uploads/chat', match[1]);
            const imageDirectory = path.resolve(__dirname, '../uploads/chat') + path.sep;
            if (!imagePath.startsWith(imageDirectory) || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
                return res.status(400).json({ reply: 'Gambar tidak ditemukan.' });
            }
            attachments.push({ type: 'file', path: imagePath, displayName: match[1] });
        }

        const policies = await loadStorePolicies(db);
        const systemPrompt = mode === 'store'
            ? buildStoreSystemPrompt(products, history || [], policies)
            : buildSystemPrompt(products, history || [], policies);

        const customerPrompt = attachments.length
            ? `${normalizedMessage || 'Tolong jelaskan gambar yang saya kirim dan bantu saya jika berkaitan dengan produk Northline.'}\n\nPerhatikan gambar terlampir. Jelaskan hanya hal yang benar-benar terlihat dan jangan menebak detail yang tidak jelas.`
            : normalizedMessage;
        const prompt = orderContext ? `${orderContext}\n\nPertanyaan pelanggan: ${customerPrompt}` : customerPrompt;
        let { reply } = await sendChatWithFallback(prompt, systemPrompt, attachments);

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

        matchedProducts = matchedProducts.filter(p => (p.stock || 0) > 0);

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

        const handoffRequired = /hubungi admin|menunggu konfirmasi admin|kurang tahu pastinya|informasi lebih lanjut/i.test(reply);
        if (handoffRequired && req.user) {
            const handoffMessage = `[Perlu tindak lanjut admin] ${normalizedMessage || 'Pertanyaan terkait lampiran gambar.'}${req.body.orderId ? ` [Order ${String(req.body.orderId).trim()}]` : ''}`;
            await db.execute(
                "INSERT INTO chat_messages (user_id, sender, message) VALUES (?, 'user', ?)",
                [req.user.id, handoffMessage.slice(0, 2000)],
            );
        }
        res.json({ reply, products: productData, handoffRequired });
    } catch (err) {
        console.error(err);
        res.status(500).json({ reply: 'MiNorth sedang tidak tersedia.', products: [] });
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
module.exports.CHAT_AI_QUOTA_MESSAGES = CHAT_AI_QUOTA_MESSAGES;
module.exports.CHAT_AI_QUOTA_BYTES = CHAT_AI_QUOTA_BYTES;
module.exports.invalidateAiModelsCache = () => {
    aiModelsCache = null;
    aiModelsCacheAt = 0;
};
