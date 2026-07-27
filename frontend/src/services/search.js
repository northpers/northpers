const knownStores = [
  { name: "Northline", url: "nrtStore.html" },
];

window.northlineProducts = [
  { id: 1, name: "Northline Longsleeve & Shortsleeve Boxy 919 NRT - 24s Cotton Combed Kaos Boxy" },
  { id: 2, name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy" },
  { id: 3, name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy" },
  { id: 4, name: "Northline Longsleeve & Shortsleeve Boxy - 24s Cotton Combed Kaos Boxy" },
  { id: 5, name: "Northline Workshirt Zipper Black Boxy - Workshirt Zipper Boxy" },
  { id: 6, name: "Northline Hoodie double zipper Black Boxy - 24s Cotton Combed Hoodie Boxy" },
  { id: 7, name: "Northline Exclusive Sweater Boxy - 24s Cotton Combed Sweater Boxy" },
  { id: 8, name: "Northline 919 NRT Exclusive - Special Edition Kaos Boxy 919 NRT TEAL" },
  { id: 9, name: "Northline Longsleeve Boxy 919 NRT - Kaos Boxy 919 NRT Maroon" },
];

function renderSearchItem(product) {
  const name = product.name || product.product_name || "";
  return `
    <div class="search-result-item px-3 py-2.5 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-sm text-gray-700 truncate"
      data-id="${product.id}"
      data-source="${product.source || 'local'}">
      ${name} ...
    </div>
  `;
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
          source: "database",
        })),
        sellers: apiSellers,
      };
    } catch {
      return { products: [], sellers: [] };
    }
  }

  function getLocalProducts(keyword) {
    return (window.northlineProducts || [])
      .filter(p => p.name.toLowerCase().includes(keyword.toLowerCase()))
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

  function renderResults(container, products, stores) {
    container.innerHTML = "";
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
    const source = item.dataset.source;
    if (source === "local" && typeof openProductDetail === "function") {
      openProductDetail(id);
    } else if (typeof openProduct === "function") {
      openProduct(id, source || "database");
    }
  }

  let searchTimeout;

  async function doSearch(keyword) {
    const local = getLocalProducts(keyword);
    const api = await fetchApiProducts(keyword);
    const merged = mergeProducts(local, api.products);
    const stores = getMatchingStores(keyword, api.sellers);
    return { products: merged, stores };
  }

  function mergeProducts(local, api) {
    const map = new Map();
    local.forEach(p => map.set(`local-${p.id}`, p));
    api.forEach(p => map.set(`api-${p.id}`, p));
    return Array.from(map.values());
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
          renderResults(resultsContainer, products, stores);
        }, 300);
      } else {
        dropdownEl.classList.remove("hidden");
        const { products, stores } = await doSearch(keyword);
        renderResults(resultsContainer, products, stores);
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
  try {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/upload-search-image", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      const fullUrl = window.location.origin + data.url;
      window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(fullUrl)}`, "_blank");
    }
  } catch (err) {
    console.error(err);
  }
  e.target.value = "";
}

const placeholders = [
  "PC Gaming Murah", "Rakit Computer Gaming", "iPhone 17 Pro Max",
  "Sepatu Running Pria", "Tas Wanita Premium", "Keyboard Mechanical",
  "Jersey Timnas Indonesia", "Skincare Original", "Smart TV 55 Inch",
  "Northline LongSleeve Boxy", "Northline ShortSleeve Boxy",
];

const searchInput = document.getElementById("mobile-search");
const searchWrapper = document.getElementById("search-placeholder-wrapper");
const searchText = document.getElementById("search-placeholder-text");

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
  "PC Gaming Murah", "Rakit Computer Gaming", "iPhone 17 Pro Max",
  "Sepatu Running Pria", "Tas Wanita Premium", "Keyboard Mechanical",
  "Jersey Timnas Indonesia", "Skincare Original", "Smart TV 55 Inch",
  "Northline LongSleeve Boxy", "Northline ShortSleeve Boxy",
];

const desktopInput = document.getElementById("main-search");
const desktopWrapper = document.getElementById("desktop-placeholder-wrapper");
const desktopText = document.getElementById("desktop-placeholder-text");

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
