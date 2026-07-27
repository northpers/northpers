function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

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
            const response = await fetch('orders.html');
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
            const response = await fetch(`/api/user-orders/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                container.innerHTML = data.orders.length === 0 ? 
                    `<p class="text-center py-10 text-xs text-neutral-400">There are no orders today.</p>` : '';

                data.orders.forEach(order => {
                    const orderDataString = encodeURIComponent(JSON.stringify(order));
                    const status = (order.payment_status || 'unknown').toLowerCase().trim();
                    
                    const badges = {
                        'settlement': '<span class="bg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">BERHASIL</span>',
                        'capture': '<span class="bg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">BERHASIL</span>',
                        'success': '<span class="bg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">BERHASIL</span>',
                        'pending': '<span class="bbg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">MENUNGGU</span>',
                        'expire': '<span class="bg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">KADALUARSA</span>',
                        'cancel': '<span class="bg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">KADALUARSA</span>',
                        'deny': '<span class="bg-gray-50 text-gray-600 px-2 py-0.5 text-[9px] font-bold border border-gray-200">GAGAL</span>'
                    };
                    
                    const payBadge = badges[status] || '<span class="bg-red-600 text-white px-2 py-0.5 text-[9px]">UNKNOWN</span>';
                    const price = "IDR " + parseInt(order.total_price || order.price || 133000).toLocaleString('id-ID');
                    const imgUrl = order.product_image || "/public/icons/default.png";
                    const discountBadge = order.is_discounted ? '<span class="text-[8px] bg-[#fff1ee] text-[#DF414F] px-1.5 py-0.5">-5% OFF</span>' : '';

                    container.insertAdjacentHTML('beforeend', `
                        <div onclick="window.OrderManager.openDetail('${orderDataString}')" class="bg-white border border-neutral-200 p-4 mb-3 shadow-sm active:scale-[0.98] transition-all cursor-pointer">
                            <div class="flex justify-between items-center border-b border-neutral-100 pb-2.5 mb-3">
                                <div class="flex items-center gap-1.5"><span class="bg-red-600 text-white text-[8px] px-1.5 py-0.5 uppercase font-semibold">Northline</span>${discountBadge}</div>
                                <div>${payBadge}</div>
                            </div>
                            <div class="flex items-start gap-3.5">
                                <div class="w-16 h-16 bg-neutral-50 border border-neutral-200/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                    <img  id="order-product-img-${order.order_id}" src="${imgUrl}" class="w-full h-full object-contain" onerror="this.src='https://img.icons8.com/?size=100&id=84024&format=png&color=737373'">
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-[9px] uppercase tracking-wider text-neutral-400 mb-0.5">${order.order_id}</p>
                                    <h4 class="text-[14px] border-b mb-1 pb-1 border-neutral-100 text-black">${order.product_name}</h4>
                                    <div class="flex flex-wrap gap-1 mt-2 mb-2">
                                        <span class="border border-neutral-300 px-2 py-0.5 text-[9px] text-neutral-700">
                                            ${order.chosen_size || '-'}
                                        </span>
                                        <span class="border border-neutral-300 px-2 py-0.5 text-[9px] text-neutral-700">
                                            ${order.chosen_color || '-'}
                                        </span>
                                        <span class="border border-neutral-300 px-2 py-0.5 text-[9px] text-neutral-700">
                                            ${order.chosen_model || '-'}
                                        </span>
                                    </div>
                                    <p class="text-xs text-black tracking-tight">
                                        ${price}
                                    </p>
                                </div>
                            </div>
                            <div class="flex justify-end items-center text-[10px] text-gray-400 font-medium">
                                <span class="uppercase">Open Detail</span>
                                <img
                                    src="https://img.icons8.com/?size=100&id=39786&format=png&color=737373"
                                    class="w-3 h-3 ml-1"
                                    alt="arrow">
                            </div>
                        </div>
                    `);
                });
            }
        } catch (err) { console.error("Error rendering orders:", err); }
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