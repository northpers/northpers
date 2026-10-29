function isLoggedIn() {
  const cookies = document.cookie.split(';');
  return cookies.some(c => c.trim().startsWith('logged_in=')) || cookies.some(c => c.trim().startsWith('nl_jwt='));
}

function apiGet(endpoint) {
  return fetch(endpoint, { credentials: 'include' }).then(r => r.json());
}

function apiPost(endpoint, body) {
  return fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
}

function apiDelete(endpoint) {
  return fetch(endpoint, { method: 'DELETE', credentials: 'include' }).then(r => r.json());
}

function getLocalItems() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];
}

function setLocalItems(items) {
  localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(items));
}

function getWishlistItems(callback) {
  if (isLoggedIn()) {
    if (window.WishlistManager && window.WishlistManager._cache) {
      callback(window.WishlistManager._cache);
    } else {
      apiGet('/api/wishlist').then(data => {
        if (data.success) {
          if (window.WishlistManager) window.WishlistManager._cache = data.items;
          callback(data.items);
        } else {
          callback([]);
        }
      }).catch(() => callback([]));
    }
  } else {
    callback(getLocalItems());
  }
}

window.WishlistManager = {
  _cache: null,

  updateNavbarBadge: function () {
    const badge = document.getElementById("wishlist-badge");
    const mobileBadge = document.getElementById("wishlist-badge-mobile");
    const countHeader = document.getElementById("popup-wishlist-count");

    const doUpdate = (total) => {
      [badge, mobileBadge].forEach((el) => {
        if (el) {
          if (total > 0) {
            el.innerText = total > 9 ? "9+" : total;
            el.classList.remove("hidden");
          } else {
            el.classList.add("hidden");
          }
        }
      });
      if (countHeader) {
        if (total > 0) {
          countHeader.innerText = total > 9 ? "9+" : total;
          countHeader.classList.remove("hidden");
        } else {
          countHeader.classList.add("hidden");
        }
      }
    };

    if (isLoggedIn()) {
      if (this._cache) {
        const total = this._cache.reduce((a, i) => a + (i.quantity || 1), 0);
        doUpdate(total);
      }
      apiGet('/api/wishlist').then(data => {
        if (data.success) {
          this._cache = data.items;
          const total = data.items.reduce((a, i) => a + (i.quantity || 1), 0);
          doUpdate(total);
        }
      }).catch(() => {});
    } else {
      const items = getLocalItems();
      const total = items.reduce((a, i) => a + (i.quantity || 1), 0);
      doUpdate(total);
    }
  },

  save: function (idOrEvent, name, price, img) {
    let targetId = idOrEvent;
    let targetName = name;
    let targetPrice = price;
    let targetImg = img;
    let targetProductId = "";

    if (idOrEvent && typeof idOrEvent === "object" && idOrEvent.preventDefault) {
      const e = idOrEvent;
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget || e.target;
      const card = btn.closest(".group") || btn.parentElement;
      const nameEl = card.querySelector("h3, h2, .product-name");
      targetName = nameEl ? nameEl.textContent.trim() : "Northline Product";
      targetId = nameEl ? "id-" + targetName.replace(/\s+/g, "-").toLowerCase() : "auto-" + Date.now();
      const productImgEl = Array.from(card.querySelectorAll("img")).find(i => !i.getAttribute("src")?.includes("icons8"));
      targetImg = productImgEl ? productImgEl.getAttribute("src") : "/public/image/default.png";
      const priceEl = Array.from(card.querySelectorAll(".text-northline-orange, .font-bold, .price, p, span, b, strong")).find(el => el.textContent.includes("IDR") && el.textContent.length < 25);
      targetPrice = priceEl ? priceEl.textContent.trim().replace(/\s+/g, " ") : "IDR0";
      const pidEl = card.querySelector("[data-product-id]");
      targetProductId = pidEl ? pidEl.getAttribute("data-product-id") : "";
    }

    if (isLoggedIn()) {
      apiPost('/api/wishlist/add', {
        product_id: targetProductId,
        name: targetName,
        price: targetPrice,
        img: targetImg,
        quantity: 1
      }).then(data => {
        if (data.success) {
          this._cache = null;
          this.updateNavbarBadge();
          if (typeof renderChatSuggestion === "function") renderChatSuggestion();
        }
      });
    } else {
      let items = getLocalItems();
      const index = items.findIndex(i => i.id === targetId);
      if (index > -1) {
        items[index].quantity = (items[index].quantity || 1) + 1;
      } else {
        items.push({ id: targetId, name: targetName, price: targetPrice, img: targetImg, quantity: 1 });
      }
      setLocalItems(items);
      this.updateNavbarBadge();
      if (typeof renderChatSuggestion === "function") renderChatSuggestion();
    }

    const badge = document.getElementById("wishlist-badge");
    if (badge) {
      badge.classList.add("scale-125", "bg-red-600");
      setTimeout(() => badge.classList.remove("scale-125", "bg-red-600"), 300);
    }
  },

  saveFromModal: function () {
    if (!window.currentProduct) {
      if (typeof showIosModal === "function") showIosModal("Produk tidak ditemukan");
      return;
    }

    const product = window.currentProduct;
    const currentPrice = typeof getCurrentPrice === "function" ? getCurrentPrice(product) : (product.price || 0);
    const imgSrc = document.getElementById("main-preview")?.src || (product.images && product.images[0]) || "";

    const itemData = {
      product_id: product.id,
      name: product.name,
      price: `IDR ${Number(currentPrice).toLocaleString("id-ID")}`,
      img: imgSrc,
      color: typeof selectedColor !== 'undefined' ? selectedColor : '',
      model: typeof selectedModel !== 'undefined' ? selectedModel : '',
      size: typeof selectedSize !== 'undefined' ? selectedSize : '',
      quantity: 1
    };

    if (isLoggedIn()) {
      apiPost('/api/wishlist/add', itemData).then(data => {
        if (data.success) {
          this._cache = null;
          this.updateNavbarBadge();
          if (typeof renderChatSuggestion === "function") renderChatSuggestion();
          if (typeof showIosModal === "function") showIosModal("Produk berhasil ditambahkan ke wishlist");
        }
      });
    } else {
      const wishlistId = [product.id, itemData.color, itemData.model, itemData.size].join("-");
      let items = getLocalItems();
      const existing = items.findIndex(i => i.id === wishlistId);
      if (existing > -1) {
        items[existing].quantity += 1;
      } else {
        items.push({
          id: wishlistId,
          productId: product.id,
          name: itemData.name,
          price: itemData.price,
          img: itemData.img,
          color: itemData.color,
          model: itemData.model,
          size: itemData.size,
          quantity: 1
        });
      }
      setLocalItems(items);
      this.updateNavbarBadge();
      if (typeof renderChatSuggestion === "function") renderChatSuggestion();
      if (typeof showIosModal === "function") showIosModal("Produk berhasil ditambahkan ke wishlist");
    }
  },

  togglePopup: function () {
    const popup = document.getElementById("wishlist-popup");
    if (!popup) return;
    const isOpen = !popup.classList.contains("hidden");
    popup.classList.toggle("hidden");
    if (!popup.classList.contains("hidden")) {
      openWishlistUrl();
      this.renderPopupItems();
    } else {
      window._wlClosing = true;
      closeWishlistUrl();
    }
  },

  renderPopupItems: async function () {
    const container = document.getElementById("popup-items-container");
    const emptyState = document.getElementById("popup-empty-state");
    const countHeader = document.getElementById("popup-wishlist-count");
    if (!container || !emptyState || !countHeader) return;

    const hasFilterBar = !!document.getElementById("wl-filter-bar");

    const getAndRender = async (items) => {
      const total = items.reduce((a, i) => a + (i.quantity || 1), 0);
      countHeader.innerText = total;
      if (hasFilterBar) {
        await wlEnsureCategoryMap(items);
        wlBuildFilterBar(items);
      }
      renderWishlistItems(items, container, emptyState, countHeader);
    };

    if (isLoggedIn()) {
      apiGet('/api/wishlist').then(data => {
        if (data.success) {
          this._cache = data.items;
          getAndRender(data.items);
        }
      });
    } else {
      const items = getLocalItems();
      getAndRender(items);
    }
  },

  initSwipeDelete: function () {
    document.querySelectorAll(".wishlist-swipe-wrapper").forEach((wrapper) => {
      const card = wrapper.querySelector(".wishlist-card");
      let startX = 0, currentX = 0, isDragging = false;

      card.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
      });

      card.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < 0) card.style.transform = `translateX(${Math.max(diff, -64)}px)`;
      });

      card.addEventListener("touchend", () => {
        isDragging = false;
        const diff = currentX - startX;
        if (diff < -40) {
          document.querySelectorAll(".wishlist-card").forEach((el) => { if (el !== card) el.style.transform = "translateX(0)"; });
          card.style.transform = "translateX(-64px)";
        } else {
          card.style.transform = "translateX(0)";
        }
      });

      let mouseDown = false;
      card.addEventListener("mousedown", (e) => {
        mouseDown = true;
        startX = e.clientX;
        card.style.transition = "none";
      });

      window.addEventListener("mousemove", (e) => {
        if (!mouseDown) return;
        currentX = e.clientX;
        const diff = currentX - startX;
        if (diff < 0) card.style.transform = `translateX(${Math.max(diff, -64)}px)`;
      });

      window.addEventListener("mouseup", () => {
        if (!mouseDown) return;
        mouseDown = false;
        card.style.transition = "transform .3s ease";
        const diff = currentX - startX;
        if (diff < -40) {
          document.querySelectorAll(".wishlist-card").forEach((el) => { if (el !== card) el.style.transform = "translateX(0)"; });
          card.style.transform = "translateX(-64px)";
        } else {
          card.style.transform = "translateX(0)";
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".wishlist-swipe-wrapper")) {
        document.querySelectorAll(".wishlist-card").forEach((card) => { card.style.transform = "translateX(0)"; });
      }
    });
  },

  removeProduct: function (id) {
    if (isLoggedIn()) {
      apiDelete('/api/wishlist/remove/' + id).then(data => {
        if (data.success) {
          this._cache = null;
          this.updateNavbarBadge();
          this.renderPopupItems();
          if (typeof renderChatSuggestion === "function") renderChatSuggestion();
        }
      });
    } else {
      let items = getLocalItems();
      items = items.filter(i => String(i.id) !== String(id));
      setLocalItems(items);
      this.updateNavbarBadge();
      this.renderPopupItems();
      if (typeof renderChatSuggestion === "function") renderChatSuggestion();
    }
  },

  toggleSelect: function (key) {
    window.__wlSelected = window.__wlSelected || new Set();
    if (window.__wlSelected.has(key)) window.__wlSelected.delete(key);
    else window.__wlSelected.add(key);
    this.renderPopupItems();
  },

  selectAll: function () {
    window.__wlSelected = window.__wlSelected || new Set();
    (window.__wlItems || []).forEach(i => window.__wlSelected.add(String(i.id)));
    this.renderPopupItems();
  },

  clearSelection: function () {
    window.__wlSelected = window.__wlSelected || new Set();
    window.__wlSelected.clear();
    this.renderPopupItems();
  },

  openWishlistVoucher: function () {
    let overlay = document.getElementById('wl-voucher-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'wl-voucher-overlay';
      overlay.className = 'fixed inset-0 z-[9999] flex items-end justify-center pointer-events-none transition-opacity duration-300 opacity-0';
      overlay.innerHTML = `
        <div id="wl-voucher-sheet" class="bg-white w-full max-w-lg shadow-2xl flex flex-col overflow-hidden transform translate-y-full transition-transform duration-300 ease-out" style="max-height: 50vh">
          <div class="bg-[#DF414F] text-white py-3 px-4 flex items-center justify-between shrink-0">
            <h2 class="text-sm">Northline Voucher</h2>
            <button type="button" onclick="WishlistManager.closeWishlistVoucher()" class="text-white hover:text-gray-200">
              <img src="https://img.icons8.com/?size=100&id=40021&format=png&color=ffffff" class="h-4 w-4">
            </button>
          </div>
          <div id="wl-voucher-list-container" class="p-3 overflow-y-auto flex-1 min-h-0">
            <div class="space-y-3"></div>
          </div>
          <div class="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
            <div class="flex gap-3">
              <button type="button" onclick="WishlistManager.closeWishlistVoucher()" class="flex-1 bg-[#DF414F] text-white py-2 px-4 text-[11px] font-bold uppercase transition-all hover:bg-red-700 border-none outline-none cursor-pointer">GUNAKAN</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    const self = this;
    this.loadMyVouchers(function () {
      self.wlRenderVoucherCards();
    });
    overlay.classList.remove('pointer-events-none', 'opacity-0');
    overlay.querySelector('#wl-voucher-sheet').classList.remove('translate-y-full');
  },

  loadMyVouchers: function (callback) {
    if (!isLoggedIn()) {
      if (typeof callback === 'function') callback();
      return;
    }
    apiGet('/api/vouchers').then(function (data) {
      if (data.success && Array.isArray(data.vouchers)) {
        window.VOUCHERS = data.vouchers
          .filter(function (v) {
            if (v.expired) return false;
            if (v.claimRequired) return v.claimStatus === 'claimed';
            return true;
          })
          .map(function (v) {
            v.id = v.code;
            return v;
          });
      }
      if (typeof callback === 'function') callback();
    }).catch(function () {
      if (typeof callback === 'function') callback();
    });
  },

  closeWishlistVoucher: function () {
    const overlay = document.getElementById('wl-voucher-overlay');
    if (!overlay) return;
    overlay.classList.add('pointer-events-none', 'opacity-0');
    overlay.querySelector('#wl-voucher-sheet')?.classList.add('translate-y-full');
  },

  wlRenderVoucherCards: function () {
    const container = document.querySelector('#wl-voucher-list-container .space-y-3');
    if (!container) return;
    const vouchers = window.VOUCHERS || WL_VOUCHERS_FALLBACK;
    const selectedId = window.WL_VOUCHER_SELECTED || '';
    const qty = (window.__wlItems || [])
      .filter(i => window.__wlSelected && window.__wlSelected.has(String(i.id)))
      .reduce((a, i) => a + (i.quantity || 1), 0);
    const groups = { free: [], monthly: [], special: [] };
    const selectedItems = (window.__wlItems || []).filter(i => window.__wlSelected && window.__wlSelected.has(String(i.id)));
    const selectedCats = new Set();
    selectedItems.forEach(i => {
      const cats = window.__wlCategoryMap && window.__wlCategoryMap[String(i.product_id || i.productId || '')];
      (cats || []).forEach(c => selectedCats.add(String(c)));
    });
    vouchers.forEach(v => {
      let isDisabled = v.minQty && qty < v.minQty;
      let catNote = '';
      if (v.productCategories && v.productCategories.length > 0) {
        const match = selectedItems.length > 0 && selectedItems.some(i => {
          const cats = window.__wlCategoryMap && window.__wlCategoryMap[String(i.product_id || i.productId || '')];
          return cats && cats.some(c => v.productCategories.includes(String(c)));
        });
        if (!match) {
          isDisabled = true;
          catNote = ' <span class="text-[10px] text-red-500 font-normal">(Khusus kaos, hoodie & workshirt)</span>';
        }
      }
      const isSelected = selectedId === v.id;
      const disabledClass = isDisabled ? 'opacity-50 pointer-events-none' : '';
      const selectedClass = isSelected ? 'selected' : '';
      let body = '';
      if (v.group === 'free') {
        body = `<p class="text-xs text-gray-500 truncate">${v.desc}</p>
                <p class="text-xs text-gray-600 mt-1">Voucher otomatis digunakan</p>`;
      } else {
        body = `<p class="text-xs text-gray-500 truncate">${v.desc}</p>
                <p class="text-xs font-medium text-[#DF414F] mt-1">Berlaku sampai ${wlFormatVoucherDate(v.expiryDay, v.expiryMonth, v.expiryYear)}</p>`;
      }
      const clickAttr = isDisabled ? '' : `WishlistManager.pickWishlistVoucher('${v.id}')`;
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
  },

  pickWishlistVoucher: function (id) {
    const voucher = (window.VOUCHERS || WL_VOUCHERS_FALLBACK).find(v => v.id === id);
    if (!voucher) return;
    const qty = (window.__wlItems || [])
      .filter(i => window.__wlSelected && window.__wlSelected.has(String(i.id)))
      .reduce((a, i) => a + (i.quantity || 1), 0);
    if (voucher.minQty && qty < voucher.minQty) return;
    window.WL_VOUCHER_SELECTED = id;
    this.wlRenderVoucherCards();
    this.renderPopupItems();
  },

  setWishlistFilter: function (type, key) {
    if (type === 'date') window.__wlFilterDate = key || 'all';
    else window.__wlFilterCategory = key || 'all';
    this.renderPopupItems();
  }
};

function renderWishlistItems(items, container, emptyState, countHeader) {
  if (document.getElementById("wl-filter-bar")) items = wlApplyFilters(items);
  const total = items.reduce((a, i) => a + (i.quantity || 1), 0);
  countHeader.innerText = total > 9 ? "9+" : total;
  window.__wlItems = items;

  container.querySelectorAll(".wishlist-swipe-wrapper, .popup-skeleton-item").forEach(el => el.remove());
  emptyState.classList.add("hidden");

  if (items.length === 0) {
    emptyState.classList.remove("hidden");
    const filterActive = !!document.getElementById("wl-filter-bar")
      && ((window.__wlFilterDate && window.__wlFilterDate !== 'all')
        || (window.__wlFilterCategory && window.__wlFilterCategory !== 'all'));
    const ps = emptyState.querySelectorAll("p");
    if (ps[0]) ps[0].textContent = filterActive ? "Tidak ada produk yang cocok." : "Your wishlist is empty.";
    if (ps[1]) ps[1].style.display = filterActive ? "none" : "";
  } else {
    items.forEach((item) => {
      const finalImgSrc = item.img && (item.img.startsWith("http") || item.img.startsWith("/")) ? item.img : "/public/image/" + (item.img || "default.png");
      const shortName = item.name && item.name.length > 40 ? item.name.substring(0, 40) + "..." : (item.name || '');
      const key = String(item.id);
      const safeKey = key.replace(/'/g, "\\'");
      const isChecked = window.__wlSelected && window.__wlSelected.has(key);
      const validPrice = wlParsePrice(item.price) > 0;
      const addedDate = wlFormatAddedDate(item.created_at);

      container.insertAdjacentHTML("beforeend", `
        <div class="wishlist-swipe-wrapper relative overflow-hidden cursor-pointer border border-gray-100">
          <div class="absolute top-0 right-0 h-full w-16 bg-gray-50 flex items-center justify-center">
            <button type="button" onclick="event.preventDefault(); event.stopPropagation(); WishlistManager.removeProduct('${safeKey}')" class="w-full h-full flex items-center justify-center">
              <img src="https://img.icons8.com/?size=100&id=87397&format=png&color=000000" class="w-5 h-5">
            </button>
          </div>
          <div data-product-id="${item.product_id || item.productId || ''}" class="wishlist-card bg-white p-3 flex items-start gap-4 relative z-10 transition-transform duration-300">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.preventDefault(); event.stopPropagation(); WishlistManager.toggleSelect('${safeKey}')" style="accent-color:#DF414F;width:16px;height:16px;cursor:pointer;align-self:center;flex-shrink:0;">
            <div class="relative w-20 h-15 bg-white overflow-hidden flex-shrink-0 border border-gray-200/60 flex items-center justify-center">
              <img src="${finalImgSrc}" class="w-full h-full object-contain" onerror="this.src='/public/icons/default.png'">
            </div>
            <div class="flex-1 min-w-0 space-y-1">
              <h4 class="text-gray-900 text-[13px]">${shortName}</h4>
              <div class="flex flex-wrap gap-1">
                <span class="px-1 py-[1px] bg-white border text-[9px]">${item.color || '-'}</span>
                <span class="px-1 py-[1px] bg-white border text-[9px]">${item.model || '-'}</span>
                <span class="px-1 py-[1px] bg-white border text-[9px]">${item.size || '-'}</span>
              </div>
              <p class="text-[12px] ${validPrice ? 'text-black' : 'text-red-500'}">${validPrice ? item.price : 'Harga tidak valid'}</p>
              ${addedDate ? '<p class="text-[10px] text-gray-400">Ditambahkan: ' + addedDate + '</p>' : ''}
            </div>
            ${item.quantity > 1 ? `<div class="absolute bottom-1 right-1 text-black text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center">×${item.quantity}</div>` : ''}
          </div>
        </div>
      `);
    });
  }

  setTimeout(() => { WishlistManager.initSwipeDelete(); }, 50);
  document.querySelectorAll('.wishlist-card').forEach(card => {
    card.addEventListener('click', function () {
      const productId = this.dataset.productId;
      if (productId && typeof openProductDetail === "function") openProductDetail(productId);
    });
  });

  updateWishlistCheckoutBar();
}

const WL_VOUCHERS_FALLBACK = [
  { id: 'free_shipping', label: 'Gratis Ongkir', desc: 'Bebas biaya kirim untuk semua produk Northline', discountPct: 0, group: 'free' },
];

const WL_CATEGORY_LABELS = {
  hoodie: 'Hoodie',
  shortsleeve: 'Shortsleeve',
  longsleeve: 'Longsleeve',
  workshirt: 'Workshirt',
};

function wlCategoryLabel(key) {
  return WL_CATEGORY_LABELS[key] || String(key).replace(/^./, c => c.toUpperCase());
}

async function wlEnsureCategoryMap(items) {
  window.__wlCategoryMap = window.__wlCategoryMap || {};
  const ids = items
    .map(i => String(i.product_id || i.productId || ''))
    .filter(id => id && !window.__wlCategoryMap[id]);
  if (ids.length === 0) return;
  if (!window.__wlCatalogLoaded) {
    window.__wlCatalogLoaded = true;
    try {
      const res = await fetch(_d('9kzs9mk~kvyq9z|yn m~}'));
      const data = await res.json();
      (data.products || []).forEach(p => {
        window.__wlCategoryMap[String(p.id)] = p.categories || [];
      });
    } catch (e) {}
  }
}

function wlApplyFilters(items) {
  const dateKey = window.__wlFilterDate;
  const catKey = window.__wlFilterCategory;
  return items.filter(it => {
    if (dateKey && dateKey !== 'all') {
      const t = new Date(it.created_at);
      if (isNaN(t.getTime())) return true;
      const now = new Date();
      if (dateKey === 'today') {
        const sameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
        if (!sameDay(t, now)) return false;
      } else if (dateKey === '7d') {
        if (now.getTime() - t.getTime() > 7 * 24 * 3600 * 1000) return false;
      } else if (dateKey === 'month') {
        if (t.getFullYear() !== now.getFullYear() || t.getMonth() !== now.getMonth()) return false;
      }
    }
    if (catKey && catKey !== 'all') {
      const cats = window.__wlCategoryMap[String(it.product_id || it.productId || '')] || [];
      if (!cats.includes(catKey)) return false;
    }
    return true;
  });
}

function wlFilterChipHtml(onclick, label, active) {
  return '<button type="button" onclick="' + onclick + '"'
    + ' style="padding:6px 12px;font-size:11px;font-weight:600;border:1px solid ' + (active ? '#DF414F' : '#e5e7eb') + ';background:' + (active ? '#DF414F' : '#fff') + ';color:' + (active ? '#fff' : '#4b5563') + ';cursor:pointer;border-radius:999px;white-space:nowrap;">' + label + '</button>';
}

function wlBuildFilterBar(items) {
  const dateBar = document.getElementById('wl-filter-date');
  const catBar = document.getElementById('wl-filter-cat');
  const wrap = document.getElementById('wl-filter-bar');
  if (!wrap || !dateBar || !catBar) return;
  wrap.classList.remove('hidden');

  const dateOpts = [
    ['all', 'Semua'],
    ['today', 'Hari Ini'],
    ['7d', '7 Hari'],
    ['month', 'Bulan Ini'],
  ];
  dateBar.innerHTML = dateOpts.map(o => {
    const active = (window.__wlFilterDate || 'all') === o[0];
    return wlFilterChipHtml("WishlistManager.setWishlistFilter('date','" + o[0] + "')", o[1], active);
  }).join('');

  const cats = new Set();
  (items || []).forEach(it => {
    const cs = window.__wlCategoryMap[String(it.product_id || it.productId || '')] || [];
    cs.forEach(c => cats.add(c));
  });
  const catChips = ['<button type="button" onclick="WishlistManager.setWishlistFilter(\'cat\',\'all\')"'
    + ' style="padding:6px 12px;font-size:11px;font-weight:600;border:1px solid ' + ((window.__wlFilterCategory || 'all') === 'all' ? '#DF414F' : '#e5e7eb') + ';background:' + ((window.__wlFilterCategory || 'all') === 'all' ? '#DF414F' : '#fff') + ';color:' + ((window.__wlFilterCategory || 'all') === 'all' ? '#fff' : '#4b5563') + ';cursor:pointer;border-radius:999px;white-space:nowrap;">Semua</button>'];
  [...cats].forEach(c => {
    const active = (window.__wlFilterCategory || 'all') === c;
    catChips.push('<button type="button" onclick="WishlistManager.setWishlistFilter(\'cat\',\'' + c + '\')"'
      + ' style="padding:6px 12px;font-size:11px;font-weight:600;border:1px solid ' + (active ? '#DF414F' : '#e5e7eb') + ';background:' + (active ? '#DF414F' : '#fff') + ';color:' + (active ? '#fff' : '#4b5563') + ';cursor:pointer;border-radius:999px;white-space:nowrap;">' + wlCategoryLabel(c) + '</button>');
  });
  catBar.innerHTML = catChips.join('');
}

function wlParsePrice(str) {
  const n = parseInt(String(str || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function wlFormatAddedDate(d) {
  if (!d) return '';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function wlFormatVoucherDate(day, month, year) {
  return day + '/' + month + '/' + year;
}

function wlVoucherDiscountFor(item, subtotal, fixedApplied) {
  const voucher = (window.VOUCHERS || WL_VOUCHERS_FALLBACK).find(v => v.id === window.WL_VOUCHER_SELECTED);
  if (!voucher) return 0;
  if (voucher.minQty && (item.quantity || 1) < voucher.minQty) return 0;
  if (voucher.productCategories && voucher.productCategories.length > 0) {
    const itemCats = window.__wlCategoryMap && window.__wlCategoryMap[String(item.product_id || item.productId || '')];
    if (!itemCats || !itemCats.some(c => voucher.productCategories.includes(String(c)))) return 0;
  }
  if (voucher.claimRequired && voucher.discountAmount > 0 && fixedApplied) return 0;
  if (voucher.discountPct > 0) return Math.round(subtotal * (voucher.discountPct / 100));
  if (voucher.discountAmount) return Math.min(voucher.discountAmount, subtotal);
  return 0;
}

function updateWishlistCheckoutBar() {
  const bar = document.getElementById('wishlist-checkout-bar');
  if (!bar) return;
  const selected = (window.__wlItems || []).filter(i => window.__wlSelected && window.__wlSelected.has(String(i.id)));
  let totalSub = 0, totalDisc = 0, count = 0, fixedApplied = false;
  selected.forEach(i => {
    const price = wlParsePrice(i.price);
    const qty = i.quantity || 1;
    const subtotal = price * qty;
    const d = wlVoucherDiscountFor(i, subtotal, fixedApplied);
    if (d > 0) fixedApplied = true;
    totalSub += subtotal;
    totalDisc += d;
    count += qty;
  });

  const COMBO_IDS = ['13', '37'];
  const selectedProductIds = selected.map(i => String(i.product_id || i.productId || ''));
  const isComboPromo = false;

  let total = totalSub - totalDisc;
  let comboDiscount = 0;
  if (isComboPromo) {
    comboDiscount = total - 200000;
    if (comboDiscount < 0) comboDiscount = 0;
    total = 200000;
  }

  const voucher = (window.VOUCHERS || WL_VOUCHERS_FALLBACK).find(v => v.id === window.WL_VOUCHER_SELECTED);
  const fmt = (n) => 'IDR ' + parseInt(n).toLocaleString('id-ID');

  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div>
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Total (${count} item)</p>
        <p style="font-size:12px;font-weight:700;color:#DF414F;">${fmt(total)}</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" onclick="${isComboPromo ? '' : 'WishlistManager.openWishlistVoucher()'}"
          style="height:34px;padding:0 12px;border:1px solid ${isComboPromo ? '#d1d5db' : (window.WL_VOUCHER_SELECTED ? '#DF414F' : '#d1d5db')};background:${isComboPromo ? '#f3f4f6' : '#fff'};color:${isComboPromo ? '#9ca3af' : (window.WL_VOUCHER_SELECTED ? '#DF414F' : '#4b5563')};font-size:11px;font-weight:600;cursor:${isComboPromo ? 'not-allowed' : 'pointer'};">
          ${isComboPromo ? 'Disabled' : (window.WL_VOUCHER_SELECTED ? (voucher ? voucher.label : 'Voucher') : 'Pilih Voucher')}
        </button>
        <button type="button" onclick="wishlistCheckoutSelected()" ${selected.length === 0 ? 'disabled' : ''}
          style="height:34px;padding:0 14px;border:none;background:#DF414F;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.05em;cursor:pointer;${selected.length === 0 ? 'opacity:0.4;cursor:not-allowed;' : ''}">
          CHECKOUT (${selected.length})
        </button>
      </div>
    </div>
    ${comboDiscount > 0 ? `<p style="font-size:11px;color:#DF414F;">Combo Promo: -${fmt(comboDiscount)}</p>` : ''}
    ${!isComboPromo && totalDisc > 0 ? `<p style="font-size:11px;color:#DF414F;">Diskon voucher: -${fmt(totalDisc)}</p>` : ''}
    ${isComboPromo ? '<p style="font-size:10px;color:#6b7280;margin-top:4px;">Pembelian pertama: Heritage Archive + Iconic Logo Rp200.000</p>' : ''}
  `;
}

async function wishlistCheckoutSelected() {
  if (typeof showIosModal !== 'function' || typeof window.bukaModalPembayaran !== 'function') return;
  const selected = (window.__wlItems || []).filter(i => window.__wlSelected && window.__wlSelected.has(String(i.id)));
  if (selected.length === 0) {
    showIosModal('Pilih dulu produk yang mau di-checkout');
    return;
  }
  let parsedUser = null;
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: 'include' });
    if (meRes.ok) {
      const meData = await meRes.json();
      const me = meData.data || meData.user || meData;
      if (me && me.id) parsedUser = { id: me.id };
    }
  } catch (e) {}
  if (!parsedUser) {
    showIosModal('Waduh!, lu harus masuk akun dulu sebelum bisa checkout Northline!');
    return;
  }
  let freshUser = null;
  try {
    const freshRes = await fetch(_d('9kzs9 }o|7z|ypsvo9') + parsedUser.id, { credentials: 'include' });
    freshUser = await freshRes.json();
  } catch (e) {}
  if (!freshUser || !freshUser.address || String(freshUser.address).trim() === '') {
    showIosModal('Isi dulu alamat pengiriman di profile, Ya! Masa bajunya mau dikirim ke kuburan.');
    return;
  }
  let shippingFee = 0;
  let shippingLabel = '';
  try {
    const quoteRes = await fetch('/api/shipping/quote', { credentials: 'include' });
    if (quoteRes.ok) {
      const quoteData = await quoteRes.json();
      if (quoteData && quoteData.success === false) {
        showIosModal(quoteData.reason || 'Pengiriman ke luar Indonesia belum tersedia');
        return;
      }
      if (quoteData && quoteData.canShip) {
        shippingFee = quoteData.fee || 0;
        shippingLabel = quoteData.label || '';
      }
    }
  } catch (e) {
    console.log('Shipping quote gagal:', e);
  }
  const now = Date.now();
  const items = [];
  let totalSub = 0, totalDisc = 0, fixedApplied = false;

  const COMBO_IDS = ['13', '37'];
  const selectedProductIds = selected.map(i => String(i.product_id || i.productId || ''));
  const isComboPromo = selected.length === 2 && selectedProductIds.includes('13') && selectedProductIds.includes('37');

  for (let idx = 0; idx < selected.length; idx++) {
    const it = selected[idx];
    const price = wlParsePrice(it.price);
    if (price <= 0) {
      showIosModal('Ada produk di wishlist yang harganya tidak valid. Hapus lalu tambahkan ulang produk tersebut.');
      return;
    }
    const productId = String(it.product_id || it.productId || '');
    if (!productId) {
      showIosModal('Ada produk yang tidak bisa di-checkout (data tidak lengkap). Hapus lalu tambahkan ulang produk tersebut.');
      return;
    }
    const qty = it.quantity || 1;
    const subtotal = price * qty;
    let discount = 0;
    if (!isComboPromo) {
      discount = wlVoucherDiscountFor(it, subtotal, fixedApplied);
    }
    if (discount > 0) fixedApplied = true;
    totalSub += subtotal;
    totalDisc += discount;
    const imgSrc = it.img && (it.img.startsWith('http') || it.img.startsWith('/')) ? it.img : '/public/image/' + (it.img || 'default.png');
    items.push({
      productId: productId,
      code: '',
      quantity: qty,
      chosenColor: it.color || '',
      chosenSize: it.size || '',
      chosenModel: it.model || '',
      productName: it.name,
      productImage: imgSrc,
      subtotal: subtotal,
      discountAmount: discount,
      totalPrice: subtotal - discount,
      orderId: 'NL-' + now + '-' + idx,
    });
  }

  if (isComboPromo) {
    totalDisc = totalSub - 200000;
    if (totalDisc < 0) totalDisc = 0;
    totalSub = 200000;
  }

  window.__wlCheckoutItemKeys = selected.map(i => String(i.id));
  window.__wlSelected.clear();
  updateWishlistCheckoutBar();
  window.bukaModalPembayaran({
    items: items,
    voucherId: isComboPromo ? '' : (window.WL_VOUCHER_SELECTED || ''),
    totalPrice: totalSub + shippingFee,
    subtotal: isComboPromo ? totalSub + totalDisc : totalSub,
    discountAmount: totalDisc,
    shippingFee: shippingFee,
    shippingLabel: shippingLabel,
    isComboPromo: isComboPromo,
  });
}

window.__onWishlistCheckoutSuccess = async function (orderIds) {
  const keys = window.__wlCheckoutItemKeys || [];
  window.__wlCheckoutItemKeys = null;
  if (isLoggedIn()) {
    for (const k of keys) {
      try { await apiDelete('/api/wishlist/remove/' + k); } catch (e) {}
    }
  } else {
    let items = getLocalItems();
    items = items.filter(i => !keys.includes(String(i.id)));
    setLocalItems(items);
  }
  WishlistManager._cache = null;
  window.WL_VOUCHER_SELECTED = '';
  window.VOUCHERS = null;
  if (typeof WishlistManager.loadMyVouchers === 'function') WishlistManager.loadMyVouchers();
  WishlistManager.updateNavbarBadge();
  if (typeof WishlistManager.renderPopupItems === 'function') WishlistManager.renderPopupItems();
  if (typeof renderChatSuggestion === 'function') renderChatSuggestion();
  if (typeof window.__wlPageRender === 'function') window.__wlPageRender();
};

function generateWLCode() {
  return Math.random().toString(36).slice(2, 10);
}

function openWishlistUrl() {
  const code = generateWLCode();
  const url = '/AppNorthWishlist?code=' + code;
  history.pushState({ spa: 'wishlist', code: code }, '', url);
  document.title = 'Wishlist - Northline';
}

function closeWishlistUrl() {
  const sp = history.state;
  if (sp && sp.spa === 'wishlist') {
    history.pushState(null, '', '/');
  }
  document.title = 'Northline Indonesia';
}

function isWishlistUrlActive() {
  return window.location.pathname === '/AppNorthWishlist' && window.location.search.includes('code=');
}

window.handlePopStateWishlist = function(e) {
  const popup = document.getElementById('wishlist-popup');
  if (!popup) return;
  if (e.state && e.state.spa === 'wishlist') {
    if (popup.classList.contains('hidden') && !window._wlClosing) {
      popup.classList.remove('hidden');
      if (typeof WishlistManager.renderPopupItems === 'function') WishlistManager.renderPopupItems();
      if (typeof renderChatSuggestion === 'function') renderChatSuggestion();
      updateWishlistCheckoutBar();
    }
    window._wlClosing = false;
  } else {
    if (!popup.classList.contains('hidden') && !window._wlClosing) {
      popup.classList.add('hidden');
      if (typeof renderChatSuggestion === 'function') renderChatSuggestion();
      updateWishlistCheckoutBar();
    }
    window._wlClosing = false;
  }
};

window.addEventListener('popstate', window.handlePopStateWishlist);

(function initWishlist() {
  WishlistManager.updateNavbarBadge();

  if (isWishlistUrlActive()) {
    const popup = document.getElementById('wishlist-popup');
    if (popup && popup.classList.contains('hidden')) {
      popup.classList.remove('hidden');
    }
    document.title = 'Wishlist - Northline';
  }

  if (isLoggedIn()) {
    const localItems = getLocalItems();
    if (localItems.length > 0) {
      apiPost('/api/wishlist/migrate', { items: localItems }).then(data => {
        if (data.success && data.migrated > 0) {
          localStorage.removeItem(STORAGE_KEYS.WISHLIST);
          WishlistManager._cache = null;
          WishlistManager.updateNavbarBadge();
        }
      });
    }
  }

  if (typeof renderChatSuggestion === "function") renderChatSuggestion();
  window.__wlSelected = new Set();
  window.WL_VOUCHER_SELECTED = window.WL_VOUCHER_SELECTED || '';
  const wlSelectAllEl = document.getElementById('wl-select-all');
  if (wlSelectAllEl) {
    wlSelectAllEl.onchange = () => {
      if (wlSelectAllEl.checked) WishlistManager.selectAll();
      else WishlistManager.clearSelection();
    };
  }
  updateWishlistCheckoutBar();
})();
