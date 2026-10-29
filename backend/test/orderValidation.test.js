const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_ORDER_QUANTITY,
  parseOrderQuantity,
  validateShippingCustomer,
  getOrderReceiptState,
  getDeliveryTransitionIssue,
  validateCatalogOptions,
} = require("../utils/orderValidation");

test("accepts integer quantities within the configured limit", () => {
  assert.equal(parseOrderQuantity(1), 1);
  assert.equal(parseOrderQuantity("3"), 3);
  assert.equal(parseOrderQuantity(MAX_ORDER_QUANTITY), MAX_ORDER_QUANTITY);
});

test("rejects missing, fractional, zero, negative, and excessive quantities", () => {
  for (const value of [undefined, null, "", 0, -1, 1.5, "2x", MAX_ORDER_QUANTITY + 1]) {
    assert.equal(parseOrderQuantity(value), null, `expected ${String(value)} to be rejected`);
  }
});

test("validates shipping recipient name, phone, and address", () => {
  assert.equal(
    validateShippingCustomer({ name: "  Rani  ", phone: "+62 812-3456-7890", address: "  Karawang  " }),
    null,
  );
  assert.match(validateShippingCustomer({ name: "", phone: "081234567890", address: "Jalan" }), /Nama penerima/);
  assert.match(validateShippingCustomer({ name: "Rani", phone: "123abc45", address: "Jalan" }), /Nomor HP/);
  assert.match(validateShippingCustomer({ name: "Rani", phone: "081234567890", address: "" }), /Alamat pengiriman/);
  assert.match(validateShippingCustomer({ name: "Rani", phone: "081234567890", address: "x".repeat(2001) }), /Alamat pengiriman/);
});

test("only allows receipt confirmation after payment and shipment", () => {
  assert.equal(getOrderReceiptState("pending", "Pesanan Dikirim"), "not_paid");
  assert.equal(getOrderReceiptState("success", "Pesanan Diproses"), "not_shipped");
  assert.equal(getOrderReceiptState("success", "Pesanan Selesai"), "already_complete");
  assert.equal(getOrderReceiptState("success", "Pesanan Dikirim"), "can_complete");
});

test("prevents delivery status regression and completion before shipping", () => {
  assert.equal(getDeliveryTransitionIssue("Pesanan Dikirim", "Pesanan Diproses"), "shipped_to_processing");
  assert.equal(getDeliveryTransitionIssue("Pesanan Selesai", "Pesanan Dikirim"), "completed_to_previous");
  assert.equal(getDeliveryTransitionIssue("Pesanan Diproses", "Pesanan Selesai"), "complete_before_shipping");
  assert.equal(getDeliveryTransitionIssue("Pesanan Diproses", "Pesanan Dikirim"), null);
});

test("accepts valid catalog selections and defaults the size group to adult", () => {
  const product = {
    colors: ["Black"],
    sizes: ["M", "L"],
    models: ["SHORT", "LONG"],
  };
  assert.equal(
    validateCatalogOptions(product, { color: "Black", size: "M", model: "LONG" }),
    null,
  );
});

test("rejects unavailable colors, sizes, models, and child sizes", () => {
  const product = {
    colors: ["Black"],
    sizes: ["M", "L"],
    models: ["SHORT", "LONG"],
  };
  assert.equal(validateCatalogOptions(product, { color: "Red", size: "M", model: "SHORT" }), "Warna produk tidak tersedia");
  assert.equal(validateCatalogOptions(product, { color: "Black", size: "S", model: "SHORT" }), "Ukuran produk tidak tersedia");
  assert.equal(validateCatalogOptions(product, { color: "Black", size: "M", model: "XL" }), "Model produk tidak tersedia");
  assert.equal(validateCatalogOptions(product, { color: "Black", size: "M", model: "SHORT", sizeGroup: "CHILDREN" }), "Produk tidak memiliki pilihan ukuran anak");
});

test("validates children's sizes and size groups when available", () => {
  const product = { colors: ["White"], sizes: ["M"], sizesChildren: ["8", "10"] };
  assert.equal(validateCatalogOptions(product, { color: "White", size: "10", sizeGroup: "children" }), null);
  assert.equal(validateCatalogOptions(product, { color: "White", size: "M", sizeGroup: "children" }), "Ukuran produk tidak tersedia");
  assert.equal(validateCatalogOptions(product, { color: "White", size: "M", sizeGroup: "infant" }), "Pilihan kelompok ukuran tidak valid");
});
