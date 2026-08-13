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

function escapeHtml(s) {
  if (typeof s !== 'string') return s || '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatRp(n) {
  return 'Rp ' + parseInt(n || 0).toLocaleString('id-ID');
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
    body: opts.body || undefined
  });
  return res.json();
}

function closeModal() {
  destroyAdminMaps();
  document.getElementById('modal').classList.remove('show');
}

function showModal(html) {
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
  notifications: 'Platform', whatsapp: 'Platform', npinjam: 'Platform', settings: 'Platform'
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
  var map = { dashboard: 'summary', orders: 'transactions', northpay: 'transactions', affiliate: 'transactions', 'seller-earnings': 'transactions', reports: 'transactions', products: 'products', reviews: 'products', sellers: 'products', users: 'customers', chat: 'customers', notifications: 'platform', whatsapp: 'platform', npinjam: 'platform', settings: 'platform' };
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
    const me = await api('/api/auth/me');
    if (!me.success || !me.user) { window.location.href = '/AppNorthAuth'; return; }
    const roleCheck = await api('/api/admin/dashboard');
    if (!roleCheck.success) { window.location.href = '/AppNorthAuth'; return; }
    adminUser = me.user;
    document.getElementById('admin-name').textContent = me.user.name || me.user.username;
    var initials = (me.user.name || me.user.username || 'AD').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    document.getElementById('admin-avatar').textContent = initials || 'AD';
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function (ev) { ev.preventDefault(); logout(); });
    navTo('dashboard');
    checkWaStatus();
    setInterval(checkWaStatus, 30000);
  } catch (e) {
    window.location.href = '/AppNorthAuth';
  }
});

document.getElementById('sidebar-nav').addEventListener('click', function (e) {
  const a = e.target.closest('a[data-page]');
  if (!a) return;
  e.preventDefault();
  const page = a.dataset.page;
  document.querySelectorAll('#sidebar-nav a').forEach(function (el) { el.classList.remove('active'); });
  a.classList.add('active');
  document.getElementById('page-title').textContent = (a.querySelector('span') || {}).textContent || page;
  updateBreadcrumb(page);
  autoOpenNavGroup(page);
  closeSidebar();
  navTo(page);
});

function navTo(page) {
  currentPage = page;
  var content = document.getElementById('page-content');
  content.innerHTML = '<div class="loading-state">Loading...</div>';
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
    case 'affiliate': renderAffiliates(content); break;
    case 'reports': renderReports(content); break;
    case 'seller-earnings': renderSellerEarnings(content); break;
    case 'settings': renderSettings(content); break;
    case 'ai-models': renderAiModels(content); break;
  }
  if (page === 'chat') {
    if (!chatPollInterval) chatPollInterval = setInterval(function () { if (currentPage === 'chat') { loadChatUsers(); loadActiveChatMessages(); } }, 10000);
  } else if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
}

async function checkWaStatus() {
  try {
    var d = await api('/api/admin/whatsapp/status');
    var el = document.getElementById('wa-status-indicator');
    if (d.connected) { el.className = 'wa-connected'; el.textContent = 'Status: Online'; }
    else { el.className = 'wa-disconnected'; el.textContent = 'Status: Offline'; }
  } catch (e) {}
}

async function renderDashboard(el) {
  try {
    var d = await api('/api/admin/dashboard');
    el.innerHTML =
      '<div class="grid-stats">' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=59820&format=png&color=6B7280"></div><div class="info"><h3>' + (d.totalOrders || 0) + '</h3><p>Total Orders</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=5334&format=png&color=6B7280"></div><div class="info"><h3>' + formatRp(d.revenue || 0) + '</h3><p>Revenue</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=9894&format=png&color=6B7280"></div><div class="info"><h3>' + (d.totalUsers || 0) + '</h3><p>Total Users</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=4731&format=png&color=6B7280"></div><div class="info"><h3>' + (d.pendingOrders || 0) + '</h3><p>Pending Orders</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=11780&format=png&color=6B7280"></div><div class="info"><h3>' + (d.totalProducts || 0) + '</h3><p>Products</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=60179&format=png&color=6B7280"></div><div class="info"><h3>' + (d.totalReviews || 0) + '</h3><p>Reviews</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=33479&format=png&color=6B7280"></div><div class="info"><h3>' + (d.pendingNpinjam || 0) + '</h3><p>NPinjam Pending</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=5334&format=png&color=6B7280"></div><div class="info"><h3>' + (d.pendingLoans || 0) + '</h3><p>Pinjaman Pending</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=5B2IjBNporYk&format=png&color=DF414F"></div><div class="info"><h3>' + (d.aiUsage.totalMessages || 0) + '</h3><p>AI Messages</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=5B2IjBNporYk&format=png&color=DF414F"></div><div class="info"><p>Token: ' + (d.aiUsage.totalBytes ? formatRp(d.aiUsage.totalBytes) : '0') + ' / ' + formatRp(d.aiUsage.limitBytes) + '</p><p>Batas: ' + d.aiUsage.limitMessages + ' pesan / ' + formatRp(d.aiUsage.limitBytes / 1000) + ' KB</p></div></div>' +
      '</div>' +
      (d.pendingOverdue > 0 ? '<div class="card" style="margin-bottom:16px;background:#fef2f2;border-color:#fca5a5;display:flex;align-items:center;justify-content:space-between"><span style="font-size:13px;color:#991b1b">⚠️ ' + d.pendingOverdue + ' order pending lebih dari 5 menit. <a href="#" onclick="navTo(\'orders\'); return false;" style="color:#DF414F;font-weight:600">Lihat</a></span></div>' : '') +
      '<div class="two-col"><div class="card"><div class="section-title">Penjualan 7 Hari</div><canvas id="salesChart" height="200"></canvas></div><div class="card"><div class="section-title">Produk Terlaris</div><canvas id="topProductsChart" height="200"></canvas></div></div>' +
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
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { color: '#6b7280', font: { size: 11 } } } } }
        });
      }
      if (d.topProducts && d.topProducts.length) {
        chartInstances.topProducts = new Chart(document.getElementById('topProductsChart'), {
          type: 'bar',
          data: { labels: d.topProducts.map(function (p) { return (p.product_name || '').substring(0, 20); }), datasets: [{ label: 'Terjual', data: d.topProducts.map(function (p) { return Number(p.total_sold); }), backgroundColor: '#DF414F', borderRadius: 4, barPercentage: 0.6 }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { color: '#6b7280', font: { size: 11 }, stepSize: 1 } } } }
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
        return '<tr><td style="font-size:11px">' + escapeHtml(o.order_id) + '</td><td>' + escapeHtml(o.user_name || o.username || '-') + '</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(o.product_name) + '</td><td>' + formatRp(o.total_price) + '</td><td>' + statusBadge(o.status) + '</td><td style="font-size:11px">' + escapeHtml(o.delivery_status || '-') + '</td><td style="font-size:11px">' + escapeHtml(o.tracking_courier || '-') + '</td><td style="font-size:11px">' + (o.tracking_number ? '<span style="color:#166534">' + escapeHtml(o.tracking_number) + '</span>' : '-') + '</td><td style="font-size:11px">' + escapeHtml(o.estimated_arrival || '-') + '</td><td style="font-size:11px">' + (o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : '') + '</td><td style="white-space:nowrap">' +
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
      '<div>' + escapeHtml(o.user_name || o.username || '-') + (o.user_phone ? ' (' + escapeHtml(o.user_phone) + ')' : '') + '</div>' +
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
      return '<div class="' + (m.sender === 'user' ? 'bubble-admin' : 'bubble-user') + '"><div>' + escapeHtml(typeof m.message === 'string' ? m.message : JSON.stringify(m.message)) + '</div><div class="bubble-time">' + escapeHtml(m.time || '') + '</div></div>';
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
      return '<div class="' + (m.sender === 'user' ? 'bubble-admin' : 'bubble-user') + '"><div>' + escapeHtml(typeof m.message === 'string' ? m.message : JSON.stringify(m.message)) + '</div><div class="bubble-time">' + escapeHtml(m.time || '') + '</div></div>';
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

async function renderWhatsapp(el) {
  try {
    var d = await api('/api/admin/whatsapp/status');
    el.innerHTML =
      '<div class="card" style="text-align:center;padding:40px">' +
      '<img src="https://img.icons8.com/?size=100&id=16712&format=png&color=000000" style="width:64px;height:64px;margin-bottom:16px">' +
      '<h2 style="font-size:20px;font-weight:600;margin-bottom:8px">WhatsApp Bot</h2>' +
      '<p style="font-size:16px;margin-bottom:16px">Status: <span class="' + (d.connected ? 'wa-connected' : 'wa-disconnected') + '">' + (d.connected ? '✅ Terhubung' : '❌ Terputus') + '</span></p>' +
      (d.connected ? '<p style="font-size:13px;color:#6b7280">Nomor: ' + (d.number || '-') + ' | Platform: ' + (d.platform || '-') + '</p>' : '') +
      '<div style="margin-top:24px"><button class="btn btn-primary" onclick="testWa()">Test Kirim WA</button></div></div>';
  } catch (e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Error</div>'; }
}

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
    '<div id="report-results"></div>';
  loadReports();
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

async function renderAiModels(el) {
  try {
    var d = await api('/api/admin/ai-models');
    var html = '<div class="card"><div class="section-title">Model AI Chat</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><span class="badge' + (d.active ? ' badge-success' : '') + '">'+ (d.active ? d.activeName : 'Tidak Aktif') +'</span>' +
      '<button class="btn btn-outline btn-sm" onclick="selectAiModel(\'' + (d.active ? d.active.provider + '/' + d.active.model_id : '') + '\')">Gunakan</button></div>' +
      '<table class="w-full" style="font-size:12px;"><thead><tr><th>Provider</th><th>Model</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
    (d.models || []).forEach(function (m) {
      var status = (m.is_active && m.enabled) ? 'Aktif' : (m.enabled ? 'Tersedia' : 'Nonaktif');
      var statusClass = (m.is_active && m.enabled) ? 'badge-success' : (m.enabled ? 'badge-pending' : 'badge-gray');
      var enableBtn = m.enabled ? '<button class="btn btn-sm btn-outline" onclick="enableAiModel(' + m.id + ')">Aktifkan</button>' : '<button class="btn btn-sm btn-outline disabled" disabled>Nonaktif</button>';
      html += '<tr><td>' + escapeHtml(m.provider) + '</td><td>' + escapeHtml(m.model_id) + '</td><td><span class="badge ' + statusClass + '">' + status + '</span></td><td>' + enableBtn + '</td></tr>';
    });
    html += '</tbody></table>' +
      '<div style="margin-top:24px"><button class="btn btn-primary" onclick="refreshAiModels()">Refresh</button> <button class="btn btn-secondary" onclick="testAiModel()">Test Model</button></div>';
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

function enableAiModel(id) {
  api('/api/admin/ai-models/select', { method: 'POST', body: JSON.stringify({ provider: null, model_id: null }) }).then(function () {
    // refresh logic - simple reload
    location.reload();
  });
}

function refreshAiModels() {
  location.reload();
}

function testAiModel() {
  api('/api/admin/ai-models/check', { method: 'POST', body: JSON.stringify({ provider: 'opencode', model_id: 'deepseek-v4-flash-free' }) }).then(function (d) {
    if (d.success) {
      alert('Model ' + (d.reply || '').replace(/OK/, '') + ' merespons!');
    } else {
      alert('Model gagal: ' + (d.error || d.message || 'unknown'));
    }
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

function faceBadge(a) {
  if (!a) return '<span class="badge badge-info">-</span>';
  var v = parseFloat(a.face_match_score || a.face_verify_score);
  if (isNaN(v)) return '<span class="badge badge-info">-</span>';
  return v >= 0.6 ? '<span class="badge badge-success">' + (v * 100).toFixed(1) + '%</span>' : (v >= 0.5 ? '<span class="badge badge-pending">' + (v * 100).toFixed(1) + '%</span>' : '<span class="badge badge-danger">' + (v * 100).toFixed(1) + '%</span>');
}

function livenessBadge(a) {
  if (!a) return '<span class="badge badge-info">-</span>';
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
  var score = parseFloat(a.face_match_score || a.face_verify_score);
  var verified = !isNaN(score) && score >= 0.6;
  var html =
    '<h2>Detail Pengajuan NPinjam #' + id + '</h2>' +
    '<div style="display:flex;gap:16px;margin:12px 0">' +
    '<div style="flex:1;text-align:center"><img src="/uploads/npinjam/' + encodeURIComponent(a.ktp_front_url) + '" style="width:100%;max-width:220px;border:1px solid #e5e7eb" onerror="this.src=\'https://img.icons8.com/?size=100&id=40333&format=png&color=CCCCCC\'"><p style="font-size:11px;color:#6b7280;margin-top:4px">Foto KTP Depan</p></div>' +
    '<div style="flex:1;text-align:center"><img src="/uploads/npinjam/' + encodeURIComponent(a.ktp_selfie_url) + '" style="width:100%;max-width:220px;border:1px solid #e5e7eb" onerror="this.src=\'https://img.icons8.com/?size=100&id=40333&format=png&color=CCCCCC\'"><p style="font-size:11px;color:#6b7280;margin-top:4px">Foto Selfie</p></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
    '<span class="' + (verified ? 'badge badge-success' : 'badge badge-danger') + '">Wajah: ' + formatScore(score) + ' (' + (verified ? 'COCOK' : 'TIDAK COCOK') + ')</span>' +
    '<span class="' + (a.liveness_passed ? 'badge badge-success' : 'badge badge-pending') + '">Liveness: ' + (a.liveness_passed ? 'Lulus' : 'Belum') + '</span>' +
    '<span class="badge badge-info">Status: ' + escapeHtml(a.status) + '</span>' +
    '</div>' +
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
    renderDetailRow('Skor Wajah (Client)', formatScore(a.face_match_score)) +
    renderDetailRow('Skor Verifikasi (Backend)', formatScore(a.face_verify_score)) +
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
    renderDetailRow('Skor Verifikasi Wajah', formatScore(l.face_verify_score)) +
    renderDetailRow('Status', l.status) +
    (l.reject_reason ? renderDetailRow('Alasan Ditolak', l.reject_reason) : '');
  var instRows = (d.installments || []).map(function (i) {
    return '<tr><td>' + i.installment_no + '</td><td>' + i.due_date + '</td><td>Rp ' + Math.round(i.total_amount).toLocaleString('id-ID') + '</td><td>' + statusBadge(i.status) + '</td></tr>';
  }).join('');
  var html =
    '<h2>Detail Pinjaman #' + id + '</h2>' +
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
  window.location.href = '/AppNorthAuth';
}

let affiliateFilterStatus = '', affiliateSearch = '';

async function renderAffiliates(el) {
  try {
    var status = affiliateFilterStatus;
    var search = affiliateSearch;
    var d = await api('/api/admin/affiliates?status=' + encodeURIComponent(status) + '&search=' + encodeURIComponent(search));
    el.innerHTML =
      '<div class="grid-stats">' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=5334&format=png&color=6B7280"></div><div class="info"><h3>' + formatRp(d.totalCommission || 0) + '</h3><p>Total Komisi</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=41742&format=png&color=6B7280"></div><div class="info"><h3>' + formatRp(d.totalPaid || 0) + '</h3><p>Komisi Dibayar</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=9716&format=png&color=6B7280"></div><div class="info"><h3>' + (d.totalCount || 0) + '</h3><p>Transaksi Komisi</p></div></div>' +
      '<div class="card stat-card"><div class="icon"><img src="https://img.icons8.com/?size=100&id=9894&format=png&color=6B7280"></div><div class="info"><h3>' + (d.totalAffiliates || 0) + '</h3><p>Affiliates Aktif</p></div></div>' +
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
        area.insertAdjacentHTML('beforeend', '<div class="bubble-admin"><div>' + escapeHtml(data.message) + '</div><div class="bubble-time">' + now + '</div></div>');
        area.scrollTop = area.scrollHeight;
      }
    }
  }
});
