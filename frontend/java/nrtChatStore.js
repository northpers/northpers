function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

const socket = io();
const container = document.getElementById("chat-messages");
const scrollContainer =
    document.getElementById("chat-scroll-container");
const renderedMessages = new Set(); 

let currentUserId = null;
let currentUserData = null;
let aiTimeoutId = null;

socket.on("typing", (data) => {
    showTyping(data.isTyping);
    updateSellerStatus(
        data.isTyping
    );
});
socket.on("new_message", (data) => {
    if (renderedMessages.size === 0 && !currentUserId) return;
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
    const content =
    msg.type === "product"
        ? `
        <div class="border rounded-xl overflow-hidden bg-white shadow-sm max-w-[240px]">

            <img
                src="${msg.message.img}"
                class="w-full object-contain bg-white">

            <div class="p-2 space-y-1">

                <h4 class="text-[13px] font-medium">
                    ${msg.message.name}
                </h4>

                <p class="text-[11px] text-neutral-500">
                    ${msg.message.price}
                </p>

                <div class="flex gap-1 text-[10px] text-neutral-400">
                    <span>${msg.message.color}</span>
                    <span>|</span>
                    <span>${msg.message.size}</span>
                    <span>|</span>
                    <span>${msg.message.model}</span>
                </div>

                <button
                    onclick="openProductDetail('${msg.message.id}')"
                    class="mt-2 text-[11px] text-blue-500>
                    Lihat Produk
                </button>

            </div>

        </div>
    `
        : msg.type === "image"
        ? `
            <img
                src="${msg.message}"
                class="max-w-[220px] rounded-lg">
        `
        : `
            <span>${escapeHtml(msg.message)}</span>
        `;
    const aiLabel = isAI ? '<div class="text-[10px] text-blue-500 mt-1">Northline Assistant</div>' : '';
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

async function deleteMessage(msgId, rowEl) {
    const isNumeric = /^\d+$/.test(String(msgId));
    if (isNumeric) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        try {
            const res = await fetch(`/api/chat/message/${msgId}`, {
                method: "DELETE",
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
    if (!user) {
        showIosModal("Anda belum login! Silakan login terlebih dahulu untuk mengirim pesan.");
        return;
    }
    if (!message) return;
    const time = getCurrentTime();
    appendMessage({ sender: 'user', message, time });
    input.value = "";
    const cacheKey = STORAGE_KEYS.CHAT_HISTORY(user.id);
    const history = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    history.push({ sender: 'user', message, time });
    localStorage.setItem(cacheKey, JSON.stringify(history));

    let beforeUnread = 0;
    try {
        const resp = await fetch(`/api/chat/unread/${user.id}`);
        const data = await resp.json();
        beforeUnread = data.unread || 0;
    } catch (err) {
        console.error("Gagal cek unread", err);
    }

    try {
        await fetch("/api/chat/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, message })
        });
    } catch (err) {
        console.error("Gagal kirim", err);
    }

    scheduleAIReply(user.id, message, beforeUnread);
}

async function scheduleAIReply(userId, message, beforeUnread) {
    if (aiTimeoutId) clearTimeout(aiTimeoutId);
    aiTimeoutId = setTimeout(async () => {
        aiTimeoutId = null;
        try {
            const resp = await fetch(`/api/chat/unread/${userId}`);
            const data = await resp.json();
            if (data.unread > beforeUnread) return;

            const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY(userId)) || "[]");
            const recentHistory = history.slice(-6).map(m => ({ role: m.sender === 'user' ? 'user' : 'bot', text: m.message }));

            const aiResp = await fetch(_d('9kzs9k ~r9mrk~'), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, history: recentHistory, mode: 'store' })
            });
            const aiData = await aiResp.json();
            const reply = aiData.reply || "Silakan hubungi admin Northline untuk informasi lebih lanjut.";

            const time = getCurrentTime();
            const aid = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

            let saved = false;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await fetch("/api/chat/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId, message: reply, sender: 'ai', _clientId: aid })
                    });
                    saved = true;
                    break;
                } catch (e) {
                    if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
                }
            }
            if (!saved) return;

            showTyping(true);
            await new Promise(r => setTimeout(r, 1500));

            appendMessage({ sender: 'ai', message: reply, time, id: aid });
            showTyping(false);

            const cacheKey = STORAGE_KEYS.CHAT_HISTORY(userId);
            const chatHistory = JSON.parse(localStorage.getItem(cacheKey) || "[]");
            chatHistory.push({ sender: 'ai', message: reply, time, id: aid });
            localStorage.setItem(cacheKey, JSON.stringify(chatHistory));

            scrollToBottom();
        } catch (err) {
            console.error("AI reply gagal:", err);
        }
    }, 20000);
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
        const response = await fetch(`/api/chat/${user.id}`);
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
            `/api/chat/unread/${user.id}`
        );
        const result =
            await response.json();
        const dot =
            document.getElementById(
                "chat-notification-store"
            );
        dot.classList.toggle(
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
        `/api/chat/read/${user.id}`,
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
        showIosModal(
            "Anda belum login."
        );
        return;
    }
    try {
        container.innerHTML = "";
        renderedMessages.clear();

        localStorage.removeItem(
            STORAGE_KEYS.CHAT_HISTORY(user.id)
        );
        const response = await fetch(
            `/api/admin/chat/${user.id}`,
            {
                method: "DELETE"
            }
        );
        const result =
            await response.json();
        if (result.success) {
            showIosModal(
                "Chat berhasil dihapus."
            );
        } else {
            showIosModal(
                "Gagal menghapus chat."
            );
        }
    } catch (err) {
        console.error(err);
        showIosModal(
            "Terjadi kesalahan saat menghapus chat."
        );
    }
}

document
.getElementById("image-upload")
.addEventListener("change", uploadImage);

async function uploadImage(e){

    const file = e.target.files[0];
    if(!file) return;

    const user = currentUserData;

    const formData = new FormData();

    formData.append("image", file);
    formData.append("userId", user.id);

    try{

        await fetch(
            "/api/chat/upload",
            {
                method:"POST",
                body:formData
            }
        );

    }catch(err){
        console.error(err);
    }
}

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

    const wishlist =
        JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];

    const userName = getCurrentUserName();

    const greeting = userName
        ? `Hii kak <span class="text-neutral-900">${userName}</span> 👋 Terima kasih sudah berkunjung.`
        : `Hii kak 👋 Terima kasih sudah berkunjung.`;

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
                onclick="openProductDetail('${product.productId || product.id}')"
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

                    <button onclick="event.stopPropagation(); openProductDetail('${product.productId || product.id}')" class="text-[11px] text-[#4f8cff] mt-2 underline">
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
            class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
            Promo?
        </button>

        <button onclick="sendQuickMessage('Bisa COD?')"
            class="whitespace-nowrap px-3 py-1 text-[#4f8cff] text-[13px] bg-neutral-100 rounded-[10px]">
            COD?
        </button>
    `;
}

function showWishlistProducts() {
    const items =
        JSON.parse(
            localStorage.getItem(
                STORAGE_KEYS.WISHLIST
            )
        ) || [];
    const modal =
        document.getElementById(
            "wishlist-chat-modal"
        );
    const list =
        document.getElementById(
            "wishlist-chat-list"
        );
    list.innerHTML = "";
    if(items.length === 0){
        list.innerHTML = `
            <div class="text-center py-8 text-neutral-500 text-sm">
                Wishlist kosong
            </div>
        `;
    }else{
        items.forEach(item => {
            list.insertAdjacentHTML(
                "beforeend",
                `
                <button
                    onclick="sendWishlistProduct('${item.id}')"
                    class="
                        w-full
                        flex
                        items-center
                        gap-3
                        p-3
                        border
                        text-left
                        bg-white
                        shadow-sm
                    ">
                    <img
                        src="${item.img}"
                        class="w-14 h-14 object-cover border">
                    <div class="flex-1">
                        <h4 class="text-[13px]">
                            ${item.name}
                        </h4>
                        <p class="text-[12px] text-neutral-500">
                            ${item.price}
                        </p>
                    </div>
                </button>
                `
            );
        });
    }
    modal.classList.remove("hidden");
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

async function sendWishlistProduct(id) {
    const items =
        JSON.parse(
            localStorage.getItem(
                STORAGE_KEYS.WISHLIST
            )
        ) || [];
    const product =
        items.find(item => item.id === id);
    if (!product) return;
    if (!currentUserData?.id) return;
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
        await fetch("/api/chat/send", {
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