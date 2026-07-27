const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/search", async (req, res) => {
    try {

        const keyword = (req.query.q || "").trim();

        if (!keyword) {
            return res.json([]);
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
            WHERE p.status = 'active' AND p.name LIKE ?
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

        return res.json({
            products: productRows.map(p => ({
                id: p.id,
                name: p.name,
                price: Number(p.price) || 0,
                img: p.image || "default.png",
                store_name: p.store_name,
                source: "database"
            })),
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