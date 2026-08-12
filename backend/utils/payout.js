const db = require("../config/db");

const DEFAULT_FEE_RATE = 2;
const DEFAULT_TAX_RATE = 1;
const WORKING_DAYS = 30;

async function getFeeRates() {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('seller_fee_rate','seller_tax_rate')",
  );
  const map = {};
  rows.forEach((r) => (map[r.setting_key] = r.setting_value));
  return {
    feeRate: parseFloat(map.seller_fee_rate) || DEFAULT_FEE_RATE,
    taxRate: parseFloat(map.seller_tax_rate) || DEFAULT_TAX_RATE,
  };
}

function addWorkingDays(startDate, days) {
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

async function computeSellerPayout(totalPrice, createdAt) {
  const { feeRate, taxRate } = await getFeeRates();
  const gross = Number(totalPrice) || 0;
  const fee = Math.round(gross * feeRate) / 100;
  const tax = Math.round(gross * taxRate) / 100;
  const net = gross - fee - tax;
  return { gross, fee, tax, net, releaseAt: addWorkingDays(createdAt, WORKING_DAYS) };
}

async function ensureSellerFinance(orderId) {
  const { feeRate, taxRate } = await getFeeRates();
  const [rows] = await db.query(
    "SELECT id, total_price, created_at FROM transactions WHERE order_id = ? AND status = 'success' LIMIT 1",
    [orderId],
  );
  if (!rows.length) return null;
  const o = rows[0];
  const gross = Number(o.total_price) || 0;
  const fee = Math.round(gross * feeRate) / 100;
  const tax = Math.round(gross * taxRate) / 100;
  const net = gross - fee - tax;
  const releaseAt = addWorkingDays(o.created_at, WORKING_DAYS);
  await db.query(
    `UPDATE transactions SET seller_net = ?, admin_fee = ?, payout_release_at = ? WHERE id = ?`,
    [net, fee + tax, releaseAt, o.id],
  );
  return { gross, fee, tax, net, releaseAt };
}

async function runAutoPayout() {
  try {
    const [orders] = await db.query(
      `SELECT t.id, t.order_id, t.total_price, t.created_at, t.seller_net, t.admin_fee, s.user_id AS seller_user_id
       FROM transactions t
       JOIN products p ON p.id = CAST(t.product_id AS UNSIGNED)
       JOIN sellers s ON s.id = p.seller_id
       WHERE t.status = 'success'
         AND (t.payout_status IS NULL OR t.payout_status = 'pending')
         AND t.payout_release_at IS NOT NULL
         AND t.payout_release_at <= CURDATE()`,
    );
    let processed = 0;
    for (const o of orders) {
      const net = o.seller_net != null ? Number(o.seller_net) : Number(o.total_price) || 0;
      await db.query("UPDATE user_northline SET northpay_balance = northpay_balance + ? WHERE id = ?", [net, o.seller_user_id]);
      await db.query("UPDATE transactions SET payout_status = 'released', payout_at = NOW() WHERE id = ?", [o.id]);
      await db.query(
        "INSERT INTO user_notifications (user_id, title, message) VALUES (?, 'Pendapatan Masuk', ?)",
        [o.seller_user_id, `Pendapatan dari order ${o.order_id} sebesar Rp ${Math.round(net).toLocaleString("id-ID")} telah dicairkan otomatis ke saldo NorthPay Anda.`],
      );
      processed++;
    }
    return processed;
  } catch (err) {
    console.error("Auto payout error:", err);
    return 0;
  }
}

module.exports = { getFeeRates, addWorkingDays, computeSellerPayout, ensureSellerFinance, runAutoPayout, WORKING_DAYS };
