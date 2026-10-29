function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

const socket = io();
const container = document.getElementById("chat-messages");
const scrollContainer =
    document.getElementById("chat-scroll-container");
const renderedMessages = new Set(); 

let currentUserId = null;
let currentUserData = null;
let aiTimeoutId = null;
let pendingChatImage = null;
let pendingChatImageUrl = null;
let chatImageSending = false;
let pendingImageBubbleId = null;
let pendingImageBubbleUrl = null;

socket.on("typing", (data) => {
    showTyping(data.isTyping);
    updateSellerStatus(
        data.isTyping
    );
});
socket.on("new_message", (data) => {
    if (renderedMessages.size === 0 && !currentUserId) return;
    if (data.type === "image" && pendingImageBubbleId) {
        reconcilePendingImage(data);
        return;
    }
    appendMessage(data);
});
socket.on("chat_deleted", () => {
    renderedMessages.clear();
    document.getElementById(
        "chat-messages"
    ).innerHTML = "";
});
socket.on("message_deleted", (data) => {
    const el = container.querySelector(`.chat-row[data-id="${data.messageId}"]`);
    if (el) {
        el.remove();
        renderedMessages.delete(data.messageId);
    }
});
socket.on(
    "chat_notification",
    () => {
        document
            .getElementById(
                "chat-notification-store"
            )
            ?.classList.remove(
                "hidden"
            );
    }
);

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        scrollContainer.scrollTop =
            scrollContainer.scrollHeight;
    });
}

function appendMessage(msg) {
    const msgId =
        msg.id ||
        (msg.message + msg.time);
    if (renderedMessages.has(msgId))
        return;
    renderedMessages.add(msgId);
    const isUser =
        msg.sender === "user";
    const isAI =
        msg.sender === "ai";
    const bubbleClass =
        isUser
            ? "yours"
            : "mine";
    const timestamp =
        msg.time || getCurrentTime();
    const product = msg.type === "product" ? normalizeChatProduct(msg.message) : null;
    const shippingOrder = msg.type === "shipping" && msg.message && typeof msg.message === "object"
        ? msg.message
        : null;
    const content =
    msg.type === "product"
        ? `
        <div class="border rounded-xl overflow-hidden bg-white shadow-sm w-[220px]">
            <img
                src="${escapeHtml(product.image)}"
                alt="${escapeHtml(product.name)}"
                class="w-full h-[190px] object-contain bg-neutral-50">
            <div class="p-3 space-y-1">
                <h4 class="text-[13px] font-medium line-clamp-2">${escapeHtml(product.name)}</h4>
                <p class="text-[13px] font-semibold text-[#DF414F]">${escapeHtml(product.price)}</p>
                ${product.details ? `<p class="text-[11px] text-neutral-500">${escapeHtml(product.details)}</p>` : ""}
                <button type="button" onclick="openProductDetail('${escapeHtml(product.id)}')" class="mt-1 text-[11px] text-[#4f8cff] underline">Lihat Produk</button>
            </div>
        </div>
    `
        : shippingOrder
        ? `
        <div class="border rounded-xl overflow-hidden bg-white shadow-sm w-[260px]">
            <div class="flex gap-3 p-3">
                ${shippingOrder.productImage ? `<img src="${escapeHtml(shippingOrder.productImage)}" alt="" class="w-16 h-16 rounded-lg object-cover bg-neutral-50">` : ""}
                <div class="min-w-0">
                    <p class="text-[10px] text-neutral-500">Pesanan #${escapeHtml(String(shippingOrder.orderId || "-"))}</p>
                    <h4 class="text-[12px] font-medium line-clamp-2">${escapeHtml(shippingOrder.productName || "Pesanan Northline")}</h4>
                    <p class="text-[11px] text-neutral-600 mt-1">${escapeHtml(shippingOrder.deliveryStatus || shippingOrder.paymentStatus || "Status belum tersedia")}</p>
                </div>
            </div>
            <div class="border-t px-3 py-2 space-y-1">
                ${shippingOrder.trackingNumber ? `<p class="text-[11px] text-neutral-600">${escapeHtml(shippingOrder.trackingCourier || "Kurir")}: ${escapeHtml(shippingOrder.trackingNumber)}</p>` : ""}
                <p class="text-[12px] font-medium">Estimasi tiba</p>
                <p class="text-[12px] text-neutral-700">${escapeHtml(formatShippingDate(shippingOrder.estimatedArrival))}</p>
                <p class="text-[10px] text-neutral-500">Estimasi mengikuti pembaruan dari kurir.</p>
                <button type="button" data-confirm-order="${escapeHtml(String(shippingOrder.orderId || ""))}" class="mt-1 w-full rounded-lg bg-[#DF414F] px-3 py-2 text-[11px] font-medium text-white">Konfirmasi ke Admin Northline</button>
            </div>
        </div>
    `
        : msg.type === "image"
        ? `
            <img
                src="${escapeHtml(msg.message)}"
                alt="Foto yang dikirim"
                class="block max-w-[220px] max-h-[280px] rounded-lg object-contain"
                loading="lazy">
            ${msg.caption ? `<span class="image-caption block whitespace-pre-wrap break-words">${escapeHtml(msg.caption)}</span>` : ""}
        `
        : `
            <span>${escapeHtml(msg.message)}</span>
        `;
    const aiLabel = isAI ? '' : '';
    container.insertAdjacentHTML(
        "beforeend",
        `
        <div
            class="flex ${
                isUser
                    ? "justify-end"
                    : "justify-start"
            } mb-1 chat-row"
            data-id="${msgId}">
            <div class="flex flex-col max-w-[95%]">
                <div class="
                    px-3
                    py-2
                    text-[13px]
                    ${bubbleClass}
                    flex flex-col gap-1 chat-bubble
                    cursor-context-menu
                ">
                    ${content}
                    ${aiLabel}
                </div>
                <span class="
                    text-[10px]
                    mt-1
                    text-neutral-500
                    ${
                        isUser
                            ? "text-right"
                            : "text-left"
                    }
                    leading-none
                ">
                    ${timestamp}
                </span>
            </div>
            <div class="chat-delete-menu-placeholder hidden"></div>
        </div>
        `
    );
    const row = container.lastElementChild;
    const confirmOrderButton = row.querySelector("[data-confirm-order]");
    if (confirmOrderButton) {
        confirmOrderButton.addEventListener("click", () => confirmShippingWithAdmin(confirmOrderButton));
    }
    const col = row.querySelector(".flex-col");
    let holdTimer = null;

    function showMenu() {
        closeMenu();
        const menu = document.createElement("div");
        menu.className = "chat-delete-menu bg-white border border-gray-200 rounded shadow-xl py-1 min-w-[140px]";
        if (isUser) menu.style.marginLeft = "auto";
        menu.innerHTML = `
            <button class="delete-msg-btn w-full text-left px-3 py-2 text-xs flex items-center gap-2">
                <img src="https://img.icons8.com/?size=100&id=nerFBdXcYDve&format=png&color=000000" class="w-5 h-5">
                Hapus
            </button>
        `;
        col.appendChild(menu);
        menu.querySelector(".delete-msg-btn").onclick = () => deleteMessage(msgId, row);
        setTimeout(() => {
            document.addEventListener("click", closeMenu, { once: true });
        }, 0);
    }

    function closeMenu() {
        const m = col.querySelector(".chat-delete-menu");
        if (m) m.remove();
    }

    row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        closeMenu();
        showMenu();
    });

    row.addEventListener("touchstart", (e) => {
        holdTimer = setTimeout(() => {
            e.preventDefault();
            closeMenu();
            showMenu();
        }, 500);
    }, { passive: true });

    row.addEventListener("touchend", () => {
        clearTimeout(holdTimer);
    });

    row.addEventListener("touchmove", () => {
        clearTimeout(holdTimer);
    });

    scrollToBottom();
}

function formatShippingDate(value) {
    if (!value) return "Belum tersedia";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function isShippingQuestion(message) {
    return /(pengiriman|paket|resi|kapan.{0,20}(sampai|tiba|datang|dikirim)|berapa lama.{0,20}(kirim|sampai|tiba)|pesanan.{0,30}(status|sampai|tiba|kirim|diantar)|order.{0,30}(status|sampai|tiba|kirim|diantar))/i.test(message);
}

function getShippingOrders(orders, question) {
    const uniqueOrders = new Map();
    for (const order of orders) {
        const orderId = String(order.order_id || "");
        if (!orderId || uniqueOrders.has(orderId)) continue;
        const statusText = `${order.payment_status || ""} ${order.delivery_status || ""}`.toLowerCase();
        if (/\b(batal|dibatalkan|cancelled|canceled)\b/.test(statusText)) continue;
        uniqueOrders.set(orderId, {
            orderId,
            productName: order.product_name,
            productImage: order.product_image,
            paymentStatus: order.payment_status,
            deliveryStatus: order.delivery_status,
            trackingNumber: order.tracking_number,
            trackingCourier: order.tracking_courier,
            estimatedArrival: order.estimated_arrival
        });
    }
    const availableOrders = Array.from(uniqueOrders.values());
    const mentionedId = question.match(/(?:#|(?:order(?:an)?|pesanan)\s*(?:id|nomor)?\s*[:#]?\s*)([a-z0-9-]{4,})/i)?.[1];
    if (mentionedId) {
        const matching = availableOrders.filter(order => order.orderId.toLowerCase() === mentionedId.toLowerCase());
        return matching.slice(0, 3);
    }
    const inProgressOrders = availableOrders.filter(order => !/selesai/i.test(order.deliveryStatus || ""));
    return (inProgressOrders.length ? inProgressOrders : availableOrders.slice(0, 1)).slice(0, 3);
}

async function confirmShippingWithAdmin(button) {
    const user = currentUserData;
    const orderId = button.dataset.confirmOrder;
    if (!user || !orderId || button.disabled) return;
    button.disabled = true;
    button.textContent = "Mengirim konfirmasi...";
    const message = `Mohon konfirmasi status dan estimasi pengiriman untuk pesanan #${orderId}.`;
    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch("/api/chat/send", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: "Bearer " + token } : {})
            },
            body: JSON.stringify({ userId: user.id, sender: "user", message })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Konfirmasi gagal dikirim ke admin.");
        }
        const chatMessage = {
            id: result.id,
            sender: "user",
            type: "text",
            message,
            time: getCurrentTime()
        };
        appendMessage(chatMessage);
        const cacheKey = STORAGE_KEYS.CHAT_HISTORY(user.id);
        const history = JSON.parse(localStorage.getItem(cacheKey) || "[]");
        history.push(chatMessage);
        localStorage.setItem(cacheKey, JSON.stringify(history));
        button.textContent = "Konfirmasi terkirim ke Admin";
    } catch (err) {
        console.error("Gagal mengirim konfirmasi pengiriman:", err);
        button.disabled = false;
        button.textContent = "Konfirmasi ke Admin Northline";
        showIosModal(err.message || "Konfirmasi gagal dikirim ke admin.");
    }
}

function normalizeChatProduct(value) {
    const item = value && typeof value === "object" ? value : {};
    const formatPrice = (price) => {
        if (typeof price === "number") return `Rp${price.toLocaleString("id-ID")}`;
        return typeof price === "string" ? price : "";
    };
    const details = [
        item.color || (Array.isArray(item.colors) ? item.colors.slice(0, 2).join(", ") : ""),
        item.size || (Array.isArray(item.sizes) ? item.sizes.join(", ") : ""),
        item.model || (Array.isArray(item.models) ? item.models.join(", ") : ""),
    ].filter(Boolean).join(" · ");
    return {
        id: String(item.id || item.product_id || ""),
        name: typeof item.name === "string" ? item.name : "Produk Northline",
        image: typeof item.img === "string" ? item.img : (typeof item.image === "string" ? item.image : ""),
        price: formatPrice(item.price),
        details,
    };
}

function reconcilePendingImage(message, temporaryId = pendingImageBubbleId) {
    if (!temporaryId) return;
    const temporaryRow = container.querySelector(`.chat-row[data-id="${temporaryId}"]`);
    const existingRow = message.id
        ? container.querySelector(`.chat-row[data-id="${message.id}"]`)
        : null;
    renderedMessages.delete(temporaryId);
    if (existingRow && existingRow !== temporaryRow) {
        if (temporaryRow) temporaryRow.remove();
        renderedMessages.add(message.id);
    } else if (temporaryRow) {
        temporaryRow.dataset.id = message.id;
        const image = temporaryRow.querySelector(".chat-bubble img");
        if (image) image.src = message.message;
        const caption = temporaryRow.querySelector(".chat-bubble .image-caption");
        if (caption && message.caption) caption.textContent = message.caption;
        renderedMessages.add(message.id);
    }
    if (pendingImageBubbleId === temporaryId) pendingImageBubbleId = null;
    if (pendingImageBubbleUrl) URL.revokeObjectURL(pendingImageBubbleUrl);
    pendingImageBubbleUrl = null;
}

async function deleteMessage(msgId, rowEl) {
    const isNumeric = /^\d+$/.test(String(msgId));
    if (isNumeric) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        try {
            const res = await fetch(_d('9kzs9mrk~9wo}}kqo9') + msgId, {
                method: "DELETE",
                credentials: "include",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) return;
        } catch (e) {
            return;
        }
    }
    rowEl.remove();
    renderedMessages.delete(msgId);
    if (currentUserData) {
        const key = STORAGE_KEYS.CHAT_HISTORY(currentUserData.id);
        try {
            const hist = JSON.parse(localStorage.getItem(key) || "[]");
            const filtered = hist.filter(m => String(m.id) !== String(msgId));
            localStorage.setItem(key, JSON.stringify(filtered));
        } catch (e) {}
    }
}

function showTyping(isTyping) {
    const indicator =
        document.getElementById("typing-indicator");
    if (!indicator) return;
    indicator.classList.toggle(
        "hidden",
        !isTyping
    );
    scrollToBottom();
}

function updateSellerStatus(isTyping) {
    const status =
        document.getElementById(
            "seller-status"
        );
    const onlineDot =
        document.getElementById(
            "online-dot"
        );
    if (!status) return;
    if (isTyping) {
        onlineDot?.classList.add(
            "hidden"
        );
        status.innerHTML = `
            Typing
            <span class="typing-text-dots">
                <span></span>
                <span></span>
                <span></span>
            </span>
        `;
    } else {
        onlineDot?.classList.remove(
            "hidden"
        );
        status.textContent =
            "Online";
    }
}

async function sendMessage() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    const user = currentUserData;
    if (chatImageSending) return;
    if (!user) {
        showIosModal("Anda belum login! Silakan login terlebih dahulu untuk mengirim pesan.");
        return;
    }
    if (!message && !pendingChatImage) return;

    if (pendingChatImage) {
        chatImageSending = true;
        const sendButton = document.getElementById("chat-send-button");
        if (sendButton) sendButton.disabled = true;
        const imageFile = pendingChatImage;
        const caption = message;
        const temporaryBubbleId = `image_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        pendingImageBubbleId = temporaryBubbleId;
        pendingImageBubbleUrl = URL.createObjectURL(imageFile);
        appendMessage({
            id: temporaryBubbleId,
            sender: "user",
            type: "image",
            message: pendingImageBubbleUrl,
            caption,
            time: getCurrentTime()
        });
        clearPendingChatImage();
        input.value = "";
        input.placeholder = "Tulis Pesan...";
        try {
            let beforeUnread = 0;
            try {
                const unreadResp = await fetch(_d('9kzs9mrk~9 x|okn9') + user.id, { credentials: "include" });
                const unreadData = await unreadResp.json();
                beforeUnread = unreadData.unread || 0;
            } catch (err) {
                console.error("Gagal cek unread", err);
            }

            const formData = new FormData();
            formData.append("userId", user.id);
            formData.append("caption", caption);
            formData.append("image", imageFile);
            const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const response = await fetch("/api/chat/upload", {
                method: "POST",
                credentials: "include",
                headers: token ? { Authorization: "Bearer " + token } : {},
                body: formData
            });
            let result;
            try {
                result = await response.json();
            } catch (err) {
                throw new Error("Server tidak dapat memproses gambar. Coba lagi.");
            }
            if (!response.ok || !result.success || !result.imageUrl) {
                throw new Error(result.message || "Gambar gagal dikirim. Coba lagi.");
            }

            const time = getCurrentTime();
            const cacheKey = STORAGE_KEYS.CHAT_HISTORY(user.id);
            const history = JSON.parse(localStorage.getItem(cacheKey) || "[]");
            const imageMessage = {
                id: result.imageId,
                sender: "user",
                type: "image",
                message: result.imageUrl,
                caption: result.caption || "",
                time
            };
            reconcilePendingImage(imageMessage, temporaryBubbleId);
            const existingImageIndex = history.findIndex(item => item.id === temporaryBubbleId || item.id === result.imageId);
            if (existingImageIndex >= 0) history[existingImageIndex] = imageMessage;
            else history.push(imageMessage);
            localStorage.setItem(cacheKey, JSON.stringify(history));

            scheduleAIReply(
                user.id,
                result.caption || "Tolong jelaskan apa yang terlihat pada gambar ini.",
                beforeUnread,
                result.imageUrl
            );
        } catch (err) {
            const pendingRow = container.querySelector(`.chat-row[data-id="${temporaryBubbleId}"]`);
            if (pendingRow) pendingRow.remove();
            renderedMessages.delete(temporaryBubbleId);
            if (pendingImageBubbleId === temporaryBubbleId) pendingImageBubbleId = null;
            if (pendingImageBubbleUrl) URL.revokeObjectURL(pendingImageBubbleUrl);
            pendingImageBubbleUrl = null;
            pendingChatImage = imageFile;
            pendingChatImageUrl = URL.createObjectURL(imageFile);
            document.getElementById("chat-image-preview-img").src = pendingChatImageUrl;
            document.getElementById("chat-image-preview-name").textContent = imageFile.name;
            document.getElementById("chat-image-preview").classList.remove("hidden");
            input.value = caption;
            input.placeholder = "Tambahkan keterangan...";
            console.error("Gagal mengirim gambar:", err);
            showIosModal(err.message || "Gambar gagal dikirim. Coba lagi.");
        } finally {
            chatImageSending = false;
            if (sendButton) sendButton.disabled = false;
        }
        return;
    }

    const time = getCurrentTime();
    appendMessage({ sender: 'user', message, time });
    input.value = "";
    const cacheKey = STORAGE_KEYS.CHAT_HISTORY(user.id);
    const history = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    history.push({ sender: 'user', message, time });
    localStorage.setItem(cacheKey, JSON.stringify(history));

    let beforeUnread = 0;
    try {
        const resp = await fetch(_d('9kzs9mrk~9 x|okn9') + user.id);
        const data = await resp.json();
        beforeUnread = data.unread || 0;
    } catch (err) {
        console.error("Gagal cek unread", err);
    }

    try {
        await fetch(_d('9kzs9mrk~9}oxn'), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, message })
        });
    } catch (err) {
        console.error("Gagal kirim", err);
    }

    scheduleAIReply(user.id, message, beforeUnread);
}

function showTypingBubble() {
    const id = 'ai_typing';
    const existing = document.querySelector(`[data-id="${id}"]`);
    if (existing) return;
    container.insertAdjacentHTML('beforeend', `
        <div class="flex justify-start mb-1 chat-row" data-id="${id}">
            <div class="flex flex-col max-w-[95%]">
                <div class="px-3 py-2 text-[13px] mine flex flex-col gap-1 chat-bubble">
                    <span class="flex items-center gap-1">
                        <span class="typing-dot" style="animation-delay:0s"></span>
                        <span class="typing-dot" style="animation-delay:.15s"></span>
                        <span class="typing-dot" style="animation-delay:.3s"></span>
                    </span>
                </div>
                <span class="text-[10px] mt-1 text-neutral-500 text-left leading-none">AI</span>
            </div>
        </div>
    `);
    scrollToBottom();
}

function removeTypingBubble() {
    const el = document.querySelector('[data-id="ai_typing"]');
    if (el) el.remove();
}

async function scheduleAIReply(userId, message, beforeUnread, imageUrl = null) {
    if (aiTimeoutId) clearTimeout(aiTimeoutId);
    aiTimeoutId = null;

    showTypingBubble();

    try {
        const resp = await fetch(_d('9kzs9mrk~9 x|okn9') + userId);
        const data = await resp.json();
        if (data.unread > beforeUnread) { removeTypingBubble(); return; }

        if (!imageUrl && isShippingQuestion(message)) {
            const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const ordersResponse = await fetch(`/api/user-orders/${encodeURIComponent(userId)}`, {
                credentials: "include",
                headers: token ? { Authorization: "Bearer " + token } : {}
            });
            const ordersResult = await ordersResponse.json();
            if (!ordersResponse.ok || !ordersResult.success) {
                throw new Error(ordersResult.message || "Informasi pesanan gagal dimuat.");
            }
            const shippingOrders = getShippingOrders(
                Array.isArray(ordersResult.orders) ? ordersResult.orders : [],
                message
            );
            if (shippingOrders.length) {
                const cacheKey = STORAGE_KEYS.CHAT_HISTORY(userId);
                const chatHistory = JSON.parse(localStorage.getItem(cacheKey) || "[]");
                for (const order of shippingOrders) {
                    const saveResponse = await fetch("/api/chat/send", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { Authorization: "Bearer " + token } : {})
                        },
                        body: JSON.stringify({
                            userId,
                            sender: "ai",
                            type: "shipping",
                            message: order
                        })
                    });
                    const saveResult = await saveResponse.json();
                    if (!saveResponse.ok || !saveResult.success) {
                        throw new Error(saveResult.message || "Kartu pengiriman gagal ditampilkan.");
                    }
                    const shippingMessage = {
                        id: saveResult.id,
                        sender: "ai",
                        type: "shipping",
                        message: order,
                        time: getCurrentTime()
                    };
                    appendMessage(shippingMessage);
                    chatHistory.push(shippingMessage);
                    localStorage.setItem(cacheKey, JSON.stringify(chatHistory));
                }
                removeTypingBubble();
                scrollToBottom();
                return;
            }
        }

        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY(userId)) || "[]");
        const recentHistory = history.slice(-6).map(m => ({ role: m.sender === 'user' ? 'user' : 'bot', text: m.message }));

        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const aiResp = await fetch(_d('9kzs9k ~r9mrk~'), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(imageUrl && token ? { Authorization: "Bearer " + token } : {})
            },
            body: JSON.stringify({ message, history: recentHistory, mode: 'store', imageUrl, userId })
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) throw new Error(aiData.reply || "Gagal menganalisis gambar.");
        const recommendedProducts = Array.isArray(aiData.products)
            ? aiData.products.filter(product => product && product.id && product.name).slice(0, 4)
            : [];
        const reply = recommendedProducts.length
            ? ""
            : aiData.reply || "Silakan hubungi admin Northline untuk informasi lebih lanjut.";

        const cacheKey = STORAGE_KEYS.CHAT_HISTORY(userId);
        const chatHistory = JSON.parse(localStorage.getItem(cacheKey) || "[]");
        if (reply) {
            const time = getCurrentTime();
            const aid = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            let saved = false;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const saveResponse = await fetch(_d('9kzs9mrk~9}oxn'), {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { Authorization: "Bearer " + token } : {})
                        },
                        body: JSON.stringify({ userId, message: reply, sender: 'ai', _clientId: aid })
                    });
                    const saveResult = await saveResponse.json();
                    if (!saveResponse.ok || !saveResult.success) {
                        throw new Error(saveResult.message || "Balasan AI gagal disimpan.");
                    }
                    saved = true;
                    break;
                } catch (e) {
                    if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
                }
            }
            if (!saved) { removeTypingBubble(); return; }
            removeTypingBubble();
            appendMessage({ sender: 'ai', message: reply, time, id: aid });
            chatHistory.push({ sender: 'ai', message: reply, time, id: aid });
            localStorage.setItem(cacheKey, JSON.stringify(chatHistory));
        } else {
            removeTypingBubble();
        }

        for (const product of recommendedProducts) {
            const productMessage = {
                id: product.id,
                name: product.name,
                price: product.price,
                img: product.image,
                color: Array.isArray(product.colors) ? product.colors.slice(0, 2).join(", ") : "",
                size: Array.isArray(product.sizes) ? product.sizes.join(", ") : "",
                model: Array.isArray(product.models) ? product.models.join(", ") : "",
            };
            const productResponse = await fetch(_d('9kzs9mrk~9}oxn'), {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: "Bearer " + token } : {})
                },
                body: JSON.stringify({
                    userId,
                    sender: "ai",
                    type: "product",
                    message: productMessage
                })
            });
            const productResult = await productResponse.json();
            if (!productResponse.ok || !productResult.success) {
                throw new Error(productResult.message || "Kartu produk gagal disimpan.");
            }
            const productChatMessage = {
                id: productResult.id || `ai_product_${Date.now()}_${product.id}`,
                sender: "ai",
                type: "product",
                message: productMessage,
                time: getCurrentTime()
            };
            appendMessage(productChatMessage);
            chatHistory.push(productChatMessage);
            localStorage.setItem(cacheKey, JSON.stringify(chatHistory));
        }

        scrollToBottom();
    } catch (err) {
        removeTypingBubble();
        console.error("AI reply gagal:", err);
        showIosModal(err.message || (imageUrl ? "AI gagal membaca gambar. Silakan coba lagi." : "Balasan AI gagal diproses."));
    }
}

const chatInput = document.getElementById("chat-input");
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); 
            sendMessage();
        }
    });

async function loadMessages() {
    const user = currentUserData;
    if (!user) return;

    try {
        const response = await fetch(_d('9kzs9mrk~9') + user.id);
        const result = await response.json();

        if (result.messages) {
            container.innerHTML = ""; 
            renderedMessages.clear();
            
            result.messages.forEach(msg => appendMessage(msg));
            localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY(user.id), JSON.stringify(result.messages));

            scrollToBottom();
        }
    } catch (err) {
        console.error("Gagal load dari server", err);
    }
}

window.sendMessage = sendMessage;

document.addEventListener("DOMContentLoaded", () => {
    const timeEl = document.getElementById("current-time");
    if(timeEl) {
        const staticTime = getCurrentTime(); 
        timeEl.innerText = staticTime;
    }
});

function getCurrentTime() {
    return new Date().toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    });
}

async function sendQuickMessage(text) {
    const input = document.getElementById("chat-input");
    input.value = text;
    await sendMessage();
}

async function checkChatNotification() {
    const user = currentUserData;
    if (!user) return;
    try {
        const response = await fetch(
            _d('9kzs9mrk~9 x|okn9') + user.id
        );
        const result =
            await response.json();
        const dot =
            document.getElementById(
                "chat-notification-store"
            );
        if (dot) dot.classList.toggle(
            "hidden",
            result.unread <= 0
        );
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        checkChatNotification();
        setInterval(() => {
            checkChatNotification();
        }, 5000);
    }
);

async function markChatAsRead() {
    const user = currentUserData;
    if (!user) return;
    await fetch(
        _d('9kzs9mrk~9wo}}kqo9') + user.id,
        {
            method: "POST"
        }
    );
    document
        .getElementById(
            "chat-notification-store"
        )
        ?.classList.add(
            "hidden"
        );
}

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        try {
            const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
            if (meRes.ok) {
                const meData = await meRes.json();
                const me = meData.data || meData.user || meData;
                if (me && me.id) {
                    currentUserData = me;
                    currentUserId = me.id;
                    if (typeof renderChatSuggestion === "function") renderChatSuggestion();
                }
            }
        } catch (e) {}
        const user = currentUserData;
        if (user) {
            socket.emit(
                "join",
                user.id
            );
            await loadMessages();
            await markChatAsRead();
        }
    }
);

async function clearCurrentChat() {
    const user = currentUserData;
    if (!user) {
        showIosModal("Anda belum login.");
        return;
    }
    if (!confirm("Yakin ingin menghapus semua chat?")) return;
    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const headers = {};
        if (token) headers.Authorization = "Bearer " + token;
        const response = await fetch(
            '/api/chat/clear/' + user.id,
            {
                method: "DELETE",
                credentials: "include",
                headers
            }
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Chat gagal dihapus. Silakan coba lagi.");
        }
        container.innerHTML = "";
        renderedMessages.clear();
        localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY(user.id));
        showIosModal("Chat berhasil dihapus.");
    } catch (err) {
        console.error(err);
        showIosModal(err.message || "Terjadi kesalahan saat menghapus chat.");
    }
}

function clearPendingChatImage() {
    pendingChatImage = null;
    if (pendingChatImageUrl) URL.revokeObjectURL(pendingChatImageUrl);
    pendingChatImageUrl = null;
    const preview = document.getElementById("chat-image-preview");
    const image = document.getElementById("chat-image-preview-img");
    if (preview) preview.classList.add("hidden");
    if (image) image.removeAttribute("src");
    const input = document.getElementById("image-upload");
    if (input) input.value = "";
}

function uploadImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
        showIosModal("Format gambar harus JPEG, PNG, GIF, atau WebP.");
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showIosModal("Ukuran gambar maksimal 5 MB.");
        return;
    }

    if (!currentUserData) {
        showIosModal("Anda belum login! Silakan login terlebih dahulu untuk mengirim gambar.");
        return;
    }
    clearPendingChatImage();
    pendingChatImage = file;
    pendingChatImageUrl = URL.createObjectURL(file);
    document.getElementById("chat-image-preview-img").src = pendingChatImageUrl;
    document.getElementById("chat-image-preview-name").textContent = file.name;
    document.getElementById("chat-image-preview").classList.remove("hidden");
    const input = document.getElementById("chat-input");
    input.placeholder = "Tambahkan keterangan...";
    input.focus();
}

document.getElementById("image-upload").addEventListener("change", uploadImage);
document.getElementById("chat-image-remove").addEventListener("click", () => {
    clearPendingChatImage();
    document.getElementById("chat-input").placeholder = "Tulis Pesan...";
});

function getCurrentUserName() {
    try {
        const session = currentUserData;

        return (
            session?.name ||
            session?.full_name ||
            session?.username ||
            null
        );
    } catch (e) {
        return null;
    }
}

function renderChatSuggestion() {
    const container = document.getElementById("chat-product-suggestion");
    const quickReplies = document.getElementById("quick-replies-bubble");

    if (!container || !quickReplies) return;

    const userName = getCurrentUserName();

    const greeting = userName
        ? `Hii kak <span class="text-neutral-900">${userName}</span> 👋 Terima kasih sudah berkunjung.`
        : `Hii kak 👋 Terima kasih sudah berkunjung.`;

    getWishlistItems(function(wishlist) {
        if (!wishlist.length) {
            container.innerHTML = `
                <div>
                    <h3 class="text-[13px] text-neutral-800">
                        ${greeting}
                    </h3>
                </div>
            `;
            quickReplies.innerHTML = `
                <button onclick="sendQuickMessage('Apakah ini ready stock?')"
                    class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
                    Ready stock?
                </button>
                <button onclick="sendQuickMessage('Ada promo?')"
                    class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] mb-1 bg-neutral-100 rounded-[10px]">
                    Ada promo?
                </button>
                <button onclick="sendQuickMessage('Bisa COD?')"
                    class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
                    Bisa COD?
                </button>
                <button onclick="sendQuickMessage('Berapa lama pengiriman?')"
                    class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] mb-1 bg-neutral-100 rounded-[10px]">
                    Estimasi pengiriman
                </button>
            `;
            return;
        }

        const product = wishlist[wishlist.length - 1];

        const img =
            product.img &&
            (product.img.startsWith("/") || product.img.startsWith("http"))
                ? product.img
                : `/public/image/${product.img}`;

        container.innerHTML = `
            <div class="mb-1">

                <h3 class="text-[13px] text-neutral-800 mb-3">
                    ${greeting}
                </h3>

                <div
                    onclick="openProductDetail('${product.product_id || product.id}')"
                    class="border p-2 flex gap-3 cursor-pointer hover:bg-neutral-50 transition">

                    <img
                        src="${img}"
                        onerror="this.src='/public/icons/default.png'"
                        class="w-16 h-16 border object-cover">

                    <div class="flex-1 min-w-0">

                        <div class="text-[13px] line-clamp-2">
                            ${product.name}
                        </div>

                        <div class="text-[12px] text-neutral-500 mt-1">
                            ${product.price}
                        </div>

                        <button onclick="event.stopPropagation(); openProductDetail('${product.product_id || product.id}')" class="text-[11px] text-[#4f8cff] mt-2 underline">
                            Lihat Produk
                        </button>

                    </div>

                </div>

            </div>
        `;

        quickReplies.innerHTML = `
            <button onclick="sendQuickMessage('Apakah ${product.name} masih ready stock?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
                Ready stock?
            </button>

            <button onclick="sendQuickMessage('Apakah ukuran ${product.size || ''} masih tersedia?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] mb-1 bg-neutral-100 rounded-[10px]">
                Ukuran tersedia?
            </button>

            <button onclick="sendQuickMessage('Apakah warna ${product.color || ''} masih tersedia?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
                Warna tersedia?
            </button>

            <button onclick="sendQuickMessage('Kapan produk ini akan dikirim?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] mb-1 bg-neutral-100 rounded-[10px]">
                Kapan dikirim?
            </button>

            <button onclick="sendQuickMessage('Berapa lama estimasi pengiriman?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
                Estimasi
            </button>

            <button onclick="sendQuickMessage('Apakah produk ini original?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] mb-1 bg-neutral-100 rounded-[10px]">
                Original?
            </button>

            <button onclick="sendQuickMessage('Apakah ada promo untuk produk ini?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] mb-1 bg-neutral-100 rounded-[10px]">
                Promo?
            </button>

            <button onclick="sendQuickMessage('Bisa COD?')"
                class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
                COD?
            </button>
        `;
    });
}

function showWishlistProducts() {
    const modal = document.getElementById("wishlist-chat-modal");
    const list = document.getElementById("wishlist-chat-list");
    list.innerHTML = "";

    getWishlistItems(function(items) {
        if (items.length === 0) {
            list.innerHTML = `
                <div class="text-center py-8 text-neutral-500 text-sm">
                    Wishlist kosong
                </div>
            `;
        } else {
            items.forEach(function(item) {
                list.insertAdjacentHTML("beforeend", `
                    <button
                        onclick="sendWishlistProductByData('${encodeURIComponent(JSON.stringify(item).replace(/'/g, "\\'"))}')"
                        class="w-full flex items-center gap-3 p-3 border text-left bg-white shadow-sm">
                        <img src="${item.img}" class="w-14 h-14 object-cover border">
                        <div class="flex-1">
                            <h4 class="text-[13px]">${item.name}</h4>
                            <p class="text-[12px] text-neutral-500">${item.price}</p>
                        </div>
                    </button>
                `);
            });
        }
        modal.classList.remove("hidden");
    });
}

document
    .getElementById(
        "wishlist-chat-modal"
    )
    .addEventListener(
        "click",
        (e) => {
            if(
                e.target.id ===
                "wishlist-chat-modal"
            ){
                e.currentTarget
                    .classList
                    .add("hidden");
            }
        }
    );

function sendWishlistProductByData(encodedData) {
    let product;
    try {
        product = JSON.parse(decodeURIComponent(encodedData));
    } catch(e) { return; }
    if (!product || !product.name) return;
    sendWishlistProduct(product);
}

async function sendWishlistProduct(product) {
    if (!product || !currentUserData?.id) return;
    const payload = {
        type: "product",
        message: {
            id: product.id,
            name: product.name,
            price: product.price,
            img: product.img,
            color: product.color || "-",
            size: product.size || "-",
            model: product.model || "-"
        }
    };
    appendMessage({
        sender: "user",
        type: "product",
        message: payload.message
    });
    document
        .getElementById("wishlist-chat-modal")
        .classList.add("hidden");
    try {
        await fetch(_d('9kzs9mrk~9}oxn'), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userId: currentUserData?.id,
                message: payload.message,
                type: "product"
            })
        });
    } catch (err) {
        console.error(err);
    }
}

window.renderChatSuggestion = renderChatSuggestion;
window.sendQuickMessage = sendQuickMessage;
window.clearCurrentChat = clearCurrentChat;