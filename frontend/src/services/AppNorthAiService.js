let _loadingHistory = false;
let chatHistory = [];
let currentUserId = null;
let _userResolved = false;


function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

async function _resolveUser() {
    if (_userResolved) return currentUserId;
    _userResolved = true;
    try {
        const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
        if (meRes.ok) {
            const meData = await meRes.json();
            const me = meData.data || meData.user || meData;
            if (me && me.id) {
                currentUserId = me.id;
                return currentUserId;
            }
        }
    } catch (e) {}
    return null;
}

async function saveChatHistory(role, text, products, feedback = null, timestamp) {
    if (_loadingHistory) return null;
    const entry = { role, text, products: products || null, timestamp: timestamp || Date.now(), feedback };
    chatHistory.push(entry);
    const uid = await _resolveUser();
    if (!uid) return null;
    try {
        const res = await fetch(_d('9kzs9mrk~7ks9rs}~y|$'), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ role, text, products: products || null, timestamp: entry.timestamp })
        });
        const data = await res.json();
        if (data.success && data.id) {
            entry.id = data.id;
            return data.id;
        }
    } catch (e) {}
    return null;
}

function renderBotMessage(text, products = null, feedback = null, timestamp = null, id = null) {
  const chatMessages = document.getElementById("chat-messages");
  const wrapper = document.createElement("div");
  wrapper.className = "flex items-start gap-1.5 md:gap-2";
  if (timestamp) wrapper.dataset.ts = timestamp;
  if (id) wrapper.dataset.mid = id;
  const formatted = String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
    .replace(/(hubungi\s+admin\s+northline)/gi, '<a href="/AppNorthChatStore" class="text-blue-500 hover:underline">$1</a>');
  const likeActive = feedback === 'liked' ? 'opacity-100' : 'opacity-40';
  const dislikeActive = feedback === 'disliked' ? 'opacity-100' : 'opacity-40';
  wrapper.innerHTML = `
    <div class="max-w-[100%] md:max-w-[100%]">
      <div class="bg-white border px-2.5 md:px-3 py-1.5 md:py-2 text-sm text-gray-800">
        <span class="bot-content">${formatted}</span>
      </div>
      <div class="flex items-center gap-1 mt-1">
        <div class="feedback-btns flex items-center gap-1">
          <button class="feedback-btn like-btn ${likeActive}" data-type="liked">
            <img src="https://img.icons8.com/?size=100&id=WvU1I6Fwj7jt&format=png&color=000000" class="w-4 h-4">
          </button>
          <button class="feedback-btn dislike-btn ${dislikeActive}" data-type="disliked">
            <img src="https://img.icons8.com/?size=100&id=WvU1I6Fwj7jt&format=png&color=000000" class="w-4 h-4 rotate-180 mt-1">
          </button>
        </div>
        <span class="text-[9px] md:text-[10px] text-gray-400 ml-1">Northline</span>
      </div>
    </div>
  `;
  chatMessages.appendChild(wrapper);
  if (products && products.length) {
    renderProductCards(products, wrapper);
  }
}

async function loadChatHistory() {
    _loadingHistory = true;
    const chatMessages = document.getElementById('chat-messages');
    while (chatMessages.children.length > 1) chatMessages.removeChild(chatMessages.lastChild);

    const uid = await _resolveUser();

    if (uid) {
        try {
            const res = await fetch(_d('9kzs9mrk~7ks9rs}~y|$'), { credentials: 'include' });
            const data = await res.json();
            if (data.success && Array.isArray(data.messages)) {
                chatHistory = data.messages;
                data.messages.forEach(msg => {
                    if (msg.role === 'user') addUserMessage(msg.text, msg.timestamp);
                    else renderBotMessage(msg.text, msg.products || null, msg.feedback, msg.timestamp, msg.id);
                });
            }
        } catch (e) {
            console.error('Gagal memuat riwayat chat:', e);
        }
    } else {
        chatHistory.forEach(msg => {
            if (msg.role === 'user') addUserMessage(msg.text, msg.timestamp);
            else renderBotMessage(msg.text, msg.products || null, msg.feedback, msg.timestamp, msg.id);
        });
    }

    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => { _loadingHistory = false; }, 100);
}
window.loadChatHistory = loadChatHistory;

function renderProductCards(products, wrapper) {
  if (!products || !products.length) return;

  const cardsContainer = document.createElement("div");
  cardsContainer.className = "product-cards-container mt-2 mb-1";

  const cardsWrapper = document.createElement("div");
  cardsWrapper.className = "flex gap-2 overflow-x-auto pb-2";
  cardsWrapper.style.cssText = "scrollbar-color:#d1d5db transparent;scrollbar-width:thin;";

  products.forEach((p) => {
    const priceText = `IDR ${(p.price || 0).toLocaleString("id-ID")}`;
    const imgSrc = p.image || "/public/icons/default.png";

    const card = document.createElement("div");
    card.className = "border rounded-lg bg-white shadow-sm w-[140px] flex-shrink-0 cursor-pointer hover:shadow-md transition-shadow";
    card.onclick = function () {
      if (typeof window.openProductDetail === "function") {
        window.openProductDetail(p.id);
      }
    };

    card.innerHTML = `
        <div class="bg-gray-50 flex items-center justify-center h-[120px] overflow-hidden rounded-t-lg">
          <img src="${imgSrc}" class="w-full h-full object-contain" loading="lazy" onerror="this.src='/public/icons/default.png'">
        </div>
        <div class="p-1.5">
          <p class="text-[11px] font-medium text-gray-800 line-clamp-2 leading-tight">${p.name}</p>
          <p class="text-[11px] text-[#DF414F] font-bold mt-1">${priceText}</p>
        </div>
      `;

    cardsWrapper.appendChild(card);
  });

  cardsContainer.appendChild(cardsWrapper);
  wrapper.after(cardsContainer);
}

function addBotMessageStreaming(message, showQuickReplies = true, products = null) {
  document.querySelectorAll(".quick-replies").forEach((el) => {
    el.classList.add("hidden");
  });

  const chatMessages = document.getElementById("chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = "flex items-start gap-1.5 md:gap-2";
  const ts = Date.now();
  wrapper.dataset.ts = ts;

  wrapper.innerHTML = `
        <div class="max-w-[100%] md:max-w-[100%]">
            <div class="bg-white border px-2.5 md:px-3 py-1.5 md:py-2 text-sm text-gray-800">
                <span class="bot-content"></span>

                <div class="quick-replies hidden mt-3 flex flex-wrap gap-2">
                    <button class="quick-btn border px-2 py-1 text-[10px] md:text-xs hover:bg-gray-50">
                        Produk
                    </button>

                    <button class="quick-btn border px-2 py-1 text-[10px] md:text-xs hover:bg-gray-50">
                        Harga
                    </button>

                    <button class="quick-btn border px-2 py-1 text-[10px] md:text-xs hover:bg-gray-50">
                        Ukuran
                    </button>

                    <button class="quick-btn border px-2 py-1 text-[10px] md:text-xs hover:bg-gray-50">
                        Cara Order
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-1 mt-1">
                <div class="feedback-btns flex items-center gap-1">
                    <button class="feedback-btn like-btn opacity-40" data-type="liked">
                        <img src="https://img.icons8.com/?size=100&id=WvU1I6Fwj7jt&format=png&color=000000" class="w-4 h-4">
                    </button>
                    <button class="feedback-btn dislike-btn opacity-40" data-type="disliked">
                        <img src="https://img.icons8.com/?size=100&id=WvU1I6Fwj7jt&format=png&color=000000" class="w-4 h-4 rotate-180 mt-1">
                    </button>
                </div>
                <span class="text-[9px] md:text-[10px] text-gray-400 ml-1">Northline</span>
            </div>
        </div>
    `;

  chatMessages.appendChild(wrapper);

  const content = wrapper.querySelector(".bot-content");
  const formattedMessage = String(message || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
    .replace(/(hubungi\s+admin\s+northline)/gi, '<a href="/AppNorthChatStore" class="text-blue-500 hover:underline">$1</a>');

  let index = 0;
  const chunkSize = 12;

  const interval = setInterval(() => {
    content.innerHTML = formattedMessage.substring(0, index);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    index += chunkSize;

    if (index >= formattedMessage.length) {
      content.innerHTML = formattedMessage;

      clearInterval(interval);

      if (showQuickReplies) {
        wrapper.querySelector(".quick-replies").classList.remove("hidden");
      }
      saveChatHistory('bot', message, products, null, ts).then(function (id) {
        if (id) wrapper.dataset.mid = id;
      });

      renderProductCards(products, wrapper);

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }, 1);
}

document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("quick-btn")) return;

  const text = e.target.textContent.trim();

  const mapping = {
    Produk: "Produk yang tersedia",
    Harga: "Daftar harga produk",
    Ukuran: "Ukuran yang tersedia",
    "Cara Order": "Bagaimana cara order?",
  };

  input.value = mapping[text] || text;
  sendMessage();
});

function addUserMessage(message, timestamp) {
  const chatMessages = document.getElementById("chat-messages");

  chatMessages.insertAdjacentHTML(
    "beforeend",
    `
        <div class="flex justify-end">
            <div class="max-w-[85%] md:max-w-[75%]">
                <div class="bg-white border px-2.5 md:px-3 py-1.5 md:py-2 text-sm text-gray-800">
                    ${message}
                </div>

                <div class="text-[9px] md:text-[10px] text-right text-gray-400 mt-1">
                    You
                </div>
            </div>
        </div>
    `,
  );

  chatMessages.scrollTop = chatMessages.scrollHeight;
  saveChatHistory('user', message, null, null, timestamp);
}

function updateHeaderStatus(text) {
  const el = document.getElementById("chat-header-status");
  if (el) el.textContent = text;
}

function showTyping() {
  updateHeaderStatus("Typing...");
  const chatMessages = document.getElementById("chat-messages");

  const typing = document.createElement("div");
  typing.id = "typing-indicator";

  typing.innerHTML = `
        <div class="flex items-start gap-1.5 md:gap-2">
            <div class="bg-white border px-3 py-2">
                <div class="flex gap-1">
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:.15s]"></span>
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:.3s]"></span>
                </div>
            </div>
        </div>
    `;

  chatMessages.appendChild(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  updateHeaderStatus("24/7 Support Center");
  const typing = document.getElementById("typing-indicator");

  if (typing) {
    typing.remove();
  }
}

async function toggleFeedback(btnEl, type) {
  const wrapper = btnEl.closest('[data-mid], [data-ts]');
  if (!wrapper) return;
  const mid = wrapper.dataset.mid;
  const ts = parseInt(wrapper.dataset.ts);
  const entry = chatHistory.find(e => (mid && e.id && String(e.id) === String(mid)) || (!mid && e.timestamp === ts));
  if (!entry) return;

  const newFeedback = entry.feedback === type ? null : type;
  entry.feedback = newFeedback;

  if (currentUserId && mid) {
    try {
      await fetch(_d('9kzs9mrk~7ks9rs}~y|$9') + mid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ feedback: newFeedback })
      });
    } catch (e) {}
  }

  const likeBtn = wrapper.querySelector('.like-btn');
  const dislikeBtn = wrapper.querySelector('.dislike-btn');
  [likeBtn, dislikeBtn].forEach(b => {
    b.classList.remove('opacity-100');
    b.classList.add('opacity-40');
  });
  if (entry.feedback === 'liked') {
    likeBtn.classList.remove('opacity-40');
    likeBtn.classList.add('opacity-100');
  } else if (entry.feedback === 'disliked') {
    dislikeBtn.classList.remove('opacity-40');
    dislikeBtn.classList.add('opacity-100');
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.feedback-btn');
  if (!btn) return;
  const type = btn.getAttribute('data-type');
  if (!type) return;
  toggleFeedback(btn, type);
});

async function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  addUserMessage(text);

  const chatMessages = document.getElementById("chat-messages");
  if (chatMessages.children.length < 2) {
    document.getElementById("quick-questions")?.classList.remove("hidden");
  }

  input.value = "";

  showTyping();

  try {
    const recentHistory = chatHistory.slice(-6).map((msg) => ({
      role: msg.role,
      text: msg.text,
    }));

    const response = await fetch(_d('9kzs9k ~r9mrk~'), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: text,
        history: recentHistory,
      }),
    });

    const data = await response.json();

    removeTyping();

    addBotMessageStreaming(
      data.reply ||
        "Silakan hubungi admin Northline untuk informasi lebih lanjut.",
      true,
      data.products || null,
    );
    showChatNotification();
  } catch (err) {
    console.error(err);

    removeTyping();

    addBotMessageStreaming("Northline Support sedang tidak tersedia.", false, null);
    showChatNotification();
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("q-btn")) return;

  const text = e.target.textContent.trim();

  const mapping = {
    "Produk apa aja?": "Produk yang tersedia apa saja?",
    "Harga berapa?": "Berapa harga produknya?",
    "Ada size apa?": "Ukuran yang tersedia apa saja?",
    "Cara order gimana?": "Bagaimana cara order?",
    "Ready stock?": "Apakah produk ready stock?",
  };

  input.value = mapping[text] || text;

  const container = document.getElementById("quick-questions");
  if (container) container.classList.add("hidden");

  sendMessage();
});

const sendBtn = document.getElementById("send-message");
const input = document.getElementById("chat-input");

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const messages = [
    "Hi 👋 Selamat datang di Northline!",
    "Butuh bantuan? Kami siap bantu 😊",
    "Lagi cari produk keren? 😎",
    "Tanya apa aja, jangan malu ya 😉",
    "Halo! Mau order atau tanya dulu? 🛍️",
    "Northline siap bantu kamu 🔥",
    "Butuh rekomendasi? Tanya aja 🤝",
    "Hai! Lagi cari apa hari ini? 👀",
    "Gas belanja hemat 💸✨",
    "Ada yang bisa kami bantu? 😊",
  ];

  const elements = [
    document.getElementById("welcome-text-page"),
    document.getElementById("welcome-text-account"),
  ];

  elements.forEach((el) => {
    if (!el) return;

    let index = 0;

    setInterval(() => {
      el.style.transform = "translateY(-100%)";
      el.style.opacity = "0";

      setTimeout(() => {
        index = (index + 1) % messages.length;
        el.textContent = messages[index];

        el.style.transform = "translateY(100%)";

        requestAnimationFrame(() => {
          el.style.transform = "translateY(0)";
          el.style.opacity = "1";
        });
      }, 300);
    }, 4000);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("chat") === "1" && typeof window.openChat === "function") {
    setTimeout(window.openChat, 500);
  }
});

window.clearChatHistory = async function () {
  chatHistory = [];
  const container = document.getElementById('chat-messages');
  if (container) {
    while (container.children.length > 1) container.removeChild(container.lastChild);
  }
  const uid = await _resolveUser();
  if (!uid) return { success: true, guest: true };
  try {
    const res = await fetch(_d('9kzs9mrk~7ks9rs}~y|$'), {
      method: "DELETE",
      credentials: "include"
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: 'Gagal menghapus riwayat' };
  }
};

window.getChatStorageUsage = async function () {
  const uid = await _resolveUser();
  if (!uid) return { success: true, usage: { count: 0, bytes: 0, limitBytes: 2097152, limitMessages: 500 } };
  try {
    const res = await fetch(_d('9kzs9mrk~7ks9rs}~y|$'), { credentials: 'include' });
    const data = await res.json();
    return data;
  } catch (e) {
    return { success: false, message: 'Gagal memuat penggunaan penyimpanan' };
  }
};
