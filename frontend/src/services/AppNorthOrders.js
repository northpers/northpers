function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

function orderEscapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function orderGetStatus(o) {
  if (o.payment_status === 'cancelled') return { label: 'Dibatalkan', color: 'border-gray-200 text-gray-600' };
  if (o.payment_status === 'pending') return { label: 'Belum Dibayar', color: 'border-gray-200 text-gray-600' };
  if (o.delivery_status && o.delivery_status.toLowerCase().includes('selesai')) return { label: 'Selesai', color: 'border-gray-200 text-gray-600' };
  if (o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim')) return { label: 'Dikirim', color: 'border-gray-200 text-gray-600' };
  return { label: 'Diproses', color: 'border-yellow-500 text-yellow-600' };
}

window.OrderManager = {

    updateOrderBadge: function(count) {
        const badge = document.getElementById('desktop-orders-badge');
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    openDetail: function(encodedData) {
        try {
            const order = JSON.parse(decodeURIComponent(encodedData));
            
            const mapping = {
                'pop-order-id': order.order_id,
                'pop-delivery-status': order.delivery_status,
                'pop-product-name': order.product_name,
                'pop-color': order.chosen_color,
                'pop-size': order.chosen_size,
                'pop-model': order.chosen_model
            };

            for (const [id, value] of Object.entries(mapping)) {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            }

            const popTotalPrice = document.getElementById('pop-total-price');
            if (popTotalPrice) {
                popTotalPrice.textContent = "IDR " + parseInt(order.total_price || order.price || 133000).toLocaleString('id-ID');
            }

            const popDate = document.getElementById('pop-date');
            if (popDate) {
                popDate.textContent = new Date(order.created_at).toLocaleString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            }

            const popEstimatedArrival = document.getElementById('pop-estimated-arrival');
            if (popEstimatedArrival) {
                if (order.estimated_arrival) {
                    const formatted = new Date(order.estimated_arrival).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
                    popEstimatedArrival.textContent = `Dikirim & tiba sekitar ${formatted}`;
                } else {
                    popEstimatedArrival.textContent = "Sedang menghitung estimasi tiba...";
                }
            }

            const trackingBox = document.getElementById('pop-tracking-box');
            const popCourier = document.getElementById('pop-courier');
            const popResi = document.getElementById('pop-resi');
            const popShippedAt = document.getElementById('pop-shipped-at');
            if (trackingBox && order.tracking_number) {
                if (popCourier) popCourier.textContent = order.tracking_courier || '-';
                if (popResi) popResi.textContent = order.tracking_number || '-';
                if (popShippedAt) popShippedAt.textContent = order.shipped_at
                    ? new Date(order.shipped_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '-';
                trackingBox.classList.remove('hidden');
            } else if (trackingBox) {
                trackingBox.classList.add('hidden');
            }

            const popProductImg = document.getElementById('pop-product-img');
            if (popProductImg) {
                popProductImg.src = order.product_image || "/public/icons/default.png";

                popProductImg.onerror = function () {
                    this.src = "/public/icons/default.png";
                };
            }

            this.toggleDetailModal(true);
        } catch (err) { console.error("Error opening detail:", err); }
    },

    toggleDetailModal: function(show) {
        const modal = document.getElementById('detail-popup-modal');
        if (!modal) return;

        if (show) {
            modal.classList.remove('hidden');
            setTimeout(() => { modal.classList.remove('translate-y-full'); modal.classList.add('translate-y-0'); }, 10);
        } else {
            modal.classList.remove('translate-y-0');
            modal.classList.add('translate-y-full');
            setTimeout(() => { modal.classList.add('hidden'); }, 300);
        }
    },

    openSpaOrders: async function() {
        const wrapper = document.getElementById('spa-orders-popup-wrapper');
        if (!wrapper) return;
        try {
            const response = await fetch('/AppNorthOrders');
            wrapper.innerHTML = await response.text();
            wrapper.classList.remove('hidden');
            setTimeout(() => { wrapper.classList.remove('translate-y-full'); wrapper.classList.add('translate-y-0'); }, 10);
            
            const userDisplay = document.getElementById('user-display-name');
            if (userDisplay) {
                try {
                    const meRes = await fetch(_d("9kzs9k ~r9wo"), { credentials: 'include' });
                    if (meRes.ok) {
                        const meData = await meRes.json();
                        const me = meData.data || meData.user || meData;
                        userDisplay.textContent = me?.username?.toUpperCase() || "GUEST";
                    } else {
                        userDisplay.textContent = "GUEST";
                    }
                } catch {
                    userDisplay.textContent = "GUEST";
                }
            }
            this.renderSpaOrdersContent();
        } catch (err) { console.error("Gagal buka SPA orders:", err); }
    },

    renderSpaOrdersContent: async function() {
        const container = document.getElementById('orders-list-container');
        if (!container) return;

        let userId = null;
        try {
            const meRes = await fetch(_d("9kzs9k ~r9wo"), { credentials: 'include' });
            if (meRes.ok) {
                const meData = await meRes.json();
                const me = meData.data || meData.user || meData;
                if (me && me.id) userId = me.id;
            }
        } catch (e) {}

        try {
            container.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Loading...</div>';
            if (!userId) {
                const entries = typeof window.getGuestOrderAccessEntries === 'function'
                    ? window.getGuestOrderAccessEntries()
                    : [];
                if (entries.length === 0) {
                    container.innerHTML = '<div class="bg-white border border-gray-200 rounded-sm p-6 text-center"><div class="text-gray-400 text-xs">Belum ada pesanan</div></div>';
                    return;
                }

                const results = await Promise.all(entries.map(async entry => {
                    const response = await fetch('/api/guest-orders', {
                        headers: { 'X-Guest-Order-Token': entry.token },
                    });
                    const data = await response.json();
                    return { entry, response, data };
                }));
                const successfulResults = results.filter(result => result.response.ok && result.data.success);
                if (successfulResults.length === 0) {
                    container.innerHTML = '<div class="bg-white border border-red-100 rounded-sm p-6 text-center"><div class="text-red-500 text-xs">Gagal memuat pesanan guest. Muat ulang halaman dan coba lagi.</div></div>';
                    return;
                }
                const ordersById = new Map();
                successfulResults.forEach(result => {
                    (result.data.orders || []).forEach(order => {
                        ordersById.set(order.order_id, { ...order, is_guest: true });
                    });
                });
                const orders = [...ordersById.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                if (orders.length === 0) {
                    container.innerHTML = '<div class="bg-white border border-gray-200 rounded-sm p-6 text-center"><div class="text-gray-400 text-xs">Belum ada pesanan</div></div>';
                    return;
                }
                container.innerHTML = orders.map(o => this.renderOrderCard(o)).join('');
                return;
            }

            const response = await fetch(`/api/user-orders/${userId}`, { credentials: 'include' });
            const data = await response.json();

            if (data.success) {
                const orders = data.orders || [];
                if (orders.length === 0) {
                    container.innerHTML = '<div class="bg-white border border-gray-200 rounded-sm p-6 text-center"><div class="text-gray-400 text-xs">Belum ada pesanan</div></div>';
                    return;
                }
                container.innerHTML = orders.map(o => this.renderOrderCard(o)).join('');
            }
        } catch (err) { console.error("Error rendering orders:", err); }
    },

    renderOrderCard: function(o) {
        const dateStr = new Date(o.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const st = orderGetStatus(o);

        const steps = [
            { label: 'Dibuat', done: true },
            { label: 'Diproses', done: o.delivery_status && o.delivery_status.toLowerCase().includes('proses') },
            { label: 'Dikirim', done: o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim') },
            { label: 'Selesai', done: o.delivery_status && o.delivery_status.toLowerCase().includes('selesai') },
        ];

        const hasTrackingMap = typeof window.openTrackingMap === 'function';
        const hasReview = typeof window.openReviewSpa === 'function';
        const hasReceipt = o.is_guest
            ? typeof window.OrderManager.confirmGuestOrderReceipt === 'function' && !!window.getGuestOrderTokenForOrder(o.order_id)
            : typeof window.confirmOrderReceipt === 'function';
        const userAddr = (o.shipping_address || '').split(' @Coordinates:')[0].trim();

        return '<div class="bg-white border border-gray-200 rounded-sm">' +

          '<div class="flex items-center justify-between px-3 py-2 border-b border-gray-100">' +
            '<div class="flex items-center gap-1.5">' +
              '<img src="https://img.icons8.com/?size=100&id=59878&format=png&color=DF414F" class="w-3.5 h-3.5">' +
              '<span class="text-[11px] font-semibold text-gray-800">Northline</span>' +
            '</div>' +
            '<span class="text-[10px] font-semibold border px-2 py-0.5 ' + st.color + '">' + st.label + '</span>' +
          '</div>' +

          (o.payment_status !== 'pending' && o.payment_status !== 'cancelled' ? '<div class="px-3 py-3 border-b border-gray-100 bg-gray-50/30">' +
            '<div class="flex items-center gap-2 mb-2' + (hasTrackingMap ? ' cursor-pointer select-none' : '') + '"' + (hasTrackingMap ? ' onclick="openTrackingMap(\'' + orderEscapeHtml(o.order_id) + '\')"' : '') + '>' +
              '<img src="https://img.icons8.com/?size=100&id=7880&format=png&color=DF414F" class="w-3.5 h-3.5">' +
              '<span class="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Tracking Pengiriman</span>' +
              (hasTrackingMap ? '<span class="text-[#DF414F] text-[10px] font-semibold ml-auto">Lacak di Peta</span>' : '') +
            '</div>' +
            '<div class="text-[10px] text-gray-500 leading-relaxed">' +
              (userAddr ? orderEscapeHtml(userAddr) + '<br>' : '') +
              (o.estimated_arrival ? '<span class="text-gray-400">Estimasi tiba: ' + orderEscapeHtml(o.estimated_arrival) + '</span>' : '') +
            '</div>' +
            (o.tracking_number ? '<div class="mt-2 text-[10px] bg-white border border-gray-100 p-2 rounded-sm">' +
              '<div class="flex items-center justify-between">' +
                '<span class="text-gray-500">Kurir: <b class="text-gray-800">' + orderEscapeHtml(o.tracking_courier || '-') + '</b></span>' +
                '<button onclick="navigator.clipboard.writeText(\'' + orderEscapeHtml(o.tracking_number) + '\').then(function(){alert(\'Nomor resi disalin\')})" class="text-[#DF414F] font-semibold">Salin</button>' +
              '</div>' +
              '<div class="mt-1">No. Resi: <b class="text-[#DF414F] tracking-wider">' + orderEscapeHtml(o.tracking_number) + '</b></div>' +
            '</div>' : '') +
            '<div class="flex items-center gap-2 mt-2 text-[10px]">' +
              '<span class="text-gray-400">Status:</span>' +
              steps.map(function(s) {
                return '<span class="' + (s.done ? 'text-[#DF414F] font-semibold' : 'text-gray-300') + '">' + s.label + '</span>' +
                  (s.label !== 'Selesai' ? '<span class="text-gray-300"> → </span>' : '');
              }).join('') +
            '</div>' +
          '</div>' : '') +

          '<div class="flex gap-3 px-3 py-3">' +
            '<div class="w-16 h-16 bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">' +
              '<img src="' + (o.product_image || '/public/icons/default.png') + '" class="w-full h-full object-cover" onerror="this.src=\'/public/icons/default.png\'">' +
            '</div>' +
            '<div class="flex-1 min-w-0 gap-2">' +
              '<p class="text-[12px] font-medium text-gray-800 leading-4 line-clamp-2">' + orderEscapeHtml(o.product_name || '') + '</p>' +
              '<div class="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-400">' +
                (o.chosen_color ? '<span>' + orderEscapeHtml(o.chosen_color) + '</span>' : '') +
                (o.chosen_size ? '<span>Size ' + orderEscapeHtml(o.chosen_size) + '</span>' : '') +
                '<span>Qty: ' + (o.quantity || 1) + '</span>' +
                '<span class="ml-auto">' + dateStr + '</span>' +
              '</div>' +
              '<p class="text-[11px] font-semibold text-gray-800 mt-2">Rp ' + parseInt(o.total_price).toLocaleString('id-ID') + '</p>' +
            '</div>' +
          '</div>' +

          (o.payment_status === 'pending' ? '<div class="px-3 py-2 border-t border-gray-100 flex justify-end">' +
            '<button onclick="window.retryPayment(\'' + orderEscapeHtml(o.order_id) + '\')" class="text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Bayar Sekarang</button>' +
          '</div>' : '') +
          (o.payment_status === 'cancelled' ? '<div class="px-3 py-2 border-t border-gray-100 text-center text-[10px] text-red-400">Pesanan dibatalkan</div>' : '') +
          (o.payment_status === 'success' && o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim') && hasReceipt ? '<div class="px-3 py-2 border-t border-gray-100 flex justify-end">' +
            '<button onclick="' + (o.is_guest ? 'window.OrderManager.confirmGuestOrderReceipt' : 'confirmOrderReceipt') + '(\'' + orderEscapeHtml(o.order_id) + '\')" class="text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Pesanan Selesai</button>' +
          '</div>' : '') +
          (o.payment_status === 'success' && !o.is_guest && o.delivery_status && o.delivery_status.toLowerCase().includes('selesai') ? '<div class="px-3 py-2.5 border-t border-gray-100 flex items-center justify-between gap-3">' +
                  '<span class="text-[11px] leading-4 text-gray-500 max-w-[65%] line-clamp-2">' + (o.reviewed ? 'Terima kasih! Ulasanmu sudah terkirim.' : 'Bagikan pengalamanmu dengan produk ini dan bantu pembeli lainnya:') + '</span>' +
                  (o.reviewed
                    ? '<span class="shrink-0 text-[11px] font-semibold bg-gray-100 text-gray-400 px-4 py-1.5 cursor-not-allowed">Selesai</span>'
                    : (hasReview
                      ? '<button onclick="openReviewSpa(\'' + orderEscapeHtml(o.order_id) + '\')" class="shrink-0 text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Beri Ulasan</button>'
                      : '<span class="shrink-0 text-[11px] font-semibold bg-gray-100 text-gray-400 px-4 py-1.5">Selesai</span>')) +
                '</div>' : '') +

        '</div>';
    },

    confirmGuestOrderReceipt: async function(orderId) {
        const notify = typeof window.showIosModal === 'function' ? window.showIosModal : window.alert;
        const token = window.getGuestOrderTokenForOrder(orderId);
        if (!token) {
            notify('Akses pesanan guest tidak ditemukan');
            return;
        }
        try {
            const response = await fetch('/api/guest-orders/confirm-receipt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Guest-Order-Token': token,
                },
                body: JSON.stringify({ orderId }),
            });
            const data = await response.json();
            notify(data.message || (data.success ? 'Pesanan diterima' : 'Gagal konfirmasi'));
            if (data.success) this.renderSpaOrdersContent();
        } catch (error) {
            console.error('Gagal konfirmasi pesanan guest:', error);
            notify('Gagal konfirmasi pesanan');
        }
    },

    closeSpaOrders: function() {
        const wrapper = document.getElementById('spa-orders-popup-wrapper');
        if (!wrapper) return;
        wrapper.classList.remove('translate-y-0');
        wrapper.classList.add('translate-y-full');
        window._spaClosing = true;
        setTimeout(() => { wrapper.classList.add('hidden'); }, 300);
        closeSpaUrl();
    }
};

function generateSpaCode() {
  return Math.random().toString(36).slice(2, 10);
}

function isSpaOrdersActive() {
  return window.location.pathname === '/AppNorthOrders' && window.location.search.includes('code=');
}

function openSpaUrl(title) {
  const code = generateSpaCode();
  const url = '/AppNorthOrders?code=' + code;
  history.pushState({ spa: 'orders', code: code }, '', url);
  document.title = title || 'MY ORDERS - Northline';
}

function closeSpaUrl() {
  const sp = history.state;
  if (sp && sp.spa === 'orders') {
    history.pushState(null, '', '/');
  }
  document.title = 'Northline Indonesia';
}

window.handlePopStateSpaOrders = function(e) {
  const wrapper = document.getElementById('spa-orders-popup-wrapper');
  if (e.state && e.state.spa === 'orders') {
    if ((!wrapper || wrapper.classList.contains('hidden')) && !window._spaClosing) {
      window.OrderManager.openSpaOrders();
    }
    window._spaClosing = false;
  } else {
    if (wrapper && !wrapper.classList.contains('hidden') && !window._spaClosing) {
      window.OrderManager.closeSpaOrders();
    }
    window._spaClosing = false;
  }
};

window.handleHeaderClose = function() {
    const detailModal = document.getElementById('detail-popup-modal');
    if (detailModal && !detailModal.classList.contains('hidden')) {
        window.OrderManager.toggleDetailModal(false);
    } else {
        window.OrderManager.closeSpaOrders();
    }
};

window.addEventListener('popstate', window.handlePopStateSpaOrders);

if (typeof window.openTrackingMap !== 'function') {

    const spaToast = (typeof window.showIosModal === 'function') ? window.showIosModal : function (m) { alert(m); };

    let spaLeafletLoading = false;
    const spaLeafletWaiters = [];
    window.spaEnsureLeaflet = function (cb) {
        if (window.L && typeof window.L.map === 'function') { cb(); return; }
        if (spaLeafletLoading) { spaLeafletWaiters.push(cb); return; }
        spaLeafletLoading = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = function () { spaLeafletLoading = false; spaLeafletWaiters.forEach(function (f) { f(); }); spaLeafletWaiters.length = 0; };
        script.onerror = function () { spaLeafletLoading = false; spaLeafletWaiters.forEach(function (f) { f(); }); spaLeafletWaiters.length = 0; };
        document.head.appendChild(script);
    };

    window.parseCoordinatesFromAddress = function (addr) {
        try {
            const part = String(addr || '').split(' @Coordinates:')[1];
            if (!part) return null;
            const [lat, lng] = part.split(',');
            const la = parseFloat(lat);
            const ln = parseFloat(lng);
            if (isNaN(la) || isNaN(ln)) return null;
            return { lat: la, lng: ln };
        } catch (e) { return null; }
    };

    let trackingMapInstance = null;

    window.closeTrackingMap = function () {
        const root = document.getElementById('tracking-map-root');
        if (root) root.remove();
        if (trackingMapInstance) {
            try { trackingMapInstance.remove(); } catch (e) {}
            trackingMapInstance = null;
        }
        try { document.body.style.overflow = ''; } catch (e) {}
    };

    window.trackingTimelineHtml = function (events, createdAt, order) {
        const items = [];
        items.push({ status: 'Pesanan Dibuat', description: 'Pesanan berhasil dibuat', location: null, time: createdAt || null, first: true });
        (events || []).forEach(function (e) {
            items.push({ status: e.status, description: e.description, location: e.location, time: e.created_at, first: false });
        });
        const ds = String(order.delivery_status || '').toLowerCase();
        if (ds.includes('selesai')) {
            items.push({ status: 'Pesanan Selesai', description: 'Pesanan telah diterima', location: null, time: null, first: false });
        }
        return items.map(function (it, i) {
            const isLast = i === items.length - 1;
            return '<div class="flex gap-3" style="position:relative;padding-bottom:16px">' +
                (isLast ? '' : '<div style="position:absolute;left:5px;top:14px;bottom:-2px;width:2px;background:#f3e0e2"></div>') +
                '<div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:2px;' + (isLast ? 'background:#DF414F;box-shadow:0 0 0 4px rgba(223,65,79,.18)' : 'background:#fff;border:2px solid #DF414F') + '"></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:12px;font-weight:700;color:' + (isLast ? '#DF414F' : '#111827') + '">' + orderEscapeHtml(it.status) + '</div>' +
                    (it.description ? '<div style="font-size:11px;color:#6b7280;margin-top:1px">' + orderEscapeHtml(it.description) + '</div>' : '') +
                    (it.location ? '<div class="flex flex-row gap-1 items-center" style="font-size:10px;color:#9ca3af;margin-top:1px"><img src="https://img.icons8.com/?size=100&id=13800&format=png&color=9CA3AF" class="w-3 h-3"">' + orderEscapeHtml(it.location) + '</div>' : '') +
                    (it.time ? '<div style="font-size:10px;color:#9ca3af;margin-top:1px">' + new Date(it.time).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div>' : '') +
                '</div></div>';
        }).join('');
    };

    window.trackingMapHtml = function (order) {
        return '<div id="tracking-map-root" class="fixed inset-0 z-[99999] bg-black/60 flex items-end md:items-center justify-center" onclick="if(event.target===this)closeTrackingMap()">' +
            '<div style="width:100%;max-width:520px;background:#fff;border-radius:16px 16px 0 0;max-height:92vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">' +
                '<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">' +
                    '<div class="min-w-0">' +
                        '<h3 class="text-sm font-bold text-gray-900">Lacak Pengiriman</h3>' +
                        '<p class="text-[10px] text-gray-400 truncate">' + orderEscapeHtml(order.order_id || '') + '</p>' +
                    '</div>' +
                    '<button onclick="closeTrackingMap()" class="w-8 h-8 flex items-center justify-center text-gray-500 active:bg-gray-100 rounded-full"><img src="https://img.icons8.com/?size=100&id=355&format=png&color=df414f" class="w-7 h-7" /></button>' +
                '</div>' +
                '<div class="flex items-center gap-3 px-4 py-2 bg-gray-50/60 text-[10px] text-gray-600">' +
                    '<span>Kurir: <b class="text-gray-800">' + orderEscapeHtml(order.tracking_courier || '-') + '</b></span>' +
                    '<span class="text-gray-300">|</span>' +
                    (order.tracking_number
                        ? '<span class="flex items-center gap-1">Resi: <b class="text-[#DF414F] tracking-wider">' + orderEscapeHtml(order.tracking_number) + '</b>' +
                            '<button onclick="navigator.clipboard.writeText(\'' + orderEscapeHtml(order.tracking_number) + '\').then(function(){closeTrackingMap();showIosModal(\'Nomor resi disalin\')})" class="text-[#DF414F] font-semibold">Salin</button></span>'
                        : '<span>Belum ada resi</span>') +
                    (order.estimated_arrival ? '<span class="text-gray-300">|</span><span>Est. ' + orderEscapeHtml(order.estimated_arrival) + '</span>' : '') +
                '</div>' +
                '<div class="flex-1 overflow-y-auto">' +
                    '<div id="tracking-map-container" style="height:300px"></div>' +
                    '<div class="px-4 py-4 border-t border-gray-100">' +
                        '<div class="text-[10px] font-bold text-gray-500 uppercase mb-3">Riwayat Perjalanan</div>' +
                        '<div id="tracking-timeline"></div>' +
                    '</div>' +
                '</div>' +
            '</div></div>';
    };

    const TRACK_OSRM = 'https://router.project-osrm.org/route/v1/driving/';
    window.__TRACK_ROUTE_CACHE = window.__TRACK_ROUTE_CACHE || {};
    const TRACK_TRUCK_ICON = 'https://img.icons8.com/?size=100&id=t5k8wbKOBK1J&format=png&color=DF414F';

    function trackingRouteKey(coords) {
        return coords.map(function (c) { return c[0].toFixed(5) + ',' + c[1].toFixed(5); }).join(';');
    }

    async function fetchTrackingRoadRoute(coords) {
        if (!coords || coords.length < 2) return null;
        const key = trackingRouteKey(coords);
        if (window.__TRACK_ROUTE_CACHE[key]) return window.__TRACK_ROUTE_CACHE[key];
        const url = TRACK_OSRM + coords.map(function (c) { return c[1].toFixed(6) + ',' + c[0].toFixed(6); }).join(';')
            + '?overview=full&geometries=geojson';
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.routes || !data.routes.length) return null;
            const line = (data.routes[0].geometry || {}).coordinates;
            if (!line || line.length < 2) return null;
            const path = line.map(function (c) { return [c[1], c[0]]; });
            window.__TRACK_ROUTE_CACHE[key] = path;
            return path;
        } catch (e) {
            return null;
        }
    }

    function truckIconHtml() {
    return '<div style="background:white;border:2px solid #DF414F;border-radius:50px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;padding:2px;"><img src="' + TRACK_TRUCK_ICON + '"style="display:block;width:20px;height:20px;" alt="truk pengiriman"></div>';
    }

    window.drawTrackingMap = async function (order, events, origin) {
        const container = document.getElementById('tracking-map-container');
        const dest = window.parseCoordinatesFromAddress(order.shipping_address);
        const points = [];
        if (origin) points.push({ lat: origin.lat, lng: origin.lng, kind: 'origin', label: 'Toko Northline' });
        (events || []).forEach(function (e, i) {
            if (e.lat != null && e.lng != null) points.push({ lat: Number(e.lat), lng: Number(e.lng), kind: 'event', index: i + 1, label: e.status, location: e.location, time: e.created_at });
        });
        if (dest) points.push({ lat: dest.lat, lng: dest.lng, kind: 'dest', label: 'Alamat Penerima' });

        if (points.length === 0) {
            container.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;background:#f9fafb;color:#9ca3af;font-size:12px;padding:0 24px;text-align:center">Belum ada titik lokasi. Admin akan menandai titik pengiriman di sini.</div>';
            return;
        }

        const map = L.map(container, { zoomControl: false });
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '&copy; Google Maps' }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        trackingMapInstance = map;

        const coordPoints = points.map(function (p) { return [p.lat, p.lng]; });

        let lastEventIdx = -1;
        points.forEach(function (p, i) { if (p.kind === 'event') lastEventIdx = i; });

        points.forEach(function (p, i) {
            if (p.kind === 'event' && i === lastEventIdx) {
                const icon = L.divIcon({ html: truckIconHtml(), className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
                L.marker([p.lat, p.lng], { icon, zIndexOffset: 1000 }).addTo(map).bindPopup(
                    '<b>' + orderEscapeHtml(p.label) + '</b>' +
                    (p.location ? '<br>' + orderEscapeHtml(p.location) : '') +
                    (p.time ? '<br><span style="font-size:11px;color:#6b7280">' + new Date(p.time).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span>' : '')
                );
                return;
            }
            let iconHtml = null;
            if (p.kind === 'origin') {
                iconHtml = '<div style="background:#16a34a;border:2px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>';
            } else if (p.kind === 'dest') {
                iconHtml = '<div style="background:#2563eb;border:2px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>';
            } else {
                iconHtml = '<div style="background:#DF414F;border:2px solid #fff;border-radius:50%;width:18px;height:18px;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">' + p.index + '</div>';
            }
            const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
            L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(
                '<b>' + orderEscapeHtml(p.label) + '</b>' + (p.location ? '<br>' + orderEscapeHtml(p.location) : '')
            );
        });

            let routeLayers = [];
        function drawRoute(path) {
            routeLayers.forEach(function (l) { map.removeLayer(l); });
            routeLayers = [
                L.polyline(path, { color: '#DF414F', weight: 4, opacity: 1, lineJoin: 'round' })
            ];
            routeLayers.forEach(function (l) { l.addTo(map); });
        }

        if (coordPoints.length >= 2) {
            map.fitBounds(L.latLngBounds(coordPoints).pad(0.25));
            drawRoute(coordPoints);
            const road = await fetchTrackingRoadRoute(coordPoints);
            if (road && trackingMapInstance === map) {
                drawRoute(road);
                map.fitBounds(L.latLngBounds(road).pad(0.2));
            }
        } else {
            map.fitBounds(L.latLngBounds(coordPoints).pad(0.6));
        }

        map.whenReady(function () {
            setTimeout(function () { map.invalidateSize(); }, 60);
            setTimeout(function () { map.invalidateSize(); }, 300);
        });
    };

    window.openTrackingMap = async function (orderId) {
        try {
            const guestOrderToken = window.getGuestOrderTokenForOrder?.(orderId);
            const res = await fetch(_d('9kzs9k ~r9~|kmusxq9') + encodeURIComponent(orderId), {
                credentials: 'include',
                headers: guestOrderToken ? { 'X-Guest-Order-Token': guestOrderToken } : {},
            });
            const data = await res.json();
            if (!data.success) {
                spaToast(data.message || 'Gagal memuat tracking');
                return;
            }
            const order = data.order || {};
            const events = data.events || [];
            const origin = data.origin || null;

            const root = document.createElement('div');
            root.id = 'tracking-map-root-holder';
            document.body.appendChild(root);
            root.innerHTML = window.trackingMapHtml(order);
            document.body.style.overflow = 'hidden';
            document.getElementById('tracking-timeline').innerHTML = window.trackingTimelineHtml(events, order.created_at, order);
            window.spaEnsureLeaflet(function () {
                window.drawTrackingMap(order, events, origin);
            });
        } catch (e) {
            console.log(e);
            spaToast('Gagal memuat tracking');
        }
    };
}