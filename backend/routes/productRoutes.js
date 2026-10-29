const express = require("express");
const router = express.Router();
const db = require("../config/db");
const catalogRoutes = require("./catalog");
const flashDiscount = require("../utils/flashDiscount");

router.get("/search", async (req, res) => {
    try {

        const keyword = (req.query.q || "").trim();

        if (!keyword) {
            return res.json({ products: [], sellers: [] });
        }

        const kw = keyword.toLowerCase();

        const catalogProducts = catalogRoutes.NORTHLINE_CATALOG
            .filter(p => p.name && p.name.toLowerCase().includes(kw) && (p.stock || 0) > 0)
            .map(p => ({
                id: p.id,
                name: p.name,
                price: p.priceShort || p.price || 0,
                img: (p.images && p.images[0]) || "default.png",
                code: catalogRoutes.getProductCode(p.id),
                store_name: "Northline Official",
                source: "catalog"
            }));

        const flash = await flashDiscount.getFlashState();
        if (flash.active) {
            catalogProducts.forEach(p => {
                const promo = flash.prices[String(p.id)];
                if (promo && promo < p.price) p.price = promo;
            });
        }

        const [productRows] = await db.query(`
            SELECT
                p.id,
                p.name,
                p.price,
                (
                    SELECT image_url
                    FROM product_images
                    WHERE product_id = p.id
                    ORDER BY sort_order ASC
                    LIMIT 1
                ) AS image,
                s.store_name
            FROM products p
            JOIN sellers s ON s.id = p.seller_id
            WHERE p.status = 'active' AND p.stock > 0 AND p.name LIKE ?
            LIMIT 20
        `, [
            `%${keyword}%`
        ]);

        const [sellerRows] = await db.query(`
            SELECT
                user_id AS id,
                store_name
            FROM sellers
            WHERE store_name LIKE ?
            LIMIT 20
        `, [
            `%${keyword}%`
        ]);

        const dbProducts = productRows.map(p => ({
            id: p.id,
            name: p.name,
            price: Number(p.price) || 0,
            img: p.image || "default.png",
            store_name: p.store_name,
            source: "database"
        }));

        const merged = catalogProducts.slice();
        const catalogIds = new Set(merged.map(p => p.id));
        dbProducts.forEach(p => {
            if (!catalogIds.has(p.id)) merged.push(p);
        });

        return res.json({
            products: merged,
            sellers: sellerRows.map(seller => ({
                id: seller.id,
                type: "seller",
                store_name: seller.store_name,
                logo: seller.logo
            }))
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            message: err.message
        });

    }
});

module.exports = router;