const POLICY_SETTING_KEYS = [
  "shipping_policy",
  "return_policy",
  "cancellation_policy",
  "warranty_policy",
  "support_contact",
];

function normalizeStorePolicies(rows) {
  const allowed = new Set(POLICY_SETTING_KEYS);
  const policies = {};
  for (const row of rows || []) {
    if (!allowed.has(row.setting_key) || typeof row.setting_value !== "string") continue;
    const value = row.setting_value.trim().slice(0, 3000);
    if (value) policies[row.setting_key] = value;
  }
  return policies;
}

function formatStorePolicies(policies) {
  const labels = {
    shipping_policy: "Pengiriman",
    return_policy: "Retur dan penukaran",
    cancellation_policy: "Pembatalan",
    warranty_policy: "Garansi",
    support_contact: "Kontak bantuan resmi",
  };
  const configured = Object.entries(labels)
    .filter(([key]) => policies[key])
    .map(([key, label]) => `- ${label}: ${policies[key]}`);
  if (!configured.length) {
    return "Kebijakan pengiriman, retur, pembatalan, garansi, dan kontak bantuan belum dikonfigurasi. Jangan mengarang ketentuannya; arahkan pertanyaan spesifik ke admin Northline.";
  }
  return configured.join("\n");
}

async function loadStorePolicies(db) {
  const placeholders = POLICY_SETTING_KEYS.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${placeholders})`,
    POLICY_SETTING_KEYS,
  );
  return normalizeStorePolicies(rows);
}

module.exports = {
  POLICY_SETTING_KEYS,
  normalizeStorePolicies,
  formatStorePolicies,
  loadStorePolicies,
};
