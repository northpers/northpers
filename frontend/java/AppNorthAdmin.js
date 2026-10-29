function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

const socket = io();
let adminUser = null;
let currentPage = 'dashboard';
let chartInstances = {};
let currentChatUserId = null;
let ordersPage = 1, usersPage = 1, reviewsPage = 1, northpayPage = 1, northpayAdminTab = 'requests';
let renderOrdersTimeout, renderUsersTimeout, renderReviewsTimeout, renderNorthpayTimeout;
let npinjamStatus = 'pending', npinjamDetailId = null, npinjamLoanStatus = 'pending,active', npinjamAdminTab = 'applications';
let reportData = null;
let chatUsersData = [];
let chatPollInterval = null;
let globalSearchQuery = '';
let globalSearchTimeout = null;
let globalSearchSequence = 0;
let flashDiscountSearch = '';

function getPageCode(page) {
  if (!window._pageCodes) window._pageCodes = {};
  if (!window._pageCodes[page]) {
    let hash = 0;
    for (let i = 0; i < page.length; i++) {
      hash = ((hash << 5) - hash) + page.charCodeAt(i);
      hash |= 0;
    }
    window._pageCodes[page] = Math.abs(hash).toString(36).substring(0, 6);
  }
  return window._pageCodes[page];
}

function loadPageCodes() {
  window._pageCodes = window._pageCodes || {};
}

function getPageFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  for (const page in PAGE_TITLES) {
    const code = getPageCode(page);
    if (hash === page + '-' + code) return page;
  }
  return null;
}

function restoreActiveSidebar(page) {
  document.querySelectorAll('#sidebar-nav a').forEach(function (el) { el.classList.remove('active'); });
  const a = document.querySelector('#sidebar-nav a[data-page="' + page + '"]');
  if (a) a.classList.add('active');
  document.getElementById('page-title').textContent = (a && a.querySelector('span') ? a.querySelector('span').textContent : page) || page;
  updateBreadcrumb(page);
  autoOpenNavGroup(page);
}

function updateTitle(page) {
  const title = PAGE_TITLES[page] || page;
  document.title = 'Northline NPanel - ' + title;
}

const PAGE_TITLES = {
  dashboard: 'Dashboard', orders: 'Orders', users: 'Users', products: 'Products',
  reviews: 'Reviews', sellers: 'Sellers', chat: 'Chat', notifications: 'Notifikasi',
  whatsapp: 'WA Notifikasi', northpay: 'NorthPay', npinjam: 'NPinjam',
  'npinjam-scanner': 'NPinjam Scanner',
  affiliate: 'Affiliate', reports: 'Laporan', 'seller-earnings': 'Penghasilan Seller',
  settings: 'Pengaturan', 'flash-discount': 'Setting Price', database: 'Database Manager',
  logs: 'Access Logs', traffic: 'Traffic Analytics', visitors: 'Visitors',
  server: 'Server Status', domain: 'Domain Status', 'domain-manager': 'Domain Manager',
  filemanager: 'File Manager', techstack: 'Tech Stack', security: 'Security',
  'ai-models': 'Model AI'
};

function escapeHtml(s) {
  if (typeof s !== 'string') return s || '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatRp(n) {
  return 'Rp ' + parseInt(n || 0).toLocaleString('id-ID');
}

function formatCost(n) {
  var v = parseFloat(n || 0);
  if (v <= 0) return 'Rp 0';
  if (v < 1) return 'Rp ' + v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return formatRp(Math.round(v));
}

function statusBadge(s) {
  const cls = s === 'success' ? 'badge badge-success' : s === 'cancelled' || s === 'rejected' ? 'badge badge-danger' : s === 'pending' ? 'badge badge-pending' : 'badge badge-info';
  return '<span class="' + cls + '">' + escapeHtml(s) + '</span>';
}

function renderStars(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += i <= rating ? '<span class="star">★</span>' : '<span class="star-empty">★</span>';
  return stars;
}

async function api(path, opts) {
  opts = opts || {};
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body || undefined,
    credentials: 'same-origin'
  });
  return res.json();
}

function closeModal() {
  waModalOpen = false;
  if (waModalTimer) { clearTimeout(waModalTimer); waModalTimer = null; }
  destroyAdminMaps();
  document.getElementById('modal').classList.remove('show');
}

function showModal(html) {
  waModalOpen = false;
  if (waModalTimer) { clearTimeout(waModalTimer); waModalTimer = null; }
  destroyAdminMaps();
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal').classList.add('show');
}

let adminMaps = {};

function destroyAdminMaps() {
  Object.keys(adminMaps).forEach((k) => {
    try { adminMaps[k].remove(); } catch (e) {}
    delete adminMaps[k];
  });
}

function initAdminMapPicker(mapId, latId, lngId, initLat, initLng) {
  destroyAdminMaps();
  const mapEl = document.getElementById(mapId);
  if (!mapEl) return null;
  let lat = parseFloat(initLat);
  let lng = parseFloat(initLng);
  if (isNaN(lat) || isNaN(lng)) { lat = -6.4194; lng = 107.4589; }
  const map = L.map(mapId, { zoomControl: false }).setView([lat, lng], 12);
  L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '&copy; Google Maps' }).addTo(map);
  const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  const latInput = document.getElementById(latId);
  const lngInput = document.getElementById(lngId);
  const sync = function (ll) {
    if (latInput) latInput.value = ll.lat.toFixed(6);
    if (lngInput) lngInput.value = ll.lng.toFixed(6);
  };
  sync(marker.getLatLng());
  marker.on('dragend', function (e) { sync(e.target.getLatLng()); });
  map.on('click', function (e) { marker.setLatLng(e.latlng); sync(e.latlng); });
  adminMaps[mapId] = map;
  return map;
}

const PAGE_GROUPS = {
  dashboard: 'Ringkasan',
  orders: 'Transaksi', northpay: 'Transaksi', affiliate: 'Transaksi', 'seller-earnings': 'Transaksi', reports: 'Transaksi',
  products: 'Produk & Toko', reviews: 'Produk & Toko', sellers: 'Produk & Toko',
  users: 'Pelanggan', chat: 'Pelanggan',
  'flash-discount': 'Promo',
  notifications: 'Platform', whatsapp: 'Platform', npinjam: 'Platform', 'npinjam-scanner': 'Platform', settings: 'Platform', database: 'SQL Database Manager',
  logs: 'Monitoring', traffic: 'Monitoring', visitors: 'Monitoring', server: 'Monitoring',
  domain: 'Domain',
  'domain-manager': 'Domain',
  filemanager: 'Files',
  techstack: 'System',
  security: 'System'
};

function updateBreadcrumb(page) {
  var b = document.getElementById('breadcrumb');
  if (b) b.textContent = (PAGE_GROUPS[page] || '') + ' / ' + ((document.getElementById('page-title') || {}).textContent || page);
}

function toggleNavGroup(group) {
  var g = document.querySelector('.nav-group[data-group="' + group + '"]');
  if (!g) return;
  g.classList.toggle('collapsed');
  try { localStorage.setItem('nrt_admin_sidebar_' + group, g.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

function autoOpenNavGroup(page) {
  var group = PAGE_GROUPS[page];
  var map = { dashboard: 'summary', orders: 'transactions', northpay: 'transactions', affiliate: 'transactions', 'seller-earnings': 'transactions', reports: 'transactions', products: 'products', reviews: 'products', sellers: 'products', users: 'customers', chat: 'customers', 'flash-discount': 'promo', notifications: 'platform', whatsapp: 'platform', npinjam: 'platform', 'npinjam-scanner': 'platform', settings: 'platform', database: 'database', logs: 'monitoring', traffic: 'monitoring', visitors: 'monitoring', server: 'monitoring', domain: 'domain', filemanager: 'files' };
  var gname = map[page] || '';
  if (!gname) return;
  document.querySelectorAll('.nav-group').forEach(function (g) {
    var collapsed;
    if (g.dataset.group === gname) {
      collapsed = false;
    } else {
      try { collapsed = localStorage.getItem('nrt_admin_sidebar_' + g.dataset.group) === '1'; } catch (e) { collapsed = false; }
    }
    g.classList.toggle('collapsed', collapsed);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    socket.emit('join_admin');
    const me = await api('/api/auth/me');
    if (!me.success || !me.user) {
      window.location.href = '/AppNorthAuthAdmin';
      return;
    }
    const roleCheck = await api('/api/admin/dashboard');
    if (!roleCheck.success) {
      window.location.href = '/AppNorthAuthAdmin';
      return;
    }
    adminUser = me.user;
    document.getElementById('admin-name').textContent = me.user.name || me.user.username;
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function (ev) { ev.preventDefault(); logout(); });
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('#admin-global-search-wrap')) hideAdminGlobalSearch();
    });
    loadPageCodes();
    var hashPage = getPageFromHash();
    if (hashPage && hashPage !== currentPage) {
      currentPage = hashPage;
      restoreActiveSidebar(hashPage);
      var content = document.getElementById('page-content');
      content.innerHTML = googleLoader();
      switch (hashPage) {
        case 'dashboard': renderDashboard(content); break;
        case 'orders': renderOrders(content); break;
        case 'users': renderUsers(content); break;
        case 'products': renderProducts(content); break;
        case 'reviews': renderReviews(content); break;
        case 'sellers': renderSellers(content); break;
        case 'chat': renderChat(content); break;
        case 'notifications': renderNotifications(content); break;
        case 'whatsapp': renderWhatsapp(content); break;
        case 'northpay': renderNorthpay(content); break;
        case 'npinjam': renderNPinjam(content); break;
        case 'npinjam-scanner': renderNPinjamScanner(content); break;
        case 'affiliate': renderAffiliates(content); break;
        case 'reports': renderReports(content); break;
        case 'seller-earnings': renderSellerEarnings(content); break;
        case 'settings': renderSettings(content); break;
        case 'flash-discount': renderFlashDiscount(content); break;
        case 'database': renderDatabase(content); break;
        case 'logs': renderLogs(content); break;
        case 'traffic': renderTraffic(content); break;
        case 'visitors': renderVisitors(content); break;
        case 'server': renderServerStatus(content); break;
        case 'domain': renderDomain(content); break;
        case 'domain-manager': renderDomainManager(content); break;
        case 'filemanager': renderFileManager(content); break;
        case 'techstack': renderTechStack(content); break;
        case 'security': renderSecurity(content); break;
        case 'ai-models': renderAiModels(content); break;
      }
      if (hashPage === 'chat') {
        if (!chatPollInterval) chatPollInterval = setInterval(function () { if (currentPage === 'chat') { loadChatUsers(); loadActiveChatMessages(); } }, 10000);
      } else if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
      if (hashPage !== 'server' && serverRefreshInterval) { clearInterval(serverRefreshInterval); serverRefreshInterval = null; }
      updateTitle(hashPage);
    } else {
      navTo('dashboard');
    }
    fetchServerIP();
  } catch (e) {
    window.location.href = '/AppNorthAuthAdmin';
  }
});

window.addEventListener('hashchange', () => {
  var page = getPageFromHash();
  if (page && page !== currentPage) {
    navTo(page);
  }
});

document.getElementById('sidebar-nav').addEventListener('click', function (e) {
  const a = e.target.closest('a[data-page]');
  if (!a) return;
  e.preventDefault();
  const page = a.dataset.page;
  window.location.hash = page + '-' + getPageCode(page);
});

function navTo(page) {
  if (page.startsWith('db-')) {
    var dbTabMap = { 'db-overview': 'overview', 'db-users': 'users', 'db-tables': 'data', 'db-query': 'sql' };
    dbMgr.tab = dbTabMap[page] || 'overview';
    page = 'database';
  }
  currentPage = page;
  stopWaPagePoll();
  window.location.hash = page + '-' + getPageCode(page);
  updateTitle(page);
  var content = document.getElementById('page-content');
  content.innerHTML = googleLoader();
  switch (page) {
    case 'dashboard': renderDashboard(content); break;
    case 'orders': renderOrders(content); break;
    case 'users': renderUsers(content); break;
    case 'products': renderProducts(content); break;
    case 'reviews': renderReviews(content); break;
    case 'sellers': renderSellers(content); break;
    case 'chat': renderChat(content); break;
    case 'notifications': renderNotifications(content); break;
    case 'whatsapp': renderWhatsapp(content); break;
    case 'northpay': renderNorthpay(content); break;
    case 'npinjam': renderNPinjam(content); break;
    case 'npinjam-scanner': renderNPinjamScanner(content); break;
    case 'affiliate': renderAffiliates(content); break;
    case 'reports': renderReports(content); break;
    case 'seller-earnings': renderSellerEarnings(content); break;
    case 'settings': renderSettings(content); break;
    case 'flash-discount': renderFlashDiscount(content); break;
    case 'database': renderDatabase(content); break;
    case 'logs': renderLogs(content); break;
    case 'traffic': renderTraffic(content); break;
    case 'visitors': renderVisitors(content); break;
    case 'server': renderServerStatus(content); break;
    case 'domain': renderDomain(content); break;
    case 'domain-manager': renderDomainManager(content); break;
    case 'filemanager': renderFileManager(content); break;
    case 'techstack': renderTechStack(content); break;
    case 'security': renderSecurity(content); break;
    case "login-auth": window.location.href = '/AppNorthAuthAdmin'; break;
    case 'ai-models': renderAiModels(content); break;
  }
  if (page === 'chat') {
    if (!chatPollInterval) chatPollInterval = setInterval(function () { if (currentPage === 'chat') { loadChatUsers(); loadActiveChatMessages(); } }, 10000);
  } else if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
  if (page !== 'server' && serverRefreshInterval) {
    clearInterval(serverRefreshInterval);
    serverRefreshInterval = null;
  }
}

async function fetchServerIP() {
  try {
    var el = document.getElementById('admin-ip');
    var d = await api('/api/admin/techstack/network');
    if (d && d.publicIp) {
      el.textContent = d.publicIp;
    } else if (d && d.privateIp) {
      el.textContent = d.privateIp;
    } else {
      var r = await fetch('https://ifconfig.me');
      var ip = await r.text();
      el.textContent = ip.trim();
    }
  } catch (e) {
    var el2 = document.getElementById('admin-ip');
    if (el2) el2.textContent = 'Administrator';
  }
}

function showAdminGlobalSearch() {
  var results = document.getElementById('admin-global-search-results');
  if (!results) return;
  results.classList.add('show');
  if (!globalSearchQuery.trim()) {
    results.innerHTML = '<div style="padding:10px;font-size:12px;color:#6b7280">Cari pesanan, pelanggan, atau produk.</div>';
  }
}

function hideAdminGlobalSearch() {
  var results = document.getElementById('admin-global-search-results');
  if (results) results.classList.remove('show');
  globalSearchSequence++;
  clearTimeout(globalSearchTimeout);
}

function adminGlobalSearchInput(value) {
  globalSearchQuery = value;
  globalSearchSequence++;
  showAdminGlobalSearch();
  clearTimeout(globalSearchTimeout);
  globalSearchTimeout = setTimeout(adminGlobalSearchNow, 250);
}

function adminGlobalSearchNow() {
  clearTimeout(globalSearchTimeout);
  var input = document.getElementById('admin-global-search');
  if (input) globalSearchQuery = input.value;
  searchGlobalAdmin(globalSearchQuery);
}

function renderGlobalSearchSection(title, items, renderItem, error) {
  if (error) {
    return '<div class="card"><div class="section-title">' + title + '</div><p style="font-size:12px;color:#b91c1c">' + escapeHtml(error) + '</p></div>';
  }
  return '<div class="card"><div class="section-title">' + title + ' <span style="font-size:11px;color:#9ca3af;font-weight:400">(' + items.length + ')</span></div>' +
    (items.length ? '<div style="overflow-x:auto"><table><tbody>' + items.map(renderItem).join('') + '</tbody></table></div>' : '<p style="font-size:12px;color:#9ca3af">Tidak ada hasil.</p>') +
    '</div>';
}

async function searchGlobalAdmin(query) {
  var resultsEl = document.getElementById('admin-global-search-results');
  if (!resultsEl) return;
  var normalized = String(query || '').trim();
  var sequence = ++globalSearchSequence;
  resultsEl.classList.add('show');
  if (!normalized) {
    resultsEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#6b7280">Cari pesanan, pelanggan, atau produk.</div>';
    return;
  }
  if (normalized.length > 100) {
    resultsEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#b91c1c">Kata kunci maksimal 100 karakter.</div>';
    return;
  }
  resultsEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#6b7280">Mencari...</div>';

  var encoded = encodeURIComponent(normalized);
  var sources = await Promise.all([
    api('/api/admin/orders?page=1&limit=8&search=' + encoded),
    api('/api/admin/users?page=1&limit=8&search=' + encoded),
    api('/api/admin/products?search=' + encoded),
    api('/api/catalog/products?search=' + encoded)
  ].map(function (request) {
    return request.then(function (data) {
      if (!data || data.success === false) throw new Error((data && data.message) || 'Pencarian gagal.');
      return { data: data, error: '' };
    }).catch(function (error) {
      return { data: null, error: error.message || 'Pencarian gagal.' };
    });
  }));
  if (sequence !== globalSearchSequence || !resultsEl.classList.contains('show')) return;

  var orderSource = sources[0], userSource = sources[1], marketplaceSource = sources[2], catalogSource = sources[3];
  var html = '';
  html += renderGlobalSearchSection('Pesanan', orderSource.data && orderSource.data.orders || [], function (order) {
    return '<tr><td><strong>' + escapeHtml(order.order_id) + '</strong><div style="font-size:11px;color:#6b7280">' + escapeHtml(order.product_name || '') + ' · ' + escapeHtml(order.user_name || order.user_phone || 'Guest') + '</div></td><td>' + statusBadge(order.status) + '</td><td><button class="btn btn-outline btn-sm" onclick="openGlobalOrder(this)" data-order-id="' + escapeHtml(order.order_id) + '">Detail</button></td></tr>';
  }, orderSource.error);
  html += renderGlobalSearchSection('Pelanggan', userSource.data && userSource.data.users || [], function (user) {
    return '<tr><td><strong>' + escapeHtml(user.name || user.username || 'Tanpa nama') + '</strong><div style="font-size:11px;color:#6b7280">' + escapeHtml(user.email || user.phone || '') + '</div></td><td><button class="btn btn-outline btn-sm" onclick="openGlobalUser(this)" data-user-id="' + escapeHtml(String(user.id)) + '">Lihat pesanan</button></td></tr>';
  }, userSource.error);
  html += renderGlobalSearchSection('Produk Marketplace', marketplaceSource.data && marketplaceSource.data.products || [], function (product) {
    return '<tr><td><strong>' + escapeHtml(product.name || 'Produk') + '</strong><div style="font-size:11px;color:#6b7280">ID ' + escapeHtml(String(product.id)) + ' · ' + formatRp(product.price) + '</div></td><td><button class="btn btn-outline btn-sm" onclick="navTo(\'products\');hideAdminGlobalSearch()">Buka produk</button></td></tr>';
  }, marketplaceSource.error);
  html += renderGlobalSearchSection('Katalog Northline', catalogSource.data && catalogSource.data.products || [], function (product) {
    return '<tr><td><strong>' + escapeHtml(product.name || 'Produk') + '</strong><div style="font-size:11px;color:#6b7280">ID ' + escapeHtml(String(product.id)) + ' · ' + formatRp(product.price) + '</div></td><td><button class="btn btn-outline btn-sm" onclick="navTo(\'flash-discount\');hideAdminGlobalSearch()">Setting Price</button></td></tr>';
  }, catalogSource.error);
  resultsEl.innerHTML = html;
}

function openGlobalOrder(button) {
  var orderId = button && button.dataset ? button.dataset.orderId : '';
  hideAdminGlobalSearch();
  if (orderId) showOrderDetail(orderId);
}

function openGlobalUser(button) {
  var userId = button && button.dataset ? button.dataset.userId : '';
  hideAdminGlobalSearch();
  if (userId) showUserOrders(userId);
}

async function renderDashboard(el) {
  try {
    var d = await api('/api/admin/dashboard');
    el.innerHTML =
      '<div class="grid-stats">' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=UWsL0In9hUI3&format=png&color=000000"></div><div class="info"><h3>' + (d.totalOrders || 0) + '</h3><p>Total Orders</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=1gJg-CpQvqUy&format=png&color=000000"></div><div class="info"><h3>' + formatRp(d.revenue || 0) + '</h3><p>Revenue</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=102261&format=png&color=000000"></div><div class="info"><h3>' + (d.totalUsers || 0) + '</h3><p>Total Users</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=423&format=png&color=000000"></div><div class="info"><h3>' + (d.pendingOrders || 0) + '</h3><p>Pending Orders</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=Mn6BzTFFvZQy&format=png&color=000000"></div><div class="info"><h3>' + (d.totalProducts || 0) + '</h3><p>Products</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=4497&format=png&color=000000"></div><div class="info"><h3>' + (d.totalReviews || 0) + '</h3><p>Reviews</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=33934&format=png&color=000000"></div><div class="info"><h3>' + (d.pendingNpinjam || 0) + '</h3><p>NPinjam Pending</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=33934&format=png&color=000000"></div><div class="info"><h3>' + (d.pendingLoans || 0) + '</h3><p>Pinjaman Pending</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=118377&format=png&color=000000"></div><div class="info"><h3>' + (d.aiUsage.totalMessages || 0) + '</h3><p>AI Messages</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=7OMdCpw0sxP6&format=png&color=000000"></div><div class="info"><p>Token: ' + (d.aiUsage.totalBytes ? formatRp(d.aiUsage.totalBytes) : '0') + ' / ' + formatRp(d.aiUsage.limitBytes) + '</p><p>Batas: ' + d.aiUsage.limitMessages + ' pesan / ' + formatRp(d.aiUsage.limitBytes / 1000) + ' KB</p></div></div>' +
      '</div>' +
      (d.pendingOverdue > 0 ? '<div class="card" style="margin-bottom:16px;background:#fef2f2;border-color:#fca5a5;display:flex;align-items:center;justify-content:space-between"><span style="font-size:13px;color:#991b1b">⚠️ ' + d.pendingOverdue + ' order pending lebih dari 5 menit. <a href="#" onclick="navTo(\'orders\'); return false;" style="color:#DF414F;font-weight:600">Lihat</a></span></div>' : '') +
      '<div class="two-col"><div class="card"><div class="section-title">Penjualan 7 Hari</div><div style="position:relative;height:220px;width:100%"><canvas id="salesChart"></canvas></div></div><div class="card"><div class="section-title">Produk Terlaris</div><div style="position:relative;height:220px;width:100%"><canvas id="topProductsChart"></canvas></div></div></div>' +
      '<div class="card" style="margin-top:24px"><div class="section-title">Recent Orders</div><table><thead><tr><th>Order ID</th><th>Produk</th><th>Total</th><th>Status</th><th>Tanggal</th></tr></thead><tbody>' +
      (d.recentOrders || []).map(function (o) {
        return '<tr><td style="font-size:11px">' + escapeHtml(o.order_id) + '</td><td>' + escapeHtml(o.product_name) + '</td><td>' + formatRp(o.total_price) + '</td><td>' + statusBadge(o.status) + '</td><td>' + (o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : '') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
    setTimeout(function () {
      if (chartInstances.sales) chartInstances.sales.destroy();
      if (chartInstances.topProducts) chartInstances.topProducts.destroy();
      if (d.salesChart && d.salesChart.length) {
        chartInstances.sales = new Chart(document.getElementById('salesChart'), {
          type: 'line',
          data: { labels: d.salesChart.map(function (s) { return (s.date || '').slice(5); }), datasets: [{ label: 'Revenue', data: d.salesChart.map(function (s) { return Number(s.revenue); }), borderColor: '#DF414F', borderWidth: 2.5, tension: 0.4, fill: false, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: '#DF414F', pointBorderWidth: 2, pointHoverRadius: 6 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { color: '#6b7280', font: { size: 11 } } } } }
        });
      }
      if (d.topProducts && d.topProducts.length) {
        chartInstances.topProducts = new Chart(document.getElementById('topProductsChart'), {
          type: 'bar',
          data: { labels: d.topProducts.map(function (p) { return (p.product_name || '').substring(0, 20); }), datasets: [{ label: 'Terjual', data: d.topProducts.map(function (p) { return Number(p.total_sold); }), backgroundColor: '#DF414F', borderRadius: 4, barPercentage: 0.6 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { color: '#6b7280', font: { size: 11 }, stepSize: 1 } } } }
        });
      }
    }, 200);
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error loading dashboard</div>'; }
}

async function renderOrders(el) {
  try {
    var status = (document.getElementById('order-filter-status') || {}).value || '';
    var search = (document.getElementById('order-search') || {}).value || '';
    var d = await api('/api/admin/orders?page=' + ordersPage + '&limit=20&status=' + encodeURIComponent(status) + '&search=' + encodeURIComponent(search));
    el.innerHTML =
      '<div class="filter-bar"><input type="text" id="order-search" placeholder="Cari order ID, produk, user..." value="' + escapeHtml(search) + '" oninput="debouncedRenderOrders()"><select id="order-filter-status" onchange="debouncedRenderOrders()">' +
      '<option value="">Semua Status</option><option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option><option value="success"' + (status === 'success' ? ' selected' : '') + '>Success</option><option value="cancelled"' + (status === 'cancelled' ? ' selected' : '') + '>Cancelled</option></select>' +
      '<button class="btn btn-primary" onclick="ordersPage=1;debouncedRenderOrders()">Cari</button></div>' +
      '<div class="card"><table><thead><tr><th>Order ID</th><th>User</th><th>Produk</th><th>Total</th><th>Status</th><th>Delivery</th><th>Kurir</th><th>No. Resi</th><th>Estimasi</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>' +
      (d.orders || []).map(function (o) {
        var buyer = escapeHtml(o.user_name || o.username || '-');
        if (o.user_id == null) {
          buyer += '<div style="font-size:10px;color:#DF414F;font-weight:600">Guest' +
            (o.guest_ip_address ? ' · ' + escapeHtml(o.guest_ip_address) : '') + '</div>';
        }
        return '<tr><td style="font-size:11px">' + escapeHtml(o.order_id) + '</td><td>' + buyer + '</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(o.product_name) + '</td><td>' + formatRp(o.total_price) + '</td><td>' + statusBadge(o.status) + '</td><td style="font-size:11px">' + escapeHtml(o.delivery_status || '-') + '</td><td style="font-size:11px">' + escapeHtml(o.tracking_courier || '-') + '</td><td style="font-size:11px">' + (o.tracking_number ? '<span style="color:#166534">' + escapeHtml(o.tracking_number) + '</span>' : '-') + '</td><td style="font-size:11px">' + escapeHtml(o.estimated_arrival || '-') + '</td><td style="font-size:11px">' + (o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : '') + '</td><td style="white-space:nowrap">' +
        '<button class="btn btn-outline btn-sm" onclick="showOrderDetail(\'' + escapeHtml(o.order_id) + '\')">Detail</button> ' +
        (o.status === 'pending' ? '<button class="btn btn-success btn-sm" onclick="confirmOrder(\'' + escapeHtml(o.order_id) + '\')">Confirm</button> <button class="btn btn-primary btn-sm" onclick="waRemind(\'' + escapeHtml(o.order_id) + '\')">WA</button> <button class="btn btn-danger btn-sm" onclick="cancelOrder(\'' + escapeHtml(o.order_id) + '\')">Cancel</button>' : '') +
        (o.status === 'success' ? '<button class="btn btn-outline btn-sm" onclick="showDeliveryModal(\'' + escapeHtml(o.order_id) + '\')">Tracking</button>' : '') +
        '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.orders || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada order</p>' : '') +
      '<div class="pagination"><button onclick="ordersPage=Math.max(1,ordersPage-1);debouncedRenderOrders()"' + (ordersPage <= 1 ? ' disabled' : '') + '>Prev</button><span>Page ' + (d.page || ordersPage) + ' of ' + Math.ceil((d.total || 0) / (d.limit || 20)) + '</span><button onclick="ordersPage++;debouncedRenderOrders()"' + (ordersPage >= Math.ceil((d.total || 0) / (d.limit || 20)) ? ' disabled' : '') + '>Next</button></div></div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

function debouncedRenderOrders() {
  clearTimeout(renderOrdersTimeout);
  renderOrdersTimeout = setTimeout(function () { navTo('orders'); }, 300);
}

async function confirmOrder(orderId) {
  if (!confirm('Konfirmasi pembayaran order ini?')) return;
  var d = await api('/api/admin/orders/confirm', { method: 'POST', body: JSON.stringify({ orderId: orderId }) });
  if (d.success) navTo('orders'); else alert(d.message);
}

async function waRemind(orderId) {
  if (!confirm('Kirim WA reminder ke user?')) return;
  var d = await api('/api/admin/orders/wa-remind', { method: 'POST', body: JSON.stringify({ orderId: orderId }) });
  alert(d.message);
}

async function cancelOrder(orderId) {
  if (!confirm('Yakin cancel order ini?')) return;
  var d = await api('/api/admin/orders/cancel', { method: 'POST', body: JSON.stringify({ orderId: orderId }) });
  if (d.success) navTo('orders'); else alert(d.message);
}

function showDeliveryModal(orderId) {
  showModal('<h2>Atur Pengiriman / Resi</h2><p style="font-size:13px;color:#6b7280;margin-bottom:12px">Order: ' + escapeHtml(orderId) + '</p>' +
    '<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Kurir</label><select id="delivery-courier-select" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"><option value="">Pilih Kurir</option><option value="JNE">JNE</option><option value="J&T Express">J&T Express</option><option value="SiCepat">SiCepat</option><option value="AnterAja">AnterAja</option><option value="Ninja Express">Ninja Express</option><option value="Lion Parcel">Lion Parcel</option><option value="GoSend">GoSend</option><option value="GrabExpress">GrabExpress</option><option value="Lainnya">Lainnya</option></select></div>' +
    '<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">No. Resi</label><input id="delivery-resi-input" type="text" placeholder="Contoh: JP001234567890" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
    '<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Status Pengiriman</label><select id="delivery-status-select" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"><option value="Pesanan Diproses">Pesanan Diproses</option><option value="Pesanan Dikirim">Pesanan Dikirim</option><option value="Pesanan Selesai">Pesanan Selesai</option></select></div>' +
    '<div style="margin-bottom:16px"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Estimasi Tiba</label><input type="date" id="estimated-arrival-input" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
    '<div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="updateDelivery(\'' + escapeHtml(orderId) + '\')">Simpan</button><button class="btn btn-outline" onclick="closeModal()">Batal</button></div>');
}

async function updateDelivery(orderId) {
  var ds = document.getElementById('delivery-status-select').value;
  var ea = document.getElementById('estimated-arrival-input').value;
  var courier = document.getElementById('delivery-courier-select').value;
  var resi = document.getElementById('delivery-resi-input').value.trim();
  await api('/api/admin/orders/delivery', { method: 'POST', body: JSON.stringify({ orderId: orderId, deliveryStatus: ds, estimatedArrival: ea, courier: courier, trackingNumber: resi }) });
  closeModal();
  navTo('orders');
}

async function showOrderDetail(orderId) {
  var d = await api('/api/admin/orders/' + encodeURIComponent(orderId));
  if (!d.success || !d.order) { alert(d.message || 'Order tidak ditemukan'); return; }
  var o = d.order;
  var seller = d.seller || {};
  var events = d.events || [];
  var eventsHtml = events.length
    ? events.map(function (e, i) {
        return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f3f4f6">' +
          '<div style="width:12px;height:12px;border-radius:50%;background:' + (i === events.length - 1 ? '#DF414F' : '#fff') + ';border:2px solid #DF414F;flex-shrink:0;margin-top:2px"></div>' +
          '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:#111">' + escapeHtml(e.status) + '</div>' +
          (e.description ? '<div style="font-size:11px;color:#6b7280">' + escapeHtml(e.description) + '</div>' : '') +
          (e.location ? '<div style="font-size:11px;color:#9ca3af">' + escapeHtml(e.location) + '</div>' : '') +
          (e.lat != null && e.lng != null ? '<div class="flex flex-row gap-1 items-center" style="font-size:10px;color:#9ca3af;margin-top:1px"><img src="https://img.icons8.com/?size=100&id=13800&format=png&color=9CA3AF" class="w-3 h-3"">' + Number(e.lat).toFixed(6) + ', ' + Number(e.lng).toFixed(6) + '</div>' : '') +
          '<div style="font-size:10px;color:#9ca3af">' + (e.created_at ? new Date(e.created_at).toLocaleString('id-ID') : '') + '</div></div></div>';
      }).join('')
    : '<p style="text-align:center;padding:16px;color:#9ca3af">Belum ada event tracking</p>';

  showModal(
    '<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Detail Order</h2><div>' +
    (o.tracking_number ? '<button class="btn btn-primary btn-sm" onclick="printAdminResi(\'' + escapeHtml(o.order_id) + '\')">Unduh Resi</button> ' : '') +
    '<button class="btn btn-outline btn-sm" onclick="showDeliveryModal(\'' + escapeHtml(o.order_id) + '\')">Atur Resi</button></div></div>' +
    '<p style="font-size:11px;color:#9ca3af;margin:4px 0 14px">' + escapeHtml(o.order_id) + '</p>' +
    '<div class="section-title">Info Pembeli</div>' +
    '<div style="font-size:13px;color:#374151;margin-bottom:12px">' +
      '<div>' + escapeHtml(o.user_name || o.username || '-') + (o.user_id == null ? ' <span style="font-size:10px;color:#DF414F;font-weight:600">GUEST</span>' : '') + (o.user_phone ? ' (' + escapeHtml(o.user_phone) + ')' : '') + '</div>' +
      (o.guest_ip_address ? '<div style="font-size:11px;color:#6b7280;margin-top:4px">IP: ' + escapeHtml(o.guest_ip_address) + '</div>' : '') +
      '<div style="font-size:11px;color:#6b7280;margin-top:4px;white-space:pre-wrap">' + escapeHtml(o.shipping_address || '-') + '</div>' +
    '</div>' +
    '<div class="section-title">Produk</div>' +
    '<div style="display:flex;gap:10px;margin-bottom:14px">' +
      (o.product_image ? '<img src="' + escapeHtml(o.product_image) + '" style="width:56px;height:56px;object-fit:cover;border:1px solid #e5e7eb" onerror="this.style.display=\'none\'">' : '') +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#111">' + escapeHtml(o.product_name) + '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + [o.chosen_color, o.chosen_size, o.chosen_model].filter(Boolean).join(' • ') + ' • Qty ' + (o.quantity || 1) + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:#111;margin-top:4px">' + formatRp(o.total_price) + (o.payment_method ? ' <span style="font-size:10px;color:#6b7280;font-weight:400">via ' + escapeHtml(o.payment_method) + '</span>' : '') + '</div></div>' +
    '</div>' +
    '<div class="section-title">Tracking</div>' +
    '<div style="margin-bottom:8px"><table style="font-size:12px"><tbody>' +
      '<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Status Pengiriman</td><td>' + escapeHtml(o.delivery_status || '-') + '</td></tr>' +
      '<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Kurir</td><td>' + escapeHtml(o.tracking_courier || '-') + '</td></tr>' +
      '<tr><td style="color:#6b7280;padding:2px 8px 2px 0">No. Resi</td><td style="color:#166534;font-weight:600">' + escapeHtml(o.tracking_number || '-') + '</td></tr>' +
      '<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Dikirim</td><td>' + (o.shipped_at ? new Date(o.shipped_at).toLocaleString('id-ID') : '-') + '</td></tr>' +
      '<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Estimasi Tiba</td><td>' + escapeHtml(o.estimated_arrival || '-') + '</td></tr>' +
    '</tbody></table></div>' +
    '<div class="section-title">Riwayat Pengiriman</div>' +
    '<div style="margin-bottom:12px">' + eventsHtml + '</div>' +
    '<div style="border-top:1px solid #e5e7eb;padding-top:12px">' +
      '<div class="section-title" style="margin-bottom:8px">Tambah Update Tracking</div>' +
      '<input id="admin-tl-status" type="text" placeholder="Status (mis. Paket dalam perjalanan)" style="width:100%;height:34px;border:1px solid #d1d5db;padding:0 10px;font-size:12px;margin-bottom:8px">' +
      '<div style="display:flex;gap:8px"><input id="admin-tl-location" type="text" placeholder="Lokasi" style="flex:1;height:34px;border:1px solid #d1d5db;padding:0 10px;font-size:12px">' +
      '<button class="btn btn-primary btn-sm" onclick="addAdminTrackingEvent(\'' + escapeHtml(o.order_id) + '\')">Tambah</button></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><input id="admin-tl-lat" type="text" placeholder="Latitude" style="flex:1;height:34px;border:1px solid #d1d5db;padding:0 10px;font-size:12px">' +
      '<input id="admin-tl-lng" type="text" placeholder="Longitude" style="flex:1;height:34px;border:1px solid #d1d5db;padding:0 10px;font-size:12px"></div>' +
      '<div id="admin-tl-map" style="height:180px;border:1px solid #d1d5db;border-radius:4px;margin-top:8px"></div>' +
      '<div style="font-size:10px;color:#9ca3af;margin-top:4px">Klik pada peta untuk menandai titik lokasi event ini (opsional, dipakai untuk garis pengiriman).</div>' +
    '</div>' +
    '<div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn btn-outline" onclick="closeModal()">Tutup</button></div>');
  initAdminMapPicker('admin-tl-map', 'admin-tl-lat', 'admin-tl-lng');
}

async function addAdminTrackingEvent(orderId) {
  var status = document.getElementById('admin-tl-status').value.trim();
  var location = document.getElementById('admin-tl-location').value.trim();
  var lat = document.getElementById('admin-tl-lat').value.trim();
  var lng = document.getElementById('admin-tl-lng').value.trim();
  if (!status) { alert('Isi status terlebih dahulu'); return; }
  var d = await api('/api/admin/orders/' + encodeURIComponent(orderId) + '/tracking', { method: 'POST', body: JSON.stringify({ status: status, location: location, lat: lat, lng: lng }) });
  if (d.success) showOrderDetail(orderId); else alert(d.message || 'Gagal menambah update');
}

function buildAdminResiLabelHTML(d) {
  var o = d.order || {}, s = d.seller || {};
  var courier = o.tracking_courier || 'Lainnya';
  var resi = o.tracking_number || '';
  var buyer = o.user_name || o.username || 'Pembeli';
  var buyerPhone = o.user_phone || '';
  var address = String(o.shipping_address || '').split(' @Coordinates:')[0];
  var product = o.product_name || '';
  var variant = [o.chosen_color, o.chosen_size, o.chosen_model].filter(Boolean).join(' • ');
  var qty = o.quantity || 1;
  var total = o.total_price || 0;
  var date = o.shipped_at ? new Date(o.shipped_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID');
  var storeName = s.store_name || 'Northline Seller';
  var storeCity = s.city || '';
  var storeAddr = s.address || '';
  return '<!DOCTYPE html>\n<html lang="id">\n<head>\n<meta charset="UTF-8">\n<title>Resi Pengiriman ' + escapeHtml(o.order_id || '') + '</title>\n' +
    '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>\n' +
    '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}body{background:#f3f4f6;padding:24px}.label{width:420px;margin:0 auto 20px;background:#fff;border:1px solid #d1d5db}.label-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:3px solid #DF414F}.label-head .brand{font-size:18px;font-weight:900;color:#DF414F;letter-spacing:1px}.label-head .courier{text-align:right;font-size:11px;color:#6b7280}.label-head .courier b{display:block;font-size:15px;color:#111}.label-body{padding:16px 18px}.barcode-wrap{text-align:center;padding:8px 0 14px;border-bottom:1px dashed #e5e7eb}.barcode-wrap svg,.barcode-wrap img{max-width:100%}.resi-number{text-align:center;font-size:20px;font-weight:800;letter-spacing:2px;color:#111;margin-top:6px}.sections{display:flex;gap:16px;margin-top:14px}.section{flex:1}.section h4{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:6px;border-bottom:1px solid #f3f4f6;padding-bottom:4px}.section p{font-size:12px;line-height:1.5;color:#374151}.order-meta{display:flex;justify-content:space-between;margin-top:14px;font-size:11px;color:#6b7280}.order-meta b{color:#111}.product-box{margin-top:14px;border:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:10px;align-items:center}.product-box img{width:56px;height:56px;object-fit:cover;border:1px solid #e5e7eb}.product-box .pname{font-size:12px;font-weight:700;color:#111}.product-box .pvar{font-size:11px;color:#6b7280;margin-top:2px}.product-box .pqty{font-size:12px;color:#374151;margin-top:4px}.product-box .ptotal{font-size:13px;font-weight:800;color:#DF414F;margin-top:4px}.note{margin-top:12px;font-size:10px;color:#9ca3af;text-align:center}.toolbar{max-width:420px;margin:0 auto 16px;display:flex;gap:10px}.toolbar button{flex:1;padding:12px;font-size:14px;font-weight:700;border:none;cursor:pointer}.btn-print{background:#DF414F;color:#fff}.btn-close{background:#fff;color:#374151;border:1px solid #d1d5db!important}@media print{body{background:#fff;padding:0}.toolbar{display:none}.label{margin:0;border:none}}</style>\n</head>\n<body>\n' +
    '<div class="toolbar"><button class="btn-print" onclick="window.print()">Cetak Resi</button><button class="btn-close" onclick="window.close()">Tutup</button></div>\n' +
    '<div class="label"><div class="label-head"><div class="brand">NORTHLINE</div><div class="courier"><b>' + escapeHtml(courier) + '</b>Kurir Pengiriman</div></div>\n' +
    '<div class="label-body"><div class="barcode-wrap"><svg id="barcode"></svg><div class="resi-number">' + escapeHtml(resi) + '</div></div>\n' +
    '<div class="sections"><div class="section"><h4>Pengirim</h4><p><b>' + escapeHtml(storeName) + '</b><br>' + escapeHtml(storeCity) + '<br>' + escapeHtml(storeAddr) + '</p></div>\n' +
    '<div class="section"><h4>Penerima</h4><p><b>' + escapeHtml(buyer) + '</b>' + (buyerPhone ? '<br>' + escapeHtml(buyerPhone) : '') + '<br>' + escapeHtml(address) + '</p></div></div>\n' +
    '<div class="order-meta"><span>Order: <b>' + escapeHtml(o.order_id || '') + '</b></span><span>Tanggal: <b>' + escapeHtml(date) + '</b></span></div>\n' +
    '<div class="product-box"><img src="' + escapeHtml(o.product_image || '') + '" onerror="this.style.visibility=\'hidden\'"><div><div class="pname">' + escapeHtml(product) + '</div>' +
    (variant ? '<div class="pvar">' + escapeHtml(variant) + '</div>' : '') +
    '<div class="pqty">Jumlah: ' + qty + '</div><div class="ptotal">' + formatRp(total) + '</div></div></div>\n' +
    '<div class="note">Resi ini adalah bukti pengiriman. Tempelkan pada paket sebelum diserahkan ke kurir.</div></div></div>\n' +
    '<script>try{JsBarcode("#barcode","' + (resi || 'NORTHLINE') + '",{format:"CODE128",width:2,height:70,displayValue:false});}catch(e){document.getElementById("barcode").outerHTML="<div style=\'font-size:12px;color:#9ca3af\'>BARCODE UNAVAILABLE</div>";}</script>\n' +
    '</body></html>';
}

async function printAdminResi(orderId) {
  var d = await api('/api/admin/orders/' + encodeURIComponent(orderId));
  if (!d.success || !d.order) { alert(d.message || 'Order tidak ditemukan'); return; }
  if (!d.order.tracking_number) { alert('Order ini belum memiliki nomor resi'); return; }
  var w = window.open('', '_blank', 'width=480,height=720');
  if (!w) { alert('Izinkan popup untuk mencetak resi'); return; }
  w.document.write(buildAdminResiLabelHTML(d));
  w.document.close();
}

async function renderUsers(el) {
  try {
    var search = (document.getElementById('user-search') || {}).value || '';
    var d = await api('/api/admin/users?page=' + usersPage + '&limit=20&search=' + encodeURIComponent(search));
    el.innerHTML =
      '<div class="filter-bar"><input type="text" id="user-search" placeholder="Cari nama, email, no HP..." value="' + escapeHtml(search) + '" oninput="debouncedRenderUsers()"><button class="btn btn-primary" onclick="usersPage=1;debouncedRenderUsers()">Cari</button></div>' +
      '<div class="card"><table><thead><tr><th>Nama</th><th>Username</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Role</th><th>Join</th><th>Aksi</th></tr></thead><tbody>' +
      (d.users || []).map(function (u) {
        return '<tr><td>' + escapeHtml(u.name || '-') + '</td><td>' + escapeHtml(u.username) + '</td><td style="font-size:11px">' + escapeHtml(u.email) + '</td><td>' + escapeHtml(u.phone || '-') + '</td><td>' + (u.total_orders || 0) + '</td><td>' + formatRp(u.total_spent || 0) + '</td><td>' + escapeHtml(u.role) + '</td><td style="font-size:11px">' + (u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : '') + '</td><td><button class="btn btn-outline btn-sm" onclick="showUserOrders(' + u.id + ')">Orders</button></td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.users || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada user</p>' : '') +
      '<div class="pagination"><button onclick="usersPage=Math.max(1,usersPage-1);debouncedRenderUsers()"' + (usersPage <= 1 ? ' disabled' : '') + '>Prev</button><span>Page ' + (d.page || usersPage) + ' of ' + Math.ceil((d.total || 0) / (d.limit || 20)) + '</span><button onclick="usersPage++;debouncedRenderUsers()"' + (usersPage >= Math.ceil((d.total || 0) / (d.limit || 20)) ? ' disabled' : '') + '>Next</button></div></div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

function debouncedRenderUsers() {
  clearTimeout(renderUsersTimeout);
  renderUsersTimeout = setTimeout(function () { navTo('users'); }, 300);
}

async function showUserOrders(userId) {
  var d = await api('/api/admin/users/' + userId + '/orders');
  var orders = d.orders || [];
  var html = '<h2>Orders User #' + userId + '</h2><table><thead><tr><th>Order ID</th><th>Produk</th><th>Total</th><th>Status</th><th>Tanggal</th></tr></thead><tbody>';
  html += orders.map(function (o) {
    return '<tr><td>' + escapeHtml(o.order_id) + '</td><td>' + escapeHtml(o.product_name) + '</td><td>' + formatRp(o.total_price) + '</td><td>' + statusBadge(o.status) + '</td><td>' + (o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : '') + '</td></tr>';
  }).join('');
  html += '</tbody></table>' + (orders.length === 0 ? '<p style="text-align:center;padding:16px;color:#9ca3af">Belum ada order</p>' : '');
  showModal(html);
}

async function renderProducts(el) {
  try {
    var d = await api('/api/admin/products');
    var salesMap = {};
    (d.productSales || []).forEach(function (s) { salesMap[s.product_name] = s; });
    el.innerHTML =
      '<div class="card"><div class="section-title">Produk Marketplace</div><table><thead><tr><th>Nama</th><th>Harga</th><th>Terjual</th><th>Revenue</th><th>Status</th></tr></thead><tbody>' +
      (d.products || []).map(function (p) {
        var sale = salesMap[p.name] || { total_sold: 0, total_revenue: 0 };
        return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + formatRp(p.price) + '</td><td>' + (sale.total_sold || 0) + '</td><td>' + formatRp(sale.total_revenue || 0) + '</td><td>' + statusBadge(p.status) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.products || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada produk</p>' : '') +
      '</div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

async function renderReviews(el) {
  try {
    var rating = (document.getElementById('review-filter-rating') || {}).value || '';
    var d = await api('/api/admin/reviews?page=' + reviewsPage + '&limit=20&rating=' + rating);
    el.innerHTML =
      '<div class="filter-bar"><select id="review-filter-rating" onchange="reviewsPage=1;debouncedRenderReviews()">' +
      '<option value="">Semua Rating</option>' +
      [5, 4, 3, 2, 1].map(function (r) { return '<option value="' + r + '"' + (rating === String(r) ? ' selected' : '') + '>' + r + ' Bintang</option>'; }).join('') +
      '</select></div>' +
      '<div class="card"><table><thead><tr><th>Produk</th><th>User</th><th>Rating</th><th>Komentar</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>' +
      (d.reviews || []).map(function (r) {
        var replyBadge = r.reply_text ? '<span class="badge badge-success" style="font-size:10px">Sudah dibalas</span>' : '';
        return '<tr><td>' + escapeHtml(r.product_name || r.product_id) + '</td><td>' + escapeHtml(r.username) + '</td><td>' + renderStars(r.rating) + '</td><td style="max-width:250px">' + escapeHtml(r.comment_text || r.review_text) + (r.reply_text ? '<div style="margin-top:6px;padding:6px;background:#f3f4f6;border-left:2px solid #DF414F;font-size:11px"><b>Balasan:</b> ' + escapeHtml(r.reply_text) + '</div>' : '') + '</td><td style="font-size:11px">' + (r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '') + '</td><td style="white-space:nowrap">' + replyBadge + '<button class="btn btn-sm" style="margin-left:4px" onclick="replyReview(' + r.id + ', \'' + escapeHtml(String(r.reply_text || '').replace(/'/g, "\\'")) + '\')">Balas</button><button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="deleteReview(' + r.id + ')">Hapus</button></td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.reviews || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada review</p>' : '') +
      '<div class="pagination"><button onclick="reviewsPage=Math.max(1,reviewsPage-1);debouncedRenderReviews()"' + (reviewsPage <= 1 ? ' disabled' : '') + '>Prev</button><span>Page ' + (d.page || reviewsPage) + ' of ' + Math.ceil((d.total || 0) / (d.limit || 20)) + '</span><button onclick="reviewsPage++;debouncedRenderReviews()"' + (reviewsPage >= Math.ceil((d.total || 0) / (d.limit || 20)) ? ' disabled' : '') + '>Next</button></div></div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

function debouncedRenderReviews() {
  clearTimeout(renderReviewsTimeout);
  renderReviewsTimeout = setTimeout(function () { navTo('reviews'); }, 300);
}

async function deleteReview(id) {
  if (!confirm('Hapus review ini?')) return;
  await api('/api/admin/reviews/' + id, { method: 'DELETE' });
  navTo('reviews');
}

async function replyReview(id, currentReply) {
  const text = prompt('Tulis balasan untuk review ini:', currentReply || '');
  if (text === null) return;
  if (!text.trim()) {
    alert('Balasan tidak boleh kosong');
    return;
  }
  await api('/api/admin/reviews/' + id + '/reply', {
    method: 'POST',
    body: JSON.stringify({ replyText: text.trim() })
  });
  navTo('reviews');
}

async function renderSellers(el) {
  try {
    var status = (document.getElementById('seller-filter') || {}).value || '';
    var d = await api('/api/admin/sellers?status=' + status);
    el.innerHTML =
      '<div class="filter-bar"><select id="seller-filter" onchange="renderSellers(document.getElementById(\'page-content\'))">' +
      '<option value="">Semua</option><option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option><option value="approved"' + (status === 'approved' ? ' selected' : '') + '>Approved</option><option value="rejected"' + (status === 'rejected' ? ' selected' : '') + '>Rejected</option></select></div>' +
      '<div class="card"><table><thead><tr><th>Toko</th><th>Pemilik</th><th>Email</th><th>WA</th><th>Kota</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' +
      (d.sellers || []).map(function (s) {
        return '<tr><td>' + escapeHtml(s.store_name) + '</td><td>' + escapeHtml(s.user_name) + '</td><td style="font-size:11px">' + escapeHtml(s.business_email) + '</td><td>' + escapeHtml(s.whatsapp) + '</td><td>' + escapeHtml(s.city || '-') + '</td><td>' + statusBadge(s.status) + '</td><td style="white-space:nowrap">' +
        (s.status === 'pending' ? '<button class="btn btn-success btn-sm" onclick="approveSeller(' + s.id + ')">Approve</button> <button class="btn btn-danger btn-sm" onclick="rejectSeller(' + s.id + ')">Reject</button>' : '') +
        (s.status === 'approved' ? '<span style="font-size:11px;color:#16a34a">Terverifikasi</span>' : '') +
        (s.status === 'rejected' ? '<span style="font-size:11px;color:#ef4444">Ditolak</span>' : '') +
        '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.sellers || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada seller</p>' : '') +
      '</div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

async function approveSeller(id) {
  await api('/api/admin/sellers/' + id + '/approve', { method: 'POST' });
  navTo('sellers');
}

async function rejectSeller(id) {
  await api('/api/admin/sellers/' + id + '/reject', { method: 'POST' });
  navTo('sellers');
}

async function renderChat(el) {
  currentChatUserId = null;
  el.innerHTML =
    '<div class="chat-container" id="chat-container">' +
    '<div class="chat-users">' +
    '<div class="chat-users-head">' +
    '<div class="chat-title"><span>Pesan</span><span id="chat-unread-total"></span></div>' +
    '<input type="text" class="chat-user-search" id="chat-search-input" placeholder="Cari user..." oninput="filterChatUsers()">' +
    '<select class="chat-user-select" id="chat-user-select" onchange="selectChatUserByDropdown(this)"><option value="">Pilih user...</option></select>' +
    '</div>' +
    '<div class="chat-user-list" id="chat-user-list"><div class="chat-empty">Memuat...</div></div>' +
    '</div>' +
    '<div class="chat-main">' +
    '<div class="chat-header">' +
    '<button class="chat-back-btn" onclick="showChatList()"><img src="https://img.icons8.com/?size=100&id=61&format=png&color=6B7280"></button>' +
    '<div class="chat-header-avatar" id="chat-header-avatar">?</div>' +
    '<div class="chat-header-info"><div class="chat-header-name" id="chat-header-name">Pilih user untuk chat</div><div class="chat-header-sub" id="chat-header-sub">Klik user untuk memulai percakapan</div></div>' +
    '</div>' +
    '<div class="chat-msg" id="chat-msg-area"><div class="chat-empty">Pilih user dari daftar</div></div>' +
    '<div class="chat-input"><input type="text" id="chat-input-field" placeholder="Tulis pesan..." onkeydown="if(event.key===\'Enter\')sendChatMsg()"><button onclick="sendChatMsg()"><img src="https://img.icons8.com/?size=100&id=bmqaSU1DN4QP&format=png&color=ffffff" class="w-5 h-5"></button></div>' +
    '</div>' +
    '</div>';
  loadChatUsers();
}

function initialsOf(name) {
  var s = String(name || '?').trim();
  if (!s) return '?';
  return s.split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
}

async function loadChatUsers() {
  try {
    var users = await api('/api/admin/chat-users');
    chatUsersData = users || [];
    var list = document.getElementById('chat-user-list');
    if (!list) return;
    var totalUnread = chatUsersData.reduce(function (a, u) { return a + (u.unread || 0); }, 0);
    var totalEl = document.getElementById('chat-unread-total');
    if (totalEl) totalEl.innerHTML = totalUnread > 0 ? '<span class="chat-unread">' + totalUnread + '</span>' : '';
    var select = document.getElementById('chat-user-select');
    if (select) {
      var currentVal = select.value;
      select.innerHTML = '<option value="">Pilih user...</option>' + chatUsersData.map(function (u) {
        return '<option value="' + u.id + '">' + escapeHtml(u.name) + '</option>';
      }).join('');
      select.value = currentVal;
    }
    list.innerHTML = chatUsersData.map(function (u) {
      return '<div class="chat-user-item' + (currentChatUserId === u.id ? ' active' : '') + '" onclick="selectChatUser(' + u.id + ',\'' + escapeHtml(u.name).replace(/'/g, "\\'") + '\')">' +
        '<div class="chat-user-avatar">' + escapeHtml(initialsOf(u.name)) + '</div>' +
        '<div class="chat-user-body">' +
        '<div class="chat-user-top"><span class="chat-user-name">' + escapeHtml(u.name) + '</span>' + (u.last_time ? '<span class="chat-user-time">' + escapeHtml(u.last_time) + '</span>' : '') + '</div>' +
        '<div class="chat-user-preview">' + escapeHtml(u.last_message || 'Belum ada pesan') + '</div>' +
        '</div>' +
        (u.unread > 0 ? '<span class="chat-unread">' + u.unread + '</span>' : '') +
        '</div>';
    }).join('') || '<div class="chat-empty">Belum ada percakapan</div>';
  } catch (e) {
    var l = document.getElementById('chat-user-list');
    if (l) l.innerHTML = '<div class="chat-empty">Gagal memuat percakapan</div>';
  }
}

function filterChatUsers() {
  var q = (document.getElementById('chat-search-input').value || '').toLowerCase();
  document.querySelectorAll('.chat-user-item').forEach(function (el) {
    var name = (el.querySelector('.chat-user-name') || {}).textContent || '';
    var preview = (el.querySelector('.chat-user-preview') || {}).textContent || '';
    el.style.display = (name.toLowerCase().indexOf(q) > -1 || preview.toLowerCase().indexOf(q) > -1) ? 'flex' : 'none';
  });
}

function showChatThread() {
  var c = document.getElementById('chat-container');
  if (c) c.classList.add('show-thread');
}

function showChatList() {
  var c = document.getElementById('chat-container');
  if (c) c.classList.remove('show-thread');
}

async function selectChatUser(userId, userName) {
  currentChatUserId = userId;
  document.getElementById('chat-header-name').textContent = userName;
  document.getElementById('chat-header-sub').textContent = 'Pengguna';
  document.getElementById('chat-header-avatar').textContent = initialsOf(userName);
  var select = document.getElementById('chat-user-select');
  if (select) select.value = String(userId);
  document.querySelectorAll('.chat-user-item').forEach(function (el) { el.classList.remove('active'); });
  var items = document.querySelectorAll('.chat-user-item');
  for (var i = 0; i < items.length; i++) {
    if (items[i].getAttribute('onclick') && items[i].getAttribute('onclick').indexOf('' + userId) > -1) {
      items[i].classList.add('active');
      break;
    }
  }
  showChatThread();
  try {
    var msgs = await api('/api/chat/' + userId);
    var area = document.getElementById('chat-msg-area');
    area.innerHTML = (msgs.messages || []).map(function (m) {
      var content = m.type === 'image'
        ? '<img src="' + escapeHtml(m.message) + '" alt="Foto chat" style="display:block;max-width:220px;max-height:280px;object-fit:contain;border-radius:8px">' +
          (m.caption ? '<div style="margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(m.caption) + '</div>' : '')
        : escapeHtml(typeof m.message === 'string' ? m.message : JSON.stringify(m.message));
      return '<div class="' + (m.sender === 'user' ? 'bubble-admin' : 'bubble-user') + '"><div>' + content + '</div><div class="bubble-time">' + escapeHtml(m.time || '') + '</div></div>';
    }).join('');
    area.scrollTop = area.scrollHeight;
    await api('/api/admin/read/' + userId, { method: 'POST' });
    loadChatUsers();
  } catch (e) {}
}

function selectChatUserByDropdown(sel) {
  var id = sel.value;
  if (!id) return;
  var u = chatUsersData.find(function (x) { return String(x.id) === String(id); });
  selectChatUser(u ? u.id : Number(id), u ? u.name : 'User #' + id);
  sel.value = '';
}

async function loadActiveChatMessages() {
  if (!currentChatUserId) return;
  var area = document.getElementById('chat-msg-area');
  if (!area) return;
  var lastMsg = area.lastElementChild;
  try {
    var msgs = await api('/api/chat/' + currentChatUserId);
    var html = (msgs.messages || []).map(function (m) {
      var content = m.type === 'image'
        ? '<img src="' + escapeHtml(m.message) + '" alt="Foto chat" style="display:block;max-width:220px;max-height:280px;object-fit:contain;border-radius:8px">' +
          (m.caption ? '<div style="margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(m.caption) + '</div>' : '')
        : escapeHtml(typeof m.message === 'string' ? m.message : JSON.stringify(m.message));
      return '<div class="' + (m.sender === 'user' ? 'bubble-admin' : 'bubble-user') + '"><div>' + content + '</div><div class="bubble-time">' + escapeHtml(m.time || '') + '</div></div>';
    }).join('');
    var shouldScroll = area.scrollTop + area.clientHeight >= area.scrollHeight - 40;
    if (area.innerHTML !== html) area.innerHTML = html;
    if (shouldScroll) area.scrollTop = area.scrollHeight;
    await api('/api/admin/read/' + currentChatUserId, { method: 'POST' });
    loadChatUsers();
  } catch (e) {}
}

async function sendChatMsg() {
  var input = document.getElementById('chat-input-field');
  var msg = (input.value || '').trim();
  if (!msg || !currentChatUserId) return;
  input.value = '';
  await api('/api/admin/send', { method: 'POST', body: JSON.stringify({ userId: currentChatUserId, message: msg }) });
  var area = document.getElementById('chat-msg-area');
  var now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  area.insertAdjacentHTML('beforeend', '<div class="bubble-user"><div>' + escapeHtml(msg) + '</div><div class="bubble-time">' + now + '</div></div>');
  area.scrollTop = area.scrollHeight;
  loadChatUsers();
}

async function renderNotifications(el) {
  try {
    var d = await api('/api/admin/notifications');
    el.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="section-title">Kirim Notifikasi</div><div style="display:flex;flex-direction:column;gap:12px">' +
      '<input type="text" id="notif-title" placeholder="Judul" style="height:38px;border:1px solid #d1d5db;padding:0 12px">' +
      '<textarea id="notif-message" placeholder="Isi pesan..." style="height:80px;border:1px solid #d1d5db;padding:8px 12px;resize:none"></textarea>' +
      '<div><button class="btn btn-primary" onclick="sendNotification()">Kirim ke Semua User</button></div></div></div>' +
      '<div class="card"><div class="section-title">Riwayat Notifikasi</div><table><thead><tr><th>Title</th><th>Pesan</th><th>Global</th><th>Tanggal</th></tr></thead><tbody>' +
      (d.notifications || []).map(function (n) {
        return '<tr><td>' + escapeHtml(n.title) + '</td><td style="max-width:300px">' + escapeHtml(n.message) + '</td><td>' + (n.is_global ? 'Ya' : 'Tidak') + '</td><td style="font-size:11px">' + (n.created_at ? new Date(n.created_at).toLocaleDateString('id-ID') : '') + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.notifications || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Belum ada notifikasi</p>' : '') +
      '</div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

async function sendNotification() {
  var title = (document.getElementById('notif-title') || {}).value;
  var message = (document.getElementById('notif-message') || {}).value;
  if (!title || !message) return alert('Judul dan pesan wajib diisi');
  await api('/api/admin/notifications', { method: 'POST', body: JSON.stringify({ title: title, message: message }) });
  alert('Notifikasi terkirim!');
  navTo('notifications');
}

var WA_PHASE_TEXT = {
  idle: 'Idle',
  starting: 'Menyalakan browser',
  restoring: 'Memulihkan session',
  authenticating: 'Memverifikasi session',
  awaiting_scan: 'Menunggu scan QR',
  ready: 'Terhubung',
  disconnected: 'Terputus',
  reconnecting: 'Menyambung ulang',
  error: 'Error'
};

var WA_ERROR_SHORT = {
  auth_failure: 'Autentikasi gagal',
  init_error: 'Browser gagal start',
  session_permission: 'Izin folder profile',
  LOGOUT: 'Terlogout',
  NAVIGATION: 'Halaman terputus',
  CONFLICT: 'Konflik sesi',
  UNPAIRED: 'Belum terpasang',
  UNLAUNCHED: 'WA Web gagal start'
};

var WA_ERROR_HINT = {
  auth_failure: 'Scan QR baru di halaman ini.',
  init_error: 'Klik Generate QR Baru.',
  session_permission: 'Perlu perbaikan sudo di server.',
  LOGOUT: 'Scan QR baru di halaman ini.',
  NAVIGATION: 'Sambung ulang otomatis, tidak perlu scan.',
  CONFLICT: 'Sambung ulang otomatis, tidak perlu scan.',
  UNPAIRED: 'Scan QR baru di halaman ini.',
  UNLAUNCHED: 'Sambung ulang otomatis, tidak perlu scan.'
};

/* Badge pendek untuk kartu, hint panjang untuk baris di bawahnya. */
function waStatusBadge(d) {
  if (d.connected) return { cls: 'badge-success', text: 'Terhubung' };
  if (d.error && WA_ERROR_SHORT[d.error]) {
    return { cls: 'badge-danger', text: WA_ERROR_SHORT[d.error] };
  }
  if (d.phase === 'reconnecting' && d.nextRetryAt) {
    var s = Math.max(0, Math.ceil((d.nextRetryAt - (d.serverTime || Date.now())) / 1000));
    return { cls: 'badge-info', text: 'Menyambung ulang ' + s + 's' };
  }
  return { cls: 'badge-gray', text: WA_PHASE_TEXT[d.phase] || 'Menunggu QR' };
}

function waStatusHint(d) {
  if (d.connected) return '';
  if (d.error && WA_ERROR_HINT[d.error]) return WA_ERROR_HINT[d.error];
  return '';
}

async function renderWhatsapp(el) {
  try {
    var d = await api('/api/admin/whatsapp/status');
    waQrKey = null;
    waPageEl = el;
    el.innerHTML = waPageHtml(d);
    if (d.connected) {
      waConnected = true;
      stopWaPagePoll();
    } else {
      waConnected = false;
      waPaint(d);
      startWaPagePoll();
    }
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

function waPageHtml(d) {
  var badge = waStatusBadge(d);
  var hint = waStatusHint(d);
  var blocker =
    d.error === 'session_permission' && d.errorDetail
      ? '<div style="margin-top:16px;padding:12px;border:1px solid #fecaca;background:#fef2f2;text-align:left">' +
        '<div style="font-size:11px;font-weight:600;color:#991b1b;margin-bottom:6px">Jalankan di server</div>' +
        '<code style="display:block;font-size:11px;color:#7f1d1d;word-break:break-all">' +
        escapeHtml(d.errorDetail) +
        '</code></div>'
      : '';

  var actions = d.connected
    ? '<button class="btn btn-primary" onclick="testWa()">Test Kirim WA</button>' +
      '<button class="btn btn-outline" onclick="waRescan(false)">Restart Client</button>'
    : '<button class="btn btn-primary" id="wa-rescan-btn" onclick="waRescan(false)">Generate QR Baru</button>' +
      '<button class="btn btn-outline" onclick="waRescan(true)">Reset Total</button>';

  var body = d.connected
    ? '<p style="font-size:13px;color:#374151">' + escapeHtml(d.number || '-') + '</p>'
    : '<div style="margin-top:16px;display:inline-block">' +
        '<div id="wa-qr-box" style="width:220px;height:220px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #e5e7eb"></div>' +
      '</div>' +
      '<p style="font-size:11px;color:#9ca3af;margin-top:8px">WhatsApp &rarr; Titik 3 &rarr; Perangkat Tertaut &rarr; Tautkan Perangkat</p>';

  return '<div class="card">' +
    '<div class="section-title">WhatsApp Bot</div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<span id="wa-status-badge" class="badge ' + badge.cls + '">' + escapeHtml(badge.text) + '</span>' +
      (hint ? '<span id="wa-status-hint" style="font-size:12px;color:#6b7280">' + escapeHtml(hint) + '</span>' : '<span id="wa-status-hint"></span>') +
    '</div>' +
    body +
    blocker +
    '<div style="margin-top:16px;display:flex;gap:8px">' + actions + '</div>' +
    '</div>';
}

/* ---------- QR painting (hanya saat belum terhubung) ---------- */

var waQrKey = null;
var waConnected = false;
var waModalOpen = false;
var waPageEl = null;
var waPageTimer = null;
var waModalTimer = null;

function waDrawQr(box, qr) {
  if (!box) return;
  box.innerHTML = '';
  try {
    new QRCode(box, { text: qr, width: 220, height: 220 });
  } catch (e) {
    box.innerHTML = '<div style="font-size:12px;color:#ef4444">Gagal render QR</div>';
  }
}

/** Buang sisa QR dari DOM. Dipanggil begitu status jadi connected. */
function waClearQr() {
  waQrKey = null;
  var box = document.getElementById('wa-qr-box');
  if (box) box.innerHTML = '';
}

function waPaint(d) {
  if (d.connected || waConnected) return;
  var box = document.getElementById('wa-qr-box');
  if (!box) return;
  if (d.qr) {
    if (waQrKey !== d.qr) {
      waQrKey = d.qr;
      waDrawQr(box, d.qr);
    }
  } else if (waQrKey !== null) {
    waQrKey = null;
    box.innerHTML = '<span style="font-size:11px;color:#9ca3af">' +
      escapeHtml(WA_PHASE_TEXT[d.phase] || 'Menunggu QR') + '</span>';
  }
}

/** Update badge + hint di tempat, tanpa re-render seluruh kartu. */
function waSetStatus(d) {
  var b = waStatusBadge(d);
  var badge = document.getElementById('wa-status-badge');
  if (badge) {
    badge.className = 'badge ' + b.cls;
    badge.textContent = b.text;
  }
  var hint = document.getElementById('wa-status-hint');
  if (hint) hint.textContent = waStatusHint(d);
}

function stopWaPagePoll() {
  if (waPageTimer) { clearTimeout(waPageTimer); waPageTimer = null; }
}

function startWaPagePoll() {
  stopWaPagePoll();
  waPageTimer = setTimeout(async function () {
    if (currentPage !== 'whatsapp' || waModalOpen) return;
    try {
      var d = await api('/api/admin/whatsapp/status');
      if (d.connected) {
        waClearQr();
        renderWhatsapp(waPageEl || document.getElementById('page-content'));
        return;
      }
      waConnected = false;
      if (!document.getElementById('wa-status-badge')) { startWaPagePoll(); return; }
      waSetStatus(d);
      waPaint(d);
    } catch (e) {}
    startWaPagePoll();
  }, 2000);
}

/* ---------- Modal alur scan QR ---------- */

async function waRescan(resetSession) {
  var btn = document.getElementById('wa-rescan-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Membuat QR...'; }
  try {
    var d = await api('/api/admin/whatsapp/rescan', {
      method: 'POST',
      body: JSON.stringify({ resetSession: !!resetSession })
    });
    waQrKey = null;
    waConnected = false;
    showModal(
      '<h2 style="font-size:16px;font-weight:600;margin-bottom:8px">' +
        (resetSession ? 'Reset &amp; Scan Ulang' : 'Generate QR Baru') + '</h2>' +
      '<p style="font-size:12px;color:#6b7280;margin:0 0 12px">' + escapeHtml(d.message || 'Menunggu QR') + '</p>' +
      '<div id="wa-rescan-qr" style="width:220px;height:220px;margin:0 auto;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #e5e7eb"></div>' +
      '<p style="font-size:11px;color:#9ca3af;margin-top:8px;text-align:center">WhatsApp &rarr; Titik 3 &rarr; Perangkat Tertaut &rarr; Tautkan Perangkat</p>' +
      '<p style="font-size:11px;color:#9ca3af;margin-top:2px;text-align:center">QR diperbarui otomatis tiap 20 detik</p>' +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
        '<button class="btn btn-outline" onclick="waRescan(false)">QR Baru</button>' +
        '<button class="btn btn-primary" onclick="closeModal()">Tutup</button>' +
      '</div>'
    );
    waModalOpen = true;
    setTimeout(pollWaQr, 1500);
  } catch (e) {
    alert('Gagal membuat QR: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Generate QR Baru'; }
  }
}

async function pollWaQr() {
  var box = document.getElementById('wa-rescan-qr');
  if (!box) { waModalOpen = false; return; }
  try {
    var d = await api('/api/admin/whatsapp/status');
    if (d.connected) {
      waModalOpen = false;
      waConnected = true;
      waQrKey = null;
      box.innerHTML =
        '<span class="badge badge-success">Terhubung</span>' +
        '<div style="font-size:12px;color:#6b7280;margin-top:6px">' + escapeHtml(d.number || '-') + '</div>';
      setTimeout(function () { closeModal(); renderWhatsapp(waPageEl || document.getElementById('page-content')); }, 1200);
      return;
    }
    waConnected = false;
    if (d.qr) {
      if (waQrKey !== d.qr) { waQrKey = d.qr; waDrawQr(box, d.qr); }
    } else {
      waQrKey = null;
      box.innerHTML = '<span style="font-size:11px;color:#9ca3af">' +
        escapeHtml(WA_PHASE_TEXT[d.phase] || 'Menunggu QR') + '</span>';
    }
  } catch (e) {}
  waModalTimer = setTimeout(pollWaQr, 2000);
}

socket.on('wa_qr', function (data) {
  if (!data || !data.qr) return;
  // QR tidak boleh tampil kalau sudah terhubung
  if (waConnected) return;
  if (document.getElementById('wa-rescan-qr')) {
    if (waQrKey !== data.qr) { waQrKey = data.qr; waDrawQr(document.getElementById('wa-rescan-qr'), data.qr); }
  } else if (currentPage === 'whatsapp') {
    waPaint({ qr: data.qr });
  }
});

socket.on('wa_status', function (data) {
  if (currentPage !== 'whatsapp' && !waModalOpen) return;
  if (data && data.connected) {
    if (waModalOpen && document.getElementById('wa-rescan-qr')) { pollWaQr(); return; }
    waClearQr();
    renderWhatsapp(waPageEl || document.getElementById('page-content'));
    return;
  }
  waConnected = false;
  waSetStatus(data || {});
  if (waModalOpen && document.getElementById('wa-rescan-qr')) pollWaQr();
});

function testWa() {
  showModal('<h2>Test WhatsApp</h2><p style="font-size:13px;color:#6b7280;margin-bottom:12px">Kirim pesan test ke nomor admin</p><input type="text" id="test-wa-phone" placeholder="Nomor tujuan (08xx)" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px;margin-bottom:16px"><button class="btn btn-primary" onclick="doTestWa()">Kirim</button><button class="btn btn-outline" onclick="closeModal()">Batal</button>');
}

async function doTestWa() {
  var phone = (document.getElementById('test-wa-phone') || {}).value;
  if (!phone) return alert('Nomor WA wajib diisi');
  var d = await api('/api/admin/whatsapp/test', { method: 'POST', body: JSON.stringify({ phone: phone }) });
  alert(d.success ? 'Test WA terkirim!' : d.message);
  closeModal();
}

async function renderNorthpay(el) {
  try {
    el.innerHTML =
      '<div class="tab-bar">' +
        '<button class="tab-btn' + (northpayAdminTab === 'requests' ? ' active' : '') + '" onclick="northpayAdminTab=\'requests\';navTo(\'northpay\')">Pending Requests</button>' +
        '<button class="tab-btn' + (northpayAdminTab === 'users' ? ' active' : '') + '" onclick="northpayAdminTab=\'users\';navTo(\'northpay\')">User Balances</button>' +
        '<button class="tab-btn' + (northpayAdminTab === 'transfers' ? ' active' : '') + '" onclick="northpayAdminTab=\'transfers\';navTo(\'northpay\')">Transfers</button>' +
        '<button class="tab-btn' + (northpayAdminTab === 'settings' ? ' active' : '') + '" onclick="northpayAdminTab=\'settings\';navTo(\'northpay\')">Settings</button>' +
      '</div><div id="northpay-tab-content">';
    if (northpayAdminTab === 'requests') {
      await renderNorthpayRequests();
    } else if (northpayAdminTab === 'users') {
      await renderNorthpayUsers();
    } else if (northpayAdminTab === 'transfers') {
      await renderNorthpayTransfers();
    } else {
      await renderNorthpaySettings();
    }
    el.innerHTML += '</div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

async function renderNorthpayTransfers() {
  var tc = document.getElementById('northpay-tab-content');
  if (!tc) return;
  var status = (document.getElementById('transfer-status-filter') || {}).value || 'pending';
  var d = await api('/api/admin/northpay/transfers?status=' + status + '&page=1&limit=50');
  var html = '<div class="filter-bar"><select id="transfer-status-filter" onchange="northpayAdminTab=\'transfers\';navTo(\'northpay\')" style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px">' +
    '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option>' +
    '<option value="success"' + (status === 'success' ? ' selected' : '') + '>Success</option>' +
    '<option value="cancelled"' + (status === 'cancelled' ? ' selected' : '') + '>Dibatalkan</option>' +
    '</select></div>';
  html += '<div class="card"><table><thead><tr><th>User</th><th>Tujuan</th><th>No. Akun</th><th>Atas Nama</th><th>Jumlah</th><th>Admin Fee</th><th>Total</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
  if (d.transfers && d.transfers.length > 0) {
    d.transfers.forEach(function(t) {
      var statusBadge = t.status === 'success' ? '<span class="badge badge-success">Berhasil</span>'
        : t.status === 'cancelled' ? '<span class="badge badge-danger">Dibatalkan</span>'
        : '<span class="badge badge-pending">Pending</span>';
      var actions = t.status === 'pending'
        ? '<button class="btn btn-success btn-sm" onclick="approveNorthpayTransfer(' + t.id + ')">Approve</button> <button class="btn btn-danger btn-sm" onclick="rejectNorthpayTransfer(' + t.id + ')">Reject</button>'
        : '-';
      html += '<tr><td>' + escapeHtml(t.user_name || t.username) + '</td><td><strong>' + escapeHtml(t.method_name) + '</strong></td><td>' + escapeHtml(t.account_number) + '</td><td>' + escapeHtml(t.account_name) + '</td><td><strong>' + formatRp(t.amount) + '</strong></td><td>' + formatRp(t.admin_fee) + '</td><td>' + formatRp(t.total) + '</td><td style="font-size:11px">' + new Date(t.created_at).toLocaleString('id-ID') + '</td><td>' + statusBadge + '</td><td style="white-space:nowrap">' + actions + '</td></tr>';
    });
  } else {
    html += '<tr><td colspan="10" style="text-align:center;padding:24px;color:#9ca3af">Tidak ada transfer</td></tr>';
  }
  html += '</tbody></table></div>';
  tc.innerHTML = html;
}

async function approveNorthpayTransfer(transferId) {
  if (!confirm('Proses transfer ini? Saldo sudah dipotong dari user.')) return;
  var adminNote = prompt('Catatan admin (opsional):');
  var d = await api('/api/admin/northpay/transfer/approve', { method: 'POST', body: JSON.stringify({ transferId: transferId, adminNote: adminNote || '' }) });
  if (d.success) {
    alert('Transfer disetujui');
  } else {
    alert(d.message);
  }
  navTo('northpay');
}

async function rejectNorthpayTransfer(transferId) {
  if (!confirm('Tolak transfer ini? Dana akan dikembalikan ke saldo user.')) return;
  var adminNote = prompt('Catatan admin (opsional):');
  var d = await api('/api/admin/northpay/transfer/reject', { method: 'POST', body: JSON.stringify({ transferId: transferId, adminNote: adminNote || '' }) });
  if (d.success) {
    alert('Transfer ditolak, dana dikembalikan');
  } else {
    alert(d.message);
  }
  navTo('northpay');
}

async function renderNorthpayRequests() {
  var tc = document.getElementById('northpay-tab-content');
  if (!tc) return;
  var d = await api('/api/admin/northpay/requests?status=pending&page=1&limit=50');
  var html = '<div class="card"><table><thead><tr><th>User</th><th>Phone</th><th>Jumlah</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>';
  if (d.requests && d.requests.length > 0) {
    d.requests.forEach(function(r) {
      html += '<tr><td>' + escapeHtml(r.user_name || r.username) + '</td><td>' + escapeHtml(r.user_phone || '-') + '</td><td><strong>' + formatRp(r.amount) + '</strong></td><td>' + new Date(r.created_at).toLocaleDateString('id-ID') + '</td><td style="white-space:nowrap"><button class="btn btn-success btn-sm" onclick="approveNorthpayRequest(' + r.id + ')">Approve</button> <button class="btn btn-danger btn-sm" onclick="rejectNorthpayRequest(' + r.id + ')">Reject</button></td></tr>';
    });
  } else {
    html += '<tr><td colspan="5" style="text-align:center;padding:24px;color:#9ca3af">Tidak ada pending request</td></tr>';
  }
  html += '</tbody></table></div>';
  tc.innerHTML = html;
}

async function approveNorthpayRequest(requestId) {
  if (!confirm('Konfirmasi top-up ini?')) return;
  var adminNote = prompt('Catatan admin (opsional):');
  var d = await api('/api/admin/northpay/approve', { method: 'POST', body: JSON.stringify({ requestId: requestId, adminNote: adminNote || '' }) });
  if (d.success) {
    showTopupSuccess(d);
  } else {
    alert(d.message);
  }
}

function showTopupSuccess(invoice) {
  document.title = 'Top Up Berhasil - Northline';
  var formatRp = new Intl.NumberFormat('id-ID').format(invoice.amount);
  var formatDate = new Date(invoice.createdAt).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  var content = document.getElementById('page-content');
  content.innerHTML =
    '<div class="flex-1 overflow-y-auto bg-gray-50" id="topup-success-page">' +
    '<div class="bg-gradient-to-b from-gray-200 to-gray-50 px-6 pt-10 pb-16 relative overflow-hidden">' +
    '<div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-10"></div>' +
    '<div class="relative z-10 flex flex-col items-center text-center">' +
    '<div class="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg mb-4">' +
    '<img src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=DF414F" class="w-12 h-12" />' +
    '</div>' +
    '<h1 class="text-black text-[22px] font-bold">Pembayaran Berhasil</h1>' +
    '<p class="text-black text-[13px]">Top-up NorthPay berhasil dikonfirmasi</p>' +
    '</div></div>' +
    '<div class="px-4 -mt-10 relative z-20">' +
    '<div class="bg-white shadow-sm p-5 border border-gray-100">' +
    '<div class="flex items-center justify-between border-b pb-3">' +
    '<div><p class="text-[12px] text-gray-400">TOP-UP ID</p><h2 class="text-[14px] font-bold text-gray-800 mt-1">' + escapeHtml(invoice.requestId) + '</h2></div>' +
    '<div class="bg-gray-50 text-gray-500 px-3 py-1 text-[11px] font-semibold">SUCCESS</div>' +
    '</div>' +
    '<div class="py-4 border-b">' +
    '<div class="flex items-center justify-between">' +
    '<div><p class="text-[12px] text-gray-400">Invoice</p><h3 class="text-[13px] font-semibold text-gray-800 mt-1">' + escapeHtml(invoice.invoiceNumber) + '</h3></div>' +
    '<div class="text-right"><p class="text-[12px] text-gray-400">User</p><p class="text-[13px] font-medium text-gray-800 mt-1">' + escapeHtml(invoice.userName) + '</p></div>' +
    '</div></div>' +
    '<div class="py-4 space-y-3">' +
    '<div class="flex items-center justify-between"><span class="text-[13px] text-gray-500">Tanggal</span><span class="text-[13px] font-medium text-gray-700">' + formatDate + '</span></div>' +
    '<div class="flex items-center justify-between"><span class="text-[13px] text-gray-500">Metode</span><span class="text-[13px] font-medium text-gray-700">NorthPay</span></div>' +
    '<div class="flex items-center justify-between"><span class="text-[13px] text-gray-500">Jumlah Top-Up</span><span class="text-[13px] font-medium text-gray-700">Rp ' + formatRp + '</span></div>' +
    '<div class="flex items-center justify-between pt-3 border-t"><span class="text-[14px] font-semibold text-gray-800">Total</span><span class="text-[18px] font-bold text-gray-700">Rp ' + formatRp + '</span></div>' +
    '</div></div>' +
    '<div class="mt-4 bg-white shadow-sm p-4 border border-gray-100">' +
    '<h3 class="text-[13px] font-semibold text-gray-700 mb-3">Bagikan Invoice</h3>' +
    '<div class="flex items-center justify-center gap-6">' +
    '<button class="share-btn flex flex-col items-center gap-1" data-platform="share">' +
    '<img src="https://img.icons8.com/?size=100&id=82713&format=png&color=000000" class="w-6 h-6" />' +
    '<span class="text-[11px] text-gray-500">Share</span></button>' +
    '<button class="share-btn flex flex-col items-center gap-1" data-platform="copy">' +
    '<img src="https://img.icons8.com/?size=100&id=59773&format=png&color=000000" class="w-6 h-6" />' +
    '<span class="text-[11px] text-gray-500">Copy</span></button>' +
    '<button class="share-btn flex flex-col items-center gap-1" data-platform="download">' +
    '<img src="https://img.icons8.com/?size=100&id=12374&format=png&color=000000" class="w-6 h-6" />' +
    '<span class="text-[11px] text-gray-500">Unduh PNG</span></button>' +
    '</div></div></div>' +
    '<div class="p-4 bg-white border-t border-gray-200 shrink-0">' +
    '<button id="close-topup-success" class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">Kembali</button></div>';

  setTimeout(function () {
    var closeBtn = document.getElementById('close-topup-success');
    if (closeBtn) closeBtn.onclick = function () { navTo('northpay'); };
    document.querySelectorAll('.share-btn').forEach(function (btn) {
      btn.onclick = function () { handleTopupShare(btn, invoice, formatRp); };
    });
  }, 100);
}

async function handleTopupShare(btn, invoice, formatRp) {
  var platform = btn.dataset.platform;
  var text =
    'TOP-UP NORTHPAY\n\n' +
    'Invoice: ' + invoice.invoiceNumber + '\n' +
    'User: ' + invoice.userName + '\n' +
    'Amount: Rp ' + formatRp + '\n' +
    'Status: SUCCESS';
  try {
    if (platform === 'copy') {
      await navigator.clipboard.writeText(text);
      showIosModal('Invoice copied!');
      return;
    }
    if (platform === 'download') {
      var el = document.getElementById('topup-success-page');
      if (el && typeof html2canvas !== 'undefined') {
        try {
          var canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f3f4f6', logging: false, imageTimeout: 5000, removeContainer: true });
          canvas.toBlob(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'invoice-topup-' + invoice.requestId + '.png'; a.click();
            URL.revokeObjectURL(url);
          }, 'image/png', 0.92);
        } catch (err) {
          console.log(err);
          showIosModal('Download gagal');
        }
      } else {
        showIosModal('Fitur tidak tersedia');
      }
      return;
    }
    if (platform === 'share') {
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Invoice NorthPay', text: text });
        } else {
          await navigator.clipboard.writeText(text);
          showIosModal('Invoice text copied');
        }
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
    showIosModal('Share gagal');
  }
}

async function rejectNorthpayRequest(requestId) {
  if (!confirm('Tolak permintaan top-up ini?')) return;
  var adminNote = prompt('Alasan penolakan (opsional):');
  var d = await api('/api/admin/northpay/reject', { method: 'POST', body: JSON.stringify({ requestId: requestId, adminNote: adminNote || '' }) });
  alert(d.success ? 'Request ditolak' : d.message);
  navTo('northpay');
}

async function renderNorthpayUsers() {
  var tc = document.getElementById('northpay-tab-content');
  if (!tc) return;
  var search = (document.getElementById('northpay-search') || {}).value || '';
  var d = await api('/api/admin/northpay?page=' + northpayPage + '&limit=20&search=' + encodeURIComponent(search));
  tc.innerHTML =
    '<div class="card" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="section-title" style="margin:0">Total Saldo: <strong>' + formatRp(d.totalBalance || 0) + '</strong></span></div></div>' +
    '<div class="filter-bar"><input type="text" id="northpay-search" placeholder="Cari user..." value="' + escapeHtml(search) + '" oninput="debouncedNorthpayUsers()"><button class="btn btn-primary" onclick="northpayPage=1;debouncedNorthpayUsers()">Cari</button></div>' +
    '<div class="card"><table><thead><tr><th>Nama</th><th>Email</th><th>Phone</th><th>Balance</th><th>Aksi</th></tr></thead><tbody>' +
    (d.users || []).map(function (u) {
      return '<tr><td>' + escapeHtml(u.name || u.username) + '</td><td style="font-size:11px">' + escapeHtml(u.email) + '</td><td>' + escapeHtml(u.phone || '-') + '</td><td><strong>' + formatRp(u.northpay_balance || 0) + '</strong></td><td style="white-space:nowrap"><button class="btn btn-success btn-sm" onclick="showNorthpayAdjust(' + u.id + ',\'' + escapeHtml(u.name || u.username).replace(/'/g, "\\'") + '\')">Top Up</button> <button class="btn btn-danger btn-sm" onclick="showNorthpayDeduct(' + u.id + ',\'' + escapeHtml(u.name || u.username).replace(/'/g, "\\'") + '\')">Deduct</button></td></tr>';
    }).join('') +
    '</tbody></table>' +
    ((d.users || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada user</p>' : '') +
    '<div class="pagination"><button onclick="northpayPage=Math.max(1,northpayPage-1);debouncedNorthpayUsers()"' + (northpayPage <= 1 ? ' disabled' : '') + '>Prev</button><span>Page ' + (d.page || northpayPage) + ' of ' + Math.ceil((d.total || 0) / (d.limit || 20)) + '</span><button onclick="northpayPage++;debouncedNorthpayUsers()"' + (northpayPage >= Math.ceil((d.total || 0) / (d.limit || 20)) ? ' disabled' : '') + '>Next</button></div></div>';
}

function debouncedNorthpayUsers() {
  clearTimeout(renderNorthpayTimeout);
  renderNorthpayTimeout = setTimeout(function () { northpayAdminTab='users';navTo('northpay'); }, 300);
}

function showNorthpayAdjust(userId, userName) {
  showModal('<h2>Top Up Saldo - ' + escapeHtml(userName) + '</h2><input type="number" id="np-amount" placeholder="Jumlah" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px;margin-bottom:12px"><input type="text" id="np-reason" placeholder="Alasan (opsional)" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px;margin-bottom:16px"><button class="btn btn-success" onclick="doNorthpayAdjust(' + userId + ',\'topup\')">Top Up</button><button class="btn btn-outline" onclick="closeModal()">Batal</button>');
}

function showNorthpayDeduct(userId, userName) {
  showModal('<h2>Deduct Saldo - ' + escapeHtml(userName) + '</h2><input type="number" id="np-amount" placeholder="Jumlah" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px;margin-bottom:12px"><input type="text" id="np-reason" placeholder="Alasan (opsional)" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px;margin-bottom:16px"><button class="btn btn-danger" onclick="doNorthpayAdjust(' + userId + ',\'deduct\')">Deduct</button><button class="btn btn-outline" onclick="closeModal()">Batal</button>');
}

async function doNorthpayAdjust(userId, type) {
  var amount = parseInt((document.getElementById('np-amount') || {}).value);
  var reason = (document.getElementById('np-reason') || {}).value;
  if (!amount || amount <= 0) return alert('Jumlah tidak valid');
  await api('/api/admin/northpay/adjust', { method: 'POST', body: JSON.stringify({ userId: userId, amount: amount, type: type, reason: reason }) });
  closeModal();
  navTo('northpay');
}

async function renderReports(el) {
  var end = new Date().toISOString().slice(0, 10);
  var start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  el.innerHTML =
    '<div class="filter-bar">' +
    '<label style="font-size:12px">Dari: <input type="date" id="report-start" value="' + start + '" style="height:36px;border:1px solid #d1d5db;padding:0 8px;margin-left:4px"></label>' +
    '<label style="font-size:12px">Sampai: <input type="date" id="report-end" value="' + end + '" style="height:36px;border:1px solid #d1d5db;padding:0 8px;margin-left:4px"></label>' +
    '<button class="btn btn-primary" onclick="loadReports()">Tampilkan</button>' +
    '<button class="btn btn-outline" onclick="exportCsv()">Export CSV</button></div>' +
    '<div id="report-results"></div>' +
    '<div class="card" style="margin-top:20px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><div class="section-title" style="margin:0">Laporan Produk</div><p style="font-size:12px;color:#6b7280;margin:5px 0 0">Laporan dari pelanggan yang menunggu tinjauan admin.</p></div><button class="btn btn-outline" onclick="loadProductReports()">Muat Ulang</button></div><div id="product-report-list" style="margin-top:16px">Memuat laporan produk...</div></div>';
  loadReports();
  loadProductReports();
}

async function loadProductReports() {
  var container = document.getElementById('product-report-list');
  if (!container) return;
  container.innerHTML = '<p style="color:#6b7280">Memuat laporan produk...</p>';
  try {
    var data = await api('/api/admin/product-reports?limit=100');
    if (!data.success) throw new Error(data.message || 'Gagal memuat laporan.');
    var reports = data.reports || [];
    var reasonLabels = {
      misleading: 'Informasi atau foto tidak sesuai',
      counterfeit: 'Diduga produk palsu/bukan original',
      prohibited: 'Produk melanggar ketentuan',
      other: 'Lainnya'
    };
    container.innerHTML = reports.length ? reports.map(function (report) {
      var status = report.status === 'pending' ? 'Menunggu tinjauan' : report.status === 'reviewed' ? 'Sudah ditinjau' : 'Ditutup';
      return '<article style="display:flex;gap:14px;padding:14px 0;border-top:1px solid #e5e7eb;align-items:flex-start;flex-wrap:wrap">' +
        (report.product_image ? '<img src="' + escapeHtml(report.product_image) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;background:#f3f4f6">' : '') +
        '<div style="flex:1;min-width:220px"><div style="font-weight:700">' + escapeHtml(report.product_name) + '</div>' +
        '<div style="font-size:12px;color:#6b7280;margin-top:3px">Produk ID: ' + escapeHtml(String(report.product_id)) + (report.product_code ? ' · Kode: ' + escapeHtml(report.product_code) : '') + ' · ' + new Date(report.created_at).toLocaleString('id-ID') + '</div>' +
        '<div style="font-size:12px;margin-top:6px"><strong>Alasan:</strong> ' + escapeHtml(reasonLabels[report.reason] || report.reason) + '</div>' +
        '<p style="font-size:13px;white-space:pre-wrap;margin:5px 0">' + escapeHtml(report.details) + '</p>' +
        '<div style="font-size:12px;color:#6b7280">Status: ' + escapeHtml(status) + (report.admin_note ? ' · Catatan admin: ' + escapeHtml(report.admin_note) : '') + '</div></div>' +
        (report.status === 'pending' ? '<div style="display:flex;gap:6px"><button class="btn btn-success btn-sm" onclick="updateProductReport(' + Number(report.id) + ',\'reviewed\')">Tandai Ditinjau</button><button class="btn btn-outline btn-sm" onclick="updateProductReport(' + Number(report.id) + ',\'dismissed\')">Tutup</button></div>' : '') +
        '</article>';
    }).join('') : '<p style="text-align:center;padding:24px;color:#9ca3af">Belum ada laporan produk.</p>';
  } catch (error) {
    container.innerHTML = '<p style="color:#ef4444">' + escapeHtml(error.message || 'Gagal memuat laporan produk.') + '</p>';
  }
}

async function updateProductReport(id, status) {
  var adminNote = window.prompt('Catatan admin (opsional):') || '';
  try {
    var result = await api('/api/admin/product-reports/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify({ status: status, adminNote: adminNote })
    });
    if (!result.success) throw new Error(result.message || 'Status laporan gagal diperbarui.');
    loadProductReports();
  } catch (error) {
    window.alert(error.message || 'Status laporan gagal diperbarui.');
  }
}

async function loadReports() {
  var start = (document.getElementById('report-start') || {}).value;
  var end = (document.getElementById('report-end') || {}).value;
  var sales, users;
  try {
    sales = await api('/api/admin/reports/sales?start=' + start + '&end=' + end);
    users = await api('/api/admin/reports/users?start=' + start + '&end=' + end);
  } catch (e) { return; }
  reportData = { sales: sales.data || [], users: users.data || [] };
  var totalRevenue = reportData.sales.reduce(function (a, b) { return a + Number(b.total_revenue); }, 0);
  var totalOrders = reportData.sales.reduce(function (a, b) { return a + Number(b.total_orders); }, 0);
  var totalNewUsers = reportData.users.reduce(function (a, b) { return a + Number(b.total); }, 0);
  document.getElementById('report-results').innerHTML =
    '<div class="grid-stats" style="grid-template-columns:repeat(3,1fr)">' +
    '<div class="card stat-card"><div class="info"><h3>' + formatRp(totalRevenue) + '</h3><p>Total Revenue</p></div></div>' +
    '<div class="card stat-card"><div class="info"><h3>' + totalOrders + '</h3><p>Total Orders</p></div></div>' +
    '<div class="card stat-card"><div class="info"><h3>' + totalNewUsers + '</h3><p>User Baru</p></div></div></div>' +
    '<div class="two-col"><div class="card"><div class="section-title">Penjualan</div><table><thead><tr><th>Tanggal</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>' +
    (reportData.sales.length ? reportData.sales.map(function (s) { return '<tr><td>' + s.date + '</td><td>' + s.total_orders + '</td><td>' + formatRp(s.total_revenue) + '</td></tr>'; }).join('') : '<tr><td colspan="3" style="text-align:center;color:#9ca3af">Tidak ada data</td></tr>') +
    '</tbody></table></div><div class="card"><div class="section-title">User Baru</div><table><thead><tr><th>Tanggal</th><th>Jumlah</th></tr></thead><tbody>' +
    (reportData.users.length ? reportData.users.map(function (u) { return '<tr><td>' + u.date + '</td><td>' + u.total + '</td></tr>'; }).join('') : '<tr><td colspan="2" style="text-align:center;color:#9ca3af">Tidak ada data</td></tr>') +
    '</tbody></table></div></div>';
}

function exportCsv() {
  if (!reportData) return;
  var csv = 'Tanggal,Orders,Revenue\n';
  reportData.sales.forEach(function (s) { csv += s.date + ',' + s.total_orders + ',' + s.total_revenue + '\n'; });
  csv += '\nTanggal,User Baru\n';
  reportData.users.forEach(function (u) { csv += u.date + ',' + u.total + '\n'; });
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'northline_laporan.csv';
  a.click();
}

async function renderSellerEarnings(el) {
  el.innerHTML = '<div class="card"><div class="section-title">Memuat penghasilan seller...</div></div>';
  try {
    var d = await api('/api/admin/seller-earnings');
    if (!d.success) { el.innerHTML = '<div class="card"><div class="section-title" style="color:#ef4444">Gagal memuat data</div></div>'; return; }
    var earnings = d.earnings || [];
    var html = '<div class="card"><div class="section-title">Penghasilan Seller</div>' +
      '<p style="font-size:12px;color:#6b7280;margin-bottom:16px">Ringkasan produk, penjualan, pendapatan, potongan fee & pajak, dan jadwal pencairan per seller</p>' +
      '<div style="overflow-x-auto"><table class="w-full text-left" style="font-size:12px">' +
      '<thead><tr style="border-bottom:2px solid #e5e7eb;text-align:left">' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Toko</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Produk Tersedia</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Terjual</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Bruto</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Fee (' + (d.earnings[0]?.fee_rate||2) + '%)</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Pajak (' + (d.earnings[0]?.tax_rate||1) + '%)</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Netto</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Belum Cair</th>' +
      '<th style="padding:8px 6px;color:#6b7280;font-size:10px;text-transform:uppercase">Tgl Cair</th>' +
      '</tr></thead><tbody>';
    if (earnings.length === 0) {
      html += '<tr><td colspan="9" style="text-align:center;padding:24px;color:#9ca3af">Tidak ada seller</td></tr>';
    } else {
      earnings.forEach(function (s) {
        var nextRelease = s.next_release ? new Date(s.next_release).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
        var pendingClass = s.pending_revenue > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400';
        html += '<tr style="border-bottom:1px solid #f3f4f6">' +
          '<td style="padding:8px 6px"><div class="font-semibold text-gray-800">' + escapeHtml(s.store_name) + '</div>' +
          '<div style="font-size:10px;color:#9ca3af">' + escapeHtml(s.user_name) + (s.user_phone ? ' • ' + escapeHtml(s.user_phone) : '') + '</div></td>' +
          '<td style="padding:8px 6px">' + s.available_products + ' / ' + s.total_products + '</td>' +
          '<td style="padding:8px 6px">' + s.sold_orders + ' / ' + s.total_orders + '</td>' +
          '<td style="padding:8px 6px">' + formatRp(s.gross_revenue) + '</td>' +
          '<td style="padding:8px 6px" class="text-red-500">' + formatRp(s.total_fee) + '</td>' +
          '<td style="padding:8px 6px" class="text-orange-500">' + formatRp(Math.round(s.total_fee * (s.tax_rate || 1) / ((s.fee_rate || 2) + (s.tax_rate || 1)))) + '</td>' +
          '<td style="padding:8px 6px" class="font-semibold text-emerald-600">' + formatRp(s.net_revenue) + '</td>' +
          '<td style="padding:8px 6px" class="' + pendingClass + '">' + formatRp(s.pending_revenue) + '</td>' +
          '<td style="padding:8px 6px" class="text-gray-600">' + nextRelease + '</td>' +
          '</tr>';
      });
    }
    html += '</tbody></table></div></div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="card"><div class="section-title" style="color:#ef4444">Error: ' + escapeHtml(e.message) + '</div></div>';
  }
}

async function renderSettings(el) {
  try {
    var d = await api('/api/admin/settings');
    var s = d.settings || {};
    el.innerHTML =
      '<div class="card"><div class="section-title">Pengaturan Website</div><div style="display:flex;flex-direction:column;gap:16px;max-width:400px">' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">PO Target Date</label><input type="date" id="set-po-date" value="' + (s.po_target_date || '') + '" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">WA Reminder Time (menit)</label><input type="number" id="set-wa-time" value="' + (s.wa_reminder_time || 5) + '" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Nama Toko</label><input type="text" id="set-site-name" value="' + escapeHtml(s.site_name || '') + '" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Kontak</label><input type="text" id="set-site-contact" value="' + escapeHtml(s.site_contact || '') + '" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Alamat</label><textarea id="set-site-address" style="width:100%;height:60px;border:1px solid #d1d5db;padding:8px 12px;resize:none">' + escapeHtml(s.site_address || '') + '</textarea></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Koordinat Toko (Latitude)</label><input type="text" id="set-store-lat" value="' + (s.store_origin_lat || '') + '" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Koordinat Toko (Longitude)</label><input type="text" id="set-store-lng" value="' + (s.store_origin_lng || '') + '" style="width:100%;height:38px;border:1px solid #d1d5db;padding:0 12px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Titik Asal Pengiriman</label><div id="set-store-map" style="height:220px;border:1px solid #d1d5db;border-radius:4px"></div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:-8px">Klik atau geser pin pada peta untuk memilih lokasi toko (titik awal garis pengiriman).</div>' +
      '<button class="btn btn-primary" onclick="saveSettings()" style="width:fit-content">Simpan</button></div></div>';
    initAdminMapPicker('set-store-map', 'set-store-lat', 'set-store-lng', s.store_origin_lat, s.store_origin_lng);
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

// ---------- Database Manager (gaya phpMyAdmin) ----------
var dbMgr = { db: (window.__NORTHLINE_DB__ || 'northline'), databases: [], tables: [], rowCounts: {}, current: null, tab: 'overview', page: 0, pageSize: 50, lastRows: [], lastCols: [], cols: [], pk: [], indexes: [], filter: '', sqlText: '', history: [] };

function dbQ(name) { return '`' + String(name).replace(/`/g, '') + '`'; }

async function dbRun(sql) {
  var d = await api('/api/admin/database/query?db=' + encodeURIComponent(dbMgr.db) + '&query=' + encodeURIComponent(sql));
  if (!d || !d.success) throw new Error((d && d.message) || 'Query gagal');
  return Array.isArray(d.result) ? d.result : [];
}

async function renderDatabase(el) {
  el.innerHTML = '<div class="loading-state">Memuat SQL Database Manager...</div>';
  try {
    if (!dbMgr.db) dbMgr.db = 'northline';
    var dblist = await api('/api/admin/database/databases').catch(function () { return { databases: ['northline'] }; });
    dbMgr.databases = (dblist && dblist.databases) || ['northline'];
    if (dbMgr.databases.indexOf(dbMgr.db) === -1) dbMgr.db = dbMgr.databases[0] || 'northline';
    var d = await api('/api/admin/database?db=' + encodeURIComponent(dbMgr.db));
    if (!d || !d.success || !Array.isArray(d.tables)) throw new Error((d && d.message) || 'respon tidak valid');
    dbMgr.tables = d.tables;
    dbMgr.rowCounts = d.rowCounts || {};
    dbMgr.current = null;
    dbMgr.page = 0;
    el.innerHTML = dbMgrLayout();
    dbMgrRenderContent();
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

function dbMgrFilteredTables() {
  var f = (dbMgr.filter || '').toLowerCase();
  return dbMgr.tables.filter(function (t) { return !f || t.toLowerCase().indexOf(f) !== -1; });
}

function dbMgrLayout() {
  var list = dbMgrFilteredTables().map(function (t) {
    var active = dbMgr.current === t;
    return '<div class="dbmgr-tbl' + (active ? ' active' : '') + '" onclick="dbOpenTable(decodeURIComponent(\'' + encodeURIComponent(t) + '\'))" title="' + escapeHtml(t) + '">' +
      '<img src="https://img.icons8.com/?size=100&id=2385&format=png&color=7a8699" style="width:13px;height:13px;flex-shrink:0">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(t) + '</span>' +
      '<span class="dbmgr-count">' + (dbMgr.rowCounts[t] || 0) + '</span></div>';
  }).join('');
  var crumb = '<span class="dbmgr-crumb-item" onclick="dbSetTab(\'overview\')" style="cursor:pointer">server</span>' +
    '<span style="color:#b0b7c3">›</span><span class="dbmgr-crumb-item" onclick="dbOpenDbSwitcher()" style="cursor:pointer;color:#235a91;font-weight:700">' + escapeHtml(dbMgr.db) + '</span>' +
    (dbMgr.current ? '<span style="color:#b0b7c3">›</span><span class="dbmgr-crumb-item" style="color:#17457c;font-weight:700">' + escapeHtml(dbMgr.current) + '</span>' : '');
  var tabs = [
    ['overview', 'Overview', true],
    ['structure', 'Struktur', !!dbMgr.current],
    ['data', 'Data', !!dbMgr.current],
    ['sql', 'SQL', true],
    ['operations', 'Operasi', !!dbMgr.current],
    ['users', 'Pengguna', true]
  ].map(function (x) {
    return '<button class="dbmgr-tab' + (dbMgr.tab === x[0] ? ' active' : '') + '" onclick="dbTabClick(\'' + x[0] + '\')">' + x[1] + '</button>';
  }).join('');
  return '<style>' +
    '.dbmgr{display:flex;border:1px solid #d0d5dd;background:#fff;height:calc(100vh - 175px);min-height:520px}' +
    '.dbmgr-side{width:235px;min-width:235px;background:#f8f9fb;border-right:1px solid #e0e4ea;display:flex;flex-direction:column}' +
    '.dbmgr-side-head{padding:10px;border-bottom:1px solid #e0e4ea;display:flex;gap:6px}' +
    '.dbmgr-search{flex:1;height:30px;border:1px solid #cbd2dc;padding:0 8px;font-size:12px;background:#fff;outline:none}' +
    '.dbmgr-search:focus{border-color:#235a91}' +
    '.dbmgr-tree-title{padding:8px 12px;font-size:12px;font-weight:700;color:#235a91;display:flex;align-items:center;gap:6px;background:#eef2f8;border-bottom:1px solid #e0e4ea}' +
    '.dbmgr-list{flex:1;overflow-y:auto}' +
    '.dbmgr-tbl{display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:12px;color:#333;cursor:pointer;border-left:3px solid transparent}' +
    '.dbmgr-tbl:hover{background:#e8f0fe}' +
    '.dbmgr-tbl.active{background:#d7e5fa;color:#17457c;font-weight:700;border-left-color:#235a91}' +
    '.dbmgr-count{font-size:10px;background:#e3e8ef;color:#55606e;padding:1px 6px;border-radius:8px;flex-shrink:0}' +
    '.dbmgr-main{flex:1;display:flex;flex-direction:column;min-width:0}' +
    '.dbmgr-topbar{background:#fff;padding:8px 12px 0;border-bottom:2px solid #235a91;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap}' +
    '.dbmgr-crumb{font-size:11px;color:#55606e;display:flex;align-items:center;gap:6px;width:100%;padding:0 2px 6px}' +
    '.dbmgr-tabs{display:flex;gap:2px}' +
    '.dbmgr-tab{padding:9px 18px;font-size:12px;font-weight:600;color:#55606e;cursor:pointer;border:1px solid transparent;border-bottom:none;background:#f1f3f6}' +
    '.dbmgr-tab.active{background:#fff;border-color:#235a91;color:#235a91;margin-bottom:-2px;border-top-left-radius:3px;border-top-right-radius:3px}' +
    '.dbmgr-actions{display:flex;gap:6px;padding:0 0 6px}' +
    '.dbmgr-btn{height:28px;padding:0 11px;font-size:11px;font-weight:600;background:#fff;border:1px solid #cbd2dc;color:#333;cursor:pointer;display:inline-flex;align-items:center;gap:5px}' +
    '.dbmgr-btn:hover{background:#f0f4fa;border-color:#235a91;color:#235a91}' +
    '.dbmgr-btn.primary{background:#235a91;border-color:#235a91;color:#fff}' +
    '.dbmgr-btn.primary:hover{background:#17457c;color:#fff}' +
    '.dbmgr-content{flex:1;overflow:auto;padding:14px;background:#fff}' +
    '.dbmgr-grid{border-collapse:collapse;width:100%;font-size:11.5px}' +
    '.dbmgr-grid th{position:sticky;top:0;z-index:2;background:#235a91;color:#fff;text-align:left;padding:6px 10px;white-space:nowrap;font-weight:600;border-right:1px solid rgba(255,255,255,.15)}' +
    '.dbmgr-grid td{padding:5px 10px;border-bottom:1px solid #eceff3;border-right:1px solid #f4f6f8;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#222}' +
    '.dbmgr-grid tr:nth-child(even) td{background:#fafbfd}' +
    '.dbmgr-grid tr:hover td{background:#eef4fd}' +
    '.dbmgr-null{color:#b0b7c3;font-style:italic}' +
    '.dbmgr-pager{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:#55606e}' +
    '.dbmgr-pager button{height:26px;padding:0 10px;font-size:11px;border:1px solid #cbd2dc;background:#fff;cursor:pointer;font-weight:600}' +
    '.dbmgr-pager button:hover:not(:disabled){border-color:#235a91;color:#235a91}' +
    '.dbmgr-pager button:disabled{opacity:.45;cursor:not-allowed}' +
    '.dbmgr-sqlbox{width:100%;min-height:110px;border:1px solid #cbd2dc;padding:10px;font-family:Consolas,monospace;font-size:12.5px;resize:vertical;outline:none;background:#fdfefe}' +
    '.dbmgr-sqlbox:focus{border-color:#235a91}' +
    '.dbmgr-card{background:#fff;border:1px solid #e0e4ea;padding:14px 16px;min-width:150px;flex:1}' +
    '.dbmgr-card h3{font-size:22px;color:#235a91;line-height:1.1}' +
    '.dbmgr-card p{font-size:11px;color:#7a8699;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}' +
    '.dbmgr-sec-title{font-size:12px;font-weight:700;color:#235a91;border-bottom:2px solid #235a91;display:inline-block;padding-bottom:3px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}' +
    '@media(max-width:900px){.dbmgr{flex-direction:column;height:auto}.dbmgr-side{width:100%;min-width:0}.dbmgr-list{max-height:180px}}' +
    '</style>' +
    '<div class="dbmgr">' +
    '<div class="dbmgr-side">' +
    '<div class="dbmgr-side-head"><select class="dbmgr-search" style="height:30px" onchange="dbSwitchDb(this.value)">' +
      dbMgr.databases.map(function (db) { return '<option value="' + escapeHtml(db) + '"' + (db === dbMgr.db ? ' selected' : '') + '>' + escapeHtml(db) + '</option>'; }).join('') +
      '</select></div>' +
    '<div class="dbmgr-tree-title"><img src="https://img.icons8.com/?size=100&id=2760&format=png&color=235a91" style="width:13px;height:13px">' + escapeHtml(dbMgr.db) + ' <span style="font-weight:400;color:#7a8699">(' + dbMgr.tables.length + ')</span>' +
      '<span style="flex:1"></span><span style="cursor:pointer;color:#235a91;font-size:11px;text-decoration:underline" onclick="dbOpenDbManager()">+ DB</span></div>' +
    '<div class="dbmgr-list" id="dbmgr-list">' + (list || '<div style="padding:12px;font-size:11px;color:#9aa3af">Tidak ada tabel cocok.</div>') + '</div>' +
    '</div>' +
    '<div class="dbmgr-main">' +
    '<div class="dbmgr-topbar">' +
    '<div class="dbmgr-crumb"><img src="https://img.icons8.com/?size=100&id=75835&format=png&color=235a91" style="width:13px;height:13px">' + crumb + '</div>' +
    '<div class="dbmgr-tabs">' + tabs + '</div>' +
    '<div class="dbmgr-actions">' +
    '<button class="dbmgr-btn" onclick="dbRefresh()"><img src="https://img.icons8.com/?size=100&id=2760&format=png&color=current" style="display:none">↻ Refresh</button>' +
    '<button class="dbmgr-btn" onclick="dbExportCsv()">⬇ Ekspor CSV</button>' +
    '<button class="dbmgr-btn primary" onclick="dbTabClick(\'sql\')">+ SQL</button>' +
    '</div>' +
    '</div>' +
    '<div class="dbmgr-content" id="dbmgr-content"></div>' +
    '</div>' +
    '</div>';
}

function dbFilterTables(v) { dbMgr.filter = v; dbMgrRedrawSidebar(); }
function dbMgrRedrawSidebar() {
  var listEl = document.getElementById('dbmgr-list');
  if (!listEl) return;
  var list = dbMgrFilteredTables().map(function (t) {
    var active = dbMgr.current === t;
    return '<div class="dbmgr-tbl' + (active ? ' active' : '') + '" onclick="dbOpenTable(decodeURIComponent(\'' + encodeURIComponent(t) + '\'))" title="' + escapeHtml(t) + '">' +
      '<img src="https://img.icons8.com/?size=100&id=2385&format=png&color=7a8699" style="width:13px;height:13px;flex-shrink:0">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(t) + '</span>' +
      '<span class="dbmgr-count">' + (dbMgr.rowCounts[t] || 0) + '</span></div>';
  }).join('');
  listEl.innerHTML = list || '<div style="padding:12px;font-size:11px;color:#9aa3af">Tidak ada tabel cocok.</div>';
}

function dbToGrid(rows, maxRows) {
  rows = rows || [];
  if (maxRows) rows = rows.slice(0, maxRows);
  if (!rows.length) return '<div style="font-size:12px;color:#7a8699;padding:20px;text-align:center;border:1px dashed #d0d5dd">Tidak ada data.</div>';
  var cols = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) === -1) cols.push(k); }); });
  dbMgr.lastCols = cols;
  return '<table class="dbmgr-grid"><thead><tr><th>#</th>' + cols.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (row, i) {
      return '<tr><td style="color:#9aa3af">' + (i + 1) + '</td>' + cols.map(function (c) {
        var v = row[c];
        if (v === null || v === undefined) return '<td><span class="dbmgr-null">NULL</span></td>';
        if (typeof v === 'object') v = JSON.stringify(v);
        return '<td title="' + escapeHtml(String(v)) + '">' + escapeHtml(String(v)) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
}

function dbMgrRenderContent() {
  var c = document.getElementById('dbmgr-content');
  if (!c) return;
  c.innerHTML = googleLoader();
  if (dbMgr.tab === 'overview') dbRenderOverview(c);
  else if (dbMgr.tab === 'structure') dbRenderStructure(c);
  else if (dbMgr.tab === 'data') dbRenderData(c);
  else if (dbMgr.tab === 'sql') dbRenderSql(c);
  else if (dbMgr.tab === 'operations') dbRenderOperations(c);
  else if (dbMgr.tab === 'users') dbRenderUsers(c);
}

async function dbRenderOverview(c) {
  try {
    var totalRows = dbMgr.tables.reduce(function (s, t) { return s + (dbMgr.rowCounts[t] || 0); }, 0);
    var meta = await dbRun('SELECT VERSION() AS versi, @@port AS port, @@character_set_server AS charset').catch(function () { return []; });
    var dbs = await dbRun('SHOW DATABASES').catch(function () { return []; });
    var m = meta[0] || {};
    c.innerHTML =
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
      '<div class="dbmgr-card"><h3>' + dbMgr.tables.length + '</h3><p>Tabel di ' + escapeHtml(dbMgr.db) + '</p></div>' +
      '<div class="dbmgr-card"><h3>' + totalRows + '</h3><p>Total baris data</p></div>' +
      '<div class="dbmgr-card"><h3 style="font-size:16px;padding-top:5px">' + escapeHtml(String(m.versi || '-')) + '</h3><p>MariaDB / MySQL v' + escapeHtml(String(m.port || '')) + ':' + escapeHtml(String(m.charset || '')) + '</p></div>' +
      '<div class="dbmgr-card"><h3>' + dbs.length + '</h3><p>Database di server</p></div>' +
      '</div>' +
      '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">' +
      '<div style="flex:1;min-width:280px"><div class="dbmgr-sec-title">Database Server</div>' + dbToGrid(dbs) + '</div>' +
      '<div style="flex:1;min-width:280px"><div class="dbmgr-sec-title">Tabel Terbesar</div>' +
      dbToGrid(dbMgr.tables.slice().sort(function (a, b) { return (dbMgr.rowCounts[b] || 0) - (dbMgr.rowCounts[a] || 0); }).slice(0, 8).map(function (t) { return { tabel: t, baris: dbMgr.rowCounts[t] || 0 }; })) +
      '</div></div>';
  } catch (e) { c.innerHTML = '<div style="color:#dc2626;font-size:12px">Error: ' + escapeHtml(e.message) + '</div>'; }
}

async function dbRenderStructure(c) {
  try {
    if (!dbMgr.current && dbMgr.tables.length) dbMgr.current = dbMgr.tables[0];
    if (!dbMgr.current) { c.innerHTML = '<div style="font-size:12px;color:#7a8699;padding:20px">Belum ada tabel.</div>'; return; }
    var cols = await dbRun('SHOW FULL COLUMNS FROM ' + dbQ(dbMgr.current));
    var meta = await api('/api/admin/database/columns?db=' + encodeURIComponent(dbMgr.db) + '&table=' + encodeURIComponent(dbMgr.current)).catch(function () { return {}; });
    dbMgr.indexes = (meta && meta.indexes) || [];
    var idx = dbMgr.indexes;
    var createSql = (meta && meta.create && meta.create['Create Table']) ? meta.create['Create Table'] : '';
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">' +
      '<div class="dbmgr-sec-title" style="margin-bottom:0">Struktur: ' + escapeHtml(dbMgr.current) + '</div>' +
      '<div style="display:flex;gap:6px">' +
      '<button class="dbmgr-btn" onclick="dbAddColumn()">+ Kolom</button>' +
      '<button class="dbmgr-btn" onclick="dbCreateIndex()">+ Index</button>' +
      '<button class="dbmgr-btn" onclick="dbRenameTable()">Ganti Nama</button>' +
      '<button class="dbmgr-btn" onclick="dbTruncateTable()">Kosongkan</button>' +
      '<button class="dbmgr-btn" style="color:#dc2626;border-color:#fca5a5" onclick="dbDropTable()">Hapus Tabel</button>' +
      '</div></div>' +
      '<div style="margin-bottom:18px">' + dbToGrid(cols.map(function (r) {
        return { Field: r.Field, Tipe: r.Type, Null: r.Null, Kunci: r.Key, Default: r.Default, Extra: r.Extra, Kolasi: r.Collation, Komentar: r.Comment };
      })) + '</div>' +
      (idx && idx.length ? '<div class="dbmgr-sec-title">Indeks</div>' + dbToGrid(idx.map(function (r) { return { Nama: r.Key_name, Kolom: r.Column_name, Unik: r.Non_unique === 0 ? 'YA' : 'TIDAK', Seq: r.Seq_in_index, Tipe: r.Index_type }; })) : '') +
      (createSql ? '<div class="dbmgr-sec-title" style="margin-top:18px">CREATE TABLE</div><pre style="background:#0f1b2d;color:#e6edf3;padding:12px;font-size:11.5px;overflow:auto;border-radius:4px">' + escapeHtml(createSql) + '</pre>' : '');
  } catch (e) { c.innerHTML = '<div style="color:#dc2626;font-size:12px">Error: ' + escapeHtml(e.message) + '</div>'; }
}

async function dbRenderData(c) {
  try {
    if (!dbMgr.current && dbMgr.tables.length) dbMgr.current = dbMgr.tables[0];
    if (!dbMgr.current) { c.innerHTML = '<div style="font-size:12px;color:#7a8699;padding:20px">Belum ada tabel.</div>'; return; }
    // load column + pk metadata
    try {
      var meta = await api('/api/admin/database/columns?db=' + encodeURIComponent(dbMgr.db) + '&table=' + encodeURIComponent(dbMgr.current));
      dbMgr.cols = (meta && meta.columns) || [];
      dbMgr.pk = (meta && meta.pk) || [];
      dbMgr.indexes = (meta && meta.indexes) || [];
    } catch (e) { dbMgr.cols = []; dbMgr.pk = []; dbMgr.indexes = []; }
    var off = dbMgr.page * dbMgr.pageSize;
    var rows = await dbRun('SELECT * FROM ' + dbQ(dbMgr.current) + ' LIMIT ' + dbMgr.pageSize + ' OFFSET ' + off);
    dbMgr.lastRows = rows;
    var total = dbMgr.rowCounts[dbMgr.current] || 0;
    var from = total === 0 ? 0 : off + 1;
    var to = Math.min(off + rows.length, total);
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">' +
      '<div class="dbmgr-sec-title" style="margin-bottom:0">Data: ' + escapeHtml(dbMgr.current) + '</div>' +
      '<button class="dbmgr-btn primary" onclick="dbInsertRow()">+ Tambah Baru</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;color:#55606e">' +
      '<span id="db-selcount">0</span> dipilih' +
      '<button class="dbmgr-btn" style="color:#dc2626;border-color:#fca5a5;height:26px" onclick="dbBulkDelete()">🗑 Hapus Terpilih</button>' +
      '</div>' +
      dbToDataGrid(rows) +
      '<div class="dbmgr-pager">' +
      '<button ' + (dbMgr.page <= 0 ? 'disabled' : '') + ' onclick="dbPage(-1)">‹ Sebelumnya</button>' +
      '<span>Baris ' + from + '–' + to + ' dari ' + total + ' (halaman ' + (dbMgr.page + 1) + ')</span>' +
      '<button ' + (to >= total ? 'disabled' : '') + ' onclick="dbPage(1)">Berikutnya ›</button>' +
      '</div>';
  } catch (e) { c.innerHTML = '<div style="color:#dc2626;font-size:12px">Error: ' + escapeHtml(e.message) + '</div>'; }
}

function dbToDataGrid(rows) {
  rows = rows || [];
  if (!rows.length) return '<div style="font-size:12px;color:#7a8699;padding:20px;text-align:center;border:1px dashed #d0d5dd">Tidak ada data pada halaman ini.</div>';
  var cols = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) === -1) cols.push(k); }); });
  dbMgr.lastCols = cols;
  return '<table class="dbmgr-grid"><thead><tr><th><input type="checkbox" onclick="dbToggleAll(this)" title="Pilih semua"></th><th>#</th>' + cols.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') + '<th style="width:150px;text-align:center">Aksi</th></tr></thead><tbody>' +
    rows.map(function (row, i) {
        return '<tr><td><input type="checkbox" class="db-sel" data-ridx="' + i + '" onchange="dbUpdateSelCount()"></td><td style="color:#9aa3af">' + (i + 1) + '</td>' + cols.map(function (c) {
        var v = row[c];
        if (v === null || v === undefined) return '<td><span class="dbmgr-null">NULL</span></td>';
        if (typeof v === 'object') v = JSON.stringify(v);
        return '<td title="' + escapeHtml(String(v)) + '">' + escapeHtml(String(v)) + '</td>';
      }).join('') +
        '<td style="text-align:center;white-space:nowrap">' +
        '<button class="dbmgr-btn" style="padding:2px 7px;font-size:10px;height:24px" onclick="dbEditRow(' + i + ')">Edit</button> ' +
        '<button class="dbmgr-btn" style="padding:2px 7px;font-size:10px;height:24px" onclick="dbDuplicateRow(' + i + ')">Salin</button> ' +
        '<button class="dbmgr-btn" style="padding:2px 7px;font-size:10px;height:24px;color:#dc2626;border-color:#fca5a5" onclick="dbDeleteRow(' + i + ')">Hapus</button>' +
        '</td></tr>';
    }).join('') + '</tbody></table>';
}

function dbToggleAll(cb) {
  document.querySelectorAll('.db-sel').forEach(function (el) { el.checked = cb.checked; });
  dbUpdateSelCount();
}
function dbUpdateSelCount() {
  var n = document.querySelectorAll('.db-sel:checked').length;
  var el = document.getElementById('db-selcount');
  if (el) el.textContent = n;
}

function dbFieldType(col) {
  var t = (col.Type || '').toLowerCase();
  if (t.indexOf('int') !== -1 || t.indexOf('decimal') !== -1 || t.indexOf('float') !== -1 || t.indexOf('double') !== -1) return 'number';
  if (t.indexOf('text') !== -1 || t.indexOf('blob') !== -1) return 'textarea';
  if (t.indexOf('datetime') !== -1 || t.indexOf('timestamp') !== -1) return 'datetime';
  if (t.indexOf('date') !== -1) return 'date';
  return 'text';
}

function dbRowForm(row, isNew) {
  var cols = dbMgr.cols && dbMgr.cols.length ? dbMgr.cols : dbMgr.lastCols.map(function (c) { return { Field: c, Type: '', Null: 'YES', Extra: '', Default: null }; });
  var html = '<div style="max-height:60vh;overflow:auto">';
  cols.forEach(function (col) {
    var name = col.Field;
    var val = row ? row[name] : '';
    if (val === null || val === undefined) val = '';
    if (typeof val === 'object') val = JSON.stringify(val);
    var ftype = dbFieldType(col);
    var isAuto = (col.Extra || '').indexOf('auto_increment') !== -1;
    var disabled = (isNew && isAuto) ? 'disabled style="background:#f1f3f6;color:#9aa3af"' : '';
    var lbl = escapeHtml(name) + (isAuto ? ' <span style="color:#9aa3af;font-size:10px">(auto)</span>' : '') + (col.Null === 'YES' ? ' <span style="color:#9aa3af;font-size:10px">nullable</span>' : '');
    html += '<div style="margin-bottom:10px"><label style="font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:3px">' + lbl + '</label>';
    var common = 'data-col="' + escapeHtml(name) + '" style="width:100%;border:1px solid #cbd2dc;padding:7px 9px;font-size:12.5px;font-family:Consolas,monospace" ' + disabled;
    if (ftype === 'textarea') html += '<textarea ' + common + ' rows="3">' + escapeHtml(val) + '</textarea>';
    else if (ftype === 'number') html += '<input type="number" step="any" ' + common + ' value="' + escapeHtml(val) + '">';
    else if (ftype === 'datetime') html += '<input type="text" placeholder="YYYY-MM-DD HH:MM:SS" ' + common + ' value="' + escapeHtml(val) + '">';
    else if (ftype === 'date') html += '<input type="text" placeholder="YYYY-MM-DD" ' + common + ' value="' + escapeHtml(val) + '">';
    else html += '<input type="text" ' + common + ' value="' + escapeHtml(val) + '">';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function dbCollectForm() {
  var vals = {};
  document.querySelectorAll('#db-row-modal [data-col]').forEach(function (el) {
    vals[el.getAttribute('data-col')] = el.value;
  });
  return vals;
}

function dbEditRow(index) {
  var row = dbMgr.lastRows[index];
  if (!row) return;
  dbMgr.editingIndex = index;
  showModal('<div class="section-title" style="margin-bottom:12px">Edit Baris — ' + escapeHtml(dbMgr.current) + '</div>' +
    '<div id="db-row-modal">' + dbRowForm(row, false) + '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
    '<button class="dbmgr-btn" onclick="closeModal()">Batal</button>' +
    '<button class="dbmgr-btn primary" onclick="dbSaveRow(false)">Simpan Perubahan</button>' +
    '</div>');
}

function dbInsertRow() {
  dbMgr.editingIndex = -1;
  showModal('<div class="section-title" style="margin-bottom:12px">Tambah Baris Baru — ' + escapeHtml(dbMgr.current) + '</div>' +
    '<div id="db-row-modal">' + dbRowForm(null, true) + '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
    '<button class="dbmgr-btn" onclick="closeModal()">Batal</button>' +
    '<button class="dbmgr-btn primary" onclick="dbSaveRow(true)">Tambah Data</button>' +
    '</div>');
}

async function dbSaveRow(isNew) {
  var vals = dbCollectForm();
  var body = { db: dbMgr.db, table: dbMgr.current, action: isNew ? 'insert' : 'update', values: vals };
  if (!isNew) {
    var orig = {};
    (dbMgr.pk.length ? dbMgr.pk : Object.keys(vals)).forEach(function (c) { orig[c] = dbMgr.lastRows[dbMgr.editingIndex][c]; });
    body.original = orig;
  }
  try {
    var d = await api('/api/admin/database/row', body);
    if (!d.success) throw new Error(d.message);
    closeModal();
    dbMgr.page = 0;
    renderDatabaseSoft();
  } catch (e) { alert('Gagal menyimpan: ' + e.message); }
}

async function dbDeleteRow(index) {
  var row = dbMgr.lastRows[index];
  if (!row) return;
  if (!dbMgr.pk.length) { alert('Tabel ini tidak punya primary key, penghapusan dibatalkan untuk keamanan.'); return; }
  if (!confirm('Hapus baris ini dari tabel ' + dbMgr.db + '.' + dbMgr.current + '?')) return;
  var orig = {};
  dbMgr.pk.forEach(function (c) { orig[c] = row[c]; });
  try {
    var d = await api('/api/admin/database/row', { db: dbMgr.db, table: dbMgr.current, action: 'delete', original: orig });
    if (!d.success) throw new Error(d.message);
    renderDatabaseSoft();
  } catch (e) { alert('Gagal menghapus: ' + e.message); }
}

async function dbBulkDelete() {
  if (!dbMgr.pk.length) { alert('Tabel ini tidak punya primary key, penghapusan dibatalkan untuk keamanan.'); return; }
  var idxs = Array.from(document.querySelectorAll('.db-sel:checked')).map(function (el) { return parseInt(el.getAttribute('data-ridx'), 10); });
  if (!idxs.length) { alert('Pilih baris yang akan dihapus.'); return; }
  if (!confirm('Hapus ' + idxs.length + ' baris terpilih dari ' + dbMgr.db + '.' + dbMgr.current + '?')) return;
  var ok = 0, fail = 0;
  for (var i = 0; i < idxs.length; i++) {
    var row = dbMgr.lastRows[idxs[i]];
    if (!row) continue;
    var orig = {};
    dbMgr.pk.forEach(function (c) { orig[c] = row[c]; });
    try {
      var d = await api('/api/admin/database/row', { db: dbMgr.db, table: dbMgr.current, action: 'delete', original: orig });
      if (d.success) ok++; else fail++;
    } catch (e) { fail++; }
  }
  alert('Selesai: ' + ok + ' dihapus' + (fail ? ', ' + fail + ' gagal' : ''));
  renderDatabaseSoft();
}

async function dbDuplicateRow(index) {
  var row = dbMgr.lastRows[index];
  if (!row) return;
  if (!dbMgr.pk.length) { alert('Tabel tidak punya primary key, duplikasi dibatalkan.'); return; }
  var vals = {};
  Object.keys(row).forEach(function (k) {
    if (dbMgr.pk.indexOf(k) !== -1) return; // skip pk (auto set)
    var v = row[k];
    if (v === null || v === undefined) return;
    if (typeof v === 'object') return;
    vals[k] = v;
  });
  try {
    var d = await api('/api/admin/database/row', { db: dbMgr.db, table: dbMgr.current, action: 'insert', values: vals });
    if (!d.success) throw new Error(d.message);
    renderDatabaseSoft();
  } catch (e) { alert('Gagal menduplikasi: ' + e.message); }
}

async function dbRunDdl(payload, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return false;
  try {
    var d = await api('/api/admin/database/ddl', payload);
    if (!d.success) throw new Error(d.message);
    return d;
  } catch (e) { alert('Gagal: ' + e.message); return false; }
}

async function dbSwitchDb(name) {
  if (!name) return;
  dbMgr.db = name;
  dbMgr.current = null;
  dbMgr.tab = 'overview';
  var el = document.getElementById('page-content');
  if (el) renderDatabase(el);
}

function dbOpenDbSwitcher() {
  var el = document.getElementById('dbmgr-content');
  if (el) { dbMgr.tab = 'operations'; dbMgrRenderContent(); }
}

function dbOpenDbManager() {
  showModal('<div class="section-title" style="margin-bottom:12px">Kelola SQL Database</div>' +
    '<div style="font-size:11px;color:#55606e;margin-bottom:8px">Buat database baru:</div>' +
    '<input id="db-new-name" placeholder="nama_database" style="width:100%;border:1px solid #cbd2dc;padding:8px;font-size:12px;margin-bottom:12px">' +
    '<button class="dbmgr-btn primary" onclick="dbCreateDb()">Buat Database</button>' +
    '<hr style="margin:16px 0;border:none;border-top:1px solid #e0e4ea">' +
    '<div style="font-size:11px;color:#55606e;margin-bottom:8px">Database tersedia:</div>' +
    '<div>' + dbMgr.databases.map(function (d) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">' +
        '<span style="flex:1;font-size:12px">' + escapeHtml(d) + (d === dbMgr.db ? ' <b style="color:#235a91">(aktif)</b>' : '') + '</span>' +
        (d !== 'northline' ? '<button class="dbmgr-btn" style="color:#dc2626;border-color:#fca5a5;height:24px;font-size:10px" onclick="dbDropDb(\'' + escapeHtml(d) + '\')">Hapus</button>' : '') +
        '</div>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="dbmgr-btn" onclick="closeModal()">Tutup</button></div>');
}

async function dbCreateDb() {
  var name = (document.getElementById('db-new-name').value || '').trim();
  if (!name) { alert('Nama database wajib diisi'); return; }
  if (!/^[a-zA-Z0-9_$]+$/.test(name)) { alert('Nama hanya boleh alphanumeric/_/$'); return; }
  var d = await dbRunDdl({ db: dbMgr.db, op: 'create_db', name: name });
  if (d) {
    dbMgr.databases.push(name);
    closeModal();
    dbSwitchDb(name);
  }
}

async function dbDropDb(name) {
  if (!confirm('Hapus database ' + name + ' beserta semua tabel? TIDAK DAPAT DIBATALKAN.')) return;
  var d = await dbRunDdl({ db: dbMgr.db, op: 'drop_db', name: name });
  if (d) { dbMgr.databases = dbMgr.databases.filter(function (x) { return x !== name; }); closeModal(); dbSwitchDb('northline'); }
}

async function dbDropTable() {
  if (!dbMgr.current) return;
  var d = await dbRunDdl({ db: dbMgr.db, op: 'drop_table', name: dbMgr.current }, 'Hapus tabel ' + dbMgr.db + '.' + dbMgr.current + '? TIDAK DAPAT DIBATALKAN.');
  if (d) { dbMgr.current = null; dbMgr.tab = 'overview'; renderDatabaseSoft(); }
}

async function dbTruncateTable() {
  if (!dbMgr.current) return;
  var d = await dbRunDdl({ db: dbMgr.db, op: 'truncate_table', name: dbMgr.current }, 'Kosongkan semua data pada tabel ' + dbMgr.current + '?');
  if (d) renderDatabaseSoft();
}

function dbRenameTable() {
  if (!dbMgr.current) return;
  showModal('<div class="section-title" style="margin-bottom:12px">Ganti Nama Tabel</div>' +
    '<input id="db-rename-to" placeholder="nama_baru" value="' + escapeHtml(dbMgr.current) + '" style="width:100%;border:1px solid #cbd2dc;padding:8px;font-size:12px">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="dbmgr-btn" onclick="closeModal()">Batal</button>' +
    '<button class="dbmgr-btn primary" onclick="dbDoRename()">Simpan</button></div>');
}

async function dbDoRename() {
  var to = (document.getElementById('db-rename-to').value || '').trim();
  if (!/^[a-zA-Z0-9_$]+$/.test(to)) { alert('Nama tidak valid'); return; }
  var d = await dbRunDdl({ db: dbMgr.db, op: 'rename_table', from: dbMgr.current, to: to });
  if (d) { var old = dbMgr.current; dbMgr.current = to; dbMgr.tables[dbMgr.tables.indexOf(old)] = to; closeModal(); renderDatabaseSoft(); dbMgrRedrawSidebar(); }
}

function dbAddColumn() {
  if (!dbMgr.current) return;
  showModal('<div class="section-title" style="margin-bottom:12px">Tambah Kolom — ' + escapeHtml(dbMgr.current) + '</div>' +
    '<div id="db-col-modal">' + dbColumnForm() + '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="dbmgr-btn" onclick="closeModal()">Batal</button>' +
    '<button class="dbmgr-btn primary" onclick="dbDoAddColumn()">Tambah</button></div>');
}

function dbColumnForm(col) {
  col = col || {};
  return '<div style="max-height:60vh;overflow:auto">' +
    '<div style="margin-bottom:8px"><label style="font-size:11px;font-weight:700;display:block;margin-bottom:3px">Nama kolom</label><input data-cf="name" value="' + escapeHtml(col.name || '') + '" style="width:100%;border:1px solid #cbd2dc;padding:7px 9px;font-size:12px"></div>' +
    '<div style="margin-bottom:8px"><label style="font-size:11px;font-weight:700;display:block;margin-bottom:3px">Tipe (mis. VARCHAR(191), INT, TEXT, DATETIME)</label><input data-cf="type" value="' + escapeHtml(col.type || 'VARCHAR(191)') + '" style="width:100%;border:1px solid #cbd2dc;padding:7px 9px;font-size:12px;font-family:monospace"></div>' +
    '<div style="display:flex;gap:14px;margin-bottom:8px">' +
    '<label style="font-size:12px"><input type="checkbox" data-cf="unsigned" ' + (col.unsigned ? 'checked' : '') + '> UNSIGNED</label>' +
    '<label style="font-size:12px"><input type="checkbox" data-cf="nullable" ' + (col.nullable ? 'checked' : '') + '> NULL</label>' +
    '<label style="font-size:12px"><input type="checkbox" data-cf="ai" ' + (col.ai ? 'checked' : '') + '> AUTO_INCREMENT</label>' +
    '<label style="font-size:12px"><input type="checkbox" data-cf="pk" ' + (col.pk ? 'checked' : '') + '> PRIMARY KEY</label>' +
    '</div>' +
    '<div style="margin-bottom:8px"><label style="font-size:11px;font-weight:700;display:block;margin-bottom:3px">Default (kosongkan = none)</label><input data-cf="default" value="' + escapeHtml(col.default != null ? col.default : '') + '" style="width:100%;border:1px solid #cbd2dc;padding:7px 9px;font-size:12px"></div>' +
    '</div>';
}

function dbCollectColumn() {
  var f = {};
  document.querySelectorAll('#db-col-modal [data-cf]').forEach(function (el) {
    if (el.type === 'checkbox') f[el.getAttribute('data-cf')] = el.checked;
    else f[el.getAttribute('data-cf')] = el.value;
  });
  return f;
}

async function dbDoAddColumn() {
  var cf = dbCollectColumn();
  if (!/^[a-zA-Z0-9_$]+$/.test(cf.name)) { alert('Nama kolom tidak valid'); return; }
  if (!/^[a-zA-Z0-9_(), ]+$/.test(cf.type)) { alert('Tipe tidak valid'); return; }
  var d = await dbRunDdl({ db: dbMgr.db, op: 'add_column', table: dbMgr.current, column: cf });
  if (d) { closeModal(); dbMgr.tab = 'structure'; renderDatabaseSoft(); }
}

async function dbDropColumn(colName) {
  if (!confirm('Hapus kolom ' + colName + '? TIDAK DAPAT DIBATALKAN.')) return;
  var d = await dbRunDdl({ db: dbMgr.db, op: 'drop_column', table: dbMgr.current, column: colName });
  if (d) renderDatabaseSoft();
}

function dbCreateIndex() {
  if (!dbMgr.current) return;
  var cols = (dbMgr.cols && dbMgr.cols.length ? dbMgr.cols : []).map(function (c) { return '<option value="' + escapeHtml(c.Field) + '">' + escapeHtml(c.Field) + '</option>'; }).join('');
  showModal('<div class="section-title" style="margin-bottom:12px">Buat Index — ' + escapeHtml(dbMgr.current) + '</div>' +
    '<div style="margin-bottom:8px"><label style="font-size:11px;font-weight:700;display:block;margin-bottom:3px">Nama index</label><input id="db-idx-name" placeholder="idx_nama" style="width:100%;border:1px solid #cbd2dc;padding:7px 9px;font-size:12px"></div>' +
    '<div style="margin-bottom:8px"><label style="font-size:11px;font-weight:700;display:block;margin-bottom:3px">Kolom (Ctrl+klik untuk banyak)</label><select id="db-idx-cols" multiple style="width:100%;border:1px solid #cbd2dc;padding:7px 9px;font-size:12px;height:90px">' + cols + '</select></div>' +
    '<label style="font-size:12px"><input type="checkbox" id="db-idx-uniq"> UNIQUE</label>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="dbmgr-btn" onclick="closeModal()">Batal</button>' +
    '<button class="dbmgr-btn primary" onclick="dbDoCreateIndex()">Buat</button></div>');
}

async function dbDoCreateIndex() {
  var name = (document.getElementById('db-idx-name').value || '').trim();
  var sel = document.getElementById('db-idx-cols');
  var columns = Array.from(sel.selectedOptions).map(function (o) { return o.value; });
  var uniq = document.getElementById('db-idx-uniq').checked;
  if (!/^[a-zA-Z0-9_$]+$/.test(name)) { alert('Nama index tidak valid'); return; }
  if (!columns.length) { alert('Pilih minimal satu kolom'); return; }
  var d = await dbRunDdl({ db: dbMgr.db, op: 'create_index', name: name, table: dbMgr.current, columns: columns, unique: uniq });
  if (d) { closeModal(); dbMgr.tab = 'structure'; renderDatabaseSoft(); }
}

async function dbDropIndex(name) {
  if (!confirm('Hapus index ' + name + '?')) return;
  var d = await dbRunDdl({ db: dbMgr.db, op: 'drop_index', table: dbMgr.current, name: name });
  if (d) renderDatabaseSoft();
}

async function dbRenderOperations(c) {
  try {
    if (!dbMgr.current && dbMgr.tables.length) dbMgr.current = dbMgr.tables[0];
    if (!dbMgr.current) { c.innerHTML = '<div style="font-size:12px;color:#7a8699;padding:20px">Pilih tabel untuk operasi.</div>'; return; }
    var cnt = await api('/api/admin/database/count?db=' + encodeURIComponent(dbMgr.db) + '&table=' + encodeURIComponent(dbMgr.current)).catch(function () { return { count: 0 }; });
    c.innerHTML =
      '<div class="dbmgr-sec-title">Operasi Tabel: ' + escapeHtml(dbMgr.db) + '.' + escapeHtml(dbMgr.current) + '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
      '<div class="dbmgr-card"><h3>' + (cnt.count || 0) + '</h3><p>Jumlah Baris</p></div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;max-width:520px">' +
      '<button class="dbmgr-btn" style="justify-content:flex-start" onclick="dbRenameTable()">✎ Ganti nama tabel</button>' +
      '<button class="dbmgr-btn" style="justify-content:flex-start" onclick="dbAddColumn()">＋ Tambah kolom baru</button>' +
      '<button class="dbmgr-btn" style="justify-content:flex-start" onclick="dbCreateIndex()">＋ Buat index baru</button>' +
      '<button class="dbmgr-btn" style="justify-content:flex-start" onclick="dbTruncateTable()">⚠ Kosongkan tabel (TRUNCATE)</button>' +
      '<button class="dbmgr-btn" style="justify-content:flex-start;color:#dc2626;border-color:#fca5a5" onclick="dbDropTable()">🗑 Hapus tabel (DROP)</button>' +
      '</div>';
  } catch (e) { c.innerHTML = '<div style="color:#dc2626;font-size:12px">Error: ' + escapeHtml(e.message) + '</div>'; }
}

function dbRenderSql(c) {
  var hist = (dbMgr.history || []).map(function (h, i) {
    return '<div style="padding:5px 8px;font-family:monospace;font-size:11px;color:#333;border-bottom:1px solid #f1f3f6;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="dbUseHistory(' + i + ')" title="' + escapeHtml(h) + '">' + escapeHtml(h) + '</div>';
  }).join('');
  c.innerHTML =
    '<div class="dbmgr-sec-title">Konsol SQL</div>' +
    '<textarea id="db-query-text" class="dbmgr-sqlbox" oninput="dbMgr.sqlText=this.value" placeholder="Contoh:&#10;SELECT id, username FROM user_northline LIMIT 10;&#10;SHOW TABLES;">' + escapeHtml(dbMgr.sqlText || '') + '</textarea>' +
    '<div style="display:flex;gap:8px;margin:8px 0 14px">' +
    '<button class="dbmgr-btn primary" onclick="executeDbQuery()">▶ Eksekusi (F8)</button>' +
    '<button class="dbmgr-btn" onclick="dbClearSql()">Bersihkan</button>' +
    '<span style="font-size:11px;color:#9aa3af;align-self:center">Hanya SELECT / SHOW / DESCRIBE yang diizinkan</span>' +
    '</div>' +
    '<div id="db-result"></div>' +
    (hist ? '<div style="margin-top:16px"><div class="dbmgr-sec-title">Riwayat Query</div><div style="border:1px solid #e0e4ea;background:#fff">' + hist + '</div></div>' : '');
  if (typeof window !== 'undefined') {
    if (!window._dbKeyHandler) {
      window._dbKeyHandler = function (ev) {
        if (ev.key === 'F8') {
          ev.preventDefault();
          if (document.getElementById('db-query-text') && document.getElementById('page-content')) executeDbQuery();
        }
      };
      window.addEventListener('keydown', window._dbKeyHandler);
    }
  }
}

async function dbRenderUsers(c) {
  try {
    var mysqlUsers = await dbRun('SELECT User AS Pengguna, Host, plugin AS Auth FROM mysql.user').catch(function () { return null; });
    var appUsers = await dbRun('SELECT id, username, role, phone FROM user_northline ORDER BY id');
    c.innerHTML =
      '<div class="dbmgr-sec-title">Pengguna Database Server (mysql.user)</div>' +
      (mysqlUsers ? dbToGrid(mysqlUsers) : '<div style="font-size:12px;color:#7a8699;padding:10px;border:1px dashed #d0d5dd;margin-bottom:18px">Tidak punya izin membaca mysql.user — koneksi memakai user terbatas (Northline).</div>') +
      '<div class="dbmgr-sec-title" style="margin-top:18px">Pengguna Aplikasi (user_northline)</div>' +
      dbToGrid(appUsers);
  } catch (e) { c.innerHTML = '<div style="color:#dc2626;font-size:12px">Error: ' + escapeHtml(e.message) + '</div>'; }
}

function dbOpenTable(name) {
  dbMgr.current = name;
  dbMgr.tab = 'data';
  dbMgr.page = 0;
  dbMgrRedrawSidebar();
  dbMgrRedrawTopbar();
  dbMgrRenderContent();
}

function dbMgrRedrawTopbar() {
  var main = document.querySelector('.dbmgr-main .dbmgr-topbar');
  if (!main || !document.querySelector('.dbmgr')) return;
  renderDatabase(document.getElementById('page-content'));
}

function dbSelectDb() { dbMgr.current = null; dbMgr.tab = 'overview'; dbMgrRedrawSidebar(); renderDatabase(document.getElementById('page-content')); }

function dbTabClick(tab) {
  if ((tab === 'structure' || tab === 'data') && !dbMgr.current) { dbMgr.tab = 'overview'; } else { dbMgr.tab = tab; }
  if (tab !== 'sql') dbMgr.sqlText = (document.getElementById('db-query-text') || {}).value || dbMgr.sqlText;
  dbMgrRedrawSidebar();
  renderDatabaseSoft();
}

function renderDatabaseSoft() {
  var el = document.getElementById('page-content');
  if (!el) return;
  el.innerHTML = dbMgrLayout();
  dbMgrRenderContent();
}

async function dbRefresh() {
  var el = document.getElementById('page-content');
  if (el) renderDatabase(el);
}

function dbPage(delta) { dbMgr.page = Math.max(0, dbMgr.page + delta); renderDatabaseSoft(); }

function dbUseHistory(i) {
  dbMgr.sqlText = dbMgr.history[i];
  dbMgr.tab = 'sql';
  renderDatabaseSoft();
}

function dbClearSql() { dbMgr.sqlText = ''; var t = document.getElementById('db-query-text'); if (t) t.value = ''; }

async function executeDbQuery() {
  var box = document.getElementById('db-result');
  var query = ((document.getElementById('db-query-text') || {}).value || '').trim();
  if (!box) return;
  if (!query) { box.style.display = 'block'; box.innerHTML = '<div style="color:#dc2626;font-size:12px">Query kosong.</div>'; return; }
  var first = query.split(/\s+/)[0].toUpperCase().replace(/;$/, '');
  if (['DROP', 'TRUNCATE', 'DELETE', 'ALTER', 'RENAME', 'UPDATE', 'CREATE'].indexOf(first) !== -1) {
    if (!confirm('Menjalankan perintah ' + first + '. Lanjutkan?')) return;
  }
  box.style.display = 'block';
  box.innerHTML = '<div style="font-size:12px;color:#7a8699">Menjalankan query...</div>';
  try {
    var t0 = Date.now();
    var d = await api('/api/admin/database/query?db=' + encodeURIComponent(dbMgr.db) + '&query=' + encodeURIComponent(query));
    var ms = Date.now() - t0;
    if (!d || !d.success) throw new Error((d && d.message) || 'Query gagal');
    dbMgr.history.unshift(query);
    if (dbMgr.history.length > 20) dbMgr.history.pop();
    var rows = Array.isArray(d.result) ? d.result : [];
    dbMgr.lastRows = rows;
    if (rows.length) {
      box.innerHTML =
        '<div style="font-size:11px;color:#55606e;margin-bottom:6px;background:#eef2f8;border-left:3px solid #235a91;padding:6px 10px">' +
        '<strong>' + rows.length + '</strong> baris • ' + ms + ' ms • ' + escapeHtml(new Date().toLocaleTimeString()) + '</div>' +
        dbToGrid(rows);
    } else {
      box.innerHTML =
        '<div style="font-size:11px;color:#55606e;background:#eef2f8;border-left:3px solid #16a34a;padding:6px 10px">' +
        '✓ Eksekusi berhasil • affected: <strong>' + (d.affectedRows || 0) + '</strong>' +
        (d.info && d.info.insertId ? ' • insertId: <strong>' + d.info.insertId + '</strong>' : '') + ' • ' + ms + ' ms</div>';
    }
  } catch (e) {
    box.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px;background:#fef2f2;border:1px solid #fecaca">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

function dbExportCsv() {
  var rows = dbMgr.lastRows || [];
  if (!rows.length) { alert('Tidak ada data untuk diekspor. Buka tab Data atau jalankan query dulu.'); return; }
  var cols = Object.keys(rows[0]);
  var esc = function (v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    return '"' + String(v).replace(/"/g, '""') + '"';
  };
  var csv = cols.join(',') + '\n' + rows.map(function (r) { return cols.map(function (cc) { return esc(r[cc]); }).join(','); }).join('\n');
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'northline_export_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


async function renderFlashDiscount(el) {
  try {
    var cat = await api('/api/catalog/products');
    var products = cat.products || [];
    var d = await api('/api/admin/settings');
    var s = d.settings || {};
    var prices = {};
    try { prices = JSON.parse(s.flash_prices || '{}'); } catch (e) { prices = {}; }
    var today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    var legacyDate = s.flash_date || '';
    var startDate = s.flash_start_date || legacyDate || today;
    var endDate = s.flash_end_date || legacyDate || startDate;
    var active = s.flash_active === '1';
    var rowsHtml = (products || []).map(function (p) {
      var promo = prices[String(p.id)];
      return '<tr data-flash-search="' + escapeHtml(String(p.name || '') + ' ' + p.id) + '">' +
        '<td style="font-size:12px">' + escapeHtml(p.name) + '</td>' +
        '<td style="font-size:12px">' + formatRp(p.price) + '</td>' +
        '<td><input type="number" id="flash-price-' + p.id + '" value="' + (promo || '') + '" placeholder="—" min="0" style="width:120px;height:32px;border:1px solid #d1d5db;padding:0 8px"></td>' +
        '</tr>';
    }).join('');
    el.innerHTML =
      '<div class="card"><div class="section-title">Setting Price</div>' +
      '<div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
      '<input type="checkbox" id="flash-active" ' + (active ? 'checked' : '') + '> <span>Aktifkan harga promo sesuai jadwal</span>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px">' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Tanggal Mulai</label><input type="date" id="flash-start-date" value="' + escapeHtml(startDate) + '" required style="height:36px;border:1px solid #d1d5db;padding:0 8px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Mulai Jam</label><input type="time" id="flash-start" value="' + escapeHtml(s.flash_start || '17:45') + '" required style="height:36px;border:1px solid #d1d5db;padding:0 8px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Tanggal Berakhir</label><input type="date" id="flash-end-date" value="' + escapeHtml(endDate) + '" required style="height:36px;border:1px solid #d1d5db;padding:0 8px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Berakhir Jam</label><input type="time" id="flash-end" value="' + escapeHtml(s.flash_end || '00:00') + '" required style="height:36px;border:1px solid #d1d5db;padding:0 8px"></div>' +
      '<div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Status Saat Ini</label><div style="font-size:12px;font-weight:700;' + (cat.flashActive ? 'color:#16a34a' : 'color:#6b7280') + '">' + (cat.flashActive ? 'AKTIF' : 'Nonaktif') + '</div></div>' +
      '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-bottom:16px">Jadwal menggunakan WIB. Atur tanggal mulai dan berakhir untuk promo beberapa hari atau bulan. Jika tanggalnya sama dan jam berakhir lebih awal, promo berakhir keesokan hari.</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:8px">Isi harga promo per produk. Kosongkan untuk memakai harga normal.</div>' +
      '<div style="margin-bottom:12px"><input type="search" id="flash-product-search" value="' + escapeHtml(flashDiscountSearch) + '" oninput="filterFlashProducts(this.value)" placeholder="Search Product" style="width:100%;max-width:420px;height:30px;border:1px solid #d1d5db;padding:0 10px"></div>' +
      '<table style="font-size:12px"><thead><tr><th style="text-align:left">Produk</th><th style="text-align:left">Harga Normal</th><th style="text-align:left">Harga Promo (Rp)</th></tr></thead><tbody>' +
      rowsHtml +
      '<tr id="flash-no-results" style="display:none"><td colspan="3" style="text-align:center;color:#9ca3af">Tidak ada produk yang cocok dengan pencarian.</td></tr>' +
      '</tbody></table>' +
      '<button class="btn btn-primary" onclick="saveFlashSettings()" style="margin-top:16px">Simpan Setting Price</button>' +
      '</div>';
    filterFlashProducts(flashDiscountSearch);
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

function filterFlashProducts(value) {
  flashDiscountSearch = String(value || '');
  var query = flashDiscountSearch.trim().toLocaleLowerCase('id-ID');
  var rows = document.querySelectorAll('#page-content tr[data-flash-search]');
  var visibleCount = 0;
  rows.forEach(function (row) {
    var matches = !query || (row.dataset.flashSearch || '').toLocaleLowerCase('id-ID').includes(query);
    row.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });
  var empty = document.getElementById('flash-no-results');
  if (empty) {
    empty.style.display = visibleCount ? 'none' : '';
    empty.querySelector('td').textContent = query ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Tidak ada produk.';
  }
}

async function saveFlashSettings() {
  var prices = {};
  var any = false;
  document.querySelectorAll('[id^="flash-price-"]').forEach(function (input) {
    var id = input.id.replace('flash-price-', '');
    var v = parseInt(input.value);
    if (Number.isFinite(v) && v > 0) {
      prices[id] = v;
      any = true;
    }
  });
  var startDate = (document.getElementById('flash-start-date') || {}).value || '';
  var endDate = (document.getElementById('flash-end-date') || {}).value || '';
  var startTime = (document.getElementById('flash-start') || {}).value || '';
  var endTime = (document.getElementById('flash-end') || {}).value || '';
  if (!startDate || !endDate || !startTime || !endTime || endDate < startDate) {
    alert('Tanggal dan waktu mulai serta berakhir wajib diisi. Tanggal berakhir tidak boleh sebelum tanggal mulai.');
    return;
  }
  var vals = {
    flash_active: (document.getElementById('flash-active') || {}).checked ? '1' : '0',
    flash_date: startDate,
    flash_start_date: startDate,
    flash_end_date: endDate,
    flash_start: startTime,
    flash_end: endTime,
    flash_prices: JSON.stringify(prices)
  };
  try {
    for (var key in vals) {
      var result = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ key: key, value: vals[key] }) });
      if (!result || !result.success) throw new Error((result && result.message) || 'Gagal menyimpan pengaturan harga.');
    }
    alert(any ? 'Setting Price berhasil disimpan.' : 'Jadwal Setting Price berhasil disimpan tanpa harga promo.');
  } catch (error) {
    alert(error.message || 'Gagal menyimpan Setting Price.');
  }
}

async function saveSettings() {
  var vals = {
    po_target_date: (document.getElementById('set-po-date') || {}).value,
    wa_reminder_time: (document.getElementById('set-wa-time') || {}).value,
    site_name: (document.getElementById('set-site-name') || {}).value,
    site_contact: (document.getElementById('set-site-contact') || {}).value,
    site_address: (document.getElementById('set-site-address') || {}).value,
    store_origin_lat: (document.getElementById('set-store-lat') || {}).value,
    store_origin_lng: (document.getElementById('set-store-lng') || {}).value
  };
  for (var key in vals) {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ key: key, value: vals[key] }) });
  }
  alert('Pengaturan disimpan!');
}

function formatNum(n) {
  return (parseInt(n || 0) || 0).toLocaleString('id-ID');
}

function formatTok(n) {
  n = parseInt(n || 0) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function timeAgo(ts) {
  if (!ts) return '-';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '-';
  var s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 0) s = 0;
  if (s < 60) return s + ' dtk lalu';
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  return Math.floor(s / 86400) + ' hari lalu';
}

async function renderAiModels(el) {
  try {
    var d = await api('/api/admin/ai-models');
    var s = d.summary || {};
    var activeName = d.active ? escapeHtml(d.activeName) : 'Tidak Aktif';

    var html =
      '<div class="grid-stats">' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=7OMdCpw0sxP6&format=png&color=000000"></div><div class="info"><h3>' + formatNum(s.totalMessages) + '</h3><p>Total Pesan AI</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=4rLjJ3tMbQ7V&format=png&color=000000"></div><div class="info"><h3>' + formatTok(s.totalTokens) + '</h3><p>Total Token</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=82665&format=png&color=000000"></div><div class="info"><h3>' + formatCost(s.estCost) + '</h3><p>Estimasi Biaya</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=zQjzFjPpT2Ek&format=png&color=000000"></div><div class="info"><h3>' + (s.totalEnabled || 0) + ' / ' + (s.totalActive || 0) + '</h3><p>Model En/Activ</p></div></div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:16px"><div class="section-title">Ringkasan Penggunaan AI</div>' +
      '<p style="font-size:12px;color:#6b7280;margin:0 0 12px">Aktif: <span class="badge badge-success">' + activeName + '</span> &middot; Terakhir digunakan: ' + timeAgo(s.lastUsedAt) + ' &middot; Rata-rata token/pesan: ' + (parseInt(s.totalMessages) > 0 ? formatNum(Math.round(s.totalTokens / s.totalMessages)) : '0') + '</p></div>' +

      '<div class="card"><div class="section-title">Model AI Chat</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><span class="badge' + (d.active ? ' badge-success' : '') + '">' + activeName + '</span>' +
      '<button class="btn btn-outline btn-sm" onclick="selectAiModel(\'' + (d.active ? d.active.provider + '/' + d.active.model_id : '') + '\')">Gunakan</button></div>' +
      '<table class="w-full" style="font-size:12px;"><thead><tr><th>Provider</th><th>Model</th><th>Status</th><th>Pesan</th><th>Token</th><th>Terakhir Digunakan</th><th>Aksi</th></tr></thead><tbody>';
    (d.models || []).forEach(function (m) {
      var status = (m.is_active && m.enabled) ? 'Aktif' : (m.enabled ? 'Tersedia' : 'Nonaktif');
      var statusClass = (m.is_active && m.enabled) ? 'badge-success' : (m.enabled ? 'badge-pending' : 'badge-gray');
      var enableBtn = m.enabled ? '<button class="btn btn-sm btn-outline" onclick="enableAiModel(' + m.id + ')">Aktifkan</button>' : '<button class="btn btn-sm btn-outline disabled" disabled>Nonaktif</button>';
      html += '<tr><td>' + escapeHtml(m.provider) + '</td><td>' + escapeHtml(m.model_id) + '</td><td><span class="badge ' + statusClass + '">' + status + '</span></td><td>' + formatNum(m.total_messages) + '</td><td>' + formatTok(m.total_tokens) + '</td><td>' + timeAgo(m.last_used_at) + '</td><td>' + enableBtn + '</td></tr>';
    });
    html += '</tbody></table>' +
      '<div style="margin-top:24px"><button class="btn btn-primary" onclick="refreshAiModels()">Sinkronkan Model Copilot</button> <button class="btn btn-secondary" onclick="testAiModel()">Test Model Aktif</button></div>';
    el.innerHTML = html;
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error: ' + escapeHtml(e.message) + '</div>'; }
}

function selectAiModel(modelId) {
  if (!modelId) return alert('Model tidak ditemukan');
  api('/api/admin/ai-models/select', { method: 'POST', body: JSON.stringify({ provider: modelId.split('/')[0], model_id: modelId.split('/')[1] }) }).then(function (d) {
    if (d.success) {
      alert('Model AI diganti ke ' + modelId);
      location.reload();
    } else {
      alert('Gagal: ' + (d.message || 'unknown'));
    }
  });
}

async function enableAiModel(id) {
  try {
    var data = await api('/api/admin/ai-models');
    var model = (data.models || []).find(function (item) { return Number(item.id) === Number(id); });
    if (!model || model.provider !== 'copilot') {
      return alert('Model Copilot tidak ditemukan. Sinkronkan model terlebih dahulu.');
    }
    var result = await api('/api/admin/ai-models/select', {
      method: 'POST',
      body: JSON.stringify({ provider: model.provider, model_id: model.model_id })
    });
    if (result.success) location.reload();
    else alert('Gagal mengaktifkan model: ' + (result.message || 'unknown'));
  } catch (e) {
    alert('Gagal mengaktifkan model: ' + e.message);
  }
}

function refreshAiModels() {
  api('/api/admin/ai-models/sync', { method: 'POST', body: JSON.stringify({}) }).then(function (d) {
    if (d.success) {
      alert(d.message + ' Model aktif: ' + d.activeModel);
      location.reload();
    } else {
      alert('Gagal sinkronkan model Copilot: ' + (d.message || 'unknown'));
    }
  }).catch(function (e) {
    alert('Gagal sinkronkan model Copilot: ' + e.message);
  });
}

function testAiModel() {
  api('/api/admin/ai-models').then(function (models) {
    if (!models.active) {
      alert('Belum ada model Copilot aktif. Sinkronkan model terlebih dahulu.');
      return;
    }
    return api('/api/admin/ai-models/check', {
      method: 'POST',
      body: JSON.stringify({ provider: models.active.provider, model_id: models.active.model_id })
    }).then(function (d) {
      if (d.success) {
        alert('Model ' + models.active.provider + '/' + models.active.model_id + ' merespons: ' + (d.reply || '').trim());
      } else {
        alert('Model gagal: ' + (d.error || d.message || 'unknown'));
      }
    });
  }).catch(function (e) {
    alert('Gagal menguji model: ' + e.message);
  });
}

async function renderNorthpaySettings() {
  var tc = document.getElementById('northpay-tab-content');
  if (!tc) return;
  var search = (document.getElementById('northpay-settings-search') || {}).value || '';
  var d = await api('/api/admin/northpay/settings?page=' + northpaySettingsPage + '&limit=20&search=' + encodeURIComponent(search));
  tc.innerHTML =
    '<div class="filter-bar"><input type="text" id="northpay-settings-search" placeholder="Cari user..." value="' + escapeHtml(search) + '" oninput="debouncedNorthpaySettings()"><button class="btn btn-primary" onclick="northpaySettingsPage=1;debouncedNorthpaySettings()">Cari</button></div>' +
    '<div class="card"><table><thead><tr><th>User</th><th>PIN</th><th>Security Q</th><th>Auto Topup</th><th>Daily Limit</th><th>Biometric</th><th>Aksi</th></tr></thead><tbody>' +
    (d.users || []).map(function (u) {
      return '<tr><td>' + escapeHtml(u.name || u.username) + '</td><td>' + (u.northpay_pin ? '<span class="badge badge-success">Diset</span>' : '<span class="badge badge-gray">Belum</span>') + '</td><td>' + (u.northpay_security_question ? '<span class="badge badge-info">Diset</span>' : '<span class="badge badge-gray">Belum</span>') + '</td><td>' + (u.northpay_auto_topup_enabled ? '<span class="badge badge-pending">On: ' + formatRp(u.northpay_auto_topup_amount || 0) + ' @ ' + formatRp(u.northpay_auto_topup_threshold || 0) + '</span>' : '<span class="badge badge-gray">Off</span>') + '</td><td>' + formatRp(u.northpay_daily_limit || 5000000) + '</td><td>' + (u.northpay_biometric_enabled ? '<span class="badge badge-success">On</span>' : '<span class="badge badge-gray">Off</span>') + '</td><td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onclick="viewNorthpaySettingsDetail(' + u.id + ')">Detail</button> <button class="btn btn-danger btn-sm" onclick="resetNorthpayUserPin(' + u.id + ')">Reset PIN</button></td></tr>';
    }).join('') +
    '</tbody></table>' +
    ((d.users || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada user</p>' : '') +
    '<div class="pagination"><button onclick="northpaySettingsPage=Math.max(1,northpaySettingsPage-1);debouncedNorthpaySettings()"' + (northpaySettingsPage <= 1 ? ' disabled' : '') + '>Prev</button><span>Page ' + (d.page || northpaySettingsPage) + ' of ' + Math.ceil((d.total || 0) / (d.limit || 20)) + '</span><button onclick="northpaySettingsPage++;debouncedNorthpaySettings()"' + (northpaySettingsPage >= Math.ceil((d.total || 0) / (d.limit || 20)) ? ' disabled' : '') + '>Next</button></div></div>';
}

function debouncedNorthpaySettings() {
  clearTimeout(renderNorthpaySettingsTimeout);
  renderNorthpaySettingsTimeout = setTimeout(function () { northpayAdminTab='settings';navTo('northpay'); }, 300);
}

var northpaySettingsPage = 1;
var renderNorthpaySettingsTimeout;

function viewNorthpaySettingsDetail(userId) {
  api('/api/admin/northpay/user/' + userId).then(function(d) {
    if (!d.success) return showIosModal(d.message || 'Gagal memuat detail');
    var u = d.user;
    showModal('<h2>Detail Pengaturan - ' + escapeHtml(u.name || u.username) + '</h2><div class="space-y-3 mt-4">' +
      '<div class="flex justify-between py-2 border-b"><span>PIN</span><span class="font-medium">' + (u.northpay_pin ? 'Diset pada ' + new Date(u.northpay_pin_set_at).toLocaleDateString('id-ID') : 'Belum diset') + '</span></div>' +
      '<div class="flex justify-between py-2 border-b"><span>Pertanyaan Keamanan</span><span class="font-medium">' + (u.northpay_security_question || 'Belum diset') + '</span></div>' +
      '<div class="flex justify-between py-2 border-b"><span>Auto Topup</span><span class="font-medium">' + (u.northpay_auto_topup_enabled ? 'Aktif (Jumlah: ' + formatRp(u.northpay_auto_topup_amount) + ', Threshold: ' + formatRp(u.northpay_auto_topup_threshold) + ')' : 'Nonaktif') + '</span></div>' +
      '<div class="flex justify-between py-2 border-b"><span>Limit Harian</span><span class="font-medium">' + formatRp(u.northpay_daily_limit) + '</span></div>' +
      '<div class="flex justify-between py-2 border-b"><span>Biometric</span><span class="font-medium">' + (u.northpay_biometric_enabled ? 'Aktif' : 'Nonaktif') + '</span></div>' +
      '<div class="flex justify-between py-2 border-b"><span>Saldo</span><span class="font-medium text-[#DF414F]">' + formatRp(u.northpay_balance) + '</span></div>' +
      '<div class="flex justify-between py-2"><span>Terakhir Update Keamanan</span><span class="font-medium">' + (u.northpay_last_security_change ? new Date(u.northpay_last_security_change).toLocaleString('id-ID') : '-') + '</span></div>' +
      '</div>');
  });
}

function resetNorthpayUserPin(userId) {
  if (!confirm('Yakin ingin reset PIN user ini? User harus setup PIN ulang.')) return;
  api('/api/admin/northpay/reset-pin', { method: 'POST', body: JSON.stringify({ userId: userId }) }).then(function(d) {
    if (d.success) {
      showIosModal('PIN berhasil direset');
      navTo('northpay');
    } else {
      showIosModal(d.message || 'Gagal reset PIN');
    }
  });
}

function formatScore(s) {
  var v = parseFloat(s);
  if (isNaN(v)) return '-';
  return (v * 100).toFixed(1) + '%';
}

// Ambang yang sama dengan FACE_MATCH_THRESHOLD di backend/routes/npinjam.js:
// di bawah ini berarti server menolak.
var NL_FACE_PASS = 0.5;
// Ambang tampilan: di atas ini badge hijau, di antaranya kuning.
var NL_FACE_GOOD = 0.6;

// Badge skor wajah untuk admin.
//
// Yang menentukan adalah facial_verification_status, bukan face_match_score.
// Kolom face_match_score dulu diisi dari nilai yang dikirim browser sehingga
// bisa dipalsukan; backend sekarang mengisinya sendiri dan mengabaikan input
// klien. Baris lama (sebelum kolom status ada) tidak punya nilai yang
// dipercaya, jadi ditampilkan sebagai "Perlu Review" - bukan optimistic 0%
// atau 100%.
function nlFaceStatusLabel(status) {
  if (status === 'verified') return 'Terverifikasi (server)';
  if (status === 'mismatch') return 'Tidak Cocok';
  if (status === 'unavailable') return 'Tidak dapat diverifikasi - perlu review manual';
  return 'Tidak diketahui (data lama)';
}

function nlFaceStatus(a) {
  var status = a && a.facial_verification_status;
  if (status === 'verified') {
    var v = parseFloat(a.face_verify_score);
    if (isNaN(v)) return { cls: 'badge-pending', text: 'Terverifikasi' };
    return { cls: v >= NL_FACE_GOOD ? 'badge-success' : (v >= NL_FACE_PASS ? 'badge-pending' : 'badge-danger'), text: (v * 100).toFixed(1) + '%' };
  }
  if (status === 'mismatch') {
    return { cls: 'badge-danger', text: 'Tidak Cocok' };
  }
  // 'unavailable' maupun baris tanpa status.
  return { cls: 'badge-pending', text: 'Perlu Review' };
}

function faceBadge(a) {
  if (!a) return '<span class="badge badge-info">-</span>';
  var s = nlFaceStatus(a);
  return '<span class="badge ' + s.cls + '">' + s.text + '</span>';
}

function livenessBadge(a) {
  if (!a) return '<span class="badge badge-info">-</span>';
  if (a.facial_verification_status === 'unavailable') {
    return '<span class="badge badge-pending">Perlu Review</span>';
  }
  return a.liveness_passed ? '<span class="badge badge-success">Lulus</span>' : '<span class="badge badge-pending">Belum</span>';
}

async function renderNPinjam(el) {
  if (npinjamAdminTab === 'loans') { renderNPinjamLoans(el); return; }
  try {
    var d = await api('/api/admin/npinjam/applications?status=' + encodeURIComponent(npinjamStatus));
    el.innerHTML =
      '<div class="filter-bar">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="tab-btn active" onclick="npinjamAdminTab=\'applications\';navTo(\'npinjam\')">Pengajuan Aktivasi</button>' +
      '<button class="tab-btn" onclick="npinjamAdminTab=\'loans\';navTo(\'npinjam\')">Pinjaman</button>' +
      '</div>' +
      '<select id="npinjam-filter-status" onchange="npinjamStatus=this.value;renderNPinjam(document.getElementById(\'page-content\'))">' +
      '<option value="pending"' + (npinjamStatus === 'pending' ? ' selected' : '') + '>Pending</option>' +
      '<option value="approved"' + (npinjamStatus === 'approved' ? ' selected' : '') + '>Approved</option>' +
      '<option value="rejected"' + (npinjamStatus === 'rejected' ? ' selected' : '') + '>Rejected</option>' +
      '<option value="all"' + (npinjamStatus === 'all' ? ' selected' : '') + '>Semua</option></select></div>' +
      '<div class="card"><table><thead><tr><th>User</th><th>NIK</th><th>Nama KTP</th><th>Skor Wajah</th><th>Liveness</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>' +
      (d.applications || []).map(function (a) {
        var st = (a.status || 'pending').toLowerCase();
        return '<tr><td>' + escapeHtml(a.user_name || '-') + '</td><td style="font-size:11px">' + escapeHtml(a.nik) + '</td><td>' + escapeHtml(a.full_name) + '</td><td>' + faceBadge(a) + '</td><td>' + livenessBadge(a) + '</td><td>' + statusBadge(st) + '</td><td style="font-size:11px">' + (a.created_at ? new Date(a.created_at).toLocaleDateString('id-ID') : '') + '</td><td style="white-space:nowrap">' +
        '<button class="btn btn-outline btn-sm" onclick="showNPinjamDetail(' + a.id + ')">Detail</button> ' +
        (st === 'pending' ? '<button class="btn btn-success btn-sm" onclick="approveNPinjam(' + a.id + ')">Approve</button> <button class="btn btn-danger btn-sm" onclick="rejectNPinjam(' + a.id + ')">Reject</button>' : '') +
        '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.applications || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada pengajuan</p>' : '') +
      '</div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

function renderDetailRow(label, value) {
  return '<tr><td style="color:#6b7280;font-weight:600;width:40%">' + escapeHtml(label) + '</td><td>' + escapeHtml(value === null || value === undefined || value === '' ? '-' : value) + '</td></tr>';
}

async function showNPinjamDetail(id) {
  npinjamDetailId = id;
  var d = await api('/api/admin/npinjam/applications/' + id);
  if (!d.success || !d.application) { alert(d.message || 'Gagal memuat detail'); return; }
  var a = d.application;
  var faceInfo = nlFaceStatus(a);
  var html =
    '<h2>Detail Pengajuan NPinjam #' + id + '</h2>' +
    '<div style="display:flex;gap:16px;margin:12px 0">' +
    '<div style="flex:1;text-align:center"><img src="/uploads/npinjam/' + encodeURIComponent(a.ktp_front_url) + '" style="width:100%;max-width:220px;border:1px solid #e5e7eb" onerror="this.src=\'https://img.icons8.com/?size=100&id=40333&format=png&color=CCCCCC\'"><p style="font-size:11px;color:#6b7280;margin-top:4px">Foto KTP Depan</p></div>' +
    '<div style="flex:1;text-align:center"><img src="/uploads/npinjam/' + encodeURIComponent(a.ktp_selfie_url) + '" style="width:100%;max-width:220px;border:1px solid #e5e7eb" onerror="this.src=\'https://img.icons8.com/?size=100&id=40333&format=png&color=CCCCCC\'"><p style="font-size:11px;color:#6b7280;margin-top:4px">Foto Selfie</p></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
    '<span class="' + faceInfo.cls + '">Wajah: ' + escapeHtml(faceInfo.text) + (a.facial_verification_status === 'unavailable' ? ' (verifikasi otomatis gagal dijalankan)' : '') + '</span>' +
    '<span class="badge badge-info">Liveness: ' + (a.liveness_passed ? 'Lulus' : 'Belum') + '</span>' +
    '<span class="badge badge-info">Status: ' + escapeHtml(a.status) + '</span>' +
    '</div>' +
    ((a.facial_verification_status === 'unavailable' || !a.facial_verification_status)
      ? '<div class="badge badge-pending" style="display:block;margin-bottom:16px">Wajah tidak dapat diverifikasi otomatis. Periksa foto KTP dan selfie secara manual sebelum menyetujui.</div>'
      : '') +
    '<table><thead><tr><th>Field</th><th>Nilai</th></tr></thead><tbody>' +
    renderDetailRow('User', a.user_name) + renderDetailRow('Email', a.user_email) + renderDetailRow('No HP', a.user_phone) +
    renderDetailRow('NIK', a.nik) + renderDetailRow('Nama Lengkap', a.full_name) + renderDetailRow('Tempat Lahir', a.birth_place) +
    renderDetailRow('Tanggal Lahir', a.birth_date) + renderDetailRow('Jenis Kelamin', a.gender) + renderDetailRow('Provinsi', a.address_province) +
    renderDetailRow('Kota', a.address_city) + renderDetailRow('Kecamatan', a.address_district) + renderDetailRow('Kelurahan', a.address_village) +
    renderDetailRow('RT/RW', a.address_rt_rw) + renderDetailRow('Kode Pos', a.address_postal_code) + renderDetailRow('Alamat', a.address_detail) +
    renderDetailRow('Pekerjaan', a.job_type) + renderDetailRow('Industri', a.job_industry) + renderDetailRow('Rentang Pendapatan', a.monthly_income_range) +
    renderDetailRow('Sumber Pendapatan', a.income_source) + renderDetailRow('Nama Ibu Kandung', a.mother_maiden_name) +
    renderDetailRow('Kontak Darurat 1', a.emergency_contact_1_name + ' (' + a.emergency_contact_1_phone + ')') +
    renderDetailRow('Kontak Darurat 2', a.emergency_contact_2_name + ' (' + a.emergency_contact_2_phone + ')') +
    renderDetailRow('Status Verifikasi Wajah', nlFaceStatusLabel(a.facial_verification_status)) +
    renderDetailRow('Skor Verifikasi (Server)', formatScore(a.face_verify_score)) +
    renderDetailRow('Pesan Verifikasi', a.face_verify_message) +
    (a.reject_reason ? renderDetailRow('Alasan Ditolak', a.reject_reason) : '') +
    '</tbody></table>' +
    '<div style="margin-top:16px;display:flex;gap:8px">' +
    (a.status === 'pending' ? '<button class="btn btn-success" onclick="approveNPinjam(' + a.id + ');closeModal();">Approve</button> <button class="btn btn-danger" onclick="rejectNPinjam(' + a.id + ');closeModal();">Reject</button>' : '') +
    '<button class="btn btn-outline" onclick="closeModal()">Tutup</button></div>';
  showModal(html);
}

async function approveNPinjam(id) {
  if (!confirm('Setujui pengajuan NPinjam ini? Profil NPinjam user akan aktif.')) return;
  var d = await api('/api/admin/npinjam/applications/' + id + '/approve', { method: 'POST', body: JSON.stringify({}) });
  if (d.success) {
    alert('Disetujui! Skor: ' + d.score + ' | Tier: ' + d.tier);
    closeModal();
    navTo('npinjam');
  } else {
    alert(d.message || 'Gagal menyetujui');
  }
}

async function rejectNPinjam(id) {
  var reason = prompt('Alasan penolakan (opsional):');
  if (reason === null) return;
  if (!confirm('Tolak pengajuan NPinjam ini?')) return;
  var d = await api('/api/admin/npinjam/applications/' + id + '/reject', { method: 'POST', body: JSON.stringify({ reason: reason || '' }) });
  if (d.success) {
    alert('Pengajuan ditolak');
    closeModal();
    navTo('npinjam');
  } else {
    alert(d.message || 'Gagal menolak');
  }
}

async function renderNPinjamLoans(el) {
  try {
    var d = await api('/api/admin/npinjam/loans?status=' + encodeURIComponent(npinjamLoanStatus));
    el.innerHTML =
      '<div class="filter-bar">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="tab-btn" onclick="npinjamAdminTab=\'applications\';navTo(\'npinjam\')">Pengajuan Aktivasi</button>' +
      '<button class="tab-btn active" onclick="npinjamAdminTab=\'loans\';navTo(\'npinjam\')">Pinjaman</button>' +
      '</div>' +
      '<select onchange="npinjamLoanStatus=this.value;renderNPinjamLoans(document.getElementById(\'page-content\'))">' +
      '<option value="pending,active"' + (npinjamLoanStatus === 'pending,active' ? ' selected' : '') + '>Menunggu &amp; Aktif</option>' +
      '<option value="pending"' + (npinjamLoanStatus === 'pending' ? ' selected' : '') + '>Pending</option>' +
      '<option value="active"' + (npinjamLoanStatus === 'active' ? ' selected' : '') + '>Active</option>' +
      '<option value="paid"' + (npinjamLoanStatus === 'paid' ? ' selected' : '') + '>Lunas</option>' +
      '<option value="rejected"' + (npinjamLoanStatus === 'rejected' ? ' selected' : '') + '>Ditolak</option>' +
      '<option value="all"' + (npinjamLoanStatus === 'all' ? ' selected' : '') + '>Semua</option></select></div>' +
      '<div class="card"><table><thead><tr><th>User</th><th>No. Pinjaman</th><th>Nominal</th><th>Tenor</th><th>Bank</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>' +
      (d.loans || []).map(function (l) {
        var st = (l.status || 'pending').toLowerCase();
        return '<tr><td>' + escapeHtml(l.user_name || '-') + '</td><td style="font-size:11px">' + escapeHtml(l.loan_number) + '</td><td>Rp ' + Math.round(l.principal).toLocaleString('id-ID') + '</td><td>' + l.tenor_months + ' mg</td><td style="font-size:11px">' + escapeHtml(l.bank_name || '-') + '</td><td>' + statusBadge(st) + '</td><td style="font-size:11px">' + (l.created_at ? new Date(l.created_at).toLocaleDateString('id-ID') : '') + '</td><td style="white-space:nowrap">' +
        '<button class="btn btn-outline btn-sm" onclick="showNPinjamLoanDetail(' + l.id + ')">Detail</button> ' +
        (st === 'pending' ? '<button class="btn btn-success btn-sm" onclick="approveNPinjamLoan(' + l.id + ')">Approve</button> <button class="btn btn-danger btn-sm" onclick="rejectNPinjamLoan(' + l.id + ')">Reject</button>' : '') +
        '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.loans || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Tidak ada pinjaman</p>' : '') +
      '</div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

async function showNPinjamLoanDetail(id) {
  var d = await api('/api/admin/npinjam/loans/' + id);
  if (!d.success || !d.loan) { alert(d.message || 'Gagal memuat detail'); return; }
  var l = d.loan;
  var rows =
    renderDetailRow('User', l.user_name) + renderDetailRow('Email', l.user_email) + renderDetailRow('No HP', l.user_phone) +
    renderDetailRow('No. Pinjaman', l.loan_number) + renderDetailRow('Nominal', 'Rp ' + Math.round(l.principal).toLocaleString('id-ID')) +
    renderDetailRow('Tenor', l.tenor_months + ' minggu') + renderDetailRow('Cicilan/minggu', 'Rp ' + Math.round(l.monthly_installment).toLocaleString('id-ID')) +
    renderDetailRow('Total Bayar', 'Rp ' + Math.round(l.total_payable).toLocaleString('id-ID')) +
    renderDetailRow('Tujuan', l.purpose) + renderDetailRow('Bank Tujuan', l.bank_name) +
    renderDetailRow('No. Rekening', l.bank_account_number) + renderDetailRow('Nama Pemilik Rekening', l.bank_account_name) +
    renderDetailRow('Status Verifikasi Wajah', nlFaceStatusLabel(l.facial_verification_status)) +
    renderDetailRow('Skor Verifikasi Wajah (Server)', formatScore(l.face_verify_score)) +
    renderDetailRow('Status', l.status) +
    (l.reject_reason ? renderDetailRow('Alasan Ditolak', l.reject_reason) : '');
  var needsManualFaceCheck = l.facial_verification_status === 'unavailable' || !l.facial_verification_status;
  var instRows = (d.installments || []).map(function (i) {
    return '<tr><td>' + i.installment_no + '</td><td>' + i.due_date + '</td><td>Rp ' + Math.round(i.total_amount).toLocaleString('id-ID') + '</td><td>' + statusBadge(i.status) + '</td></tr>';
  }).join('');
  var html =
    '<h2>Detail Pinjaman #' + id + '</h2>' +
    (needsManualFaceCheck
      ? '<div class="badge badge-pending" style="display:block;margin-bottom:12px">Wajah pemohon tidak dapat diverifikasi otomatis saat pengajuan. Cocokkan foto KTP saat pendaftaran dengan identitas pemohon sebelum mencairkan.</div>'
      : '') +
    '<table><thead><tr><th>Field</th><th>Nilai</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h3 style="margin-top:16px">Jadwal Cicilan</h3>' +
    '<table><thead><tr><th>Ke</th><th>Jatuh Tempo</th><th>Nominal</th><th>Status</th></tr></thead><tbody>' + (instRows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af">Belum ada cicilan</td></tr>') + '</tbody></table>' +
    '<div style="margin-top:16px;display:flex;gap:8px">' +
    (l.status === 'pending' ? '<button class="btn btn-success" onclick="approveNPinjamLoan(' + l.id + ');closeModal();">Approve &amp; Cairkan</button> <button class="btn btn-danger" onclick="rejectNPinjamLoan(' + l.id + ');closeModal();">Reject</button>' : '') +
    '<button class="btn btn-outline" onclick="closeModal()">Tutup</button></div>';
  showModal(html);
}

async function approveNPinjamLoan(id) {
  if (!confirm('Setujui dan cairkan pinjaman ini? Dana akan disalurkan ke rekening user.')) return;
  var d = await api('/api/admin/npinjam/loans/' + id + '/approve', { method: 'POST', body: JSON.stringify({}) });
  if (d.success) {
    alert('Pinjaman disetujui dan dicairkan!');
    closeModal();
    navTo('npinjam');
  } else {
    alert(d.message || 'Gagal menyetujui pinjaman');
  }
}

async function rejectNPinjamLoan(id) {
  var reason = prompt('Alasan penolakan (opsional):');
  if (reason === null) return;
  if (!confirm('Tolak pengajuan pinjaman ini?')) return;
  var d = await api('/api/admin/npinjam/loans/' + id + '/reject', { method: 'POST', body: JSON.stringify({ reason: reason || '' }) });
  if (d.success) {
    alert('Pinjaman ditolak');
    closeModal();
    navTo('npinjam');
  } else {
    alert(d.message || 'Gagal menolak pinjaman');
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/AppNorthAuthAdmin';
}

let affiliateFilterStatus = '', affiliateSearch = '';

// ===========================================================================
// NPinjam Scanner
// ===========================================================================

// Field alamat yang dibaca dari KTP/KK, sesuai urutan isian di formulir.
const NPS_FIELDS = [
  { key: 'alamat', label: 'Alamat Jalan', multiline: true },
  { key: 'rt_rw', label: 'RT / RW' },
  { key: 'kelurahan_desa', label: 'Kelurahan / Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten_kota', label: 'Kabupaten / Kota' },
  { key: 'provinsi', label: 'Provinsi' }
];

// Status hasil baca dokumen. Kelas memakai nps-* (merah/putih) bukan
// badge-success/pending/info milik panel admin, karena kelas shared itu
// hijau/kuning/biru dan tidak sesuai aturan warna halaman ini.
// solids = merah solid, tint = merah muda, line = garis putus.
const NPS_STATUS_BADGE = {
  AUTO_PASS: ['nps-flag-line', 'Keyakinan Tinggi'],
  REVIEW_REQUIRED: ['nps-flag-tint', 'Perlu Dicek'],
  MANUAL_REVIEW: ['nps-flag-tint', 'Koreksi Manual'],
  RESCAN_REQUIRED: ['nps-flag-solid', 'Upload Ulang']
};

const NPS_GEO_BADGE = {
  LOCATION_CONFIRMED: ['nps-flag-line', 'Lokasi Ditemukan'],
  LOCATION_REVIEW_REQUIRED: ['nps-flag-tint', 'Perlu Verifikasi'],
  LOCATION_NOT_FOUND: ['nps-flag-solid', 'Lokasi Tidak Ditemukan']
};

const NPS_PRECISION_LABEL = {
  street: 'titik jalan',
  village: 'pusat desa/kelurahan',
  district: 'pusat kecamatan',
  city: 'pusat kota/kabupaten'
};

let npsState = { file: null, preview: '', scan: null, address: null, location: null, confirmed: false, scanId: null };
let npsConfig = null;
// Rekam pindaian tersimpan + state panel kirim WhatsApp.
let npsSaved = { rows: [], search: '', loading: false, busy: false, pending: false, phone: '', result: null, error: null };
let npsSavedTimer = null;

function npsConfBadge(value) {
  var v = typeof value === 'number' ? value : 0;
  var pct = Math.round(v * 100);
  var cls = v >= 0.95 ? 'nps-conf-high' : (v >= 0.85 ? 'nps-conf-medium' : 'nps-conf-low');
  return '<span class="nps-conf ' + cls + '">' + pct + '%</span>';
}

function npsConfBar(value) {
  var v = typeof value === 'number' ? value : 0;
  var cls = v >= 0.95 ? '' : (v >= 0.85 ? 'medium' : 'low');
  return '<div class="nps-bar ' + cls + '"><span style="width:' + Math.max(2, Math.round(v * 100)) + '%"></span></div>';
}

async function renderNPinjamScanner(el) {
  destroyAdminMaps();
  npsState = { file: null, preview: '', scan: null, address: null, location: null, confirmed: false, scanId: null };
  npsSaved = { rows: [], search: '', loading: false, phone: '', result: null, error: null };

  el.innerHTML =
    '<div class="nps-page">' +
    '<div class="nps-head">' +
    '<h1>NPinjam Scanner</h1>' +
    '<p>Baca foto KTP, periksa alamat, lalu kirim hasilnya ke WhatsApp pemohon.</p>' +
    '</div>' +
    '<div id="nps-root"></div>' +
    '</div>';

  npsRenderShell();
  try {
    npsConfig = await api('/api/admin/npinjam/scanner/config');
  } catch (e) { npsConfig = null; }
  npsRenderShell();
  npsLoadSaved();
}

function npsRenderShell() {
  var root = document.getElementById('nps-root');
  if (!root) return;
  var cfg = npsConfig || {};
  var maxMb = cfg.max_upload_size ? Math.round(cfg.max_upload_size / 1048576) : 10;

  root.innerHTML =
    '<div class="nps-grid">' +
    // ---- Kolom kiri: upload + tahapan + rekaman tersimpan ----
    '<div>' +
    '<div class="nps-panel">' +
    '<div class="nps-h">1. Foto KTP / KK</div>' +
    '<div class="nps-drop" id="nps-drop" onclick="document.getElementById(\'nps-file\').click()">' +
    '<div class="nps-drop-title">Pilih atau seret foto ke sini</div>' +
    '<div class="nps-drop-hint">JPG, JPEG, PNG, WEBP &middot; maksimal ' + maxMb + ' MB</div>' +
    '</div>' +
    '<input type="file" id="nps-file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="npsPickFile(this.files[0])">' +
    '<div id="nps-preview" style="margin-top:12px"></div>' +
    '<div class="nps-row" style="margin-top:12px">' +
    '<button class="nps-btn" id="nps-scan-btn" onclick="npsRunScan()" disabled>Baca Dokumen</button>' +
    '<button class="nps-btn nps-btn-alt" onclick="npsReset()">Reset</button>' +
    '</div>' +
    '</div>' +
    '<div class="nps-panel">' +
    '<div class="nps-h">Tahapan</div>' +
    '<ul class="nps-steps" id="nps-steps">' +
    ((cfg.steps || ['Foto diterima', 'Menganalisis dokumen', 'Mendeteksi jenis dokumen', 'Membaca teks', 'Mengekstrak alamat', 'Menormalisasi alamat'])
      .map(function (s, i) {
        return '<li id="nps-step-' + i + '"><span class="nps-dot">' + (i + 1) + '</span><span>' + escapeHtml(s) + '</span></li>';
      }).join('')) +
    '</ul>' +
    '<div class="nps-privacy" style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:12px">' +
    '<strong>Privasi.</strong> Foto diproses di memori server dan tidak disimpan ke disk. ' +
    'NIK dan nomor KK tidak pernah dikembalikan ke halaman ini maupun ditulis ke log. ' +
    'Yang tersimpan hanya nama dan alamat. ' +
    '</div>' +
    '</div>' +
    '<div class="nps-panel">' +
    '<div class="nps-h">2. Pindaian Tersimpan</div>' +
    '<input class="nps-input" type="text" placeholder="Cari nama atau alamat..." value="' + escapeHtml(npsSaved.search) + '" oninput="npsSearchSaved(this.value)">' +
    '<div id="nps-saved" style="margin-top:12px">' + npsSavedHtml() + '</div>' +
    '</div>' +
    '</div>' +
    // ---- Kolom kanan: hasil + peta + kirim WhatsApp ----
    // Kotak hasil dikosongkan dulu, lalu diisi SETELAH innerHTML diAssign.
    // Kalau npsRenderResult() dipanggil di dalam rangkaian string di atas,
    // ia akan mencari #nps-result di DOM yang belum ada, mengembalikan
    // undefined, dan teks literal "undefined" ikut ter-render.
    '<div id="nps-result"></div>' +
    '</div>';

  npsBindDrop();
  npsRenderPreview();
  npsRenderResult();
}

function npsBindDrop() {
  var drop = document.getElementById('nps-drop');
  if (!drop) return;
  ['dragenter', 'dragover'].forEach(function (evt) {
    drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.add('nps-drag'); });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.remove('nps-drag'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) npsPickFile(e.dataTransfer.files[0]);
  });
}

function npsPickFile(file) {
  if (!file) return;
  var allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.indexOf(String(file.type).toLowerCase()) === -1) {
    alert('Format file tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.');
    return;
  }
  var max = npsConfig && npsConfig.max_upload_size ? npsConfig.max_upload_size : 10485760;
  if (file.size > max) {
    alert('Ukuran file terlalu besar. Maksimal ' + Math.round(max / 1048576) + ' MB.');
    return;
  }
  npsState.file = file;
  npsState.preview = URL.createObjectURL(file);
  // Ganti dokumen berarti hasil lama tidak lagi relevan.
  npsState.scan = null;
  npsState.address = null;
  npsState.location = null;
  npsState.confirmed = false;
  npsRenderShell();
}

function npsReset() {
  if (npsState.preview) { try { URL.revokeObjectURL(npsState.preview); } catch (e) {} }
  npsState = { file: null, preview: '', scan: null, address: null, location: null, confirmed: false, scanId: null };
  destroyAdminMaps();
  npsRenderShell();
}

function npsRenderPreview() {
  var box = document.getElementById('nps-preview');
  var btn = document.getElementById('nps-scan-btn');
  if (btn) btn.disabled = !npsState.file;
  if (!box) return;
  box.innerHTML = npsState.file
    ? '<div class="nps-preview"><img src="' + npsState.preview + '" alt="Pratinjau dokumen"><div style="font-size:11px;color:#6b7280;margin-top:6px">' +
      escapeHtml(npsState.file.name) + ' &middot; ' + Math.round(npsState.file.size / 1024) + ' KB</div></div>'
    : '';
}

function npsSetStep(active) {
  var steps = npsConfig && npsConfig.steps ? npsConfig.steps.length : 6;
  for (var i = 0; i < steps; i++) {
    var li = document.getElementById('nps-step-' + i);
    if (!li) continue;
    li.className = '';
    if (i < active) li.className = 'done';
    else if (i === active) li.className = 'active';
  }
}

async function npsRunScan() {
  if (!npsState.file) return;
  var btn = document.getElementById('nps-scan-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Membaca...'; }

  // Tahapan dijalankan dengan jeda supaya terlihat oleh admin, bukan spinner buta.
  var steps = npsConfig && npsConfig.steps ? npsConfig.steps.length : 6;
  var timer = setInterval(function () {
    var done = document.querySelectorAll('#nps-steps li.done, #nps-steps li.active').length;
    if (done < steps) npsSetStep(done);
  }, 450);

  try {
    var fd = new FormData();
    fd.append('image', npsState.file);
    // Content-Type SENGAJA tidak di-set: browser yang akan pasang boundary multipart.
    var res = await fetch('/api/admin/npinjam/scanner', { method: 'POST', body: fd, credentials: 'same-origin' });

    // Response bisa HTML, bukan JSON - misalnya saat CORS atau middleware
    // menolak request. json() lalu melempar SyntaxError dan catch lama menampilkannya
    // sebagai "tidak dapat menghubungi server", menutupi penyebab sebenarnya.
    // Baca teks dulu supaya pesan error bisa menyebut status sebenarnya.
    var raw = await res.text();
    var json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = null; }

    clearInterval(timer);
    if (!res.ok || !json || !json.success) {
      npsSetStep(0);
      npsState.scan = null;
      var msg = json && json.message
        ? json.message
        : 'Server menjawab ' + res.status + ' ' + (res.statusText || '') +
          '. Bila ini terjadi terus-menerus, muat ulang halaman admin.';
      npsRenderResult(msg, true);
      if (btn) { btn.disabled = false; btn.textContent = 'Baca Dokumen'; }
      return;
    }

    npsSetStep(steps);
    npsState.scan = json.data;
    npsState.scanId = json.data.scan_id || null;
    npsState.address = Object.assign({}, json.data.address);
    npsState.location = null;
    npsState.confirmed = false;
    npsRenderResult();
    // Rekaman baru langsung muncul di daftar pindaian tersimpan.
    npsLoadSaved();
  } catch (err) {
    clearInterval(timer);
    npsSetStep(0);
    // Sebut errornya supaya masalah jaringan vs. server bisa dibedakan.
    npsRenderResult(
      'Tidak dapat menghubungi server: ' + (err && err.message ? err.message : 'kesalahan tidak diketahui') +
      '. Silakan coba lagi.', true
    );
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Baca Dokumen'; }
}

function npsRenderResult(errorMessage) {
  var box = document.getElementById('nps-result');
  if (!box) return;
  destroyAdminMaps();

  if (errorMessage) {
    box.innerHTML = '<div class="nps-panel"><div class="nps-note nps-note-solid" style="margin:0">' + escapeHtml(errorMessage) + '</div></div>';
    return;
  }

  var scan = npsState.scan;
  if (!scan) {
    box.innerHTML = '<div class="nps-panel"><div class="loading-state">' +
      '<p>Belum ada dokumen diproses.</p>' +
      '<p style="font-size:12px;margin-top:6px">Upload foto KTP atau Kartu Keluarga untuk memulai.</p>' +
      '</div></div>';
    return;
  }

  var badge = NPS_STATUS_BADGE[scan.review_status] || ['nps-flag-line', scan.review_status || '-'];
  var addr = npsState.address || {};
  var lowFields = scan.low_confidence_fields || [];

  // Field yang perlu dicorot supaya mata admin langsung ke sana.
  var fieldHtml = NPS_FIELDS.map(function (f) {
    var conf = (scan.confidence && scan.confidence.per_field && scan.confidence.per_field[f.key]) || 0;
    var low = lowFields.indexOf(f.key) !== -1;
    var input = f.multiline
      ? '<textarea id="nps-f-' + f.key + '" oninput="npsEditAddress(\'' + f.key + '\', this.value)">' + escapeHtml(addr[f.key] || '') + '</textarea>'
      : '<input type="text" id="nps-f-' + f.key + '" value="' + escapeHtml(addr[f.key] || '') + '" oninput="npsEditAddress(\'' + f.key + '\', this.value)">';
    return '<div class="nps-field' + (low ? ' low' : '') + '">' +
      '<label><span>' + escapeHtml(f.label) + '</span>' + npsConfBadge(conf) + '</label>' +
      input + '</div>';
  }).join('');

  // Peringatan konsistensi wilayah: AI boleh salah baca kabupaten/kota.
  var regionWarn = '';
  var rc = scan.region_check || {};
  if (rc.provinsi === false || rc.kabupaten_kota === false) {
    var bad = [];
    if (rc.provinsi === false) bad.push('provinsi');
    if (rc.kabupaten_kota === false) bad.push('kabupaten/kota');
    regionWarn = '<div class="nps-note nps-note-soft"><strong>Wilayah perlu diperiksa.</strong> ' +
      'Nama ' + escapeHtml(bad.join(' dan ')) + ' tidak cocok dengan daftar wilayah. ' +
      'Nilai hasil baca tidak diubah otomatis - mohon dicek dan dikoreksi bila perlu.</div>';
  }

  var statusAlert = '';
  if (scan.review_status === 'RESCAN_REQUIRED') {
    statusAlert = '<div class="nps-note nps-note-solid"><strong>Perlu upload ulang.</strong> ' + escapeHtml(scan.review_message || '') + '</div>';
  } else if (scan.review_status === 'MANUAL_REVIEW') {
    statusAlert = '<div class="nps-note nps-note-soft"><strong>Perlu koreksi manual.</strong> ' + escapeHtml(scan.review_message || '') + '</div>';
  } else if (scan.review_status === 'REVIEW_REQUIRED') {
    statusAlert = '<div class="nps-note nps-note-quiet"><strong>Periksa dulu.</strong> ' + escapeHtml(scan.review_message || '') + '</div>';
  }

  var addrConf = (scan.confidence && scan.confidence.address) || 0;

  box.innerHTML =
    // ---- Ringkasan hasil baca ----
    '<div class="nps-panel" style="margin-bottom:16px">' +
    '<div class="nps-h">2. Hasil Pembacaan</div>' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span class="nps-flag ' + badge[0] + '">' + escapeHtml(badge[1]) + '</span>' +
    '<span style="font-size:13px;font-weight:600;color:#111">' + escapeHtml(scan.document_label || '-') + '</span>' +
    (scan.nama ? '<span style="font-size:12px;color:#6b7280">&middot; ' + escapeHtml(scan.nama) + '</span>' : '') +
    '</div>' +
    statusAlert +
    regionWarn +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:4px">Keyakinan alamat: ' + npsConfBadge(addrConf) + '</div>' +
    npsConfBar(addrConf) +
    '<div style="font-size:11px;color:#9ca3af;margin-top:6px">Waktu proses ' + (scan.processing_time_ms || 0) + ' ms' +
    (scan.ai_provider ? ' &middot; provider ' + escapeHtml(scan.ai_provider) : '') + '</div>' +
    '</div>' +
    // ---- Form koreksi + tombol cari lokasi ----
    '<div class="nps-panel" style="margin-bottom:16px">' +
    '<div class="nps-h">3. Konfirmasi Alamat</div>' +
    (scan.review_status === 'RESCAN_REQUIRED'
      ? '<div style="font-size:12px;color:#9ca3af">Alamat tidak dapat diverifikasi. Silakan upload ulang dokumen yang lebih jelas.</div>'
      : fieldHtml +
        (scan.requires_confirmation
          ? '<label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;margin:14px 0;cursor:pointer">' +
            '<input type="checkbox" id="nps-confirm"' + (npsState.confirmed ? ' checked' : '') + ' onchange="npsState.confirmed=this.checked">' +
            '<span>Saya sudah memeriksa dan mengoreksi field di atas. Lanjutkan mencari lokasi.</span></label>'
          : '') +
        '<button class="nps-btn" id="nps-geo-btn" onclick="npsGeocode()"' +
        ((scan.requires_confirmation && !npsState.confirmed) ? ' disabled' : '') + '>Cari Lokasi</button>') +
    '</div>' +
    // ---- Peta + kandidat ----
    '<div id="nps-location"></div>' +
    '<div id="nps-share-host"></div>';

  // Isi setelah elemennya ada di DOM.
  npsRenderLocation();
  npsRenderSharePanel();
}

function npsEditAddress(key, value) {
  if (!npsState.address) npsState.address = {};
  npsState.address[key] = value;
  // Perubahan alamat membatalkan hasil geocoding lama.
  if (npsState.location) {
    npsState.location = null;
    npsState.confirmed = false;
    destroyAdminMaps();
    var box = document.getElementById('nps-location');
    if (box) box.innerHTML = '';
  }
}

async function npsGeocode() {
  var btn = document.getElementById('nps-geo-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Mencari...'; }

  var box = document.getElementById('nps-location');
  if (box) box.innerHTML = '<div class="nps-panel"><div class="loading-state">Mencari koordinat...</div></div>';

  try {
    // scan_id ikut dikirim supaya server bisa memakai alamat yang tersimpan
    // dan menempelkan koordinat balik ke rekaman yang sama.
    var payload = Object.assign({}, npsState.address || {});
    if (npsState.scanId) payload.scan_id = npsState.scanId;
    var res = await api('/api/admin/npinjam/geocode', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (btn) { btn.textContent = 'Cari Lokasi'; }

    if (!res.success) {
      npsState.location = null;
      npsRenderLocationInto(box, '<div class="nps-note nps-note-solid" style="margin:0">' + escapeHtml(res.message || 'Pencarian lokasi gagal.') + '</div>');
      return;
    }
    npsState.location = res.data;
    npsRenderLocation();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Cari Lokasi'; }
    npsRenderLocationInto(box, '<div class="nps-note nps-note-solid" style="margin:0">Tidak dapat menghubungi server saat mencari lokasi.</div>');
  }
}

function npsRenderLocationInto(box, html) {
  if (!box) return;
  box.innerHTML = '<div class="nps-panel">' + html + '</div>';
}

function npsRenderLocation() {
  var box = document.getElementById('nps-location');
  if (box) box.innerHTML = npsRenderLocationHtml();
  if (npsState.location && npsState.location.geocoding_status !== 'LOCATION_NOT_FOUND') npsRenderMap();
  // Panel kirim ikut diperbarui karena koordinat baru ikut masuk ke pesan.
  npsRenderSharePanel();
}

function npsRenderLocationHtml() {
  var loc = npsState.location;
  if (!loc) return '';

  var badge = NPS_GEO_BADGE[loc.geocoding_status] || ['nps-flag-line', loc.geocoding_status || '-'];

  if (loc.geocoding_status === 'LOCATION_NOT_FOUND') {
    return '<div class="nps-panel"><div class="nps-h">4. Lokasi</div>' +
      '<div style="margin-bottom:12px"><span class="nps-flag ' + badge[0] + '">' + escapeHtml(badge[1]) + '</span></div>' +
      '<div class="nps-note nps-note-solid" style="margin:0">' + escapeHtml(loc.message || 'Lokasi tidak ditemukan.') + '</div>' +
      '</div>';
  }

  var warn = loc.precision_warning
    ? '<div class="nps-note nps-note-soft" style="margin-bottom:12px">' + escapeHtml(loc.precision_warning) + '</div>'
    : '';

  var cands = (loc.candidates || []).map(function (c, i) {
    var active = loc.primary && c.place_id === loc.primary.place_id;
    var prec = NPS_PRECISION_LABEL[c.match_precision] || 'area';
    var meta = ['presisi ' + escapeHtml(prec)];
    if (c.region_match === true) meta.push('wilayah cocok');
    if (c.region_match === false) meta.push('wilayah berbeda');
    return '<button class="nps-cand' + (active ? ' active' : '') + '" onclick="npsPickCandidate(' + i + ')">' +
      '<div class="nps-cand-addr">' + escapeHtml(c.formatted_address || '-') + '</div>' +
      '<div class="nps-cand-meta">' + meta.join(' &middot; ') + '</div></button>';
  }).join('');

  return '<div class="nps-panel"><div class="nps-h">4. Lokasi</div>' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span class="nps-flag ' + badge[0] + '">' + escapeHtml(badge[1]) + '</span>' +
    '<span style="font-size:11px;color:#9ca3af">presisi: ' + escapeHtml(NPS_PRECISION_LABEL[loc.match_precision] || '-') + '</span>' +
    '<span style="font-size:11px;color:#9ca3af">provider: ' + escapeHtml(loc.provider || '-') + '</span>' +
    '</div>' +
    warn +
    '<div class="nps-map" id="nps-map"></div>' +
    '<input type="hidden" id="nps-lat"><input type="hidden" id="nps-lng">' +
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
    '<button class="nps-btn" onclick="npsOpenMaps()">Buka Google Maps</button>' +
    '<button class="nps-btn nps-btn-alt" onclick="npsGeocode()">Cari Ulang</button>' +
    '<button class="nps-btn nps-btn-alt" onclick="npsCopyCoords()">Salin Koordinat</button>' +
    '</div>' +
    (cands ? '<div class="nps-h" style="margin-top:20px">Kandidat Lokasi</div>' + cands : '') +
    '</div>';
}

function npsRenderMap() {
  var loc = npsState.location;
  if (!loc || !loc.primary) return;
  // Ditunda satu tick supaya Leaflet mengukur elemen yang sudah selesai di-layout.
  setTimeout(function () {
    initAdminMapPicker('nps-map', 'nps-lat', 'nps-lng', loc.primary.latitude, loc.primary.longitude);
  }, 0);
}

function npsPickCandidate(index) {
  var loc = npsState.location;
  if (!loc || !loc.candidates || !loc.candidates[index]) return;
  var c = loc.candidates[index];
  // Kandidat yang wilayahnya jelas berbeda tidak boleh dipilih diam-diam.
  if (c.region_match === false) {
    alert('Kandidat ini berada di wilayah yang berbeda dari alamat yang diminta. Periksa kembali kabupaten/kota pada alamat.');
  }
  loc.primary = { latitude: c.latitude, longitude: c.longitude, place_id: c.place_id, formatted_address: c.formatted_address };
  loc.match_precision = c.match_precision;
  npsRenderLocation();
  npsRenderMap();
}

function npsCurrentCoords() {
  var latEl = document.getElementById('nps-lat');
  var lngEl = document.getElementById('nps-lng');
  if (latEl && lngEl && latEl.value && lngEl.value) {
    return { lat: parseFloat(latEl.value), lng: parseFloat(lngEl.value) };
  }
  if (npsState.location && npsState.location.primary) {
    return { lat: npsState.location.primary.latitude, lng: npsState.location.primary.longitude };
  }
  return null;
}

function npsOpenMaps() {
  var c = npsCurrentCoords();
  if (!c || isNaN(c.lat) || isNaN(c.lng)) { alert('Koordinat belum tersedia.'); return; }
  window.open('https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng, '_blank');
}

function npsCopyCoords() {
  var c = npsCurrentCoords();
  if (!c || isNaN(c.lat) || isNaN(c.lng)) { alert('Koordinat belum tersedia.'); return; }
  var text = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { alert('Koordinat disalin: ' + text); }, function () { alert(text); });
  } else {
    alert(text);
  }
}

// ===========================================================================
// Pindaian tersimpan + kirim WhatsApp
// ===========================================================================

function npsSearchSaved(value) {
  npsSaved.search = value;
  clearTimeout(npsSavedTimer);
  // 600ms, bukan 300ms. Pada 300ms jeda antar ketikan sudah selesai
  // sebelum debounce habis, jadi mengetik satu nama = satu request per
  // huruf. Karena semua request scanner berbagi satu bucket, itu langsung
  // menghabiskan kuota sampai "Cari Lokasi" kena 429.
  npsSavedTimer = setTimeout(npsLoadSaved, 600);
}

async function npsLoadSaved() {
  // Kalau request sebelumnya masih jalan, tunggu. Tanpa ini, debounce yang
  // menumpuk tetap bisa mengirim beberapa request beruntun.
  if (npsSaved.busy) { npsSaved.pending = true; return; }
  npsSaved.busy = true;
  npsSaved.loading = true;
  npsRenderSavedBox();
  try {
    var qs = '/api/admin/npinjam/scans?limit=25';
    if (npsSaved.search && npsSaved.search.trim()) qs += '&search=' + encodeURIComponent(npsSaved.search.trim());
    var res = await api(qs);
    npsSaved.rows = (res && res.data && res.data.scans) || [];
    npsSaved.error = null;
  } catch (e) {
    npsSaved.rows = [];
    npsSaved.error = 'Gagal memuat daftar pindaian.';
  }
  npsSaved.loading = false;
  npsSaved.busy = false;
  npsRenderSavedBox();
  if (npsSaved.pending) { npsSaved.pending = false; npsLoadSaved(); }
}

function npsRenderSavedBox() {
  var box = document.getElementById('nps-saved');
  if (box) box.innerHTML = npsSavedHtml();
}

function npsSavedHtml() {
  if (npsSaved.loading) return '<div class="nps-empty">Memuat...</div>';
  if (npsSaved.error) return '<div class="nps-note nps-note-solid">' + escapeHtml(npsSaved.error) + '</div>';
  if (!npsSaved.rows.length) {
    return '<div class="nps-empty">' +
      (npsSaved.search ? 'Tidak ada pindaian yang cocok dengan pencarian.' : 'Belum ada pindaian tersimpan.') +
      '</div>';
  }

  return npsSaved.rows.map(function (r) {
    var addr = (r.address && r.address.formatted_address) || r.kabupaten_kota || '-';
    var when = r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : '-';
    var shared = r.shared_phone
      ? '<div class="nps-list-sub">Dikirim ke ' + escapeHtml(r.shared_phone) + '</div>'
      : '';
    return '<div class="nps-list-item">' +
      '<div class="nps-list-main">' +
      '<div class="nps-list-name">' + escapeHtml(r.nama || 'Tanpa nama') + '</div>' +
      '<div class="nps-list-sub">' + escapeHtml(addr) + '</div>' +
      '<div class="nps-list-sub">' + escapeHtml(when) + '</div>' +
      shared +
      '</div>' +
      '<div class="nps-list-actions">' +
      '<button class="nps-btn nps-btn-alt nps-btn-sm" onclick="npsOpenSaved(' + r.id + ')">Buka</button>' +
      '<button class="nps-btn nps-btn-alt nps-btn-sm" onclick="npsAskDelete(' + r.id + ')">Hapus</button>' +
      '</div>' +
      '</div>';
  }).join('');
}

// Buka pindaian tersimpan ke panel utama supaya bisa dikoreksi, dicari
// lokasinya, lalu dikirim ulang tanpa upload ulang foto.
async function npsOpenSaved(id) {
  try {
    var res = await api('/api/admin/npinjam/scans/' + id);
    if (!res.success || !res.data) { alert(res.message || 'Pindaian tidak ditemukan.'); return; }
    var r = res.data;

    npsState.file = null;
    npsState.preview = '';
    npsState.scanId = r.id;
    npsState.address = Object.assign({}, r.address || {});
    npsState.location = null;
    npsState.confirmed = true;
    npsSaved.phone = '';
    npsSaved.result = null;
    npsSaved.error = null;

    // Bentuk objek scan disamakan dengan hasil /scanner supaya
    // npsRenderResult() tidak perlu cabang terpisah.
    npsState.scan = {
      scan_id: r.id,
      document_type: r.document_type,
      document_label: r.document_type === 'KTP' ? 'Kartu Tanda Penduduk (KTP)'
        : r.document_type === 'KK' ? 'Kartu Keluarga (KK)' : 'Dokumen',
      nama: r.nama,
      address: r.address,
      confidence: r.confidence || { overall: 0, address: 0, per_field: {} },
      fields: r.fields || {},
      region_check: r.region_check || {},
      review_status: r.review_status || 'REVIEW_REQUIRED',
      review_message: r.review_message || 'Pindaian tersimpan.',
      low_confidence_fields: r.low_confidence_fields || [],
      requires_confirmation: false,
      readability: r.readability,
      ai_provider: r.ai_provider,
      processing_time_ms: r.processing_time_ms,
    };

    if (r.location) {
      npsState.location = {
        geocoding_status: r.geocoding_status,
        provider: r.geocoder_provider,
        match_precision: r.match_precision,
        primary: r.location,
        candidates: r.location ? [Object.assign({}, r.location, {
          match_precision: r.match_precision,
          region_match: true
        })] : [],
        precision_warning: null,
      };
    }

    npsRenderShell();
  } catch (e) {
    alert('Tidak dapat menghubungi server.');
  }
}

async function npsAskDelete(id) {
  if (!confirm('Hapus pindaian #' + id + '? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    var res = await api('/api/admin/npinjam/scans/' + id, { method: 'DELETE' });
    if (!res.success) { alert(res.message || 'Gagal menghapus.'); return; }
    if (npsState.scanId === id) npsReset();
    npsLoadSaved();
  } catch (e) {
    alert('Tidak dapat menghubungi server.');
  }
}

function npsSharePanelHtml() {
  if (!npsState.scan || !npsState.address) return '';
  var addr = npsState.address;
  var ready = !!(addr.formatted_address || addr.kabupaten_kota || addr.provinsi);
  var scanId = npsState.scanId || (npsState.scan && npsState.scan.scan_id) || '';

  var out = '';
  if (npsSaved.error) out += '<div class="nps-note nps-note-solid" style="margin-top:10px">' + escapeHtml(npsSaved.error) + '</div>';
  if (npsSaved.result) {
    var d = npsSaved.result;
    if (d.delivered) {
      out += '<div class="nps-note nps-note-soft" style="margin-top:10px">Terkirim ke ' + escapeHtml(d.phone) + ' lewat WhatsApp.</div>';
    } else {
      out += '<div class="nps-note nps-note-soft" style="margin-top:10px">' +
        'Sesi WhatsApp server tidak aktif, jadi pesan belum terkirim sendiri. Buka tautan di bawah lalu kirim dari WhatsApp Anda.' +
        '<div class="nps-share-out"><a href="' + escapeHtml(d.wa_url) + '" target="_blank" rel="noopener" style="color:#374151;font-weight:600">Buka WhatsApp</a></div>' +
        '</div>';
    }
  }

  return '<div class="nps-panel">' +
    '<div class="nps-h">5. Kirim ke WhatsApp</div>' +
    '<div style="font-size:12px;color:#374151;margin-bottom:10px">Alamat pemohon</div>' +
    '<div class="nps-note nps-note-quiet" style="margin-bottom:12px">' + escapeHtml(addr.formatted_address || '-') + '</div>' +
    '<label class="nps-field" style="display:block">' +
    '<span style="font-size:11px;font-weight:600;color:#374151">Nomor WhatsApp pemohon</span>' +
    '<input class="nps-input" type="tel" inputmode="tel" placeholder="0812xxxxxxx" value="' + escapeHtml(npsSaved.phone) + '" oninput="npsSaved.phone=this.value">' +
    '</label>' +
    '<div class="nps-row">' +
    '<button class="nps-btn" onclick="npsShare()"' + (ready ? '' : ' disabled') + '>Kirim Alamat</button>' +
    '<button class="nps-btn nps-btn-alt" onclick="npsPreviewMessage()">Lihat Pesan</button>' +
    '</div>' +
    (ready ? '' : '<div class="nps-meta" style="margin-top:8px">Lengkapi alamat dan cari lokasi dulu sebelum mengirim.</div>') +
    out +
    '</div>';
}

function npsRenderSharePanel() {
  var host = document.getElementById('nps-share-host');
  if (host) host.innerHTML = npsSharePanelHtml();
}

async function npsShare() {
  npsSaved.error = null;
  npsSaved.result = null;
  var scanId = npsState.scanId || (npsState.scan && npsState.scan.scan_id) || '';
  if (!scanId) { npsSaved.error = 'Pindaian ini belum tersimpan, jadi tidak bisa dikirim. Jalankan ulang pembacaan dokumen.'; npsRenderSharePanel(); return; }

  npsRenderSharePanel();
  try {
    var res = await api('/api/admin/npinjam/share', {
      method: 'POST',
      body: JSON.stringify({ phone: npsSaved.phone, scan_id: scanId })
    });
    if (!res.success) {
      npsSaved.error = res.message || 'Gagal mengirim.';
      npsRenderSharePanel();
      return;
    }
    npsSaved.result = res.data;
    npsRenderSharePanel();
    npsLoadSaved();
  } catch (e) {
    npsSaved.error = 'Tidak dapat menghubungi server.';
    npsRenderSharePanel();
  }
}

async function npsPreviewMessage() {
  var scanId = npsState.scanId || (npsState.scan && npsState.scan.scan_id) || '';
  if (!scanId) { alert('Pindaian ini belum tersimpan.'); return; }
  try {
    var res = await api('/api/admin/npinjam/scans/' + scanId);
    if (!res.success || !res.data) { alert('Pindaian tidak ditemukan.'); return; }
    var addr = res.data.address || {};
    var loc = res.data.location;
    var text = addr.formatted_address || [addr.alamat, addr.kelurahan_desa, addr.kecamatan, addr.kabupaten_kota, addr.provinsi].filter(Boolean).join(', ');
    if (loc) {
      text += '\n\nLokasi: https://www.google.com/maps/search/?api=1&query=' + loc.latitude + ',' + loc.longitude;
      text += '\nTitik: ' + Number(loc.latitude).toFixed(6) + ', ' + Number(loc.longitude).toFixed(6);
    }
    alert(text || 'Alamat masih kosong.');
  } catch (e) {
    alert('Tidak dapat menghubungi server.');
  }
}

async function renderAffiliates(el) {
  try {
    var status = affiliateFilterStatus;
    var search = affiliateSearch;
    var d = await api('/api/admin/affiliates?status=' + encodeURIComponent(status) + '&search=' + encodeURIComponent(search));
    el.innerHTML =
      '<div class="grid-stats">' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=90ws9ph6tea3&format=png&color=000000"></div><div class="info"><h3>' + formatRp(d.totalCommission || 0) + '</h3><p>Total Komisi</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=7607&format=png&color=000000"></div><div class="info"><h3>' + formatRp(d.totalPaid || 0) + '</h3><p>Komisi Dibayar</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=P1YG1sk94HiB&format=png&color=000000"></div><div class="info"><h3>' + (d.totalCount || 0) + '</h3><p>Transaksi Komisi</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=20015&format=png&color=000000"></div><div class="info"><h3>' + (d.totalAffiliates || 0) + '</h3><p>Affiliates Aktif</p></div></div>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<input type="text" placeholder="Cari perintah, produk, affiliate..." value="' + escapeHtml(search) + '" oninput="affiliateSearch=this.value;debouncedRenderAffiliates()">' +
      '<select onchange="affiliateFilterStatus=this.value;debouncedRenderAffiliates()">' +
      '<option value="">Semua Status</option>' +
      '<option value="paid"' + (status === 'paid' ? ' selected' : '') + '>Paid</option>' +
      '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option>' +
      '</select>' +
      '<button class="btn btn-primary" onclick="debouncedRenderAffiliates()">Cari</button>' +
      '</div>' +
      '<div class="card"><table><thead><tr><th>Order ID</th><th>Affiliate</th><th>Produk</th><th>Pembeli</th><th>Total</th><th>Komisi</th><th>Status</th><th>Tanggal</th></tr></thead><tbody>' +
      (d.commissions || []).map(function (c) {
        return '<tr><td style="font-size:11px">' + escapeHtml(c.order_id) + '</td>' +
          '<td>' + escapeHtml(c.affiliate_name || ('#' + c.affiliate_user_id)) + '</td>' +
          '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(c.product_name || '-') + '</td>' +
          '<td>' + escapeHtml(c.buyer_name || '-') + '</td>' +
          '<td>' + formatRp(c.total_price) + '</td>' +
          '<td style="font-weight:700;color:#DF414F">' + formatRp(c.commission_amount) + ' <span style="font-size:10px;color:#9ca3af">(' + (parseFloat(c.commission_rate) || 0) + '%)</span></td>' +
          '<td>' + statusBadge(c.status) + '</td>' +
          '<td style="font-size:11px">' + (c.created_at ? new Date(c.created_at).toLocaleDateString('id-ID') : '-') + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      ((d.commissions || []).length === 0 ? '<p style="text-align:center;padding:24px;color:#9ca3af">Belum ada komisi affiliate</p>' : '') +
      '</div>';
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error loading affiliates</div>';
  }
}

let renderAffiliatesTimeout;
function debouncedRenderAffiliates() {
  clearTimeout(renderAffiliatesTimeout);
  renderAffiliatesTimeout = setTimeout(function () { navTo('affiliate'); }, 300);
}

socket.on('new_message', function (data) {
  if (currentPage === 'chat') {
    loadChatUsers();
    if (currentChatUserId && Number(currentChatUserId) === Number(data.userId)) {
      var area = document.getElementById('chat-msg-area');
      if (area) {
        var now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        var content = data.type === 'image'
          ? '<img src="' + escapeHtml(data.message) + '" alt="Foto chat" style="display:block;max-width:220px;max-height:280px;object-fit:contain;border-radius:8px">' +
            (data.caption ? '<div style="margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(data.caption) + '</div>' : '')
          : escapeHtml(data.message);
        area.insertAdjacentHTML('beforeend', '<div class="bubble-admin"><div>' + content + '</div><div class="bubble-time">' + now + '</div></div>');
        area.scrollTop = area.scrollHeight;
      }
    }
  }
});

// ============================================================
// MONITORING: ACCESS LOGS
// ============================================================
var logsState = { page: 1, method: '', status: '', search: '', from: '', to: '' };
var logsAutoRefresh = null;

async function renderLogs(el) {
  el.innerHTML = `
    <div class="grid-stats" id="logs-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="filter-bar">
        <input type="text" id="logs-search" placeholder="Search IP atau URL..." value="${escapeHtml(logsState.search)}" onkeydown="if(event.key==='Enter'){logsState.search=this.value;logsState.page=1;loadLogsData()}">
        <select id="logs-method" onchange="logsState.method=this.value;logsState.page=1;loadLogsData()">
          <option value="">All Methods</option>
          <option value="GET"${logsState.method==='GET'?' selected':''}>GET</option>
          <option value="POST"${logsState.method==='POST'?' selected':''}>POST</option>
          <option value="PUT"${logsState.method==='PUT'?' selected':''}>PUT</option>
          <option value="DELETE"${logsState.method==='DELETE'?' selected':''}>DELETE</option>
        </select>
        <select id="logs-status" onchange="logsState.status=this.value;logsState.page=1;loadLogsData()">
          <option value="">All Status</option>
          <option value="200"${logsState.status==='200'?' selected':''}>200</option>
          <option value="301"${logsState.status==='301'?' selected':''}>301</option>
          <option value="304"${logsState.status==='304'?' selected':''}>304</option>
          <option value="400"${logsState.status==='400'?' selected':''}>400</option>
          <option value="401"${logsState.status==='401'?' selected':''}>401</option>
          <option value="403"${logsState.status==='403'?' selected':''}>403</option>
          <option value="404"${logsState.status==='404'?' selected':''}>404</option>
          <option value="500"${logsState.status==='500'?' selected':''}>500</option>
        </select>
        <input type="date" id="logs-from" value="${logsState.from}" onchange="logsState.from=this.value;logsState.page=1;loadLogsData()" title="From">
        <input type="date" id="logs-to" value="${logsState.to}" onchange="logsState.to=this.value;logsState.page=1;loadLogsData()" title="To">
        <button class="btn btn-outline btn-sm" onclick="logsState.page=1;loadLogsData()">Filter</button>
        <button class="btn btn-outline btn-sm" onclick="exportLogs()">Export CSV</button>
        <button class="btn btn-sm ${logsAutoRefresh?'btn-success':'btn-outline'}" id="logs-auto-btn" onclick="toggleLogsAutoRefresh()">${logsAutoRefresh?'Auto ON':'Auto OFF'}</button>
      </div>
    </div>
    <div class="card">
      <div id="logs-table">${googleLoaderSmall('Loading logs...')}</div>
      <div id="logs-pagination"></div>
    </div>`;
  loadLogsData();
}

async function loadLogsData() {
  try {
    var params = new URLSearchParams({ page: logsState.page, limit: 50 });
    if (logsState.method) params.set('method', logsState.method);
    if (logsState.status) params.set('status', logsState.status);
    if (logsState.search) params.set('search', logsState.search);
    if (logsState.from) params.set('from', logsState.from);
    if (logsState.to) params.set('to', logsState.to);
    var d = await api('/api/admin/logs?' + params.toString());
    var tableEl = document.getElementById('logs-table');
    if (!d.logs || d.logs.length === 0) { tableEl.innerHTML = '<div class="loading-state">No logs found</div>'; return; }
    var statusBadge = function(s) {
      if (s >= 200 && s < 300) return '<span class="badge badge-success">' + s + '</span>';
      if (s >= 300 && s < 400) return '<span class="badge badge-info">' + s + '</span>';
      if (s >= 400 && s < 500) return '<span class="badge badge-pending">' + s + '</span>';
      return '<span class="badge badge-danger">' + s + '</span>';
    };
    var methodBadge = function(m) {
      var c = { GET: 'badge-success', POST: 'badge-info', PUT: 'badge-pending', DELETE: 'badge-danger' };
      return '<span class="badge ' + (c[m] || 'badge-gray') + '">' + m + '</span>';
    };
    var rows = d.logs.map(function(r) {
      var t = new Date(r.created_at);
      var time = t.toLocaleDateString('id-ID') + ' ' + t.toLocaleTimeString('id-ID');
      var rt = r.response_time_ms > 1000 ? (r.response_time_ms / 1000).toFixed(1) + 's' : r.response_time_ms + 'ms';
      return '<tr><td style="white-space:nowrap">' + time + '</td><td><code style="font-size:11px">' + escapeHtml(r.ip) + '</code></td><td>' + methodBadge(r.method) + '</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(r.url) + '">' + escapeHtml(r.url) + '</td><td>' + statusBadge(r.status_code) + '</td><td>' + rt + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#9ca3af" title="' + escapeHtml(r.user_agent || '') + '">' + escapeHtml((r.user_agent || '').substring(0, 50)) + '</td></tr>';
    }).join('');
    tableEl.innerHTML = '<div style="overflow-x:auto"><table><thead><tr><th>Waktu</th><th>IP</th><th>Method</th><th>URL</th><th>Status</th><th>Resp Time</th><th>User Agent</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    var pag = document.getElementById('logs-pagination');
    pag.innerHTML = '<div class="pagination"><button ' + (d.page <= 1 ? 'disabled' : '') + ' onclick="logsState.page=' + (d.page - 1) + ';loadLogsData()">Prev</button><span>Page ' + d.page + ' of ' + d.totalPages + ' (' + d.total + ' total)</span><button ' + (d.page >= d.totalPages ? 'disabled' : '') + ' onclick="logsState.page=' + (d.page + 1) + ';loadLogsData()">Next</button></div>';
  } catch (e) {
    document.getElementById('logs-table').innerHTML = '<div class="loading-state">Error loading logs</div>';
  }
}

function toggleLogsAutoRefresh() {
  if (logsAutoRefresh) { clearInterval(logsAutoRefresh); logsAutoRefresh = null; var b = document.getElementById('logs-auto-btn'); if (b) { b.className = 'btn btn-sm btn-outline'; b.textContent = 'Auto OFF'; } }
  else { logsAutoRefresh = setInterval(function() { if (currentPage === 'logs') loadLogsData(); }, 5000); var b = document.getElementById('logs-auto-btn'); if (b) { b.className = 'btn btn-sm btn-success'; b.textContent = 'Auto ON'; } }
}

function exportLogs() {
  var params = new URLSearchParams();
  if (logsState.method) params.set('method', logsState.method);
  if (logsState.status) params.set('status', logsState.status);
  if (logsState.from) params.set('from', logsState.from);
  if (logsState.to) params.set('to', logsState.to);
  window.open('/api/admin/logs/export?' + params.toString(), '_blank');
}

// ============================================================
// MONITORING: TRAFFIC ANALYTICS
// ============================================================
var trafficCharts = {};

async function renderTraffic(el) {
  el.innerHTML = `
    <div class="grid-stats" id="traffic-summary"></div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><div class="section-title">Pengunjung per Jam (24 jam terakhir)</div><div style="position:relative;height:220px;width:100%"><canvas id="traffic-hourly-chart"></canvas></div></div>
      <div class="card"><div class="section-title">Pengunjung per Hari (7 hari terakhir)</div><div style="position:relative;height:220px;width:100%"><canvas id="traffic-daily-chart"></canvas></div></div>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><div class="section-title">Top 10 Pages</div><div id="traffic-pages"></div></div>
      <div class="card"><div class="section-title">Browser / OS / Device</div><div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"><div style="position:relative;width:180px;height:180px"><canvas id="chart-browsers"></canvas></div><div style="position:relative;width:180px;height:180px"><canvas id="chart-os"></canvas></div><div style="position:relative;width:180px;height:180px"><canvas id="chart-devices"></canvas></div></div></div>
    </div>`;
  loadTrafficData();
}

async function loadTrafficData() {
  try {
    var [summary, realtime, pages, browsers] = await Promise.all([
      api('/api/admin/traffic/summary'),
      api('/api/admin/traffic/realtime'),
      api('/api/admin/traffic/pages?limit=10'),
      api('/api/admin/traffic/browsers')
    ]);
    var sumEl = document.getElementById('traffic-summary');
    if (sumEl) {
      var t = summary.today || {};
      var y = summary.yesterday || {};
      var diff = y.visitors > 0 ? Math.round(((t.visitors - y.visitors) / y.visitors) * 100) : 0;
      var diffColor = diff >= 0 ? '#16a34a' : '#ef4444';
      sumEl.innerHTML = `
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=11496&format=png&color=000000"></div><div class="info"><h3>${(t.visitors||0).toLocaleString()}</h3><p>Visitors Hari Ini <span style="color:${diffColor};font-weight:700">${diff >= 0 ? '+' : ''}${diff}%</span></p></div></div>
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=6651&format=png&color=000000"></div><div class="info"><h3>${(t.requests||0).toLocaleString()}</h3><p>Total Requests Hari Ini</p></div></div>
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=g8OYU6AVU8dX&format=png&color=000000"></div><div class="info"><h3>${(t.avg_rt||0)}ms</h3><p>Avg Response Time</p></div></div>
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=8122&format=png&color=000000"></div><div class="info"><h3>${summary.errorsToday||0}</h3><p>Error Requests (4xx/5xx)</p></div></div>`;
    }
    // Hourly chart
    var hourlyData = realtime.hourly || [];
    var hLabels = hourlyData.map(function(r) { return r.hour_label; });
    var hVisitors = hourlyData.map(function(r) { return r.unique_visitors; });
    var hRequests = hourlyData.map(function(r) { return r.requests; });
    createLineChart('traffic-hourly-chart', hLabels, [
      { label: 'Visitors', data: hVisitors, borderColor: '#DF414F', backgroundColor: 'rgba(223,65,79,0.1)' },
      { label: 'Requests', data: hRequests, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' }
    ]);
    // Daily chart
    var chartData = await api('/api/admin/traffic/chart?range=7d');
    var dLabels = (chartData.chart || []).map(function(r) { return r.label; });
    var dVisitors = (chartData.chart || []).map(function(r) { return r.unique_visitors; });
    var dRequests = (chartData.chart || []).map(function(r) { return r.total_requests; });
    createLineChart('traffic-daily-chart', dLabels, [
      { label: 'Unique Visitors', data: dVisitors, borderColor: '#DF414F', backgroundColor: 'rgba(223,65,79,0.1)' },
      { label: 'Total Requests', data: dRequests, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' }
    ]);
    // Pages
    var pagesEl = document.getElementById('traffic-pages');
    if (pagesEl && pages.pages) {
      var maxViews = Math.max.apply(null, pages.pages.map(function(p) { return p.views; }).concat([1]));
      pagesEl.innerHTML = pages.pages.map(function(p) {
        var pct = Math.round((p.views / maxViews) * 100);
        return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%" title="' + escapeHtml(p.url) + '">' + escapeHtml(p.url) + '</span><span style="color:#6b7280;font-weight:600">' + p.views + '</span></div><div style="height:6px;background:#f3f4f6;width:100%"><div style="height:6px;background:#DF414F;width:' + pct + '%"></div></div></div>';
      }).join('');
    }
    // Browser/OS/Device pie charts
    createPieChart('chart-browsers', browsers.browsers || []);
    createPieChart('chart-os', browsers.os || []);
    createPieChart('chart-devices', browsers.devices || []);
  } catch (e) { console.error('Traffic load error:', e); }
}

function createLineChart(canvasId, labels, datasets) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (trafficCharts[canvasId]) trafficCharts[canvasId].destroy();
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  trafficCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets.map(function(ds) { return Object.assign({}, ds, { tension: 0.3, borderWidth: 2, pointRadius: 2, fill: true }); }) },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 } } } } }
  });
}

function createPieChart(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !data.length) return;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  var colors = ['#DF414F', '#3b82f6', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels: data.map(function(d) { return d.browser || d.os || d.device_type || 'Unknown'; }), datasets: [{ data: data.map(function(d) { return d.count; }), backgroundColor: colors.slice(0, data.length) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
  });
}

// ============================================================
// MONITORING: VISITORS
// ============================================================
var visitorsState = { page: 1, search: '', from: '', to: '' };

async function renderVisitors(el) {
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="filter-bar">
        <input type="text" id="vis-search" placeholder="Search IP..." value="${escapeHtml(visitorsState.search)}" onkeydown="if(event.key==='Enter'){visitorsState.search=this.value;visitorsState.page=1;loadVisitorsData()}">
        <input type="date" id="vis-from" value="${visitorsState.from}" onchange="visitorsState.from=this.value;visitorsState.page=1;loadVisitorsData()">
        <input type="date" id="vis-to" value="${visitorsState.to}" onchange="visitorsState.to=this.value;visitorsState.page=1;loadVisitorsData()">
        <button class="btn btn-outline btn-sm" onclick="visitorsState.page=1;loadVisitorsData()">Filter</button>
      </div>
    </div>
    <div class="card">
      <div id="vis-table">${googleLoaderSmall('Loading visitors...')}</div>
      <div id="vis-pagination"></div>
    </div>
    <div class="card" id="vis-detail" style="margin-top:16px;display:none"></div>`;
  loadVisitorsData();
}

async function loadVisitorsData() {
  try {
    var params = new URLSearchParams({ page: visitorsState.page, limit: 50 });
    if (visitorsState.search) params.set('search', visitorsState.search);
    if (visitorsState.from) params.set('from', visitorsState.from);
    if (visitorsState.to) params.set('to', visitorsState.to);
    var d = await api('/api/admin/visitors?' + params.toString());
    var tableEl = document.getElementById('vis-table');
    if (!d.visitors || d.visitors.length === 0) { tableEl.innerHTML = '<div class="loading-state">No visitors found</div>'; return; }
    var devIcon = function(dev) {
      if (dev === 'Mobile') return '<img src="https://img.icons8.com/ios-filled/16/smartphone.png" alt="Mobile" class="w-4 h-4">';
      if (dev === 'Tablet') return '<img src="https://img.icons8.com/ios-filled/16/tablet.png" alt="Tablet" class="w-4 h-4">';
      return '<img src="https://img.icons8.com/ios-filled/16/laptop.png" alt="Laptop" class="w-4 h-4">';
    };
    var rows = d.visitors.map(function(v) {
      return '<tr style="cursor:pointer" onclick="showVisitorDetail(\'' + escapeHtml(v.fingerprint) + '\')"><td><code style="font-size:11px">' + escapeHtml(v.ip) + '</code></td><td>' + escapeHtml(v.browser) + '</td><td>' + escapeHtml(v.os) + '</td><td>' + devIcon(v.device_type) + ' ' + v.device_type + '</td><td>' + v.total_pageviews + '</td><td>' + new Date(v.first_visit).toLocaleDateString('id-ID') + '</td><td>' + new Date(v.last_visit).toLocaleDateString('id-ID') + ' ' + new Date(v.last_visit).toLocaleTimeString('id-ID') + '</td></tr>';
    }).join('');
    tableEl.innerHTML = '<div style="overflow-x:auto"><table><thead><tr><th>IP</th><th>Browser</th><th>OS</th><th>Device</th><th>Pages</th><th>First Visit</th><th>Last Visit</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    var pag = document.getElementById('vis-pagination');
    pag.innerHTML = '<div class="pagination"><button ' + (d.page <= 1 ? 'disabled' : '') + ' onclick="visitorsState.page=' + (d.page - 1) + ';loadVisitorsData()">Prev</button><span>Page ' + d.page + ' of ' + d.totalPages + '</span><button ' + (d.page >= d.totalPages ? 'disabled' : '') + ' onclick="visitorsState.page=' + (d.page + 1) + ';loadVisitorsData()">Next</button></div>';
  } catch (e) {
    document.getElementById('vis-table').innerHTML = '<div class="loading-state">Error loading visitors</div>';
  }
}

async function showVisitorDetail(fingerprint) {
  try {
    var d = await api('/api/admin/visitors/' + fingerprint);
    var detail = document.getElementById('vis-detail');
    detail.style.display = 'block';
    var v = d.visitor;
    var pages = (d.pages || []).map(function(p) {
      return '<tr><td>' + new Date(p.created_at).toLocaleString('id-ID') + '</td><td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(p.url) + '</td><td>' + p.response_time_ms + 'ms</td></tr>';
    }).join('');
    detail.innerHTML = '<div class="section-title">Visitor Detail: ' + escapeHtml(v.ip) + ' (' + escapeHtml(v.browser) + ' / ' + escapeHtml(v.os) + ' / ' + v.device_type + ')</div><p style="font-size:12px;color:#6b7280;margin-bottom:12px">Total Pageviews: ' + v.total_pageviews + ' | First: ' + new Date(v.first_visit).toLocaleString('id-ID') + ' | Last: ' + new Date(v.last_visit).toLocaleString('id-ID') + '</p><div style="overflow-x:auto"><table><thead><tr><th>Waktu</th><th>URL</th><th>Response Time</th></tr></thead><tbody>' + pages + '</tbody></table></div>';
    detail.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {}
}

// ============================================================
// MONITORING: SERVER STATUS
// ============================================================
var serverRefreshInterval = null;
var serverPreviousData = {};

async function renderServerStatus(el) {
  if (serverRefreshInterval) { clearInterval(serverRefreshInterval); serverRefreshInterval = null; }
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px">
        <span id="server-live-dot" style="width:8px;height:8px;border-radius:50%;background:#16a34a;display:inline-block;animation:pulse 1.5s infinite"></span>
        <span style="font-size:12px;color:#6b7280" id="server-last-update">Updating...</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:#6b7280">Auto-refresh:</span>
        <button class="btn btn-sm btn-success" id="server-refresh-btn" onclick="toggleServerRefresh()">ON (3s)</button>
      </div>
    </div>
    <style>
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
      @keyframes gauge-spin{from{stroke-dashoffset:283}to{stroke-dashoffset:0}}
      .server-gauge{position:relative;width:140px;height:140px}
      .server-gauge svg{transform:rotate(-90deg)}
      .server-gauge circle{fill:none;stroke-linecap:round;transition:stroke-dashoffset 0.8s ease,stroke 0.5s ease}
      .gauge-text{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
      .gauge-text .pct{font-size:26px;font-weight:700;color:#111;line-height:1}
      .gauge-text .label{font-size:10px;color:#9ca3af;margin-top:2px}
      .gauge-sub{font-size:10px;color:#6b7280;text-align:center;margin-top:4px}
    </style>
    <div class="grid-stats" id="server-gauges">
      <div class="card" style="text-align:center;padding:20px">
        <div class="server-gauge" id="gauge-cpu">
          <svg width="140" height="140"><circle cx="70" cy="70" r="56" stroke="#f3f4f6" stroke-width="10"/><circle cx="70" cy="70" r="56" stroke="#16a34a" stroke-width="10" stroke-dasharray="352" stroke-dashoffset="352" id="gauge-cpu-circle"/></svg>
          <div class="gauge-text"><div class="pct" id="gauge-cpu-pct">0%</div><div class="label">CPU</div></div>
        </div>
        <div class="gauge-sub" id="gauge-cpu-sub">Loading...</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div class="server-gauge" id="gauge-ram">
          <svg width="140" height="140"><circle cx="70" cy="70" r="56" stroke="#f3f4f6" stroke-width="10"/><circle cx="70" cy="70" r="56" stroke="#3b82f6" stroke-width="10" stroke-dasharray="352" stroke-dashoffset="352" id="gauge-ram-circle"/></svg>
          <div class="gauge-text"><div class="pct" id="gauge-ram-pct">0%</div><div class="label">RAM</div></div>
        </div>
        <div class="gauge-sub" id="gauge-ram-sub">Loading...</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div class="server-gauge" id="gauge-disk">
          <svg width="140" height="140"><circle cx="70" cy="70" r="56" stroke="#f3f4f6" stroke-width="10"/><circle cx="70" cy="70" r="56" stroke="#f59e0b" stroke-width="10" stroke-dasharray="352" stroke-dashoffset="352" id="gauge-disk-circle"/></svg>
          <div class="gauge-text"><div class="pct" id="gauge-disk-pct">0%</div><div class="label">Disk</div></div>
        </div>
        <div class="gauge-sub" id="gauge-disk-sub">Loading...</div>
      </div>
      <div class="card stat-card">
        <div class="icon"><img src="https://img.icons8.com/?size=100&id=LdUzF8b5sz2R&format=png&color=000000"></div>
        <div class="info"><h3 id="server-connections">-</h3><p>Active Connections</p></div>
        <div class="icon" style="margin-left:auto"><img src="https://img.icons8.com/?size=100&id=wIbWQHJLwHxp&format=png&color=000000"></div>
        <div class="info"><h3 id="server-reqrate">-</h3><p>req/sec</p></div>
      </div>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card">
        <div class="section-title">Server Info</div>
        <table><tbody>
          <tr><td style="width:140px;color:#6b7280;font-weight:600">Uptime</td><td id="server-uptime">-</td></tr>
          <tr><td style="color:#6b7280;font-weight:600">CPU Model</td><td style="font-size:12px" id="server-cpu-model">-</td></tr>
          <tr><td style="color:#6b7280;font-weight:600">Nginx</td><td id="server-nginx">-</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <div class="section-title">Resource History (Real-time)</div>
        <div style="position:relative;height:160px;width:100%"><canvas id="server-history-chart"></canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">PM2 Processes</div>
      <div id="server-pm2-table">${googleLoaderSmall('Loading PM2...')}</div>
    </div>`;
  await loadServerData();
  toggleServerRefresh(true);
}

var serverHistory = { labels: [], cpu: [], ram: [], disk: [] };
var serverHistoryChart = null;
var MAX_HISTORY = 30;

function setGauge(circleId, pct, color) {
  var circle = document.getElementById(circleId);
  if (!circle) return;
  var circumference = 352;
  var offset = circumference - (pct / 100) * circumference;
  circle.style.strokeDashoffset = offset;
  circle.setAttribute('stroke', color);
}

function gaugeColor(pct) { return pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#16a34a'; }

async function loadServerData() {
  try {
    var d = await api('/api/admin/server/status');
    var s = d.server;
    var cpuPct = s.cpu.usage;
    var memPct = s.memory.percent;
    var diskPct = s.disk.percent;

    setGauge('gauge-cpu-circle', cpuPct, gaugeColor(cpuPct));
    setGauge('gauge-ram-circle', memPct, gaugeColor(memPct));
    setGauge('gauge-disk-circle', diskPct, gaugeColor(diskPct));

    document.getElementById('gauge-cpu-pct').textContent = cpuPct + '%';
    document.getElementById('gauge-ram-pct').textContent = memPct + '%';
    document.getElementById('gauge-disk-pct').textContent = diskPct + '%';
    document.getElementById('gauge-cpu-sub').textContent = s.cpu.cores + ' cores | ' + s.cpu.model.split(' ').slice(0,3).join(' ');
    document.getElementById('gauge-ram-sub').textContent = formatBytes(s.memory.used) + ' / ' + formatBytes(s.memory.total);
    document.getElementById('gauge-disk-sub').textContent = formatBytes(s.disk.used) + ' / ' + formatBytes(s.disk.total);

    document.getElementById('server-connections').textContent = s.activeConnections;
    document.getElementById('server-reqrate').textContent = s.reqPerSec;
    document.getElementById('server-uptime').textContent = formatUptime(s.uptime);
    document.getElementById('server-cpu-model').textContent = s.cpu.model;
    var nginxDot = s.nginxStatus === 'active' ? '<span style="color:#16a34a;font-weight:700">● Active</span>' : '<span style="color:#ef4444;font-weight:700">● Inactive</span>';
    document.getElementById('server-nginx').innerHTML = nginxDot + ' ' + s.nginxStatus;

    var now = new Date().toLocaleTimeString('id-ID');
    document.getElementById('server-last-update').textContent = 'Last update: ' + now;

    // History chart
    serverHistory.labels.push(now);
    serverHistory.cpu.push(cpuPct);
    serverHistory.ram.push(memPct);
    serverHistory.disk.push(diskPct);
    if (serverHistory.labels.length > MAX_HISTORY) {
      serverHistory.labels.shift();
      serverHistory.cpu.shift();
      serverHistory.ram.shift();
      serverHistory.disk.shift();
    }
    updateServerHistoryChart();

    // PM2 table
    var pm2El = document.getElementById('server-pm2-table');
    var statusDot = function(st) { return st === 'online' || st === 'active' ? '<span style="color:#16a34a;font-weight:700">●</span>' : '<span style="color:#ef4444;font-weight:700">●</span>'; };
    var pm2Rows = (s.pm2 || []).map(function(p) {
      return '<tr><td>' + statusDot(p.status) + ' ' + escapeHtml(p.name) + '</td><td>' + p.pid + '</td><td><span class="badge ' + (p.status === 'online' ? 'badge-success' : 'badge-danger') + '">' + p.status + '</span></td><td>' + formatUptime((Date.now() - p.uptime) / 1000) + '</td><td>' + p.cpu + '%</td><td>' + formatBytes(p.memory) + '</td><td>' + p.restarts + '</td><td><button class="btn btn-outline btn-sm" onclick="pm2Action(\'restart\',\'' + escapeHtml(p.name) + '\')">Restart</button> <button class="btn btn-danger btn-sm" onclick="pm2Action(\'stop\',\'' + escapeHtml(p.name) + '\')">Stop</button></td></tr>';
    }).join('');
    pm2El.innerHTML = '<div style="overflow-x:auto"><table><thead><tr><th>Name</th><th>PID</th><th>Status</th><th>Uptime</th><th>CPU</th><th>Memory</th><th>Restarts</th><th>Actions</th></tr></thead><tbody>' + pm2Rows + '</tbody></table></div>';

  } catch (e) {
    console.error('Server status error:', e);
  }
}

function updateServerHistoryChart() {
  var canvas = document.getElementById('server-history-chart');
  if (!canvas) return;
  if (serverHistoryChart) serverHistoryChart.destroy();
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  serverHistoryChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: serverHistory.labels,
      datasets: [
        { label: 'CPU', data: serverHistory.cpu, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 },
        { label: 'RAM', data: serverHistory.ram, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 },
        { label: 'Disk', data: serverHistory.disk, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxTicksLimit: 10 } }, y: { beginAtZero: true, max: 100, grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 }, callback: function(v) { return v + '%'; } } } }
    }
  });
}

function toggleServerRefresh(forceOn) {
  if (forceOn === true || !serverRefreshInterval) {
    serverRefreshInterval = setInterval(function() {
      if (currentPage === 'server') loadServerData();
    }, 3000);
    var btn = document.getElementById('server-refresh-btn');
    if (btn) { btn.className = 'btn btn-sm btn-success'; btn.textContent = 'ON (3s)'; }
  } else {
    clearInterval(serverRefreshInterval);
    serverRefreshInterval = null;
    var btn = document.getElementById('server-refresh-btn');
    if (btn) { btn.className = 'btn btn-sm btn-outline'; btn.textContent = 'OFF'; }
  }
}

async function pm2Action(action, name) {
  if (!confirm('Yakin ingin ' + action + ' process ' + name + '?')) return;
  try {
    var d = await api('/api/admin/domain/pm2/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
    alert(d.message || 'Done');
    if (currentPage === 'server') loadServerData();
  } catch (e) { alert('Error: ' + e.message); }
}

// ============================================================
// DOMAIN MANAGEMENT
// ============================================================
async function renderDomain(el) {
  el.innerHTML = googleLoader('Loading domain info...');
  loadDomainData();
}

async function loadDomainData() {
  try {
    var d = await api('/api/admin/domain/status');
    var dom = d.domain;
    var statusDot = function(st) { return (st === 'active' || st === 'online') ? '<span style="color:#16a34a;font-weight:700">● Running</span>' : '<span style="color:#ef4444;font-weight:700">● Stopped</span>'; };

    var pm2Rows = (dom.pm2 || []).map(function(p) {
      return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + p.pid + '</td><td><span class="badge ' + (p.status === 'online' ? 'badge-success' : 'badge-danger') + '">' + p.status + '</span></td><td>' + formatUptime((Date.now() - p.uptime) / 1000) + '</td><td>' + p.cpu + '%</td><td>' + formatBytes(p.memory) + '</td></tr>';
    }).join('');

    var domainsList = (dom.domains || []).map(function(d) { return '<span class="badge badge-info" style="margin:2px">' + d + '</span>'; }).join(' ');
    var upstreamList = (dom.upstreamServers || []).map(function(u) { return '<code style="font-size:11px;display:block;padding:4px 0">' + escapeHtml(u) + '</code>'; }).join('');

    document.getElementById('page-content').innerHTML = `
      <div class="grid-stats">
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=f8puwbhs0kUR&format=png&color=000000"></div><div class="info"><h3 style="font-size:16px">${statusDot(dom.nginx.status)}</h3><p>Nginx ${escapeHtml(dom.nginx.version)}</p></div></div>
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=fUGx53gD9Jof&format=png&color=000000"></div><div class="info"><h3 style="font-size:16px">${statusDot(dom.tunnel.status)}</h3><p>Cloudflare Tunnel</p></div></div>
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=f8puwbhs0kUR&format=png&color=000000"></div><div class="info"><h3>${dom.nginx.workers}</h3><p>Nginx Workers (PID: ${dom.nginx.pid || 'N/A'})</p></div></div>
        <div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=LHf6nRR-WkA8&format=png&color=000000"></div><div class="info"><h3>${dom.ports.length}</h3><p>Listening Ports: ${dom.ports.join(', ')}</p></div></div>
      </div>
      <div class="two-col" style="margin-bottom:16px">
        <div class="card">
          <div class="section-title">Nginx Control</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            <button class="btn btn-success" onclick="nginxAction('start')">
              <img src="https://img.icons8.com/?size=100&id=59862&format=png&color=ffffff" 
                    style="width:18px;height:18px;vertical-align:middle;"> Start
            </button>
            <button class="btn btn-danger" onclick="nginxAction('stop')">
              <img src="https://img.icons8.com/?size=100&id=91463&format=png&color=ffffff" 
                    style="width:18px;height:18px;vertical-align:middle;"> Stop
            </button>
            <button class="btn btn-primary" onclick="nginxAction('restart')">
              <img src="https://img.icons8.com/?size=100&id=11684&format=png&color=ffffff" 
                    style="width:18px;height:18px;vertical-align:middle;"> Restart
            </button>
            <button class="btn btn-outline" onclick="nginxAction('reload')">
              <img src="https://img.icons8.com/?size=100&id=11682&format=png&color=000000" 
                    style="width:18px;height:18px;vertical-align:middle;"> Reload
            </button>
            <button class="btn btn-outline" onclick="nginxTest()">
              <img src="https://img.icons8.com/?size=100&id=t5mVBcv3ypH1&format=png&color=000000" 
                    style="width:18px;height:18px;vertical-align:middle;"> Test Config
            </button>
          </div>
          <div id="nginx-action-result" style="display:none;padding:10px;font-size:12px;border:1px solid #e5e7eb;background:#f9fafb;margin-bottom:12px;white-space:pre-wrap;max-height:150px;overflow-y:auto"></div>
          <div class="section-title">Domain Info</div>
          <table><tbody>
            <tr><td style="width:120px;color:#6b7280;font-weight:600">Domains</td><td>${domainsList}</td></tr>
            <tr><td style="color:#6b7280;font-weight:600">Upstream</td><td>${upstreamList}</td></tr>
            <tr><td style="color:#6b7280;font-weight:600">SSL</td><td><span class="badge badge-success">${dom.ssl?.source || 'Cloudflare'}</span> ${escapeHtml(dom.ssl?.info || '').substring(0, 80)}</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <div class="section-title">PM2 Processes</div>
          <div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="pm2ActionAll('restart')">Restart All</button></div>
          <div style="overflow-x:auto"><table><thead><tr><th>Name</th><th>PID</th><th>Status</th><th>Uptime</th><th>CPU</th><th>Memory</th></tr></thead><tbody>${pm2Rows}</tbody></table></div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Nginx Config</div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn btn-outline btn-sm" onclick="showNginxConfig()">View Config</button>
          <button class="btn btn-outline btn-sm" onclick="showNginxLog('access')">Access Log</button>
          <button class="btn btn-outline btn-sm" onclick="showNginxLog('error')">Error Log</button>
        </div>
        <div id="domain-log-area" style="display:none;max-height:400px;overflow-y:auto;background:#1e1e2e;color:#cdd6f4;padding:12px;font-family:monospace;font-size:11px;white-space:pre-wrap;border:1px solid #313244"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="section-title">Admin Action Logs</div>
        <div id="admin-action-logs">${googleLoaderSmall('Loading logs...')}</div>
      </div>`;
    loadAdminActionLogs();
  } catch (e) {
    document.getElementById('page-content').innerHTML = '<div class="loading-state">Error loading domain info: ' + escapeHtml(e.message) + '</div>';
  }
}

async function nginxAction(action) {
  try {
    var resultEl = document.getElementById('nginx-action-result');
    resultEl.style.display = 'block';
    resultEl.textContent = 'Executing ' + action + '...';
    var d = await api('/api/admin/domain/nginx/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    resultEl.textContent = (d.success ? '✅ ' : '❌ ') + d.message;
    resultEl.style.borderColor = d.success ? '#16a34a' : '#ef4444';
    setTimeout(function() { if (currentPage === 'domain') loadDomainData(); }, 1500);
  } catch (e) {
    var resultEl = document.getElementById('nginx-action-result');
    if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = '❌ Error: ' + e.message; resultEl.style.borderColor = '#ef4444'; }
  }
}

async function nginxTest() {
  try {
    var d = await api('/api/admin/domain/nginx/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    var resultEl = document.getElementById('nginx-action-result');
    resultEl.style.display = 'block';
    resultEl.textContent = (d.success ? '✅ Config OK' : '❌ Config Error') + '\n' + d.message;
    resultEl.style.borderColor = d.success ? '#16a34a' : '#ef4444';
  } catch (e) {}
}

async function pm2ActionAll(action) {
  if (!confirm('Yakin restart semua PM2 processes?')) return;
  try {
    var d = await api('/api/admin/domain/pm2/restart-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    alert(d.message || 'Done');
    if (currentPage === 'domain') loadDomainData();
  } catch (e) { alert('Error'); }
}

async function showNginxConfig() {
  try {
    var d = await api('/api/admin/domain/nginx-config');
    var area = document.getElementById('domain-log-area');
    area.style.display = 'block';
    area.textContent = d.config || 'No config found';
  } catch (e) {}
}

async function showNginxLog(type) {
  try {
    var d = await api('/api/admin/domain/nginx/' + type + '-log?lines=100');
    var area = document.getElementById('domain-log-area');
    area.style.display = 'block';
    area.textContent = d.log || 'No log data';
    area.scrollTop = area.scrollHeight;
  } catch (e) {}
}

async function loadAdminActionLogs() {
  try {
    var d = await api('/api/admin/domain/action-logs?limit=10');
    var el = document.getElementById('admin-action-logs');
    if (!d.logs || d.logs.length === 0) { el.innerHTML = '<p style="font-size:12px;color:#9ca3af">No action logs yet</p>'; return; }
    var rows = d.logs.map(function(l) {
      return '<tr><td>' + new Date(l.created_at).toLocaleString('id-ID') + '</td><td>' + escapeHtml(l.admin_username) + '</td><td><span class="badge badge-info">' + escapeHtml(l.action) + '</span></td><td>' + escapeHtml(l.target) + '</td><td style="font-size:11px;color:#9ca3af">' + escapeHtml(l.ip) + '</td></tr>';
    }).join('');
    el.innerHTML = '<div style="overflow-x:auto"><table><thead><tr><th>Waktu</th><th>Admin</th><th>Action</th><th>Target</th><th>IP</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch (e) {}
}

// ============================================================
// DOMAIN MANAGER
// ============================================================
var dmTab = 'list';
var dmDomains = [];

async function renderDomainManager(el) {
  el.innerHTML = googleLoader('Loading domain manager...');
  dmLoadDomains();
}

function dmTabNav(tab) {
  dmTab = tab;
  var el = document.getElementById('page-content');
  var tabsHtml = '<div class="sec-tabs">'
    + '<button class="sec-tab' + (tab === 'list' ? ' active' : '') + '" onclick="dmTabNav(\'list\')">Domains</button>'
    + '<button class="sec-tab' + (tab === 'add' ? ' active' : '') + '" onclick="dmTabNav(\'add\')">Add Domain</button>'
    + '<button class="sec-tab' + (tab === 'dns' ? ' active' : '') + '" onclick="dmTabNav(\'dns\')">DNS Tools</button>'
    + '</div>';
  if (tab === 'add') {
    el.innerHTML = tabsHtml + dmRenderAddForm();
  } else if (tab === 'dns') {
    el.innerHTML = tabsHtml + dmRenderDnsTools();
  } else {
    el.innerHTML = tabsHtml + googleLoaderSmall('Loading domains...');
    dmLoadDomains();
  }
}

async function dmLoadDomains() {
  try {
    var el = document.getElementById('page-content');
    var d = await api('/api/admin/domain-manager/list');
    dmDomains = d.domains || [];
    var tabsHtml = '<div class="sec-tabs">'
      + '<button class="sec-tab active" onclick="dmTabNav(\'list\')">Domains</button>'
      + '<button class="sec-tab" onclick="dmTabNav(\'add\')">Add Domain</button>'
      + '<button class="sec-tab" onclick="dmTabNav(\'dns\')">DNS Tools</button>'
      + '</div>';

    var rows = dmDomains.map(function(dm) {
      var statusBadge = dm.status === 'active' ? '<span class="badge badge-success">Active</span>'
        : dm.status === 'pending' ? '<span class="badge badge-pending">Pending</span>'
        : dm.status === 'error' ? '<span class="badge badge-danger">Error</span>'
        : '<span class="badge badge-info">Inactive</span>';
      var syncBadge = '';
      if (dm.in_nginx && dm.in_cloudflared) syncBadge = '<span class="badge badge-success" style="font-size:10px">Synced</span>';
      else syncBadge = '<span class="badge badge-danger" style="font-size:10px">Out of Sync</span>';

      return '<tr>'
        + '<td><strong>' + escapeHtml(dm.domain) + '</strong>' + (dm.is_primary ? ' <span style="color:#f59e0b;font-size:10px;font-weight:700">PRIMARY</span>' : '') + '<br><span style="font-size:11px;color:#9ca3af">Created: ' + new Date(dm.created_at).toLocaleDateString('id-ID') + '</span></td>'
        + '<td>' + dm.port + '</td>'
        + '<td>' + escapeHtml(dm.target_service) + '</td>'
        + '<td>' + escapeHtml(dm.ssl_mode) + '</td>'
        + '<td>' + statusBadge + ' ' + syncBadge + '</td>'
        + '<td>'
          + '<button class="btn btn-outline btn-sm" onclick="dmTestDomain(' + dm.id + ')" title="Test"><img src="https://img.icons8.com/?size=100&id=59862&format=png&color=000000" style="width:14px;height:14px"></button> '
          + '<button class="btn btn-outline btn-sm" onclick="dmEditDomain(' + dm.id + ')" title="Edit"><img src="https://img.icons8.com/?size=100&id=364&format=png&color=000000" style="width:14px;height:14px"></button> '
          + '<button class="btn btn-danger btn-sm" onclick="dmDeleteDomain(' + dm.id + ')" title="Delete"><img src="https://img.icons8.com/?size=100&id=91463&format=png&color=ffffff" style="width:14px;height:14px"></button>'
        + '</td>'
        + '</tr>';
    }).join('');

    var html = tabsHtml
      + '<div class="card">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
          + '<div class="section-title" style="margin:0">Managed Domains (' + dmDomains.length + ')</div>'
          + '<div style="display:flex;gap:6px">'
            + '<button class="btn btn-primary btn-sm" onclick="dmSyncAll()"><img src="https://img.icons8.com/?size=100&id=11684&format=png&color=ffffff" style="width:14px;height:14px;vertical-align:middle"> Sync All</button>'
            + '<button class="btn btn-outline btn-sm" onclick="dmTabNav(\'add\')"><img src="https://img.icons8.com/?size=100&id=11496&format=png&color=000000" style="width:14px;height:14px;vertical-align:middle"> Add Domain</button>'
          + '</div>'
        + '</div>'
        + '<div id="dm-sync-result" style="display:none;padding:10px;font-size:12px;border:1px solid #e5e7eb;background:#f9fafb;margin-bottom:12px;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>'
        + (dmDomains.length === 0
          ? '<p style="font-size:12px;color:#9ca3af;text-align:center;padding:40px 0">No domains configured yet. Click "Add Domain" to get started.</p>'
          : '<div style="overflow-x:auto"><table><thead><tr><th>Domain</th><th>Port</th><th>Service</th><th>SSL</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        )
      + '</div>';

    el.innerHTML = html;
  } catch (e) {
    var el = document.getElementById('page-content');
    el.innerHTML = '<div class="loading-state">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

function dmRenderAddForm() {
  return '<div class="card">'
    + '<div class="section-title">Add New Domain</div>'
    + '<div id="dm-add-result" style="display:none;padding:10px;font-size:12px;border:1px solid #e5e7eb;background:#f9fafb;margin-bottom:12px;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px">'
      + '<div>'
        + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Domain *</label>'
        + '<input type="text" id="dm-domain-input" placeholder="api.example.com" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
      + '</div>'
      + '<div>'
        + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Port</label>'
        + '<input type="number" id="dm-port-input" value="8080" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
      + '</div>'
      + '<div>'
        + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Target Service</label>'
        + '<input type="text" id="dm-service-input" value="northline" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
      + '</div>'
      + '<div>'
        + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">SSL Mode</label>'
        + '<select id="dm-ssl-input" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
          + '<option value="cloudflare">Cloudflare</option>'
          + '<option value="letsencrypt">Let\'s Encrypt</option>'
          + '<option value="none">None</option>'
        + '</select>'
      + '</div>'
      + '<div style="grid-column:1/3">'
        + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Notes</label>'
        + '<textarea id="dm-notes-input" rows="2" placeholder="Optional notes..." style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical"></textarea>'
      + '</div>'
    + '</div>'
    + '<div style="margin-top:16px;display:flex;gap:8px">'
      + '<button class="btn btn-primary" onclick="dmAddDomain()"><img src="https://img.icons8.com/?size=100&id=11496&format=png&color=ffffff" style="width:14px;height:14px;vertical-align:middle"> Add & Configure</button>'
      + '<button class="btn btn-outline" onclick="dmTabNav(\'list\')">Cancel</button>'
    + '</div>'
  + '</div>';
}

async function dmAddDomain() {
  var domain = (document.getElementById('dm-domain-input').value || '').trim();
  var port = document.getElementById('dm-port-input').value;
  var service = (document.getElementById('dm-service-input').value || '').trim();
  var ssl = document.getElementById('dm-ssl-input').value;
  var notes = (document.getElementById('dm-notes-input').value || '').trim();
  var resultEl = document.getElementById('dm-add-result');

  if (!domain) { resultEl.style.display = 'block'; resultEl.style.borderColor = '#ef4444'; resultEl.textContent = 'Domain is required'; return; }

  resultEl.style.display = 'block';
  resultEl.style.borderColor = '#3b82f6';
  resultEl.textContent = 'Adding domain... Configuring nginx and cloudflare tunnel...';

  try {
    var d = await api('/api/admin/domain-manager/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domain, port: parseInt(port) || 8080, target_service: service || 'northline', ssl_mode: ssl, notes: notes })
    });

    if (d.success) {
      var steps = (d.steps || []).map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n');
      var msg = 'Domain added successfully!\n\n' + steps;
      if (d.errors && d.errors.length > 0) msg += '\n\nWarnings:\n' + d.errors.join('\n');
      if (!d.hasDns) msg += '\n\nDNS not yet resolving. Point your DNS to the server IP.';
      resultEl.style.borderColor = '#16a34a';
      resultEl.textContent = msg;
      setTimeout(function() { dmTabNav('list'); }, 2000);
    } else {
      resultEl.style.borderColor = '#ef4444';
      resultEl.textContent = 'Error: ' + (d.message || 'Unknown error');
    }
  } catch (e) {
    resultEl.style.borderColor = '#ef4444';
    resultEl.textContent = 'Error: ' + e.message;
  }
}

async function dmTestDomain(id) {
  try {
    var d = await api('/api/admin/domain-manager/test/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    var msg = 'Test results for ' + d.domain + ':\n\n'
      + 'DNS: ' + (d.results.hasDns ? 'Resolved (' + d.results.dnsResult + ')' : 'Not resolving') + '\n'
      + 'HTTP: ' + (d.results.reachable ? 'Status ' + d.results.httpStatus + ' (' + d.results.httpTime + 's)' : 'Unreachable') + '\n';
    if (d.results.sslCert) msg += 'SSL: ' + d.results.sslCert + '\n';
    alert(msg);
  } catch (e) {
    alert('Test failed: ' + e.message);
  }
}

async function dmDeleteDomain(id) {
  var dm = dmDomains.find(function(d) { return d.id === id; });
  if (!dm) return;
  if (!confirm('Delete domain "' + dm.domain + '"?\n\nThis will remove it from nginx and cloudflare tunnel config.')) return;

  try {
    var d = await api('/api/admin/domain-manager/delete/' + id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
    if (d.success) {
      alert('Domain deleted. Steps:\n' + (d.steps || []).join('\n'));
      dmLoadDomains();
    } else {
      alert('Error: ' + (d.message || 'Unknown error'));
    }
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

function dmEditDomain(id) {
  var dm = dmDomains.find(function(d) { return d.id === id; });
  if (!dm) return;
  var el = document.getElementById('page-content');
  var tabsHtml = '<div class="sec-tabs">'
    + '<button class="sec-tab active" onclick="dmTabNav(\'list\')">Domains</button>'
    + '<button class="sec-tab" onclick="dmTabNav(\'add\')">Add Domain</button>'
    + '<button class="sec-tab" onclick="dmTabNav(\'dns\')">DNS Tools</button>'
    + '</div>';
  el.innerHTML = tabsHtml
    + '<div class="card">'
      + '<div class="section-title">Edit Domain: ' + escapeHtml(dm.domain) + '</div>'
      + '<div id="dm-edit-result" style="display:none;padding:10px;font-size:12px;border:1px solid #e5e7eb;background:#f9fafb;margin-bottom:12px;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px">'
        + '<div>'
          + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Port</label>'
          + '<input type="number" id="dm-edit-port" value="' + dm.port + '" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
        + '</div>'
        + '<div>'
          + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Target Service</label>'
          + '<input type="text" id="dm-edit-service" value="' + escapeHtml(dm.target_service) + '" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
        + '</div>'
        + '<div>'
          + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">SSL Mode</label>'
          + '<select id="dm-edit-ssl" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
            + '<option value="cloudflare"' + (dm.ssl_mode === 'cloudflare' ? ' selected' : '') + '>Cloudflare</option>'
            + '<option value="letsencrypt"' + (dm.ssl_mode === 'letsencrypt' ? ' selected' : '') + '>Let\'s Encrypt</option>'
            + '<option value="none"' + (dm.ssl_mode === 'none' ? ' selected' : '') + '>None</option>'
          + '</select>'
        + '</div>'
        + '<div>'
          + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Status</label>'
          + '<select id="dm-edit-status" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box">'
            + '<option value="active"' + (dm.status === 'active' ? ' selected' : '') + '>Active</option>'
            + '<option value="inactive"' + (dm.status === 'inactive' ? ' selected' : '') + '>Inactive</option>'
            + '<option value="pending"' + (dm.status === 'pending' ? ' selected' : '') + '>Pending</option>'
          + '</select>'
        + '</div>'
        + '<div style="grid-column:1/3">'
          + '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Notes</label>'
          + '<textarea id="dm-edit-notes" rows="2" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical">' + escapeHtml(dm.notes || '') + '</textarea>'
        + '</div>'
        + '<div style="grid-column:1/3;display:flex;align-items:center;gap:8px">'
          + '<input type="checkbox" id="dm-edit-primary"' + (dm.is_primary ? ' checked' : '') + '>'
          + '<label for="dm-edit-primary" style="font-size:12px;font-weight:600">Set as Primary Domain</label>'
        + '</div>'
      + '</div>'
      + '<div style="margin-top:16px;display:flex;gap:8px">'
        + '<button class="btn btn-primary" onclick="dmSaveEdit(' + dm.id + ')">Save Changes</button>'
        + '<button class="btn btn-outline" onclick="dmTabNav(\'list\')">Cancel</button>'
      + '</div>'
    + '</div>';
}

async function dmSaveEdit(id) {
  var resultEl = document.getElementById('dm-edit-result');
  resultEl.style.display = 'block';
  resultEl.style.borderColor = '#3b82f6';
  resultEl.textContent = 'Saving...';

  try {
    var d = await api('/api/admin/domain-manager/update/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        port: parseInt(document.getElementById('dm-edit-port').value) || 8080,
        target_service: (document.getElementById('dm-edit-service').value || '').trim(),
        ssl_mode: document.getElementById('dm-edit-ssl').value,
        status: document.getElementById('dm-edit-status').value,
        is_primary: document.getElementById('dm-edit-primary').checked,
        notes: (document.getElementById('dm-edit-notes').value || '').trim()
      })
    });

    if (d.success) {
      resultEl.style.borderColor = '#16a34a';
      resultEl.textContent = 'Saved!';
      setTimeout(function() { dmTabNav('list'); }, 1000);
    } else {
      resultEl.style.borderColor = '#ef4444';
      resultEl.textContent = 'Error: ' + (d.message || 'Unknown');
    }
  } catch (e) {
    resultEl.style.borderColor = '#ef4444';
    resultEl.textContent = 'Error: ' + e.message;
  }
}

async function dmSyncAll() {
  var resultEl = document.getElementById('dm-sync-result');
  resultEl.style.display = 'block';
  resultEl.style.borderColor = '#3b82f6';
  resultEl.textContent = 'Generating sync script...';

  try {
    var d = await api('/api/admin/domain-manager/sync-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (d.success) {
      var msg = 'Sync script generated for ' + (d.domains || []).length + ' domains.\n\n';
      msg += 'Script location: ' + (d.scriptPath || 'N/A') + '\n\n';
      msg += 'To apply, run in terminal:\n';
      msg += 'sudo bash ' + (d.scriptPath || '') + '\n\n';
      msg += 'Or copy the script below:';
      resultEl.style.borderColor = '#16a34a';
      resultEl.innerHTML = msg.replace(/\n/g, '<br>')
        + '<div style="margin-top:10px;background:#1e1e2e;color:#cdd6f4;padding:10px;border-radius:6px;font-family:monospace;font-size:11px;white-space:pre-wrap;max-height:300px;overflow-y:auto;border:1px solid #313244">'
        + escapeHtml(d.scriptContent || '')
        + '</div>'
        + '<div style="margin-top:8px;display:flex;gap:8px">'
        + '<button class="btn btn-outline btn-sm" onclick="dmCopyScript()">Copy Script</button>'
        + '<button class="btn btn-primary btn-sm" onclick="dmApplySync()">Try Apply (may need sudo)</button>'
        + '</div>';
      setTimeout(function() { dmLoadDomains(); }, 1500);
    } else {
      resultEl.style.borderColor = '#ef4444';
      resultEl.textContent = 'Error: ' + (d.message || 'Unknown');
    }
  } catch (e) {
    resultEl.style.borderColor = '#ef4444';
    resultEl.textContent = 'Error: ' + e.message;
  }
}

function dmCopyScript() {
  api('/api/admin/domain-manager/sync-script').then(function(d) {
    if (d.scriptContent) {
      navigator.clipboard.writeText(d.scriptContent).then(function() {
        alert('Script copied to clipboard!');
      }).catch(function() {
        prompt('Copy this script:', d.scriptContent);
      });
    }
  });
}

async function dmApplySync() {
  var resultEl = document.getElementById('dm-sync-result');
  resultEl.style.display = 'block';
  resultEl.style.borderColor = '#3b82f6';
  resultEl.textContent = 'Applying sync...';

  try {
    var d = await api('/api/admin/domain-manager/apply-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (d.success) {
      resultEl.style.borderColor = '#16a34a';
      resultEl.textContent = 'Sync applied!\n\n' + (d.output || '');
      setTimeout(function() { dmLoadDomains(); }, 1500);
    } else {
      resultEl.style.borderColor = '#f59e0b';
      resultEl.textContent = (d.message || '') + '\n\n' + (d.output || '');
    }
  } catch (e) {
    resultEl.style.borderColor = '#ef4444';
    resultEl.textContent = 'Error: ' + e.message;
  }
}

function dmRenderDnsTools() {
  return '<div class="card">'
    + '<div class="section-title">DNS Tools</div>'
    + '<div style="display:flex;gap:8px;margin-bottom:16px">'
      + '<input type="text" id="dm-dns-input" placeholder="example.com" style="flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px">'
      + '<button class="btn btn-primary" onclick="dmDnsCheck()">Check DNS</button>'
    + '</div>'
    + '<div id="dm-dns-result" style="display:none;padding:10px;font-size:12px;border:1px solid #e5e7eb;background:#f9fafb;white-space:pre-wrap"></div>'
  + '</div>';
}

async function dmDnsCheck() {
  var domain = (document.getElementById('dm-dns-input').value || '').trim();
  if (!domain) return;
  var resultEl = document.getElementById('dm-dns-result');
  resultEl.style.display = 'block';
  resultEl.style.borderColor = '#3b82f6';
  resultEl.textContent = 'Checking DNS for ' + domain + '...';

  try {
    var d = await api('/api/admin/domain-manager/dns-check/' + encodeURIComponent(domain));
    resultEl.style.borderColor = d.hasDns ? '#16a34a' : '#f59e0b';
    resultEl.textContent = 'Domain: ' + d.domain + '\n'
      + 'DNS Record: ' + (d.dnsResult || 'Not found') + '\n'
      + 'Server IP: ' + (d.serverIp || 'Unknown') + '\n'
      + 'Resolves: ' + (d.hasDns ? 'Yes' : 'No') + '\n'
      + 'Points to this server: ' + (d.matches ? 'Yes' : 'No');
  } catch (e) {
    resultEl.style.borderColor = '#ef4444';
    resultEl.textContent = 'Error: ' + e.message;
  }
}

// ============================================================
// FILE MANAGER
// ============================================================
var fmCurrentPath = '';
var fmClipboard = null;

function renderFileManager(el) {
  fmCurrentPath = '';
  el.innerHTML = `
    <style>
      .fm-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
      .fm-breadcrumb{display:flex;align-items:center;gap:4px;margin-bottom:12px;background:#fff;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;flex-wrap:wrap}
      .fm-breadcrumb span{cursor:pointer;color:#3b82f6;padding:2px 6px;border-radius:4px;transition:background .15s}
      .fm-breadcrumb span:hover{background:#eff6ff}
      .fm-breadcrumb span.active{color:#111;font-weight:600;cursor:default;background:none}
      .fm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
      .fm-item{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 12px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
      .fm-item:hover{border-color:#3b82f6;box-shadow:0 2px 8px rgba(59,130,246,.1);transform:translateY(-1px)}
      .fm-item.selected{border-color:#3b82f6;background:#eff6ff}
      .fm-item .icon{font-size:36px;margin-bottom:6px;line-height:1}
      .fm-item .name{font-size:11px;word-break:break-all;color:#374151;font-weight:500;line-height:1.3;max-height:2.6em;overflow:hidden}
      .fm-item .meta{font-size:9px;color:#9ca3af;margin-top:3px}
      .fm-list-item{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all .15s}
      .fm-list-item:hover{border-color:#3b82f6;background:#f8faff}
      .fm-list-item .icon{font-size:22px;width:28px;text-align:center}
      .fm-list-item .info{flex:1;min-width:0}
      .fm-list-item .info .fname{font-size:13px;font-weight:500;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fm-list-item .info .fmeta{font-size:11px;color:#9ca3af}
      .fm-list-item .actions{display:flex;gap:4px;opacity:0;transition:opacity .15s}
      .fm-list-item:hover .actions{opacity:1}
      .fm-actions-bar{display:flex;gap:6px;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid #f3f4f6}
    </style>
    <div class="fm-toolbar">
      <button class="btn btn-outline btn-sm" onclick="fmNavigate('..')">
          <img src="https://img.icons8.com/?size=100&id=87742&format=png&color=000000" class="w-4 h-4" alt="Up" class="fm-icon"> Up
      </button>
      <button class="btn btn-primary btn-sm" onclick="fmNewFolder()">
          <img src="https://img.icons8.com/?size=100&id=2828&format=png&color=ffffff" class="w-4 h-4" alt="New Folder" class="fm-icon"> New Folder
      </button>
      <button class="btn btn-primary btn-sm" onclick="fmUpload()">
          <img src="https://img.icons8.com/?size=100&id=84056&format=png&color=ffffff" class="w-4 h-4" alt="Upload" class="fm-icon"> Upload
      </button>
      <button class="btn btn-outline btn-sm" onclick="fmRefresh()">
          <img src="https://img.icons8.com/ios-filled/16/synchronize.png" class="w-4 h-4" alt="Refresh" class="fm-icon"> Refresh
      </button>
      <input type="file" id="fm-file-input" multiple style="display:none" onchange="fmHandleUpload(this.files)">
    </div>
    <div class="fm-breadcrumb" id="fm-breadcrumb"></div>
    <div id="fm-content">${googleLoader('Loading files...')}</div>`;
  fmLoadDir('');
}

function fmIcon(item) {
  if (item.isDirectory) {
    return `<img src="https://img.icons8.com/color/48/folder-invoices.png"
                 class="w-5 h-5"
                 alt="folder">`;
  }

  var name = item.name.toLowerCase();
  var ext = name.includes('.') ? name.split('.').pop() : '';

  var icons = {
    // Web
    js: 'javascript.png',
    jsx: 'react.png',
    ts: 'typescript.png',
    tsx: 'react.png',
    html: 'html-5--v1.png',
    htm: 'html-5--v1.png',
    css: 'css3.png',
    scss: 'sass.png',
    sass: 'sass.png',

    // Data / Config
    json: 'json--v1.png',
    xml: 'xml.png',
    yml: 'yaml.png',
    yaml: 'yaml.png',
    env: 'lock.png',
    sql: 'sql.png',
    csv: 'csv.png',
    config: 'settings.png',
    cfg: 'settings.png',

    // Programming
    py: 'python.png',
    php: 'php.png',
    java: 'java-coffee-cup-logo.png',
    c: 'c-programming.png',
    cpp: 'cpp.png',
    cs: 'c-sharp-logo.png',
    go: 'golang.png',
    rs: 'rust-programming-language.png',

    // Documents
    md: 'markdown.png',
    txt: 'txt.png',
    pdf: 'pdf-2.png',
    doc: 'word.png',
    docx: 'word.png',
    xls: 'excel.png',
    xlsx: 'excel.png',

    // Images
    png: 'png.png',
    jpg: 'jpg.png',
    jpeg: 'jpg.png',
    gif: 'gif.png',
    webp: 'webp.png',
    svg: 'svg.png',
    ico: 'image.png',

    // Archives
    zip: 'zip.png',
    rar: 'rar.png',
    tar: 'archive.png',
    gz: 'archive.png',
    '7z': 'archive.png',

    // Media
    mp4: 'video.png',
    webm: 'video.png',
    mov: 'video.png',
    mp3: 'audio.png',
    wav: 'audio.png',

    // Shell / System
    sh: 'console.png',
    bash: 'console.png',
    log: 'log.png'
  };

  // Special filenames
  var specialFiles = {
    '.gitignore': 'git.png',
    '.dockerignore': 'docker.png',
    'dockerfile': 'docker.png',
    'readme.md': 'markdown.png',
    'package.json': 'npm.png',
    'package-lock.json': 'npm.png',
    'pnpm-lock.yaml': 'pnpm.png',
    'yarn.lock': 'yarn.png',
    '.env': 'lock.png'
  };

  var icon = specialFiles[name] || icons[ext] || 'file.png';

  return `<img 
    src="https://img.icons8.com/color/48/${icon}"
    alt="${ext || 'file'}"
    class="w-5 h-5 object-contain"
    loading="lazy"
  >`;
}

function fmFormatSize(bytes) {
  if (!bytes) return '-';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function fmLoadDir(dirPath) {
  fmCurrentPath = dirPath || '';
  var content = document.getElementById('fm-content');
  var breadcrumbEl = document.getElementById('fm-breadcrumb');
  if (!content) return;

  try {
    var d = await api('/api/admin/filemanager/list?path=' + encodeURIComponent(fmCurrentPath));
    if (!d.success) throw new Error(d.message);

    // Breadcrumb
    var bc = '<span onclick="fmNavigate(\'\')" ' + (!fmCurrentPath ? 'class="active"' : '') + '>/home</span>';
    var accumulated = '';
    if (d.breadcrumb && d.breadcrumb.length > 0) {
      d.breadcrumb.forEach(function(seg, i) {
        accumulated += (accumulated ? '/' : '') + seg;
        var isLast = i === d.breadcrumb.length - 1;
        bc += ' / <span onclick="fmNavigate(\'' + accumulated.replace(/'/g, "\\'") + '\')" ' + (isLast ? 'class="active"' : '') + '>' + escapeHtml(seg) + '</span>';
      });
    }
    if (breadcrumbEl) breadcrumbEl.innerHTML = bc;

    if (d.items.length === 0) {
      content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#9ca3af"><div style="font-size:48px;margin-bottom:12px">📂</div><p>This folder is empty</p></div>';
      return;
    }

    var listHtml = '<div style="display:flex;flex-direction:column;gap:6px">';
    d.items.forEach(function(item) {
      var size = item.isDirectory ? '-' : fmFormatSize(item.size);
      var mod = new Date(item.modified).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      listHtml += '<div class="fm-list-item" ondblclick="' + (item.isDirectory ? "fmNavigate('" + item.path.replace(/'/g, "\\'") + "')" : "fmOpenFile('" + item.path.replace(/'/g, "\\'") + "')") + '" onclick="fmSelect(this)" data-path="' + escapeHtml(item.path) + '" data-dir="' + item.isDirectory + '" data-name="' + escapeHtml(item.name) + '">'
        + '<div class="icon">' + fmIcon(item) + '</div>'
        + '<div class="info"><div class="fname">' + escapeHtml(item.name) + '</div><div class="fmeta">' + size + ' &middot; ' + mod + ' &middot; ' + item.permissions + '</div></div>'
        + '<div class="actions">'
        + (item.isDirectory ? '' : '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();fmOpenFile(\'' + item.path.replace(/'/g, "\\'") + '\')" title="Edit"><img src="https://img.icons8.com/?size=100&id=2025&format=png&color=000000" class="w-4 h-4"/></button>')
        + (item.isDirectory ? '' : '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();fmDownload(\'' + item.path.replace(/'/g, "\\'") + '\')" title="Download"><img src="https://img.icons8.com/?size=100&id=86327&format=png&color=000000" class="w-4 h-4"/></button>')
        + '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();fmRename(\'' + item.path.replace(/'/g, "\\'") + '\',\'' + escapeHtml(item.name).replace(/'/g, "\\'") + '\')" title="Rename"><img src="https://img.icons8.com/?size=100&id=1879&format=png&color=000000" class="w-4 h-4"/></button>'
        + '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();fmDelete(\'' + item.path.replace(/'/g, "\\'") + '\',\'' + escapeHtml(item.name).replace(/'/g, "\\'") + '\')" title="Delete"><img src="https://img.icons8.com/?size=100&id=85081&format=png&color=ffffff" class="w-4 h-4"/></button>'
        + '</div></div>';
    });
    listHtml += '</div>';

    listHtml += '<div class="fm-actions-bar"><span style="font-size:12px;color:#6b7280">' + d.totalItems + ' items &middot; ' + fmFormatSize(d.totalSize) + '</span></div>';

    content.innerHTML = listHtml;
  } catch (e) {
    content.innerHTML = '<div class="loading-state">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

function fmNavigate(p) {
  var newPath;
  if (p === '..') {
    var parts = fmCurrentPath.split('/').filter(Boolean);
    parts.pop();
    newPath = parts.join('/');
  } else {
    newPath = p;
  }
  fmLoadDir(newPath);
}

function fmRefresh() { fmLoadDir(fmCurrentPath); }

function fmSelect(el) {
  document.querySelectorAll('.fm-list-item').forEach(function(i) { i.classList.remove('selected'); });
  el.classList.add('selected');
}

function fmNewFolder() {
  var name = prompt('New folder name:');
  if (!name) return;
  var fullPath = fmCurrentPath ? fmCurrentPath + '/' + name : name;
  api('/api/admin/filemanager/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dirPath: fullPath }) })
    .then(function(d) { if (d.success) fmRefresh(); else alert(d.message); })
    .catch(function(e) { alert('Error: ' + e.message); });
}

function fmUpload() {
  document.getElementById('fm-file-input').click();
}

async function fmHandleUpload(files) {
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var reader = new FileReader();
    reader.onload = async function(e) {
      var content = e.target.result;
      var fullPath = fmCurrentPath ? fmCurrentPath + '/' + file.name : file.name;
      try {
        var d = await api('/api/admin/filemanager/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: fullPath, content: content }) });
        if (d.success) fmRefresh(); else alert(d.message);
      } catch (err) { alert('Upload error: ' + err.message); }
    };
    reader.readAsText(file);
  }
  document.getElementById('fm-file-input').value = '';
}

async function fmOpenFile(filePath) {
  try {
    var d = await api('/api/admin/filemanager/read?path=' + encodeURIComponent(filePath));
    if (!d.success) throw new Error(d.message);

    var name = filePath.split('/').pop();
    var isEditable = d.file && d.file.isEditable;

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h3 style="font-size:16px;font-weight:600">' + fmIcon(d.file) + ' ' + escapeHtml(name) + '</h3>'
      + '<div style="display:flex;gap:6px">'
      + (isEditable ? '<button class="btn btn-primary btn-sm" onclick="fmSaveFile(\'' + filePath.replace(/'/g, "\\'") + '\')">💾 Save</button>' : '')
      + '<button class="btn btn-outline btn-sm" onclick="fmDownload(\'' + filePath.replace(/'/g, "\\'") + '\')">⬇ Download</button>'
      + '<button class="btn btn-outline btn-sm" onclick="closeModal()">✕ Close</button>'
      + '</div></div>'
      + '<div style="font-size:11px;color:#9ca3af;margin-bottom:8px">' + fmFormatSize(d.file.size) + ' &middot; ' + d.file.permissions + '</div>';

    if (d.file.isImage) {
      html += '<div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px"><img src="/api/admin/filemanager/preview?path=' + encodeURIComponent(filePath) + '" style="max-width:100%;max-height:500px;border-radius:8px"></div>';
    } else if (isEditable) {
      html += '<textarea id="fm-editor" style="width:100%;height:500px;font-family:monospace;font-size:12px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#1e1e2e;color:#cdd6f4;resize:vertical" spellcheck="false">' + escapeHtml(d.content) + '</textarea>';
    } else {
      html += '<div style="background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;max-height:500px;overflow:auto">' + escapeHtml(d.content || 'Binary file — cannot display') + '</div>';
    }

    showModal(html);
  } catch (e) { alert('Error: ' + e.message); }
}

async function fmSaveFile(filePath) {
  var editor = document.getElementById('fm-editor');
  if (!editor) return;
  try {
    var d = await api('/api/admin/filemanager/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: filePath, content: editor.value }) });
    if (d.success) { alert('Saved!'); closeModal(); fmRefresh(); } else { alert(d.message); }
  } catch (e) { alert('Error: ' + e.message); }
}

function fmDownload(filePath) {
  window.open('/api/admin/filemanager/download?path=' + encodeURIComponent(filePath), '_blank');
}

async function fmRename(itemPath, currentName) {
  var newName = prompt('Rename:', currentName);
  if (!newName || newName === currentName) return;
  var dir = itemPath.split('/').slice(0, -1).join('/');
  var newPath = dir ? dir + '/' + newName : newName;
  try {
    var d = await api('/api/admin/filemanager/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath: itemPath, newPath: newPath }) });
    if (d.success) fmRefresh(); else alert(d.message);
  } catch (e) { alert('Error: ' + e.message); }
}

async function fmDelete(itemPath, itemName) {
  if (!confirm('Delete "' + itemName + '"?')) return;
  try {
    var d = await api('/api/admin/filemanager/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemPath: itemPath }) });
    if (d.success) fmRefresh(); else alert(d.message);
  } catch (e) { alert('Error: ' + e.message); }
}

// ============================================================
// TECH STACK
// ============================================================
var I8 = 'https://img.icons8.com/?size=100&format=png&color=';
var I8G = I8 + '000000';
function i8(id, sz, bg) { return '<img src="' + I8 + (sz||40) + '&id=' + id + '" style="width:' + (sz||24) + 'px;height:' + (sz||24) + 'px;' + (bg ? 'background:' + bg + ';border-radius:8px;padding:4px;' : '') + '">'; }

async function renderTechStack(el) {
  el.innerHTML = googleLoader('Loading tech stack info...');
  try {
    var d = await api('/api/admin/techstack/info');
    if (!d.success) throw new Error(d.message);
    var t = d.tech;

    function st(s) {
      if (s === 'active' || s === 'online') return '<span style="color:#16a34a;font-weight:600">Running</span>';
      if (s === 'inactive' || s === 'stopped') return '<span style="color:#ef4444;font-weight:600">Stopped</span>';
      return '<span style="color:#9ca3af">—</span>';
    }
    function stDot(s) {
      if (s === 'active' || s === 'online') return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px"></span>';
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px"></span>';
    }
    function vb(v) { return v ? '<span class="badge badge-info">' + escapeHtml(v) + '</span>' : ''; }
    function fb(b) {
      if (!b) return '0 B';
      var k = 1024, s = ['B','KB','MB','GB','TB'], i = Math.floor(Math.log(b) / Math.log(k));
      return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
    }
    function fu(sec) {
      var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
      if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm';
    }
    function memBar(pct) { return '<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#16a34a') + ';border-radius:3px"></div></div><span style="font-size:11px;color:#6b7280;min-width:36px">' + pct + '%</span></div>'; }

    // stat cards
    var totalMemUsed = t.os.totalMem - t.os.freeMem;
    var memPct = Math.round((totalMemUsed / t.os.totalMem) * 100);
    var cpuModel = t.os.cpus[0] ? t.os.cpus[0].model : '-';
    var loadPct = Math.min(100, Math.round((t.loadAvg[0] / t.os.cpus.length) * 100));

    var html = '<style>'
      + '.ts-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px}'
      + '.ts-card h3{font-size:13px;font-weight:600;margin:0 0 14px 0;display:flex;align-items:center;gap:8px;color:#374151}'
      + '.ts-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}'
      + '.ts-table{width:100%;border-collapse:collapse}'
      + '.ts-table td,.ts-table th{padding:8px 12px;text-align:left;font-size:12px;border-bottom:1px solid #f3f4f6}'
      + '.ts-table th{font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.5px}'
      + '.ts-label{color:#9ca3af;font-weight:500;width:130px}'
      + '.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}'
      + '</style>'

    // stat cards
    + '<div class="grid-stats">'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=86555&format=png&color=000000" class="w-5 h-5"/></div><div class="info"><h3>' + t.runtime.pm2.processes.length + '</h3><p>PM2 Processes</p></div></div>'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=LHf6nRR-WkA8&format=png&color=000000" class="w-5 h-5"/></div><div class="info"><h3>' + t.ports.length + '</h3><p>Open Ports</p></div></div>'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=FDSBxDkjEAwA&format=png&color=000000" class="w-5 h-5"/></div><div class="info"><h3>' + (t.project.dependencies ? t.project.dependencies.length : 0) + '</h3><p>Dependencies</p></div></div>'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=NFYds2BcW2wL&format=png&color=000000" class="w-5 h-5"/></div><div class="info"><h3>' + t.services.length + '</h3><p>System Services</p></div></div>'
    + '</div>'

    // OS
    + '<div class="ts-row"><div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=NFYds2BcW2wL&format=png&color=000000" class="w-5 h-5"/> Operating System</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Distro</td><td><b>' + escapeHtml(t.os.distroPretty || t.os.distro) + '</b></td></tr>'
      + (t.os.codename ? '<tr><td class="ts-label">Codename</td><td>' + escapeHtml(t.os.codename) + '</td></tr>' : '')
      + '<tr><td class="ts-label">Kernel</td><td>' + escapeHtml(t.os.kernel) + '</td></tr>'
      + '<tr><td class="ts-label">Architecture</td><td>' + t.os.arch + '</td></tr>'
      + '<tr><td class="ts-label">Hostname</td><td>' + escapeHtml(t.os.hostname) + '</td></tr>'
      + '</tbody></table></div>'

    // CPU & Memory
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=1938&format=png&color=000000" class="w-5 h-5"/> Hardware</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">CPU</td><td>' + escapeHtml(cpuModel) + '</td></tr>'
      + '<tr><td class="ts-label">CPU Cores</td><td>' + t.os.cpus.length + ' cores</td></tr>'
      + '<tr><td class="ts-label">Load Average</td><td>' + t.loadAvg.map(function(l){return l.toFixed(2)}).join(' / ') + ' (' + loadPct + '%)</td></tr>'
      + '<tr><td class="ts-label">RAM Total</td><td>' + fb(t.os.totalMem) + '</td></tr>'
      + '<tr><td class="ts-label">RAM Used</td><td>' + fb(totalMemUsed) + '</td></tr>'
      + '<tr><td class="ts-label">RAM Usage</td><td>' + memBar(memPct) + '</td></tr>'
      + '<tr><td class="ts-label">Disk</td><td>' + (t.disk ? t.disk.used + ' / ' + t.disk.size + ' (' + t.disk.pct + ' used) on ' + t.disk.mount : '—') + '</td></tr>'
      + '<tr><td class="ts-label">System Uptime</td><td>' + fu(t.os.uptime) + '</td></tr>'
      + '</tbody></table></div>'
    + '</div>'

    // Runtime
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=4gOotjPlaXAY&format=png&color=000000" class="w-5 h-5"/> Runtime Environment</h3>'
      + '<div class="ts-grid">'
      + '<div style="padding:12px;background:#f9fafb;border-radius:8px"><div style="font-size:11px;color:#9ca3af;margin-bottom:4px">Node.js</div><div style="display:flex;align-items:center;gap:6px"><img src="https://img.icons8.com/?size=100&id=t9oCxEN7McHZ&format=png&color=000000" class="w-5 h-5"/> <b>' + escapeHtml(t.runtime.node.version) + '</b>' + stDot('active') + '</div></div>'
      + '<div style="padding:12px;background:#f9fafb;border-radius:8px"><div style="font-size:11px;color:#9ca3af;margin-bottom:4px">npm</div><div style="display:flex;align-items:center;gap:6px"><img src="https://img.icons8.com/?size=100&id=QERhMe8qpblP&format=png&color=000000" class="w-5 h-5"/> <b>' + escapeHtml(t.runtime.npm.version) + '</b></div></div>'
      + '<div style="padding:12px;background:#f9fafb;border-radius:8px"><div style="font-size:11px;color:#9ca3af;margin-bottom:4px">PM2</div><div style="display:flex;align-items:center;gap:6px"><img src="https://img.icons8.com/?size=100&id=86555&format=png&color=000000" class="w-5 h-5"/> <b>' + escapeHtml(t.runtime.pm2.version) + '</b>' + stDot('active') + '</div></div>'
      + (t.runtime.gcc ? '<div style="padding:12px;background:#f9fafb;border-radius:8px"><div style="font-size:11px;color:#9ca3af;margin-bottom:4px">GCC</div><div style="display:flex;align-items:center;gap:6px"><img src="https://img.icons8.com/?size=100&id=2557&format=png&color=000000" class="w-5 h-5"/> <b>' + escapeHtml(t.runtime.gcc.version.replace(/GCC\)?\s*/, '')) + '</b></div></div>' : '')
      + (t.runtime.python ? '<div style="padding:12px;background:#f9fafb;border-radius:8px"><div style="font-size:11px;color:#9ca3af;margin-bottom:4px">Python</div><div style="display:flex;align-items:center;gap:6px"><img src="https://img.icons8.com/?size=100&id=12584&format=png&color=000000" class="w-5 h-5"/> <b>' + escapeHtml(t.runtime.python.version) + '</b></div></div>' : '')
      + '</div></div>'

    // Web Server
    + '<div class="ts-row"><div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=1340&format=png&color=000000" class="w-5 h-5"/> Web Server & Tunnel</h3>'
      + '<table class="ts-table"><thead><tr><th>Service</th><th>Version</th><th>Status</th><th>PID</th></tr></thead><tbody>'
      + '<tr><td><b>Nginx</b></td><td>' + vb(t.web.nginx.version) + '</td><td>' + st(t.web.nginx.status) + '</td><td>' + (t.web.nginx.pid || '—') + '</td></tr>'
      + '<tr><td>Nginx Workers</td><td colspan="3">' + t.web.nginx.workers + ' worker process(es)</td></tr>'
      + '<tr><td><b>Cloudflare Tunnel</b></td><td>' + vb(t.web.cloudflared.version) + '</td><td>' + st(t.web.cloudflared.status) + '</td><td>' + (t.web.cloudflared.pid || '—') + '</td></tr>'
      + '</tbody></table></div>'

    // Database
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=1476&format=png&color=000000" class="w-5 h-5"/> Database & Cache</h3>'
      + '<table class="ts-table"><thead><tr><th>Service</th><th>Version</th><th>Status</th></tr></thead><tbody>'
      + '<tr><td><b>MySQL / MariaDB</b></td><td>' + vb(t.database.mysql.version) + '</td><td>' + st(t.database.mysql.status) + '</td></tr>'
      + '<tr><td><b>Redis</b></td><td>' + (t.database.redis ? vb(t.database.redis.version) : '<span style="color:#9ca3af">Not available</span>') + '</td><td>' + (t.database.redis ? st(t.database.redis.status) : '—') + '</td></tr>'
      + '</tbody></table></div>'
    + '</div>'

    // Docker
    + (t.docker ? '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=22797&format=png&color=000000" class="w-5 h-5"/> Docker</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Version</td><td>' + vb(t.docker.version) + '</td></tr>'
      + '<tr><td class="ts-label">Status</td><td>' + st(t.docker.status) + '</td></tr>'
      + (t.docker.composeVersion ? '<tr><td class="ts-label">Compose</td><td>' + vb(t.docker.composeVersion) + '</td></tr>' : '')
      + '</tbody></table>'
      + (t.docker.containers.length > 0 ? '<div style="margin-top:12px"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Containers (' + t.docker.containers.length + ')</div><table class="ts-table"><thead><tr><th>Name</th><th>Image</th><th>Status</th></tr></thead><tbody>'
        + t.docker.containers.map(function(c) { return '<tr><td><b>' + escapeHtml(c.name) + '</b></td><td style="font-size:11px">' + escapeHtml(c.image) + '</td><td>' + escapeHtml(c.status) + '</td></tr>'; }).join('')
        + '</tbody></table></div>' : '')
      + (t.docker.images.length > 0 ? '<div style="margin-top:12px"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Images (' + t.docker.images.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:4px">'
        + t.docker.images.map(function(i) { return '<span class="badge badge-info" style="font-size:10px">' + escapeHtml(i.repo) + ' (' + escapeHtml(i.size) + ')</span>'; }).join('')
        + '</div></div>' : '')
      + '</div>' : '')

    // PM2 Processes
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=86555&format=png&color=000000" class="w-5 h-5"/> PM2 Processes</h3>'
      + '<div style="overflow-x:auto"><table class="ts-table"><thead><tr><th>Name</th><th>PID</th><th>Status</th><th>CPU</th><th>Memory</th><th>Restarts</th><th>Uptime</th></tr></thead><tbody>'
      + t.runtime.pm2.processes.map(function(p) {
        return '<tr><td><b>' + escapeHtml(p.name) + '</b></td><td>' + p.pid + '</td><td>' + stDot(p.status) + st(p.status) + '</td><td>' + (p.cpu || 0) + '%</td><td>' + fb(p.memory || 0) + '</td><td>' + (p.restarts || 0) + '</td><td>' + fu((Date.now() - (p.uptime || 0)) / 1000) + '</td></tr>';
      }).join('')
      + '</tbody></table></div></div>'

    // Git
    + (t.git.version ? '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=21889&format=png&color=000000" class="w-5 h-5"/> Version Control</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Git Version</td><td>' + vb(t.git.version) + '</td></tr>'
      + (t.git.branch ? '<tr><td class="ts-label">Branch</td><td><span class="badge badge-info">' + escapeHtml(t.git.branch) + '</span></td></tr>' : '')
      + (t.git.remote ? '<tr><td class="ts-label">Remote</td><td style="font-size:11px;word-break:break-all">' + escapeHtml(t.git.remote) + '</td></tr>' : '')
      + (t.git.lastHash ? '<tr><td class="ts-label">Last Commit</td><td><span class="badge" style="background:#f3f4f6;font-family:monospace">' + escapeHtml(t.git.lastHash) + '</span> ' + escapeHtml(t.git.lastMessage || '') + '</td></tr>' : '')
      + (t.git.lastTime ? '<tr><td class="ts-label">Commit Time</td><td>' + escapeHtml(t.git.lastTime) + '</td></tr>' : '')
      + '</tbody></table></div>' : '')

    // Network
    + '<div class="ts-row"><div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=97937&format=png&color=000000" class="w-5 h-5"/> Network</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Public IP</td><td style="font-family:monospace">' + (t.network.publicIp || '—') + '</td></tr>'
      + '<tr><td class="ts-label">Private IP</td><td style="font-family:monospace">' + (t.network.privateIp || '—') + '</td></tr>'
      + '<tr><td class="ts-label">Open Ports</td><td>' + t.ports.length + ' ports</td></tr>'
      + '</tbody></table></div>'

    // System Services
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=NFYds2BcW2wL&format=png&color=000000" class="w-5 h-5"/> System Services</h3>'
      + '<table class="ts-table"><thead><tr><th>Service</th><th>Status</th></tr></thead><tbody>'
      + t.services.map(function(s) { return '<tr><td><b>' + escapeHtml(s.name) + '</b></td><td>' + stDot(s.status) + st(s.status) + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
    + '</div>'

    // Open Ports Detail
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=LHf6nRR-WkA8&format=png&color=000000" class="w-5 h-5"/> Open Ports (' + t.ports.length + ')</h3>'
      + '<div style="overflow-x:auto"><table class="ts-table"><thead><tr><th>Port</th><th>Process</th><th>Address</th></tr></thead><tbody>'
      + t.ports.map(function(p) { return '<tr><td><span class="badge badge-info" style="font-family:monospace">' + escapeHtml(p.port) + '</span></td><td>' + escapeHtml(p.process) + '</td><td style="font-size:11px;color:#9ca3af">' + escapeHtml(p.addr) + '</td></tr>'; }).join('')
      + '</tbody></table></div></div>'

    // Backend Dependencies
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=2778&format=png&color=000000" class="w-5 h-5"/> Backend Dependencies (' + (t.project.dependencies ? t.project.dependencies.length : 0) + ')</h3>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
      + (t.project.dependencies || []).map(function(dep) { return '<span class="badge badge-info" style="font-size:11px" title="' + escapeHtml(dep.version) + '">' + escapeHtml(dep.name) + ' ' + vb(dep.version) + '</span>'; }).join('')
      + '</div>'
      + (t.project.devDependencies && t.project.devDependencies.length > 0 ? '<div style="margin-top:12px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Dev Dependencies</div><div style="display:flex;flex-wrap:wrap;gap:4px">'
        + t.project.devDependencies.map(function(dep) { return '<span class="badge" style="background:#fef3c7;color:#92400e;font-size:11px" title="' + escapeHtml(dep.version) + '">' + escapeHtml(dep.name) + ' ' + vb(dep.version) + '</span>'; }).join('')
        + '</div>' : '')
      + '</div>'

    // Frontend
    + '<div class="ts-card"><h3><img src="https://img.icons8.com/?size=100&id=2778&format=png&color=000000" class="w-5 h-5"/> Frontend Stack</h3>'
      + '<div class="ts-grid">'
      + (t.frontendTech || []).map(function(f) {
        return '<div style="padding:12px;background:#f9fafb;border-radius:8px;display:flex;align-items:center;gap:8px"><img src="https://img.icons8.com/?size=100&id=184&format=png&color=000000" class="w-5 h-5"/><div><div style="font-size:12px;font-weight:600">' + escapeHtml(f.name) + '</div><div style="font-size:11px;color:#9ca3af">' + escapeHtml(f.version) + '</div></div></div>';
      }).join('')
      + '</div></div>';

    el.innerHTML = html;

  } catch (e) {
    el.innerHTML = '<div class="loading-state">Error loading tech stack: ' + escapeHtml(e.message) + '</div>';
  }
}

// ============================================================
// SECURITY
// ============================================================
var secTab = 'overview';

async function renderSecurity(el) {
  secTab = 'overview';
  el.innerHTML = googleLoader('Loading security data...');
  await loadSecurityData(el);
}

async function loadSecurityData(el) {
  el = el || document.getElementById('page-content');
  try {
    var d = await api('/api/admin/security/overview');
    var fw = await api('/api/admin/security/firewall');
    var audit = await api('/api/admin/security/audit');

    var s = d.security;
    var f = fw.firewall;
    var a = audit.audit;

    function stDot(v) { return v > 0 ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px"></span>' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px"></span>'; }
    function severityBadge(sev) {
      var colors = { critical: '#dc2626', high: '#f59e0b', medium: '#3b82f6', low: '#16a34a', info: '#6b7280', ok: '#16a34a' };
      var bgs = { critical: '#fef2f2', high: '#fffbeb', medium: '#eff6ff', low: '#f0fdf4', info: '#f9fafb', ok: '#f0fdf4' };
      return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:' + (bgs[sev] || '#f9fafb') + ';color:' + (colors[sev] || '#6b7280') + '">' + sev.toUpperCase() + '</span>';
    }
    function fwStatusBadge(name, active) {
      if (active) return '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#f0fdf4;color:#16a34a;font-weight:600;font-size:12px"><span style="width:6px;height:6px;border-radius:50%;background:#16a34a"></span>' + name + '</span>';
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#fef2f2;color:#ef4444;font-weight:600;font-size:12px"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444"></span>' + name + '</span>';
    }

    // Threat level
    var threatLevel = 'low';
    var threatColor = '#16a34a';
    if (s.summary.activeThreats > 5) { threatLevel = 'critical'; threatColor = '#dc2626'; }
    else if (s.summary.activeThreats > 2) { threatLevel = 'high'; threatColor = '#f59e0b'; }
    else if (s.summary.activeThreats > 0) { threatLevel = 'medium'; threatColor = '#3b82f6'; }

    var html = ''
    // Tabs
    + '<div class="sec-tabs">'
      + '<button class="sec-tab active" onclick="secTabNav(\'overview\')">Overview</button>'
      + '<button class="sec-tab" onclick="secTabNav(\'firewall\')">Firewall</button>'
      + '<button class="sec-tab" onclick="secTabNav(\'audit\')">Audit</button>'
      + '<button class="sec-tab" onclick="secTabNav(\'ips\')">IP Manager</button>'
    + '</div>'

    // Stats
    + '<div class="grid-stats">'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=5395&format=png&color=000000' + threatColor.replace('#', '') + '"></div><div class="info"><h3 style="color:' + threatColor + '">' + s.summary.activeThreats + '</h3><p>Active Threats</p></div></div>'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=UG2MhGXFb2lU&format=png&color=000000"></div><div class="info"><h3>' + s.summary.uniqueIPs + '</h3><p>Unique IPs (1h)</p></div></div>'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=360&format=png&color=000000"></div><div class="info"><h3>' + s.summary.serverErrors + '</h3><p>Server Errors (1h)</p></div></div>'
      + '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=9d5dttldp4Gw&format=png&color=000000"></div><div class="info"><h3>' + a.percentage + '%</h3><p>Security Score</p></div></div>'
    + '</div>'

    // Top Threat IPs
    + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=UG2MhGXFb2lU&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Top Requesting IPs (Last Hour)</h3>'
      + '<div style="overflow-x:auto"><table class="sec-table"><thead><tr><th>IP</th><th>Requests</th><th>Errors</th><th>Auth Fails</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
      + s.topIPs.slice(0, 10).map(function(ip) {
        var isAttack = ip.requests > 100;
        var rowBg = isAttack ? 'background:#fef2f2' : '';
        return '<tr style="' + rowBg + '"><td style="font-family:monospace;font-size:11px">' + escapeHtml(ip.ip) + '</td><td><b>' + ip.requests + '</b></td><td>' + ip.errors + '</td><td>' + ip.auth_fails + '</td><td>' + (isAttack ? severityBadge('high') : '<span style="color:#16a34a">Normal</span>') + '</td><td><button class="btn btn-danger btn-sm" onclick="secBlockIP(\'' + escapeHtml(ip.ip) + '\')">Block</button></td></tr>';
      }).join('')
      + '</tbody></table></div></div>'

    // Auth failures
    + (s.authFails.length > 0 ? '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=gG56a9BktaPn&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Failed Auth Attempts (' + s.authFails.length + ')</h3>'
      + '<div style="overflow-x:auto"><table class="sec-table"><thead><tr><th>IP</th><th>URL</th><th>Attempts</th><th>Action</th></tr></thead><tbody>'
      + s.authFails.slice(0, 10).map(function(f) {
        return '<tr><td style="font-family:monospace;font-size:11px">' + escapeHtml(f.ip) + '</td><td style="font-size:11px">' + escapeHtml(f.url) + '</td><td><b>' + f.attempts + '</b></td><td><button class="btn btn-danger btn-sm" onclick="secBlockIP(\'' + escapeHtml(f.ip) + '\')">Block</button></td></tr>';
      }).join('')
      + '</tbody></table></div></div>' : '')

    // Bot traffic
    + (s.botTraffic.length > 0 ? '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=100414&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Bot Traffic (' + s.botTraffic.length + ')</h3>'
      + '<div style="overflow-x:auto"><table class="sec-table"><thead><tr><th>IP</th><th>User Agent</th><th>Hits</th></tr></thead><tbody>'
      + s.botTraffic.slice(0, 5).map(function(b) {
        return '<tr><td style="font-family:monospace;font-size:11px">' + escapeHtml(b.ip) + '</td><td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(b.user_agent) + '</td><td>' + b.hits + '</td></tr>';
      }).join('')
      + '</tbody></table></div></div>' : '')

    // Error endpoints
    + (s.errorEndpoints.length > 0 ? '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=360&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Error Endpoints</h3>'
      + '<div style="overflow-x:auto"><table class="sec-table"><thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Hits</th></tr></thead><tbody>'
      + s.errorEndpoints.slice(0, 10).map(function(e) {
        var sc = e.status_code >= 500 ? 'color:#dc2626' : e.status_code >= 400 ? 'color:#f59e0b' : '';
        return '<tr><td><span class="badge badge-info">' + escapeHtml(e.method) + '</span></td><td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(e.url) + '</td><td style="' + sc + ';font-weight:600">' + e.status_code + '</td><td>' + e.hits + '</td></tr>';
      }).join('')
      + '</tbody></table></div></div>' : '')

    // Firewall section
    + '<div class="sec-row"><div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=854&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Firewall Status</h3>'
      + '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">'
      + fwStatusBadge('UFW', f.ufw?.active)
      + fwStatusBadge('fail2ban', f.fail2ban?.running)
      + fwStatusBadge('iptables', f.iptables?.installed)
      + '</div>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Active Firewall</td><td><b>' + escapeHtml(f.activeFirewall) + '</b></td></tr>'
      + '<tr><td class="ts-label">Exposed Ports</td><td>' + f.exposedPorts.length + ' ports</td></tr>'
      + '</tbody></table>'
      + '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">'
      + (f.ufw?.installed ? (f.ufw?.active ? '<button class="btn btn-danger btn-sm" onclick="secUfwAction(\'disable\')">Disable UFW</button>' : '<button class="btn btn-success btn-sm" onclick="secUfwAction(\'enable\')">Enable UFW</button>') : '<button class="btn btn-primary btn-sm" onclick="secUfwInstall()">Install UFW</button>')
      + (f.fail2ban?.running ? '<button class="btn btn-danger btn-sm" onclick="secFail2banAction(\'stop\')">Stop fail2ban</button>' : '<button class="btn btn-success btn-sm" onclick="secFail2banAction(\'start\')">Start fail2ban</button>')
      + '</div></div>'

    // Recommendations
    + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=pbJlhc5p4utx&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Security Recommendations</h3>'
      + f.recommendations.map(function(r) {
        return '<div style="display:flex;align-items:start;gap:8px;padding:8px 12px;border-radius:8px;margin-bottom:6px;background:' + (r.level === 'critical' ? '#fef2f2' : r.level === 'warning' ? '#fffbeb' : r.level === 'ok' ? '#f0fdf4' : '#f9fafb') + '">' + severityBadge(r.level) + '<span style="font-size:12px;color:#374151">' + escapeHtml(r.message) + '</span></div>';
      }).join('')
      + '</div></div>'

    // Security Audit
    + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=pbJlhc5p4utx&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Security Audit (' + a.score + '/' + a.total + ' passed)</h3>'
      + '<div style="margin-bottom:14px"><div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden"><div style="height:100%;width:' + a.percentage + '%;background:' + (a.percentage >= 80 ? '#16a34a' : a.percentage >= 50 ? '#f59e0b' : '#ef4444') + ';border-radius:4px"></div></div><div style="text-align:right;font-size:11px;color:#9ca3af;margin-top:4px">' + a.percentage + '% score</div></div>'
      + '<table class="sec-table"><thead><tr><th>Check</th><th>Value</th><th>Result</th></tr></thead><tbody>'
      + a.checks.map(function(c) {
        return '<tr><td style="font-weight:500">' + escapeHtml(c.name) + '</td><td style="font-size:11px">' + escapeHtml(String(c.value)) + '</td><td>' + (c.pass ? '<span style="color:#16a34a;font-weight:600">PASS</span>' : severityBadge(c.severity)) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="loading-state">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

function secTabNav(tab) {
  secTab = tab;
  var el = document.getElementById('page-content');
  // Rebuild tabs and highlight active
  var tabsHtml = '<div class="sec-tabs">'
    + '<button class="sec-tab' + (tab === 'overview' ? ' active' : '') + '" onclick="secTabNav(\'overview\')">Overview</button>'
    + '<button class="sec-tab' + (tab === 'firewall' ? ' active' : '') + '" onclick="secTabNav(\'firewall\')">Firewall</button>'
    + '<button class="sec-tab' + (tab === 'audit' ? ' active' : '') + '" onclick="secTabNav(\'audit\')">Audit</button>'
    + '<button class="sec-tab' + (tab === 'ips' ? ' active' : '') + '" onclick="secTabNav(\'ips\')">IP Manager</button>'
    + '</div>';
  el.innerHTML = tabsHtml + googleLoaderSmall('Loading ' + tab + '...');
  if (tab === 'firewall') secLoadFirewall(tabsHtml);
  else if (tab === 'audit') secLoadAudit(tabsHtml);
  else if (tab === 'ips') secLoadIPs(tabsHtml);
  else loadSecurityData();
}

async function secLoadFirewall(tabsHtml) {
  var el = document.getElementById('page-content');
  try {
    var fw = await api('/api/admin/security/firewall');
    var f = fw.firewall;
    el.innerHTML = tabsHtml
      + '<div class="sec-row"><div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=bfwHrORtPSpB&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;">UFW</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Installed</td><td>' + (f.ufw?.installed ? '<span style="color:#16a34a">Yes</span>' : '<span style="color:#ef4444">No</span>') + '</td></tr>'
      + '<tr><td class="ts-label">Status</td><td>' + (f.ufw?.active ? '<span style="color:#16a34a;font-weight:600">Active</span>' : '<span style="color:#ef4444">Inactive</span>') + '</td></tr>'
      + (f.ufw ? '<tr><td class="ts-label">Default In</td><td>' + f.ufw.defaultIncoming + '</td></tr>'
        + '<tr><td class="ts-label">Default Out</td><td>' + f.ufw.defaultOutgoing + '</td></tr>'
        + '<tr><td class="ts-label">Logging</td><td>' + f.ufw.logging + '</td></tr>' : '')
      + '</tbody></table>'
      + '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">'
      + (f.ufw?.installed ? (f.ufw?.active ? '<button class="btn btn-danger btn-sm" onclick="secUfwAction(\'disable\')">Disable</button>' : '<button class="btn btn-success btn-sm" onclick="secUfwAction(\'enable\')">Enable</button>') : '<button class="btn btn-primary btn-sm" onclick="secUfwInstall()">Install UFW</button>')
      + '<button class="btn btn-outline btn-sm" onclick="secUfwAllow()">Allow Port</button>'
      + '<button class="btn btn-outline btn-sm" onclick="secUfwDeny()">Deny Port</button>'
      + '<button class="btn btn-outline btn-sm" onclick="secUfwReset()">Reset</button>'
      + '</div></div>'

      + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=BcH5aPHPXJ5Z&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> fail2ban</h3>'
      + '<table class="ts-table"><tbody>'
      + '<tr><td class="ts-label">Installed</td><td>' + (f.fail2ban?.installed ? '<span style="color:#16a34a">Yes</span>' : '<span style="color:#ef4444">No</span>') + '</td></tr>'
      + '<tr><td class="ts-label">Running</td><td>' + (f.fail2ban?.running ? '<span style="color:#16a34a;font-weight:600">Active</span>' : '<span style="color:#ef4444">Inactive</span>') + '</td></tr>'
      + '</tbody></table>'
      + '<div style="margin-top:12px;display:flex;gap:6px">'
      + (f.fail2ban?.running ? '<button class="btn btn-danger btn-sm" onclick="secFail2banAction(\'stop\')">Stop</button>' : '<button class="btn btn-success btn-sm" onclick="secFail2banAction(\'start\')">Start</button>')
      + '</div>'
      + (f.fail2ban?.jails && f.fail2ban.jails.length > 0 ? '<div style="margin-top:14px"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Jails</div>'
        + '<table class="sec-table"><thead><tr><th>Jail</th><th>Banned</th><th>Total Banned</th><th>Failed</th></tr></thead><tbody>'
        + f.fail2ban.jails.map(function(j) { return '<tr><td><b>' + escapeHtml(j.name) + '</b></td><td>' + j.currentlyBanned + '</td><td>' + j.totalBanned + '</td><td>' + j.currentlyFailed + '</td></tr>'; }).join('')
        + '</tbody></table></div>' : '')
      + '</div></div>'

      + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=UG2MhGXFb2lU&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> iptables Rules</h3>'
      + '<div style="font-size:12px;color:#6b7280;margin-bottom:8px">' + f.iptables.rulesCount + ' rules</div>'
      + '<div style="max-height:300px;overflow-y:auto;background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:8px;font-family:monospace;font-size:11px;white-space:pre-wrap">'
      + escapeHtml(f.iptables.rules.join('\n') || 'No rules found')
      + '</div></div>'

      + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=ZAI96hDdbkWP&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Exposed Ports (' + f.exposedPorts.length + ')</h3>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
      + f.exposedPorts.map(function(p) { return '<span class="badge" style="background:#fef2f2;color:#dc2626;font-size:11px">' + escapeHtml(p.substring(0, 60)) + '</span>'; }).join('')
      + '</div></div>'

      + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=u8MTpAq972MG&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Recommendations</h3>'
      + f.recommendations.map(function(r) {
        return '<div style="display:flex;align-items:start;gap:8px;padding:8px 12px;border-radius:8px;margin-bottom:6px;background:' + (r.level === 'critical' ? '#fef2f2' : r.level === 'warning' ? '#fffbeb' : r.level === 'ok' ? '#f0fdf4' : '#f9fafb') + '">' + severityBadge(r.level) + '<span style="font-size:12px;color:#374151">' + escapeHtml(r.message) + '</span></div>';
      }).join('')
      + '</div>';
  } catch (e) { el.innerHTML = '<div class="loading-state">Error: ' + escapeHtml(e.message) + '</div>'; }
}

async function secLoadAudit(tabsHtml) {
  var el = document.getElementById('page-content');
  try {
    var audit = await api('/api/admin/security/audit');
    var a = audit.audit;
    el.innerHTML = tabsHtml
      + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=pbJlhc5p4utx&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Security Audit (' + a.score + '/' + a.total + ' checks passed)</h3>'
      + '<div style="margin-bottom:16px"><div style="height:10px;background:#f3f4f6;border-radius:5px;overflow:hidden"><div style="height:100%;width:' + a.percentage + '%;background:' + (a.percentage >= 80 ? '#16a34a' : a.percentage >= 50 ? '#f59e0b' : '#ef4444') + ';border-radius:5px;transition:width .5s"></div></div><div style="text-align:center;font-size:18px;font-weight:700;margin-top:8px;color:' + (a.percentage >= 80 ? '#16a34a' : a.percentage >= 50 ? '#f59e0b' : '#ef4444') + '">' + a.percentage + '%</div></div>'
      + '<table class="sec-table"><thead><tr><th>Security Check</th><th>Current Value</th><th>Result</th></tr></thead><tbody>'
      + a.checks.map(function(c) {
        return '<tr><td style="font-weight:500">' + escapeHtml(c.name) + '</td><td style="font-size:12px;font-family:monospace">' + escapeHtml(String(c.value)) + '</td><td>' + (c.pass ? '<span style="color:#16a34a;font-weight:600">PASS</span>' : severityBadge(c.severity)) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
  } catch (e) { el.innerHTML = '<div class="loading-state">Error: ' + escapeHtml(e.message) + '</div>'; }
}

async function secLoadIPs(tabsHtml) {
  var el = document.getElementById('page-content');
  try {
    var blocked = await api('/api/admin/security/blocked-ips');
    var b = blocked.blocked || [];
    el.innerHTML = tabsHtml
      + '<div class="sec-card"><h3><img src="https://img.icons8.com/?size=100&id=pbJlhc5p4utx&format=png&color=000000" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px;"> Blocked IPs (' + b.length + ')</h3>'
      + '<div style="margin-bottom:12px;display:flex;gap:6px"><input id="sec-block-ip" type="text" placeholder="IP address to block" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;width:200px"><button class="btn btn-danger btn-sm" onclick="secBlockIP(document.getElementById(\'sec-block-ip\').value)">Block IP</button></div>'
      + (b.length > 0 ? '<div style="overflow-x:auto"><table class="sec-table"><thead><tr><th>IP</th><th>Action</th></tr></thead><tbody>'
        + b.map(function(item) {
          return '<tr><td style="font-family:monospace;font-size:12px">' + escapeHtml(item.ip) + '</td><td><button class="btn btn-outline btn-sm" onclick="secUnblockIP(\'' + escapeHtml(item.ip) + '\')">Unblock</button></td></tr>';
        }).join('')
        + '</tbody></table></div>'
        : '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">No blocked IPs</div>')
      + '</div>';
  } catch (e) { el.innerHTML = '<div class="loading-state">Error: ' + escapeHtml(e.message) + '</div>'; }
}

function severityBadge(sev) {
  var colors = { critical: '#dc2626', high: '#f59e0b', medium: '#3b82f6', low: '#16a34a', info: '#6b7280', ok: '#16a34a' };
  var bgs = { critical: '#fef2f2', high: '#fffbeb', medium: '#eff6ff', low: '#f0fdf4', info: '#f9fafb', ok: '#f0fdf4' };
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:' + (bgs[sev] || '#f9fafb') + ';color:' + (colors[sev] || '#6b7280') + '">' + (sev || '').toUpperCase() + '</span>';
}

async function secBlockIP(ip) {
  if (!ip) return;
  if (!confirm('Block IP ' + ip + '?')) return;
  try {
    var d = await api('/api/admin/security/block-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) });
    alert(d.message);
    if (secTab === 'ips') secLoadIPs();
  } catch (e) { alert('Error: ' + e.message); }
}

async function secUnblockIP(ip) {
  if (!confirm('Unblock IP ' + ip + '?')) return;
  try {
    var d = await api('/api/admin/security/unblock-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) });
    alert(d.message);
    secLoadIPs();
  } catch (e) { alert('Error: ' + e.message); }
}

async function secUfwAction(action) {
  if (!confirm(action === 'enable' ? 'Enable UFW firewall?' : 'Disable UFW firewall?')) return;
  try {
    var d = await api('/api/admin/security/firewall/ufw/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    alert(d.message);
    secLoadFirewall();
  } catch (e) { alert('Error: ' + e.message); }
}

async function secUfwInstall() {
  if (!confirm('Install UFW?')) return;
  try {
    var d = await api('/api/admin/security/firewall/install-ufw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    alert(d.message);
    secLoadFirewall();
  } catch (e) { alert('Error: ' + e.message); }
}

function secUfwAllow() {
  var port = prompt('Port to allow (e.g. 80 or 443):');
  if (!port) return;
  var proto = prompt('Protocol (tcp/udp):', 'tcp') || 'tcp';
  api('/api/admin/security/firewall/ufw/allow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: port, proto: proto }) })
    .then(function(d) { alert(d.message); secLoadFirewall(); });
}

function secUfwDeny() {
  var port = prompt('Port to deny:');
  if (!port) return;
  var proto = prompt('Protocol (tcp/udp):', 'tcp') || 'tcp';
  api('/api/admin/security/firewall/ufw/deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: port, proto: proto }) })
    .then(function(d) { alert(d.message); secLoadFirewall(); });
}

async function secUfwReset() {
  if (!confirm('Reset UFW to defaults? All rules will be removed.')) return;
  try {
    var d = await api('/api/admin/security/firewall/ufw/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    alert(d.message);
    secLoadFirewall();
  } catch (e) { alert('Error: ' + e.message); }
}

async function secFail2banAction(action) {
  if (!confirm(action === 'start' ? 'Start fail2ban?' : 'Stop fail2ban?')) return;
  try {
    var d = await api('/api/admin/security/fail2ban/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    alert(d.message);
    secLoadFirewall();
  } catch (e) { alert('Error: ' + e.message); }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function googleLoader(msg) {
  return '<div style="text-align:center;padding:60px 0;color:#9ca3af;font-size:14px"><svg width="40" height="40" viewBox="0 0 40 40" style="display:block;margin:0 auto 14px;animation:google-spin .8s linear infinite"><circle cx="20" cy="20" r="16" fill="none" stroke="#e5e7eb" stroke-width="4"/><circle cx="20" cy="20" r="16" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round" stroke-dasharray="75 25" transform="rotate(-90 20 20)"/></svg>' + (msg || 'Loading...') + '</div>';
}

function googleLoaderSmall(msg) {
  return '<div style="text-align:center;padding:40px 0;color:#9ca3af"><svg width="28" height="28" viewBox="0 0 28 28" style="display:block;margin:0 auto 10px;animation:google-spin .8s linear infinite"><circle cx="14" cy="14" r="11" fill="none" stroke="#e5e7eb" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-dasharray="52 14" transform="rotate(-90 14 14)"/></svg>' + (msg || 'Loading...') + '</div>';
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return 'N/A';
  var d = Math.floor(seconds / 86400);
  var h = Math.floor((seconds % 86400) / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
