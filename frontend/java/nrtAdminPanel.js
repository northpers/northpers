const socket = io();
let currentUserId = null;
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
socket.emit("join_admin");
document.addEventListener("DOMContentLoaded", () => {
    loadChatUsers();
});

async function loadChatUsers() {
    try {
        const response = await fetch("/api/admin/chat-users");
        const users = await response.json();
        const container =
            document.getElementById("chat-user-list");
        const total =
            document.getElementById("total-chat-count");
        container.innerHTML = "";
        total.textContent = `(${users.length})`;
        users.forEach(user => {
            container.insertAdjacentHTML(
                "beforeend",
                `
                <div
                    onclick="openChat(${user.id}, '${user.name}')"
                    class="flex items-center gap-3 px-3 py-3 border-b hover:bg-neutral-50 cursor-pointer">
                    <img
                        src="https://img.icons8.com/?size=100&id=kvqTlMRogUYm&format=png&color=737373"
                        class="w-11 h-11">
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between">
                            <h3 class="text-[14px] truncate">
                                ${escapeHtml(user.name)}
                            </h3>
                            <span class="text-[11px] text-neutral-400">
                                ${escapeHtml(user.time || "")}
                            </span>
                        </div>
                        <p class="text-[12px] text-neutral-500 truncate">
                            ${escapeHtml(user.last_message || "")}
                        </p>
                    </div>
                    ${
                        Number(user.unread) > 0
                        ? `
                        <div
                            class="w-5 h-5 rounded-full bg-[#DF414F] text-white text-[10px] flex items-center justify-center">
                            ${user.unread}
                        </div>
                        `
                        : ""
                    }
                </div>
                `
            );
        });
    } catch (err) {
        console.error(err);
    }
}

async function openChat(userId, userName) {
    currentUserId = userId;
    document.getElementById(
        "current-user-name"
    ).innerText = userName;
    try {
        const response =
            await fetch(`/api/chat/${userId}`);
        const result =
            await response.json();
        const container =
            document.getElementById(
                "admin-chat-messages"
            );
        container.innerHTML = "";
        result.messages.forEach(msg => {
            const isAdmin = msg.sender === "admin";
            const bubbleClass = isAdmin
                ? "chat-user"
                : "chat-admin";
            container.insertAdjacentHTML(
                "beforeend",
                `
                <div class="flex ${
                    isAdmin
                        ? "justify-end"
                        : "justify-start"
                } mb-2">
                    <div class="
                        max-w-[75%]
                        px-3
                        py-2
                        text-[13px]
                        ${bubbleClass}
                    ">
                        ${escapeHtml(msg.message)}
                    </div>
                </div>
                `
            );

        });
        container.scrollTop =
            container.scrollHeight;
    } catch (err) {
        console.error(err);
    }
}

async function sendAdminMessage() {
    if (!currentUserId) {
        alert("Pilih chat terlebih dahulu");
        return;
    }
    const input =
        document.getElementById(
            "admin-message"
        );
    const message =
        input.value.trim();
    if (!message) return;
    try {
        await fetch(
            "/api/admin/send",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    userId: currentUserId,
                    message
                })
            }
        );
        appendAdminBubble({
            sender: "admin",
            message
        });
        input.value = "";
        loadChatUsers();
    } catch (err) {
        console.error(err);
    }
}


function appendAdminBubble(msg) {

    const container =
        document.getElementById("admin-chat-messages");

    const isAdmin =
        msg.sender === "admin";

    const bubbleClass =
        isAdmin ? "chat-user" : "chat-admin";

    let content = "";

    const isProduct =
        msg.type === "product" &&
        msg.message &&
        typeof msg.message === "object";

    if (isProduct) {
        const productName = escapeHtml(msg.message.name || '-');
        const productPrice = escapeHtml(msg.message.price || '-');
        const productImg = escapeHtml(msg.message.img || '');
        const productId = escapeHtml(String(msg.message.id || ''));
        content = `
        <div class="border rounded-xl overflow-hidden bg-white shadow-sm max-w-[260px]">

            <img
                src="${productImg}"
                class="w-full h-32 object-cover">

            <div class="p-2">

                <h4 class="text-[13px] font-medium">
                    ${productName}
                </h4>

                <p class="text-[12px] text-neutral-500">
                    ${productPrice}
                </p>

                <button
                    class="mt-2 text-[11px] text-blue-500"
                    onclick="openProductDetail('${productId}')">
                    Lihat Produk
                </button>

            </div>

        </div>
        `;
    }

    else if (msg.type === "image") {
        content = `
            <img src="${escapeHtml(msg.message)}" class="max-w-[220px] rounded-lg">
        `;
    }

    else {
        content = `<span>${escapeHtml(msg.message)}</span>`;
    }

    container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="flex ${isAdmin ? "justify-end" : "justify-start"} mb-2">

            <div class="max-w-[75%] px-3 py-2 text-[13px] ${bubbleClass}">
                ${content}
            </div>

        </div>
        `
    );

    container.scrollTop = container.scrollHeight;
}

socket.on(
    "new_message",
    (data) => {
        loadChatUsers();
        if (
            currentUserId &&
            Number(currentUserId) === Number(data.userId)
        ) {
            appendAdminBubble(data);
        }
    }
);

const adminInput =
    document.getElementById("admin-message");

let typingTimeout;
adminInput.addEventListener("input", () => {
    if (!currentUserId) return;
    fetch("/api/admin/typing", {
        method: "POST",
        headers: {
            "Content-Type":"application/json"
        },
        body: JSON.stringify({
            userId: currentUserId,
            isTyping: true
        })
    });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        fetch("/api/admin/typing", {
            method: "POST",
            headers: {
                "Content-Type":"application/json"
            },
            body: JSON.stringify({
                userId: currentUserId,
                isTyping: false
            })
        });
    }, 1000);
});

document
    .getElementById("admin-message")
    ?.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendAdminMessage();
            }
        }
    );

window.openChat = openChat;
window.sendAdminMessage = sendAdminMessage;