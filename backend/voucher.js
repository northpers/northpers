const VOUCHERS = [
  {
    code: 'free_shipping',
    label: 'Gratis Ongkir',
    desc: 'Bebas biaya kirim untuk semua produk Northline',
    discountPct: 0,
    discountAmount: 0,
    minQty: 1,
    minPurchase: 0,
    category: 'general',
    group: 'free',
    claimRequired: false,
    expiryDay: null,
    expiryMonth: null,
    expiryYear: null,
  },
  {
    code: 'voucher_5k',
    label: 'Diskon Rp5.000',
    desc: 'Potongan Rp5.000',
    discountAmount: 5000,
    group: 'monthly',
    category: 'general',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'voucher_6k',
    label: 'Diskon Rp6.000',
    desc: 'Potongan Rp6.000',
    discountAmount: 6000,
    group: 'monthly',
    category: 'general',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'voucher_7k',
    label: 'Diskon Rp7.000',
    desc: 'Potongan Rp7.000',
    discountAmount: 7000,
    group: 'monthly',
    category: 'general',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'voucher_8k',
    label: 'Diskon Rp8.000',
    desc: 'Potongan Rp8.000',
    discountAmount: 8000,
    group: 'monthly',
    category: 'general',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'voucher_10k',
    label: 'Diskon Rp10.000',
    desc: 'Potongan Rp10.000',
    discountAmount: 10000,
    group: 'monthly',
    category: 'general',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'discount_10_percent',
    label: 'Diskon 10%',
    desc: 'Khusus pembelian 2 produk',
    discountPct: 10,
    minQty: 2,
    group: 'special',
    category: 'general',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'northpay_15k',
    label: 'Diskon Rp15.000',
    desc: 'Khusus pengguna NorthPay aktif',
    discountAmount: 15000,
    group: 'special',
    category: 'northpay',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'npinjam_20k',
    label: 'Diskon Rp20.000',
    desc: 'Khusus pengguna NPinjam aktif',
    discountAmount: 20000,
    group: 'special',
    category: 'npinjam',
    claimRequired: true,
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
  {
    code: 'voucher_17agustus',
    label: 'Diskon 20% 17an',
    desc: 'Potongan 20%',
    discountPct: 20,
    group: 'special',
    category: 'general',
    claimRequired: true,
    claimDay: 17,
    claimMonth: 8,
    claimYear: 2026,
    productCategories: ['shortsleeve', 'hoodie', 'workshirt'],
    expiryDay: 31,
    expiryMonth: 12,
    expiryYear: 2026,
  },
];

function findVoucher(code) {
  return VOUCHERS.find((v) => v.code === code) || null;
}

function isVoucherExpired(v, now) {
  if (!v || v.expiryDay == null || v.expiryMonth == null || v.expiryYear == null) return false;
  const d = now || new Date();
  const end = new Date(v.expiryYear, v.expiryMonth - 1, v.expiryDay, 23, 59, 59);
  return d.getTime() > end.getTime();
}

function isVoucherClaimable(v, now) {
  if (!v || v.claimDay == null || v.claimMonth == null || v.claimYear == null) {
    return { ok: true };
  }
  const d = now || new Date();
  const sameDay =
    d.getDate() === v.claimDay &&
    d.getMonth() === v.claimMonth - 1 &&
    d.getFullYear() === v.claimYear;
  return {
    ok: sameDay,
    message: 'Klaim hanya 17/8/2026',
  };
}

function productMatchesCategories(v, productCategories) {
  if (!v || !v.productCategories || v.productCategories.length === 0) return true;
  const cats = Array.isArray(productCategories) ? productCategories.map(String) : [];
  return v.productCategories.some((c) => cats.includes(String(c)));
}

function computeVoucherDiscount(v, subtotal, quantity) {
  if (!v) return { discountAmount: 0, label: '' };
  const qty = parseInt(quantity) || 1;
  if (v.minQty && qty < v.minQty) return { discountAmount: 0, label: v.label };
  if (v.minPurchase && subtotal < v.minPurchase) return { discountAmount: 0, label: v.label };
  let discountAmount = 0;
  if (v.discountPct > 0) {
    discountAmount = Math.round(subtotal * (v.discountPct / 100));
  } else if (v.discountAmount) {
    discountAmount = v.discountAmount;
  }
  return { discountAmount, label: v.label };
}

function toPublicVoucher(v) {
  return {
    code: v.code,
    label: v.label,
    desc: v.desc,
    discountPct: v.discountPct || 0,
    discountAmount: v.discountAmount || 0,
    minQty: v.minQty || 1,
    minPurchase: v.minPurchase || 0,
    category: v.category,
    group: v.group,
    claimRequired: !!v.claimRequired,
    claimDay: v.claimDay != null ? v.claimDay : null,
    claimMonth: v.claimMonth != null ? v.claimMonth : null,
    claimYear: v.claimYear != null ? v.claimYear : null,
    productCategories: v.productCategories || [],
    expiryDay: v.expiryDay,
    expiryMonth: v.expiryMonth,
    expiryYear: v.expiryYear,
  };
}

module.exports = {
  VOUCHERS,
  findVoucher,
  isVoucherExpired,
  isVoucherClaimable,
  productMatchesCategories,
  computeVoucherDiscount,
  toPublicVoucher,
};
