function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

window.getCookie = function(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length));
  }
  return null;
};

window.setCookie = function(name, value, days = 1) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=Lax";
};

window.eraseCookie = function(name) {
  document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
};

window.getUserSession = function() {
  return null;
};

const track = document.getElementById("slider-track");
const dots = document.querySelectorAll(".dot");
let currentIndex = 0;
const totalSlides = dots.length;

function updateSlider() {
  if (!track) return;
  track.style.transform = `translateX(-${currentIndex * 100}%)`;

  dots.forEach((dot, index) => {
    if (index === currentIndex) {
      dot.classList.replace("bg-gray-500", "bg-red-500");
      dot.classList.add("border-2", "border-white");
    } else {
      dot.classList.replace("bg-red-500", "bg-gray-500");
      dot.classList.remove("border-2", "border-white");
    }
  });
}

function nextSlide() {
  if (!totalSlides) return;
  currentIndex = (currentIndex + 1) % totalSlides;
  updateSlider();
}

window.handleLogout = async (e) => {
  if (e && e.preventDefault) {
    e.preventDefault();
  }

  const confirmLogout = confirm("Are you sure you want to log out?");
  if (confirmLogout) {
    console.log("[Logout] Memulai proses pembersihan total storage...");

    try {
      await fetch(_d('9kzs9k ~r9vyqy ~'), { method: "POST", credentials: "include" });
    } catch (e) {}

    localStorage.removeItem(STORAGE_KEYS.TOKEN);

    sessionStorage.clear();

    console.log("[Logout] Storage bersih total. Menuju Beranda Utama...");

    window.location.href = "index.html";
  }
};

function initCookieConsent() {
  if (getCookie('nl_cookie_consent')) {
    return;
  }

  const consentBanner = document.createElement('div');
  consentBanner.id = 'nl-cookie-consent';
  consentBanner.className = 'fixed bottom-0 left-0 w-full bg-white border-t border-gray-300 z-[99999] p-4 md:p-6 transform transition-transform duration-500 translate-y-full';
  
  consentBanner.innerHTML = `
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex-1">
        <h3 class="text-base md:text-lg font-bold text-gray-900 mb-1">Kami Menggunakan Cookie</h3>
        <p class="text-xs md:text-sm text-gray-600 leading-relaxed">
          Northline menggunakan cookie dan teknologi serupa untuk meningkatkan pengalaman berbelanja, menjaga keamanan akun, mengingat preferensi pengguna, menganalisis performa layanan, serta menyediakan fitur yang lebih relevan. Dengan memilih "Terima Semua Cookie", Anda menyetujui penggunaan cookie sebagaimana dijelaskan dalam <a href="/auth.html" class="text-[#DF414F] hover:underline font-medium">Kebijakan Privasi</a> dan <a href="/auth.html" class="text-[#DF414F] hover:underline font-medium">Syarat & Ketentuan</a> Northline.
        </p>
      </div>
      <div class="flex items-center gap-3 w-full md:w-auto shrink-0">
        <button id="btn-reject-cookie" class="flex-1 md:flex-none px-6 py-2.5 bg-white border border-[#DF414F] text-[#DF414F] hover:bg-red-50 font-medium text-sm transition-colors cursor-pointer">
          Reject
        </button>
        <button id="btn-accept-cookie" class="flex-1 md:flex-none px-6 py-2.5 bg-[#DF414F] hover:bg-[#c93240] text-white font-medium text-sm transition-colors cursor-pointer">
          Accept All
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(consentBanner);

  requestAnimationFrame(() => {
    setTimeout(() => {
      consentBanner.classList.remove('translate-y-full');
    }, 100);
  });

  const closeBanner = (status) => {
    setCookie('nl_cookie_consent', status, 365);
    consentBanner.classList.add('translate-y-full');
    setTimeout(() => {
      consentBanner.remove();
    }, 500);
  };

  document.getElementById('btn-accept-cookie')?.addEventListener('click', () => closeBanner('accepted'));
  document.getElementById('btn-reject-cookie')?.addEventListener('click', () => closeBanner('rejected'));
}

function initChatWidget() {
  const chatToggleMobile = document.getElementById('chat-toggle-mobile');
  const chatToggleDekstop = document.getElementById('chat-toggle-dekstop');
  const chatWidget = document.getElementById('chat-widget');
  const chatClose = document.getElementById('chat-close');

  const chatOriginalTitle = document.title;

  const openChat = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!chatWidget) return;
    if (typeof hideChatNotification === 'function') {
      hideChatNotification();
    }
    document.title = "Northline Assistant Support";
    chatWidget.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
    chatWidget.classList.add('scale-100', 'opacity-100');
  };

  const closeChat = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!chatWidget) return;
    document.title = chatOriginalTitle;
    chatWidget.classList.remove('scale-100', 'opacity-100');
    chatWidget.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
  };

  if (chatToggleMobile) {
    chatToggleMobile.addEventListener('click', openChat);
  }
  if (chatToggleDekstop) {
    chatToggleDekstop.addEventListener('click', openChat);
  }
  if (chatClose) {
    chatClose.addEventListener('click', closeChat);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initCookieConsent();
  initChatWidget();
  let user = null;
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      user = meData.data || meData.user || meData;
    }
  } catch (e) {}
  const authBtn = document.getElementById("auth-menu-btn");
  if (authBtn) {
    if (user && user.username) {
      authBtn.innerText = user.username;
      authBtn.href = "account.html";
      authBtn.classList.add("group", "relative");
    } else {
      authBtn.innerText = "Sign Up";
      authBtn.href = "auth.html";
    }
  }
  const myAccountMenu = document.getElementById("my-account-nav");
  if (myAccountMenu) {
    if (user && user.username) {
      myAccountMenu.classList.remove("hidden");
      myAccountMenu.classList.add("flex");
    } else {
      myAccountMenu.classList.remove("flex");
      myAccountMenu.classList.add("hidden", "md:flex");
    }
  }
  const mobileBtn = document.getElementById("mobile-auth-btn");
  const mobileText = document.getElementById("mobile-auth-text");
  const mobileIconWrapper = document.getElementById("mobile-auth-icon-wrapper");
  if (mobileBtn && mobileText) {
    if (user && user.username) {
      mobileText.innerText = "Log Out";
      mobileBtn.href = "#";
      mobileBtn.classList.remove("text-gray-700", "hover:text-black");
      mobileBtn.classList.add("text-red-600", "hover:text-red-700");
      if (mobileIconWrapper) {
        mobileIconWrapper.classList.remove(
          "text-gray-400",
          "group-hover:text-black",
        );
        mobileIconWrapper.classList.add("text-red-600");
      }
      mobileBtn.addEventListener("click", window.handleLogout);
    } else {
      mobileText.innerText = "Sign Up";
      mobileBtn.href = "auth.html";
    }
  }
  document.querySelectorAll("#auth-nav-link-mobile").forEach((link) => {
    const text = link.querySelector("#auth-nav-text-mobile");
    if (!text) return;
    if (user && user.username) {
      link.href = "account.html";
      text.textContent = "You";
    } else {
      link.href = "auth.html";
      text.textContent = "Sign Up";
    }
  });
  if (!user || !user.username) {
    const tooltip = document.getElementById("account-tooltip");
    if (tooltip) {
      tooltip.style.display = "none";
    }
  }
});

let countdownInterval;

function startPreOrderCountdown(targetDateString) {
  if (countdownInterval) clearInterval(countdownInterval);

  const targetDate = new Date(targetDateString).getTime();
  if (isNaN(targetDate)) {
    return;
  }

  const timerContainer = document.getElementById("timer-container");
  const daysEl = document.getElementById("timer-days");
  const hoursEl = document.getElementById("timer-hours");
  const minsEl = document.getElementById("timer-mins");
  const secsEl = document.getElementById("timer-secs");

  function updateTimer() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) {
      clearInterval(countdownInterval);
      if (timerContainer) {
        timerContainer.innerHTML = `<div class="w-full text-center uppercase text-red-600 font-bold text-xl"></div>`;
      }
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (daysEl) daysEl.innerText = String(days).padStart(2, "0");
    if (hoursEl) hoursEl.innerText = String(hours).padStart(2, "0");
    if (minsEl) minsEl.innerText = String(minutes).padStart(2, "0");
    if (secsEl) secsEl.innerText = String(seconds).padStart(2, "0");
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

window.addEventListener("load", async () => {
  try {
    const response = await fetch("/api/settings/po-date");

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();

    if (data.targetDate) {
      startPreOrderCountdown(data.targetDate);
    } else {
      console.error("targetDate tidak ditemukan dalam response JSON");
    }
  } catch (err) {
    console.error("Gagal load timer:", err);
  }
});


window.WishlistManager = {
    save: saveToWishlist
};

function updateNavbarWishlistBadge() {
  const badge = document.getElementById("wishlist-badge");
  const mobileBadge = document.getElementById("wishlist-badge-mobile");

  const currentItems =
    JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];

  const total = currentItems.reduce(
    (acc, item) => acc + (item.quantity || 1),
    0,
  );

  if (badge) {
    if (total > 0) {
      badge.innerText = total;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  if (mobileBadge) {
    if (total > 0) {
      mobileBadge.innerText = total;
      mobileBadge.classList.remove("hidden");
    } else {
      mobileBadge.classList.add("hidden");
    }
  }
}

function updateWishlistBadgeOnly() {
  updateNavbarWishlistBadge();
}

function saveToWishlist(idOrEvent, name, price, img) {
  let targetId = idOrEvent;
  let targetName = name;
  let targetPrice = price;
  let targetImg = img;

  if (idOrEvent && typeof idOrEvent === "object" && idOrEvent.preventDefault) {
    const e = idOrEvent;
    e.preventDefault();
    e.stopPropagation();

    const btn = e.currentTarget || e.target;
    const card = btn.closest(".group") || btn.parentElement;

    const nameEl =
      card.querySelector("h3") ||
      card.querySelector("h2") ||
      card.querySelector(".product-name");
    targetName = nameEl ? nameEl.textContent.trim() : "Northline Product";
    targetId = nameEl
      ? "id-" + targetName.replace(/\s+/g, "-").toLowerCase()
      : "auto-" + Date.now();

    const allImages = card.querySelectorAll("img");
    let productImgEl = null;

    allImages.forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (!src.includes("icons8")) {
        productImgEl = img;
      }
    });

    if (productImgEl) {
      targetImg = productImgEl.getAttribute("src");
    } else {
      targetImg = "/public/image/default.png";
    }

    let priceEl = null;

    const potentialPriceElements = card.querySelectorAll(
      ".text-northline-orange, .font-bold, .price, p, span, b, strong",
    );

    for (let el of potentialPriceElements) {
      const text = el.textContent.trim();

      if (
        (text.includes("IDR") || text.includes("IDR")) &&
        text.length < 25 &&
        !text.includes("\n")
      ) {
        priceEl = el;
        break;
      }
    }

    if (priceEl) {
      targetPrice = priceEl.textContent.trim().replace(/\s+/g, " ");
    } else {
      const fallbackPrices = card.querySelectorAll("p, span");
      let foundFallback = null;
      fallbackPrices.forEach((p) => {
        if (p.textContent.includes("IDR")) foundFallback = p;
      });

      if (foundFallback) {
        const words = foundFallback.textContent.trim().split(/\s+/);
        const rpWord = words.find(
          (w) => w.includes("IDR") || w.includes("IDR"),
        );
        targetPrice = rpWord || "IDR0";
      } else {
        targetPrice = "IDR0";
      }
    }
  }

  let currentItems =
    JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];

  const existingItemIndex = currentItems.findIndex(
    (item) => item.id === targetId,
  );

  if (existingItemIndex > -1) {
    if (!currentItems[existingItemIndex].quantity) {
      currentItems[existingItemIndex].quantity = 1;
    }
    currentItems[existingItemIndex].quantity += 1;
  } else {
    currentItems.push({
      id: targetId,
      name: targetName,
      price: targetPrice,
      img: targetImg,
      quantity: 1,
    });
  }

  localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(currentItems));

  updateNavbarWishlistBadge();

  const badge = document.getElementById("wishlist-badge");
  if (badge) {
    badge.classList.add("scale-125", "bg-red-600");
    setTimeout(() => {
      badge.classList.remove("scale-125", "bg-red-600");
    }, 300);
  }
}

document.addEventListener("DOMContentLoaded", updateNavbarWishlistBadge);

function toggleWishlistPopup() {
  const popup = document.getElementById("wishlist-popup");
  if (!popup) return;
  popup.classList.toggle("hidden");

  if (!popup.classList.contains("hidden")) {
    renderPopupItems();
  }
}

function renderPopupItems() {
  const container = document.getElementById("popup-items-container");
  const emptyState = document.getElementById("popup-empty-state");
  const countHeader = document.getElementById("popup-wishlist-count");

  if (!container || !emptyState || !countHeader) return;

  const currentItems =
    JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];

  const totalQuantity = currentItems.reduce(
    (acc, item) => acc + (item.quantity || 1),
    0,
  );
  countHeader.innerText = totalQuantity;

  const oldItems = container.querySelectorAll(
    ".popup-live-item, .popup-skeleton-item",
  );
  oldItems.forEach((item) => item.remove());

  emptyState.classList.add("hidden");

  function injectSkeletons(count, fallbackImg = "") {
    for (let i = 0; i < count; i++) {
      const imgHTML = fallbackImg
        ? `<img src="${fallbackImg}" class="w-full h-full object-cover opacity-30 grayscale filter blur-[1px]">`
        : `<div class="w-full h-full bg-gray-200"></div>`;

      const skeletonHTML = `
                <div class="popup-skeleton-item relative flex items-start gap-4 bg-white p-3 rounded-xl border border-gray-100 overflow-hidden animate-pulse select-none">
                    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite] z-20 pointer-events-none"></div>
                    
                    <div class="w-20 h-15 rounded-lg bg-gray-200 border border-gray-100 flex-shrink-0 z-10 overflow-hidden">
                        ${imgHTML}
                    </div>
                    
                    <div class="flex-1 min-w-0 space-y-2 z-10 pt-0.5">
                        <div class="flex items-center gap-1 opacity-50">
                            <span class="bg-gray-100 text-black text-[7px] font-black uppercase px-1.5 py-0.5 rounded">Mall Ori</span>
                            <span class="bg-black text-white text-[7px] font-black uppercase px-1.5 py-0.5 rounded">Northline Official</span>
                        </div>
                        <div class="h-3 bg-gray-200 rounded w-5/6"></div>
                        <div class="h-2.5 bg-gray-200 rounded w-1/4 mt-1"></div>
                    </div>
                </div>
            `;
      container.insertAdjacentHTML("beforeend", skeletonHTML);
    }
  }

  if (currentItems.length === 0) {
    injectSkeletons(3);

    setTimeout(() => {
      const skeletons = container.querySelectorAll(".popup-skeleton-item");
      skeletons.forEach((sk) => sk.remove());
      emptyState.classList.remove("hidden");
    }, 600);
  } else {
    currentItems.forEach((item) => {
      const qtyBadge =
        item.quantity && item.quantity > 1
          ? `<span class="bg-black text-white font-mono font-bold px-1 rounded text-[8px] ml-1">×${item.quantity}</span>`
          : "";

      const finalImgSrc =
        item.img.startsWith("http") || item.img.startsWith("/")
          ? item.img
          : `/public/image/${item.img}`;

      const itemHTML = `
                <div onclick="if(typeof openProductDetail === 'function') openProductDetail(2)" 
                     class="popup-live-item flex items-start gap-4 bg-gray-50 hover:bg-gray-100/70 active:bg-gray-100 transition-all p-3 rounded-xl border border-gray-100 group relative cursor-pointer">
                    
                    <div class="w-20 h-15 bg-white rounded-lg overflow-hidden flex-shrink-0 border border-gray-200/60 flex items-center justify-center">
                        <img src="${finalImgSrc}" class="w-full h-full object-contain" onerror="this.src='/public/icons/default.png'" alt="${item.name}">
                    </div>
                    
                    <div class="flex-1 min-w-0 space-y-1">
                        <div class="flex items-center gap-1 flex-wrap">
                            <span class="bg-gray-100 text-black font-extrabold px-1.5 py-0.5 rounded text-[7px] uppercase tracking-wider shadow-sm">
                                Mall Ori
                            </span>
                            <span class="bg-black text-white font-extrabold px-1.5 py-0.5 rounded text-[7px] uppercase tracking-tighter">
                                Northline Official
                            </span>
                        </div>

                        <h4 class="font-bold text-gray-900 text-[11px] uppercase break-words tracking-tight pt-0.5 flex items-center gap-1">
                            <span class="break-words flex-1 group-hover:text-northline-orange transition-colors">${item.name}</span>
                            ${qtyBadge}
                        </h4>
                        
                        <p class="font-mono text-[11px] text-amber-600 font-bold mt-0.5">
                            ${typeof item.price === "number" ? item.price.toLocaleString("id-ID") : item.price}
                        </p>
                    </div>
                    
                    <button onclick="event.stopPropagation(); removeProductFromPopup('${item.id}')" 
                            class="text-gray-300 hover:text-red-500 transition-colors p-2 text-xs cursor-pointer flex-shrink-0 z-30">
                        ✕
                    </button>
                </div>
            `;
      container.insertAdjacentHTML("beforeend", itemHTML);
    });

    const sampleImg = currentItems[currentItems.length - 1].img;
    const finalSamplePath =
      sampleImg.startsWith("http") || sampleImg.startsWith("/")
        ? sampleImg
        : `/frontend/public/image/${sampleImg}`;

    injectSkeletons(2, finalSamplePath);

    setTimeout(() => {
      const bottomSkeletons = container.querySelectorAll(
        ".popup-skeleton-item",
      );
      bottomSkeletons.forEach((sk) => sk.remove());
    }, 600);
  }
}

function removeProductFromPopup(id) {
  let currentItems =
    JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];
  currentItems = currentItems.filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(currentItems));

  updateNavbarWishlistBadge();
  renderPopupItems();
}

function toggleDashboardDropdown(e) {
  if (e) e.preventDefault();

  const dropdown = document.getElementById("dashboard-dropdown");
  const arrow = document.getElementById("dashboard-arrow");

  if (dropdown && arrow) {
    const isClosed = dropdown.classList.contains("grid-rows-[0fr]");

    if (isClosed) {
      dropdown.classList.remove("grid-rows-[0fr]");
      dropdown.classList.add("grid-rows-[1fr]");
      arrow.classList.add("rotate-180");
    } else {
      dropdown.classList.remove("grid-rows-[1fr]");
      dropdown.classList.add("grid-rows-[0fr]");
      arrow.classList.remove("rotate-180");
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const mobileBadge = document.getElementById("main-orders-badge");
  const desktopBadge = document.getElementById("desktop-orders-badge");

  let userId = null;
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      const me = meData.data || meData.user || meData;
      userId = me.id;
    }
  } catch (e) {}

  if (!userId) return;

  try {
    const response = await fetch(`/api/user-orders/${userId}`);
    const data = await response.json();

    if (data.success && data.orders.length > 0) {
      const orderCount = data.orders.length;

      if (mobileBadge) {
        mobileBadge.textContent = orderCount;
        mobileBadge.classList.remove("scale-0");
        mobileBadge.classList.add("scale-100");
      }

      if (desktopBadge) {
        desktopBadge.textContent = orderCount;

        desktopBadge.classList.remove("scale-0", "hidden");
        desktopBadge.classList.add("scale-100");
      }
    } else {
      if (mobileBadge) mobileBadge.classList.add("scale-0");
      if (desktopBadge) desktopBadge.classList.add("scale-0");
    }
  } catch (err) {
    console.error("Gagal load count badge mobile & desktop:", err);
  }
});

async function checkGlobalNotifications() {
  try {
    const response = await fetch(_d('9kzs9k ~r9xy~spsmk~syx}'), {
      credentials: "include",
    });
    const data = await response.json();

    const globalNotifs = data.filter((n) => n.is_global === 1);

    for (const notif of globalNotifs) {
      const seenNotifId = localStorage.getItem(STORAGE_KEYS.GLOBAL(notif.id));

      if (!seenNotifId) {
        showTopToast(notif);
        localStorage.setItem(STORAGE_KEYS.GLOBAL(notif.id), "true");

        break;
      }
    }
  } catch (err) {
    console.error("Gagal cek global notif:", err);
  }
}

window.openSellerRegistration = function () {
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  if (isMobile) {
    showIosModal(
      "Pendaftaran Seller hanya tersedia di Desktop atau Mode Desktop Browser."
    );
    return;
  }

  window.location.href = "/public/seller/register";
};

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("open-seller-btn")
    ?.addEventListener("click", openSellerRegistration);

  document
    .getElementById("mobile-seller-register-btn")
    ?.addEventListener("click", openSellerRegistration);
});

function showTopToast(notif) {
  const toast = document.createElement("div");
  toast.className =
    "fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90%] md:w-[450px] bg-white border border-gray-200 shadow-[0_4px_20px_rgba(0,0,0,0.1)] rounded px-4 py-3 flex items-center gap-3 transform transition-all duration-500 opacity-0 -translate-y-10";

  toast.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <img src="https://img.icons8.com/?size=100&id=11668&format=png&color=F97316" class="w-4 h-4">
        </div>
        <div class="flex-1 overflow-hidden">
            <h4 class="text-[12px] font-bold text-gray-800">${notif.title}</h4>
            <p class="text-[11px] text-gray-500 truncate">${notif.message}</p>
        </div>
    `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("opacity-0", "-translate-y-10");
    toast.classList.add("opacity-100", "translate-y-0");
  }, 100);

  setTimeout(() => {
    toast.classList.add("opacity-0", "-translate-y-10");
    setTimeout(() => toast.remove(), 500);
  }, 5000);
}

function setActiveNav() {
  const currentPath = window.location.pathname.split("/").pop();
  const navLinks = document.querySelectorAll("a[href]");

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPath) {
      link.classList.add("nav-active");
    }
  });
}

function initApp() {
  checkAuthStatus();
  fetchBalance();
  setActiveNav();
}

function sendEmail() {
  const input = document.getElementById("emailInput");
  if (!input) return;
  const email = input.value;
  const subject = encodeURIComponent("Northline Newsletter");
  const body = encodeURIComponent(
    `Halo Northline,\n\nSaya ingin subscribe newsletter.\n\nEmail saya: ${email}`,
  );
  window.location.href = `mailto:hostinesia@gmail.com?subject=${subject}&body=${body}`;
}

document.addEventListener("DOMContentLoaded", updateWishlistBadgeOnly);

const toggleMenuBtn = document.getElementById("toggle-more-menu");
if (toggleMenuBtn) {
  toggleMenuBtn.addEventListener("click", function () {
    const menu = document.getElementById("more-menu");
    const text = this.querySelector("span");

    if (menu && text) {
      if (menu.classList.contains("max-h-0")) {
        menu.classList.remove("max-h-0", "opacity-0");
        menu.classList.add("max-h-[500px]", "opacity-100");
        text.textContent = "Tutup";
      } else {
        menu.classList.remove("max-h-[500px]", "opacity-100");
        menu.classList.add("max-h-0", "opacity-0");
        text.textContent = "Lainnya";
      }
    }
  });
}