function _d(s) {
  let r = "";
  for (let i = 0; i < s.length; i++) {
    r += String.fromCharCode(((s.charCodeAt(i) - 32 - 10 + 95) % 95) + 32);
  }
  return r;
}

window.getCookie = function (name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0)
      return decodeURIComponent(c.substring(nameEQ.length));
  }
  return null;
};

window.setCookie = function (name, value, days = 1) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie =
    name + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=Lax";
};

window.eraseCookie = function (name) {
  document.cookie = name + "=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
};

window.getUserSession = function () {
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
      await fetch(_d("9kzs9k ~r9vyqy ~"), {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {}

    localStorage.removeItem(STORAGE_KEYS.TOKEN);

    sessionStorage.clear();

    console.log("[Logout] Storage bersih total. Menuju Beranda Utama...");

    window.location.href = "/index";
  }
};

function initCookieConsent() {
  if (getCookie("nl_cookie_consent")) {
    return;
  }

  const consentBanner = document.createElement("div");
  consentBanner.id = "nl-cookie-consent";
  consentBanner.className =
    "fixed bottom-0 left-0 w-full bg-white border-t border-gray-300 z-[99999] p-4 md:p-6 transform transition-transform duration-500 translate-y-full";

  consentBanner.innerHTML = `
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex-1">
        <h3 class="text-base md:text-lg font-bold text-gray-900 mb-1">Kami Menggunakan Cookie</h3>
        <p class="text-xs md:text-sm text-gray-600 leading-relaxed">
          Northline menggunakan cookie dan teknologi serupa untuk meningkatkan pengalaman berbelanja, menjaga keamanan akun, mengingat preferensi pengguna, menganalisis performa layanan, serta menyediakan fitur yang lebih relevan. Dengan memilih "Terima Semua Cookie", Anda menyetujui penggunaan cookie sebagaimana dijelaskan dalam <a href="/AppNorthAuth" class="text-[#DF414F] hover:underline font-medium">Kebijakan Privasi</a> dan <a href="/AppNorthAuth" class="text-[#DF414F] hover:underline font-medium">Syarat & Ketentuan</a> Northline.
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
      consentBanner.classList.remove("translate-y-full");
    }, 100);
  });

  const closeBanner = (status) => {
    setCookie("nl_cookie_consent", status, 365);
    consentBanner.classList.add("translate-y-full");
    setTimeout(() => {
      consentBanner.remove();
    }, 500);
  };

  document
    .getElementById("btn-accept-cookie")
    ?.addEventListener("click", () => closeBanner("accepted"));
  document
    .getElementById("btn-reject-cookie")
    ?.addEventListener("click", () => closeBanner("rejected"));
}

function initChatWidget() {
  const chatToggleMobile = document.getElementById("chat-toggle-mobile");
  const chatToggleDekstop = document.getElementById("chat-toggle-dekstop");
  const chatWidget = document.getElementById("chat-widget");
  const chatClose = document.getElementById("chat-close");

  const chatOriginalTitle = document.title;

  const openChat = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!chatWidget) return;
    if (typeof hideChatNotification === "function") {
      hideChatNotification();
    }
    document.title = "Northline Assistant Support";
    chatWidget.classList.remove("scale-0", "opacity-0", "pointer-events-none");
    chatWidget.classList.add("scale-100", "opacity-100");
  };

  const closeChat = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!chatWidget) return;
    document.title = chatOriginalTitle;
    chatWidget.classList.remove("scale-100", "opacity-100");
    chatWidget.classList.add("scale-0", "opacity-0", "pointer-events-none");
  };

  if (chatToggleMobile) {
    chatToggleMobile.addEventListener("click", openChat);
  }
  if (chatToggleDekstop) {
    chatToggleDekstop.addEventListener("click", openChat);
  }
  if (chatClose) {
    chatClose.addEventListener("click", closeChat);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initCookieConsent();
  initChatWidget();
  let user = null;
  try {
    const meRes = await fetch(_d("9kzs9k ~r9wo"), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      user = meData.data || meData.user || meData;
    }
  } catch (e) {}
  const authBtn = document.getElementById("auth-menu-btn");
  if (authBtn) {
    if (user && user.username) {
      authBtn.innerText = user.username;
      authBtn.href = "/AppNorthAccount";
      authBtn.classList.add("group", "relative");
    } else {
      authBtn.innerText = "Sign Up";
      authBtn.href = "/AppNorthAuth";
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
      mobileBtn.href = "/AppNorthAuth";
    }
  }
  document.querySelectorAll("#auth-nav-link-mobile").forEach((link) => {
    const text = link.querySelector("#auth-nav-text-mobile");
    if (!text) return;
    if (user && user.username) {
      link.href = "/AppNorthAccount";
      text.textContent = "You";
    } else {
      link.href = "/AppNorthAuth";
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
    const response = await fetch(_d("9kzs9}o~~sxq}9zy7nk~o"));

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();

    if (data.targetDate) {
      startPreOrderCountdown(data.targetDate);
    }
  } catch (err) {
    console.error("Gagal load timer:", err);
  }
});

window.WishlistManager = window.WishlistManager || {
  save: function () {
    if (window.WishlistManager && window.WishlistManager.save)
      window.WishlistManager.save();
  },
};

function updateNavbarWishlistBadge() {
  if (
    window.WishlistManager &&
    typeof WishlistManager.updateNavbarBadge === "function"
  ) {
    WishlistManager.updateNavbarBadge();
  }
}

function updateWishlistBadgeOnly() {
  updateNavbarWishlistBadge();
}

function saveToWishlist(idOrEvent, name, price, img) {
  if (window.WishlistManager && typeof WishlistManager.save === "function") {
    WishlistManager.save(idOrEvent, name, price, img);
  }
}

document.addEventListener("DOMContentLoaded", updateNavbarWishlistBadge);

function toggleWishlistPopup() {
  if (
    window.WishlistManager &&
    typeof WishlistManager.togglePopup === "function"
  ) {
    WishlistManager.togglePopup();
  }
}

function renderPopupItems() {
  if (
    window.WishlistManager &&
    typeof WishlistManager.renderPopupItems === "function"
  ) {
    WishlistManager.renderPopupItems();
  }
}

function removeProductFromPopup(id) {
  if (
    window.WishlistManager &&
    typeof WishlistManager.removeProduct === "function"
  ) {
    WishlistManager.removeProduct(id);
  }
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
    const meRes = await fetch(_d("9kzs9k ~r9wo"), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      const me = meData.data || meData.user || meData;
      userId = me.id;
    }
  } catch (e) {}

  if (!userId) return;

  try {
    const response = await fetch(_d("9kzs9 }o|7y|no|}9") + userId);
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
    const response = await fetch(_d("9kzs9k ~r9xy~spsmk~syx}"), {
      credentials: "include",
    });
    if (!response.ok) return;
    const data = await response.json();

    const globalNotifs = data.filter((n) => n.is_global === 1);

    for (const notif of globalNotifs) {
      const seenNotifId = localStorage.getItem(STORAGE_KEYS.GLOBAL(notif.id));

      if (!seenNotifId) {
        if (typeof showIosModal === "function") {
          const msg =
            (notif.title ? notif.title + ": " : "") +
            (notif.message || "Anda memiliki notifikasi baru");
          showIosModal(msg);
        }
        localStorage.setItem(STORAGE_KEYS.GLOBAL(notif.id), "true");

        break;
      }
    }
  } catch (err) {
    console.error("Gagal cek global notif:", err);
  }
}

function escNotifText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNotifTime(dt) {
  const date = new Date(dt || "");
  if (isNaN(date.getTime())) return "";
  return (
    date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " " +
    date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
  );
}

let _headerNotifCache = null;
let _headerNotifCacheAt = 0;

async function loadHeaderNotifications(force) {
  const list = document.getElementById("notif-popup-list-header");
  if (!list) return;

  if (!force && _headerNotifCache && Date.now() - _headerNotifCacheAt < 30000) {
    renderHeaderNotifications(list, _headerNotifCache);
    return;
  }

  list.innerHTML =
    '<p class="text-xs text-gray-400 text-center py-4">Memuat notifikasi...</p>';
  try {
    const res = await fetch("/api/notifications", { credentials: "include" });
    if (res.status === 401) {
      list.innerHTML =
        '<p class="text-xs text-gray-400 text-center py-4">Masuk untuk melihat notifikasi</p>';
      return;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const notifs = await res.json();
    _headerNotifCache = Array.isArray(notifs) ? notifs : [];
    _headerNotifCacheAt = Date.now();
    renderHeaderNotifications(list, _headerNotifCache);
  } catch (err) {
    list.innerHTML =
      '<p class="text-xs text-gray-400 text-center py-4">Gagal memuat notifikasi</p>';
  }
}

function renderHeaderNotifications(list, notifs) {
  if (notifs.length === 0) {
    list.innerHTML =
      '<p class="text-xs text-gray-400 text-center py-4">Tidak ada notifikasi</p>';
    return;
  }
  list.innerHTML = notifs
    .slice(0, 5)
    .map(function (n) {
      const timeStr = formatNotifTime(n.created_at || n.createdAt);
      return (
        '<div class="border-b border-gray-100 py-2 last:border-0">' +
        '<p class="text-xs font-medium text-gray-800">' +
        escNotifText(n.title) +
        "</p>" +
        '<p class="text-[10px] text-gray-500 leading-tight">' +
        escNotifText(n.message) +
        "</p>" +
        (timeStr
          ? '<p class="text-[10px] text-gray-400 mt-1">' + timeStr + "</p>"
          : "") +
        "</div>"
      );
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("notif-popup-list-header");
  if (!listEl) return;
  loadHeaderNotifications();
  const wrap = listEl.closest(".relative.group");
  if (wrap)
    wrap.addEventListener("mouseenter", () => loadHeaderNotifications(true));
});

window.openSellerRegistration = function () {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  if (isMobile) {
    showIosModal(
      "Pendaftaran Seller hanya tersedia di Desktop atau Mode Desktop Browser.",
    );
    return;
  }

  window.location.href = "/seller/AppNorthSellerRegister";
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

(function initDarkMode() {
  if (localStorage.getItem("dark_mode_enabled") === "true") {
    document.documentElement.classList.add("dark-mode");
    if (typeof window.applyDarkModeToFixed === "function") {
      window.applyDarkModeToFixed(true);
    }
  }
})();

if (window.visualViewport) {
  const target = document.getElementById("keyboard-target");

  window.visualViewport.addEventListener("resize", () => {
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    if (keyboardHeight > 0) {
      target.style.transform = `translateY(-${keyboardHeight}px)`;
    } else {
      target.style.transform = "translateY(0)";
    }
  });
}
