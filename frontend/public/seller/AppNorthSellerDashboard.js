function toggleMenu(menuId, arrowId) {
  const menu = document.getElementById(menuId);
  const arrow = document.getElementById(arrowId);
  if (!menu) return;
  const isHidden = menu.classList.contains("hidden");
  if (isHidden) {
    menu.classList.remove("hidden");
    if (arrow) arrow.style.transform = "rotate(180deg)";
  } else {
    menu.classList.add("hidden");
    if (arrow) arrow.style.transform = "rotate(0deg)";
  }
}

function showIosModal(title, message) {
  const modal = document.getElementById("ios-modal");
  if (!modal) return;
  const titleEl = document.getElementById("ios-modal-title");
  const msgEl = document.getElementById("ios-modal-message");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message || "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeIosModal() {
  const modal = document.getElementById("ios-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function toggleNotifPopup() {
  const popup = document.getElementById("notif-popup");
  if (!popup) return;
  const isVisible = popup.classList.contains("visible");
  if (isVisible) {
    popup.classList.remove("visible");
    popup.classList.add("invisible");
    popup.style.opacity = "0";
  } else {
    popup.classList.remove("invisible");
    popup.classList.add("visible");
    popup.style.opacity = "1";
    loadNotifHistory();
  }
}

let _notifCacheMobile = null;

function toggleNotifPopupMobile() {
  const popup = document.getElementById("notif-popup-mobile");
  if (!popup) return;
  const isVisible = popup.classList.contains("visible");
  if (isVisible) {
    popup.classList.remove("visible");
    popup.classList.add("invisible");
    popup.style.opacity = "0";
  } else {
    popup.classList.remove("invisible");
    popup.classList.add("visible");
    popup.style.opacity = "1";
    loadNotifHistoryMobile();
  }
}

async function loadNotifHistoryMobile() {
  const list = document.getElementById("notif-popup-list-mobile");
  if (!list) return;
  if (_notifCacheMobile !== null) {
    renderNotifListMobile(list, _notifCacheMobile);
    return;
  }
  try {
    const res = await fetch("/api/notifications", { credentials: "include" });
    const notifs = await res.json();
    if (!Array.isArray(notifs) || notifs.length === 0) {
      list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Tidak ada notifikasi</p>';
      _notifCacheMobile = [];
      return;
    }
    _notifCacheMobile = notifs;
    renderNotifListMobile(list, notifs);
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Gagal memuat notifikasi</p>';
  }
}

function renderNotifListMobile(list, notifs) {
  list.innerHTML = notifs
    .map(function (n) {
      const date = new Date(n.created_at || n.createdAt || "");
      const timeStr = isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) +
          " " +
          date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      return '<div class="border-b border-gray-100 py-2 last:border-0">' +
        '<p class="text-xs font-medium text-gray-800">' + esc(n.title || "") + "</p>" +
        '<p class="text-[10px] text-gray-500 leading-tight">' + esc(n.message || "") + "</p>" +
        '<p class="text-[10px] text-gray-400 mt-1">' + timeStr + "</p>" +
        "</div>";
    })
    .join("");
}

async function loadNotifHistory() {
  const list = document.getElementById("notif-popup-list");
  if (!list) return;
  try {
    const res = await fetch("/api/notifications", { credentials: "include" });
    const notifs = await res.json();
    if (!Array.isArray(notifs) || notifs.length === 0) {
      list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Tidak ada notifikasi</p>';
      return;
    }
    list.innerHTML = notifs
      .map(function (n) {
        const date = new Date(n.created_at || n.createdAt || "");
        const timeStr = isNaN(date.getTime())
          ? ""
          : date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) +
            " " +
            date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        return '<div class="border-b border-gray-100 py-2 last:border-0">' +
          '<p class="text-xs font-medium text-gray-800">' + esc(n.title || "") + "</p>" +
          '<p class="text-[10px] text-gray-500 leading-tight">' + esc(n.message || "") + "</p>" +
          '<p class="text-[10px] text-gray-400 mt-1">' + timeStr + "</p>" +
          "</div>";
      })
      .join("");
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Gagal memuat notifikasi</p>';
  }
}

function formatRupiah(n) {
  return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function generateRandomCode(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function goTo(page) {
  if (typeof loadSellerPage === "function") {
    loadSellerPage(page);
  }
}

function toggleMobileNav() {
  const defaultNav = document.getElementById("mobile-nav-default");
  const expandedNav = document.getElementById("mobile-nav-expanded");
  const arrow = document.getElementById("mobile-nav-arrow");
  const label = document.getElementById("mobile-nav-expand-label");
  if (!defaultNav || !expandedNav) return;
  const isExpanded = !expandedNav.classList.contains("hidden");
  if (isExpanded) {
    expandedNav.classList.add("hidden");
    if (arrow) arrow.style.transform = "rotate(0deg)";
    if (label) label.textContent = "Tampilkan semua menu";
  } else {
    expandedNav.classList.remove("hidden");
    if (arrow) arrow.style.transform = "rotate(180deg)";
    if (label) label.textContent = "Tampilkan lebih sedikit";
  }
}

function loadSellerPage(page) {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  const main = document.getElementById("seller-main");
  if (main) main.scrollTop = 0;

  if (page === "dashboard") {
    renderDashboard();
    return;
  }
  if (page === "my-products") {
    loadMyProducts();
    return;
  }
  if (page === "add-product") {
    content.innerHTML = getAddProductPage();
    return;
  }
  if (page === "blocked-products") {
    loadBlockedProducts();
    return;
  }
  if (page === "pesanan" || page === "pesanan-saya") {
    renderOrdersPage("all");
    return;
  }
  if (page === "pembatalan") {
    renderOrdersPage("cancelled");
    return;
  }
  if (page === "retur") {
    renderReturnsPage();
    return;
  }
  if (page === "pengiriman" || page === "pengiriman-saya") {
    renderShippingPage();
    return;
  }
  if (page === "atur-resi") {
    renderAturResiPage();
    return;
  }
  if (page === "mass-ship") {
    renderMassShipPage();
    return;
  }
  if (page === "pengaturan-pengiriman") {
    renderShippingSettingsPage();
    return;
  }
  if (page === "keuangan" || page === "penghasilan") {
    renderFinancePage();
    return;
  }
  if (page === "saldo") {
    renderSaldoPage();
    return;
  }
  if (page === "rekening-bank") {
    renderBankPage();
    return;
  }
  if (page === "setting") {
    renderSettingsPage();
    return;
  }
  renderDashboard();
}

async function loadSellerProfile() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) {
      window.location.href = "/seller/AppNorthSellerRegister";
      return;
    }
    const data = await res.json();
    if (!data.success || !data.user) {
      window.location.href = "/seller/AppNorthSellerRegister";
      return;
    }
    const user = data.user;
    const isSeller = user.seller === 1 || user.seller === true;
    if (!isSeller) {
      window.location.href = "/seller/AppNorthSellerRegister";
      return;
    }
    _sellerUser = user;
    const sellerRes = await fetch("/api/seller/status/" + user.id, { credentials: "include" });
    const sellerData = await sellerRes.json();
    if (sellerData.success && sellerData.seller && sellerData.seller.store_slug) {
      const code = generateRandomCode(6);
      const newUrl = "/seller/AppNorthSellerDashboard/" + sellerData.seller.store_slug + "-" + code;
      if (window.location.pathname !== newUrl) {
        window.history.pushState({ storeSlug: sellerData.seller.store_slug, code: code }, "", newUrl);
      }
    }
    const nameEl = document.getElementById("seller-profile-name");
    const usernameEl = document.getElementById("seller-profile-username");
    const logoEl = document.getElementById("seller-profile-logo");
    const mNameEl = document.getElementById("mobile-profile-name");
    const mUsernameEl = document.getElementById("mobile-profile-username");
    const mLogoEl = document.getElementById("mobile-profile-logo");
    if (nameEl) nameEl.textContent = user.name || "Seller";
    if (usernameEl) usernameEl.textContent = "@" + (user.username || "seller");
    if (logoEl && user.avatar) {
      logoEl.src = user.avatar.startsWith("data:")
        ? user.avatar
        : user.avatar.startsWith("/")
        ? user.avatar
        : "/public/icons/" + user.avatar;
    }
    if (mNameEl) mNameEl.textContent = user.name || "Seller";
    if (mUsernameEl) mUsernameEl.textContent = "@" + (user.username || "seller");
    if (mLogoEl && user.avatar) {
      mLogoEl.src = user.avatar.startsWith("data:")
        ? user.avatar
        : user.avatar.startsWith("/")
        ? user.avatar
        : "/public/icons/" + user.avatar;
    }
    loadSellerPage("dashboard");
  } catch (err) {
    console.error("Failed to load seller profile:", err);
    window.location.href = "/seller/AppNorthSellerRegister";
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadSellerProfile();
});

document.addEventListener("click", function (e) {
  const popup = document.getElementById("notif-popup");
  const popupMobile = document.getElementById("notif-popup-mobile");
  const btn = e.target.closest("button[onclick*='toggleNotifPopup']");
  const btnMobile = e.target.closest("button[onclick*='toggleNotifPopupMobile']");
  
  if (popup && !popup.contains(e.target) && !btn) {
    popup.classList.add("invisible");
    popup.classList.remove("visible");
    popup.style.opacity = "0";
  }
  
  if (popupMobile && !popupMobile.contains(e.target) && !btnMobile) {
    popupMobile.classList.add("invisible");
    popupMobile.classList.remove("visible");
    popupMobile.style.opacity = "0";
  }
});

/* ==================== DASHBOARD ==================== */

let _dashboardChart = null;

async function renderDashboard() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;

  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat dashboard...</div></div>';

  if (!_sellerUser) {
    await _initSellerUser();
  }
  const uid = _sellerUser?.id;
  if (!uid) return;

  try {
    const res = await fetch("/api/seller/dashboard/" + uid, {
      credentials: "include",
    });
    const data = await res.json();
    if (!data.success) {
      content.innerHTML =
        '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat dashboard</div></div>';
      return;
    }

    const s = data.stats || {};
    const store = data.seller || {};
    const todayRevenue = s.todayRevenue || 0;
    const todayOrders = s.todayOrders || 0;
    const totalRevenue = s.totalRevenue || 0;
    const pendingOrders = s.pendingOrders || 0;
    const totalProducts = s.totalProducts || 0;
    const lowStockCount = s.lowStockCount || 0;

    content.innerHTML = `
      <div class="space-y-4">

        <div class="bg-white border">
          <div class="p-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b">
            <div>
              <div class="flex items-center gap-3">
                <img src="${esc(store.logo_url || "https://nl.hostinesia.my.id/public/icons/nliconblack.png")}"
                  class="w-11 h-11 border object-cover"
                  onerror="this.onerror=null;this.src='https://nl.hostinesia.my.id/public/icons/nliconblack.png'" />
                <div>
                  <h1 class="text-lg font-bold text-gray-800">${esc(store.store_name || "Toko Saya")}</h1>
                  <p class="text-xs text-gray-400">Selamat datang kembali di Pusat Seller Northline</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 bg-[#DF414F] text-white">${esc((store.status || "active").toUpperCase())}</span>
              <button onclick="loadSellerPage('my-products')" class="border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Kelola Produk</button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Penghasilan Hari Ini</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(todayRevenue)}</div>
            <div class="text-[11px] text-gray-400 mt-1">${todayOrders} pesanan hari ini</div>
          </div>
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Total Penghasilan</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(totalRevenue)}</div>
            <div class="text-[11px] text-gray-400 mt-1">${s.totalOrders || 0} total pesanan</div>
          </div>
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Total Produk</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${totalProducts}</div>
            <div class="text-[11px] text-gray-400 mt-1">${lowStockCount} stok menipis</div>
          </div>
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Pesanan Perlu Diproses</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${pendingOrders}</div>
            <div class="text-[11px] text-gray-400 mt-1">${s.processingOrders || 0} sedang diproses</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="bg-white border lg:col-span-2">
            <div class="px-5 py-4 border-b flex items-center justify-between">
              <h3 class="font-semibold text-gray-800">Performa Penjualan</h3>
              <div class="flex items-center gap-1">
                <button id="chart-range-7" onclick="setChartRange(7)" class="text-[11px] px-2 py-1 bg-[#DF414F] text-white">7 Hari</button>
                <button id="chart-range-30" onclick="setChartRange(30)" class="text-[11px] px-2 py-1 text-gray-500 hover:bg-gray-100">30 Hari</button>
              </div>
            </div>
            <div class="p-5">
              <canvas id="revenue-chart" height="110"></canvas>
            </div>
          </div>

          <div class="space-y-4">
            <div class="bg-white border">
              <div class="px-5 py-4 border-b">
                <h3 class="font-semibold text-gray-800">Status Pesanan</h3>
              </div>
              <div class="p-4 space-y-2">
                ${renderOrderStatusChips(data.orderStatusCounts || [])}
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white border">
            <div class="px-5 py-4 border-b flex items-center justify-between">
              <h3 class="font-semibold text-gray-800">Produk Terlaris</h3>
              <button onclick="loadSellerPage('my-products')" class="text-[11px] text-[#DF414F] hover:underline">Lihat Semua</button>
            </div>
            ${renderTopProducts((data.topProducts || []).slice(0, 5))}
          </div>

          <div class="bg-white border">
            <div class="px-5 py-4 border-b flex items-center justify-between">
              <h3 class="font-semibold text-gray-800">Pesanan Terbaru</h3>
              <button onclick="loadSellerPage('pesanan-saya')" class="text-[11px] text-[#DF414F] hover:underline">Lihat Semua</button>
            </div>
            ${renderRecentOrders((data.recentOrders || []).slice(0, 5))}
          </div>
        </div>

      </div>
    `;

    const chartData = buildChartData(data.revenueByDay || {}, 7);
    drawRevenueChart(chartData.labels, chartData.values);
    window._sellerChartRange = 7;
  } catch (err) {
    console.error("Dashboard error:", err);
    content.innerHTML =
      '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat dashboard</div></div>';
  }
}

function renderOrderStatusChips(list) {
  const defs = [
    { key: "pending", label: "Menunggu", color: "#f59e0b" },
    { key: "success", label: "Selesai", color: "#10b981" },
    { key: "cancelled", label: "Dibatalkan", color: "#ef4444" },
  ];
  const map = {};
  list.forEach((r) => {
    const k = r.status === "success" && r.delivery_status ? r.delivery_status : r.status;
    map[k] = (map[k] || 0) + Number(r.count || 0);
  });
  return defs
    .map((d) => {
      const count = map[d.key] || 0;
      return `
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2" style="background:${d.color}"></span>
            <span class="text-xs text-gray-600">${d.label}</span>
          </div>
          <span class="text-xs font-semibold text-gray-800">${count}</span>
        </div>
      `;
    })
    .join("");
}

function renderTopProducts(products) {
  if (!products.length) {
    return emptyBox("Belum ada produk. Tambahkan produk pertama Anda.", "loadSellerPage('my-products')");
  }
  return `
    <div class="divide-y">
      ${products
        .map(
          (p, i) => `
        <div class="flex items-center gap-3 px-5 py-3">
          <span class="text-xs text-gray-400 w-4">${i + 1}</span>
          <img src="/uploads/product/${esc(p.thumbnail || "")}" class="w-10 h-10 border object-cover"
            onerror="this.onerror=null;this.src='https://img.icons8.com/?size=100&id=8440&format=png&color=000000'" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-gray-800 truncate">${esc(p.name)}</div>
            <div class="text-[11px] text-gray-400">${p.sold || 0} terjual · ${p.stock || 0} stok</div>
          </div>
          <div class="text-xs font-semibold text-gray-800">${formatRupiah(p.revenue || 0)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderRecentOrders(orders) {
  if (!orders.length) {
    return emptyBox("Belum ada pesanan masuk.", "loadSellerPage('pesanan-saya')");
  }
  return `
    <div class="divide-y">
      ${orders
        .map(
          (o) => `
        <div class="flex items-center gap-3 px-5 py-3">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-gray-800 truncate">${esc(o.product_name)}</div>
            <div class="text-[11px] text-gray-400">${esc(o.order_id)} · ${esc(o.buyer_name || "Pembeli")}</div>
          </div>
          <div class="text-right">
            <div class="text-xs font-semibold text-gray-800">${formatRupiah(o.total_price)}</div>
            <div class="text-[10px] text-gray-400">${esc(o.delivery_status || o.status)}</div>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function emptyBox(text, action) {
  return `
    <div class="p-10 text-center">
      <img src="https://img.icons8.com/?size=100&id=8502&format=png&color=9CA3AF" class="w-10 h-10 mx-auto mb-2" />
      <p class="text-xs text-gray-400 mb-3">${text}</p>
      ${action ? `<button onclick="${action}" class="border px-3 py-1.5 text-xs text-[#DF414F] hover:bg-gray-50">Mulai</button>` : ""}
    </div>
  `;
}

function buildChartData(byDay, range) {
  const arr = byDay["last" + range] || [];
  const map = {};
  arr.forEach((r) => {
    const d = new Date(r.day + "T00:00:00");
    const key =
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    map[key] = Number(r.revenue) || 0;
  });
  const labels = [];
  const values = [];
  const today = new Date();
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key =
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    labels.push(String(d.getDate()) + "/" + String(d.getMonth() + 1));
    values.push(map[key] || 0);
  }
  return { labels, values };
}

function setChartRange(range) {
  window._sellerChartRange = range;
  document.getElementById("chart-range-7")?.classList.remove("bg-[#DF414F]", "text-white");
  document.getElementById("chart-range-30")?.classList.remove("bg-[#DF414F]", "text-white");
  const btn = document.getElementById("chart-range-" + range);
  if (btn) btn.classList.add("bg-[#DF414F]", "text-white");
  const labels = window._sellerChartLabels || [];
  const values = window._sellerChartValues || [];
  if (range === 7 && window._sellerChartAllLabels7) {
    drawRevenueChart(window._sellerChartAllLabels7, window._sellerChartAllValues7);
  } else if (range === 30 && window._sellerChartAllLabels30) {
    drawRevenueChart(window._sellerChartAllLabels30, window._sellerChartAllValues30);
  } else {
    drawRevenueChart(labels, values);
  }
}

function drawRevenueChart(labels, values) {
  const canvas = document.getElementById("revenue-chart");
  if (!canvas || typeof Chart === "undefined") return;
  if (_dashboardChart) {
    _dashboardChart.destroy();
  }
  const ctx = canvas.getContext("2d");
  const isDark = values.every((v) => v === 0);
  _dashboardChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Pendapatan",
          data: values,
          borderColor: "#DF414F",
          backgroundColor: "rgba(223,65,79,0.10)",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#DF414F",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return " " + formatRupiah(c.parsed.y);
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          grid: { color: "#f0f0f0" },
          ticks: {
            font: { size: 10 },
            callback: function (v) {
              if (v >= 1000000) return (v / 1000000).toFixed(1) + "jt";
              if (v >= 1000) return (v / 1000).toFixed(0) + "rb";
              return v;
            },
          },
        },
      },
    },
  });
}

/* ==================== PESANAN ==================== */

let _ordersFilter = "all";
let _ordersSearch = "";

async function renderOrdersPage(defaultFilter) {
  if (defaultFilter) _ordersFilter = defaultFilter;
  const content = document.getElementById("seller-main-content");
  if (!content) return;

  content.innerHTML = `
    <div class="bg-white border">
      <div class="px-5 py-4 border-b">
        <h2 class="font-bold text-gray-800">${_ordersFilter === "cancelled" ? "Pembatalan" : "Pesanan"}</h2>
        <p class="text-xs text-gray-400">${_ordersFilter === "cancelled" ? "Daftar pesanan yang dibatalkan" : "Kelola semua pesanan masuk"}</p>
      </div>
      <div class="px-5 py-3 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex flex-wrap gap-1">
          ${_ordersFilter === "cancelled"
            ? `<button id="order-filt-cancelled" class="text-[11px] px-3 py-1.5 border bg-[#DF414F] text-white border-[#DF414F]">Dibatalkan</button>`
            : `${
            ["all", "pending", "processing", "shipped", "completed", "cancelled"]
              .map(
                ([k, l]) =>
                  `<button onclick="setOrdersFilter('${k}')" id="order-filt-${k}"
                    class="text-[11px] px-3 py-1.5 border ${
                      _ordersFilter === k ? "bg-[#DF414F] text-white border-[#DF414F]" : "text-gray-500 hover:bg-gray-50"
                    }">${l}</button>`,
              )
              .join("")
          }`}
        </div>
        <input id="order-search" value="${esc(_ordersSearch)}"
          oninput="setOrdersSearch(this.value)"
          placeholder="Cari order / produk / pembeli"
          class="border px-3 py-1.5 text-xs w-full md:w-64" />
      </div>
      <div id="order-list" class="p-5">
        <div class="text-center text-gray-400 text-xs py-12">Memuat pesanan...</div>
      </div>
    </div>
  `;
  loadOrders();
}

function setOrdersFilter(filter) {
  _ordersFilter = filter;
  renderOrdersPage();
}

function setOrdersSearch(q) {
  _ordersSearch = q;
  loadOrders();
}

async function loadOrders() {
  const list = document.getElementById("order-list");
  if (!list) return;
  if (!_sellerUser) await _initSellerUser();
  const uid = _sellerUser?.id;
  if (!uid) return;

  try {
    const params = new URLSearchParams({ status: _ordersFilter });
    if (_ordersSearch) params.set("search", _ordersSearch);
    const res = await fetch("/api/seller/orders/" + uid + "?" + params.toString(), {
      credentials: "include",
    });
    const data = await res.json();
    if (!data.success) {
      list.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Gagal memuat pesanan</div>';
      return;
    }
    if (!data.orders.length) {
      list.innerHTML =
        '<div class="text-center text-gray-400 text-xs py-16">Tidak ada pesanan</div>';
      return;
    }
    list.innerHTML = `
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-400 border-b">
              <th class="py-2 pr-4 font-medium">Order</th>
              <th class="py-2 pr-4 font-medium">Produk</th>
              <th class="py-2 pr-4 font-medium">Pembeli</th>
              <th class="py-2 pr-4 font-medium">Total</th>
              <th class="py-2 pr-4 font-medium">Status</th>
              <th class="py-2 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${data.orders
              .map(
                (o) => `
              <tr>
                <td class="py-3 pr-4">
                  <div class="font-medium text-gray-800">${esc(o.order_id)}</div>
                  <div class="text-[10px] text-gray-400">${esc((o.created_at || "").replace("T", " ").slice(0, 16))}</div>
                </td>
                <td class="py-3 pr-4">
                  <div class="flex items-center gap-2">
                    <img src="/uploads/product/${esc(o.product_image || "")}" class="w-8 h-8 border object-cover"
                      onerror="this.onerror=null;this.src='https://img.icons8.com/?size=100&id=8440&format=png&color=000000'" />
                    <div class="min-w-0 max-w-[180px]">
                      <div class="truncate">${esc(o.product_name)}</div>
                      <div class="text-[10px] text-gray-400">x${o.quantity || 1}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3 pr-4">
                  <div class="text-gray-800">${esc(o.buyer_name || "Pembeli")}</div>
                  <div class="text-[10px] text-gray-400">@${esc(o.buyer_username || "-")}</div>
                </td>
                <td class="py-3 pr-4 font-semibold text-gray-800">${formatRupiah(o.total_price)}</td>
                <td class="py-3 pr-4">
                  <span class="text-[10px] px-2 py-1 bg-gray-100 text-gray-600">${esc(o.delivery_status || o.status)}</span>
                </td>
                <td class="py-3">
                  <button onclick="openOrderModal('${esc(o.order_id)}', '${esc(o.delivery_status || o.status)}')"
                    class="border px-3 py-1.5 text-[#DF414F] hover:bg-gray-50">Ubah Status</button>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="md:hidden space-y-3">
        ${data.orders
          .map(
            (o) => `
          <div class="border p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-medium text-gray-800 text-xs">${esc(o.order_id)}</div>
              <span class="text-[10px] px-2 py-1 bg-gray-100 text-gray-600">${esc(o.delivery_status || o.status)}</span>
            </div>
            <div class="flex items-center gap-2 mb-2">
              <img src="/uploads/product/${esc(o.product_image || "")}" class="w-10 h-10 border object-cover"
                onerror="this.onerror=null;this.src='https://img.icons8.com/?size=100&id=8440&format=png&color=000000'" />
              <div class="min-w-0">
                <div class="text-xs font-medium text-gray-800 truncate">${esc(o.product_name)}</div>
                <div class="text-[10px] text-gray-400">x${o.quantity || 1} • ${esc(o.buyer_name || "Pembeli")}</div>
              </div>
            </div>
            <div class="flex items-center justify-between mt-2 pt-2 border-t">
              <div>
                <div class="text-xs font-bold text-gray-800">${formatRupiah(o.total_price)}</div>
                <div class="text-[10px] text-gray-400">${esc((o.created_at || "").replace("T", " ").slice(0, 16))}</div>
              </div>
              <button onclick="openOrderModal('${esc(o.order_id)}', '${esc(o.delivery_status || o.status)}')"
                class="border px-3 py-1.5 text-xs text-[#DF414F] hover:bg-gray-50">Ubah Status</button>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  } catch (err) {
    list.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Gagal memuat pesanan</div>';
  }
}

function openOrderModal(orderId, currentStatus) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center";
  overlay.id = "order-modal-overlay";
  const statuses = [
    "Pesanan Diproses",
    "Pesanan Dikirim",
    "Pesanan Diterima",
    "Selesai",
    "Pesanan Dibatalkan",
  ];
  overlay.innerHTML = `
    <div class="bg-white w-full max-w-sm mx-4">
      <div class="px-5 py-4 border-b flex items-center justify-between">
        <h3 class="font-semibold text-gray-800">Ubah Status Pengiriman</h3>
        <button onclick="document.getElementById('order-modal-overlay').remove()" class="text-gray-400 hover:text-gray-600">&times;</button>
      </div>
      <div class="p-5 space-y-2">
        <div class="text-xs text-gray-400 mb-2">Order: <span class="text-gray-700 font-medium">${esc(orderId)}</span></div>
        ${statuses
          .map(
            (s) => `
          <button onclick="updateDelivery('${esc(orderId)}', '${esc(s)}')"
            class="w-full text-left px-3 py-2 border text-xs ${
              s === currentStatus ? "bg-[#DF414F] text-white border-[#DF414F]" : "text-gray-600 hover:bg-gray-50"
            }">${s}</button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function updateDelivery(orderId, status) {
  try {
    const res = await fetch("/api/seller/order/" + encodeURIComponent(orderId) + "/delivery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ delivery_status: status }),
    });
    const data = await res.json();
    document.getElementById("order-modal-overlay")?.remove();
    if (data.success) {
      showIosModal("Berhasil", "Status pengiriman diperbarui.");
      renderOrdersPage();
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat mengubah status.");
    }
  } catch (err) {
    document.getElementById("order-modal-overlay")?.remove();
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

/* ==================== PENGIRIMAN ==================== */

async function renderShippingPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;

  content.innerHTML = `
    <div class="bg-white border">
      <div class="px-5 py-4 border-b">
        <h2 class="font-bold text-gray-800">Pengiriman</h2>
        <p class="text-xs text-gray-400">Atur pengiriman pesanan Anda</p>
      </div>
      <div id="shipping-list" class="p-5">
        <div class="text-center text-gray-400 text-xs py-12">Memuat pengiriman...</div>
      </div>
    </div>
  `;
  loadShipping();
}

async function loadShipping() {
  const list = document.getElementById("shipping-list");
  if (!list) return;
  if (!_sellerUser) await _initSellerUser();
  const uid = _sellerUser?.id;
  if (!uid) return;

  try {
    const res = await fetch("/api/seller/orders/" + uid + "?status=all", {
      credentials: "include",
    });
    const data = await res.json();
    if (!data.success || !data.orders.length) {
      list.innerHTML =
        '<div class="text-center text-gray-400 text-xs py-16">Tidak ada pesanan untuk dikirim</div>';
      return;
    }
    const statuses = ["Pesanan Diproses", "Pesanan Dikirim", "Pesanan Diterima", "Selesai"];
    list.innerHTML = `
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-400 border-b">
              <th class="py-2 pr-4 font-medium">Order</th>
              <th class="py-2 pr-4 font-medium">Produk</th>
              <th class="py-2 pr-4 font-medium">Pembeli</th>
              <th class="py-2 pr-4 font-medium">Status</th>
              <th class="py-2 font-medium">Ubah Status</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${data.orders
              .map(
                (o) => `
              <tr>
                <td class="py-3 pr-4 font-medium text-gray-800">${esc(o.order_id)}</td>
                <td class="py-3 pr-4">
                  <div class="flex items-center gap-2">
                    <img src="/uploads/product/${esc(o.product_image || "")}" class="w-8 h-8 border object-cover"
                      onerror="this.onerror=null;this.src='https://img.icons8.com/?size=100&id=8440&format=png&color=000000'" />
                    <div class="min-w-0 max-w-[180px] truncate">${esc(o.product_name)}</div>
                  </div>
                </td>
                <td class="py-3 pr-4">
                  <div class="text-gray-800">${esc(o.buyer_name || "Pembeli")}</div>
                  <div class="text-[10px] text-gray-400 truncate max-w-[180px]">${esc(o.shipping_address || "-")}</div>
                </td>
                <td class="py-3 pr-4"><span class="text-[10px] px-2 py-1 bg-gray-100 text-gray-600">${esc(o.delivery_status || o.status)}</span></td>
                <td class="py-3">
                  <select onchange="updateShippingStatus('${esc(o.order_id)}', this.value)"
                    class="border px-2 py-1.5 text-xs bg-white">
                    ${statuses
                      .map(
                        (s) =>
                          `<option value="${s}" ${s === (o.delivery_status || o.status) ? "selected" : ""}>${s}</option>`,
                      )
                      .join("")}
                  </select>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="md:hidden space-y-3">
        ${data.orders
          .map(
            (o) => `
          <div class="border p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-medium text-gray-800 text-xs">${esc(o.order_id)}</div>
              <span class="text-[10px] px-2 py-1 bg-gray-100 text-gray-600">${esc(o.delivery_status || o.status)}</span>
            </div>
            <div class="flex items-center gap-2 mb-2">
              <img src="/uploads/product/${esc(o.product_image || "")}" class="w-10 h-10 border object-cover"
                onerror="this.onerror=null;this.src='https://img.icons8.com/?size=100&id=8440&format=png&color=000000'" />
              <div class="min-w-0">
                <div class="text-xs font-medium text-gray-800 truncate">${esc(o.product_name)}</div>
                <div class="text-[10px] text-gray-400 truncate">${esc(o.buyer_name || "Pembeli")} • ${esc(o.shipping_address || "-")}</div>
              </div>
            </div>
            <div class="mt-2 pt-2 border-t flex items-center justify-between gap-2">
              <span class="text-xs text-gray-500">Status</span>
              <select onchange="updateShippingStatus('${esc(o.order_id)}', this.value)"
                class="border px-2 py-1.5 text-xs bg-white flex-1">
                ${statuses
                  .map(
                    (s) =>
                      `<option value="${s}" ${s === (o.delivery_status || o.status) ? "selected" : ""}>${s}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  } catch (err) {
    list.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Gagal memuat pengiriman</div>';
  }
}

async function updateShippingStatus(orderId, status) {
  try {
    const res = await fetch("/api/seller/order/" + encodeURIComponent(orderId) + "/delivery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ delivery_status: status }),
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", "Status pengiriman diperbarui.");
      renderShippingPage();
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat mengubah status.");
      renderShippingPage();
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
    renderShippingPage();
  }
}

/* ==================== ATUR RESI ==================== */

const SELLER_COURIERS = [
  "JNE",
  "J&T Express",
  "SiCepat",
  "AnterAja",
  "Ninja Express",
  "Lion Parcel",
  "GoSend",
  "GrabExpress",
  "Lainnya",
];

let _aturResiFilter = "needResi";

async function renderAturResiPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  if (!_sellerUser) await _initSellerUser();
  const uid = _sellerUser?.id;
  if (!uid) return;

  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat data resi...</div></div>';

  try {
    const res = await fetch("/api/seller/shipping/" + uid, { credentials: "include" });
    const data = await res.json();
    if (!data.success) {
      content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat data resi</div></div>';
      return;
    }
    const summary = data.summary || {};
    const tabs = [
      { key: "needResi", label: "Perlu Resi", count: summary.needResi || 0 },
      { key: "shipped", label: "Dikirim", count: summary.shipped || 0 },
      { key: "delivered", label: "Diterima", count: summary.delivered || 0 },
      { key: "completed", label: "Selesai", count: summary.completed || 0 },
    ];
    const orders = data.orders || [];
    content.innerHTML = `
      <div class="space-y-4">
        <div class="bg-white border">
          <div class="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 class="font-bold text-gray-800 text-lg">Atur Resi Pengiriman</h2>
              <p class="text-xs text-gray-400 mt-0.5">Isi kurir & nomor resi lalu kirim pesanan ke pembeli</p>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
            ${tabs
              .map(
                (t) => `
              <button onclick="_aturResiFilter='${t.key}';renderAturResiPage()"
                class="border p-3 text-left hover:bg-gray-50 ${_aturResiFilter === t.key ? "border-[#DF414F] bg-[#fff5f6]" : ""}">
                <div class="text-2xl font-bold ${_aturResiFilter === t.key ? "text-[#DF414F]" : "text-gray-800"}">${t.count}</div>
                <div class="text-[11px] text-gray-500 mt-0.5">${t.label}</div>
              </button>
            `,
              )
              .join("")}
          </div>
          <div class="px-5 pb-2 flex gap-2 overflow-x-auto hide-scrollbar">
            ${tabs
              .map(
                (t) => `
              <button onclick="_aturResiFilter='${t.key}';renderAturResiPage()"
                class="px-4 py-1.5 text-xs font-semibold whitespace-nowrap border ${_aturResiFilter === t.key ? "bg-[#DF414F] text-white border-[#DF414F]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}">
                ${t.label} (${t.count})
              </button>
            `,
              )
              .join("")}
          </div>
        </div>
        <div class="space-y-3" id="atur-resi-list">
          ${renderAturResiOrders(orders)}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat data resi</div></div>';
  }
}

function renderAturResiOrders(orders) {
  let filtered;
  if (_aturResiFilter === "needResi") {
    filtered = orders.filter((o) => o.status === "success" && (o.delivery_status === "Pesanan Diproses" || o.delivery_status === "Pesanan Dikirim") && !o.tracking_number);
  } else if (_aturResiFilter === "shipped") {
    filtered = orders.filter((o) => o.delivery_status === "Pesanan Dikirim" && o.tracking_number);
  } else if (_aturResiFilter === "delivered") {
    filtered = orders.filter((o) => o.delivery_status === "Pesanan Diterima");
  } else {
    filtered = orders.filter((o) => o.delivery_status === "Selesai");
  }

  if (!filtered.length) {
    return '<div class="bg-white border p-10 text-center text-gray-400 text-sm">Tidak ada pesanan di kategori ini</div>';
  }

  return filtered
    .map((o) => {
      const needResi = !o.tracking_number;
      return `
      <div class="bg-white border">
        <div class="flex flex-col md:flex-row md:items-start gap-3 p-4">
          <img src="${esc(o.product_image || "")}" class="w-16 h-16 border object-cover shrink-0"
            onerror="this.onerror=null;this.src='https://img.icons8.com/?size=100&id=8440&format=png&color=000000'" />
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs font-bold text-gray-800">${esc(o.order_id)}</div>
              <span class="text-[10px] px-2 py-0.5 font-semibold ${needResi ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}">${needResi ? "MENUNGGU RESI" : esc(o.delivery_status)}</span>
            </div>
            <div class="text-xs font-medium text-gray-700 mt-1 line-clamp-2">${esc(o.product_name)}</div>
            <div class="text-[11px] text-gray-500 mt-1">
              ${esc(o.buyer_name || "Pembeli")}${o.chosen_size ? " • " + esc(o.chosen_size) : ""}${o.chosen_color ? " • " + esc(o.chosen_color) : ""}${o.quantity ? " • Qty " + o.quantity : ""}
            </div>
            <div class="text-[11px] text-gray-400 mt-1 line-clamp-2">${esc(o.shipping_address || "-")}</div>
            <div class="text-xs font-semibold text-gray-800 mt-1.5">${formatRupiah(o.total_price)}</div>
          </div>
        </div>
        ${
          needResi
            ? `
        <div class="px-4 pb-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <select id="courier-${esc(o.order_id)}" class="border px-3 py-2 text-xs bg-white w-full sm:w-44">
            ${SELLER_COURIERS.map((c) => `<option value="${c}">${c}</option>`).join("")}
          </select>
          <input id="resi-${esc(o.order_id)}" type="text" placeholder="Masukkan nomor resi"
            class="flex-1 w-full border px-3 py-2 text-xs outline-none focus:border-[#DF414F]" />
          <button onclick="shipOrder('${esc(o.order_id)}')"
            class="bg-[#DF414F] hover:bg-[#c83a47] text-white text-xs font-semibold px-6 py-2 whitespace-nowrap">
            KIRIM
          </button>
        </div>
        `
            : `
        <div class="px-4 pb-4 border-t pt-3">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span class="text-gray-500">Kurir: <b class="text-gray-800">${esc(o.tracking_courier || "-")}</b></span>
            <span class="text-gray-500">Resi: <b class="text-gray-800">${esc(o.tracking_number || "-")}</b>
              <button onclick="copyResi('${esc(o.tracking_number || "")}')" class="text-[#DF414F] font-semibold ml-1 hover:underline">Salin</button>
            </span>
            ${o.shipped_at ? `<span class="text-gray-500">Dikirim: <b class="text-gray-800">${new Date(o.shipped_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</b></span>` : ""}
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button onclick="printResi('${esc(o.order_id)}')"
              class="text-xs font-semibold bg-[#DF414F] text-white px-4 py-1.5 hover:bg-[#c83a47]">
              🖨️ Unduh Resi
            </button>
            <button onclick="openTrackingDetail('${esc(o.order_id)}')"
              class="text-xs font-semibold text-[#DF414F] border border-[#DF414F] px-4 py-1.5 hover:bg-[#fff5f6]">
              Lihat Timeline Tracking
            </button>
          </div>
        </div>
        `
        }
      </div>
    `;
    })
    .join("");
}

async function shipOrder(orderId) {
  const courier = document.getElementById("courier-" + orderId)?.value || "Lainnya";
  const trackingNumber = document.getElementById("resi-" + orderId)?.value.trim();
  if (!trackingNumber) {
    return showIosModal("Nomor Resi Kosong", "Isi nomor resi terlebih dahulu.");
  }
  try {
    const res = await fetch("/api/seller/order/" + encodeURIComponent(orderId) + "/ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ courier, tracking_number: trackingNumber }),
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", "Pesanan dikirim & resi tersimpan.");
      renderAturResiPage();
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat mengirim pesanan.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

function copyResi(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showIosModal("Tersalin", "Nomor resi disalin."),
      () => {},
    );
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showIosModal("Tersalin", "Nomor resi disalin.");
  }
}

async function openTrackingDetail(orderId) {
  try {
    const res = await fetch("/api/seller/tracking/" + encodeURIComponent(orderId), { credentials: "include" });
    const data = await res.json();
    if (!data.success || !data.order) return showIosModal("Gagal", "Tracking tidak ditemukan.");
    renderTrackingTimelineModal(orderId, data.order, data.events || []);
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

function renderTrackingTimelineModal(orderId, order, events) {
  const list = events.length
    ? events
        .map(
          (e, i) => `
        <div class="relative flex gap-3">
          <div class="flex flex-col items-center">
            <div class="w-4 h-4 rounded-full border-2 ${i === events.length - 1 ? "bg-[#DF414F] border-[#DF414F]" : "bg-white border-[#DF414F]"}"></div>
            ${i < events.length - 1 ? '<div class="w-px flex-1 bg-gray-200 my-1"></div>' : ""}
          </div>
          <div class="pb-5 min-w-0">
            <div class="text-xs font-semibold text-gray-800">${esc(e.status)}</div>
            ${e.description ? `<div class="text-[11px] text-gray-500 mt-0.5">${esc(e.description)}</div>` : ""}
            ${e.location ? `<div class="text-[11px] text-gray-400">${esc(e.location)}</div>` : ""}
            <div class="text-[10px] text-gray-400 mt-0.5">${new Date(e.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
      `,
        )
        .join("")
    : '<div class="text-center text-gray-400 text-xs py-6">Belum ada event tracking</div>';

  const body = document.createElement("div");
  body.className = "fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4";
  body.innerHTML = `
    <div class="bg-white w-full max-w-md max-h-[85vh] flex flex-col">
      <div class="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <h3 class="font-bold text-gray-800">Timeline Tracking</h3>
          <p class="text-[11px] text-gray-400 mt-0.5">${esc(order.order_id)}</p>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="w-8 h-8 text-gray-400 hover:text-gray-700 text-xl">✕</button>
      </div>
      <div class="px-5 py-3 border-b bg-gray-50">
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span class="text-gray-500">Kurir: <b class="text-gray-800">${esc(order.tracking_courier || "-")}</b></span>
          <span class="text-gray-500">Resi: <b class="text-gray-800">${esc(order.tracking_number || "-")}</b></span>
          <span class="text-gray-500">Status: <b class="text-[#DF414F]">${esc(order.delivery_status || "-")}</b></span>
        </div>
        ${order.tracking_number ? `<div class="mt-2">
          <button onclick="printResi('${esc(order.order_id)}')" class="text-xs font-semibold bg-[#DF414F] text-white px-4 py-1.5 hover:bg-[#c83a47]">🖨️ Unduh / Cetak Resi</button>
        </div>` : ""}
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Riwayat Pengiriman</div>
        ${list}
      </div>
      <div class="px-5 py-3 border-t">
        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tambah Update</div>
        <div class="flex flex-col gap-2">
          <input id="tl-status-${esc(orderId)}" type="text" placeholder="Status (mis. Paket dalam perjalanan)" class="border px-3 py-2 text-xs outline-none focus:border-[#DF414F]" />
          <div class="flex gap-2">
            <input id="tl-location-${esc(orderId)}" type="text" placeholder="Lokasi" class="flex-1 border px-3 py-2 text-xs outline-none focus:border-[#DF414F]" />
            <button onclick="addTrackingEvent('${esc(orderId)}')" class="bg-[#DF414F] hover:bg-[#c83a47] text-white text-xs font-semibold px-5 py-2">TAMBAH</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(body);
}

async function addTrackingEvent(orderId) {
  const status = document.getElementById("tl-status-" + orderId)?.value.trim();
  const location = document.getElementById("tl-location-" + orderId)?.value.trim();
  if (!status) return showIosModal("Status Kosong", "Isi status update terlebih dahulu.");
  try {
    const res = await fetch("/api/seller/tracking/" + encodeURIComponent(orderId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status, location }),
    });
    const data = await res.json();
    if (data.success) {
      openTrackingDetail(orderId);
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat menambah update.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

/* ==================== RESI PRINT / UNDUH ==================== */

function buildResiLabelHTML(data) {
  const o = data.order || {};
  const s = data.seller || {};
  const courier = o.tracking_courier || "Lainnya";
  const resi = o.tracking_number || "";
  const buyer = o.buyer_name || o.buyer_username || "Pembeli";
  const buyerPhone = o.buyer_phone || "";
  const address = (o.shipping_address || "").split(" @Coordinates:")[0].trim();
  const product = o.product_name || "";
  const variant = [o.chosen_color, o.chosen_size, o.chosen_model].filter(Boolean).join(" • ");
  const qty = o.quantity || 1;
  const total = o.total_price || 0;
  const date = o.shipped_at ? new Date(o.shipped_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("id-ID");
  const storeName = s.store_name || "Northline Seller";
  const storeCity = s.city || "";
  const storeAddr = s.address || "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Resi Pengiriman ${o.order_id || ""}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
  body { background: #f3f4f6; padding: 24px; }
  .label { width: 420px; margin: 0 auto 20px; background: #fff; border: 1px solid #d1d5db; }
  .label-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 3px solid #DF414F; }
  .label-head .brand { font-size: 18px; font-weight: 900; color: #DF414F; letter-spacing: 1px; }
  .label-head .courier { text-align: right; font-size: 11px; color: #6b7280; }
  .label-head .courier b { display: block; font-size: 15px; color: #111; }
  .label-body { padding: 16px 18px; }
  .barcode-wrap { text-align: center; padding: 8px 0 14px; border-bottom: 1px dashed #e5e7eb; }
  .barcode-wrap svg, .barcode-wrap img { max-width: 100%; }
  .resi-number { text-align: center; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #111; margin-top: 6px; }
  .sections { display: flex; gap: 16px; margin-top: 14px; }
  .section { flex: 1; }
  .section h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #9ca3af; margin-bottom: 6px; border-bottom: 1px solid #f3f4f6; padding-bottom: 4px; }
  .section p { font-size: 12px; line-height: 1.5; color: #374151; }
  .order-meta { display: flex; justify-content: space-between; margin-top: 14px; font-size: 11px; color: #6b7280; }
  .order-meta b { color: #111; }
  .product-box { margin-top: 14px; border: 1px solid #e5e7eb; padding: 10px 12px; display: flex; gap: 10px; align-items: center; }
  .product-box img { width: 56px; height: 56px; object-fit: cover; border: 1px solid #e5e7eb; }
  .product-box .pname { font-size: 12px; font-weight: 700; color: #111; }
  .product-box .pvar { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .product-box .pqty { font-size: 12px; color: #374151; margin-top: 4px; }
  .product-box .ptotal { font-size: 13px; font-weight: 800; color: #DF414F; margin-top: 4px; }
  .note { margin-top: 12px; font-size: 10px; color: #9ca3af; text-align: center; }
  .toolbar { max-width: 420px; margin: 0 auto 16px; display: flex; gap: 10px; }
  .toolbar button { flex: 1; padding: 12px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; }
  .btn-print { background: #DF414F; color: #fff; }
  .btn-close { background: #fff; color: #374151; border: 1px solid #d1d5db !important; }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .label { margin: 0; border: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨️ Cetak Resi</button>
    <button class="btn-close" onclick="window.close()">Tutup</button>
  </div>
  <div class="label">
    <div class="label-head">
      <div class="brand">NORTHLINE</div>
      <div class="courier"><b>${courier}</b>Kurir Pengiriman</div>
    </div>
    <div class="label-body">
      <div class="barcode-wrap">
        <svg id="barcode"></svg>
        <div class="resi-number">${resi}</div>
      </div>
      <div class="sections">
        <div class="section">
          <h4>Pengirim</h4>
          <p><b>${storeName}</b><br>${storeCity}<br>${storeAddr}</p>
        </div>
        <div class="section">
          <h4>Penerima</h4>
          <p><b>${buyer}</b>${buyerPhone ? "<br>" + buyerPhone : ""}<br>${address}</p>
        </div>
      </div>
      <div class="order-meta">
        <span>Order: <b>${o.order_id || ""}</b></span>
        <span>Tanggal: <b>${date}</b></span>
      </div>
      <div class="product-box">
        <img src="${o.product_image || ""}" onerror="this.style.visibility='hidden'">
        <div>
          <div class="pname">${product}</div>
          ${variant ? '<div class="pvar">' + variant + '</div>' : ""}
          <div class="pqty">Jumlah: ${qty}</div>
          <div class="ptotal">${formatRupiah(total)}</div>
        </div>
      </div>
      <div class="note">Resi ini adalah bukti pengiriman. Tempelkan pada paket sebelum diserahkan ke kurir.</div>
    </div>
  </div>
  <script>
    try {
      const value = "${resi}" || "NORTHLINE";
      JsBarcode("#barcode", value, { format: "CODE128", width: 2, height: 70, displayValue: false });
    } catch (e) {
      document.getElementById("barcode").outerHTML = "<div style='font-size:12px;color:#9ca3af'>BARCODE UNAVAILABLE</div>";
    }
  </script>
</body>
</html>`;
}

async function printResi(orderId) {
  try {
    const res = await fetch("/api/seller/tracking/" + encodeURIComponent(orderId), { credentials: "include" });
    const data = await res.json();
    if (!data.success || !data.order) return showIosModal("Gagal", "Data resi tidak ditemukan.");
    if (!data.order.tracking_number) return showIosModal("Belum Ada Resi", "Order ini belum memiliki nomor resi.");
    const w = window.open("", "_blank", "width=480,height=720");
    if (!w) return showIosModal("Popup Terblokir", "Izinkan popup untuk mencetak resi.");
    w.document.write(buildResiLabelHTML(data));
    w.document.close();
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan saat memuat resi.");
  }
}

/* ==================== KEUANGAN ==================== */

async function renderFinancePage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;

  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat keuangan...</div></div>';

  if (!_sellerUser) {
    await _initSellerUser();
  }
  const uid = _sellerUser?.id;
  if (!uid) return;

  try {
    const res = await fetch("/api/seller/finance/" + uid, { credentials: "include" });
    const data = await res.json();
    if (!data.success) {
      content.innerHTML =
        '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat keuangan</div></div>';
      return;
    }

    const sum = data.summary || {};
    const bank = data.bank || {};
    const monthly = data.monthly || [];

    content.innerHTML = `
      <div class="space-y-4">

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Total Penghasilan</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(sum.totalRevenue)}</div>
            <div class="text-[11px] text-gray-400 mt-1">${sum.paidOrders || 0} pesanan lunas</div>
          </div>
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Belum Dibayar</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(sum.pendingRevenue)}</div>
            <div class="text-[11px] text-gray-400 mt-1">${sum.unpaidOrders || 0} pesanan</div>
          </div>
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Total Pesanan</div>
            <div class="text-xl font-bold text-gray-800 mt-1">${sum.totalOrders || 0}</div>
            <div class="text-[11px] text-gray-400 mt-1">semua status</div>
          </div>
          <div class="bg-white border p-4">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide">Rekening Bank</div>
            <div class="text-base font-bold text-gray-800 mt-1 truncate">${esc(bank.bank_name || "-")}</div>
            <div class="text-[11px] text-gray-400 mt-1">${esc(bank.bank_account || "-")}</div>
          </div>
        </div>

        <div class="bg-white border">
          <div class="px-5 py-4 border-b">
            <h3 class="font-semibold text-gray-800">Penghasilan 6 Bulan Terakhir</h3>
          </div>
          <div class="p-5">
            <canvas id="finance-chart" height="110"></canvas>
          </div>
        </div>

        <div class="bg-white border">
          <div class="px-5 py-4 border-b">
            <h3 class="font-semibold text-gray-800">Rincian Bank</h3>
          </div>
          <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <div class="text-gray-400 mb-1">Nama Bank</div>
              <div class="font-semibold text-gray-800">${esc(bank.bank_name || "-")}</div>
            </div>
            <div>
              <div class="text-gray-400 mb-1">Nomor Rekening</div>
              <div class="font-semibold text-gray-800">${esc(bank.bank_account || "-")}</div>
            </div>
            <div>
              <div class="text-gray-400 mb-1">Atas Nama</div>
              <div class="font-semibold text-gray-800">${esc(bank.bank_holder || "-")}</div>
            </div>
          </div>
        </div>

      </div>
    `;

    drawFinanceChart(monthly);
  } catch (err) {
    content.innerHTML =
      '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat keuangan</div></div>';
  }
}

function drawFinanceChart(monthly) {
  const canvas = document.getElementById("finance-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = monthly.map((m) => {
    const [y, mo] = (m.month || "").split("-");
    return (mo || m.month || "?") + "/" + (y || "");
  });
  const values = monthly.map((m) => Number(m.revenue) || 0);
  new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Pendapatan",
          data: values,
          backgroundColor: "#DF414F",
          borderRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => " " + formatRupiah(c.parsed.y) },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          grid: { color: "#f0f0f0" },
          ticks: {
            font: { size: 10 },
            callback: (v) => (v >= 1000000 ? (v / 1000000).toFixed(1) + "jt" : v >= 1000 ? (v / 1000).toFixed(0) + "rb" : v),
          },
        },
      },
    },
  });
}

/* ==================== RETUR / PENGEMBALIAN ==================== */

async function renderReturnsPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  if (!_sellerUser) await _initSellerUser();
  const uid = _sellerUser?.id;
  if (!uid) return;
  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat retur...</div></div>';
  try {
    const res = await fetch("/api/seller/returns/" + uid, { credentials: "include" });
    const data = await res.json();
    content.innerHTML = `
      <div class="bg-white border">
        <div class="px-6 py-4 border-b">
          <h2 class="text-xl font-semibold">Retur / Pengembalian</h2>
          <p class="text-sm text-gray-500">Kelola permintaan retur dari pembeli</p>
        </div>
        <div class="p-6">
          ${!data.success || !data.returns?.length ? `
            <div class="text-center py-20 text-gray-400 text-sm">Tidak ada permintaan retur</div>
          ` : `
            <div class="space-y-3">
              ${data.returns.map((r) => `
                <div class="border p-4">
                  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-semibold text-gray-800">${esc(r.order_id)}</span>
                        <span class="text-[10px] uppercase px-2 py-0.5 ${r.status === "pending" ? "bg-amber-100 text-amber-700" : r.status === "approved" ? "bg-blue-100 text-blue-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}">${esc(r.status)}</span>
                      </div>
                      <div class="text-xs text-gray-500 mt-1 break-words">${esc(r.reason || "")}</div>
                      ${r.description ? `<div class="text-xs text-gray-400 mt-1 break-words">${esc(r.description)}</div>` : ""}
                      <div class="text-[10px] text-gray-400 mt-1">${esc((r.created_at || "").replace("T", " ").slice(0, 16))}</div>
                    </div>
                    ${r.status === "pending" ? `
                      <div class="flex gap-2 flex-shrink-0">
                        <button onclick="handleReturn('${esc(r.order_id)}','approved')" class="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-500">Terima</button>
                        <button onclick="handleReturn('${esc(r.order_id)}','rejected')" class="px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-500">Tolak</button>
                      </div>
                    ` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat retur</div></div>';
  }
}

async function handleReturn(orderId, status) {
  try {
    const res = await fetch("/api/seller/returns/" + encodeURIComponent(orderId) + "/" + status, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", "Status retur diperbarui.");
      renderReturnsPage();
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat mengubah status retur.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

/* ==================== MASS SHIP ==================== */

async function renderMassShipPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  if (!_sellerUser) await _initSellerUser();
  const uid = _sellerUser?.id;
  if (!uid) return;

  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat pesanan...</div></div>';

  try {
    const res = await fetch("/api/seller/orders/" + uid + "?status=processing", { credentials: "include" });
    const data = await res.json();
    const orders = (data.success && data.orders) || [];
    content.innerHTML = `
      <div class="bg-white border">
        <div class="px-6 py-4 border-b">
          <h2 class="text-xl font-semibold">Mass Ship</h2>
          <p class="text-sm text-gray-500">Pilih beberapa pesanan lalu perbarui status sekaligus</p>
        </div>
        <div class="p-6">
          ${!orders.length ? `
            <div class="text-center py-20 text-gray-400 text-sm">Tidak ada pesanan yang bisa dikirim sekaligus</div>
          ` : `
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div class="text-xs text-gray-500">Terpilih: <span id="mass-count" class="font-semibold text-gray-800">0</span> pesanan</div>
              <div class="flex flex-col sm:flex-row gap-2">
                <select id="mass-status" class="border px-3 py-2 text-xs bg-white">
                  <option value="Pesanan Dikirim">Tandai Dikirim</option>
                  <option value="Selesai">Tandai Selesai</option>
                  <option value="Pesanan Dibatalkan">Batalkan</option>
                </select>
                <button onclick="submitMassShip()" class="bg-[#DF414F] text-white px-4 py-2 text-xs hover:bg-[#c83a47]">Perbarui Terpilih</button>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              ${orders.map((o) => `
                <label class="border p-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" value="${esc(o.order_id)}" class="mass-check mt-1" onchange="updateMassCount()">
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-semibold text-gray-800 truncate">${esc(o.order_id)}</div>
                    <div class="text-xs text-gray-600 truncate">${esc(o.product_name)}</div>
                    <div class="text-[11px] text-gray-400">${esc(o.buyer_name || "Pembeli")} • ${formatRupiah(o.total_price)}</div>
                  </div>
                </label>
              `).join("")}
            </div>
          `}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat pesanan</div></div>';
  }
}

function updateMassCount() {
  const n = document.querySelectorAll(".mass-check:checked").length;
  const el = document.getElementById("mass-count");
  if (el) el.textContent = n;
}

async function submitMassShip() {
  const ids = [...document.querySelectorAll(".mass-check:checked")].map((c) => c.value);
  if (!ids.length) return showIosModal("Pilih minimal 1 pesanan");
  const status = document.getElementById("mass-status").value;
  if (!status) return showIosModal("Pilih status tujuan");
  try {
    const res = await fetch("/api/seller/mass-ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ order_ids: ids, delivery_status: status }),
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", data.message || "Pesanan diperbarui.");
      renderMassShipPage();
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat memperbarui pesanan.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

/* ==================== PENGATURAN PENGIRIMAN ==================== */

async function renderShippingSettingsPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  if (!_sellerUser) await _initSellerUser();
  const uid = _sellerUser?.id;
  if (!uid) return;
  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat pengaturan...</div></div>';
  try {
    const res = await fetch("/api/seller/shipping-settings/" + uid, { credentials: "include" });
    const data = await res.json();
    const s = (data.success && data.settings) || {};
    const couriers = Array.isArray(s.couriers) ? s.couriers : ["JNE", "J&T", "SiCepat"];
    content.innerHTML = `
      <div class="bg-white border">
        <div class="px-6 py-4 border-b">
          <h2 class="text-xl font-semibold">Pengaturan Pengiriman</h2>
          <p class="text-sm text-gray-500">Atur opsi pengiriman toko Anda</p>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Kota Asal</label>
              <input id="ship-origin" type="text" value="${esc(s.origin_city || "")}" class="w-full h-10 border px-3 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Biaya Pengiriman (IDR)</label>
              <input id="ship-cost" type="number" value="${Number(s.shipping_cost) || 0}" class="w-full h-10 border px-3 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Hari Proses (hari)</label>
              <input id="ship-processing" type="number" value="${Number(s.processing_days) || 1}" class="w-full h-10 border px-3 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Estimasi Tiba (Min-Max, hari)</label>
              <div class="flex gap-2">
                <input id="ship-min" type="number" value="${Number(s.est_min) || 2}" class="w-full h-10 border px-3 text-sm">
                <input id="ship-max" type="number" value="${Number(s.est_max) || 5}" class="w-full h-10 border px-3 text-sm">
              </div>
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium mb-2">Kurir Aktif</label>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm" id="ship-couriers">
                ${["JNE", "J&T", "SiCepat", "Pos Indonesia", "GoSend", "GrabExpress"].map((c) => `
                  <label class="flex items-center gap-2 border px-3 py-2">
                    <input type="checkbox" value="${c}" class="ship-courier" ${couriers.includes(c) ? "checked" : ""}> ${c}
                  </label>
                `).join("")}
              </div>
            </div>
          </div>
          <div class="mt-6 pt-6 border-t">
            <button onclick="saveShippingSettings()" class="bg-[#DF414F] hover:bg-[#c83a47] text-white text-[12px] font-semibold px-6 h-10">SIMPAN PENGATURAN</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat pengaturan</div></div>';
  }
}

async function saveShippingSettings() {
  try {
    const couriers = [...document.querySelectorAll(".ship-courier:checked")].map((c) => c.value);
    const payload = {
      origin_city: document.getElementById("ship-origin").value.trim(),
      shipping_cost: Number(document.getElementById("ship-cost").value) || 0,
      processing_days: Number(document.getElementById("ship-processing").value) || 1,
      est_min: Number(document.getElementById("ship-min").value) || 2,
      est_max: Number(document.getElementById("ship-max").value) || 5,
      couriers,
    };
    const res = await fetch("/api/seller/shipping-settings/" + _sellerUser.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", "Pengaturan pengiriman disimpan.");
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat menyimpan pengaturan.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

/* ==================== SALDO ==================== */

async function renderSaldoPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat saldo...</div></div>';
  try {
    const res = await fetch("/api/seller/wallet/" + _sellerUser.id, { credentials: "include" });
    const data = await res.json();
    if (!data.success) {
      content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat saldo</div></div>';
      return;
    }
    const balance = Number(data.balance) || 0;
    const s = data.summary || {};
    const fc = data.feeConfig || {};
    const monthly = data.monthly || [];
    const recent = data.recent || [];
    const nextRelease = s.nextRelease ? new Date(s.nextRelease) : null;
    const nextReleaseStr = nextRelease
      ? nextRelease.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : "-";
    const payStatus = (st) => {
      if (!st || st === "pending") return '<span class="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5">Menunggu Pencairan</span>';
      if (st === "released") return '<span class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5">Sudah Dicairkan</span>';
      return '<span class="text-xs font-semibold text-gray-500 bg-gray-50 px-2 py-0.5">' + esc(st) + '</span>';
    };
    const recentRows = recent.length
      ? recent.map((o) => `
        <tr class="border-b">
          <td class="py-3 pr-3">
            <div class="flex items-center gap-2">
              ${o.product_image ? '<img src="' + esc(o.product_image) + '" class="w-9 h-9 object-cover border" onerror="this.style.visibility=\'hidden\'">' : ""}
              <div>
                <div class="font-semibold text-gray-800 text-xs max-w-[180px] truncate">${esc(o.product_name || "-")}</div>
                <div class="text-[10px] text-gray-400">${esc(o.order_id || "")}</div>
              </div>
            </div>
          </td>
          <td class="py-3 pr-3 text-xs text-gray-600">${o.created_at ? new Date(o.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}</td>
          <td class="py-3 pr-3 text-xs text-gray-600">${formatRupiah(o.total_price)}</td>
          <td class="py-3 pr-3 text-xs font-semibold text-gray-800">${formatRupiah(o.seller_net)}</td>
          <td class="py-3 pr-3">${payStatus(o.payout_status)}</td>
          <td class="py-3 text-xs text-gray-600 whitespace-nowrap">${o.payout_release_at ? new Date(o.payout_release_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}</td>
        </tr>`).join("")
      : '<tr><td colspan="6" class="py-8 text-center text-gray-400 text-xs">Belum ada pesanan</td></tr>';

    content.innerHTML = `
      <div class="space-y-5">
        <div class="bg-white border">
          <div class="px-6 py-4 border-b">
            <h2 class="text-xl font-semibold">Saldo & Analisa</h2>
            <p class="text-sm text-gray-500">Pantau penghasilan, potongan biaya, dan pencairan otomatis</p>
          </div>
          <div class="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="border p-5 bg-[#DF414F]">
              <div class="text-[11px] text-white/70 uppercase tracking-wide">Saldo NorthPay</div>
              <div class="text-2xl font-bold text-white mt-1">${formatRupiah(balance)}</div>
              <div class="text-[11px] text-white/70 mt-1">Pencairan masuk ke sini otomatis</div>
            </div>
            <div class="bg-white border p-5">
              <div class="text-[11px] text-gray-400 uppercase tracking-wide">Total Penghasilan (Bruto)</div>
              <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(s.grossIncome)}</div>
              <div class="text-[11px] text-gray-400 mt-1">${s.totalOrders || 0} pesanan sukses</div>
            </div>
            <div class="bg-white border p-5">
              <div class="text-[11px] text-gray-400 uppercase tracking-wide">Potongan Northline</div>
              <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(s.totalFee)}</div>
              <div class="text-[11px] text-gray-400 mt-1">Fee ${fc.feeRate || 0}% + Pajak ${fc.taxRate || 0}%</div>
            </div>
            <div class="bg-white border p-5">
              <div class="text-[11px] text-gray-400 uppercase tracking-wide">Penghasilan Bersih (Netto)</div>
              <div class="text-xl font-bold text-emerald-600 mt-1">${formatRupiah(s.netIncome)}</div>
              <div class="text-[11px] text-gray-400 mt-1">setelah potongan Northline</div>
            </div>
          </div>
        </div>

        <div class="bg-white border">
          <div class="px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">Info Pencairan</h3>
            <p class="text-sm text-gray-500">Pendapatan dicairkan otomatis ke Saldo NorthPay setelah ${fc.workingDays || 30} hari kerja</p>
          </div>
          <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="border p-4 bg-amber-50/50">
              <div class="text-[11px] text-amber-600 uppercase tracking-wide">Menunggu Pencairan</div>
              <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(s.pendingIncome)}</div>
              <div class="text-[11px] text-gray-500 mt-1">Akan cair otomatis</div>
            </div>
            <div class="border p-4 bg-emerald-50/50">
              <div class="text-[11px] text-emerald-600 uppercase tracking-wide">Sudah Dicairkan</div>
              <div class="text-xl font-bold text-gray-800 mt-1">${formatRupiah(s.releasedIncome)}</div>
              <div class="text-[11px] text-gray-500 mt-1">Masuk ke Saldo NorthPay</div>
            </div>
            <div class="border p-4">
              <div class="text-[11px] text-gray-400 uppercase tracking-wide">Pencairan Berikutnya</div>
              <div class="text-xl font-bold text-gray-800 mt-1">${esc(nextReleaseStr)}</div>
              <div class="text-[11px] text-gray-500 mt-1">Perkiraan jadwal cair otomatis</div>
            </div>
          </div>
        </div>

        <div class="bg-white border">
          <div class="px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">Pendapatan 6 Bulan Terakhir</h3>
          </div>
          <div class="p-6">
            <canvas id="finance-chart" height="110"></canvas>
          </div>
        </div>

        <div class="bg-white border">
          <div class="px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">Transaksi Terbaru</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[640px]">
              <thead>
                <tr class="border-b text-[10px] uppercase tracking-wide text-gray-400">
                  <th class="py-3 px-6">Produk</th>
                  <th class="py-3 pr-3">Tanggal</th>
                  <th class="py-3 pr-3">Bruto</th>
                  <th class="py-3 pr-3">Netto</th>
                  <th class="py-3 pr-3">Status Pencairan</th>
                  <th class="py-3">Tgl Cair</th>
                </tr>
              </thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    drawFinanceChart(monthly);
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat saldo</div></div>';
  }
}

/* ==================== REKENING BANK ==================== */

async function renderBankPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat rekening...</div></div>';
  try {
    const profile = await fetch("/api/seller/status/" + _sellerUser.id, { credentials: "include" });
    const profileData = await profile.json();
    const seller = (profileData.success && profileData.seller) || {};
    content.innerHTML = `
      <div class="bg-white border">
        <div class="px-6 py-4 border-b">
          <h2 class="text-xl font-semibold">Rekening Bank</h2>
          <p class="text-sm text-gray-500">Kelola rekening bank untuk pencairan penghasilan</p>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-1 gap-4 max-w-lg">
            <div>
              <label class="block text-sm font-medium mb-2">Nama Bank</label>
              <input id="bank-name" type="text" value="${esc(seller.bank_name || "")}" class="w-full h-10 border px-3 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Nomor Rekening</label>
              <input id="bank-account" type="text" value="${esc(seller.bank_account || "")}" class="w-full h-10 border px-3 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Atas Nama</label>
              <input id="bank-holder" type="text" value="${esc(seller.bank_holder || "")}" class="w-full h-10 border px-3 text-sm">
            </div>
          </div>
          <div class="mt-6">
            <button onclick="saveBankInfo()" class="bg-[#DF414F] hover:bg-[#c83a47] text-white text-[12px] font-semibold px-6 h-10">SIMPAN REKENING</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat rekening</div></div>';
  }
}

async function saveBankInfo() {
  try {
    const payload = {
      bank_name: document.getElementById("bank-name").value.trim(),
      bank_account: document.getElementById("bank-account").value.trim(),
      bank_holder: document.getElementById("bank-holder").value.trim(),
    };
    const res = await fetch("/api/seller/bank", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", "Rekening bank disimpan.");
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat menyimpan rekening.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}

/* ==================== PENGATURAN ==================== */

async function renderSettingsPage() {
  const content = document.getElementById("seller-main-content");
  if (!content) return;
  content.innerHTML =
    '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Memuat pengaturan...</div></div>';
  try {
    const profile = await fetch("/api/seller/status/" + _sellerUser.id, { credentials: "include" });
    const profileData = await profile.json();
    const seller = (profileData.success && profileData.seller) || {};
    const u = _sellerUser || {};
    const notif = getSettingPrefs();

    content.innerHTML = `
      <div class="space-y-6 max-w-full">
        <div class="bg-white border">
          <div class="px-6 py-4 border-b">
            <h2 class="text-xl font-semibold">Pengaturan Seller Center</h2>
            <p class="text-sm text-gray-500">Kelola profil toko, akun, dan preferensi notifikasi</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="md:col-span-2 space-y-6">
            <div class="bg-white border">
              <div class="px-6 py-4 border-b">
                <h3 class="text-base font-semibold">Informasi Akun</h3>
                <p class="text-sm text-gray-500">Detail akun Northline Anda</p>
              </div>
              <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium mb-2">Nama Lengkap</label>
                  <input type="text" value="${esc(u.name || "")}" disabled class="w-full h-10 border px-3 text-sm bg-gray-50 text-gray-500">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Username</label>
                  <input type="text" value="${esc(u.username || "")}" disabled class="w-full h-10 border px-3 text-sm bg-gray-50 text-gray-500">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Email</label>
                  <input type="text" value="${esc(u.email || "")}" disabled class="w-full h-10 border px-3 text-sm bg-gray-50 text-gray-500">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Nomor HP</label>
                  <input type="text" value="${esc(u.phone || "")}" disabled class="w-full h-10 border px-3 text-sm bg-gray-50 text-gray-500">
                </div>
              </div>
            </div>

            <div class="bg-white border">
              <div class="px-6 py-4 border-b">
                <h3 class="text-base font-semibold">Profil Toko</h3>
                <p class="text-sm text-gray-500">Informasi yang tampil di toko Anda</p>
              </div>
              <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium mb-2">Nama Toko</label>
                  <input id="set-store-name" type="text" value="${esc(seller.store_name || "")}" class="w-full h-10 border px-3 text-sm">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Slug Toko</label>
                  <input id="set-store-slug" type="text" value="${esc(seller.store_slug || "")}" class="w-full h-10 border px-3 text-sm">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Email Bisnis</label>
                  <input id="set-business-email" type="email" value="${esc(seller.business_email || "")}" class="w-full h-10 border px-3 text-sm">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">WhatsApp</label>
                  <input id="set-whatsapp" type="text" value="${esc(seller.whatsapp || "")}" class="w-full h-10 border px-3 text-sm">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Kota</label>
                  <input id="set-city" type="text" value="${esc(seller.city || "")}" class="w-full h-10 border px-3 text-sm">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Alamat Toko</label>
                  <input id="set-address" type="text" value="${esc(seller.address || "")}" class="w-full h-10 border px-3 text-sm">
                </div>
                <div class="md:col-span-2">
                  <label class="block text-sm font-medium mb-2">Deskripsi Toko</label>
                  <textarea id="set-store-desc" rows="3" class="w-full border px-3 py-2 text-sm">${esc(seller.store_description || "")}</textarea>
                </div>
              </div>
              <div class="px-6 pb-6">
                <button onclick="saveStoreSettings()" class="bg-[#DF414F] hover:bg-[#c83a47] text-white text-[12px] font-semibold px-6 h-10">SIMPAN PROFIL TOKO</button>
              </div>
            </div>
          </div>

          <div class="bg-white border">
            <div class="px-6 py-4 border-b">
              <h3 class="text-base font-semibold">Notifikasi</h3>
              <p class="text-sm text-gray-500">Pilih jenis notifikasi yang ingin Anda terima</p>
            </div>
            <div class="p-6 space-y-4">
              ${renderNotifToggle("notif-order", "Pesanan Baru", "Dapatkan notifikasi saat ada pesanan masuk", notif["notif-order"])}
              ${renderNotifToggle("notif-product", "Produk & Stok", "Notifikasi saat produk habis atau ada pembaruan produk", notif["notif-product"])}
              ${renderNotifToggle("notif-payment", "Pembayaran", "Notifikasi saat pembayaran pesanan berhasil", notif["notif-payment"])}
              ${renderNotifToggle("notif-shipping", "Pengiriman", "Notifikasi terkait status pengiriman", notif["notif-shipping"])}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<div class="bg-white p-6"><div class="text-center text-gray-400 text-xs py-12">Gagal memuat pengaturan</div></div>';
  }
}

function renderNotifToggle(id, title, desc, checked) {
  const on = checked === true || checked === "true" || checked === "on";
  return `
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-gray-800">${title}</p>
        <p class="text-xs text-gray-500">${desc}</p>
      </div>
      <label class="setting-switch flex-shrink-0">
        <input id="${id}" type="checkbox" ${on ? "checked" : ""} onchange="saveNotifPrefs()">
        <span class="setting-track">
          <span class="setting-thumb"></span>
        </span>
      </label>
    </div>
  `;
}

function getSettingPrefs() {
  try {
    return JSON.parse(localStorage.getItem("seller_notif_prefs") || "{}");
  } catch (e) {
    return {};
  }
}

function saveNotifPrefs() {
  const prefs = {};
  ["notif-order", "notif-product", "notif-payment", "notif-shipping"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) prefs[id] = el.checked;
  });
  localStorage.setItem("seller_notif_prefs", JSON.stringify(prefs));
  showIosModal("Berhasil", "Preferensi notifikasi disimpan.");
}

async function saveStoreSettings() {
  const payload = {
    store_name: document.getElementById("set-store-name").value.trim(),
    store_slug: document.getElementById("set-store-slug").value.trim(),
    business_email: document.getElementById("set-business-email").value.trim(),
    whatsapp: document.getElementById("set-whatsapp").value.trim(),
    city: document.getElementById("set-city").value.trim(),
    address: document.getElementById("set-address").value.trim(),
    store_description: document.getElementById("set-store-desc").value.trim(),
  };
  try {
    const res = await fetch("/api/seller/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showIosModal("Berhasil", "Profil toko disimpan.");
    } else {
      showIosModal("Gagal", data.message || "Tidak dapat menyimpan profil toko.");
    }
  } catch (err) {
    showIosModal("Gagal", "Terjadi kesalahan.");
  }
}
