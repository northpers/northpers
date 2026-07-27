const PAYMENT_ORIGINAL_TITLE = document.title;

window.bukaModalPembayaran = async (data) => {
    const existingOverlay = document.getElementById('payment-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const qrPreload = new Image();
    qrPreload.src = "https://nl.hostinesia.my.id/public/image/Northline_Qr.jpeg";
    document.title = "Payment | Northline";
    history.replaceState({ payment: "method" }, "", "?payment=method");

    const overlay = document.createElement('div');
    overlay.id = "payment-modal-overlay";
    overlay.className =
        "fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center";

    const modal = document.createElement('div');
    modal.className =
        "bg-[#f5f5f5] w-full h-full sm:max-w-[380px] sm:h-[95vh] overflow-hidden flex flex-col shadow-2xl";

    modal.innerHTML = `
        <div class="flex items-center gap-3 px-4 h-[52px] bg-white border-b border-gray-200">
            <button id="close-modal"
                class="mr-3">
                <img src="https://img.icons8.com/?size=100&id=85459&format=png&color=FF5722" 
                        class="w-5 h-5" alt="Back">
            </button>

            <h1 class="text-[15px] font-medium text-gray-700">
                Payment Method
            </h1>
        </div>

        <div class="flex-1 overflow-y-auto">

            <div class="px-4 py-2 text-[10px] text-gray-400 uppercase font-semibold flex items-center gap-1">
                Northline Guarantee
                <img src="https://img.icons8.com/?size=100&id=z6L43qWhEasn&format=png&color=FF5722" alt="shield" class="w-3 h-3" />
            </div>

            <div class="bg-white border-t border-b border-gray-200">

                <button class="payment-toggle w-full px-4 py-3 flex opacity-75 items-center justify-between">
                    <div class="flex items-center gap-3">
                        <img 
                            src="https://img.icons8.com/fluency/48/bank-card-back-side.png"
                            class="w-5 h-5 object-contain"
                        />
                        <div class="text-left">
                            <div class="flex items-center gap-2">
                                <p class="text-[13px] font-medium text-gray-800">
                                    NorthPay
                                </p>

                                <span class="bg-red-500 text-white text-[9px] px-1.5 rounded font-bold">
                                    NEW
                                </span>
                            </div>
                            <p class="text-[11px] text-gray-400">
                                Link now for a more seamless experience!
                            </p>
                            <!-- INFO BELUM TERSEDIA -->
                            <p class="text-[10px] text-red-400 mt-1">
                                Metode ini masih belum bisa digunakan
                            </p>
                        </div>
                    </div>
                    <img 
                        src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-right.png"
                        class="w-3 h-3 object-contain"
                    />
                </button>

            </div>

            <div class="bg-white border-b border-gray-200">
                <button class="payment-toggle w-full px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <img 
                            src="https://img.icons8.com/fluency/48/bank-building.png"
                            class="w-5 h-5 object-contain"
                        />
                        <div class="text-left">
                            <p class="text-[13px] font-medium text-gray-800">
                                Online Banking
                            </p>

                            <p class="text-[11px] text-gray-400">
                                CIMB Clicks
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 rounded-full border border-red-500 flex items-center justify-center">
                            <div class="w-2 h-2 rounded-full bg-red-500"></div>
                        </div>
                        <img 
                            src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-down.png"
                            class="arrow w-3 h-3 transition"
                        />
                    </div>
                </button>
                <div class="payment-content">
                    <div class="px-4 py-3 border-t border-gray-100 flex items-center gap-3 cursor-pointer hover:bg-gray-50">
                        <img 
                            src="https://images.seeklogo.com/logo-png/39/2/quick-response-code-indonesia-standard-qris-logo-png_seeklogo-391791.png"
                            class="h-8 object-contain"
                        />
                        <div>
                            <p class="text-[13px] font-medium text-gray-800">
                                QRIS
                            </p>
                            <p class="text-[11px] text-gray-400">
                                Bayar dengan aplikasi e-wallet & mobile banking apa saja
                            </p>
                            <div class="mt-2 text-[11px] text-red-500">
                                Metode ini otomatis digunakan.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white border-b border-gray-200">
                <button class="payment-toggle w-full px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <img src="https://cdn-icons-png.flaticon.com/512/633/633611.png"
                            class="w-5 h-5 object-contain opacity-50" />

                        <div class="text-left">
                            <p class="text-[13px] font-medium text-gray-400">
                                Credit / Debit Card
                            </p>
                        </div>
                    </div>
                    <img 
                        src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-down.png"
                        class="arrow w-3 h-3 object-contain transition"
                    />
                </button>
                <div class="payment-content">
                    <div class="px-4 py-3 border-t border-gray-100 bg-[#fafafa]">
                        <div class="flex items-center gap-3 opacity-40">
                            <div class="w-6 h-6 border border-gray-300 rounded flex items-center justify-center text-gray-400">
                                +
                            </div>
                            <span class="text-[12px] text-gray-400">
                                Add New Credit/Debit Card
                            </span>
                        </div>
                        <p class="mt-4 text-[11px] leading-4 text-gray-400">
                            I acknowledge that my card information is saved securely on my Shopee account and one Time Password (OTP) might not be required for future transactions on Shopee.
                        </p>
                        <div class="mt-4 text-[11px] text-red-400 font-medium">
                            Credit Card Installment
                        </div>
                        <div class="mt-2 bg-red-50 border border-red-100 rounded px-3 py-2 text-[11px] text-red-500">
                            Metode ini masih belum bisa digunakan.
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white border-b border-gray-200">
                <button class="payment-toggle w-full px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <img src="https://img.icons8.com/ios-filled/50/6b7280/shop.png" 
                            class="w-5 h-5 object-contain" />

                        <div class="text-left">
                            <p class="text-[13px] font-medium text-gray-700">
                                Cash Payment at Convenience Stores
                            </p>
                        </div>
                    </div>

                    <img 
                        src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-down.png"
                        class="arrow w-3 h-3 object-contain transition"
                    />
                </button>

                <div class="payment-content">
                    <div class="px-4 py-3 border-t border-gray-100 opacity-50">
                        <div class="flex items-center gap-3">
                            <img 
                                src="https://logosmarcas.net/wp-content/uploads/2022/03/Alfamart-Emblema-500x281.png"
                                class="w-5 h-5 object-contain"
                            />
                            <span class="text-[12px] text-gray-500">
                                Cash Payment at Alfamart
                            </span>
                        </div>
                    </div>

                    <div class="px-4 py-3 border-t border-gray-100 opacity-50">
                        <div class="flex items-center gap-3">
                            <img 
                                src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhBMjGibJMDSwmwFvQFb4GPYthT_tuXsE4--XtDBwHnmCApILR5_dZAdyUsXIa8szbH3VJjp6VRat7oEvzrTVkcZhDp7BeRG5wZHDG4nkqAj_b_S5OtXXeppQ5cQkbqcP97d3ZBXom1mtV8AE0UD6zEG6vrYlMrO-svP37BGhzYiiLj_k6pjoGfuCdd/w1200-h630-p-k-no-nu/logo-indomaret.png"
                                class="w-5 h-5 object-contain"
                            />
                            <span class="text-[12px] text-gray-500">
                                Cash Payment at Indomart
                            </span>
                        </div>
                    </div>

                    <div class="px-4 pb-4">
                        <div class="bg-red-50 border border-red-100 rounded px-3 py-2 text-[11px] text-red-500 flex items-center gap-2">
                            Pembayaran convenience store belum tersedia.
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <!-- FOOTER -->
        <div class="bg-white p-4 border-t border-gray-200">
            <button id="confirm-btn"
                class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
                CONFIRM
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const popstateHandler = () => {
        if (!document.getElementById('payment-modal-overlay')) return;
        document.title = PAYMENT_ORIGINAL_TITLE;
    };
    window.addEventListener("popstate", popstateHandler);

    const closePayment = () => {
        document.title = PAYMENT_ORIGINAL_TITLE;
        history.pushState({}, "", window.location.pathname);
        window.removeEventListener("popstate", popstateHandler);
        overlay.remove();
    };

    document.getElementById('close-modal').onclick = closePayment;

    overlay.onclick = (e) => {
        if (e.target === overlay) closePayment();
    };

    document.querySelectorAll(".payment-toggle").forEach(toggle => {

        toggle.addEventListener("click", () => {

            const content = toggle.nextElementSibling;
            const arrow = toggle.querySelector(".arrow");

            content.classList.toggle("hidden");
            arrow.classList.toggle("rotate-180");

        });

    });

    document.getElementById('confirm-btn').onclick = async () => {
        const btn = document.getElementById('confirm-btn');
        btn.disabled = true;
        btn.innerHTML = `
            <div class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span class="text-[12px]">
                    LOADING QRIS...
                </span>
            </div>
        `;
        try {
            const res = await fetch('/api/save-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...data,
                    status: 'pending',
                    paymentMethod: 'QRIS'
                })
            });
            const result = await res.json();
            if (result.success) {
                tampilkanQRIS({
                    ...data,
                    orderId: result.orderId
                });
            }
        } catch (e) {
            showIosModal("Server sedang sibuk");
            btn.disabled = false;
            btn.innerHTML = `CONFIRM`;
        }
    };

    async function tampilkanQRIS(data) {
        const orderId = data.orderId;
        document.title = "Scan QRIS - Northline";
        history.pushState({ payment: "qris", orderId }, "", `?payment=qris&order=${orderId}`);

        const modal = document.querySelector('#payment-modal-overlay > div');
        let timerInterval;
        let pollInterval;
        window.handleCancel = async (id) => {
            try {
                const res = await fetch(`/api/cancel-order/${id}`, {
                    method: 'DELETE'
                });

                const result = await res.json();

                if (result.success) {
                    showIosModal("Pesanan dibatalkan.");

                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);

                } else {
                    showIosModal("Gagal membatalkan: " + result.message);
                }

            } catch (e) {
                showIosModal("Terjadi kesalahan sistem!");
            }
        };
        modal.innerHTML = `
        <div class="flex flex-col h-full bg-[#f4f4f4]">
            <div class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                    <h1 class="text-[15px] font-semibold text-gray-800">
                        Pembayaran QRIS
                    </h1>
                    <p class="text-[11px] text-gray-400 mt-0.5">
                        Selesaikan pembayaran sebelum expired
                    </p>
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
                <div class="bg-white shadow-sm border border-gray-100 p-4 mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <p class="text-[11px] text-gray-400">
                                Invoice ID
                            </p>
                            <h2 class="text-[13px] font-bold text-gray-800 mt-1">
                                ${orderId}
                            </h2>
                        </div>
                        <div class="bg-gray-50 text-gray-500 text-[10px] px-2 py-1 font-bold">
                            PENDING
                        </div>
                    </div>
                    <div class="space-y-2 text-[12px]">
                        <div class="flex items-center justify-between">
                            <span class="text-gray-400">
                                Metode
                            </span>
                            <span class="font-medium text-gray-700">
                                QRIS ALL PAYMENT
                            </span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-gray-400">
                                Tanggal
                            </span>
                            <span class="font-medium text-gray-700">
                                ${new Date().toLocaleDateString('id-ID')}
                            </span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-gray-400">
                                Jam
                            </span>
                            <span class="font-medium text-gray-700">
                                ${new Date().toLocaleTimeString('id-ID')}
                            </span>
                        </div>
                        ${data.isDiscounted ? `
                        <div class="flex items-center justify-between">
                            <span class="text-gray-400">
                                Subtotal
                            </span>
                            <span class="font-medium text-gray-700">
                                IDR ${new Intl.NumberFormat('id-ID').format(data.subtotal)}
                            </span>
                        </div>

                        <div class="flex items-center justify-between">
                            <span class="text-gray-600">
                                Diskon 5%
                            </span>
                            <span class="font-semibold text-gray-600">
                                - IDR ${new Intl.NumberFormat('id-ID').format(data.discountAmount)}
                            </span>
                        </div>
                        ` : ''}

                        <div class="flex items-center justify-between pt-2 border-t mt-2">
                            <span class="text-gray-500 font-medium">
                                Total Bayar
                            </span>
                            <span class="text-[16px] font-bold text-gray-500">
                                IDR ${new Intl.NumberFormat('id-ID').format(data.totalPrice)}
                            </span>
                        </div>
                    </div>
                </div>
                ${data.isDiscounted ? `
                <div class="mb-4 bg-gray-50 border border-gray-200 p-4">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">🎉</span>
                        <div>
                            <h3 class="font-semibold text-gray-700">
                                Selamat!
                            </h3>
                            <p class="text-xs text-gray-600 mt-1">
                                Kamu termasuk 10 pembeli pertama dan mendapat diskon 5%.
                            </p>
                        </div>
                    </div>
                </div>
                ` : ''}
                <div class="bg-white shadow-sm border border-gray-100 p-5 text-center">
                    <div class="flex items-center justify-center gap-2 mb-2">
                        <span class="text-[11px] text-gray-500 uppercase tracking-wide">
                            Menunggu Pembayaran
                        </span>
                    </div>
                    <h2 class="text-[18px] font-bold text-gray-800">
                        Scan QRIS
                    </h2>
                    <p class="text-[11px] text-gray-400 mt-1 mb-4 leading-4">
                        Gunakan Dana, OVO, Gopay, ShopeePay,
                        M-Banking atau aplikasi pembayaran lainnya
                    </p>
                    <div class="bg-gray-50 border border-gray-100 py-3 mb-5">
                        <p class="text-[10px] text-gray-400 uppercase">
                            Pembayaran Berakhir Dalam
                        </p>
                        <div id="timer"
                            class="text-[26px] font-bold text-gray-500 tracking-wider mt-1">
                            10:00
                        </div>
                    </div>
                    <div class="bg-white shadow-sm rounded-2xl mb-5">
                        <img 
                            id="qris-image"
                            src="https://nl.hostinesia.my.id/public/image/Northline_Qr.jpeg"
                            class="w-full rounded-2xl shadow-sm object-contain"
                            alt="QRIS"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <a 
                            href="/image/Northline_Qr.jpeg"
                            download="Northline-QRIS.jpeg"
                            class="h-[35px] border border-gray-200 flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition"
                        >
                            <img 
                                src="https://img.icons8.com/?size=100&id=4717&format=png&color=000000"
                                class="w-5 h-5"
                            />
                            Download
                        </a>
                        <button
                            onclick="window.handleCancel('${orderId}')"
                            class="h-[35px] bg-red-500 hover:bg-red-600 flex items-center justify-center gap-2 text-[12px] font-semibold text-white transition"
                        >
                            <img 
                                src="https://img.icons8.com/?size=100&id=6483&format=png&color=ffffff"
                                class="w-5 h-5"
                            />
                            Batalkan
                        </button>
                    </div>
                </div>
                <div class="mt-4 bg-gray-50 border border-gray-200 p-4">
                    <div class="flex items-start gap-3">
                        <img 
                            src="https://img.icons8.com/?size=100&id=77&format=png&color=000000"
                            class="w-5 h-5 mt-0.5"
                        />
                        <div>
                            <h3 class="text-[13px] text-gray-700">
                                Informasi Pembayaran
                            </h3>
                            <ul class="mt-2 space-y-1 text-[12px] text-gray-600 leading-5">
                                <li class="flex items-start gap-1.5">
                                    <span class="flex items-center justify-center w-4 h-4">
                                        <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png"/>
                                    </span>
                                    <span>Pastikan nominal pembayaran sesuai</span>
                                </li>

                                <li class="flex items-start gap-1.5">
                                    <span class="flex items-center justify-center w-4 h-4">
                                        <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png"/>
                                    </span>
                                    <span>QRIS hanya berlaku 10 menit</span>
                                </li>

                                <li class="flex items-start gap-1.5">
                                    <span class="flex items-center justify-center w-4 h-4">
                                        <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png"/>
                                    </span>
                                    <span>Setelah bayar status otomatis berubah</span>
                                </li>

                                <li class="flex items-start gap-1.5">
                                    <span class="flex items-center justify-center w-4 h-4">
                                        <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png"/>
                                    </span>
                                    <span>Jangan tutup halaman sebelum pembayaran selesai</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>

            <div id="ios-warning-modal"
                class="fixed top-0 left-1/2 -translate-x-1/2 z-[9999]
                translate-y-[-120%] opacity-0
                transition-all duration-500 ease-out">

                <div id="notif-card"
                    class="w-[346px] mt-3 px-4 py-3
                    bg-white backdrop-blur-md shadow-xl
                    flex items-center gap-3
                    cursor-grab active:cursor-grabbing">
                    <img 
                        src="https://nl.hostinesia.my.id/public/icons/NorthlineIcon.jpg"
                        class="w-8 h-8">
                    <div class="flex-1 min-w-0 text-white">
                        <div class="flex justify-between items-center">
                            <h3 id="ios-modal-title"
                                class="text-[13px] text-black">
                                Northline
                            </h3>
                            <span id="notif-time"
                                class="text-[11px] text-gray-300 cursor-pointer flex items-center gap-1">
                                Just now 
                                <img id="arrow"
                                    src="https://img.icons8.com/?size=100&id=40021&format=png&color=000000"
                                    class="w-2 h-2 transition-transform duration-200">
                            </span>
                        </div>
                        <p id="ios-modal-message"
                            class="text-[11px] text-gray-500 truncate w-full">
                            Message...
                        </p>
                    </div>

                </div>
            </div>
        `;

        let timeLeft = 600; 
        timerInterval = setInterval(() => {
            timeLeft--;
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            const timerEl = document.getElementById('timer');
            if (timerEl) timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                clearInterval(pollInterval);
                showIosModal("Waktu habis! Transaksi dibatalkan.");
                document.getElementById('payment-modal-overlay')?.remove();
            }
        }, 1000);

        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-order/${orderId}?t=${Date.now()}`);
                const result = await res.json();
                if (result.status === 'success') {
                    clearInterval(timerInterval);
                    clearInterval(pollInterval);
                    tampilkanInvoiceSuccess({
                        orderId: result.order?.order_id || orderId,
                        productName: result.order?.product_name || data.productName,
                        totalPrice: result.order?.total_price || data.totalPrice,
                        quantity: result.order?.quantity || data.quantity,
                        color: result.order?.chosen_color || data.chosenColor,
                        size: result.order?.chosen_size || data.chosenSize,

                        productImage:
                            result.order?.product_image ||
                            data.productImage ||
                            document.getElementById("main-preview")?.src ||
                            "/public/icons/default.png",

                        subtotal: data.subtotal,
                        discountAmount: data.discountAmount || 0,
                        isDiscounted: data.isDiscounted || false,

                        createdAt: result.order?.created_at || new Date()
                    });
                }
            } catch (e) {
                console.error("Polling error:", e);
            }
        }, 3000);
    }

    function tampilkanInvoiceSuccess(invoice) {
        document.title = "Pembayaran Berhasil - Northline";
        history.pushState({ payment: "success", orderId: invoice.orderId }, "", `?payment=success&order=${invoice.orderId}`);

        const modal = document.querySelector('#payment-modal-overlay > div');
        const formatPrice = new Intl.NumberFormat('id-ID').format(invoice.totalPrice);
        const formatDate = new Date(invoice.createdAt).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        modal.innerHTML = `
            <div class="flex flex-col h-full bg-gray-100">
                <div class="bg-gradient-to-b from-gray-300 to-gray-50 px-6 pt-10 pb-16 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-10"></div>
                    <div class="relative z-10 flex flex-col items-center text-center">
                        <div class="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg mb-4">
                            <img 
                                src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=DF414F"
                                class="w-12 h-12"
                            />
                        </div>
                        <h1 class="text-black text-[22px] font-bold">
                            Pembayaran Berhasil
                        </h1>
                        <p class="text-black text-[13px]">
                            Invoice pembayaran berhasil dibuat
                        </p>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto px-4 -mt-10 relative z-20">
                    <div class="bg-white shadow-lg p-5 border border-gray-100">
                        <div class="flex items-center justify-between border-b pb-3">
                            <div>
                                <p class="text-[12px] text-gray-400">
                                    ORDER ID
                                </p>
                                <h2 class="text-[14px] font-bold text-gray-800 mt-1">
                                    ${invoice.orderId}
                                </h2>
                            </div>
                            <div class="bg-gray-50 text-gray-500 px-3 py-1 text-[11px] font-semibold">
                                SUCCESS
                            </div>
                        </div>
                        <div class="py-4 border-b">
                            <div class="flex gap-3">
                                <div class="w-16 h-16 bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                                    <img
                                        src="${invoice.productImage}"
                                        class="w-full h-full object-cover"
                                        onerror="this.src='/public/icons/default.png'"
                                    />
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-[14px] text-gray-800 leading-5">
                                        ${invoice.productName}
                                    </h3>
                                    <div class="flex gap-2 mt-2 flex-wrap">
                                        <span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                                            ${invoice.color}
                                        </span>
                                        <span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                                            ${invoice.size}
                                        </span>
                                        <span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                                            ${invoice.quantity}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="py-4 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-[13px] text-gray-500">
                                    Tanggal
                                </span>
                                <span class="text-[13px] font-medium text-gray-700">
                                    ${formatDate}
                                </span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-[13px] text-gray-500">
                                    Metode Pembayaran
                                </span>
                                <span class="text-[13px] font-medium text-gray-700">
                                    QRIS
                                </span>
                            </div>
                            ${invoice.isDiscounted ? `
                            <div class="flex items-center justify-between">
                                <span class="text-[13px] text-gray-500">
                                    Subtotal
                                </span>
                                <span class="text-[13px] font-medium text-gray-700">
                                    IDR ${new Intl.NumberFormat('id-ID').format(invoice.subtotal)}
                                </span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-[13px] text-gray-500">
                                    Diskon 5%
                                </span>
                                <span class="text-[13px] font-semibold text-gray-700">
                                    - IDR ${new Intl.NumberFormat('id-ID').format(invoice.discountAmount)}
                                </span>
                            </div>
                            ` : ''}
                            <div class="flex items-center justify-between pt-3 border-t">
                                <span class="text-[14px] font-semibold text-gray-800">
                                    Total Pembayaran
                                </span>
                                <span class="text-[18px] font-bold text-gray-700">
                                    IDR ${formatPrice}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-4 bg-white shadow-sm p-4 border border-gray-100">
                        <h3 class="text-[13px] font-semibold text-gray-700 mb-3">
                            Bagikan Invoice
                        </h3>
                        <div class="flex items-center justify-center gap-6">
                        <button class="share-btn flex flex-col items-center gap-1"
                            data-platform="share">
                            <img 
                                src="https://img.icons8.com/?size=100&id=82713&format=png&color=000000"
                                class="w-6 h-6"
                            />
                            <span class="text-[11px] text-gray-500">
                                Share
                            </span>
                        </button>
                        <button class="share-btn flex flex-col items-center gap-1"
                            data-platform="copy">
                            <img 
                                src="https://img.icons8.com/?size=100&id=59773&format=png&color=000000"
                                class="w-6 h-6"
                            />
                            <span class="text-[11px] text-gray-500">
                                Copy
                            </span>
                        </button>
                    </div>
                    </div>
                </div>
                <div class="p-4 bg-white border-t border-gray-200">
                    <button id="close-success"
                        class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
                        CLOSE
                    </button>
                </div>
            </div>

            <div id="ios-warning-modal"
                class="fixed top-0 left-1/2 -translate-x-1/2 z-[9999]
                translate-y-[-120%] opacity-0
                transition-all duration-500 ease-out">

                <div id="notif-card"
                    class="w-[346px] mt-3 px-4 py-3
                    bg-white backdrop-blur-md shadow-xl
                    flex items-center gap-3
                    cursor-grab active:cursor-grabbing">
                    <img 
                        src="https://nl.hostinesia.my.id/public/icons/NorthlineIcon.jpg"
                        class="w-8 h-8">
                    <div class="flex-1 min-w-0 text-white">
                        <div class="flex justify-between items-center">
                            <h3 id="ios-modal-title"
                                class="text-[13px] text-black">
                                Northline
                            </h3>
                            <span id="notif-time"
                                class="text-[11px] text-gray-300 cursor-pointer flex items-center gap-1">
                                Just now 
                                <img id="arrow"
                                    src="https://img.icons8.com/?size=100&id=40021&format=png&color=000000"
                                    class="w-2 h-2 transition-transform duration-200">
                            </span>
                        </div>
                        <p id="ios-modal-message"
                            class="text-[11px] text-gray-500 truncate w-full">
                            Message...
                        </p>
                    </div>

                </div>
            </div>
        `;
        document.getElementById('close-success').onclick = () => {
            window.location.reload();
        };
        document.querySelectorAll('.share-btn').forEach(btn => {
            btn.onclick = (e) => handleShare(btn);
        });
        async function handleShare(btn) {
            const platform = btn.dataset.platform;
            const text =
                "🧾 INVOICE NORTHLINE\n\n" +
                "Order ID: " + invoice.orderId + "\n" +
                "Product: " + invoice.productName + "\n" +
                "Color: " + invoice.color + "\n" +
                "Size: " + invoice.size + "\n" +
                "Qty: " + invoice.quantity + "\n" +
                "Total: Rp " + formatPrice + "\n\n" +
                "Status: SUCCESS ✅";
            try {
                if (platform === 'copy') {
                    await navigator.clipboard.writeText(text);
                    showGlobalModal('Invoice copied!');
                    return;
                }
                if (platform === 'share') {
                try {
                    const file = await captureInvoiceAsImage();
                    if (navigator.share) {
                        await navigator.share({
                            title: 'Invoice Northline',
                            text: 'Invoice pembayaran berhasil',
                            files: [file]
                        });
                    } else {
                        downloadFile(file);
                    }
                } catch (err) {
                    console.log(err);
                    showIosModal('Share gagal');
                }
            }
            } catch (err) {
                console.log(err);
                showIosModal('Share gagal');
            }
        }
        async function captureInvoiceAsImage() {
            const modalContent = document.querySelector('#payment-modal-overlay > div');
            const canvas = await html2canvas(modalContent, {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                backgroundColor: "#f5f5f5",
                logging: false,
                imageTimeout: 5000,
                removeContainer: true
            });
            return new Promise(resolve => {
                canvas.toBlob(blob => {
                    const file = new File([blob], "invoice.png", { type: "image/png" });
                    resolve(file);
                }, "image/png", 0.92);
            });
        }
        function downloadFile(file) {
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'invoice.png';
            a.click();
            URL.revokeObjectURL(url);
        }
        
    }

    function showGlobalModal(message, title = "Informasi") {
        const modal = document.getElementById('ios-warning-modal');
        const modalBox = document.getElementById('ios-modal-box');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');

        titleEl.innerText = title;
        msgEl.innerText = message;

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalBox.classList.remove('scale-90');
        }, 10);
    }

    function closeIosModal() {
        const modal = document.getElementById('ios-warning-modal');
        const modalBox = document.getElementById('ios-modal-box');

        modal.classList.add('opacity-0');
        modalBox.classList.add('scale-90');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
};
