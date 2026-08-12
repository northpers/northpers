const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { cachedQuery, invalidateByPrefix } = require("../config/redis");

const SIZE_EXTRA = { "S": 0, "M": 1000, "L": 2000, "XL": 3000 };

const NORTHLINE_CATALOG = [
  {
    id: 1,
    name: "Northline Longsleeve & Shortsleeve Boxy 919 NRT - 24s Cotton Combed Kaos Boxy",
    priceShort: 138000,
    priceLong: 158000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtWhiteLong919.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtWhiteShort919.jpeg",
    ],
    colors: ["PUTIH"],
    models: ["PANJANG", "PENDEK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 2,
    name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
    priceShort: 138000,
    priceLong: 158000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtwhiteLongNorth.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtWhiteShortNorth.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtBlackLongNorth.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtBlackShortNorth.jpeg",
    ],
    colors: ["PUTIH", "HITAM"],
    models: ["PANJANG", "PENDEK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 3,
    name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
    priceShort: 138000,
    priceLong: 158000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtWhiteLong.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtWhiteShort.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtBlackLong.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtBlackShort.jpeg",
    ],
    colors: ["PUTIH", "HITAM"],
    models: ["PANJANG", "PENDEK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 4,
    name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
    priceShort: 138000,
    priceLong: 158000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtWhiteLongArabic.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtWhiteShortArabic.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtBlackLongArabic.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtBlackShortArabic.jpeg",
    ],
    colors: ["PUTIH", "HITAM"],
    models: ["PANJANG", "PENDEK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 5,
    name: "Northline Workshirt Zipper Black Boxy -  Workshirt Zipper Boxy",
    price: 188000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthWorkshirtZipper.jpeg",
      "https://nl.hostinesia.my.id/public/image/NorthlineWorkshirtZipper.jpeg",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 6,
    name: "Northline Longsleeve 111 White Boxy -  24s Cotton Combed Longsleeve White Boxy",
    priceShort: 138000,
    priceLong: 158000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtwhite111Long.jpeg",
      "https://nl.hostinesia.my.id/public/image/nrtwhite111Short.jpeg",
    ],
    colors: ["PUTIH"],
    models: ["PANJANG", "PENDEK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 7,
    name: "Northline Shortsleeve NORTNL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
    priceShort: 138000,
    priceLong: 158000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtNORTNLWhiteShort.webp",
      "https://nl.hostinesia.my.id/public/image/nrtNORTNLWhiteLong.webp",
    ],
    colors: ["PUTIH"],
    models: ["PANJANG", "PENDEK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 8,
    name: "Northline Afterall Boxy Work Shirt Zipper -  NORTNL Afterall Boxy Work Shirt Zipper",
    priceLong: 240000,
    price: 240000,
    oldPrice: 280000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtNORTNLKemejaZipper.webp",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 9,
    name: "Northline HOODIE NORTNL BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
    priceLong: 310000,
    price: 310000,
    oldPrice: 320000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtNORTNLHoodieBoxyZipper.webp",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 10,
    name: "Northline HOODIE NRT BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
    priceLong: 310000,
    price: 310000,
    oldPrice: 320000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtHoodieNRTStyle.webp",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 11,
    name: "Northline HOODIE NORTH AMERICAN BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
    priceLong: 310000,
    price: 310000,
    oldPrice: 320000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtAmricStyleHoodie.webp",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 12,
    name: "Northline ShortSleeve NORTH AMERICAN Style -  24s Cotton Combed Shortsleeve Black Boxy",
    priceShort: 138000,
    price: 138000,
    oldPrice: 240000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtAmricStyleTsirth.webp",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 13,
    name: "Northline HOODIE PINK STYLE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
    priceLong: 310000,
    price: 310000,
    oldPrice: 320000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtPinkStyle1.webp",
      "https://nl.hostinesia.my.id/public/image/nrtPinkStyle2.webp",
      "https://nl.hostinesia.my.id/public/image/nrtPinkStyle3.webp",
      "https://nl.hostinesia.my.id/public/image/nrtPinkStyle4.webp",
    ],
    colors: ["PINK"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 14,
    name: "Northline HOODIE NRL STYLE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
    priceLong: 310000,
    price: 310000,
    oldPrice: 320000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/20260806_194750.jpg",
      "https://nl.hostinesia.my.id/public/image/20260806_194945.jpg",
      "https://nl.hostinesia.my.id/public/image/20260806_195025.jpg",
      "https://nl.hostinesia.my.id/public/image/20260806_234434.jpg",
    ],
    colors: ["PINK", "ABU-ABU", "BIRU", "MERAH"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 15,
    name: "Northline Shortsleeve NRL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
    priceShort: 138000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/20260807_023344.jpg",
      "https://nl.hostinesia.my.id/public/image/20260807_023450.webp",
    ],
    colors: ["PUTIH"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 16,
    name: "Northline Shortsleeve NL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
    priceShort: 138000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/20260807_023614.webp",
      "https://nl.hostinesia.my.id/public/image/20260807_023639.jpg",
    ],
    colors: ["PUTIH"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 17,
    name: "Northline Shortsleeve New Article 2026 White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
    priceShort: 138000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtNewArchiveWhite.webp",
    ],
    colors: ["PUTIH"],
    sizes: ["M", "L", "XL"],
  },
  {
    id: 18,
    name: "Northline Shortsleeve NORTHLINE Black Boxy -  24s Cotton Combed Shortsleeve Black Boxy",
    priceShort: 138000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtShortsleeveNorthline1.webp?=v2",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
    sizesChildren: [ "S", "M", "L", "XL", "XXL"],
    childrenPrice: 88000,
  },
  {
    id: 19,
    name: "Northline Shortsleeve NORTHLINE INDONESIA Black Boxy -  24s Cotton Combed Shortsleeve Black Boxy",
    priceShort: 138000,
    price: 138000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtShortsleeveNorthline2.webp?=v2",
    ],
    colors: ["HITAM"],
    sizes: ["M", "L", "XL"],
    sizesChildren: [ "S", "M", "L", "XL", "XXL"],
    childrenPrice: 88000,
  },
];

const crypto = require("crypto");

function getProductCode(id) {
  return "nrt-" + crypto.createHash("sha256").update("northline-" + id).digest("hex").slice(0, 12);
}

const FEATURED_IDS = [19, 18, 17, 16, 15, 14, 13, 12, 11];

function getCategories(product) {
  const n = String(product.name || "").toLowerCase();
  const cats = [];
  if (/hoodie/.test(n)) cats.push("hoodie");
  if (/short\s*sleeve/.test(n)) cats.push("shortsleeve");
  if (/long\s*sleeve/.test(n)) cats.push("longsleeve");
  if (/work\s*shirt/.test(n)) cats.push("workshirt");
  return cats;
}

function findCatalogProduct(ref) {
  if (!ref) return null;
  const key = String(ref).trim().toLowerCase();
  let p = NORTHLINE_CATALOG.find((x) => getProductCode(x.id) === key);
  if (!p) {
    const idMatch = key.match(/^\d+$/);
    if (idMatch) {
      p = NORTHLINE_CATALOG.find((x) => String(x.id) === key);
    }
  }
  return p || null;
}

function dummyReviewMeta(productId) {
  const n = Math.abs(Number(productId) * 9301 + 49297) % 1000;
  const ratings = [4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0];
  const counts = [5400, 5800, 6200, 6600, 7100, 7500, 8100, 8700, 9200, 9800, 10800];
  return {
    avgRating: ratings[n % ratings.length],
    totalReviews: counts[n % counts.length]
  };
}

function mergeRealReviews(productId, realCount, realAvg) {
  const dummy = dummyReviewMeta(productId);
  const realCountNum = Math.max(0, parseInt(realCount) || 0);
  const realAvgNum = Number(realAvg) || 0;
  const totalReviews = dummy.totalReviews + realCountNum;
  let avgRating = dummy.avgRating;
  if (realCountNum > 0 && realAvgNum > 0) {
    avgRating = Math.round(((dummy.avgRating * dummy.totalReviews) + (realAvgNum * realCountNum)) / totalReviews * 10) / 10;
  }
  return { avgRating, totalReviews };
}

function thumbUrl(imageUrl) {
  const s = String(imageUrl || '').split('?')[0];
  const m = s.match(/\/public\/image\/(.+)\.[^.]+$/);
  if (!m) return imageUrl;
  return s.replace('/public/image/', '/public/image/opt/').replace(/\.[^.]+$/, '') + '.webp';
}

function withCode(product) {
  const merged = mergeRealReviews(product.id, product.totalReviews || 0, product.avgRating || 0);
  const thumbs = (product.images || []).map(thumbUrl);
  return { ...product, avgRating: merged.avgRating, totalReviews: merged.totalReviews, thumbs, code: getProductCode(product.id), featured: FEATURED_IDS.includes(product.id), sortOrder: product.id, categories: getCategories(product) };
}

function computeUnitPrice(catalogProduct, model, size, sizeGroup) {
  if (String(sizeGroup || "").toUpperCase() === "CHILDREN" && catalogProduct.childrenPrice) {
    return catalogProduct.childrenPrice;
  }
  if (String(size || "").toUpperCase() === "CHILDREN" && catalogProduct.childrenPrice) {
    return catalogProduct.childrenPrice;
  }
  let base = 0;
  if (catalogProduct.priceLong && catalogProduct.priceShort) {
    base = String(model).toUpperCase() === "PANJANG" ? catalogProduct.priceLong : catalogProduct.priceShort;
  } else if (catalogProduct.priceShort) {
    base = catalogProduct.priceShort;
  } else {
    base = catalogProduct.price || 0;
  }
  return base + (SIZE_EXTRA[String(size || "").toUpperCase()] || 0);
}

let productsCache = null;
let productsCacheAt = 0;
const PRODUCTS_CACHE_TTL = 30 * 1000;

router.get("/products", async (req, res) => {
  if (productsCache && Date.now() - productsCacheAt < PRODUCTS_CACHE_TTL) {
    return res.json({ products: productsCache });
  }
  let list = NORTHLINE_CATALOG.map(withCode);
  try {
    const [rows] = await db.execute(
      "SELECT product_id, COUNT(*) c, AVG(rating) a FROM product_reviews GROUP BY product_id"
    );
    const real = {};
    rows.forEach(r => { real[Number(r.product_id)] = { c: parseInt(r.c) || 0, a: r.a ? Math.round(Number(r.a) * 10) / 10 : 0 }; });
    list = list.map(p => {
      const r = real[Number(p.id)];
      if (r && r.c > 0) {
        const merged = mergeRealReviews(p.id, r.c, r.a);
        p.avgRating = merged.avgRating;
        p.totalReviews = merged.totalReviews;
      }
      return p;
    });
  } catch (e) {
    console.error("gabung reviews gagal:", e.message);
  }
  productsCache = list;
  productsCacheAt = Date.now();
  res.json({ products: list });
});

router.get("/reviews", async (req, res) => {
  try {
    const { productId, rating } = req.query;
    const cacheKey = `catalog:reviews:${productId || 'all'}:${rating || 'all'}`;

    const data = await cachedQuery(cacheKey, 300, async () => {
      let where = "WHERE 1=1";
      const params = [];
      if (productId) { where += " AND c.product_id=?"; params.push(parseInt(productId)); }
      if (rating) { where += " AND c.rating=?"; params.push(parseInt(rating)); }

      const [rows] = await db.execute(
        `SELECT c.id, c.product_id, c.user_id, c.username, c.user_avatar, c.rating, c.rating_bahan, c.rating_ukuran, c.rating_warna,
                c.variant_color, c.variant_size, c.variant_model, c.review_text, c.images, c.verified_purchase,
                c.reply_text, c.reply_at, c.reply_by, c.created_at
         FROM product_reviews c
         ${where}
         ORDER BY c.created_at DESC, c.id DESC`
        , params);

      const [aggRows] = await db.execute(
        `SELECT product_id, COUNT(*) as total, AVG(rating) as avg_rating
         FROM product_reviews
         WHERE product_id IN (SELECT DISTINCT product_id FROM product_reviews)
         GROUP BY product_id`
      );

      const prodMeta = {};
      aggRows.forEach(r => { prodMeta[r.product_id] = { totalReviews: r.total, avgRating: r.avg_rating ? Math.round(Number(r.avg_rating) * 10) / 10 : 0 }; });

      const reviewMap = new Map();
      NORTHLINE_CATALOG.forEach(p => {
        const m = prodMeta[p.id] || { totalReviews: 0, avgRating: 0 };
        reviewMap.set(p.id, {
          id: p.id,
          name: p.name,
          image: (p.images && p.images[0]) || '/public/icons/default.png',
          code: getProductCode(p.id),
          totalReviews: m.totalReviews,
          avgRating: m.avgRating,
        });
      });

      const allCounts = {};
      for (let i = 1; i <= 5; i++) allCounts[i] = 0;
      const byProduct = {};
      rows.forEach(r => {
        if (!byProduct[r.product_id]) byProduct[r.product_id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        byProduct[r.product_id][r.rating] = (byProduct[r.product_id][r.rating] || 0) + 1;
        allCounts[r.rating] = (allCounts[r.rating] || 0) + 1;
      });
      Object.keys(reviewMap).forEach(id => {
        if (!byProduct[id]) byProduct[id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviewMap.get(id).ratingCounts = byProduct[id];
      });

      const totalReviews = rows.length;
      const avg = totalReviews > 0
        ? Math.round(rows.reduce((s, r) => s + (r.rating || 0), 0) / totalReviews * 10) / 10
        : 0;

      return {
        success: true,
        totalReviews,
        avgRating: avg,
        ratingCounts: allCounts,
        products: Array.from(reviewMap.values()).filter(p => p.totalReviews > 0),
        reviews: rows.map(r => ({
          id: r.id,
          productId: r.product_id,
          productName: (reviewMap.get(Number(r.product_id)) || {}).name || null,
          productImage: (reviewMap.get(Number(r.product_id)) || {}).image || null,
          userName: r.username,
          userAvatar: r.user_avatar,
          rating: r.rating,
          ratingBahan: r.rating_bahan,
          ratingUkuran: r.rating_ukuran,
          ratingWarna: r.rating_warna,
          variantColor: r.variant_color,
          variantSize: r.variant_size,
          variantModel: r.variant_model,
          images: r.images ? JSON.parse(r.images) : [],
          verified: !!r.verified_purchase,
          replyText: r.reply_text,
          replyAt: r.reply_at,
          replyBy: r.reply_by,
          text: r.review_text,
          createdAt: r.created_at,
        })),
      };
    });

    res.json(data);
  } catch (err) {
    console.error("catalog reviews error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = {
  router,
  NORTHLINE_CATALOG,
  getProductCode,
  findCatalogProduct,
  computeUnitPrice,
  SIZE_EXTRA,
  withCode,
  getCategories,
  dummyReviewMeta,
  mergeRealReviews,
};
