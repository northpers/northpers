const MAX_ORDER_QUANTITY = 99;

function parseOrderQuantity(value) {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_ORDER_QUANTITY
    ? quantity
    : null;
}

function validateShippingCustomer(customer) {
  const name = typeof customer.name === "string" ? customer.name.trim() : "";
  const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";
  const address = typeof customer.address === "string" ? customer.address.trim() : "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (!name || name.length > 255) {
    return "Nama penerima wajib diisi (maksimal 255 karakter)";
  }
  if (!/^[+()\d\s.-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    return "Nomor HP penerima tidak valid";
  }
  if (!address || address.length > 2000) {
    return "Alamat pengiriman wajib diisi (maksimal 2000 karakter)";
  }
  return null;
}

function getOrderReceiptState(paymentStatus, deliveryStatus) {
  if (paymentStatus !== "success") return "not_paid";
  const status = String(deliveryStatus || "").toLowerCase();
  if (status.includes("selesai")) return "already_complete";
  if (!status.includes("dikirim")) return "not_shipped";
  return "can_complete";
}

function getDeliveryTransitionIssue(currentStatus, nextStatus) {
  const status = String(currentStatus || "").toLowerCase();
  const alreadyShipped = status.includes("dikirim");
  const alreadyCompleted = status.includes("selesai");
  if (alreadyShipped && nextStatus === "Pesanan Diproses") return "shipped_to_processing";
  if (alreadyCompleted && nextStatus !== "Pesanan Selesai") return "completed_to_previous";
  if (nextStatus === "Pesanan Selesai" && !alreadyShipped && !alreadyCompleted) return "complete_before_shipping";
  return null;
}

function validateCatalogOptions(product, options) {
  const color = typeof options.color === "string" ? options.color.trim() : "";
  const size = typeof options.size === "string" ? options.size.trim() : "";
  const model = typeof options.model === "string" ? options.model.trim() : "";
  const sizeGroup = typeof options.sizeGroup === "string" && options.sizeGroup.trim()
    ? options.sizeGroup.trim().toUpperCase()
    : "ADULT";

  if (sizeGroup !== "ADULT" && sizeGroup !== "CHILDREN") {
    return "Pilihan kelompok ukuran tidak valid";
  }
  if (Array.isArray(product.colors) && product.colors.length && !product.colors.includes(color)) {
    return "Warna produk tidak tersedia";
  }

  const hasChildrenSizes = Array.isArray(product.sizesChildren) && product.sizesChildren.length > 0;
  if (sizeGroup === "CHILDREN" && !hasChildrenSizes) {
    return "Produk tidak memiliki pilihan ukuran anak";
  }
  const availableSizes = sizeGroup === "CHILDREN" ? product.sizesChildren : product.sizes;
  if (Array.isArray(availableSizes) && availableSizes.length && !availableSizes.includes(size)) {
    return "Ukuran produk tidak tersedia";
  }
  if (Array.isArray(product.models) && product.models.length && !product.models.includes(model)) {
    return "Model produk tidak tersedia";
  }
  return null;
}

module.exports = {
  MAX_ORDER_QUANTITY,
  parseOrderQuantity,
  validateShippingCustomer,
  getOrderReceiptState,
  getDeliveryTransitionIssue,
  validateCatalogOptions,
};
