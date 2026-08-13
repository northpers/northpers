function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

async function loadModalStructure() {

  if (document.getElementById("product-modal")) return;
  try {
    const response = await fetch("/AppNorthModalProduct");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    document.body.insertAdjacentHTML("beforeend", html);
    loadModalFollowers();
  } catch (err) {
    console.error("Modal gagal load:", err);
  }
}

function formatFollowers(total) {
  if (total >= 1000) {
    return (total / 1000).toFixed(1).replace(".0", "") + "RB";
  }
  return total;
}

async function loadModalFollowers() {
  try {
    const el = document.getElementById("modal-followers-count");
    if (!el) return;
    const response = await fetch(_d('9kzs9pyvvy"o|}7my x~'));
    if (!response.ok) return;
    const data = await response.json();
    if (data.success) {
      el.textContent = `${formatFollowers(data.followers)} Pengikut`;
    }
  } catch (err) {
    console.error("Followers gagal load:", err);
  }
}

const ORIGINAL_PAGE_TITLE = document.title;

let appliedVoucher = {};

let VOUCHERS = [
  { id: 'free_shipping', label: 'Gratis Ongkir', desc: 'Bebas biaya kirim untuk semua produk Northline', discountPct: 0, group: 'free' },
];

function isLoggedIn() {
  const cookies = document.cookie.split(';');
  return cookies.some(c => c.trim().startsWith('logged_in=')) || cookies.some(c => c.trim().startsWith('nl_jwt='));
}

function handleSessionExpired(message) {
  showIosModal(message || "Sesi berakhir, silakan login ulang");
  setTimeout(function () { window.location.href = '/AppNorthAuth'; }, 1500);
}

function loadMyVouchers(callback) {
  if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
    if (typeof callback === 'function') callback();
    return;
  }
  fetch('/api/vouchers', { credentials: 'include' })
    .then(function (r) {
      if (r.status === 401) {
        handleSessionExpired();
        if (typeof callback === 'function') callback();
        return null;
      }
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      if (data.success && Array.isArray(data.vouchers)) {
        const list = data.vouchers
          .filter(function (v) {
            if (v.expired) return false;
            if (v.claimRequired) return v.claimStatus === 'claimed';
            return true;
          })
          .map(function (v) {
            v.id = v.code;
            return v;
          });
        VOUCHERS = list;
        window.VOUCHERS = list;
      }
      if (typeof callback === 'function') callback();
    })
    .catch(function () {
      if (typeof callback === 'function') callback();
    });
}

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
let selectedSizeGroup = "ADULT";
let selectedModel = "";
let selectedModelStyle = "";
let currentProductId = null;
let currentProductCode = null;

let products = [];
window.northlineProducts = [];

function findProductByRef(ref) {
  if (ref == null || ref === "") return null;
  const key = String(ref).trim();
  return (
    products.find((p) => p.code === key) ||
    products.find((p) => String(p.id) === key) ||
    (window.northlineProducts || []).find((p) => p.code === key) ||
    (window.northlineProducts || []).find((p) => String(p.id) === key) ||
    null
  );
}

function getProductCode(id) {
  const p = findProductByRef(id);
  return (p && p.code) || String(id);
}

function isNumericRef(ref) {
  return /^\d+$/.test(String(ref || "").trim());
}

window.northlineCatalog = (async () => {
  try {
    const res = await fetch(_d('9kzs9mk~kvyq9z|yn m~}'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    products = (data && data.products) || [];
    window.northlineProducts = products;
  } catch (err) {
    console.error("Catalog gagal load:", err);
    products = [];
    window.northlineProducts = [];
  }
  return products;
})();

function trackProductClick(id) {
  try {
    const key = "nrt_click_counts";
    let counts = {};
    try { counts = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}
    counts[id] = (counts[id] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(counts));
  } catch (e) {}
}

function getSortedCatalog() {
  let counts = {};
  try { counts = JSON.parse(localStorage.getItem("nrt_click_counts") || "{}"); } catch (e) {}
  return products.slice().sort((a, b) => {
    const ca = counts[a.id] || 0;
    const cb = counts[b.id] || 0;
    if (ca !== cb) return cb - ca;
    return (a.sortOrder || a.id) - (b.sortOrder || b.id);
  });
}

function renderSliderProductCard(product) {
  const ref = product.code || product.id;
  const img = product.thumbs && product.thumbs[0] ? product.thumbs[0] : (product.images && product.images[0] ? product.images[0] : '/public/icons/default.png');
  const discount = product.oldPrice && product.oldPrice > product.price
    ? Math.round((product.oldPrice - product.price) / product.oldPrice * 100) : 0;
  const soldOut = !product.stock || product.stock <= 0;
  const aiPickBadge = product.aiPick
    ? '<span class="absolute top-1 left-1 flex items-center gap-0.5 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[9px] font-bold text-gray-700 shadow-sm"><img src="https://img.icons8.com/?size=100&id=dQ0TcR10zyYB&format=png&color=DF414F" class="w-3 h-3">AI Recomended</span>'
    : '';
  return '<div class="group bg-white min-w-[170px] max-w-[170px] flex-shrink-0 shadow-sm border ' + (soldOut ? 'opacity-50 pointer-events-none select-none' : 'border-gray-200 hover:border-[#DF414F] cursor-pointer') + '"' + (soldOut ? '' : ' onclick="openProductDetail(\'' + ref + '\')"') + '>'
    + '<div class="relative bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer h-auto">'
    + '<img src="' + img + '" class="w-full h-auto block transition duration-300" alt="North Line Product" loading="lazy">'
    + aiPickBadge
    + (soldOut ? '<div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"><span class="bg-transparent border border-gray-200 text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider px-2 py-0.5">Stok Habis</span></div>' : '')
    + '</div>'
    + '<div class="relative -mt-[150px] pointer-events-none">'
    + '<img src="https://down-id.img.susercontent.com/file/id-11134258-8224q-mkvvibsp8oowa6.webp" style="height: 180px;" loading="lazy">'
    + '</div>'
    + '<div class="mt-1 px-2">'
    + '<div class="block w-full leading-tight">'
    + '<span class="inline-flex items-center justify-center rounded gap-1 bg-red-600 text-white px-1.5 py-0.5 text-[9px] tracking-wider shadow-sm whitespace-nowrap mr-1 align-middle select-none" style="font-family: \'Bruno Ace\', sans-serif;">'
    + 'Northline'
    + '</span>'
    + '<h3 class="inline md:hidden text-sm md:text-base text-gray-800 tracking-tighter break-words align-middle" style="-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden;">' + product.name + '</h3>'
    + '</div>'
    + '<div class="flex justify-between items-center">'
    + '<div class="flex items-center gap-1.5">'
    + '<div class="flex flex-col price-container" data-product-id="' + product.id + '">'
    + '<span class="product-price-box text-[#DF414F] font-bold text-sm md:text-base">...</span>'
    + '</div>'
    + (discount > 0 ? '<span class="bg-[#fff1ee] text-[#DF414F] text-[9px] px-1 py-0.5 font-medium">-' + discount + '%</span>' : '')
    + '<span class="flex items-center gap-0.5 text-[#DF414F] text-[9px] font-medium">'
    + '<img src="https://img.icons8.com/?size=100&id=52172&format=png&color=DF414F" class="w-5 h-5" loading="lazy">'
    + '</span>'
    + '</div>'
    + '</div>'
    + '<div class="flex items-center gap-1">'
    + '<span id="card-stars-' + product.id + '" class="text-amber-400 md:text-[13px] text-[10px]">☆☆☆☆☆</span>'
    + '<span class="text-gray-300 md:text-[12px] text-[10px] flex items-center">'
    + '<span id="card-count-' + product.id + '">5Rb+ Reviews</span>'
    + '<span class="mx-1.5 h-2.5 border-l border-gray-100"></span>'
    + '<span>10Rb+</span>'
    + '</span>'
    + '</div>'
    + '<div class="flex items-center gap-1 mt-1 mb-2 text-gray-500">'
    + '<img src="https://img.icons8.com/?size=100&id=llQVff4k5Qsy&format=png&color=9CA3AF" class="w-3 h-3 flex-shrink-0" alt="delivery" loading="lazy">'
    + '<span class="text-[10px] md:text-xs tracking-tight">5-7 Hari</span>'
    + '<span class="h-2.5 border-l border-gray-100 mx-1"></span>'
    + '<img src="https://img.icons8.com/?size=100&id=7880&format=png&color=9CA3AF" class="w-2.5 h-2.5 flex-shrink-0" alt="location" loading="lazy">'
    + '<span class="text-[10px] md:text-xs tracking-tight truncate">Kab Karawang</span>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function gridLoaderHtml() {
  return '<div style="display:flex;align-items:center;justify-content:center;padding:48px 0;width:100%;grid-column:1/-1">' +
    '<div class="loader-dots"><span></span><span></span><span></span></div>' +
    '</div>';
}

function gridErrorHtml() {
  return '<div style="text-align:center;padding:48px 0;color:#9ca3af;font-size:12px;width:100%;grid-column:1/-1">Gagal memuat produk. Muat ulang halaman.</div>';
}

function ensureGridLoaders() {
  ['product-grid', 'product-grid-recom'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el && !el.querySelector('.loader-dots')) el.innerHTML = gridLoaderHtml();
  });
}

window.renderNorthlineGrids = async function () {
  ensureGridLoaders();
  let sorted;
  try {
    await window.northlineCatalog;
    sorted = getSortedCatalog();
  } catch (e) {
    ['product-grid', 'product-grid-recom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = gridErrorHtml();
    });
    return;
  }
  const main = document.getElementById('product-grid');
  if (main) {
    const featured = sorted.filter(p => p.featured);
    const list = featured.length ? featured : sorted;
    main.innerHTML = list.map(renderProductCard).join('');
  }
  const recom = document.getElementById('product-grid-recom');
  if (recom) {
    const isSlider = recom.classList.contains('overflow-x-auto');
    recom.innerHTML = sorted.map(isSlider ? renderSliderProductCard : renderProductCard).join('');
  }
  if (typeof syncProductCardRatings === 'function') syncProductCardRatings();
};

window.renderNorthlineGridsAll = async function () {
  ensureGridLoaders();
  let sorted;
  try {
    await window.northlineCatalog;
    sorted = getSortedCatalog();
  } catch (e) {
    ['product-grid', 'product-grid-recom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = gridErrorHtml();
    });
    return;
  }
  const main = document.getElementById('product-grid');
  if (main) main.innerHTML = sorted.map(renderProductCard).join('');
  const recom = document.getElementById('product-grid-recom');
  if (recom) {
    const isSlider = recom.classList.contains('overflow-x-auto');
    recom.innerHTML = sorted.map(isSlider ? renderSliderProductCard : renderProductCard).join('');
  }
  if (typeof syncProductCardRatings === 'function') syncProductCardRatings();
};

const NRT_CATEGORY_GROUPS = [
  { key: 'hoodie', label: 'Hoodie' },
  { key: 'shortsleeve', label: 'Shortsleeve' },
  { key: 'longsleeve', label: 'Longsleeve' },
  { key: 'workshirt', label: 'Workshirt' },
];

window.renderNorthlineCategoryGrids = async function () {
  await window.northlineCatalog;
  const container = document.getElementById('kategori-grids');
  if (!container) return;
  const sorted = getSortedCatalog();
  container.innerHTML = NRT_CATEGORY_GROUPS.map(function (g) {
    const list = sorted.filter(p => (p.categories || []).includes(g.key));
    if (!list.length) return '';
    return '<div class="mb-5">'
      + '<div class="flex items-center justify-between mb-2">'
      + '<h3 class="text-[16px] md:text-lg font-semibold text-gray-800">' + g.label + '</h3>'
      + '<span class="text-[11px] text-gray-400">' + list.length + ' produk</span>'
      + '</div>'
      + '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-1">' + list.map(renderProductCard).join('') + '</div>'
      + '</div>';
  }).join('');
  if (typeof syncProductCardRatings === 'function') syncProductCardRatings();
};

let nrtReviewsState = { data: null, productId: null, rating: 0 };

function escHtml(s) {
  if (typeof s !== 'string') return s == null ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function starsHtml(n) {
  n = Number(n) || 0;
  return '<span class="text-amber-400 text-[13px] tracking-tight">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
}

window.renderNorthlineReviews = async function () {
  const container = document.getElementById('ulasan-reviews');
  if (!container) return;
  try {
    const res = await fetch(_d('9kzs9mk~kvyq9|o!so"}'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    nrtReviewsState.data = await res.json();
  } catch (e) {
    container.innerHTML = '<div class="text-center text-gray-400 text-sm py-10">Ulasan gagal dimuat.</div>';
    return;
  }
  drawNorthlineReviews();
};

function drawNorthlineReviews() {
  const container = document.getElementById('ulasan-reviews');
  if (!container) return;
  const d = nrtReviewsState.data;
  if (!d || !d.success) return;
  const filter = { pid: nrtReviewsState.productId, rating: nrtReviewsState.rating };

  const rcs = d.ratingCounts || {};
  const rcTotal = d.totalReviews || 0;
  const pct = rcTotal > 0 ? function (n) { return Math.round((n / rcTotal) * 100); } : function () { return 0; };

  let list = d.reviews.slice();
  if (filter.pid !== null) list = list.filter(r => Number(r.productId) === filter.pid);
  if (filter.rating > 0) list = list.filter(r => Number(r.rating) === filter.rating);

  let html = '';

  html += '<div class="bg-white border border-gray-200 overflow-hidden mb-4">'
    + '<div class="grid grid-cols-1 md:grid-cols-[190px_1fr]">'
    + '<div class="p-5 flex md:flex-col items-center md:justify-center gap-2 md:gap-1.5 md:border-r md:border-gray-100">'
    + '<div class="md:text-center flex md:block items-center gap-3">'
    + '<div class="text-[42px] md:text-5xl font-bold leading-none text-gray-900">' + (d.avgRating || 0) + '</div>'
    + '<div class="text-amber-400 text-sm md:mt-1.5">' + starsHtml(d.avgRating || 0) + '</div>'
    + '</div>'
    + '<div class="text-[12px] text-gray-500">' + rcTotal + ' ulasan</div>'
    + '</div>'
    + '<div class="p-3 md:p-5 flex flex-col justify-center gap-2">'
    + [5, 4, 3, 2, 1].map(function (s) {
      const n = rcs[s] || 0;
      const active = filter.rating === s;
      return '<button type="button" class="rv-bar-row ' + (active ? 'active' : '') + '" data-rating="' + s + '">'
        + '<span class="rv-bar-label">' + s + ' <span class="text-gray-300">★</span></span>'
        + '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + pct(n) + '%"></span></span>'
        + '<span class="rv-bar-count">' + n + '</span>'
        + '</button>';
    }).join('')
    + '</div>'
    + '</div>'
    + '</div>';

  html += '<div class="mb-2">'
    + '<div class="flex items-center gap-2 mb-1">'
    + '<img src="https://img.icons8.com/?size=100&id=61802&format=png&color=737373" class="w-3.5 h-3.5" loading="lazy">'
    + '<span class="text-[13px] font-medium text-gray-700">Produk</span>'
    + '</div>'
    + '<div class="flex gap-2 nrt-scroll-x pb-1 -mx-1 px-1">'
    + '<button class="filter-chip ' + (filter.pid === null ? 'active' : '') + '" data-pid="" data-rating="">Semua Produk</button>';
  (d.products || []).forEach(function (p) {
    html += '<button class="filter-chip ' + (filter.pid === p.id ? 'active' : '') + '" data-pid="' + p.id + '" data-rating="">' + escHtml(p.name.slice(0, 18)) + (p.name.length > 18 ? '…' : '') + '</button>';
  });
  html += '</div></div>';

  html += '<div class="mb-2">'
    + '<div class="flex items-center gap-2 mb-1">'
    + '<img src="https://img.icons8.com/?size=100&id=71210&format=png&color=737373" class="w-3.5 h-3.5" loading="lazy">'
    + '<span class="text-[13px] font-medium text-gray-700">Rating</span>'
    + '</div>'
    + '<div class="flex gap-2 nrt-scroll-x pb-1 -mx-1 px-1">'
    + '<button class="filter-chip ' + (filter.rating === 0 ? 'active' : '') + '" data-pid="' + (filter.pid || '') + '" data-rating="">Semua</button>';
  [5, 4, 3, 2, 1].forEach(function (s) {
    const n = rcs[s] || 0;
    html += '<button class="filter-chip ' + (filter.rating === s ? 'active' : '') + '" data-pid="' + (filter.pid || '') + '" data-rating="' + s + '">' + s + '★ <span class="' + (filter.rating === s ? 'rv-chip-count-on' : 'rv-chip-count') + '">' + n + '</span></button>';
  });
  html += '</div></div>';

  html += '<div class="flex items-center justify-between mb-3">'
    + '<span class="text-[13px] font-medium text-gray-700">Ulasan' + (list.length ? ' (' + list.length + ')' : '') + '</span>'
    + (filter.pid !== null || filter.rating > 0 ? '<button type="button" class="rv-clear" data-clear="1">Hapus Filter</button>' : '')
    + '</div>';

  if (!list.length) {
    html += '<div class="text-center text-gray-400 text-sm py-10 bg-white border border-gray-200">Tidak ada ulasan untuk filter ini.</div>';
  } else {
    html += '<div class="grid grid-cols-1 gap-2">' + list.map(function (r) {
      const avatar = r.userAvatar || '/public/icons/default.png';
      const images = (r.images || []).slice(0, 3);
      const variantParts = [];
      if (r.variantColor) variantParts.push(escHtml(r.variantColor));
      if (r.variantSize) variantParts.push('Ukuran ' + escHtml(r.variantSize));
      const subParts = [];
      if (r.ratingBahan) subParts.push('Bahan ' + r.ratingBahan + '★');
      if (r.ratingUkuran) subParts.push('Ukuran ' + r.ratingUkuran + '★');
      if (r.ratingWarna) subParts.push('Warna ' + r.ratingWarna + '★');
      return '<div class="bg-white border border-gray-200 p-3 md:p-4">'
        + '<div class="flex items-start gap-2.5">'
        + '<img src="' + escHtml(avatar) + '" class="w-9 h-9 rounded-full object-cover border flex-shrink-0" onerror="this.src=\'/public/icons/default.png\'" loading="lazy">'
        + '<div class="flex-1 min-w-0">'
        + '<div class="flex items-center justify-between gap-2">'
        + '<div class="flex items-center gap-1.5 min-w-0">'
        + '<span class="font-medium text-sm text-gray-800 truncate">' + escHtml(r.userName || 'Pengguna') + '</span>'
        + (r.verified ? '<span class="text-[8px] font-bold text-[#DF414F] border border-[#DF414F] px-0.5 whitespace-nowrap">Pembelian Terverifikasi</span>' : '')
        + '</div>'
        + '<span class="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">' + (r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '') + '</span>'
        + '</div>'
        + '<div class="flex items-center gap-2 mt-0.5">'
        + '<div class="text-amber-400 text-xs">' + starsHtml(r.rating) + '</div>'
        + (subParts.length ? '<span class="text-[9px] text-gray-400">' + subParts.join(' · ') + '</span>' : '')
        + '</div>'
        + '<div class="text-[11px] text-gray-400 truncate mt-1">' + escHtml(r.productName || 'Produk Northline') + (variantParts.length ? ' · ' + variantParts.join(' · ') : '') + '</div>'
        + (images.length ? '<div class="flex gap-1.5 mt-1.5">' + images.map(function (img) {
          return '<img src="' + escHtml(img) + '" class="w-16 h-16 object-cover border border-gray-200 cursor-pointer" loading="lazy" onclick="openReviewImage(\'' + escHtml(img) + '\')">';
        }).join('') + '</div>' : '')
        + (r.text ? '<p class="text-sm text-gray-700 leading-relaxed mt-1.5">' + escHtml(r.text) + '</p>' : '')
        + (r.replyText ? '<div class="border-l-2 border-[#DF414F] bg-gray-50 p-2 mt-2">'
          + '<div class="flex items-center gap-1">'
          + '<img src="https://img.icons8.com/?size=100&id=59878&format=png&color=DF414F" class="w-3 h-3">'
          + '<span class="text-[9px] font-bold text-[#DF414F] uppercase">Balasan Northline</span>'
          + '</div>'
          + '<p class="text-[11px] text-gray-600 mt-0.5">' + escHtml(r.replyText) + '</p>'
          + '</div>' : '')
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.filter-chip, .rv-bar-row').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('rv-bar-row')) {
        const rating = btn.getAttribute('data-rating');
        nrtReviewsState.rating = Number(rating);
      } else {
        const pid = btn.getAttribute('data-pid');
        const rating = btn.getAttribute('data-rating');
        nrtReviewsState.productId = pid === '' ? null : Number(pid);
        nrtReviewsState.rating = rating === '' ? 0 : Number(rating);
      }
      drawNorthlineReviews();
    });
  });

  const clearBtn = container.querySelector('[data-clear="1"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      nrtReviewsState.productId = null;
      nrtReviewsState.rating = 0;
      drawNorthlineReviews();
    });
  }
}

function renderProductCard(product) {
  const id = product.id;
  const ref = product.code || id;
  const img = product.thumbs && product.thumbs[0] ? product.thumbs[0] : (product.images && product.images[0] ? product.images[0] : '/public/icons/default.png');
  const discount = product.oldPrice && product.oldPrice > product.price
    ? Math.round((product.oldPrice - product.price) / product.oldPrice * 100) : 0;
  const soldOut = !product.stock || product.stock <= 0;
  const aiPickBadge = product.aiPick
    ? '<span class="absolute top-1 left-1 flex items-center gap-0.5 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[9px] font-bold text-gray-700 shadow-sm"><img src="https://img.icons8.com/?size=100&id=dQ0TcR10zyYB&format=png&color=DF414F" class="w-3 h-3">AI Recomended</span>'
    : '';
  return '<div class="hover-bottom group bg-white w-full md:w-[200px] shadow-sm border ' + (soldOut ? 'opacity-50 pointer-events-none select-none' : 'border-gray-200 hover:border-[#DF414F] cursor-pointer') + '"' + (soldOut ? '' : ' onclick="openProductDetail(\'' + ref + '\')"') + '>'
    + '<div class="relative bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer h-auto">'
    + '<img src="' + img + '" class="w-full h-auto block transition duration-300" alt="North Line Product" loading="lazy">'
    + aiPickBadge
    + (soldOut ? '<div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"><span class="bg-transparent border border-gray-200 text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider px-2 py-0.5">Stok Habis</span></div>' : '')
    + '</div>'
    + '<div class="relative -mt-[150px] pointer-events-none">'
    + '<img src="https://down-id.img.susercontent.com/file/id-11134258-8224q-mkvvibsp8oowa6.webp" style="height: 180px;" loading="lazy">'
    + '</div>'
    + '<div class="mt-1 px-2">'
    + '<div class="block w-full leading-tight">'
    + '<span class="float-left inline-flex items-center justify-center rounded gap-1 bg-red-600 text-white px-1.5 py-0.5 text-[9px] tracking-wider shadow-sm whitespace-nowrap mr-1.5 mt-0.5 select-none" style="font-family: \'Bruno Ace\', sans-serif;">'
    + 'Northline'
    + '</span>'
    + '<h3 class="inline md:hidden text-sm md:text-base text-gray-800 tracking-tighter break-words" style="-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden;">' + product.name + '</h3>'
    + '</div>'
    + '<div class="flex justify-between items-center">'
    + '<div class="flex items-center gap-1.5">'
    + '<div class="flex flex-col price-container" data-product-id="' + id + '">'
    + '<span class="product-price-box text-[#DF414F] font-bold text-[13px] md:text-base">...</span>'
    + '</div>'
    + (discount > 0 ? '<span class="bg-[#fff1ee] text-[#DF414F] text-[9px] px-1 py-0.5 font-medium">-' + discount + '%</span>' : '')
    + '<span class="flex items-center gap-0.5 text-[#DF414F] text-[9px] font-medium">'
    + '<img src="https://img.icons8.com/?size=100&id=52172&format=png&color=DF414F" class="w-5 h-5" loading="lazy">'
    + '</span>'
    + '</div>'
    + '</div>'
    + '<div class="flex items-center gap-1">'
    + '<span id="card-stars-' + id + '" class="text-amber-400 text-[10px] md:text-[12px]">☆☆☆☆☆</span>'
    + '<span class="text-gray-300 text-[10px] flex items-center">'
    + '<span class="text-[9px] md:text-[10px]" id="card-count-' + id + '">5Rb+ Reviews</span>'
    + '<span class="mx-1.5 h-2.5 border-l border-gray-100"></span>'
    + '<span class="text-[9px] md:text-[10px]">10Rb+</span>'
    + '</span>'
    + '</div>'
    + '<div class="bg-gradient-to-r from-[#DF414F] to-[#FFD6DA] text-white text-[10px] md:text-[12px] mt-1 px-2 gap-1 py-[1px] justify-center flex rounded">'
    + '<img src="https://img.icons8.com/?size=100&id=33479&format=png&color=ffffff" class="md:w-4 md:h-4 w-3 h-3" loading="lazy">'
    + 'Garansi Harga Terbaik'
    + '</div>'
    + '<div class="flex items-center gap-1 mt-1 mb-2 text-gray-500">'
    + '<img src="https://img.icons8.com/?size=100&id=llQVff4k5Qsy&format=png&color=9CA3AF" class="w-3 h-3 flex-shrink-0" alt="delivery" loading="lazy">'
    + '<span class="text-[9px] md:text-xs tracking-tight">5-7 Hari</span>'
    + '<span class="h-2.5 border-l border-gray-100 mx-1"></span>'
    + '<img src="https://img.icons8.com/?size=100&id=7880&format=png&color=9CA3AF" class="w-2.5 h-2.5 flex-shrink-0" alt="location" loading="lazy">'
    + '<span class="text-[9px] md:text-xs tracking-tight truncate">Kab Karawang</span>'
    + '</div>'
    + '</div>'
    + '</div>';
}

window.renderProductCard = renderProductCard;

window.openProduct = async function (productId, source = "database") {
  await window.northlineCatalog;
  const ref = String(productId ?? "").trim();
  if (source === "local") {
    const product = findProductByRef(ref);
    if (!product) return showIosModal("Produk tidak ditemukan");
    openProductDetail(ref);
  } else {
    const product = findProductByRef(ref);
    if (product) return openProductDetail(ref);
    showIosModal("Produk tidak ditemukan");
  }
};

function getColorName(colorHex) {
  if (colorHex.toLowerCase() === "#ffffff") return "White";
  if (colorHex.toLowerCase() === "#000000") return "Black";
  return colorHex;
}

function getCurrentPrice(product) {
    if (!product) return 0;
    if (String(selectedSizeGroup || "").toUpperCase() === "CHILDREN" && product.childrenPrice) {
        return product.childrenPrice;
    }
    if (String(selectedSize || "").toUpperCase() === "CHILDREN" && product.childrenPrice) {
        return product.childrenPrice;
    }
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
        "M": 500,
        "L": 1000,
        "XL": 1500,
        "XXL": 2000,
        
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
  const discountBadge = document.getElementById("detail-discount-badge");
  if (discountBadge) {
    const pct =
      product.oldPrice && product.oldPrice > currentPrice
        ? Math.round((1 - currentPrice / product.oldPrice) * 100)
        : 0;
    if (pct > 0) {
      discountBadge.innerText = `-${pct}%`;
      discountBadge.classList.remove("hidden");
    } else {
      discountBadge.classList.add("hidden");
    }
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

async function openProductDetail(productId) {
  await window.northlineCatalog;
  const product = findProductByRef(productId);

  if (!product) {
    return;
  }

  window.currentProduct = product;
  currentProductId = Number(product.id);
  currentProductCode = product.code || getProductCode(product.id);
  trackProductClick(currentProductId);
  selectedColor = product.colors[0] || "";
  selectedSizeGroup = "ADULT";
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

  const ratingNumberEl = document.getElementById("detail-rating-number");
  if (ratingNumberEl) {
    ratingNumberEl.innerText = currentAvgRating > 0 ? Number(currentAvgRating).toFixed(1) : "0";
  }
  if (ratingStarsEl) {
    const full = Math.floor(currentAvgRating);
    const half = currentAvgRating - full >= 0.5 ? 1 : 0;
    ratingStarsEl.innerText =
      "★".repeat(full) + (half ? "⯨" : "") + "☆".repeat(5 - full - half);
  }
  if (reviewCountEl) {
    reviewCountEl.innerText = formatReviewCount(currentTotalReviews);
  }

  const descEl = document.getElementById("detail-description");
  if (descEl) {
    descEl.innerText = product.deskripsi || "Deskripsi produk belum tersedia.";
  }

  updateSelectedLabels();

  const readyPeriodEl = document.getElementById("ready-period");
  if (readyPeriodEl) {
    readyPeriodEl.classList.add("hidden");
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
            <img src="${(product.thumbs && product.thumbs[index]) || img}" class="w-full h-full object-contain pointer-events-none">
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
                    class="color-option-btn px-2 py-1 md:px-3 md:py-1.5 border text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none ${
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
              class="model-option-btn px-2 py-1 md:px-3 md:py-1.5 border text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none ${
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
  sizeContainer.innerHTML = renderSizeOptions(product);

  const modelStyleSection = document.getElementById("model-style-section");
  const modelStyleContainer = document.getElementById("model-style-options");
  const modelStyleLabel = document.getElementById("selected-model-style-text");
  if (modelStyleSection && modelStyleContainer) {
    const styles = product.modelStyle || [];
    if (styles.length > 0) {
      selectedModelStyle = styles[0];
      modelStyleContainer.innerHTML = styles
        .map(
          (s, i) => `
            <button onclick="selectModelStyle('${String(s).replace(/'/g, "\\'")}', this)"
                    class="model-style-btn px-2 py-1 md:px-3 md:py-1.5 border text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none ${
                      i === 0
                        ? "border-[#DF414F] bg-[#fff1ee] text-[#DF414F] font-black shadow-sm"
                        : "border-gray-200 bg-white text-gray-800 hover:border-[#DF414F] font-bold"
                    }">
              ${s}
            </button>
        `,
        )
        .join("");
      if (modelStyleLabel) modelStyleLabel.innerText = selectedModelStyle;
      modelStyleSection.classList.remove("hidden");
    } else {
      modelStyleContainer.innerHTML = "";
      modelStyleSection.classList.add("hidden");
    }
  }

  if (typeof loadProductComments === "function") {
    loadProductComments(productId);
  }

  const modal = document.getElementById("product-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  document.body.style.overflow = "hidden";

  history.pushState({ productCode: currentProductCode || productId }, "", `?product=${currentProductCode || productId}`);
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
  const modelStyleLabel = document.getElementById("selected-model-style-text");

  if (colorLabel)
    colorLabel.innerText =
      selectedColor.toLowerCase() === "#ffffff" ? "White" : selectedColor;

  if (sizeLabel) sizeLabel.innerText = selectedSize;

  if (modelLabel) modelLabel.innerText = selectedModel;

  if (modelStyleLabel) modelStyleLabel.innerText = selectedModelStyle;
}

function selectColor(color, element) {
  selectedColor = color;
  updateSelectedLabels();

  document.querySelectorAll(".color-option-btn").forEach((btn) => {
    btn.className =
      "color-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[10px] md:text-[11px] font-bold transition-all uppercase cursor-pointer select-none";
  });

  element.className =
    "color-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none shadow-sm";
}

function selectModelStyle(style, element) {
  selectedModelStyle = style;
  updateSelectedLabels();

  document.querySelectorAll(".model-style-btn").forEach((btn) => {
    btn.className =
      "model-style-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[10px] md:text-[11px] font-bold transition-all uppercase cursor-pointer select-none";
  });

  element.className =
    "model-style-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none shadow-sm";
}

function selectSize(size, element) {
  selectedSize = size;
  updateSelectedLabels();
  updateProductPrice();

  document.querySelectorAll(".size-option-btn").forEach((btn) => {
    btn.className =
      "size-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[10px] md:text-[11px] font-bold transition-all uppercase cursor-pointer select-none";
  });

  element.className =
    "size-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none shadow-sm";
}

function getActiveSizeList(product) {
  if (String(selectedSizeGroup || "").toUpperCase() === "CHILDREN") {
    return product.sizesChildren && product.sizesChildren.length ? product.sizesChildren : product.sizes;
  }
  return product.sizes || [];
}

function renderSizeOptions(product) {
  const groups = [];
  if (product.sizesChildren && product.sizesChildren.length) {
    groups.push("ADULT");
    groups.push("CHILDREN");
  }
  let html = "";
  if (groups.length > 1) {
    html += '<div class="flex items-center gap-1.5 mb-2">' +
      groups.map((g) =>
        '<button onclick="selectSizeGroup(\'' + g + '\')" class="size-group-btn px-2.5 py-1 border text-[10px] md:text-[11px] transition-all cursor-pointer select-none font-bold ' +
        (String(selectedSizeGroup || "").toUpperCase() === g
          ? "border-[#DF414F] bg-[#fff1ee] text-[#DF414F] shadow-sm"
          : "border-gray-200 bg-white text-gray-600 hover:border-[#DF414F]") +
        '">' + (g === "CHILDREN" ? "ANAK" : "DEWASA") + '</button>'
      ).join("") +
      '</div>';
  }
  html += getActiveSizeList(product)
    .map(
      (size, index) => `
        <button onclick="selectSize('${size}', this)" 
                class="size-option-btn px-2 py-1 md:px-3 md:py-1.5 border text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none ${
                  index === 0
                    ? "border-[#DF414F] bg-[#fff1ee] text-[#DF414F] font-black shadow-sm"
                    : "border-gray-200 bg-white text-gray-800 hover:border-[#DF414F] font-bold"
                }">
            ${size}
        </button>
    `,
    )
    .join("");
  return html;
}

function selectSizeGroup(group) {
  selectedSizeGroup = String(group || "").toUpperCase();
  const product = products.find((p) => p.id === currentProductId);
  if (!product) return;
  const list = getActiveSizeList(product);
  if (!list.includes(selectedSize)) selectedSize = list[0] || "";
  const container = document.getElementById("size-options");
  if (container) container.innerHTML = renderSizeOptions(product);
  updateSelectedLabels();
  updateProductPrice();
}

function selectModel(model, element) {
  selectedModel = model;
  updateSelectedLabels();
  updateProductPrice();

  document.querySelectorAll(".model-option-btn").forEach((btn) => {
    btn.className =
      "model-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-gray-200 bg-white text-gray-800 hover:border-gray-400 text-[10px] md:text-[11px] font-bold transition-all uppercase cursor-pointer select-none";
  });
  element.className =
    "model-option-btn px-2 py-1 md:px-3 md:py-1.5 border border-[#DF414F] bg-[#FFF1EE] text-[#DF414F] font-black text-[10px] md:text-[11px] transition-all uppercase cursor-pointer select-none shadow-sm";
}

function alterQty(amount) {
  const input = document.getElementById("modal-qty-input");
  if (!input) return;
  let currentVal = parseInt(input.value) || 1;
  currentVal += amount;
  if (currentVal < 1) currentVal = 1;
  const product = window.currentProduct;
  if (product && product.stock && currentVal > product.stock) {
    currentVal = product.stock;
  }
  input.value = currentVal;
}

async function getFreshUserData(userId) {
  try {
    const response = await fetch(_d('9kzs9 }o|7z|ypsvo9') + userId);
    if (response.status === 401 || response.status === 403) {
      handleSessionExpired();
      return null;
    }
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
    } else if (meRes.status === 401 || meRes.status === 403) {
      handleSessionExpired();
      resetCheckoutButton();
      return;
    }
  } catch (e) {}
  if (!parsedUser) {
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
      handleSessionExpired();
    } else {
      showIosModal(
        "Login Yuk!, Biar bisa checkout Article dari Northline!",
      );
    }
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
      const discountCheck = await fetch(_d('9kzs9mromu7ns}my x~9') + parsedUser.id);
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
    code: product.code || currentProductCode || "",
    voucherId: appliedVoucher[currentProductId]?.type || "",
    productName: product.name,

    productImage:
      document.getElementById("main-preview")?.src ||
      product.images?.[0] ||
      "/public/icons/default.png",

    quantity: qty,

    chosenColor: selectedColor,
    chosenSize: selectedSize,
    chosenSizeGroup: selectedSizeGroup,
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
  loadMyVouchers(function () {
    const active = appliedVoucher[currentProductId];
    if (active && active.type !== 'free_shipping' && !VOUCHERS.some(v => v.id === active.type)) {
      applyVoucherById('free_shipping');
    }
    renderVoucherCards();
  });
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

function productMatchesVoucher(voucher, product) {
  if (!voucher.productCategories || voucher.productCategories.length === 0) return true;
  const cats = Array.isArray(product.categories) ? product.categories.map(String) : [];
  return voucher.productCategories.some(c => cats.includes(String(c)));
}

function selectVoucher(id) {
  const active = appliedVoucher[currentProductId];
  if (active && active.type === id) return;
  const qty = getCurrentQty();
  const voucher = VOUCHERS.find(v => v.id === id);
  if (voucher && voucher.minQty && qty < voucher.minQty) return;
  const product = products.find(p => p.id === currentProductId);
  if (voucher && product && !productMatchesVoucher(voucher, product)) return;
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
  if (!productMatchesVoucher(voucher, product)) return;
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
  const product = products.find(p => p.id === currentProductId);
  const groups = { free: [], monthly: [], special: [] };
  VOUCHERS.forEach(v => {
    let isDisabled = v.minQty && qty < v.minQty;
    let catNote = '';
    if (product && !productMatchesVoucher(v, product)) {
      isDisabled = true;
      catNote = ' <span class="text-[10px] text-red-500 font-normal">(Khusus kaos, hoodie & workshirt)</span>';
    }
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
          <h3 class="text-sm font-semibold text-gray-800">${v.label}${isDisabled ? catNote || ' <span class="text-[10px] text-red-500 font-normal">(Min. 2 produk)</span>' : ''}</h3>
          ${body}
        </div>
      </div>
    `.trim());
  });
  let html = groups.free.join('');
  if (groups.monthly.length > 0 || groups.special.length > 0) {
    html += `<div class="text-xs font-bold text-gray-500 tracking-wide pt-3 pb-1 border-t border-gray-100 mt-2">Voucher Bulan Ini</div>`;
  }
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
    chosenSizeGroup: payload.chosenSizeGroup || 'ADULT',
    chosenModel: payload.chosenModel,

    orderId: payload.orderId,
  };
  function handleSuccess(result) {
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
  }
  async function fetchCsrf() {
    try {
      const csrfRes = await fetch(_d('9kzs9m}|p7~yuox'), { credentials: 'include' });
      const csrfData = await csrfRes.json();
      if (csrfData.success && csrfData.csrfToken) {
        const token = csrfData.csrfToken;
        if (window.STORAGE_KEYS) localStorage.setItem(window.STORAGE_KEYS.CSRF_TOKEN, token);
        return token;
      }
    } catch (e) { console.error('CSRF fetch error:', e); }
    return localStorage.getItem(window.STORAGE_KEYS && window.STORAGE_KEYS.CSRF_TOKEN) || '';
  }
  async function postOrder(token) {
    return fetch(_d('9kzs9}k!o7y|no|'), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify(orderData),
    });
  }
  try {
    let response = await postOrder(await fetchCsrf());
    if (response.status === 403) {
      try {
        localStorage.removeItem(window.STORAGE_KEYS && window.STORAGE_KEYS.CSRF_TOKEN);
        const retryToken = await fetchCsrf();
        response = await postOrder(retryToken);
      } catch (e) { console.error('CSRF retry error:', e); }
    }
    if (response.status === 401) {
      handleSessionExpired();
      return false;
    }
    const result = await response.json();
    return handleSuccess(result);
  } catch (err) {
    console.error("Gagal save ke DB:", err);
    showIosModal("Terjadi kesalahan sistem, coba lagi nanti.");
    return false;
  }
}

function buildDummyComments(productId) {
  const s = String(productId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  const seed = h;
  const names = ["Andi Pratama", "Bunga Ayu", "Rizky Ramadhan", "Dewi Lestari", "Fajar Nugroho", "Sinta Maharani", "Bayu Saputra", "Maya Anggraini", "Reza Firmansyah", "Citra Kirana"];
  const texts = [
    "Bahan nyaman banget, jahitan rapi, puas belanja di Northline!",
    "Kualitas premium sesuai harga, recommended banget buat daily wear.",
    "Ukurannya pas, warna tidak luntur setelah dicuci. Mantap!",
    "Pengiriman cepat, packing rapi, bajunya adem dipakai seharian.",
    "Sudah beli beberapa kali, tidak pernah kecewa. Langganan deh!",
    "Bagus banget, teman saya juga ikutan beli karena lihat hasilnya.",
    "Bahan tebal dan tidak mudah melar, worth it pokoknya.",
    "Pesan lagi untuk keluarga, semua pada suka dengan kualitasnya."
  ];
  const replies = [
    "Terima kasih atas ulasannya! Senang produknya sesuai ekspektasi.",
    "Halo kak, terima kasih sudah berbelanja di Northline. Ditunggu order berikutnya ya!",
    "Makasih reviewnya kak, semoga selalu nyaman dipakai 😊"
  ];
  const found = findProductByRef(productId);
  const out = [];
  const daysAgo = [3, 9, 18, 32, 47];
  const sizesPool = found && found.sizesChildren && found.sizesChildren.length
    ? found.sizesChildren.concat(found.sizes || [])
    : (found && found.sizes) || ["M", "L"];
  for (let i = 0; i < 4; i++) {
    const n = (seed + i * 97) % names.length;
    const t = (seed + i * 131) % texts.length;
    const r = (seed + i * 7) % replies.length;
    const rating = 4 + ((seed + i * 11) % 2);
    const hasReply = i % 2 === 1;
    out.push({
      id: i,
      rating: rating,
      ratingBahan: Math.max(rating, 4),
      ratingUkuran: Math.max(rating, 4),
      ratingWarna: Math.max(rating, 4),
      variantColor: (found && found.colors && found.colors[0]) || "HITAM",
      variantSize: sizesPool[(seed + i * 13) % sizesPool.length],
      variantModel: (found && found.models && found.models[0]) || "",
      userAvatar: "https://api.dicebear.com/9.x/avataaars/png?seed=" + names[n].toLowerCase().replace(/\s+/g, ""),
      userName: names[n],
      verified: true,
      createdAt: new Date(Date.now() - daysAgo[i] * 86400000).toISOString(),
      text: texts[t],
      images: [],
      replyText: hasReply ? replies[r] : null,
      replyAt: hasReply ? new Date(Date.now() - (daysAgo[i] - 1) * 86400000).toISOString() : null
    });
  }
  return out;
}

async function loadProductComments(productId) {
  const commentsList = document.getElementById("product-comments-list");
  const ratingStarsEl = document.getElementById("detail-rating-stars");
  const reviewCountEl = document.getElementById("detail-review-count");

  if (!commentsList) return;

  commentsList.innerHTML =
    '<p class="text-[10px] text-gray-400 font-medium">Loading reviews...</p>';

  try {
    const response = await fetch(_d('9kzs9k ~r9z|yn m~}9') + productId + '/comments');
    const result = await response.json();

    const totalReviews = result.totalReviews || 0;
    const averageRating = result.averageRating || 0;
    let comments = result.comments || [];
    if (comments.length === 0) comments = buildDummyComments(productId);

    const foundProduct = findProductByRef(productId);
    const effectiveAvg = averageRating > 0 ? averageRating : (foundProduct ? (foundProduct.avgRating || 0) : 0);
    const effectiveTotal = totalReviews > 0 ? totalReviews : (foundProduct ? (foundProduct.totalReviews || 0) : 0);

    if (ratingStarsEl) {
      const full = Math.floor(effectiveAvg);
      const half = effectiveAvg - full >= 0.5 ? 1 : 0;
      ratingStarsEl.innerText =
        "★".repeat(full) + (half ? "⯨" : "") + "☆".repeat(5 - full - half);
    }
    if (reviewCountEl) {
      reviewCountEl.innerText = formatReviewCount(effectiveTotal);
    }

    if (comments.length === 0) return;

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
        const images = (comment.images || []).slice(0, 3);
        const subRatings = [];
        if (comment.ratingBahan) subRatings.push("Bahan " + comment.ratingBahan + "★");
        if (comment.ratingUkuran) subRatings.push("Ukuran " + comment.ratingUkuran + "★");
        if (comment.ratingWarna) subRatings.push("Warna " + comment.ratingWarna + "★");
        const variantParts = [];
        if (comment.variantColor) variantParts.push(escapeHtml(comment.variantColor));
        if (comment.variantSize) variantParts.push("Ukuran " + escapeHtml(comment.variantSize));
        if (comment.variantModel) variantParts.push(escapeHtml(comment.variantModel));

        return `<div class="p-2.5 bg-white border border-gray-200 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5">
                                <img src="${escapeHtml(comment.userAvatar || "/public/icons/default.png")}" 
                                    class="w-5 h-5 rounded-full object-cover border border-gray-200" alt="User">
                                <div class="flex flex-col leading-none">
                                    <div class="flex items-center gap-1">
                                        <span class="text-[10px] font-bold text-gray-800">${escapeHtml(comment.userName || "Anonymous")}</span>
                                        ${comment.verified ? '' : ''}
                                    </div>
                                    <span class="text-[8px] text-gray-400 font-normal mt-0.5">
                                        @${escapeHtml((comment.userName || "user").toLowerCase().replace(/\s+/g, ""))}
                                    </span>
                                </div>
                            </div>
                            <span class="text-[9px] text-gray-400 align-top">${commentDate}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="text-amber-500 text-[10px] font-medium leading-none">${stars}</div>
                            ${subRatings.length ? '<span class="text-[8px] text-gray-400">' + subRatings.join(' · ') + '</span>' : ''}
                        </div>
                        ${variantParts.length ? '<div class="text-[9px] text-gray-500">' + variantParts.join(' · ') + '</div>' : ''}
                        ${images.length ? '<div class="flex gap-1.5">' + images.map((img, i) =>
                          '<img src="' + escapeHtml(img) + '" class="w-14 h-14 object-cover border border-gray-200 cursor-pointer" onclick="openReviewImage(\'' + escapeHtml(img) + '\')">'
                        ).join('') + '</div>' : ''}
                        ${comment.text ? '<p class="text-[11px] text-gray-600 leading-snug font-normal">' + escapeHtml(comment.text) + '</p>' : ''}
                        ${comment.replyText ? '<div class="border-l-2 border-[#DF414F] bg-gray-50 p-2 space-y-0.5">' +
                          '<div class="flex items-center gap-1">' +
                            '<img src="https://img.icons8.com/?size=100&id=59878&format=png&color=DF414F" class="w-3 h-3">' +
                            '<span class="text-[9px] font-bold text-[#DF414F] uppercase">Balasan Northline</span>' +
                          '</div>' +
                          '<p class="text-[10px] text-gray-600">' + escapeHtml(comment.replyText) + '</p>' +
                          (comment.replyAt ? '<p class="text-[8px] text-gray-400">' + new Date(comment.replyAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) + '</p>' : '') +
                        '</div>' : ''}
                    </div>`;
      })
      .join("");
  } catch (error) {
    console.error("Error loading comments:", error);
    commentsList.innerHTML =
      '<p class="text-[10px] text-red-500 font-medium">Gagal memuat ulasan produk.</p>';
  }
}

function openReviewImage(src) {
  const overlay = document.createElement("div");
  overlay.id = "review-image-lightbox";
  overlay.className = "fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4";
  overlay.onclick = function () { overlay.remove(); };
  overlay.innerHTML = '<img src="' + escapeHtml(src) + '" class="max-w-full max-h-[85vh] object-contain" style="image-rendering:auto">';
  document.body.appendChild(overlay);
}

function goToAccountOrders() {
  window.location.href = "/account?tab=orders";
}

async function submitProductComment() {
  const ratingInput = document.getElementById("input-comment-rating");
  const textInput = document.getElementById("input-comment-text");

  if (!textInput || !ratingInput) return;

  const rating = parseInt(ratingInput.value);
  const text = textInput.value.trim();

  if (!text) {
    showIosModal("Tulis isi ulasannya dulu, Jing!");
    textInput.focus();
    return;
  }

  if (!currentProductId) {
    showIosModal("Product ID tidak valid!");
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
      if (response.status === 401 || response.status === 403) {
        showIosModal(result.message || "Sesi berakhir, silakan login ulang");
        setTimeout(() => { window.location.href = '/AppNorthAuth'; }, 1500);
      } else {
        showIosModal(result.message || "Gagal mengirim ulasan.");
      }
    }
  } catch (error) {
    console.error("Error submitting comment:", error);
    showIosModal("Terjadi kesalahan koneksi ke server backend!");
  }
}

function formatReviewCount(n) {
  n = n || 0;
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + "Rb+";
  }
  return n;
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

    const response = await fetch(_d('9kzs9z|yn m~}9|k~sxq7} wwk|$'));
    if (!response.ok) return;

    const ratingSummary = await response.json();

    Object.keys(ratingSummary).forEach((productId) => {
        const dataDb = ratingSummary[productId];
        document
            .querySelectorAll(
                `.card-stars-box[data-product-id="${productId}"], #card-stars-${productId}`
            )
            .forEach((el) => {
                const starsToShow = Math.round(dataDb.avgRating || 0);

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
                    `${formatReviewCount(dataDb.totalReviews || 0)} Penilaian`;
            });
    });
  } catch (error) {
    console.error("Gagal sinkronisasi data catalog luar!:", error);
  }
}

function getAvailableVoucherLabels() {
  const qty = getCurrentQty();
  return VOUCHERS
    .filter(v => !v.minQty || qty >= v.minQty)
    .map(v => v.label);
}

function getDiscountPercent(product) {
  const oldPrice = product.oldPrice || 0;
  const price = getCurrentPrice(product);
  if (oldPrice > price && oldPrice > 0) {
    return Math.round(((oldPrice - price) / oldPrice) * 100);
  }
  return 0;
}

function buildProductShareText(product) {
  const price = `IDR ${getCurrentPrice(product).toLocaleString("id-ID")}`;
  const lines = [product.name, price];
  const discount = getDiscountPercent(product);
  if (discount > 0) {
    lines.push(`🔥 Diskon ${discount}% (Harga normal IDR ${(product.oldPrice || 0).toLocaleString("id-ID")})`);
  }
  if (selectedModel) lines.push(`Model: ${selectedModel}`);
  if (selectedColor) lines.push(`Warna: ${selectedColor}`);
  if (selectedSize) lines.push(`Ukuran: ${selectedSize}`);

  const rating = product.avgRating || 0;
  const reviews = product.totalReviews || 0;
  if (rating > 0) {
    lines.push(`⭐ ${rating} / 5 (${reviews} penilaian)`);
  }

  const vouchers = getAvailableVoucherLabels();
  if (vouchers.length) {
    lines.push(`\n🎟️ Voucher tersedia:`);
    vouchers.forEach(v => lines.push(`- ${v}`));
  }

  lines.push(
    ``,
    `🛍️ Official Northline Store — 100% Original & Premium Quality`,
    `✅ Bahan premium 24s Cotton Combed, nyaman dipakai seharian`,
    `🚚 Pengiriman cepat ke seluruh Indonesia`,
    `💬 Chat admin untuk info stok, ukuran & pembayaran`,
    `⏰ Harga & stok bisa berubah sewaktu-waktu, jangan sampai kehabisan!`,
    `👇 Klik link, langsung lihat produknya 👇`,
  );
  return lines.join("\n");
}

window.shareProduct = async function () {
  await window.northlineCatalog;
  const product = findProductByRef(currentProductId);

  if (!product) return;

  const code = product.code || currentProductCode || currentProductId;
  const url = `${location.origin}/product/${code}`;

  const title = product.name;
  const text = buildProductShareText(product);

  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
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
      const seen = new Set();
      if ("Northline".toLowerCase().includes(k)) { h += storeItem("Northline", "/AppNorthStore"); any = true; }
      const src = window.northlineProducts || products;
      src.filter(p => p.name && p.name.toLowerCase().includes(k)).forEach(p => { if (!seen.has(String(p.id))) { seen.add(String(p.id)); h += prodItem(p.name, p.id); any = true; } });
      try {
        const r = await fetch(_d('9kzs9z|yn m~}9}ok|mrI{G') + encodeURIComponent(kw));
        const d = await r.json();
        if (Array.isArray(d.products)) {
          if (Array.isArray(d.sellers)) d.sellers.forEach(s => { if (s.store_name && s.store_name.toLowerCase().includes(k)) { h += storeItem(s.store_name, `/public/seller/${s.id}`); any = true; } });
          d.products.filter(p => p.id).forEach(p => { if (!seen.has(String(p.id))) { seen.add(String(p.id)); h += prodItem(p.name || p.product_name, p.id); any = true; } });
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
  await window.northlineCatalog;
  window.renderNorthlineGrids();

  const params = new URLSearchParams(window.location.search);
  const productRef = params.get("product");

  if (productRef) {
    setTimeout(() => {
      openProductDetail(productRef);
      const code = currentProductCode || productRef;
      history.replaceState({ productCode: code }, "", `?product=${code}`);
    }, 300);
  }
});

window.addEventListener("popstate", (e) => {
  const modal = document.getElementById("product-modal");
  if (e.state && (e.state.productCode || e.state.productId)) {
    openProductDetail(e.state.productCode || e.state.productId);
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
