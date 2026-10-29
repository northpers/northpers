const knownStores = [
  { name: "Northline", url: "/AppNorthStore" },
];

if (typeof _d !== 'function') {
  window._d = function (s) { let r = ""; for (let i = 0; i < s.length; i++) { r += String.fromCharCode(((s.charCodeAt(i) - 32 - 10 + 95) % 95) + 32); } return r; };
}

window.northlineProducts = window.northlineProducts || [];

const northlineCatalogPromise = window.northlineCatalog
  ? window.northlineCatalog
  : (async () => {
      try {
        const res = await fetch(_d('9kzs9mk~kvyq9z|yn m~}'));
        if (!res.ok) return [];
        const data = await res.json();
        const products = (data && data.products) || [];
        window.northlineProducts = products;
        return products;
      } catch (e) {
        return [];
      }
    })();

function renderSearchItem(product, ai) {
  const name = product.name || product.product_name || "";
  const escapedName = escapeSearchHtml(name);
  const escapedId = escapeSearchHtml(product.id);
  const escapedCode = escapeSearchHtml(product.code || "");
  const escapedSource = escapeSearchHtml(product.source || "local");
  const badge = ai
    ? '<span class="shrink-0"><img src="https://img.icons8.com/?size=100&id=dQ0TcR10zyYB&format=png&color=000000" class="w-4 h-4" alt="AI"/></span>'
    : "";
  if (product.image) {
    const price = typeof product.price === "number"
      ? `Rp${product.price.toLocaleString("id-ID")}`
      : (product.price || "");
    return `
      <div class="search-result-item flex items-center gap-3 px-3 py-2.5 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-sm text-gray-700"
        data-id="${escapedId}"
        data-code="${escapedCode}"
        data-source="${escapedSource}">
        <img src="${escapeSearchHtml(product.image)}" alt="" class="w-12 h-12 rounded-md object-cover bg-gray-100 flex-shrink-0" loading="lazy">
        <span class="min-w-0 flex-1">
          <span class="block truncate">${escapedName}</span>
          ${price ? `<span class="block text-xs text-[#DF414F] mt-0.5">${escapeSearchHtml(price)}</span>` : ""}
        </span>
        ${badge}
      </div>
    `;
  }
  return `
    <div class="search-result-item px-3 py-2.5 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-sm text-gray-700 ${ai ? "flex items-center gap-1.5" : "truncate"}"
      data-id="${escapedId}"
      data-code="${escapedCode}"
      data-source="${escapedSource}">
      ${badge}
      <span class="${ai ? "truncate" : ""}">${escapedName} ...</span>
    </div>
  `;
}

function escapeSearchHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderStoreItem(store) {
  return `
    <a href="${store.url}"
      class="search-store-item flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-sm text-gray-700">
      <img src="https://img.icons8.com/?size=100&id=5B2IjBNporYk&format=png&color=DF414F" class="w-4 h-4 flex-shrink-0">
      <span class="text-sm">${store.name}</span>
    </a>
  `;
}

let aiRecommendTimer = null;
let aiRecommendResolver = null;

async function fetchAiProducts(keyword) {
  try {
    const res = await fetch(`${_d('9kzs9}ok|mr7|omywwoxn')}?q=${encodeURIComponent(keyword)}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.products)) {
      return data.products.map(p => ({
        id: p.id,
        name: p.name || p.product_name,
        code: p.code || "",
        source: "catalog",
        ai: true,
      }));
    }
  } catch (e) {}
  return [];
}

function scheduleAiRecommend(keyword) {
  clearTimeout(aiRecommendTimer);
  if (aiRecommendResolver) {
    aiRecommendResolver([]);
    aiRecommendResolver = null;
  }
  return new Promise(resolve => {
    aiRecommendResolver = resolve;
    aiRecommendTimer = setTimeout(async () => {
      aiRecommendResolver = null;
      const items = await fetchAiProducts(keyword);
      resolve(items);
    }, 600);
  });
}

function renderAiSection(container, keyword, aiProducts) {
  if (!aiProducts || aiProducts.length === 0) return;
  if (container.dataset.searchKw !== keyword) return;
  const section = '<div class="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[#DF414F] bg-[#fff5f5] flex items-center gap-1.5 border-b border-gray-100"><img src="https://img.icons8.com/?size=100&id=dQ0TcR10zyYB&format=png&color=DF414F" class="w-3 h-3"> AI Recomended</div>';
  const html = section + aiProducts.map(p => renderSearchItem(p, true)).join("");
  container.insertAdjacentHTML("afterbegin", html);
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("main-search");
  const dropdown = document.getElementById("search-results-dropdown");
  const resultsList = document.getElementById("search-results-list");

  const mobileSearchInput = document.getElementById("mobile-search");
  const mobileDropdown = document.getElementById("mobile-search-dropdown");
  const mobileResultsList = document.getElementById("mobile-search-list");

  async function fetchApiProducts(keyword) {
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      let apiProducts = [], apiSellers = [];
      if (Array.isArray(data)) {
        apiProducts = data;
      } else {
        if (Array.isArray(data.products)) apiProducts = data.products;
        if (Array.isArray(data.sellers)) apiSellers = data.sellers;
      }
      return {
        products: apiProducts.filter(p => p.id).map(p => ({
          id: p.id,
          name: p.name || p.product_name,
          code: p.code || "",
          source: p.source === "catalog" ? "catalog" : "database",
        })),
        sellers: apiSellers,
      };
    } catch {
      return { products: [], sellers: [] };
    }
  }

  async function getLocalProducts(keyword) {
    await northlineCatalogPromise;
    return (window.northlineProducts || [])
      .filter(p => p.name && p.name.toLowerCase().includes(keyword.toLowerCase()))
      .map(p => ({ ...p, source: "local" }));
  }

  function getMatchingStores(keyword, apiSellers = []) {
    const kw = keyword.toLowerCase();
    const matches = [];
    knownStores.forEach(s => {
      if (s.name.toLowerCase().includes(kw)) matches.push(s);
    });
    apiSellers.forEach(s => {
      if (s.store_name && s.store_name.toLowerCase().includes(kw)) {
        if (!matches.find(m => m.name === s.store_name)) {
          matches.push({ name: s.store_name, url: `/public/seller/${s.id}` });
        }
      }
    });
    return matches;
  }

  function renderResults(container, keyword, products, stores) {
    container.innerHTML = "";
    container.dataset.searchKw = keyword;
    let hasAny = false;

    stores.forEach(s => {
      container.insertAdjacentHTML("beforeend", renderStoreItem(s));
      hasAny = true;
    });

    if (products.length === 0 && !hasAny) {
      container.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">Produk tidak ditemukan</div>';
      return;
    }

    products.forEach(p => {
      container.insertAdjacentHTML("beforeend", renderSearchItem(p));
    });
  }

  function handleItemClick(e) {
    const storeLink = e.target.closest(".search-store-item");
    if (storeLink) return;

    const item = e.target.closest(".search-result-item");
    if (!item) return;
    const id = item.dataset.id;
    const code = item.dataset.code;
    const source = item.dataset.source;
    const ref = code || id;
    if ((source === "local" || source === "catalog") && typeof openProductDetail === "function") {
      openProductDetail(ref);
    } else if (typeof openProduct === "function") {
      openProduct(ref, source || "database");
    }
  }

  let searchTimeout;

  async function doSearch(keyword) {
    const local = await getLocalProducts(keyword);
    const api = await fetchApiProducts(keyword);
    const merged = mergeProducts(local, api.products);
    const stores = getMatchingStores(keyword, api.sellers);
    return { products: merged, stores };
  }

  function mergeProducts(local, api) {
    const map = new Map();
    local.forEach(p => map.set(`local-${p.id}`, p));
    api.forEach(p => map.set(`api-${p.id}`, p));
    const seen = new Set();
    const out = [];
    Array.from(map.values()).forEach(p => {
      const key = String(p.id);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    });
    return out;
  }

  function handleSearch(input, dropdownEl, resultsContainer, isMobile) {
    return async (e) => {
      const keyword = e.target.value.trim();
      clearTimeout(searchTimeout);

      if (!keyword) {
        dropdownEl.classList.add("hidden");
        return;
      }

      if (isMobile) {
        searchTimeout = setTimeout(async () => {
          dropdownEl.classList.remove("hidden");
          const { products, stores } = await doSearch(keyword);
          renderResults(resultsContainer, keyword, products, stores);
        }, 300);
      } else {
        dropdownEl.classList.remove("hidden");
        const { products, stores } = await doSearch(keyword);
        renderResults(resultsContainer, keyword, products, stores);
      }

      if (keyword.length >= 2) {
        scheduleAiRecommend(keyword).then(aiProducts => {
          renderAiSection(resultsContainer, keyword, aiProducts);
        });
      }
    };
  }

  if (searchInput && dropdown && resultsList) {
    searchInput.addEventListener("input", handleSearch(searchInput, dropdown, resultsList, false));
    resultsList.addEventListener("click", handleItemClick);

    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add("hidden");
      }
    });
  }

  if (mobileSearchInput && mobileDropdown && mobileResultsList) {
    mobileSearchInput.addEventListener("input", handleSearch(mobileSearchInput, mobileDropdown, mobileResultsList, true));
    mobileResultsList.addEventListener("click", handleItemClick);
  }

  document.querySelectorAll(".mobile-search-camera, .desktop-search-camera").forEach(btn => {
    const input = btn.classList.contains("mobile-search-camera")
      ? document.getElementById("mobile-search-camera-input")
      : document.getElementById("desktop-search-camera-input");
    btn.addEventListener("click", () => input?.click());
  });

  document.getElementById("mobile-search-camera-input")?.addEventListener("change", handleCameraSearch);
  document.getElementById("desktop-search-camera-input")?.addEventListener("change", handleCameraSearch);
});

async function handleCameraSearch(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const isMobile = e.target.id === "mobile-search-camera-input";
  const dropdown = document.getElementById(isMobile ? "mobile-search-dropdown" : "search-results-dropdown");
  const results = document.getElementById(isMobile ? "mobile-search-list" : "search-results-list");
  if (!dropdown || !results) {
    e.target.value = "";
    return;
  }

  dropdown.classList.remove("hidden");
  results.innerHTML = `
    <div class="p-4 text-center text-gray-600 text-sm flex items-center justify-center gap-3">
      <!-- Container Animasi -->
      <div class="relative w-6 h-6 flex items-center justify-center">
        
        <!-- 3 Dot Typing yang berubah jadi Spinner berputar -->
        <div class="absolute inset-0 flex items-center justify-center morph-loader">
          <span class="dot dot-1 bg-[#DF414F]"></span>
          <span class="dot dot-2 bg-[#DF414F]"></span>
          <span class="dot dot-3 bg-[#DF414F]"></span>
        </div>

      </div>

      <span>Sedang mencari produk serupa</span>
    </div>
  `;
  try {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      throw new Error(file.size > 5 * 1024 * 1024 ? "Ukuran gambar maksimal 5 MB." : "Pilih file gambar yang valid.");
    }
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/search/image", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Pencarian gambar gagal. Silakan coba lagi.");
    }
    if (!Array.isArray(data.products) || data.products.length === 0) {
      results.innerHTML = `<div class="p-4 text-center text-gray-500 text-sm">${escapeSearchHtml(data.message || "Produk yang cocok tidak ditemukan di katalog.")}</div>`;
      return;
    }

    results.innerHTML = '<div class="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[#DF414F] bg-[#fff5f5] flex items-center gap-1.5 border-b border-gray-100"><img src="https://img.icons8.com/?size=100&id=dQ0TcR10zyYB&format=png&color=DF414F" class="w-3 h-3" alt=""> Produk katalog paling mirip</div>';
    results.insertAdjacentHTML("beforeend", data.products.map(product => renderSearchItem(product, true)).join(""));
  } catch (err) {
    console.error(err);
    results.innerHTML = `<div class="p-4 text-center text-red-600 text-sm">${escapeSearchHtml(err.message || "Pencarian gambar gagal. Silakan coba lagi.")}</div>`;
  } finally {
    e.target.value = "";
  }
}

const placeholders = [
  "Northline Longsleeve & Shortsleeve Boxy 919 NRT - 24s Cotton Combed Kaos Boxy",
  "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
  "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
  "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
  "Northline Workshirt Zipper Black Boxy -  Workshirt Zipper Boxy",
  "Northline Longsleeve 111 White Boxy -  24s Cotton Combed Longsleeve White Boxy",
  "Northline Shortsleeve NORTNL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
  "Northline Afterall Boxy Work Shirt Zipper -  NORTNL Afterall Boxy Work Shirt Zipper",
  "Northline HOODIE NORTNL BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
  "Northline HOODIE NRT BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
  "Northline HOODIE NORTH AMERICAN BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
  "Northline ShortSleeve NORTH AMERICAN Style -  24s Cotton Combed Shortsleeve Black Boxy",
  "Northline HOODIE PINK STYLE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
  "Northline HOODIE NRL STYLE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ZIPPER VINTAGECLUB",
  "Northline Shortsleeve NRL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
  "Northline Shortsleeve NL White Boxy -  24s Cotton Combed Shortsleeve White Boxy"
];

const searchInput = document.getElementById("mobile-search");
const searchWrapper = document.getElementById("search-placeholder-wrapper");
const searchText = document.getElementById("search-placeholder-text");

if (searchWrapper) searchWrapper.classList.add("truncate", "max-w-full", "overflow-hidden", "pr-3");
if (searchText) searchText.classList.add("truncate");

let currentPlaceholder = 0;

setInterval(() => {
  if (!searchInput || !searchWrapper || !searchText) return;
  if (searchInput.value.trim() !== "") return;

  searchWrapper.style.transition = "all .25s ease";
  searchWrapper.style.transform = "translateY(-12px)";
  searchWrapper.style.opacity = "0";

  setTimeout(() => {
    currentPlaceholder = (currentPlaceholder + 1) % placeholders.length;
    searchText.textContent = placeholders[currentPlaceholder];
    searchWrapper.style.transition = "none";
    searchWrapper.style.transform = "translateY(12px)";
    searchWrapper.style.opacity = "0";

    requestAnimationFrame(() => {
      searchWrapper.style.transition = "all .25s ease";
      searchWrapper.style.transform = "translateY(0)";
      searchWrapper.style.opacity = "1";
    });
  }, 250);
}, 2500);

searchInput.addEventListener("input", () => {
  searchWrapper.style.display = searchInput.value.trim() ? "none" : "flex";
});

const desktopPlaceholders = [
  "Northline Longsleeve & Shortsleeve Boxy 919 NRT - 24s Cotton Combed Kaos Boxy",
  "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
  "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
  "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy",
  "Northline Workshirt Zipper Black Boxy -  Workshirt Zipper Boxy",
  "Northline Longsleeve 111 White Boxy -  24s Cotton Combed Longsleeve White Boxy",
  "Northline Shortsleeve NORTNL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
  "Northline Afterall Boxy Work Shirt Zipper -  NORTNL Afterall Boxy Work Shirt Zipper",
  "Northline HOODIE NORTNL BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY ...",
  "Northline HOODIE NRT BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ...",
  "Northline HOODIE NORTH AMERICAN BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY ...",
  "Northline ShortSleeve NORTH AMERICAN Style -  24s Cotton Combed Shortsleeve Black Boxy",
  "Northline HOODIE PINK STYLE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ...",
  "Northline HOODIE NRL STYLE BOXY DOUBLE ZIPPER VINTAGECLUB -  NORTNL HOODIE BOXY DOUBLE ...",
  "Northline Shortsleeve NRL White Boxy -  24s Cotton Combed Shortsleeve White Boxy",
  "Northline Shortsleeve NL White Boxy -  24s Cotton Combed Shortsleeve White Boxy"
];

const desktopInput = document.getElementById("main-search");
const desktopWrapper = document.getElementById("desktop-placeholder-wrapper");
const desktopText = document.getElementById("desktop-placeholder-text");

if (desktopWrapper) desktopWrapper.classList.add("truncate", "max-w-full", "overflow-hidden", "pr-10");
if (desktopText) desktopText.classList.add("truncate");

let desktopIndex = 0;

setInterval(() => {
  if (!desktopInput || !desktopWrapper || !desktopText) return;
  if (desktopInput.value.trim() !== "") return;

  desktopWrapper.style.transition = "all .25s ease";
  desktopWrapper.style.transform = "translateY(-12px)";
  desktopWrapper.style.opacity = "0";

  setTimeout(() => {
    desktopIndex = (desktopIndex + 1) % desktopPlaceholders.length;
    desktopText.textContent = desktopPlaceholders[desktopIndex];
    desktopWrapper.style.transition = "none";
    desktopWrapper.style.transform = "translateY(12px)";
    desktopWrapper.style.opacity = "0";

    requestAnimationFrame(() => {
      desktopWrapper.style.transition = "all .25s ease";
      desktopWrapper.style.transform = "translateY(0)";
      desktopWrapper.style.opacity = "1";
    });
  }, 250);
}, 2500);

desktopInput.addEventListener("input", () => {
  desktopWrapper.style.display = desktopInput.value.trim() ? "none" : "flex";
});
