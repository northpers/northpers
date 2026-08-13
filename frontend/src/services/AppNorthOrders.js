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
        if (!userId) return;

        try {
            container.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Loading...</div>';
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
        const hasReceipt = typeof window.confirmOrderReceipt === 'function';
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
              (hasTrackingMap ? '<span class="text-[#DF414F] text-[10px] font-semibold ml-auto">Lacak di Peta ›</span>' : '') +
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
            '<button class="text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Bayar Sekarang</button>' +
          '</div>' : '') +
          (o.payment_status === 'cancelled' ? '<div class="px-3 py-2 border-t border-gray-100 text-center text-[10px] text-red-400">Pesanan dibatalkan</div>' : '') +
          (o.payment_status === 'success' && o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim') && hasReceipt ? '<div class="px-3 py-2 border-t border-gray-100 flex justify-end">' +
            '<button onclick="confirmOrderReceipt(\'' + orderEscapeHtml(o.order_id) + '\')" class="text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Pesanan Selesai</button>' +
          '</div>' : '') +
          (o.payment_status === 'success' && o.delivery_status && o.delivery_status.toLowerCase().includes('selesai') ? '<div class="px-3 py-2.5 border-t border-gray-100 flex items-center justify-between gap-3">' +
                  '<span class="text-[11px] leading-4 text-gray-500 max-w-[65%] line-clamp-2">' + (o.reviewed ? 'Terima kasih! Ulasanmu sudah terkirim.' : 'Bagikan pengalamanmu dengan produk ini dan bantu pembeli lainnya:') + '</span>' +
                  (o.reviewed
                    ? '<span class="shrink-0 text-[11px] font-semibold bg-gray-100 text-gray-400 px-4 py-1.5 cursor-not-allowed">Selesai</span>'
                    : (hasReview
                      ? '<button onclick="openReviewSpa(\'' + orderEscapeHtml(o.order_id) + '\')" class="shrink-0 text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Beri Ulasan</button>'
                      : '<span class="shrink-0 text-[11px] font-semibold bg-gray-100 text-gray-400 px-4 py-1.5">Selesai</span>')) +
                '</div>' : '') +

        '</div>';
    },

    closeSpaOrders: function() {
        const wrapper = document.getElementById('spa-orders-popup-wrapper');
        if (!wrapper) return;
        wrapper.classList.remove('translate-y-0');
        wrapper.classList.add('translate-y-full');
        setTimeout(() => { wrapper.classList.add('hidden'); }, 300);
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