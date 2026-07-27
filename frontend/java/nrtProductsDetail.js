function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

async function loadModalStructure() {

  if (document.getElementById("product-modal")) return;
  try {
    const response = await fetch("/nrtModalProducts.html");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    document.body.insertAdjacentHTML("beforeend", html);
  } catch (err) {
    console.error("Modal gagal load:", err);
  }
}

const ORIGINAL_PAGE_TITLE = document.title;

let appliedVoucher = {};

const VOUCHERS = [
  { id: 'free_shipping', label: 'Gratis Ongkir', desc: 'Bebas biaya kirim untuk semua produk Northline', discountPct: 0, group: 'free' },
  { id: 'voucher_5k', label: 'Diskon Rp5.000', desc: 'Potongan Rp5.000', discountAmount: 5000, group: 'monthly', expiryDay: 31, expiryMonth: 7, expiryYear: 2026 },
  { id: 'voucher_6k', label: 'Diskon Rp6.000', desc: 'Potongan Rp6.000', discountAmount: 6000, group: 'monthly', expiryDay: 31, expiryMonth: 7, expiryYear: 2026 },
  { id: 'voucher_7k', label: 'Diskon Rp7.000', desc: 'Potongan Rp7.000', discountAmount: 7000, group: 'monthly', expiryDay: 31, expiryMonth: 7, expiryYear: 2026 },
  { id: 'voucher_8k', label: 'Diskon Rp8.000', desc: 'Potongan Rp8.000', discountAmount: 8000, group: 'monthly', expiryDay: 31, expiryMonth: 7, expiryYear: 2026 },
  { id: 'voucher_10k', label: 'Diskon Rp10.000', desc: 'Potongan Rp10.000', discountAmount: 10000, group: 'monthly', expiryDay: 31, expiryMonth: 7, expiryYear: 2026 },
  { id: 'discount_10_percent', label: 'Diskon 10%', desc: 'Khusus pembelian 2 produk', discountPct: 10, minQty: 2, group: 'special', expiryDay: 31, expiryMonth: 12, expiryYear: 2026 },
];

function getCurrentQty() {
  return parseInt(document.getElementById('modal-qty-input')?.value || 1);
}

function formatDate(day, month, year) {
  return `${day}/${month}/${year}`;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

window.addEventListener("DOMContentLoaded", loadModalStructure);

let selectedColor = "";
let selectedSize = "";
let selectedModel = "";
let currentProductId = null;

const products = [
  {
    id: 1,
    name: "Northline Longsleeve & Shortsleeve Boxy 919 NRT - 24s Cotton Combed Kaos Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "27 MEI",
    readyEnd: "20 JUNI 2026",
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
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 2,
    name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "27 MEI",
    readyEnd: "20 JUNI 2026",
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
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 3,
    name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
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
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 4,
    name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
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
    sizes: ["S", "M", "L", "XL"],
  },

  {
    id: 5,
    name: "Northline Workshirt Zipper Black Boxy -  Workshirt Zipper Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
    price: 188000,
    oldPrice: 250000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthWorkshirtZipper.jpeg",
      "https://nl.hostinesia.my.id/public/image/NorthlineWorkshirtZipper.jpeg",
    ],
    colors: ["HITAM"],
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 6,
    name: "Northline Longsleeve 111 White Boxy -  24s Cotton Combed Longsleeve White Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
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
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 7,
    name: "Northline Shortsleeve NORTNL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
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
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 8,
    name: "Northline Afterall Boxy Work Shirt Zipper -  NORTNL Afterall Boxy Work Shirt Zipper",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
    priceLong: 240000,
    price: 240000,
    oldPrice: 280000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtNORTNLKemejaZipper.webp",
    ],
    colors: ["HITAM"],
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: 9,
    name: "Northline HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
    preOrderTarget: "2026-05-30T23:59:59",
    readyStart: "30 MEI",
    readyEnd: "20 JUNI 2026",
    priceLong: 310000,
    price: 310000,
    oldPrice: 320000,
    avgRating: 4,
    totalReviews: 0,
    images: [
      "https://nl.hostinesia.my.id/public/image/nrtNORTNLHoodieBoxyZipper.webp",
    ],
    colors: ["HITAM"],
    sizes: ["S", "M", "L", "XL"],
  },
];

window.openProduct = async function (productId, source = "database") {
  if (source === "local") {
    const product = (window.northlineProducts || []).find(
      (p) => p.id == productId,
    );
    if (!product) return showIosModal("Produk tidak ditemukan");

    openProductDetailLocal(product);
  } else {
    openProductDetailAPI(productId);
  }
};

function getColorName(colorHex) {
  if (colorHex.toLowerCase() === "#ffffff") return "White";
  if (colorHex.toLowerCase() === "#000000") return "Black";
  return colorHex;
}

function getCurrentPrice(product) {
    if (!product) return 0;
    let basePrice = 0;
    if (product.priceLong && product.priceShort) {
        basePrice = selectedModel === "PANJANG"
            ? product.priceLong
            : product.priceShort;
    } else {
        basePrice = product.price || 0;
    }
    const sizeExtra = {
        "S": 0,
        "M": 1000,
        "L": 2000,
        "XL": 3000
    };
    return basePrice + (sizeExtra[selectedSize] || 0);
}

function updateProductPrice() {
  const product = products.find((p) => p.id === currentProductId);
  if (!product) return;
  const priceEl = document.getElementById("detail-price");
  const oldPriceEl = document.getElementById("detail-old-price");
  const badge = document.getElementById("voucher-discount-badge");
  const note = document.getElementById("applied-voucher-display");
  const checkoutPrice = document.getElementById("voucher-checkout-price");
  const checkoutNote = document.getElementById("voucher-checkout-note");
  const currentPrice = getCurrentPrice(product);
  const voucher = appliedVoucher[currentProductId];
  let displayPrice = currentPrice;
  let discountText = '';
  if (voucher) {
    const qty = getCurrentQty();
    const subtotal = currentPrice * qty;
    let discountAmount = 0;
    if (voucher.discountPct > 0) {
      discountAmount = Math.round(subtotal * (voucher.discountPct / 100));
    } else if (voucher.discountAmount) {
      discountAmount = voucher.discountAmount;
    }
    displayPrice = subtotal - discountAmount;
    discountText = voucher.discountText || (voucher.discountPct > 0 ? `Diskon ${voucher.discountPct}%` : voucher.discountAmount ? `Diskon Rp${voucher.discountAmount.toLocaleString('id-ID')}` : 'Gratis Ongkir');
    appliedVoucher[currentProductId] = { ...voucher, discountAmount, finalPrice: displayPrice };
  }
  if (priceEl) {
    priceEl.innerText = `IDR ${displayPrice.toLocaleString("id-ID")}`;
  }
  if (oldPriceEl && product.oldPrice) {
    oldPriceEl.innerText = `IDR ${product.oldPrice.toLocaleString("id-ID")}`;
  }
  if (checkoutPrice) {
    checkoutPrice.innerText = `IDR ${displayPrice.toLocaleString("id-ID")}`;
  }
  if (badge) badge.classList.add("hidden");
  if (note) note.classList.add("hidden");
  if (checkoutNote) checkoutNote.classList.add("hidden");
  if (voucher) {
    if (badge) badge.classList.remove("hidden");
    if (note) { note.classList.remove("hidden"); note.textContent = `Telah menggunakan ${voucher.discountText}`; }
    if (checkoutNote) { checkoutNote.classList.remove("hidden"); checkoutNote.textContent = `Voucher aktif: ${discountText}`; }
  }
}

function openProductDetail(productId) {
  const product = products.find((p) => Number(p.id) === Number(productId));

  if (!product) {
    return;
  }

  window.currentProduct = product;
  currentProductId = productId;
  selectedColor = product.colors[0] || "";
  selectedSize = product.sizes[0] || "";
  selectedModel = product.models?.[0] || "";

  const qtyInput = document.getElementById("modal-qty-input");
  if (qtyInput) qtyInput.value = 1;

  const detailName = document.getElementById("detail-name");
  if (!detailName) return;
  detailName.innerText = product.name;
  document.title = product.name + " | Northline";

  startModalSearchPlaceholder(product.name);

  const ratingStarsEl = document.getElementById("detail-rating-stars");
  const reviewCountEl = document.getElementById("detail-review-count");

  const currentAvgRating = product.avgRating || 0;
  const currentTotalReviews = product.totalReviews || 0;

  if (ratingStarsEl) {
    ratingStarsEl.innerText =
      "★".repeat(currentAvgRating) + "☆".repeat(5 - currentAvgRating);
  }
  if (reviewCountEl) {
    reviewCountEl.innerText = currentTotalReviews;
  }

  updateSelectedLabels();

  const readyPeriodEl = document.getElementById("ready-period");
  if (readyPeriodEl) {
    if (product.readyStart && product.readyEnd) {
      readyPeriodEl.innerText = `PERIODE READY: ${product.readyStart} - ${product.readyEnd}`;
      readyPeriodEl.classList.remove("hidden");
    } else {
      readyPeriodEl.classList.add("hidden");
    }
  }

  updateProductPrice();
  const oldPriceEl = document.getElementById("detail-old-price");
  if (oldPriceEl) {
    if (product.oldPrice) {
      oldPriceEl.innerText = `IDR ${product.oldPrice.toLocaleString("id-ID")}`;
      oldPriceEl.classList.remove("hidden");
    } else {
      oldPriceEl.classList.add("hidden");
    }
  }

  const mainPreview = document.getElementById("main-preview");
  mainPreview.src = product.images[0];
  mainPreview.alt = product.name;

  const slideCounter = document.getElementById("slide-counter");
  if (slideCounter) {
    slideCounter.innerText = `1 / ${product.images.length}`;
  }

  const thumbContainer = document.getElementById("thumb-container");
  thumbContainer.innerHTML = product.images
    .map(
      (img, index) => `
        <div
            onclick="changePreview('${img}', this, ${index + 1}, ${product.images.length})"
            onmouseenter="changePreview('${img}', this, ${index + 1}, ${product.images.length})"
            class="thumb-item w-10 h-10 md:w-20 md:h-20 bg-gray-50 border cursor-pointer overflow-hidden transition-all ${index === 0 ? "border-[#DF414F] ring-1 ring-[#DF414F]" : "border-gray-200"}">
            <img src="${img}" class="w-full h-full object-contain pointer-events-none">
        </div>
    `,
    )
    .join("");

  const colorContainer = document.getElementById("color-options");
  colorContainer.innerHTML = product.colors
    .map((color, index) => {
      const colorName = getColorName(color);
      return `
            <button onclick="selectColor('${color}', this)" 
                    class="color-option-btn px-2 py-1 md:px-3 md:py-1.5 border text-[11px] md:text-xs transition-all uppercase cursor-pointer select-none ${
                      index === 0
                        ? "border-[#DF414F] bg-[#fff1ee] text-[#DF414F] font-black shadow-sm"
                        : "border-gray-200 bg-white text-gray-800 hover:border-[#DF414F] font-bold"
                    }">
                ${colorName}
            </button>
        `;
    })
    .join("");

  const modelContainer = document.getElementById("model-options");
  if (modelContainer) {
    modelContainer.innerHTML = (product.models || [])
      .map(
        (model, index) => `
          <button
              onclick="selectModel('${model}', this)"
              class="model-option-btn px-2 py-1 md:px-3 md:py-1.5 border text-[11px] md:text-xs transition-all uppercase cursor-pointer select-none ${
                index === 0
                  ? "border-[#DF414F] bg-[#fff1ee] text-[#DF414F] font-black shadow-sm"
                  : "border-gray-200 bg-white text-gray-800 hover:border-[#DF414F] font-bold"
              }">
              ${model}
          </button>
        `,
      )
      .join("");
  }

  const sizeContainer = document.getElementById("size-options");
  sizeContainer.innerHTML = product.sizes
    .map(
      (size, index) => `
        <button onclick="selectSize('${size}', this)" 
                class="size-option-btn px-2 py-1 md:px-3 md:py-1.5 border text-[11px] md:text-xs transition-all uppercase cursor-pointer select-none ${
                  index === 0
                    ? "border-[#DF414F] bg-[#fff1ee] text-[#DF414F] font-black shadow-sm"
                    : "border-gray-200 bg-white text-gray-800 hover:border-[#DF414F] font-bold"
                }">
            ${size}
        </button>
    `,
    )
    .join("");

  if (typeof loadProductComments === "function") {
    loadProductComments(productId);
  }

  const modal = document.getElementById("product-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  document.body.style.overflow = "hidden";

  history.pushState({ productId }, "", `?product=${productId}`);
}

function changePreview(src, element, currentSlide, totalSlides) {
  const preview = document.getElementById("main-preview");

  preview.classList.add("opacity-50");

  setTimeout(() => {
    preview.src = src;
    preview.classList.remove("opacity-50");
  }, 80);

  const slideCounter = document.getElementById("slide-counter");
  if (slideCounter && currentSlide && totalSlides) {
    slideCounter.innerText = `${currentSlide} / ${totalSlides}`;
  }

  document.querySelectorAll(".thumb-item").forEach((el) => {
    el.classList.remove("border-[#DF414F]", "ring-1", "ring-[#DF414F]");
    el.classList.add("border-gray-200");
  });

  element.classList.add("border-[#DF414F]", "ring-1", "ring-[#DF414F]");
  element.classList.remove("border-gray-200");
}

function closeModal() {
  const modal = document.getElementById("product-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");

  closeVoucherPopup();
  document.body.style.overflow = "auto";
  document.title = ORIGINAL_PAGE_TITLE;

  history.pushState({}, "", window.location.pathname);
}

function updateSelectedLabels() {
  const colorLabel = document.getElementById("selected-color-text");
  const sizeLabel = document.getElementById("selected-size-text");
  const modelLabel = document.getElementById("selected-model-text");

  if (colorLabel)
    colorLabel.innerText =
      selectedColor.toLowerCase() === "#ffffff" ? "White" : selectedColor;

  if (sizeLabel) sizeLabel.innerText = selectedSize;

  if (modelLabel) modelLabel.innerText = selectedModel;
}

function selectColor(color, element) {
  selectedColor = color;
  updateSelectedLabels();

  document.querySelectorAll(".color-option-btn").forEach((btn) => {
    btn.className =
      "color-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[11px] md:text-xs font-bold transition-all uppercase cursor-pointer select-none";
  });

  element.className =
    "color-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[11px] md:text-xs transition-all uppercase cursor-pointer select-none shadow-sm";
}

function selectSize(size, element) {
  selectedSize = size;
  updateSelectedLabels();
  updateProductPrice();

  document.querySelectorAll(".size-option-btn").forEach((btn) => {
    btn.className =
      "size-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[11px] md:text-xs font-bold transition-all uppercase cursor-pointer select-none";
  });

  element.className =
    "size-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[11px] md:text-xs transition-all uppercase cursor-pointer select-none shadow-sm";
}

function selectModel(model, element) {
  selectedModel = model;
  updateSelectedLabels();
  updateProductPrice();

  document.querySelectorAll(".model-option-btn").forEach((btn) => {
    btn.className =
      "model-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[11px] md:text-xs font-bold transition-all uppercase cursor-pointer select-none";
  });
  element.className =
    "model-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[11px] md:text-xs transition-all uppercase cursor-pointer select-none shadow-sm";
}

function alterQty(amount) {
  const input = document.getElementById("modal-qty-input");
  if (!input) return;
  let currentVal = parseInt(input.value) || 1;
  currentVal += amount;
  if (currentVal < 1) currentVal = 1;
  input.value = currentVal;
}

async function getFreshUserData(userId) {
  try {
    const response = await fetch(`/api/user-profile/${userId}`);
    return await response.json();
  } catch (error) {
    console.error("Gagal konek ke server:", error);
    return null;
  }
}

async function triggerCheckout() {
  const checkoutBtn = document.getElementById("btn-checkout");
  if (checkoutBtn.disabled) return;
  checkoutBtn.disabled = true;
  checkoutBtn.innerHTML = `
        <div class="flex items-center justify-center gap-2">
            <div class="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            <span>LOADING...</span>
        </div>
    `;
  const product = products.find((p) => p.id === currentProductId);
  if (!product) {
    resetCheckoutButton();
    return;
  }
  let parsedUser = null;
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      const me = meData.data || meData.user || meData;
      if (me && me.id) parsedUser = { id: me.id };
    }
  } catch (e) {}
  if (!parsedUser) {
    showIosModal(
      "Waduh!, lu harus masuk akun dulu sebelum bisa checkout Northline!",
    );
    resetCheckoutButton();
    return;
  }
  const freshUser = await getFreshUserData(parsedUser.id);
  if (!freshUser || !freshUser.address || freshUser.address.trim() === "") {
    showIosModal(
      "Isi dulu alamat pengiriman di profile, Ya! Masa bajunya mau dikirim ke kuburan.",
    );
    resetCheckoutButton();
    return;
  }
  const qty = parseInt(document.getElementById("modal-qty-input").value);
  const currentPrice = getCurrentPrice(product);
  const subtotal = currentPrice * qty;
  let discountAmount = getAppliedVoucherDiscount(currentProductId);
  let isDiscounted = discountAmount > 0;
  if (!isDiscounted) {
    try {
      const discountCheck = await fetch(`/api/check-discount/${parsedUser.id}`);
      const discountData = await discountCheck.json();
      if (discountData.eligible) {
        isDiscounted = true;
        discountAmount = Math.round(subtotal * 0.05);
      }
    } catch (err) {
      console.log("Discount check gagal:", err);
    }
  }
  const voucherFinalPrice = getAppliedVoucherFinalPrice(currentProductId, subtotal);
  const totalAfterDiscount = voucherFinalPrice;
  const checkoutPayload = {
    userId: parsedUser.id,
    productId: product.id,
    productName: product.name,

    productImage:
      document.getElementById("main-preview")?.src ||
      product.images?.[0] ||
      "/public/icons/default.png",

    quantity: qty,

    chosenColor: selectedColor,
    chosenSize: selectedSize,
    chosenModel: selectedModel,

    orderId: "NL-" + Date.now(),

    subtotal,
    discountAmount,
    totalPrice: totalAfterDiscount,
    isDiscounted,
  };
  setTimeout(() => {
    window.bukaModalPembayaran(checkoutPayload);
    resetCheckoutButton();
  }, 800);
}

function resetCheckoutButton() {
  const checkoutBtn = document.getElementById("btn-checkout");
  checkoutBtn.disabled = false;
  checkoutBtn.innerHTML = `Check Out`;
}

function openVoucherPopup() {
  const overlay = document.getElementById('voucher-popup-overlay');
  const sheet = document.getElementById('voucher-popup-sheet');
  if (!overlay || !sheet) return;
  if (!appliedVoucher[currentProductId]) applyVoucherById('free_shipping');
  renderVoucherCards();
  overlay.classList.remove('pointer-events-none', 'opacity-0');
  sheet.classList.remove('translate-y-full');
}

function closeVoucherPopup() {
  const overlay = document.getElementById('voucher-popup-overlay');
  const sheet = document.getElementById('voucher-popup-sheet');
  if (!overlay || !sheet) return;
  overlay.classList.add('pointer-events-none', 'opacity-0');
  sheet.classList.add('translate-y-full');
}

function selectVoucher(id) {
  const active = appliedVoucher[currentProductId];
  if (active && active.type === id) return;
  const qty = getCurrentQty();
  const voucher = VOUCHERS.find(v => v.id === id);
  if (voucher && voucher.minQty && qty < voucher.minQty) return;
  document.querySelectorAll('.voucher-item').forEach(i => i.classList.remove('selected'));
  const card = document.querySelector(`.voucher-item[data-voucher-id="${id}"]`);
  if (card) card.classList.add('selected');
  applyVoucherById(id);
}

function applyVoucherById(id) {
  const voucher = VOUCHERS.find(v => v.id === id);
  if (!voucher) return;
  const product = products.find(p => p.id === currentProductId);
  if (!product) return;
  const currentPrice = getCurrentPrice(product);
  const qty = getCurrentQty();
  const subtotal = currentPrice * qty;
  let discountAmount = 0;
  if (voucher.discountPct > 0) {
    discountAmount = Math.round(subtotal * (voucher.discountPct / 100));
  } else if (voucher.discountAmount) {
    discountAmount = voucher.discountAmount;
  }
  const finalPrice = subtotal - discountAmount;
  const discountText = voucher.label.toLowerCase();
  appliedVoucher[currentProductId] = { type: id, discountPct: voucher.discountPct, discountAmount, finalPrice, discountText };
  updateProductPrice();
}

function renderVoucherCards() {
  const container = document.querySelector('#voucher-list-container .space-y-3');
  if (!container) return;
  const active = appliedVoucher[currentProductId];
  const qty = getCurrentQty();
  const groups = { free: [], monthly: [], special: [] };
  VOUCHERS.forEach(v => {
    const isDisabled = v.minQty && qty < v.minQty;
    const isSelected = active && active.type === v.id;
    const disabledClass = isDisabled ? 'opacity-50 pointer-events-none' : '';
    const selectedClass = isSelected ? 'selected' : '';
    let body = '';
    if (v.group === 'free') {
      body = `<p class="text-xs text-gray-500 truncate">${v.desc}</p>
              <p class="text-xs text-gray-600 mt-1">Voucher otomatis digunakan</p>`;
    } else {
      body = `<p class="text-xs text-gray-500 truncate">${v.desc}</p>
              <p class="text-xs font-medium text-[#DF414F] mt-1">Berlaku sampai ${formatDate(v.expiryDay, v.expiryMonth, v.expiryYear)}</p>`;
    }
    const clickAttr = isDisabled ? '' : `selectVoucher('${v.id}')`;
    groups[v.group].push(`
      <div onclick="${clickAttr}" data-voucher-id="${v.id}"
        class="voucher-item border border-gray-200 p-3 hover:border-[#DF414F] transition-all select-none flex items-center gap-3 ${disabledClass} ${selectedClass} ${isDisabled ? '' : 'cursor-pointer'}">
        <img src="/public/image/file_000000003c1881fab7655f4a8369bf5v - Diedit.webp" alt="voucher" class="w-10 h-10 object-contain shrink-0">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold text-gray-800">${v.label}${isDisabled ? ' <span class="text-[10px] text-red-500 font-normal">(Min. 2 produk)</span>' : ''}</h3>
          ${body}
        </div>
      </div>
    `.trim());
  });
  let html = groups.free.join('');
  html += `<div class="text-xs font-bold text-gray-500 tracking-wide pt-3 pb-1 border-t border-gray-100 mt-2">Voucher Bulan Ini</div>`;
  html += groups.monthly.join('');
  html += groups.special.join('');
  container.innerHTML = html;
}

function getAppliedVoucherDiscount(productId) {
  return appliedVoucher[productId]?.discountAmount || 0;
}

function getAppliedVoucherFinalPrice(productId, subtotal) {
  const v = appliedVoucher[productId];
  if (!v) return subtotal;
  return v.finalPrice;
}

async function saveOrderToDb(payload, userId) {
  const orderData = {
    userId: userId,
    productId: payload.productId,
    productName: payload.productName,
    productImage: payload.productImage,
    totalPrice: payload.totalPrice,
    quantity: payload.quantity,

    chosenColor: payload.chosenColor,
    chosenSize: payload.chosenSize,
    chosenModel: payload.chosenModel,

    orderId: payload.orderId,
  };
  try {
    const response = await fetch("/api/save-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
    const result = await response.json();
    if (!result.success) {
      showIosModal("Gagal save order: " + (result.message || "Unknown error"));
      return false;
    }
payload.totalPrice = result.totalPrice;
payload.discountAmount = result.discountAmount || 0;
payload.isDiscounted = result.isDiscounted || false;
const voucherInfo = appliedVoucher[payload.productId];
if (payload.isDiscounted) {
  let voucherMsg = '';
  if (voucherInfo) {
    voucherMsg = `\n\nVoucher aktif: ${voucherInfo.discountText || `Diskon ${voucherInfo.discountPct}%`}`;
  }
  showIosModal(
    `🎉 Selamat!\n\n` +
      `Kamu termasuk 10 pembeli pertama dan mendapatkan diskon 5%.\n\n` +
      `Potongan: IDR ${new Intl.NumberFormat("id-ID").format(payload.discountAmount)}` +
      voucherMsg,
  );
} else if (voucherInfo) {
  showIosModal(
    "Order berhasil dibuat.\n\nMohon selesaikan pembayaran QRIS Anda.\n\n" +
      `Voucher aktif: ${voucherInfo.discountText}`,
  );
} else {
  showIosModal(
    "Order berhasil dibuat.\n\nMohon selesaikan pembayaran QRIS Anda.",
  );
}
    return payload;
  } catch (err) {
    console.error("Gagal save ke DB:", err);
    showIosModal("Terjadi kesalahan sistem, coba lagi nanti.");
    return false;
  }
}

async function loadProductComments(productId) {
  const commentsList = document.getElementById("product-comments-list");
  const ratingStarsEl = document.getElementById("detail-rating-stars");
  const reviewCountEl = document.getElementById("detail-review-count");

  if (!commentsList) return;

  commentsList.innerHTML =
    '<p class="text-[10px] text-gray-400 font-medium">Loading reviews...</p>';

  try {
    const response = await fetch(`/api/auth/products/${productId}/comments`);
    const result = await response.json();

    const totalReviews = result.totalReviews || 0;
    const averageRating = result.averageRating || 0;
    const comments = result.comments || [];

    if (ratingStarsEl) {
      ratingStarsEl.innerText =
        "★".repeat(averageRating) + "☆".repeat(5 - averageRating);
    }
    if (reviewCountEl) {
      reviewCountEl.innerText = totalReviews;
    }

    if (comments.length === 0) {
      commentsList.innerHTML =
        '<p class="text-[10px] text-gray-400 italic bg-gray-50/50 p-2.5 border border-gray-100">There are no reviews for this product yet.</p>';
      return;
    }

    commentsList.innerHTML = comments
      .map((comment) => {
        const stars =
          "★".repeat(comment.rating) + "☆".repeat(5 - comment.rating);
        const commentDate = new Date(comment.createdAt).toLocaleDateString(
          "id-ID",
          {
            day: "numeric",
            month: "short",
            year: "numeric",
          },
        );

        return `<div class="p-2.5 bg-gray-50/50 border border-gray-100 space-y-1">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5">
                                <img src="${escapeHtml(comment.user_avatar || comment.userAvatar || "/public/icons/default.png")}" 
                                    class="w-4 h-4 rounded-full object-cover border border-gray-200" alt="User">
                                
                                <div class="flex flex-col leading-none">
                                    <span class="text-[10px] font-bold text-gray-800">${escapeHtml(comment.username || comment.userName || "Anonymous")}</span>
                                    
                                    <span class="text-[8px] text-gray-400 font-normal mt-0.5">
                                        @${escapeHtml((comment.username || comment.userName || "user").toLowerCase().replace(/\s+/g, ""))}
                                    </span>
                                </div>
                            </div>
                            <span class="text-[9px] text-gray-400 align-top">${commentDate}</span>
                        </div>
                        <div class="text-amber-500 text-[10px] font-medium leading-none">${stars}</div>
                        <p class="text-[11px] text-gray-600 leading-snug font-normal">${escapeHtml(comment.comment_text || comment.text)}</p>
                    </div>`;
      })
      .join("");
  } catch (error) {
    console.error("Error loading comments:", error);
    commentsList.innerHTML =
      '<p class="text-[10px] text-red-500 font-medium">Gagal memuat ulasan produk.</p>';
  }
}

async function submitProductComment() {
  const ratingInput = document.getElementById("input-comment-rating");
  const textInput = document.getElementById("input-comment-text");

  if (!textInput || !ratingInput) return;

  const rating = parseInt(ratingInput.value);
  const text = textInput.value.trim();

  if (!text) {
    alert("Tulis isi ulasannya dulu, Jing!");
    textInput.focus();
    return;
  }

  if (!currentProductId) {
    alert("Product ID tidak valid!");
    return;
  }

  const payload = {
    productId: currentProductId,
    rating: rating,
    text: text,
  };

  try {
    const response = await fetch(_d('9kzs9k ~r9z|yn m~}9mywwox~}'), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok) {
      textInput.value = "";
      ratingInput.value = "5";

      const ratingStarsEl = document.getElementById("detail-rating-stars");
      const reviewCountEl = document.getElementById("detail-review-count");

      if (ratingStarsEl) {
        ratingStarsEl.innerText =
          "★".repeat(result.averageRating) +
          "Mini".repeat(0) +
          "☆".repeat(5 - result.averageRating);
      }
      if (reviewCountEl) {
        reviewCountEl.innerText = result.totalReviews;
      }

      loadProductComments(currentProductId);
    } else {
      alert(result.message || "Gagal mengirim ulasan.");
    }
  } catch (error) {
    console.error("Error submitting comment:", error);
    alert("Terjadi kesalahan koneksi ke server backend!");
  }
}

async function syncProductCardRatings() {
  try {
    const titleElements = document.querySelectorAll(".product-title-box");
    titleElements.forEach((el) => {
      const pId = parseInt(el.getAttribute("data-product-id"));
      const foundProduct =
        typeof products !== "undefined"
          ? products.find((p) => p.id === pId)
          : null;
      if (foundProduct) {
        el.innerText = foundProduct.name;
      }
    });

    const priceContainers = document.querySelectorAll(".price-container");
    priceContainers.forEach((container) => {
      const pId = parseInt(container.getAttribute("data-product-id"));

      const foundProduct =
        typeof products !== "undefined"
          ? products.find((p) => p.id === pId)
          : null;

      if (foundProduct) {
        const priceEl = container.querySelector(".product-price-box");
        const oldPriceEl = container.querySelector(".product-old-price-box");

        if (priceEl && foundProduct.price) {
          priceEl.innerText = `IDR ${foundProduct.price.toLocaleString("id-ID")}`;
        }

        if (oldPriceEl) {
          if (foundProduct.oldPrice) {
            oldPriceEl.innerText = `IDR ${foundProduct.oldPrice.toLocaleString("id-ID")}`;
            oldPriceEl.classList.remove("hidden");
          } else {
            oldPriceEl.classList.add("hidden");
          }
        }
      }
    });

    const response = await fetch("/api/products/rating-summary");
    if (!response.ok) return;

    const ratingSummary = await response.json();

    Object.keys(ratingSummary).forEach((productId) => {
        const dataDb = ratingSummary[productId];
        document
            .querySelectorAll(
                `.card-stars-box[data-product-id="${productId}"], #card-stars-${productId}`
            )
            .forEach((el) => {
                const starsToShow = dataDb.avgRating || 0;

                el.innerText =
                    "★".repeat(starsToShow) +
                    "☆".repeat(5 - starsToShow);
            });
        document
            .querySelectorAll(
                `.card-count-box[data-product-id="${productId}"], #card-count-${productId}`
            )
            .forEach((el) => {
                el.innerText =
                    `${dataDb.totalReviews || 0} Penilaian`;
            });
    });
  } catch (error) {
    console.error("Gagal sinkronisasi data catalog luar!:", error);
  }
}

window.shareProduct = async function () {
  const product = products.find((p) => p.id === currentProductId);

  if (!product) return;

  const url = `${location.origin}/api/product/${productId}`;

  const title = product.name;
  const price = `IDR ${getCurrentPrice(product).toLocaleString("id-ID")}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title,
        text: `${title}\n${price}\n\n🔥 Official Northline Store`,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      showIosModal("Link produk berhasil disalin");
    }
  } catch (err) {
    console.log(err);
  }
};

function getRelatedSearchTerms(productName = "") {
  const name = productName.toLowerCase();

  if (
    name.includes("boxy") ||
    name.includes("kaos") ||
    name.includes("shortsleeve") ||
    name.includes("longsleeve")
  ) {
    return [
      "Kaos Boxy Premium",
      "Oversized T-Shirt",
      "Cotton Combed 24s",
      "Kaos Lengan Panjang",
      "Kaos Lengan Pendek",
      "Streetwear Pria",
      "Northline Boxy",
      "Kaos Casual",
    ];
  }

  if (name.includes("hoodie")) {
    return [
      "Hoodie Premium",
      "Zip Hoodie",
      "Oversized Hoodie",
      "Streetwear Hoodie",
    ];
  }

  if (name.includes("celana")) {
    return ["Cargo Pants", "Celana Baggy", "Celana Streetwear", "Celana Pria"];
  }

  return ["Produk Northline", "Fashion Pria", "Streetwear", "Best Seller"];
}

let modalPlaceholderIndex = 0;
let modalPlaceholderInterval = null;

function startModalSearchPlaceholder(productName) {
  const input = document.getElementById("modal-product-search");
  if (!input) return;
  const placeholders = getRelatedSearchTerms(productName);
  clearInterval(modalPlaceholderInterval);
  input.placeholder = placeholders[0];
  modalPlaceholderInterval = setInterval(() => {
    if (input.value.trim()) return;
    modalPlaceholderIndex = (modalPlaceholderIndex + 1) % placeholders.length;
    input.placeholder = placeholders[modalPlaceholderIndex];
  }, 2500);
}

function initModalSearch() {
  const ms = document.getElementById("modal-product-search");
  const rb = document.getElementById("modal-search-result");
  if (!ms || !rb) return;
  let t;

  function storeItem(name, url) {
    return `<a href="${url}" class="flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-sm text-gray-700"><img src="https://img.icons8.com/?size=100&id=5B2IjBNporYk&format=png&color=DF414F" class="w-5 h-5 flex-shrink-0"><span class="font-medium">${name}</span></a>`;
  }

  function prodItem(name, id) {
    return `<div class="px-3 py-2.5 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-sm text-gray-700 truncate msi" data-id="${id}">${name} ...</div>`;
  }

  ms.addEventListener("input", () => {
    clearTimeout(t);
    const kw = ms.value.trim();
    if (!kw) { rb.classList.add("hidden"); rb.innerHTML = ""; return; }
    t = setTimeout(async () => {
      const k = kw.toLowerCase();
      let h = "";
      let any = false;
      if ("Northline".toLowerCase().includes(k)) { h += storeItem("Northline", "nrtStore.html"); any = true; }
      const src = window.northlineProducts || products;
      src.filter(p => p.name && p.name.toLowerCase().includes(k)).forEach(p => { h += prodItem(p.name, p.id); any = true; });
      try {
        const r = await fetch(`/api/products/search?q=${encodeURIComponent(kw)}`);
        const d = await r.json();
        if (Array.isArray(d.products)) {
          if (Array.isArray(d.sellers)) d.sellers.forEach(s => { if (s.store_name && s.store_name.toLowerCase().includes(k)) { h += storeItem(s.store_name, `/public/seller/${s.id}`); any = true; } });
          d.products.filter(p => p.id).forEach(p => { h += prodItem(p.name || p.product_name, p.id); any = true; });
        }
      } catch (e) {}
      if (!any) { rb.classList.add("hidden"); rb.innerHTML = ""; return; }
      rb.innerHTML = h;
      rb.classList.remove("hidden");
    }, 300);
  });

  rb.addEventListener("click", (e) => {
    if (e.target.closest("a[href]")) return;
    const el = e.target.closest(".msi");
    if (!el) return;
    const id = el.dataset.id;
    const p = products.find(x => String(x.id) === String(id)) || (window.northlineProducts || []).find(x => String(x.id) === String(id));
    if (p) openProductDetail(p.id);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#modal-product-search") && !e.target.closest("#modal-search-result")) rb.classList.add("hidden");
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadModalStructure();
  initModalSearch();

  const params = new URLSearchParams(window.location.search);
  const productId = parseInt(params.get("product"));

  if (productId) {
    setTimeout(() => {
      openProductDetail(productId);
      history.replaceState({ productId }, "", `?product=${productId}`);
    }, 300);
  }
});

window.addEventListener("popstate", (e) => {
  const modal = document.getElementById("product-modal");
  if (e.state && e.state.productId) {
    openProductDetail(e.state.productId);
  } else if (modal && !modal.classList.contains("hidden")) {
    closeModal();
  }
});

window.onclick = function (event) {
  const modal = document.getElementById("product-modal");
  if (event.target == modal) {
    closeModal();
  }
};

function createLoveBurst(button) {
  const rect = button.getBoundingClientRect();

  for (let i = 0; i < 12; i++) {
    const heart = document.createElement("div");

    heart.innerHTML = "❤️";

    const size = Math.random() * 12 + 10;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    heart.style.position = "fixed";
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.style.fontSize = `${size}px`;
    heart.style.pointerEvents = "none";
    heart.style.zIndex = "999999";

    document.body.appendChild(heart);

    const randomX = (Math.random() - 0.5) * 120;
    const randomY = -(Math.random() * 120 + 60);
    const rotate = (Math.random() - 0.5) * 360;

    heart.animate(
      [
        {
          transform: "translate(0,0) scale(0.5) rotate(0deg)",
          opacity: 1,
        },
        {
          transform: `translate(${randomX}px, ${randomY}px) scale(1.3) rotate(${rotate}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 1200,
        easing: "cubic-bezier(.17,.67,.38,.98)",
      },
    );

    setTimeout(() => {
      heart.remove();
    }, 1200);
  }

  button.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.25)" },
      { transform: "scale(1)" },
    ],
    {
      duration: 300,
    },
  );
}

function toggleProductMenu() {
  const menu = document.getElementById("product-menu");
  if (!menu) return;
  const isOpen = menu.classList.contains("opacity-100");
  if (isOpen) {
    menu.classList.remove("opacity-100", "visible", "translate-y-0");
    menu.classList.add("opacity-0", "invisible", "translate-y-2");
  } else {
    menu.classList.add("opacity-100", "visible", "translate-y-0");
    menu.classList.remove("opacity-0", "invisible", "translate-y-2");
  }
}

document.addEventListener("click", function (e) {
  const menu = document.getElementById("product-menu");
  const wrapper = document.getElementById("product-menu-wrapper");
  if (!menu || !wrapper) return;
  if (!wrapper.contains(e.target)) {
    menu.classList.remove("opacity-100", "visible", "translate-y-0");
    menu.classList.add("opacity-0", "invisible", "translate-y-2");
  }
});

document.addEventListener("DOMContentLoaded", function () {
  if (!sessionStorage.getItem(STORAGE_KEYS.NOTIF_SHOWN)) {
    showIosModal("App Store Northline");
    sessionStorage.setItem(STORAGE_KEYS.NOTIF_SHOWN, "true");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(syncProductCardRatings, 300);
});

window.openProductDetail = openProductDetail;
window.closeModal = closeModal;
window.changePreview = changePreview;
window.selectColor = selectColor;
window.selectSize = selectSize;
window.selectModel = selectModel;
window.alterQty = alterQty;
window.triggerCheckout = triggerCheckout;

window.openVoucherPopup = openVoucherPopup;
window.closeVoucherPopup = closeVoucherPopup;
window.selectVoucher = selectVoucher;
window.renderVoucherCards = renderVoucherCards;
