function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

let _currentUser = null;

function toggleMobileMenu() {
  const sidebar = document.getElementById("sidebar-menu");
  if (sidebar.classList.contains("hidden")) {
    sidebar.classList.remove("hidden");
  } else {
    sidebar.classList.add("hidden");
  }
}

async function handleLogout(e) {
  if (e && e.preventDefault) {
    e.preventDefault();
  }

  try {
    await fetch(_d('9kzs9k ~r9vyqy ~'), { method: "POST", credentials: "include" });
  } catch (e) {}

  localStorage.removeItem(STORAGE_KEYS.TOKEN);

  sessionStorage.clear();

  showIosModal("Logged out successfully!");

  setTimeout(() => {
    window.location.href = "/index";
  }, 500);
}

function injectDataToUI(data) {
  if (!data) return;

  const phoneInput = document.getElementById("user-phone");
  if (phoneInput) {
    phoneInput.value = data.phone || "";
  } else {
  }

  const genderRadios = document.getElementsByName("gender");

  if (data.gender && data.gender.trim() !== "") {
    genderRadios.forEach((radio) => {
      radio.checked = radio.value.toLowerCase() === data.gender.toLowerCase();
    });
  } else {
    genderRadios.forEach((radio) => (radio.checked = false));
  }

  if (document.getElementById("user-username")) {
    const usernameDariDB = data.username || "";
    if (usernameDariDB) {
      document.getElementById("user-username").value =
        `@${usernameDariDB.toLowerCase()}`;
    } else {
      document.getElementById("user-username").value = "";
    }
  }
  
  if (document.getElementById("sidebar-username")) {
    document.getElementById("sidebar-username").innerText = data.username || "";
  }

  if (document.getElementById("user-email")) {
    document.getElementById("user-email").value = data.email || "";
  }

  if (document.getElementById("user-fullname")) {
    if (data.name && data.name.trim() !== "") {
      document.getElementById("user-fullname").value = data.name.toUpperCase();
    } else {
      const emailDariDB = data.email;
      if (emailDariDB && emailDariDB.includes("@")) {
        const autoFullName = emailDariDB
          .split("@")[0]
          .replace(/\./g, " ")
          .toUpperCase();
        document.getElementById("user-fullname").value = autoFullName;
      } else {
        const fallbackName = data.username || "GUEST";
        document.getElementById("user-fullname").value =
          fallbackName.toUpperCase();
      }
    }
  }

  const registerDate = data.created_at || data.createdAt;
  const joinedElement = document.getElementById("user-joined");

  if (joinedElement) {
    if (registerDate) {
      try {
        const dateObj = new Date(registerDate);
        const options = {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        };
        const formattedDate = new Intl.DateTimeFormat("en-US", options).format(
          dateObj,
        );
        const cleanNumericDate = formattedDate.replace(",", "");
        joinedElement.innerText = cleanNumericDate;
      } catch (e) {
        joinedElement.innerText = registerDate;
      }
    } else {
      joinedElement.innerText = "00/00/0000 00:00";
    }
  }

  const avatarPreview = document.getElementById("user-avatar-preview");
  const sidebarAvatar = document.getElementById("sidebar-avatar");

  const isBase64 = data.avatar && data.avatar.startsWith("data:image");

  const isLocalFile =
    data.avatar &&
    data.avatar !== "default.png" &&
    !data.avatar.startsWith("data:image");

  let finalAvatar = "/public/icons/default.png";

  if (isBase64) {
    finalAvatar = data.avatar;
  } else if (isLocalFile) {
    finalAvatar = `/public/icons/${data.avatar}`;
  }

  if (avatarPreview) avatarPreview.src = finalAvatar;
  if (sidebarAvatar) sidebarAvatar.src = finalAvatar;

    // MOBILE PROFILE UI
  if (document.getElementById("mobile-username")) {
    document.getElementById("mobile-username").innerText =
      data.username || "Guest";
  }

  if (document.getElementById("mobile-username-value")) {
    document.getElementById("mobile-username-value").innerText =
      data.username ? `@${data.username}` : "-";
  }

  if (document.getElementById("mobile-email-value")) {
    document.getElementById("mobile-email-value").innerText =
      data.email || "-";
  }

  if (document.getElementById("mobile-phone-value")) {
    document.getElementById("mobile-phone-value").innerText =
      data.phone || "-";
  }

  if (document.getElementById("mobile-fullname-value")) {
    let mobileName = "";

    if (data.name && data.name.trim() !== "") {
      mobileName = data.name;
    } else if (data.email && data.email.includes("@")) {
      mobileName = data.email.split("@")[0].replace(/\./g, " ");
    } else {
      mobileName = data.username || "Guest";
    }

    document.getElementById("mobile-fullname-value").innerText = mobileName;
  }

  const mobileAvatar = document.getElementById(
    "user-avatar-preview-mobile",
  );

  if (mobileAvatar) {
    mobileAvatar.src = finalAvatar;
  }
}

function loadFallbackData() {
  injectDataToUI({
    username: "Guest",
    email: "",
    fullName: "Guest User",
    avatar: "default.png",
  });
}

function populateSettingsUserData() {
  const user = _currentUser;
  const nameEl = document.getElementById("settings-name");
  const emailEl = document.getElementById("settings-email");
  const avatarEl = document.getElementById("settings-avatar");
  if (!nameEl || !emailEl) return;
  if (user) {
    let displayName = user.name && user.name.trim() !== "" ? user.name :
                      user.email && user.email.includes("@") ? user.email.split("@")[0].replace(/\./g, " ") :
                      user.username || "User";
    nameEl.textContent = displayName;
    emailEl.textContent = user.email || "-";
    if (avatarEl && user.avatar) {
      let avatarSrc = user.avatar.startsWith("data:") ? user.avatar :
                      user.avatar.startsWith("/") ? user.avatar :
                      `/public/icons/${user.avatar}`;
      avatarEl.src = avatarSrc;
    }
  } else {
    const existingName = nameEl.textContent;
    const existingEmail = emailEl.textContent;
    if (existingName === "Nama Pengguna" || existingName === "User") {
      nameEl.textContent = "User";
      emailEl.textContent = "email@example.com";
    }
  }
  const toggle = document.getElementById("notif-toggle");
  if (toggle) {
    const enabled = localStorage.getItem("notifications_enabled") !== "false";
    setToggleState(toggle, enabled);
  }
  const loginToggle = document.getElementById("login-notif-toggle");
  if (loginToggle) {
    const enabled = localStorage.getItem("login_notif_enabled") !== "false";
    setToggleState(loginToggle, enabled);
  }
  const emailToggle = document.getElementById("email-notif-toggle");
  if (emailToggle) {
    const enabled = localStorage.getItem("email_notif_enabled") !== "false";
    setToggleState(emailToggle, enabled);
  }
  const darkToggle = document.getElementById("dark-mode-toggle");
  if (darkToggle) {
    const enabled = localStorage.getItem("dark_mode_enabled") === "true";
    setToggleState(darkToggle, enabled);
  }
}

function populateAccountInfo() {
  const user = _currentUser;
  if (!user) return;
  const nameEl = document.getElementById("ai-name");
  const usernameEl = document.getElementById("ai-username");
  const emailEl = document.getElementById("ai-email");
  const phoneEl = document.getElementById("ai-phone");
  const avatarEl = document.getElementById("ai-avatar");
  if (nameEl) nameEl.value = user.name || "";
  if (usernameEl) usernameEl.value = user.username || "";
  if (emailEl) emailEl.value = user.email || "";
  if (phoneEl) phoneEl.value = user.phone || "";
  if (avatarEl && user.avatar) {
    avatarEl.src = user.avatar.startsWith("data:") ? user.avatar :
                   user.avatar.startsWith("/") ? user.avatar :
                   `/public/icons/${user.avatar}`;
  }
}

function updateAccountInfo(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menyimpan...";
  }
  const payload = {
    name: document.getElementById("ai-name").value,
    username: document.getElementById("ai-username").value,
    email: document.getElementById("ai-email").value,
    phone: document.getElementById("ai-phone").value,
  };
  fetch(_d('9kzs9 }o|9z|ypsvo9 znk~o'), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (res.ok) {
        showIosModal("Profil berhasil diperbarui!");
        return fetchUserData();
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Gagal mengupdate profile");
    })
    .catch((err) => {
      showIosModal(err.message || "Gagal mengupdate profile, Server sedang sibuk");
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Simpan Perubahan";
      }
    });
}

function previewAiAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1048576) {
    showIosModal("Ukuran file maksimal 1 MB");
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = function (ev) {
    const preview = document.getElementById("ai-avatar");
    if (preview) preview.src = ev.target.result;
    fetch(_d('9kzs9k ~r9 zvykn7k!k~k|'), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: ev.target.result }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          _currentUser.avatar = ev.target.result;
        }
      })
      .catch(() => {});
  };
  reader.readAsDataURL(file);
}

async function fetchUserData() {
  try {
    const response = await fetch(_d('9kzs9k ~r9wo'), {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const result = await response.json();

      const apiUser = result.data || result.user || result || {};

      const mergedUserData = {
        ...apiUser,
        username: apiUser.username || "GUEST",
        name: apiUser.name || "",
        email: apiUser.email || "",
        phone: apiUser.phone || "",
        gender: apiUser.gender || "",
        avatar: apiUser.avatar || "",
        created_at:
          apiUser.created_at || apiUser.createdAt || new Date().toISOString(),
      };

      _currentUser = mergedUserData;
      injectDataToUI(mergedUserData);
      populateSettingsUserData();
    } else {
      loadFallbackData();
    }
  } catch (error) {
    console.warn(
      "API server offline/Error fetching data. Activating localized fallback.",
    );
    loadFallbackData();
    populateSettingsUserData();
  }
}

function enableEdit(inputId) {
  const input = document.getElementById(inputId);
  input.removeAttribute("readonly");
  input.classList.remove("border-none");
  input.classList.add("border-b", "border-gray-300");
  input.focus();
}

async function updateUserProfile(event) {
  event.preventDefault();

  const saveButton = event.target.querySelector('button[type="submit"]');
  const originalButtonText = saveButton ? saveButton.innerHTML : "Save Changes";

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.innerHTML = "Saving...";
  }

  const selectedGender = document.querySelector(
    'input[name="gender"]:checked',
  )?.value;

  const updatedPayload = {
    name: document.getElementById("user-fullname").value,
    email: document.getElementById("user-email").value,
    phone: document.getElementById("user-phone").value,
    gender: selectedGender,
  };

  try {
    const response = await fetch(_d('9kzs9 }o|9z|ypsvo9 znk~o'), {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedPayload),
    });

    if (response.ok) {
      showIosModal("Profile successfully updated!");

      await fetchUserData();
    } else {
      showIosModal(
        "Gagal mengupdate profile!, Server sedang sibuk",
      );
    }
  } catch (error) {
    console.error("Error Updating Profile:", error);
    showIosModal("An error occurred. Please try again later.");
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.innerHTML = originalButtonText;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const selectBtn = document.getElementById("select-image-btn");
  const fileInput = document.getElementById("avatar-input");
  const avatarPreview = document.getElementById("user-avatar-preview");
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);

  if (selectBtn && fileInput) {
    selectBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 1048576) {
        showIosModal("File too large! Max size is 1 MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = event.target.result;

        if (avatarPreview) avatarPreview.src = base64String;

        try {
          const response = await fetch(_d('9kzs9k ~r9 zvykn7k!k~k|'), {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ avatar: base64String }),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            if (_currentUser) _currentUser.avatar = base64String;
            injectDataToUI({ ...(_currentUser || {}), avatar: base64String });

          } else {
            loadUserProfile();
          }
        } catch (error) {
          loadUserProfile();
        }
      };
      reader.readAsDataURL(file);
    });
  }
});

function updateNavbarWishlistBadge() {
  if (window.WishlistManager && typeof WishlistManager.updateNavbarBadge === 'function') {
    WishlistManager.updateNavbarBadge();
  }
}

function updateWishlistBadgeOnly() {
  updateNavbarWishlistBadge();
}

let addressMap;
let addressMarker;

function initAddressMap() {
  let defaultLat = -6.4194;
  let defaultLng = 107.4589;

  if (_currentUser && _currentUser.address && _currentUser.address.includes(" @Coordinates:")) {
    const coordPart = _currentUser.address.split(" @Coordinates:")[1];
    const [savedLat, savedLng] = coordPart.split(",");
    if (savedLat && savedLng) {
      defaultLat = parseFloat(savedLat);
      defaultLng = parseFloat(savedLng);
    }
  }

  addressMap = L.map("address-google-map", { zoomControl: false }).setView(
    [defaultLat, defaultLng],
    15,
  );

  L.tileLayer(
    "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    {
      maxZoom: 20,
      attribution: "&copy; Google Maps",
    },
  ).addTo(addressMap);

  L.control.zoom({ position: "bottomright" }).addTo(addressMap);

  addressMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(
    addressMap,
  );

  document.getElementById("addr-latitude").value = defaultLat;
  document.getElementById("addr-longitude").value = defaultLng;

  addressMarker.on("dragend", function (e) {
    const position = addressMarker.getLatLng();
    document.getElementById("addr-latitude").value = position.lat;
    document.getElementById("addr-longitude").value = position.lng;
  });
}

async function useCurrentLocation() {
  if (!("geolocation" in navigator)) {
    showIosModal("Perangkatmu tidak mendukung GPS. Aktifkan lokasi perangkat dan coba lagi.");
    return;
  }

  const btn = document.getElementById("btn-use-location");
  const btnText = document.getElementById("btn-use-location-text");
  const originalText = btnText ? btnText.textContent : "Gunakan Lokasi Sekarang";

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "Mendeteksi lokasi...";

  const getPosition = () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      });
    });

  try {
    const pos = await getPosition();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    if (addressMap && addressMarker) {
      addressMap.setView([lat, lng], 17);
      addressMarker.setLatLng([lat, lng]);
    }

    document.getElementById("addr-latitude").value = lat;
    document.getElementById("addr-longitude").value = lng;

    if (btnText) btnText.textContent = "Mendapatkan alamat...";

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=id&addressdetails=1&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};

        const provinsi = a.state || a.region || "";
        const kota = a.city || a.town || a.village || a.county || "";
        const kecamatan = a.suburb || a.city_district || a.district || a.town || "";
        const kodepos = a.postcode || "";
        const jalan = [a.road, a.house_number].filter(Boolean).join(" No. ");
        const detail = [
          jalan,
          a.neighbourhood || a.quarter || a.hamlet || "",
        ].filter(Boolean).join(", ");

        const setValue = (id, val) => {
          const el = document.getElementById(id);
          if (el && val) el.value = val;
        };

        setValue("addr-provinsi", provinsi);
        setValue("addr-kota", kota);
        setValue("addr-kecamatan", kecamatan);
        setValue("addr-kodepos", kodepos);
        setValue("addr-detail", detail);

        if (btnText) btnText.textContent = "Lokasi ditemukan! Cek & simpan";
      } else {
        if (btnText) btnText.textContent = "Lokasi didapat, isi alamat manual";
      }
    } catch (err) {
      console.error("Reverse geocode gagal:", err);
      if (btnText) btnText.textContent = "Lokasi didapat, isi alamat manual";
    }
  } catch (err) {
    if (err && err.code === 1) {
      showIosModal("Izin lokasi ditolak. Aktifkan lokasi di pengaturan browser/HP, lalu coba lagi.");
    } else if (err && err.code === 2) {
      showIosModal("Lokasi tidak tersedia. Pastikan GPS perangkat aktif, lalu coba lagi.");
    } else {
      showIosModal("Gagal mendeteksi lokasi. Pastikan GPS aktif, lalu coba lagi.");
    }
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => {
      if (btnText && btnText.textContent !== originalText) {
        btnText.textContent = originalText;
      }
    }, 6000);
  }
}

const ACCOUNT_TAB_TITLES = {
  profile: 'Profile Details - Northline',
  address: 'Address - Northline',
  password: 'Change Password - Northline',
  notif: 'Notifications - Northline',
  orders: 'Pesanan Saya - Northline',
  northpay: 'NorthPay - Northline',
  northpayTopup: 'Top Up NorthPay - Northline',
  northpayHistory: 'Riwayat NorthPay - Northline',
  northpayTransfer: 'Transfer NorthPay - Northline',
  northpaySettings: 'NorthPay Settings - Northline',
  settings: 'Pengaturan Akun - Northline',
  accountInfo: 'Informasi Akun - Northline',
  chatStorage: 'Storage Chat- Northline',
};

function switchAccountTab(tabName) {
  const title = ACCOUNT_TAB_TITLES[tabName];
  if (title) {
    document.title = title;
  }
  const url = new URL(window.location);
  url.searchParams.set('tab', tabName);
  history.replaceState(null, '', url.toString());

  const menuProfile = document.getElementById("sidebar-menu-profile");
  const menuAddress = document.getElementById("sidebar-menu-address");
  const menuPassword = document.getElementById("sidebar-menu-password");
  const menuNotif = document.getElementById("sidebar-menu-notif");
  const menuOrders = document.getElementById("sidebar-menu-orders");
  const menuNorthpay = document.getElementById("sidebar-menu-northpay");
  const menuNorthpayTransfer = document.getElementById("sidebar-menu-northpayTransfer");
  const menuSettings = document.getElementById("sidebar-menu-settings");
  const menuChatStorage = document.getElementById("sidebar-menu-chatStorage");

  [menuProfile, menuAddress, menuPassword, menuNotif, menuOrders, menuNorthpay, menuNorthpayTransfer, menuSettings, menuChatStorage].forEach((el) => {
    if (el) {
      el.classList.remove("text-northline-orange", "font-semibold");

      el.classList.remove("text-gray-500");
      el.classList.add("text-gray-500", "hover:text-northline-black");
    }
  });

  const activeMenu = document.getElementById(`sidebar-menu-${tabName}`);
  if (activeMenu) {
    activeMenu.classList.remove("text-gray-500");
    activeMenu.classList.add("text-northline-orange", "font-semibold");
  }

  const profileSection = document.getElementById("spa-profile-section");
  const addressSection = document.getElementById("spa-address-section");
  const passwordSection = document.getElementById("spa-password-section");
  const notifSection = document.getElementById("spa-notif-section");
  const ordersSection = document.getElementById("spa-orders-section");
  const northpaySection = document.getElementById("spa-northpay-section");
  const northpayTopupSection = document.getElementById("spa-northpay-topup-section");
  const northpayHistorySection = document.getElementById("spa-northpay-history-section");
  const northpayTransferSection = document.getElementById("spa-northpay-transfer-section");
  const northpaySettingsSection = document.getElementById("spa-northpay-settings-section");
  const northpayFormSection = document.getElementById("spa-northpay-form-section");
  const settingsSection = document.getElementById("spa-settings-section");
  const accountInfoSection = document.getElementById("spa-account-info-section");
  const chatStorageSection = document.getElementById("spa-chat-storage-section");

  [profileSection, addressSection, passwordSection, notifSection, ordersSection, northpaySection, northpayTopupSection, northpayHistorySection, northpayTransferSection, northpaySettingsSection, northpayFormSection, settingsSection, accountInfoSection, chatStorageSection].forEach(
    (sec) => {
      if (sec) sec.classList.add("hidden");
    },
  );

  if (tabName === "address" && addressSection) {
    addressSection.classList.remove("hidden");
    renderAddressCard();
  } else if (tabName === "profile" && profileSection) {
    profileSection.classList.remove("hidden");
  } else if (tabName === "password" && passwordSection) {
    passwordSection.classList.remove("hidden");
  } else if (tabName === "notif" && notifSection) {
    notifSection.classList.remove("hidden");
    markNotifRead();
    loadNotifications();
  } else if (tabName === "orders" && ordersSection) {
    ordersSection.classList.remove("hidden");
    document.querySelectorAll('.order-filter').forEach(function(b) {
      b.classList.remove('border-[#DF414F]', 'text-[#DF414F]');
      b.classList.add('border-transparent', 'text-gray-400');
    });
    var activeBtn = document.querySelector('.order-filter[data-filter="' + ordersFilter + '"]');
    if (activeBtn) {
      activeBtn.classList.remove('border-transparent', 'text-gray-400');
      activeBtn.classList.add('border-[#DF414F]', 'text-[#DF414F]');
    }
    loadOrders();
  } else if (tabName === "northpay" && northpaySection) {
    northpaySection.classList.remove("hidden");
    loadNorthpayData();
  } else if (tabName === "northpayTopup" && northpayTopupSection) {
    northpayTopupSection.classList.remove("hidden");
    loadNorthpayBalance();
    updateTopupSummary();
  } else if (tabName === "northpayHistory" && northpayHistorySection) {
    northpayHistorySection.classList.remove("hidden");
    loadNorthpayHistorySection();
    switchNorthpayHistoryTab(northpayHistoryTab);
  } else if (tabName === "northpayTransfer" && northpayTransferSection) {
    northpayTransferSection.classList.remove("hidden");
    loadTransferSection();
  } else if (tabName === "northpaySettings" && northpaySettingsSection) {
    northpaySettingsSection.classList.remove("hidden");
    loadNorthpaySettings();
  } else if (tabName === "northpayForm" && northpayFormSection) {
    northpayFormSection.classList.remove("hidden");
  } else if (tabName === "settings" && settingsSection) {
    settingsSection.classList.remove("hidden");
    populateSettingsUserData();
  } else if (tabName === "accountInfo" && accountInfoSection) {
    accountInfoSection.classList.remove("hidden");
    populateAccountInfo();
  } else if (tabName === "chatStorage" && chatStorageSection) {
    chatStorageSection.classList.remove("hidden");
    loadChatStorage();
  }
}

window.openChatStorage = function () {
  const chatWidget = document.getElementById("chat-widget");
  if (chatWidget && chatWidget.classList.contains("scale-0") === false) {
    toggleChatWidget();
  }
  switchAccountTab("chatStorage");
};

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function loadChatStorage() {
  const clearBtn = document.getElementById("chatstorage-clear-btn");
  if (clearBtn) clearBtn.classList.remove("hidden");

  if (typeof window.getChatStorageUsage === "function") {
    window.getChatStorageUsage().then(function (res) {
      if (!res || !res.success) {
        showIosModal("Gagal memuat penyimpanan chat.");
        return;
      }
      renderChatStorage(res.usage);
    }).catch(function () {
      showIosModal("Gagal memuat penyimpanan chat.");
    });
  } else {
    showIosModal("Fitur penyimpanan belum tersedia.");
  }
}

function renderChatStorage(usage) {
  const countEl = document.getElementById("chatstorage-count");
  const bytesEl = document.getElementById("chatstorage-bytes");
  const barEl = document.getElementById("chatstorage-bar");
  if (!countEl) return;

  const count = usage ? usage.count : 0;
  const bytes = usage ? usage.bytes : 0;
  const limitBytes = usage && usage.limitBytes ? usage.limitBytes : 2097152;
  const limitMessages = usage && usage.limitMessages ? usage.limitMessages : 500;

  const percent = Math.min(100, (bytes / limitBytes) * 100);
  const isFull = count >= limitMessages || bytes >= limitBytes;

  countEl.textContent = count;
  bytesEl.textContent = formatBytes(bytes);
  if (barEl) {
    barEl.style.width = Math.max(2, percent) + '%';
    barEl.className = 'h-full ' + (isFull ? 'bg-[#DF414F]' : 'bg-[#DF414F]/70');
  }
}

window.clearChatStorage = function () {
  if (typeof window.clearChatHistory !== "function") return;

  const ok = window.confirm("Hapus semua riwayat chat Anda? Tindakan ini tidak dibatalkan.");
  if (!ok) return;

  window.clearChatHistory().then(function (res) {
    if (res && res.success) {
      renderChatStorage({ count: 0, bytes: 0, limitBytes: 2097152, limitMessages: 500 });
      showIosModal("Riwayat chat AI berhasil dihapus.");
    } else {
      showIosModal("Gagal menghapus riwayat chat.");
    }
  }).catch(function () {
    showIosModal("Gagal menghapus riwayat chat.");
  });
};

let ordersData = [];
let ordersFilter = 'all';

function loadOrders() {
  const list = document.getElementById('orders-list');
  list.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Loading...</div>';
  const uid = _currentUser?.id;
  if (!uid) return;
  fetch(_d('9kzs9 }o|7y|no|}9') + uid, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      ordersData = data.orders || [];
      renderOrders();
    })
    .catch(() => {
      list.innerHTML = '<div class="text-center text-gray-400 text-xs py-12">Gagal memuat pesanan</div>';
    });
}

function getOrderStatus(o) {
  if (o.payment_status === 'cancelled') return { label: 'Dibatalkan', color: 'border-gray-200 text-gray-600', filter: 'cancelled' };
  if (o.payment_status === 'pending') return { label: 'Belum Dibayar', color: 'border-gray-200 text-gray-600', filter: 'pending' };
  if (o.delivery_status && o.delivery_status.toLowerCase().includes('selesai')) return { label: 'Selesai', color: 'border-gray-200 text-gray-600', filter: 'success' };
  if (o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim')) return { label: 'Dikirim', color: 'border-gray-200 text-gray-600', filter: 'shipped' };
  return { label: 'Diproses', color: 'border-yellow-500 text-yellow-600', filter: 'processing' };
}

function renderOrders() {
  const list = document.getElementById('orders-list');
  const filtered = ordersFilter === 'all'
    ? ordersData
    : ordersData.filter(o => {
        if (ordersFilter === 'pending') return o.payment_status === 'pending';
        if (ordersFilter === 'cancelled') return o.payment_status === 'cancelled';
        if (ordersFilter === 'processing') return o.payment_status === 'success' && (!o.delivery_status || (!o.delivery_status.toLowerCase().includes('dikirim') && !o.delivery_status.toLowerCase().includes('selesai')));
        if (ordersFilter === 'shipped') return o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim');
        if (ordersFilter === 'success') return o.delivery_status && o.delivery_status.toLowerCase().includes('selesai');
        return true;
      });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="bg-white border border-gray-200 rounded-sm p-6 text-center"><div class="text-gray-400 text-xs">Belum ada pesanan</div></div>';
    return;
  }

  const userAddr = _currentUser && _currentUser.address ? _currentUser.address.split(' @Coordinates:')[0].trim() : '';
  const userName = _currentUser && _currentUser.name ? _currentUser.name : '';
  const userPhone = _currentUser && _currentUser.phone ? _currentUser.phone : '';

  list.innerHTML = filtered.map(o => {
    const d = new Date(o.created_at);
    const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const st = getOrderStatus(o);

    const steps = [
      { label: 'Dibuat', done: true },
      { label: 'Diproses', done: o.delivery_status && o.delivery_status.toLowerCase().includes('proses') },
      { label: 'Dikirim', done: o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim') },
      { label: 'Selesai', done: o.delivery_status && o.delivery_status.toLowerCase().includes('selesai') },
    ];

    return '<div class="bg-white border border-gray-200 rounded-sm">' +

      '<div class="flex items-center justify-between px-3 py-2 border-b border-gray-100">' +
        '<div class="flex items-center gap-1.5">' +
          '<img src="https://img.icons8.com/?size=100&id=59878&format=png&color=DF414F" class="w-3.5 h-3.5">' +
          '<span class="text-[11px] font-semibold text-gray-800">Northline</span>' +
        '</div>' +
        '<span class="text-[10px] font-semibold border px-2 py-0.5 ' + st.color + '">' + st.label + '</span>' +
      '</div>' +

      (o.payment_status !== 'pending' && o.payment_status !== 'cancelled' ? '<div class="px-3 py-3 border-b border-gray-100 bg-gray-50/30">' +
        '<div class="flex items-center gap-2 mb-2 cursor-pointer select-none" onclick="openTrackingMap(\'' + escapeHtml(o.order_id) + '\')">' +
          '<img src="https://img.icons8.com/?size=100&id=7880&format=png&color=DF414F" class="w-3.5 h-3.5">' +
          '<span class="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Tracking Pengiriman</span>' +
          '<span class="text-[#DF414F] text-[10px] font-semibold ml-auto">Lacak di Peta ›</span>' +
        '</div>' +
        '<div class="text-[10px] text-gray-500 leading-relaxed">' +
          (userName ? '<span class="font-medium text-gray-800">' + escapeHtml(userName) + '</span>' + (userPhone ? ' (' + escapeHtml(userPhone) + ')' : '') + '<br>' : '') +
          (userAddr ? escapeHtml(userAddr) : '') +
          (o.estimated_arrival ? '<br><span class="text-gray-400">Estimasi tiba: ' + escapeHtml(o.estimated_arrival) + '</span>' : '') +
        '</div>' +
        (o.tracking_number ? '<div class="mt-2 text-[10px] bg-white border border-gray-100 p-2 rounded-sm">' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-gray-500">Kurir: <b class="text-gray-800">' + escapeHtml(o.tracking_courier || '-') + '</b></span>' +
            '<button onclick="navigator.clipboard.writeText(\'' + escapeHtml(o.tracking_number) + '\').then(function(){alert(\'Nomor resi disalin\')})" class="text-[#DF414F] font-semibold">Salin</button>' +
          '</div>' +
          '<div class="mt-1">No. Resi: <b class="text-[#DF414F] tracking-wider">' + escapeHtml(o.tracking_number) + '</b></div>' +
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
          '<p class="text-[12px] font-medium text-gray-800 leading-4 line-clamp-2">' + escapeHtml(o.product_name || '') + '</p>' +
          '<div class="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-400">' +
            (o.chosen_color ? '<span>' + escapeHtml(o.chosen_color) + '</span>' : '') +
            (o.chosen_size ? '<span>Size ' + escapeHtml(o.chosen_size) + '</span>' : '') +
            '<span>Qty: ' + (o.quantity || 1) + '</span>' +
          '</div>' +
          '<p class="text-[11px] font-semibold text-gray-800 mt-2">Rp ' + parseInt(o.total_price).toLocaleString('id-ID') + '</p>' +
        '</div>' +
      '</div>' +

      (o.payment_status === 'pending' ? '<div class="px-3 py-2 border-t border-gray-100 flex justify-end">' +
        '<button class="text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Bayar Sekarang</button>' +
      '</div>' : '') +
      (o.payment_status === 'cancelled' ? '<div class="px-3 py-2 border-t border-gray-100 text-center text-[10px] text-red-400">Pesanan dibatalkan</div>' : '') +
      (o.payment_status === 'success' && o.delivery_status && o.delivery_status.toLowerCase().includes('dikirim') ? '<div class="px-3 py-2 border-t border-gray-100 flex justify-end">' +
        '<button onclick="confirmOrderReceipt(\'' + escapeHtml(o.order_id) + '\')" class="text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Pesanan Selesai</button>' +
      '</div>' : '') +
      (o.payment_status === 'success' && o.delivery_status && o.delivery_status.toLowerCase().includes('selesai') ? '<div class="px-3 py-2.5 border-t border-gray-100 flex items-center justify-between gap-3">' +
              '<span class="text-[11px] leading-4 text-gray-500 max-w-[65%] line-clamp-2">Bagikan pengalamanmu dengan produk ini dan bantu pembeli lainnya:</span>' +
              '<button onclick="openReviewSpa(\'' + escapeHtml(o.order_id) + '\')" class="shrink-0 text-[11px] font-semibold bg-[#DF414F] text-white px-4 py-1.5">Beri Ulasan</button>' +
            '</div>' : '') +

    '</div>';
  }).join('');
}

async function confirmOrderReceipt(orderId) {
  try {
    const res = await fetch(_d('9kzs9k ~r9y|no|}9myxps|w7|omosz~'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();
    showIosModal(data.message || (data.success ? "Pesanan diterima" : "Gagal konfirmasi"));
    if (data.success) loadOrders();
  } catch (e) {
    showIosModal("Gagal konfirmasi pesanan");
  }
}

function parseCoordinatesFromAddress(addr) {
  try {
    const part = String(addr || '').split(' @Coordinates:')[1];
    if (!part) return null;
    const [lat, lng] = part.split(',');
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) return null;
    return { lat: la, lng: ln };
  } catch (e) { return null; }
}

let trackingMapInstance = null;

function closeTrackingMap() {
  const root = document.getElementById('tracking-map-root');
  if (root) root.remove();
  if (trackingMapInstance) {
    try { trackingMapInstance.remove(); } catch (e) {}
    trackingMapInstance = null;
  }
  try { document.body.style.overflow = ''; } catch (e) {}
}

function trackingTimelineHtml(events, createdAt, order) {
  const items = [];
  items.push({ status: 'Pesanan Dibuat', description: 'Pesanan berhasil dibuat', location: null, time: createdAt || null, first: true });
  (events || []).forEach(e => {
    items.push({ status: e.status, description: e.description, location: e.location, time: e.created_at, first: false });
  });
  const ds = String(order.delivery_status || '').toLowerCase();
  if (ds.includes('selesai')) {
    items.push({ status: 'Pesanan Selesai', description: 'Pesanan telah diterima', location: null, time: null, first: false });
  }
  return items.map((it, i) => {
    const isLast = i === items.length - 1;
    return '<div class="flex gap-3" style="position:relative;padding-bottom:16px">' +
      (isLast ? '' : '<div style="position:absolute;left:5px;top:14px;bottom:-2px;width:2px;background:#f3e0e2"></div>') +
      '<div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:2px;' + (isLast ? 'background:#DF414F;box-shadow:0 0 0 4px rgba(223,65,79,.18)' : 'background:#fff;border:2px solid #DF414F') + '"></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:700;color:' + (isLast ? '#DF414F' : '#111827') + '">' + escapeHtml(it.status) + '</div>' +
        (it.description ? '<div style="font-size:11px;color:#6b7280;margin-top:1px">' + escapeHtml(it.description) + '</div>' : '') +
        (it.location ? '<div style="font-size:10px;color:#9ca3af;margin-top:1px">📍 ' + escapeHtml(it.location) + '</div>' : '') +
        (it.time ? '<div style="font-size:10px;color:#9ca3af;margin-top:1px">' + new Date(it.time).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div>' : '') +
      '</div></div>';
  }).join('');
}

function trackingMapHtml(order) {
  return '<div id="tracking-map-root" class="fixed inset-0 z-[99999] bg-black/60 flex items-end md:items-center justify-center" onclick="if(event.target===this)closeTrackingMap()">' +
    '<div style="width:100%;max-width:520px;background:#fff;border-radius:16px 16px 0 0;max-height:92vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">' +
      '<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">' +
        '<div class="min-w-0">' +
          '<h3 class="text-sm font-bold text-gray-900">Lacak Pengiriman</h3>' +
          '<p class="text-[10px] text-gray-400 truncate">' + escapeHtml(order.order_id || '') + '</p>' +
        '</div>' +
        '<button onclick="closeTrackingMap()" class="w-8 h-8 flex items-center justify-center text-gray-500 active:bg-gray-100 rounded-full"><img src="https://img.icons8.com/?size=100&id=7811&format=png&color=df414f" class="w-5 h-5" /></button>' +
      '</div>' +
      '<div class="flex items-center gap-3 px-4 py-2 bg-gray-50/60 text-[10px] text-gray-600">' +
        '<span>Kurir: <b class="text-gray-800">' + escapeHtml(order.tracking_courier || '-') + '</b></span>' +
        '<span class="text-gray-300">|</span>' +
        (order.tracking_number
          ? '<span class="flex items-center gap-1">Resi: <b class="text-[#DF414F] tracking-wider">' + escapeHtml(order.tracking_number) + '</b>' +
            '<button onclick="navigator.clipboard.writeText(\'' + escapeHtml(order.tracking_number) + '\').then(function(){closeTrackingMap();showIosModal(\'Nomor resi disalin\')})" class="text-[#DF414F] font-semibold">Salin</button></span>'
          : '<span>Belum ada resi</span>') +
        (order.estimated_arrival ? '<span class="text-gray-300">|</span><span>Est. ' + escapeHtml(order.estimated_arrival) + '</span>' : '') +
      '</div>' +
      '<div class="flex-1 overflow-y-auto">' +
        '<div id="tracking-map-container" style="height:300px"></div>' +
        '<div class="px-4 py-4 border-t border-gray-100">' +
          '<div class="text-[10px] font-bold text-gray-500 uppercase mb-3">Riwayat Perjalanan</div>' +
          '<div id="tracking-timeline"></div>' +
        '</div>' +
      '</div>' +
    '</div></div>';
}

function drawTrackingMap(order, events, origin) {
  const container = document.getElementById('tracking-map-container');
  const dest = parseCoordinatesFromAddress(order.shipping_address);
  const points = [];
  if (origin) points.push({ lat: origin.lat, lng: origin.lng, kind: 'origin', label: 'Toko Northline' });
  (events || []).forEach((e, i) => {
    if (e.lat != null && e.lng != null) points.push({ lat: Number(e.lat), lng: Number(e.lng), kind: 'event', index: i + 1, label: e.status });
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

  const coordPoints = points.map(p => [p.lat, p.lng]);

  points.forEach(p => {
    let iconHtml = null;
    if (p.kind === 'origin') {
      iconHtml = '<div style="background:#16a34a;border:2px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>';
    } else if (p.kind === 'dest') {
      iconHtml = '<div style="background:#2563eb;border:2px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>';
    } else {
      iconHtml = '<div style="background:#DF414F;border:2px solid #fff;border-radius:50%;width:18px;height:18px;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">' + p.index + '</div>';
    }
    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
    L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup('<b>' + escapeHtml(p.label) + '</b>');
  });

  if (coordPoints.length >= 2) {
    L.polyline(coordPoints, { color: '#DF414F', weight: 3, opacity: 0.85, dashArray: '1,8' }).addTo(map);
    L.polyline(coordPoints, { color: '#DF414F', weight: 3, opacity: 0.9 }).addTo(map);
  }

  map.fitBounds(L.latLngBounds(coordPoints).pad(0.25));
}

async function openTrackingMap(orderId) {
  try {
    const res = await fetch(_d('9kzs9k ~r9~|kmusxq9') + encodeURIComponent(orderId), { credentials: 'include' });
    const data = await res.json();
    if (!data.success) {
      showIosModal(data.message || 'Gagal memuat tracking');
      return;
    }
    const order = data.order || {};
    const events = data.events || [];
    const origin = data.origin || null;

    const root = document.createElement('div');
    root.id = 'tracking-map-root-holder';
    document.body.appendChild(root);
    root.innerHTML = trackingMapHtml(order);
    document.body.style.overflow = 'hidden';
    document.getElementById('tracking-timeline').innerHTML = trackingTimelineHtml(events, order.created_at, order);
    setTimeout(() => drawTrackingMap(order, events, origin), 50);
  } catch (e) {
    console.log(e);
    showIosModal('Gagal memuat tracking');
  }
}

function _d2(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

let reviewSpaState = {
  orderId: null,
  items: [],
  deliveryRating: 0,
  currentIndex: 0,
  pendingUploads: {},
  submitting: false,
  reviewCodes: {},
  prevUrl: '',
  prevTitle: ''
};

function genReviewCode() {
  let s = '';
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'rv-' + s;
}

function applyReviewSpaUrl() {
  const st = reviewSpaState;
  const item = st.items[st.currentIndex];
  if (!item) return;
  const code = st.reviewCodes[String(item.productId)] || (st.reviewCodes[String(item.productId)] = genReviewCode());
  try { history.replaceState({ reviewSpa: true }, '', '/penilaian/' + encodeURIComponent(item.productId) + '/' + code); } catch (e) {}
  document.title = 'Penilaian Produk - Northline Indonesia';
}

function openReviewSpa(orderId) {
  fetch(_d('9kzs9|o!so"}9y|no|}9Dy|no|Sn9|o!so"klvo').replace(':orderId/', orderId + '/'), { credentials: "include" })
    .then(r => r.json())
    .then(async (data) => {
      if (!data.success) {
        showIosModal(data.message || "Tidak bisa membuka ulasan");
        return;
      }
      reviewSpaState = {
        orderId: data.orderId,
        items: data.items,
        deliveryRating: data.deliveryRating || 0,
        currentIndex: 0,
        pendingUploads: {},
        submitting: false,
        reviewCodes: {},
        prevUrl: location.pathname + location.search,
        prevTitle: document.title
      };
      await loadSpaProducts();
      renderReviewSpa();
    })
    .catch(() => showIosModal("Gagal memuat data ulasan"));
}

async function loadSpaProducts() {
  const cats = window.northlineCatalog || [];
  const map = {};
  (cats.products || []).forEach(p => { map[String(p.id)] = p; });
  reviewSpaState.items.forEach(item => {
    const p = map[String(item.productId)];
    if (p) {
      item.productName = p.name || item.productName;
      item.productImage = (p.thumbs && p.thumbs[0]) || (p.images && p.images[0]) || item.productImage;
    }
  });
}

function reviewSpaContainer() {
  let el = document.getElementById('review-spa-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'review-spa-root';
    document.body.appendChild(el);
  }
  return el;
}

function renderReviewSpa() {
  const st = reviewSpaState;
  const item = st.items[st.currentIndex];
  const root = reviewSpaContainer();
  const photoSlots = (st.pendingUploads[item.productId] || []).slice(0, 3);

  applyReviewSpaUrl();

  root.innerHTML =
  '<div class="fixed inset-0 z-[9999] bg-black/60" onclick="if(event.target===this)closeReviewSpa()">' +
    '<div class="fixed inset-0 bg-white flex flex-col border border-gray-200">' +
      '<div class="flex items-center justify-between py-3 border-b border-gray-200">' +
        '<button onclick="closeReviewSpa()" class="w-10 h-10 flex items-center justify-center text-gray-500 active:bg-gray-100 rounded-full"><span class="text-xl"><img src="https://img.icons8.com/?size=100&id=7811&format=png&color=df414f" class="w-6 h-6" /></span></button>' +
        '<div class="flex-1 text-center">' +
          '<h3 class="text-sm font-bold text-gray-900">Beri Penilaian</h3>' +
          '<p class="text-[10px] text-gray-400">Item ' + (st.currentIndex + 1) + ' dari ' + st.items.length + '</p>' +
        '</div>' +
        '<div class="w-10"></div>' +
      '</div>' +

      '<div class="flex-1 overflow-y-auto p-2 space-y-4">' +

        '<div class="flex gap-3">' +
          '<div class="w-16 h-16 bg-gray-50 border border-gray-200 overflow-hidden shrink-0">' +
            '<img src="' + (item.productImage || '/public/icons/default.png') + '" class="w-full h-full object-cover">' +
          '</div>' +
          '<div class="min-w-0">' +
            '<p class="text-[12px] font-medium text-gray-800 leading-4 line-clamp-2">' + escapeHtml(item.productName || '') + '</p>' +
            '<p class="text-[10px] text-gray-400 mt-1">' +
              (item.chosenColor ? 'Warna: ' + escapeHtml(item.chosenColor) + ' · ' : '') +
              (item.chosenSize ? 'Size: ' + escapeHtml(item.chosenSize) : '') +
              ' · Qty: ' + item.quantity +
            '</p>' +
          '</div>' +
        '</div>' +

        '<div class="space-y-3 pt-2">' +
          renderStarRow('Bahan', 'spa-rating-bahan', 0) +
          renderStarRow('Ukuran', 'spa-rating-ukuran', 0) +
          renderStarRow('Warna', 'spa-rating-warna', 0) +
        '</div>' +

        '<div class="pt-1">' +
          '<div class="text-[10px] font-bold text-gray-500 uppercase mb-2">Foto Produk <span class="text-gray-300">(maks 3)</span></div>' +
          '<div class="flex gap-2 flex-wrap">' +
            photoSlots.map((u, i) =>
              '<div class="relative w-16 h-16 border border-gray-200 overflow-hidden">' +
                '<img src="' + u + '" class="w-full h-full object-cover">' +
                '<button onclick="removeReviewPhoto(\'' + escapeHtml(item.productId) + '\',' + i + ')" class="absolute top-0 right-0 w-4 h-4 bg-black/60 text-white text-[9px] leading-none">✕</button>' +
              '</div>'
            ).join('') +
            (photoSlots.length < 3 ? '<label class="w-16 h-16 border border-gray-300 flex flex-col items-center justify-center cursor-pointer text-gray-400">' +
              '<span class="text-lg leading-none">+</span><span class="text-[8px]">Foto</span>' +
              '<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden" onchange="uploadReviewPhoto(event,\'' + escapeHtml(item.productId) + '\')">' +
            '</label>' : '') +
          '</div>' +
        '</div>' +

        '<div>' +
          '<div class="text-[10px] font-bold text-gray-500 uppercase mb-2">Penjelasan</div>' +
          '<textarea id="spa-review-text" rows="3" class="w-full border border-gray-200 p-2 text-[12px] outline-none focus:border-[#DF414F] resize-none" placeholder="Tulis pengalamanmu dengan produk ini..."></textarea>' +
        '</div>' +

        (st.currentIndex === 0 ?
        '<div class="pt-1">' +
          '<div class="text-[10px] font-bold text-gray-500 uppercase mb-2">Rating Pengiriman <span class="text-gray-300">(kurir & packing)</span></div>' +
          '<div class="flex gap-1 mb-2" id="spa-delivery-rating">' + starButtonsHtml('spa-delivery-rating', st.deliveryRating) + '</div>' +
          (item.trackingCourier || item.trackingNumber || item.shippedAt || item.estimatedArrival ? 
            '<div class="mt-2 space-y-1.5 text-[10px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-100">' +
              (item.trackingCourier ? '<div class="flex items-center gap-1"><span class="font-medium text-gray-600 w-20">Kurir:</span><span>' + escapeHtml(item.trackingCourier) + '</span></div>' : '') +
              (item.trackingNumber ? '<div class="flex items-center gap-1"><span class="font-medium text-gray-600 w-20">Resi:</span><span class="font-mono">' + escapeHtml(item.trackingNumber) + '</span></div>' : '') +
              (item.shippedAt ? '<div class="flex items-center gap-1"><span class="font-medium text-gray-600 w-20">Dikirim:</span><span>' + formatDateOnly(item.shippedAt) + '</span></div>' : '') +
              (item.estimatedArrival ? '<div class="flex items-center gap-1"><span class="font-medium text-gray-600 w-20">Est. Tiba:</span><span>' + formatDateOnly(item.estimatedArrival) + '</span></div>' : '') +
            '</div>' : '') +
        '</div>' : '') +
      '</div>' +

      '<div class="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2">' +
          '<div class="flex-1 min-w-0">' +
              '<span class="text-[10px] leading-tight text-gray-400 block max-w-[180px]">Bagikan pengalamanmu untuk membantu pembeli lainnya.</span>' +
          '</div>' +
          (st.currentIndex > 0
              ? '<button onclick="reviewSpaState.currentIndex--;renderReviewSpa()" class="text-[11px] font-semibold border border-gray-200 text-gray-600 px-4 py-2">Sebelumnya</button>'
              : '<span></span>') +
          '<button id="spa-submit-btn" onclick="submitReviewSpaItem()" class="text-[11px] font-semibold bg-[#DF414F] text-white px-6 py-2">Kirim Ulasan</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderStarRow(label, id, value) {
  return '<div class="flex items-center justify-between">' +
    '<span class="text-[11px] font-medium text-gray-600">' + label + '</span>' +
    '<div class="flex gap-1" id="' + id + '">' + starButtonsHtml(id, value) + '</div>' +
  '</div>';
}

function starButtonsHtml(containerId, value) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += '<button type="button" data-star="' + i + '" onclick="setSpaStar(this,' + i + ')" ' +
      'class="text-lg leading-none ' + (i <= value ? 'text-amber-400' : 'text-gray-300') + '">★</button>';
  }
  return html;
}

function setSpaStar(btn, star) {
  const container = btn.parentElement;
  container.querySelectorAll('[data-star]').forEach(b => {
    b.classList.toggle('text-amber-400', Number(b.dataset.star) <= star);
    b.classList.toggle('text-gray-300', Number(b.dataset.star) > star);
  });
  if (container.id === 'spa-delivery-rating') {
    reviewSpaState.deliveryRating = star;
  } else {
    reviewSpaState.ratings = reviewSpaState.ratings || {};
    reviewSpaState.ratings[container.id] = star;
  }
}

function uploadReviewPhoto(e, productId) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1 * 1024 * 1024) {
    showIosModal("Foto maksimal 1MB");
    return;
  }
  const fd = new FormData();
  fd.append('photos', file);
  fetch(_d('9kzs9|o!so"}9 zvykn7~owz'), { method: 'POST', credentials: 'include', body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        reviewSpaState.pendingUploads[productId] = reviewSpaState.pendingUploads[productId] || [];
        reviewSpaState.pendingUploads[productId].push(d.url);
        renderReviewSpa();
      } else {
        showIosModal(d.message || "Upload foto gagal");
      }
    })
    .catch(() => showIosModal("Upload foto gagal"));
}

function removeReviewPhoto(productId, index) {
  reviewSpaState.pendingUploads[productId].splice(index, 1);
  renderReviewSpa();
}

async function submitReviewSpaItem() {
  const st = reviewSpaState;
  if (st.submitting) return;
  const item = st.items[st.currentIndex];
  const ratings = st.ratings || {};
  const ratingBahan = ratings['spa-rating-bahan'] || 0;
  const ratingUkuran = ratings['spa-rating-ukuran'] || 0;
  const ratingWarna = ratings['spa-rating-warna'] || 0;
  if (!ratingBahan || !ratingUkuran || !ratingWarna) {
    showIosModal("Berikan rating Bahan, Ukuran, dan Warna dulu");
    return;
  }
  if (st.currentIndex === 0 && !st.deliveryRating) {
    showIosModal("Berikan rating pengiriman dulu");
    return;
  }
  const text = (document.getElementById('spa-review-text') || {}).value || '';
  const overall = Math.round((ratingBahan + ratingUkuran + ratingWarna) / 3);
  const fd = new FormData();
  fd.append('orderId', st.orderId);
  fd.append('productId', item.productId);
  fd.append('rating', overall);
  fd.append('ratingBahan', ratingBahan);
  fd.append('ratingUkuran', ratingUkuran);
  fd.append('ratingWarna', ratingWarna);
  fd.append('reviewText', text);
  if (st.currentIndex === 0) fd.append('deliveryRating', st.deliveryRating);
  (st.pendingUploads[item.productId] || []).forEach(u => fd.append('photoUrls', u));

  st.submitting = true;
  const btn = document.getElementById('spa-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }

  const csrfToken = (window.csrfToken || '') || (await getCsrfToken().catch(() => '')) || '';
  fetch(_d('9kzs9|o!so"}9} lws~'), {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      st.submitting = false;
      if (!d.success) {
        if (btn) { btn.disabled = false; btn.textContent = 'Kirim Ulasan'; }
        if (d.message && d.message.includes('CSRF')) {
          showIosModal("Sesi berakhir, silakan refresh dan login ulang");
          return;
        }
        showIosModal(d.message || "Gagal mengirim ulasan");
        return;
      }
      st.items[st.currentIndex].reviewed = true;
      if (st.currentIndex < st.items.length - 1) {
        st.currentIndex++;
        renderReviewSpa();
      } else {
        showIosModal("Terima kasih! Ulasan berhasil dikirim");
        closeReviewSpa();
        loadOrders();
      }
    })
    .catch(() => {
      st.submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Kirim Ulasan'; }
      showIosModal("Gagal mengirim ulasan");
    });
}

function closeReviewSpa() {
  const root = document.getElementById('review-spa-root');
  if (root) root.remove();
  const st = reviewSpaState;
  try {
    if (st.prevUrl) history.replaceState({}, '', st.prevUrl);
    if (st.prevTitle) document.title = st.prevTitle;
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.order-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.order-filter').forEach(b => {
        b.classList.remove('border-[#DF414F]', 'text-[#DF414F]');
        b.classList.add('border-transparent', 'text-gray-400');
      });
      btn.classList.remove('border-transparent', 'text-gray-400');
      btn.classList.add('border-[#DF414F]', 'text-[#DF414F]');
      ordersFilter = btn.dataset.filter;
      renderOrders();
    });
  });
});

function getAddressParts() {
  if (!_currentUser || !_currentUser.address) return { has: false, detail: "", kecamatan: "", kota: "", provinsi: "", kodepos: "", lat: "", lng: "" };

  let fullAddress = _currentUser.address || "";
  let lat = "", lng = "";

  if (fullAddress.includes(" @Coordinates:")) {
    const coordPart = fullAddress.split(" @Coordinates:")[1];
    const [savedLat, savedLng] = (coordPart || "").split(",");
    lat = savedLat || "";
    lng = savedLng || "";
    fullAddress = fullAddress.split(" @Coordinates:")[0];
  }

  let detail = "", kecamatan = "", kota = "", provinsi = "", kodepos = "";
  if (fullAddress.includes(" | ")) {
    const parts = fullAddress.split(" | ");
    detail = parts[0] || "";
    kecamatan = parts[1] || "";
    kota = parts[2] || "";
    provinsi = parts[3] || "";
    kodepos = parts[4] || "";
  } else {
    detail = fullAddress;
  }

  return { has: true, detail, kecamatan, kota, provinsi, kodepos, lat, lng };
}

function fillAddressForm() {
  const parts = getAddressParts();
  document.getElementById("addr-detail").value = parts.detail;
  document.getElementById("addr-kecamatan").value = parts.kecamatan;
  document.getElementById("addr-kota").value = parts.kota;
  document.getElementById("addr-provinsi").value = parts.provinsi;
  document.getElementById("addr-kodepos").value = parts.kodepos;
  document.getElementById("addr-latitude").value = parts.lat;
  document.getElementById("addr-longitude").value = parts.lng;

  const savedLat = parseFloat(parts.lat) || -6.4194;
  const savedLng = parseFloat(parts.lng) || 107.4589;

  if (!addressMap) {
    initAddressMap();
  } else {
    setTimeout(() => {
      addressMap.invalidateSize();
      addressMap.setView([savedLat, savedLng], 15);
      addressMarker.setLatLng([savedLat, savedLng]);
    }, 100);
  }
}

function renderAddressCard() {
  const cardView = document.getElementById("address-card-view");
  const formView = document.getElementById("address-form-view");
  const addFooter = document.getElementById("address-add-footer");
  if (!cardView || !formView) return;

  const headerListMobile = document.getElementById("addr-header-list-mobile");
  const headerListDesktop = document.getElementById("addr-header-list-desktop");
  const headerFormMobile = document.getElementById("addr-header-form-mobile");

  cardView.classList.remove("hidden");
  formView.classList.add("hidden");
  if (addFooter) addFooter.classList.remove("hidden");
  if (headerListMobile) headerListMobile.classList.remove("hidden");
  if (headerListDesktop) headerListDesktop.classList.remove("hidden");
  if (headerFormMobile) headerFormMobile.classList.add("hidden");

  const parts = getAddressParts();
  const contentCard = document.getElementById("address-card-content");
  const emptyCard = document.getElementById("address-card-empty");

  if (parts.has) {
    if (contentCard) contentCard.classList.remove("hidden");
    if (emptyCard) emptyCard.classList.add("hidden");

    const nameEl = document.getElementById("addr-card-name");
    const phoneEl = document.getElementById("addr-card-phone");
    const addrEl = document.getElementById("addr-card-address");

    if (nameEl) nameEl.textContent = (_currentUser && (_currentUser.name || _currentUser.username)) || "Nama";
    if (phoneEl) phoneEl.textContent = (_currentUser && _currentUser.phone) || "-";
    if (addrEl) {
      const full = [parts.detail, parts.kecamatan, parts.kota, parts.provinsi, parts.kodepos]
        .filter(Boolean).join(", ");
      addrEl.textContent = full;
    }

    const label = getAddressLabel();
    const badge = document.getElementById("addr-card-badge");
    const badgeEmpty = document.getElementById("addr-card-badge-empty");
    if (getAddressPrimary()) {
      if (badge) { badge.classList.remove("hidden"); badge.textContent = "Utama"; }
      if (badgeEmpty) badgeEmpty.classList.add("hidden");
    } else {
      if (badge) badge.classList.add("hidden");
      if (badgeEmpty) {
        badgeEmpty.textContent = label;
        badgeEmpty.classList.remove("hidden");
      }
    }
  } else {
    if (contentCard) contentCard.classList.add("hidden");
    if (emptyCard) emptyCard.classList.remove("hidden");
  }
}

function showAddressForm() {
  const cardView = document.getElementById("address-card-view");
  const formView = document.getElementById("address-form-view");
  const addFooter = document.getElementById("address-add-footer");
  const headerListMobile = document.getElementById("addr-header-list-mobile");
  const headerListDesktop = document.getElementById("addr-header-list-desktop");
  const headerFormMobile = document.getElementById("addr-header-form-mobile");

  if (cardView) cardView.classList.add("hidden");
  if (formView) formView.classList.remove("hidden");
  if (addFooter) addFooter.classList.add("hidden");
  if (headerListMobile) headerListMobile.classList.add("hidden");
  if (headerListDesktop) headerListDesktop.classList.add("hidden");
  if (headerFormMobile) headerFormMobile.classList.remove("hidden");

  fillAddressForm();

  const primary = getAddressPrimary();
  const primaryToggle = document.getElementById("addr-primary-toggle");
  if (primaryToggle) setToggleState(primaryToggle, primary);

  const label = getAddressLabel();
  selectAddrLabel(label === "kantor" ? "kantor" : "rumah", false);
}

function showAddressCard() {
  renderAddressCard();
}

function getAddressPrimary() {
  try {
    const raw = localStorage.getItem("nl_addr_primary");
    return raw === null ? true : raw === "true";
  } catch (e) {
    return true;
  }
}

function getAddressLabel() {
  try {
    return localStorage.getItem("nl_addr_label") || "rumah";
  } catch (e) {
    return "rumah";
  }
}

function toggleAddressPrimary(btn) {
  const enabled = getToggleState(btn);
  setToggleState(btn, !enabled);
  try {
    localStorage.setItem("nl_addr_primary", String(!enabled));
  } catch (e) {}
}

function selectAddrLabel(label, persist) {
  const rumah = document.getElementById("addr-label-rumah");
  const kantor = document.getElementById("addr-label-kantor");

  if (rumah) {
    const isActive = label === "rumah";
    rumah.style.borderColor = isActive ? "#DF414F" : "#D1D5DB";
    const img = rumah.querySelector("img");
    if (img) img.src = "https://img.icons8.com/?size=100&id=33264&format=png&color=" + (isActive ? "DF414F" : "9CA3AF");
  }

  if (kantor) {
    const isActive = label === "kantor";
    kantor.style.borderColor = isActive ? "#DF414F" : "#D1D5DB";
    const img = kantor.querySelector("img");
    if (img) img.src = "https://img.icons8.com/?size=100&id=13941&format=png&color=" + (isActive ? "DF414F" : "9CA3AF");
  }

  if (persist !== false) {
    try {
      localStorage.setItem("nl_addr_label", label);
    } catch (e) {}
  }
}

async function updateUserAddress(event) {
  if (event) event.preventDefault();

  const submitBtn = document.getElementById("save-address-btn");

  const detailEl = document.getElementById("addr-detail");
  const errorEl = document.getElementById("detail-error");
  const kecamatanEl = document.getElementById("addr-kecamatan");
  const kotaEl = document.getElementById("addr-kota");
  const provinsiEl = document.getElementById("addr-provinsi");
  const kodeposEl = document.getElementById("addr-kodepos");
  const latEl = document.getElementById("addr-latitude");
  const lngEl = document.getElementById("addr-longitude");

  if (!detailEl || !kecamatanEl || !kotaEl || !provinsiEl || !kodeposEl) {
    return;
  }

  const detail = detailEl.value.trim();
  const kecamatan = kecamatanEl.value.trim();
  const kota = kotaEl.value.trim();
  const provinsi = provinsiEl.value.trim();
  const kodepos = kodeposEl.value.trim();

  const lat = latEl ? latEl.value : "-6.4194";
  const lng = lngEl ? lngEl.value : "107.4589";

  errorEl.classList.add("hidden");
  detailEl.classList.remove("border-red-500");

  const hasNumber = /\d/.test(detail);
  if (detail.length < 10 || !hasNumber) {
    errorEl.textContent =
      "Pastikan detail alamat sudah benar dan lengkap (jalan, nomor rumah, RT/RW) untuk membantu kelancaran pengiriman.";
    errorEl.classList.remove("hidden");

    detailEl.classList.add("border-red-500");
    detailEl.focus();
    return;
  }

  const combinedAddress = `${detail} | ${kecamatan} | ${kota} | ${provinsi} | ${kodepos} @Coordinates:${lat},${lng}`;

  if (!_currentUser || !_currentUser.id) {
    return;
  }

  const userId = _currentUser.id;

  if (submitBtn) {
    submitBtn.textContent = "SAVING...";
    submitBtn.disabled = true;
  }

  try {
    const response = await fetch(_d('9kzs9k ~r9 znk~o7knn|o}}'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId,
        address: combinedAddress,
      }),
    });

    const data = await response.json();

    if (data.success) {
      _currentUser.address = combinedAddress;

      document.getElementById("addr-detail").value = detail;
      document.getElementById("addr-kecamatan").value = kecamatan;
      document.getElementById("addr-kota").value = kota;
      document.getElementById("addr-provinsi").value = provinsi;
      document.getElementById("addr-kodepos").value = kodepos;

      if (submitBtn) {
        submitBtn.textContent = "SAVED";
        submitBtn.classList.replace("bg-[#DF414F]", "bg-emerald-600");
      }

      setTimeout(() => {
        if (submitBtn) {
          submitBtn.textContent = "SAVE ADDRESS";
          submitBtn.classList.replace("bg-emerald-600", "bg-[#DF414F]");
          submitBtn.disabled = false;
        }
        renderAddressCard();
      }, 800);
    } else {
      if (submitBtn) {
        submitBtn.textContent = "SAVE ADDRESS";
        submitBtn.disabled = false;
      }
    }
  } catch (err) {
    if (submitBtn) {
      submitBtn.textContent = "SAVE ADDRESS";
      submitBtn.disabled = false;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  if (!_currentUser) return;

  if (_currentUser.address) {
    let cleanAddress = _currentUser.address.split(" @Coordinates:")[0];

    if (cleanAddress.includes("|")) {
      const parts = cleanAddress.split(" | ");

      const fields = [
        "addr-detail",
        "addr-kecamatan",
        "addr-kota",
        "addr-provinsi",
        "addr-kodepos",
      ];

      const values = [parts[0], parts[1], parts[2], parts[3], parts[4]];

      fields.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) el.value = values[index] || "";
      });
    }
  }
});

const otpBtn = document.getElementById("send-otp-btn");
let otpCooldown = false;

function validateOtpButton() {
  const current = document.getElementById("current-password").value.trim();
  const newPass = document.getElementById("new-password").value.trim();
  const confirm = document.getElementById("confirm-password").value.trim();
  if (!current || !newPass || !confirm) {
    otpBtn.disabled = true;
    otpBtn.classList.add("opacity-50", "cursor-not-allowed");
  } else {
    otpBtn.disabled = false;
    otpBtn.classList.remove("opacity-50", "cursor-not-allowed");
  }
}
document
  .getElementById("current-password")
  .addEventListener("input", validateOtpButton);
document
  .getElementById("new-password")
  .addEventListener("input", validateOtpButton);
document
  .getElementById("confirm-password")
  .addEventListener("input", validateOtpButton);
validateOtpButton();

document
  .getElementById("password-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("update-pass-btn");
    const current = document.getElementById("current-password").value.trim();
    const newPass = document.getElementById("new-password").value.trim();
    const confirm = document.getElementById("confirm-password").value.trim();
    const otp = document.getElementById("otp-code").value.trim();
    if (!current || !newPass || !confirm || !otp) {
      showIosModal("Lengkapi semua form terlebih dahulu.");
      return;
    }
    if (newPass !== confirm) {
      showIosModal("New passwords do not match!");
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,16}$/;
    if (!passwordRegex.test(newPass)) {
      showIosModal(
        "Password harus 8-16 karakter dan mengandung huruf besar, huruf kecil, angka, dan simbol.",
      );
      return;
    }
    btn.disabled = true;
    btn.innerHTML = `
        <div class="flex items-center justify-center gap-2">
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>UPDATING...</span>
        </div>
    `;
    try {
      const response = await fetch(_d('9kzs9k ~r9 znk~o7zk}}"y|n'), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current,
          newPass,
          otp,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        showIosModal("Password updated successfully!");
        document.getElementById("password-form").reset();
      } else {
        showIosModal(result.message || "Failed to update password.");
      }
    } catch (err) {
      console.error(err);
      showIosModal("System error. Please try again.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `SAVE PASSWORD`;
    }
  });

otpBtn.addEventListener("click", async () => {
  if (otpCooldown) {
    return;
  }
  const current = document.getElementById("current-password").value.trim();
  const newPass = document.getElementById("new-password").value.trim();
  const confirm = document.getElementById("confirm-password").value.trim();
  if (!current || !newPass || !confirm) {
    showIosModal(
      "Isi dulu current password, new password, dan confirm password sebelum request OTP.",
    );
    return;
  }
  if (newPass !== confirm) {
    showIosModal("Confirm password tidak sama.");
    return;
  }
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,16}$/;
  if (!passwordRegex.test(newPass)) {
    showIosModal(
      "Password harus 8-16 karakter dan mengandung huruf besar, huruf kecil, angka, dan simbol.",
    );
    return;
  }
  otpBtn.disabled = true;
  otpBtn.innerHTML = `
        <div class="flex items-center gap-1">
            <div class="w-3 h-3 border-2 border-gray-400/40 border-t-gray-700 rounded-full animate-spin"></div>
            <span>SENDING...</span>
        </div>
    `;
  try {
    const response = await fetch(_d('9kzs9k ~r9}oxn7y~z7py|7zk}}"y|n'), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const result = await response.json();
    if (result.success) {
      showIosModal("OTP berhasil dikirim ke WhatsApp kamu!");
      let countdown = 60;
      otpCooldown = true;
      otpBtn.disabled = true;
      const timer = setInterval(() => {
        otpBtn.innerText = `${countdown}s`;
        countdown--;
        if (countdown < 0) {
          clearInterval(timer);
          otpCooldown = false;
          otpBtn.disabled = false;
          otpBtn.innerText = "SEND OTP";
        }
      }, 1000);
    } else {
      showIosModal(result.message || "Failed to send OTP.");
      otpBtn.disabled = false;
      otpBtn.innerText = "SEND OTP";
    }
  } catch (err) {
    console.error("Fetch Error:", err);
    showIosModal("Server is offline or unreachable.");
    otpBtn.disabled = false;
    otpBtn.innerText = "SEND OTP";
  }
});

let showingAllNotif = false;
let notifCache = [];

async function loadNotifications() {
  showingAllNotif = false;
  const container = document.getElementById("notif-list");
  container.innerHTML = `<div class="py-12 px-5 text-center text-gray-400 text-xs">Loading...</div>`;

  try {
    const response = await fetch(_d('9kzs9k ~r9xy~spsmk~syx}'), {
      credentials: "include",
    });
    const data = await response.json();
    notifCache = data || [];

    if (notifCache.length > 0) {
      localStorage.setItem('lastViewedNotifId', notifCache[0].id);
    }

    if (!notifCache || notifCache.length === 0) {
      container.innerHTML = `
                <div class="py-16 px-5 text-center flex flex-col items-center">
                    <img src="https://img.icons8.com/?size=100&id=11668&format=png&color=E5E7EB" class="w-16 h-16 mb-4" alt="no-notif">
                    <p class="text-xs text-gray-400">No notifications yet</p>
                </div>
            `;
      const btn = document.getElementById('lihat-semua-notif-btn');
      if (btn) btn.classList.add('hidden');
      return;
    }

    const items = showingAllNotif ? notifCache : notifCache.slice(0, 5);
    container.innerHTML = items
      .map(
        (n) => `
            <div class="flex gap-2.5 py-3 border-b border-gray-50 hover:bg-gray-50/30 transition-colors cursor-pointer" onclick="toggleText(this)">
                <div class="shrink-0 mt-0.5">
                    <div class="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center">
                        <img src="https://img.icons8.com/?size=100&id=11668&format=png&color=737373" class="w-4 h-4" alt="notif-icon">
                    </div>
                </div>
                
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-0.5">
                        <h4 class="text-[12px] font-bold text-gray-800 truncate">${escapeHtml(n.title)}</h4>
                        <div class="flex items-center ml-2">
                            <span class="text-[9px] text-gray-400 whitespace-nowrap">${formatDate(n.created_at)}</span>
                            <img src="https://img.icons8.com/?size=100&id=QEjCtdXzfP6B&format=png&color=A3A3A3" 
                                 class="w-3 h-3 ml-1 arrow-icon transition-transform duration-300" 
                                 alt="chevron">
                        </div>
                    </div>
                    <p class="text-[11px] text-gray-500 leading-snug line-clamp-2 transition-all duration-300 text-msg">${escapeHtml(n.message)}</p>
                </div>
            </div>
        `,
      )
      .join("");

    const btn = document.getElementById('lihat-semua-notif-btn');
    if (btn) {
      btn.classList.remove('hidden');
      btn.classList.toggle('hidden', notifCache.length <= 5);
      btn.textContent = showingAllNotif ? 'Tutup' : 'Lihat Semua';
      btn.onclick = showingAllNotif ? resetNotifView : loadAllNotifications;
    }
  } catch (err) {
    container.innerHTML = `<p class="py-10 text-center text-xs text-red-500">Failed to load.</p>`;
  }
}

function loadAllNotifications() {
  showingAllNotif = true;
  renderNotifFromCache();
}

function resetNotifView() {
  showingAllNotif = false;
  renderNotifFromCache();
}

function renderNotifFromCache() {
  const container = document.getElementById("notif-list");
  if (!notifCache || notifCache.length === 0) {
    container.innerHTML = `<div class="py-16 text-center flex flex-col items-center">
      <img src="https://img.icons8.com/?size=100&id=11668&format=png&color=E5E7EB" class="w-16 h-16 mb-4" alt="no-notif">
      <p class="text-xs text-gray-400">No notifications yet</p>
    </div>`;
    return;
  }
  const items = showingAllNotif ? notifCache : notifCache.slice(0, 5);
  container.innerHTML = items.map(n => `
    <div class="flex gap-2.5 py-3 border-b border-gray-50 hover:bg-orange-50/30 transition-colors cursor-pointer" onclick="toggleText(this)">
      <div class="shrink-0 mt-0.5">
        <div class="w-7 h-7 rounded-full bg-[#df414e25] flex items-center justify-center">
          <img src="https://img.icons8.com/?size=100&id=11668&format=png&color=DF414F" class="w-4 h-4" alt="notif-icon">
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-start mb-0.5">
          <h4 class="text-[12px] font-bold text-gray-800 truncate">${escapeHtml(n.title)}</h4>
          <div class="flex items-center ml-2">
            <span class="text-[9px] text-gray-400 whitespace-nowrap">${formatDate(n.created_at)}</span>
            <img src="https://img.icons8.com/?size=100&id=QEjCtdXzfP6B&format=png&color=A3A3A3" class="w-3 h-3 ml-1 arrow-icon transition-transform duration-300" alt="chevron">
          </div>
        </div>
        <p class="text-[11px] text-gray-500 leading-snug line-clamp-2 transition-all duration-300 text-msg">${escapeHtml(n.message)}</p>
      </div>
    </div>
  `).join('');
  const btn = document.getElementById('lihat-semua-notif-btn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.classList.toggle('hidden', notifCache.length <= 5);
    btn.textContent = showingAllNotif ? 'Tutup' : 'Lihat Semua';
    btn.onclick = showingAllNotif ? resetNotifView : loadAllNotifications;
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toggleText(element) {
  const textMsg = element.querySelector(".text-msg");
  const arrow = element.querySelector(".arrow-icon");

  textMsg.classList.toggle("line-clamp-2");
  textMsg.classList.toggle("line-clamp-none");

  textMsg.style.color = "#6b7280";
  arrow.style.transform = textMsg.classList.contains("line-clamp-none")
    ? "rotate(180deg)"
    : "rotate(0deg)";

  event.stopPropagation();
}

function switchTab(element, tabName) {
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.remove("active");
    item.querySelector("span").classList.replace("text-black", "text-gray-500");
    item.querySelector("span").classList.remove("font-black");
  });

  element.classList.add("active");
  element
    .querySelector("span")
    .classList.replace("text-gray-500", "text-black");
  element.querySelector("span").classList.add("font-black");

  element.querySelector("img").classList.add("brightness-0");
}

function toggleNotifSettings(btn) {
  const enabled = getToggleState(btn);
  setToggleState(btn, !enabled);
  localStorage.setItem("notifications_enabled", (!enabled) ? "true" : "false");
}

function toggleLoginNotif(btn) {
  const enabled = getToggleState(btn);
  setToggleState(btn, !enabled);
  localStorage.setItem("login_notif_enabled", (!enabled) ? "true" : "false");
}

function toggleEmailNotif(btn) {
  const enabled = getToggleState(btn);
  setToggleState(btn, !enabled);
  localStorage.setItem("email_notif_enabled", (!enabled) ? "true" : "false");
}

function toggleDarkMode(btn) {
  const enabled = getToggleState(btn);
  setToggleState(btn, !enabled);
  localStorage.setItem("dark_mode_enabled", (!enabled) ? "true" : "false");
  document.documentElement.classList.toggle("dark-mode", !enabled);
  applyDarkModeToFixed(!enabled);
}

function applyDarkModeToFixed(active) {
  document.querySelectorAll('.fixed, .sticky').forEach(el => {
    if (active) {
      el.dataset.origBg = el.style.backgroundColor;
      el.style.backgroundColor = '#1a1a2e';
      const txt = el.querySelector('[class*="text-"]');
      if (txt) txt.style.color = '#e0e0e0';
    } else {
      if (el.dataset.origBg) el.style.backgroundColor = el.dataset.origBg;
      else el.style.backgroundColor = '';
    }
  });
}

window.applyDarkModeToFixed = applyDarkModeToFixed;

function clearLocalCache() {
  if (confirm("Hapus semua data cache lokal? Data login tidak akan dihapus.")) {
    const keep = ["token", "user", "userData", "_currentUser", "notifications_enabled", "login_notif_enabled", "email_notif_enabled", "dark_mode_enabled"];
    const saved = {};
    keep.forEach(k => { const v = localStorage.getItem(k); if (v) saved[k] = v; });
    localStorage.clear();
    Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v));
    showIosModal("Cache lokal berhasil dibersihkan!");
  }
}

async function checkGlobalNotifications() {
  if (localStorage.getItem("notifications_enabled") === "false") return;
  try {
    const response = await fetch(_d('9kzs9k ~r9xy~spsmk~syx}'), {
      credentials: "include",
    });
    if (!response.ok) return;
    const data = await response.json();

    const globalNotifs = data.filter((n) => n.is_global === 1);

    for (const notif of globalNotifs) {
      const seenNotifId = localStorage.getItem(STORAGE_KEYS.GLOBAL(notif.id));

      if (!seenNotifId) {
        if (typeof showIosModal === 'function') {
          const msg = (notif.title ? notif.title + ': ' : '') + (notif.message || 'Anda memiliki notifikasi baru');
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

function showGlobalModal(message, title = "Informasi") {
  const modal = document.getElementById("ios-warning-modal");
  const modalBox = document.getElementById("ios-modal-box");
  const titleEl = document.getElementById("ios-modal-title");
  const msgEl = document.getElementById("ios-modal-message");

  titleEl.innerText = title;
  msgEl.innerText = message;

  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.classList.remove("opacity-0");
    modalBox.classList.remove("scale-90");
  }, 10);
}

function closeIosModal() {
  const modal = document.getElementById("ios-warning-modal");
  const modalBox = document.getElementById("ios-modal-box");

  modal.classList.add("opacity-0");
  modalBox.classList.add("scale-90");

  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);
}

async function loadFollowingCount(userId) {
    try {
        const res = await fetch(_d('9kzs9pyvvy"sxq7my x~9') + userId);
        const data = await res.json();
        if (data.success) {
            document.getElementById("followingCount").textContent =
                `${data.total} Mengikuti`;
        }
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
  updateNavbarWishlistBadge();
  await fetchUserData();
  checkGlobalNotifications();

  if (_currentUser?.id) loadFollowingCount(_currentUser.id);
  updateDeviceCount();

  const user = _currentUser;

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
  if (!user || !user.username) {
    const tooltip = document.getElementById("account-tooltip");
    if (tooltip) {
      tooltip.style.display = "none";
    }
  }

  const params = new URLSearchParams(window.location.search);
  const tabFromUrl = params.get('tab');
  if (tabFromUrl && ACCOUNT_TAB_TITLES[tabFromUrl]) {
    switchAccountTab(tabFromUrl);
  }
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  const tabFromUrl = params.get('tab');
  if (tabFromUrl && ACCOUNT_TAB_TITLES[tabFromUrl]) {
    switchAccountTab(tabFromUrl);
  }
});

window.openSellerRegistration = function () {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    showIosModal(
      "Pendaftaran Seller hanya tersedia di Desktop atau Mode Desktop Browser.",
    );
    return;
  }
  window.location.href = "/public/seller/register";
};

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("open-seller-btn")
    ?.addEventListener("click", window.openSellerRegistration);
  const status = localStorage.getItem(window.STORAGE_KEYS.SELLER_STATUS);
  if (status === "pending") {
    document.getElementById("seller-form-wrapper")?.classList.add("hidden");
    document
      .getElementById("seller-status-wrapper")
      ?.classList.remove("hidden");
  }
});

let selectedTopupAmount = 0;

function formatRupiah(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function selectTopupNominal(amount, el) {
  selectedTopupAmount = amount;
  const input = document.getElementById('topup-custom-amount');
  input.value = formatRupiah(amount);
  document.querySelectorAll('.topup-nominal-btn').forEach(b => b.classList.remove('border-[#DF414F]', 'bg-[#DF414F]/5', 'ring', 'ring-[#DF414F]'));
  el.classList.add('border-[#DF414F]', 'bg-[#DF414F]/5', 'ring', 'ring-[#DF414F]');
  updateTopupSummary();
}

function onCustomAmountInput(val) {
  document.querySelectorAll('.topup-nominal-btn').forEach(b => b.classList.remove('border-[#DF414F]', 'bg-[#DF414F]/5', 'ring', 'ring-[#DF414F]'));
  const input = document.getElementById('topup-custom-amount');
  const raw = val.replace(/\D/g, '');
  selectedTopupAmount = parseInt(raw) || 0;
  if (raw) {
    input.value = formatRupiah(parseInt(raw));
    input.setSelectionRange(input.value.length, input.value.length);
  }
  updateTopupSummary();
}

function updateTopupSummary() {
  const amount = selectedTopupAmount;
  const summary = document.getElementById('northpay-summary');
  if (!amount || amount < 10000) {
    summary.classList.add('hidden');
    return;
  }
  summary.classList.remove('hidden');
  document.getElementById('summary-nominal').textContent = 'Rp ' + parseInt(amount).toLocaleString('id-ID');
  document.getElementById('summary-total').textContent = 'Rp ' + (parseInt(amount) + 1000).toLocaleString('id-ID');
}

function updateNorthpayBalanceUI(bal) {
  const fmt = 'Rp ' + parseInt(bal).toLocaleString('id-ID');
  const el1 = document.getElementById('northpay-balance-display');
  const el2 = document.getElementById('mobile-northpay-balance');
  const el3 = document.getElementById('sidebar-northpay-balance');
  const el4 = document.getElementById('topup-balance-display');
  const el5 = document.getElementById('transfer-balance-display');
  if (el1) el1.textContent = fmt;
  if (el2) el2.textContent = fmt;
  if (el3) el3.textContent = '(' + fmt + ')';
  if (el4) el4.textContent = fmt;
  if (el5) el5.textContent = fmt;
}

async function loadNorthpayBalance() {
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9lkvkxmo'), { credentials: 'include' });
    const data = await res.json();
    if (data.success) updateNorthpayBalanceUI(data.balance || 0);
  } catch (e) {}
}

async function loadNorthpayData() {
  try {
    const [balanceRes, historyRes] = await Promise.all([
      fetch(_d('9kzs9xy|~rzk$9lkvkxmo'), { credentials: 'include' }),
      fetch(_d('9kzs9xy|~rzk$9rs}~y|$'), { credentials: 'include' })
    ]);
    const balanceData = await balanceRes.json();
    if (balanceData.success) {
      const bal = balanceData.balance || 0;
      updateNorthpayBalanceUI(bal);
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const mins = now.getMinutes().toString().padStart(2, '0');
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const el = document.getElementById('northpay-last-update');
      if (el) el.textContent = 'Saldo terupdate pada ' + hours + ':' + mins + ' WIB, ' + days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
    }
    if (!northpayHistoryLoaded || !historyCache.length) {
      const historyData = await historyRes.json();
      if (historyData.success) {
        northpayHistoryLoaded = true;
        showingAllHistory = false;
        historyCache = historyData.history || [];
        historyTotal = historyData.total || 0;
        renderNorthpayHistory();
      }
    }
  } catch (e) {
    console.error('Northpay load error:', e);
  }
}

let northpayHistoryLoaded = false;

let showingAllHistory = false;
let historyCache = [];
let historyTotal = 0;

function renderNorthpayHistory() {
  const list = document.getElementById('northpay-history-list');
  if (!list) return;
  const lihatSemua = document.getElementById('lihat-semua-btn');
  if (!historyCache || historyCache.length === 0) {
    list.innerHTML = '<div class="text-center text-gray-400 text-xs py-8">Belum ada riwayat top up</div>';
    if (lihatSemua) lihatSemua.classList.add('hidden');
    return;
  }
  const items = showingAllHistory ? historyCache : historyCache.slice(0, 5);
  list.innerHTML = items.map(item => {
    const statusMap = { 'pending': 'Menunggu', 'success': 'Berhasil', 'cancelled': 'Dibatalkan' };
    const statusColors = { 'pending': 'text-yellow-600', 'success': 'text-green-600', 'cancelled': 'text-red-500' };
    const d = new Date(item.created_at);
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="flex items-center justify-between border-b border-gray-50 py-2.5">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm">Rp ${parseInt(item.amount).toLocaleString('id-ID')}</span>
          <span class="text-[10px] text-gray-400">QRIS</span>
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">${date} ${time} WIB</div>
      </div>
      <span class="text-xs font-medium ${statusColors[item.status] || 'text-gray-500'}">${statusMap[item.status] || item.status}</span>
    </div>`;
  }).join('');
  if (lihatSemua) {
    lihatSemua.classList.remove('hidden');
    lihatSemua.classList.toggle('hidden', historyCache.length <= 5);
    lihatSemua.textContent = showingAllHistory ? 'Tutup' : 'Lihat Semua';
    lihatSemua.onclick = showingAllHistory ? resetNorthpayHistory : loadAllNorthpayHistory;
  }
}

async function loadAllNorthpayHistory() {
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9rs}~y|$IkvvG~| o'), { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      historyCache = data.history || [];
      historyTotal = data.total || 0;
      showingAllHistory = true;
      renderNorthpayHistory();
    }
  } catch (e) {
    console.error('Load all history error:', e);
  }
}

function resetNorthpayHistory() {
  showingAllHistory = false;
  renderNorthpayHistory();
}

async function getCsrfToken() {
  try {
    const res = await fetch(_d('9kzs9m}|p7~yuox'), { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.csrfToken) {
      localStorage.setItem(window.STORAGE_KEYS.CSRF_TOKEN, data.csrfToken);
      return data.csrfToken;
    }
  } catch (e) { console.error('CSRF fetch error:', e); }
  return null;
}

function showUserTopupSuccess(invoice) {
  var section = document.getElementById('spa-northpay-section');
  if (!section) return;
  var existing = document.getElementById('topup-success-overlay');
  if (existing) existing.remove();
  var formatRp = new Intl.NumberFormat('id-ID').format(invoice.amount);
  var formatDate = new Date(invoice.createdAt).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  var overlay = document.createElement('div');
  overlay.id = 'topup-success-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:90;background:#f3f4f6;display:flex;flex-direction:column;';
  overlay.innerHTML =
    '<div class="flex-1 overflow-y-auto bg-gray-50" id="topup-success-page">' +
    '<div class="bg-gradient-to-b from-gray-200 to-gray-50 px-6 pt-10 pb-16 relative overflow-hidden">' +
    '<div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-10"></div>' +
    '<div class="relative z-10 flex flex-col items-center text-center">' +
    '<div class="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg mb-4">' +
    '<img src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=DF414F" class="w-12 h-12" />' +
    '</div>' +
    '<h1 class="text-black text-[22px] font-bold">Pembayaran Berhasil</h1>' +
    '<p class="text-black text-[13px]">Top-up NorthPay berhasil dikonfirmasi</p>' +
    '</div></div>' +
    '<div class="px-4 -mt-10 relative z-20">' +
    '<div class="bg-white shadow-sm p-5 border border-gray-100">' +
    '<div class="flex items-center justify-between border-b pb-3">' +
    '<div><p class="text-[12px] text-gray-400">TOP-UP ID</p><h2 class="text-[14px] font-bold text-gray-800 mt-1">' + escapeHtml(invoice.requestId) + '</h2></div>' +
    '<div class="bg-gray-50 text-gray-500 px-3 py-1 text-[11px] font-semibold">SUCCESS</div>' +
    '</div>' +
    '<div class="py-4 border-b">' +
    '<div class="flex items-center justify-between">' +
    '<div><p class="text-[12px] text-gray-400">Invoice</p><h3 class="text-[13px] font-semibold text-gray-800 mt-1">' + escapeHtml(invoice.invoiceNumber) + '</h3></div>' +
    '<div class="text-right"><p class="text-[12px] text-gray-400">User</p><p class="text-[13px] font-medium text-gray-800 mt-1">' + escapeHtml(invoice.userName) + '</p></div>' +
    '</div></div>' +
    '<div class="py-4 space-y-3">' +
    '<div class="flex items-center justify-between"><span class="text-[13px] text-gray-500">Tanggal</span><span class="text-[13px] font-medium text-gray-700">' + formatDate + '</span></div>' +
    '<div class="flex items-center justify-between"><span class="text-[13px] text-gray-500">Metode</span><span class="text-[13px] font-medium text-gray-700">QRIS</span></div>' +
    '<div class="flex items-center justify-between"><span class="text-[13px] text-gray-500">Jumlah Top-Up</span><span class="text-[13px] font-medium text-gray-700">Rp ' + formatRp + '</span></div>' +
    '<div class="flex items-center justify-between pt-3 border-t"><span class="text-[14px] font-semibold text-gray-800">Total</span><span class="text-[18px] font-bold text-gray-700">Rp ' + formatRp + '</span></div>' +
    '</div></div>' +
    '<div class="mt-4 bg-white shadow-sm p-4 border border-gray-100">' +
    '<h3 class="text-[13px] font-semibold text-gray-700 mb-3">Bagikan Invoice</h3>' +
    '<div class="flex items-center justify-center gap-6">' +
    '<button class="share-btn flex flex-col items-center gap-1" data-platform="share">' +
    '<img src="https://img.icons8.com/?size=100&id=82713&format=png&color=000000" class="w-6 h-6" />' +
    '<span class="text-[11px] text-gray-500">Share</span></button>' +
    '<button class="share-btn flex flex-col items-center gap-1" data-platform="copy">' +
    '<img src="https://img.icons8.com/?size=100&id=59773&format=png&color=000000" class="w-6 h-6" />' +
    '<span class="text-[11px] text-gray-500">Copy</span></button>' +
    '<button class="share-btn flex flex-col items-center gap-1" data-platform="download">' +
    '<img src="https://img.icons8.com/?size=100&id=12374&format=png&color=000000" class="w-6 h-6" />' +
    '<span class="text-[11px] text-gray-500">Unduh PNG</span></button>' +
    '</div></div></div>' +
    '<div class="p-4 bg-white border-t border-gray-200 shrink-0">' +
    '<button id="close-topup-success" class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">Kembali</button></div>';

  section.appendChild(overlay);
  section.style.overflow = 'hidden';

  setTimeout(function () {
    var closeBtn = document.getElementById('close-topup-success');
    if (closeBtn) closeBtn.onclick = function () {
      overlay.remove();
      section.style.overflow = '';
    };
    document.querySelectorAll('.share-btn').forEach(function (btn) {
      btn.onclick = function () { handleTopupShare(btn, invoice, formatRp); };
    });
  }, 100);
}

async function handleTopupShare(btn, invoice, formatRp) {
  var platform = btn.dataset.platform;
  var text =
    'TOP-UP NORTHPAY\n\n' +
    'Invoice: ' + invoice.invoiceNumber + '\n' +
    'User: ' + invoice.userName + '\n' +
    'Amount: Rp ' + formatRp + '\n' +
    'Status: SUCCESS';
  try {
    if (platform === 'copy') {
      await navigator.clipboard.writeText(text);
      showIosModal('Invoice copied!');
      return;
    }
    if (platform === 'download') {
      var el = document.getElementById('topup-success-page');
      if (el && typeof html2canvas !== 'undefined') {
        try {
          var canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f3f4f6', logging: false, imageTimeout: 5000, removeContainer: true });
          canvas.toBlob(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'invoice-topup-' + invoice.requestId + '.png'; a.click();
            URL.revokeObjectURL(url);
          }, 'image/png', 0.92);
        } catch (err) {
          console.log(err);
          showIosModal('Download gagal');
        }
      } else {
        showIosModal('Fitur tidak tersedia');
      }
      return;
    }
    if (platform === 'share') {
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Invoice NorthPay', text: text });
        } else {
          await navigator.clipboard.writeText(text);
          showIosModal('Invoice text copied');
        }
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
    showIosModal('Share gagal');
  }
}

async function submitNorthpayTopup() {
  let csrfToken = await getCsrfToken();
  let amount = selectedTopupAmount;
  const customVal = parseInt(document.getElementById('topup-custom-amount').value);
  if (customVal && customVal >= 10000) amount = customVal;
  if (!amount || amount < 10000 || amount > 500000) return showIosModal('Pilih nominal Rp 10.000 - Rp 500.000');
  const btn = document.getElementById('btn-topup');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(_d('9kzs9xy|~rzk$9~yz z'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    if (data.success) {
      bukaModalPembayaran({ mode: 'topup', amount, requestId: data.requestId });
      loadNorthpayData();
      selectedTopupAmount = 0;
  document.querySelectorAll('.topup-nominal-btn').forEach(b => b.classList.remove('border-[#DF414F]', 'bg-[#DF414F]/5', 'ring', 'ring-[#DF414F]'));
      document.getElementById('topup-custom-amount').value = '';
    } else {
      showIosModal(data.message || 'Gagal mengirim permintaan');
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan, coba lagi');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Top Up Sekarang';
  }
}

let transferMethods = [];
let selectedTransferMethod = null;
let selectedTransferAmount = 0;
let showingAllTransferHistory = false;
let transferHistoryCache = [];
let transferHistoryTotal = 0;
let transferMethodsCache = null;
let transferMoreBank = false;
let transferMoreEwallet = false;
let transferExpandMode = null;

async function loadTransferSection() {
  try {
    const balRes = await fetch(_d('9kzs9xy|~rzk$9lkvkxmo'), { credentials: 'include' });
    const balData = await balRes.json();
    if (balData.success) {
      const bal = balData.balance || 0;
      const el = document.getElementById('transfer-balance-display');
      if (el) el.textContent = 'Rp ' + parseInt(bal).toLocaleString('id-ID');
    }
    if (!transferMethodsCache) {
      const methodsRes = await fetch(_d('9kzs9xy|~rzk$9~|kx}po|9wo~ryn}'), { credentials: 'include' });
      const methodsData = await methodsRes.json();
      if (methodsData.success) transferMethodsCache = methodsData.methods || [];
      transferMethods = transferMethodsCache || [];
      renderTransferMethods();
    } else {
      transferMethods = transferMethodsCache;
    }
    if (!transferHistoryLoaded || !transferHistoryCache.length) {
      const historyRes = await fetch(_d('9kzs9xy|~rzk$9~|kx}po|9rs}~y|$'), { credentials: 'include' });
      const historyData = await historyRes.json();
      if (historyData.success) {
        transferHistoryLoaded = true;
        showingAllTransferHistory = false;
        transferHistoryCache = historyData.history || [];
        transferHistoryTotal = historyData.total || 0;
        renderTransferHistory();
      }
    }
  } catch (e) {
    console.error('Transfer section load error:', e);
  }
}

let transferHistoryLoaded = false;

function renderTransferMethods() {
  const query = ((document.getElementById('transfer-method-search') || {}).value || '').toLowerCase();
  const banks = transferMethods.filter(m => m.method_type === 'bank' && m.method_name.toLowerCase().includes(query));
  const wallets = transferMethods.filter(m => m.method_type === 'ewallet' && m.method_name.toLowerCase().includes(query));
  const bankWrap = document.getElementById('transfer-methods-bank');
  const ewalletWrap = document.getElementById('transfer-methods-ewallet');
  const moreBank = document.getElementById('transfer-more-bank');
  const moreEwallet = document.getElementById('transfer-more-ewallet');
  const gridCols = document.querySelectorAll('.transfer-method-gridcol');

  gridCols.forEach(c => { c.classList.remove('hidden'); c.classList.remove('col-span-2'); });
  bankWrap.classList.remove('transfer-list-full');
  ewalletWrap.classList.remove('transfer-list-full');
  bankWrap.classList.remove('grid', 'grid-cols-2');
  ewalletWrap.classList.remove('grid', 'grid-cols-2');

  const renderRow = m => `<button type="button" onclick="selectTransferMethod(${m.id}, this)" data-method-id="${m.id}" class="transfer-method-btn w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all ${selectedTransferMethod && selectedTransferMethod.id === m.id ? 'bg-[#DF414F]/5' : 'hover:bg-[#DF414F]/5'}">
      <img src="${escapeHtml(m.logo)}" class="w-9 h-9 object-contain bg-gray-50 border border-gray-100 p-1 shrink-0" alt="${escapeHtml(m.method_name)}" loading="lazy" onerror="this.src='https://img.icons8.com/?size=100&id=${m.method_type === 'bank' ? '10049' : '44948'}&format=png&color=737373'">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-gray-800">${escapeHtml(m.method_name)}</div>
        <div class="text-[10px] text-gray-400">Biaya admin Rp ${parseInt(m.admin_fee).toLocaleString('id-ID')}</div>
      </div>
      <img src="https://img.icons8.com/?size=100&id=357&format=png&color=DF414F" class="w-4 h-4 opacity-50" alt="chevron" loading="lazy">
    </button>`;

  const renderCard = m => `<button type="button" onclick="selectTransferMethod(${m.id}, this)" data-method-id="${m.id}" class="transfer-method-btn flex flex-col items-center gap-1.5 p-3 border transition-all ${selectedTransferMethod && selectedTransferMethod.id === m.id ? 'border-[#DF414F] bg-[#DF414F]/5' : 'border-gray-200 hover:border-[#DF414F] hover:bg-[#DF414F]/5'}">
      <img src="${escapeHtml(m.logo)}" class="w-8 h-8 object-contain bg-gray-50 border border-gray-100 p-0.5" alt="${escapeHtml(m.method_name)}" loading="lazy" onerror="this.src='https://img.icons8.com/?size=100&id=${m.method_type === 'bank' ? '10049' : '44948'}&format=png&color=737373'">
      <span class="text-[11px] font-semibold text-gray-800 text-center leading-tight">${escapeHtml(m.method_name)}</span>
      <span class="text-[9px] text-gray-400">Rp ${parseInt(m.admin_fee).toLocaleString('id-ID')}</span>
    </button>`;

  if (transferExpandMode === 'bank') {
    gridCols.forEach(c => c.classList.add('hidden'));
    gridCols[0].classList.remove('hidden');
    gridCols[0].classList.add('col-span-2');
    moreEwallet.classList.add('hidden');
    bankWrap.classList.add('grid');
    bankWrap.innerHTML = banks.length > 0
      ? '<div class="border border-gray-100 divide-y divide-gray-50">' + banks.map(renderRow).join('') + '</div>'
      : '<div class="text-center text-gray-400 text-[11px] py-4">Tidak ada bank</div>';
    moreBank.textContent = 'Kembali';
    moreBank.classList.remove('hidden');
    return;
  }

  if (transferExpandMode === 'ewallet') {
    gridCols.forEach(c => c.classList.add('hidden'));
    gridCols[1].classList.remove('hidden');
    gridCols[1].classList.add('col-span-2');
    moreBank.classList.add('hidden');
    ewalletWrap.classList.add('grid');
    ewalletWrap.innerHTML = wallets.length > 0
      ? '<div class="border border-gray-100 divide-y divide-gray-50">' + wallets.map(renderRow).join('') + '</div>'
      : '<div class="text-center text-gray-400 text-[11px] py-4">Tidak ada e-wallet</div>';
    moreEwallet.textContent = 'Kembali';
    moreEwallet.classList.remove('hidden');
    return;
  }

  const bankVisible = transferMoreBank ? banks : banks.slice(0, 4);
  const ewalletVisible = transferMoreEwallet ? wallets : wallets.slice(0, 4);

  bankWrap.classList.add('grid', 'grid-cols-2', 'gap-2');
  ewalletWrap.classList.add('grid', 'grid-cols-2', 'gap-2');

  bankWrap.innerHTML = bankVisible.length > 0 ? bankVisible.map(renderCard).join('') : '<div class="col-span-2 text-center text-gray-400 text-[11px] py-4">Tidak ada bank</div>';
  ewalletWrap.innerHTML = ewalletVisible.length > 0 ? ewalletVisible.map(renderCard).join('') : '<div class="col-span-2 text-center text-gray-400 text-[11px] py-4">Tidak ada e-wallet</div>';

  updateTransferAmountState();

  if (moreBank) {
    const hasMore = banks.length > 4;
    moreBank.classList.toggle('hidden', !hasMore);
    moreBank.textContent = transferMoreBank ? 'Tutup' : 'Lihat Semua Bank';
  }
  if (moreEwallet) {
    const hasMore = wallets.length > 4;
    moreEwallet.classList.toggle('hidden', !hasMore);
    moreEwallet.textContent = transferMoreEwallet ? 'Tutup' : 'Lihat Semua E-Wallet';
  }
}

function toggleTransferMethodMore(type) {
  if (transferExpandMode === type) {
    transferExpandMode = null;
  } else {
    transferExpandMode = type;
    transferMoreBank = false;
    transferMoreEwallet = false;
  }
  renderTransferMethods();
}

function onTransferMethodSearch(v) {
  renderTransferMethods();
}

function selectTransferMethod(methodId, el) {
  const m = transferMethods.find(x => x.id === methodId);
  if (!m) return;
  selectedTransferMethod = m;
  document.getElementById('transfer-method-id').value = m.id;
  document.getElementById('transfer-method-fee').value = m.admin_fee;
  document.getElementById('transfer-method-name').value = m.method_name;
  transferExpandMode = null;
  renderTransferMethods();
  updateTransferAmountState();
  updateTransferSummary();
  const acctInput = document.getElementById('transfer-account-number');
  if (acctInput) {
    acctInput.focus();
    acctInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function onTransferAmountInput(v) {
  const digits = v.replace(/\D/g, '');
  selectedTransferAmount = parseInt(digits) || 0;
  const el = document.getElementById('transfer-amount');
  if (digits) el.value = parseInt(digits).toLocaleString('id-ID');
  updateTransferAmountState();
  updateTransferSummary();
}

function updateTransferAmountState() {
  const amount = selectedTransferAmount;
  const box = document.getElementById('transfer-amount-box');
  const hint = document.getElementById('transfer-amount-hint');
  const btn = document.getElementById('btn-transfer');
  const below = !!amount && amount < 10000;
  if (box) box.style.borderColor = below ? '#DF414F' : '';
  if (hint) {
    hint.style.color = below ? '#DF414F' : '';
    hint.textContent = below ? 'Nominal minimal Rp 10.000' : 'Minimal transfer Rp 10.000';
  }
  if (btn) {
    const ready = !!amount && amount >= 10000 && !!selectedTransferMethod;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.5';
  }
}

function updateTransferSummary() {
  const summary = document.getElementById('transfer-summary');
  const amount = selectedTransferAmount;
  if (!selectedTransferMethod || !amount || amount < 1) {
    summary.classList.add('hidden');
    return;
  }
  const fee = parseInt(selectedTransferMethod.admin_fee) || 0;
  summary.classList.remove('hidden');
  document.getElementById('transfer-summary-method').textContent = selectedTransferMethod.method_name;
  document.getElementById('transfer-summary-amount').textContent = 'Rp ' + amount.toLocaleString('id-ID');
  document.getElementById('transfer-summary-fee').textContent = 'Rp ' + fee.toLocaleString('id-ID');
  document.getElementById('transfer-summary-total').textContent = 'Rp ' + (amount + fee).toLocaleString('id-ID');
}

async function submitNorthpayTransfer() {
  const methodId = document.getElementById('transfer-method-id').value;
  const accountNumber = document.getElementById('transfer-account-number').value.trim();
  const accountName = document.getElementById('transfer-account-name').value.trim();
  if (!methodId) return showIosModal('Pilih metode transfer terlebih dahulu');
  if (!accountNumber || accountNumber.length < 3) return showIosModal('Isi nomor rekening / e-wallet dengan benar');
  if (!accountName || accountName.length < 3) return showIosModal('Isi nama pemilik akun dengan benar');
  if (!selectedTransferAmount || selectedTransferAmount < 10000) return showIosModal('Nominal transfer minimal Rp 10.000');

  const m = transferMethods.find(x => x.id === parseInt(methodId));
  if (m && (selectedTransferAmount < m.min_amount || selectedTransferAmount > m.max_amount)) {
    return showIosModal('Nominal harus Rp ' + parseInt(m.min_amount).toLocaleString('id-ID') + ' - Rp ' + parseInt(m.max_amount).toLocaleString('id-ID'));
  }

  const hasPin = await checkNorthpayPinStatus();
  if (!hasPin) {
    showIosModal('Atur PIN NorthPay terlebih dahulu di Pengaturan');
    return;
  }

  showTransferPinModal(m, accountNumber, accountName, selectedTransferAmount);
}

async function checkNorthpayPinStatus() {
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}'), { credentials: 'include' });
    const data = await res.json();
    return !!(data.success && data.settings && data.settings.hasPin);
  } catch (e) {
    return false;
  }
}

function showTransferPinModal(method, accountNumber, accountName, amount) {
  const fee = parseInt(method.admin_fee) || 0;
  const total = amount + fee;
  const fmt = n => new Intl.NumberFormat('id-ID').format(n);

  const overlay = document.createElement('div');
  overlay.id = 'transfer-pin-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);

  const box = document.createElement('div');
  box.style.cssText = 'width:100%;max-width:400px;background:#fff;';

  box.innerHTML = `
    <div class="border-b border-gray-100 px-4 py-3">
      <div class="text-[15px] font-bold text-gray-800">Verifikasi PIN NorthPay</div>
    </div>
    <div class="p-5">
      <div class="bg-gray-50 border border-gray-100 p-3 mb-4 space-y-1.5 text-[13px]">
        <div class="flex justify-between">
          <span class="text-gray-500">Tujuan</span>
          <span class="font-semibold text-gray-800">${escapeHtml(method.method_name)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Nomor Akun</span>
          <span class="font-medium text-gray-700">${escapeHtml(accountNumber)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Nama Penerima</span>
          <span class="font-medium text-gray-700 truncate ml-3">${escapeHtml(accountName)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Total</span>
          <span class="font-bold text-[#DF414F]">Rp ${fmt(total)}</span>
        </div>
      </div>
      <div class="text-center mb-3 text-[12px] text-gray-400">Masukkan PIN 6 digit untuk konfirmasi transfer</div>
      <div class="flex justify-center gap-2 mb-4" id="transfer-pin-boxes"></div>
      <div id="transfer-pin-err" class="text-center text-[12px] text-red-500 mb-2 hidden"></div>
      <button id="transfer-pin-submit" class="w-full bg-[#DF414F] hover:bg-[#c73441] text-white font-bold py-3 text-[13px] transition" disabled>Konfirmasi Transfer</button>
      <div class="text-center mt-3">
        <button class="text-[11px] text-gray-400 underline" onclick="document.getElementById('transfer-pin-overlay')&&document.getElementById('transfer-pin-overlay').remove()">Batal</button>
      </div>
    </div>
  `;
  overlay.appendChild(box);

  const inputsDiv = document.getElementById('transfer-pin-boxes');
  const inputs = [];
  for (let i = 0; i < 6; i++) {
    const inp = document.createElement('input');
    inp.type = 'password';
    inp.maxLength = 1;
    inp.inputMode = 'numeric';
    inp.autocomplete = 'off';
    inp.setAttribute('data-idx', String(i));
    inp.style.cssText = 'width:44px;height:50px;text-align:center;font-size:20px;font-weight:700;border:1.5px solid #e5e7eb;outline:none;';
    inputsDiv.appendChild(inp);
    inputs.push(inp);
  }

  const submitBtn = document.getElementById('transfer-pin-submit');
  const errP = document.getElementById('transfer-pin-err');

  function checkFilled() {
    submitBtn.disabled = !inputs.every(i => i.value.length === 1);
  }
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', function() {
      const val = this.value.replace(/[^0-9]/g, '');
      this.value = val.slice(-1);
      if (val && idx < 5) inputs[idx + 1].focus();
      checkFilled();
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && idx > 0) inputs[idx - 1].focus();
    });
  });

  submitBtn.addEventListener('click', async function() {
    const pin = inputs.map(i => i.value).join('');
    if (pin.length !== 6) {
      errP.textContent = 'Masukkan PIN 6 digit';
      errP.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memverifikasi...';
    errP.classList.add('hidden');
    try {
      const verify = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9zsx9!o|sp$'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      }).then(r => r.json());
      if (!verify.success) {
        errP.textContent = verify.message || 'PIN salah';
        errP.classList.remove('hidden');
        inputs.forEach(i => { i.value = ''; });
        inputs[0].focus();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Konfirmasi Transfer';
        return;
      }
      overlay.remove();
      await doNorthpayTransfer(method, accountNumber, accountName, amount);
    } catch (e) {
      errP.textContent = 'Gagal menghubungi server';
      errP.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Konfirmasi Transfer';
    }
  });

  inputs[0].focus();
}

async function doNorthpayTransfer(method, accountNumber, accountName, amount) {
  const csrfToken = await getCsrfToken();
  const btn = document.getElementById('btn-transfer');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(_d('9kzs9xy|~rzk$9~|kx}po|'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ methodId: method.id, accountNumber, accountName, amount })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('transfer-account-number').value = '';
      document.getElementById('transfer-account-name').value = '';
      document.getElementById('transfer-amount').value = '';
      selectedTransferAmount = 0;
      selectedTransferMethod = null;
      document.querySelectorAll('.transfer-method-btn').forEach(b => b.classList.remove('border-[#DF414F]', 'bg-[#DF414F]/5', 'ring', 'ring-[#DF414F]'));
      document.getElementById('transfer-summary').classList.add('hidden');
      updateTransferAmountState();
      loadTransferSection();
      loadNorthpayData();
      if (typeof showNorthpayTransferSuccess === 'function') {
        showNorthpayTransferSuccess({
          transferId: data.transferId,
          userId: _currentUser ? _currentUser.id : '',
          methodName: method.method_name,
          methodLogo: method.logo,
          accountNumber,
          accountName,
          amount,
          adminFee: parseInt(method.admin_fee) || 0,
          total: amount + (parseInt(method.admin_fee) || 0),
          status: 'SUCCESS'
        });
      } else {
        showIosModal(data.message || 'Permintaan transfer berhasil dikirim');
      }
    } else {
      showIosModal(data.message || 'Gagal mengirim permintaan transfer');
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan, coba lagi');
  } finally {
    btn.textContent = 'Transfer';
    updateTransferAmountState();
  }
}

let northpayHistoryTab = 'topup';

let historySectionLoading = false;
async function loadNorthpayHistorySection() {
  if (historySectionLoading) return;
  historySectionLoading = true;
  try {
    const [balanceRes, topupRes, transferRes] = await Promise.all([
      fetch(_d('9kzs9xy|~rzk$9lkvkxmo'), { credentials: 'include' }),
      fetch(_d('9kzs9xy|~rzk$9rs}~y|$'), { credentials: 'include' }),
      fetch(_d('9kzs9xy|~rzk$9~|kx}po|9rs}~y|$'), { credentials: 'include' })
    ]);
    const balanceData = await balanceRes.json();
    if (balanceData.success) updateNorthpayBalanceUI(balanceData.balance || 0);
    const topupData = await topupRes.json();
    if (topupData.success) {
      northpayHistoryLoaded = true;
      showingAllHistory = false;
      historyCache = topupData.history || [];
      historyTotal = topupData.total || 0;
      renderNorthpayHistory();
    }
    const transferData = await transferRes.json();
    if (transferData.success) {
      transferHistoryLoaded = true;
      showingAllTransferHistory = false;
      transferHistoryCache = transferData.history || [];
      transferHistoryTotal = transferData.total || 0;
      renderTransferHistory();
    }
  } catch (e) {
    console.error('History section load error:', e);
  } finally {
    historySectionLoading = false;
  }
}

function switchNorthpayHistoryTab(tab) {
  northpayHistoryTab = tab;
  const tabTopup = document.getElementById('northpay-history-tab-topup');
  const tabTransfer = document.getElementById('northpay-history-tab-transfer');
  const wrapTopup = document.getElementById('northpay-history-topup-wrap');
  const wrapTransfer = document.getElementById('northpay-history-transfer-wrap');

  const activeCls = ['border-[#DF414F]', 'text-[#DF414F]'];
  const inactiveCls = ['border-transparent', 'text-gray-500'];

  if (tab === 'transfer') {
    if (tabTopup) { tabTopup.classList.add(...inactiveCls); tabTopup.classList.remove(...activeCls); }
    if (tabTransfer) { tabTransfer.classList.remove(...inactiveCls); tabTransfer.classList.add(...activeCls); }
    if (wrapTopup) wrapTopup.classList.add('hidden');
    if (wrapTransfer) wrapTransfer.classList.remove('hidden');
  } else {
    if (tabTransfer) { tabTransfer.classList.add(...inactiveCls); tabTransfer.classList.remove(...activeCls); }
    if (tabTopup) { tabTopup.classList.remove(...inactiveCls); tabTopup.classList.add(...activeCls); }
    if (wrapTransfer) wrapTransfer.classList.add('hidden');
    if (wrapTopup) wrapTopup.classList.remove('hidden');
  }
}

function renderTransferHistory() {
  const list = document.getElementById('transfer-history-list');
  if (!list) return;
  const lihatSemua = document.getElementById('transfer-lihat-semua-btn');
  if (!transferHistoryCache || transferHistoryCache.length === 0) {
    list.innerHTML = '<div class="text-center text-gray-400 text-xs py-8">Belum ada riwayat transfer</div>';
    if (lihatSemua) lihatSemua.classList.add('hidden');
    return;
  }
  const items = showingAllTransferHistory ? transferHistoryCache : transferHistoryCache.slice(0, 5);
  list.innerHTML = items.map(item => {
    const statusMap = { 'pending': 'Menunggu', 'success': 'Berhasil', 'cancelled': 'Dibatalkan' };
    const statusColors = { 'pending': 'text-yellow-600', 'success': 'text-green-600', 'cancelled': 'text-red-500' };
    const d = new Date(item.created_at);
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const cancelBtn = item.status === 'pending'
      ? `<button onclick="cancelNorthpayTransfer(${item.id})" class="text-[10px] text-[#DF414F] underline ml-2">Batalkan</button>`
      : '';
    return `<div class="flex items-center justify-between border-b border-gray-50 py-2.5">
      <div class="flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm">Rp ${parseInt(item.amount).toLocaleString('id-ID')}</span>
          <span class="text-[10px] text-gray-400">${escapeHtml(item.method_name)}</span>
          ${cancelBtn}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">${escapeHtml(item.account_number)} a.n. ${escapeHtml(item.account_name)}</div>
        <div class="text-[10px] text-gray-400 mt-0.5">${date} ${time} WIB</div>
      </div>
      <span class="text-xs font-medium ${statusColors[item.status] || 'text-gray-500'}">${statusMap[item.status] || item.status}</span>
    </div>`;
  }).join('');
  if (lihatSemua) {
    lihatSemua.classList.remove('hidden');
    lihatSemua.classList.toggle('hidden', transferHistoryCache.length <= 5);
    lihatSemua.textContent = showingAllTransferHistory ? 'Tutup' : 'Lihat Semua';
    lihatSemua.onclick = showingAllTransferHistory ? resetTransferHistory : loadAllTransferHistory;
  }
}

async function loadAllTransferHistory() {
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9~|kx}po|9rs}~y|$IkvvG~| o'), { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      transferHistoryCache = data.history || [];
      transferHistoryTotal = data.total || 0;
      showingAllTransferHistory = true;
      renderTransferHistory();
    }
  } catch (e) {
    console.error('Load all transfer history error:', e);
  }
}

function resetTransferHistory() {
  showingAllTransferHistory = false;
  renderTransferHistory();
}

async function cancelNorthpayTransfer(transferId) {
  if (!confirm('Batalkan transfer ini? Dana akan dikembalikan ke saldo NorthPay.')) return;
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9~|kx}po|9mkxmov'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferId })
    });
    const data = await res.json();
    showIosModal(data.message || (data.success ? 'Transfer dibatalkan' : 'Gagal membatalkan transfer'));
    if (data.success) {
      loadTransferSection();
      loadNorthpayData();
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan, coba lagi');
  }
}

function markNotifRead() {
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.add('hidden');
}

let northpaySettingsCache = null;

async function loadNorthpaySettings() {
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}'), { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      northpaySettingsCache = data.settings;
      renderNorthpaySettings();
    } else {
      showIosModal('Gagal memuat pengaturan: ' + data.message);
    }
  } catch (e) {
    console.error('Load settings error:', e);
    showIosModal('Gagal memuat pengaturan');
  }
}

function showModal(html) {
  let overlay = document.getElementById('modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'fixed inset-0 z-[9998] hidden items-center justify-center bg-black/50';
    overlay.onclick = function(e) { if (e.target === this) closeModal(); };
    document.body.appendChild(overlay);
    const body = document.createElement('div');
    body.id = 'modal-body';
    body.className = 'bg-white w-[90%] max-w-[420px] max-h-[80vh] overflow-y-auto p-6';
    overlay.appendChild(body);
  }
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.innerHTML = html;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
}

function showNorthpayForm(title, contentHtml) {
  const titleEl = document.getElementById('northpay-form-title');
  const contentEl = document.getElementById('northpay-form-content');
  if (titleEl) titleEl.textContent = title;
  if (contentEl) contentEl.innerHTML = contentHtml;
  document.title = title + ' - Northline';
  const url = new URL(window.location);
  url.searchParams.set('tab', 'northpayForm');
  url.searchParams.set('form', encodeURIComponent(title));
  history.replaceState(null, '', url.toString());
  switchAccountTab('northpayForm');
}

function setToggleState(btn, active) {
  if (!btn) return;
  btn.setAttribute('data-active', active ? 'true' : 'false');
  btn.style.backgroundColor = active ? '#DF414F' : '#e5e7eb';
  const knob = btn.querySelector('span');
  if (knob) knob.style.transform = active ? 'translateX(20px)' : 'translateX(0)';
}

function getToggleState(btn) {
  return btn ? btn.getAttribute('data-active') === 'true' : false;
}

function renderNorthpaySettings() {
  if (!northpaySettingsCache) return;
  const s = northpaySettingsCache;
  
  const pinStatus = document.getElementById('pin-status');
  if (pinStatus) pinStatus.textContent = s.hasPin ? 'Sudah diatur' : 'Belum diatur';
  
  const sqStatus = document.getElementById('security-q-status');
  if (sqStatus) sqStatus.textContent = s.hasSecurityQuestion ? 'Sudah diatur' : 'Belum diatur';
  
  const biometricToggle = document.getElementById('biometric-toggle');
  setToggleState(biometricToggle, s.biometricEnabled);
  
  const dailyLimitEl = document.getElementById('daily-limit-input');
  if (dailyLimitEl) dailyLimitEl.value = s.dailyLimit ? s.dailyLimit.toString() : '5000000';
  
  const autoTopupEnabledEl = document.getElementById('auto-topup-toggle');
  setToggleState(autoTopupEnabledEl, s.autoTopupEnabled);
  
  const northpayToggleEl = document.getElementById('northpay-enable-toggle');
  setToggleState(northpayToggleEl, s.enabled);
  
  const autoTopupAmountEl = document.getElementById('auto-topup-amount');
  if (autoTopupAmountEl) autoTopupAmountEl.value = s.autoTopupAmount ? s.autoTopupAmount.toString() : '';
  
  const autoTopupThresholdEl = document.getElementById('auto-topup-threshold');
  if (autoTopupThresholdEl) autoTopupThresholdEl.value = s.autoTopupThreshold ? s.autoTopupThreshold.toString() : '';
}

function openNorthpaySettings() {
  switchAccountTab('northpaySettings');
}

// PIN Management
function showSetPinModal(isChange = false) {
  const hasPin = northpaySettingsCache?.hasPin;
  const title = isChange || hasPin ? 'Ubah PIN' : 'Buat PIN Baru';
  const note = hasPin ? 'Masukkan PIN lama dan PIN baru 6 digit' : 'Buat PIN 6 digit untuk verifikasi pembayaran';
  
  const html = `
    <div class="bg-white border border-gray-200 p-5 md:p-6">
      <p class="text-xs text-gray-500 mb-5">${note}</p>
      ${hasPin ? `
      <div class="mb-4">
        <label class="text-xs font-medium text-gray-700 mb-1 block">PIN SAAT INI</label>
        <input type="password" id="current-pin" maxlength="6" pattern="[0-9]*" inputmode="numeric" 
          class="w-full px-4 py-1 border border-gray-200 text-center text-lg tracking-widest focus:border-[#DF414F] focus:outline-none" 
          placeholder="- - - - - -" required>
      </div>` : ''}
      <div class="mb-4">
        <label class="text-xs font-medium text-gray-700 mb-1 block">PIN BARU</label>
        <input type="password" id="new-pin" maxlength="6" pattern="[0-9]*" inputmode="numeric" 
          class="w-full px-4 py-1 border border-gray-200 text-center text-lg tracking-widest focus:border-[#DF414F] focus:outline-none" 
          placeholder="- - - - - -" required>
      </div>
      <div class="mb-6">
        <label class="text-xs font-medium text-gray-700 mb-1 block">KONFIRMASI PIN BARU</label>
        <input type="password" id="confirm-pin" maxlength="6" pattern="[0-9]*" inputmode="numeric" 
          class="w-full px-4 py-1 border border-gray-200 text-center text-lg tracking-widest focus:border-[#DF414F] focus:outline-none" 
          placeholder="- - - - - -" required>
      </div>
      <button onclick="savePin(${hasPin})" class="w-full py-2 bg-[#DF414F] text-white font-medium text-sm hover:bg-[#c73441] transition">SIMPAN</button>
      <div class="text-center mt-3">
        <button onclick="switchAccountTab('northpaySettings')" class="text-xs text-[#DF414F] hover:text-[#c73441]">Batal</button>
      </div>
    </div>
  `;
  
  showNorthpayForm(title, html);
}

async function savePin(hasCurrentPin) {
  const currentPin = document.getElementById('current-pin')?.value || '';
  const newPin = document.getElementById('new-pin')?.value || '';
  const confirmPin = document.getElementById('confirm-pin')?.value || '';
  
  if (hasCurrentPin && !currentPin) return showIosModal('PIN saat ini wajib diisi');
  if (!newPin || !/^\d{6}$/.test(newPin)) return showIosModal('PIN baru harus 6 digit angka');
  if (/^(\d)\1{5}$/.test(newPin)) return showIosModal('PIN tidak boleh sama semua');
  if (/^012345|^123456|^234567|^345678|^456789|^567890|^678901|^789012|^890123|^901234/.test(newPin)) 
    return showIosModal('PIN tidak boleh berurutan');
  if (newPin !== confirmPin) return showIosModal('Konfirmasi PIN tidak cocok');
  
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9zsx'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin: hasCurrentPin ? currentPin : '', newPin })
    });
    const data = await res.json();
    if (data.success) {
      switchAccountTab('northpaySettings');
      showIosModal(data.message);
      loadNorthpaySettings();
    } else {
      showIosModal(data.message);
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan';
  }
}

function showForgotPinModal() {
  if (!northpaySettingsCache?.hasSecurityQuestion) {
    return showIosModal('Pertanyaan keamanan belum diatur. Hubungi admin.');
  }
  
  const html = `
    <div class="bg-white border border-gray-200 p-5 md:p-6">
      <p class="text-xs text-gray-500 mb-5">Jawab pertanyaan keamanan untuk reset PIN</p>
      <div class="mb-5">
        <p class="text-xs font-medium text-gray-800 mb-2">${northpaySettingsCache.securityQuestion}</p>
        <input type="text" id="security-answer" 
          class="w-full px-4 py-3 border border-gray-200 focus:border-[#DF414F] focus:outline-none text-sm" 
          placeholder="Jawaban Anda" required>
      </div>
      <div class="mb-4">
        <label class="text-xs font-medium text-gray-700 mb-1 block">PIN BARU (6 DIGIT)</label>
        <input type="password" id="new-pin-reset" maxlength="6" pattern="[0-9]*" inputmode="numeric" 
          class="w-full px-4 py-3 border border-gray-200 text-center text-lg tracking-widest focus:border-[#DF414F] focus:outline-none" 
          placeholder="- - - - - -" required>
      </div>
      <div class="mb-6">
        <label class="text-xs font-medium text-gray-700 mb-1 block">KONFIRMASI PIN BARU</label>
        <input type="password" id="confirm-pin-reset" maxlength="6" pattern="[0-9]*" inputmode="numeric" 
          class="w-full px-4 py-3 border border-gray-200 text-center text-lg tracking-widest focus:border-[#DF414F] focus:outline-none" 
          placeholder="- - - - - -" required>
      </div>
      <button onclick="resetPin()" class="w-full py-3 bg-[#DF414F] text-white font-medium text-sm hover:bg-[#c73441] transition">RESET PIN</button>
      <div class="text-center mt-3">
        <button onclick="switchAccountTab('northpaySettings')" class="text-xs text-[#DF414F] hover:text-[#c73441]">Batal</button>
      </div>
    </div>
  `;
  
  showNorthpayForm('Lupa PIN', html);
}

async function resetPin() {
  const answer = document.getElementById('security-answer')?.value || '';
  const newPin = document.getElementById('new-pin-reset')?.value || '';
  const confirmPin = document.getElementById('confirm-pin-reset')?.value || '';
  
  if (!answer) return showIosModal('Jawaban keamanan wajib diisi');
  if (!newPin || !/^\d{6}$/.test(newPin)) return showIosModal('PIN baru harus 6 digit angka');
  if (/^(\d)\1{5}$/.test(newPin)) return showIosModal('PIN tidak boleh sama semua');
  if (newPin !== confirmPin) return showIosModal('Konfirmasi PIN tidak cocok');
  
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Mer...';
  
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9zsx9py|qy~'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ securityAnswer: answer, newPin })
    });
    const data = await res.json();
    if (data.success) {
      switchAccountTab('northpaySettings');
      showIosModal(data.message);
      loadNorthpaySettings();
    } else {
      showIosModal(data.message);
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reset PIN';
  }
}

function showSecurityQuestionModal() {
  const current = northpaySettingsCache?.securityQuestion || '';
  const hasQ = northpaySettingsCache?.hasSecurityQuestion;
  
  const html = `
    <div class="bg-white border border-gray-200 p-5 md:p-6">
      <p class="text-xs text-gray-500 mb-5">Digunakan untuk reset PIN jika lupa</p>
      <div class="mb-4">
        <label class="text-xs font-medium text-gray-700 mb-1 block">PERTANYAAN</label>
        <select id="security-question" class="w-full px-4 py-2 border border-gray-200 focus:border-[#DF414F] focus:outline-none text-sm">
          <option value="">Pilih pertanyaan</option>
          <option value="Nama ibu kandung?" ${current === 'Nama ibu kandung?' ? 'selected' : ''}>Nama ibu kandung?</option>
          <option value="Nama hewan peliharaan pertama?" ${current === 'Nama hewan peliharaan pertama?' ? 'selected' : ''}>Nama hewan peliharaan pertama?</option>
          <option value="Kota kelahiran Anda?" ${current === 'Kota kelahiran Anda?' ? 'selected' : ''}>Kota kelahiran Anda?</option>
          <option value="Nama sekolah dasar Anda?" ${current === 'Nama sekolah dasar Anda?' ? 'selected' : ''}>Nama sekolah dasar Anda?</option>
          <option value="Makanan favorit Anda?" ${current === 'Makanan favorit Anda?' ? 'selected' : ''}>Makanan favorit Anda?</option>
        </select>
      </div>
      <div class="mb-6">
        <label class="text-xs font-medium text-gray-700 mb-1 block">JAWABAN</label>
        <input type="text" id="security-answer-set" 
          class="w-full px-4 py-2 border border-gray-200 focus:border-[#DF414F] focus:outline-none text-sm" 
          placeholder="Jawaban Anda" required>
      </div>
      <button onclick="saveSecurityQuestion()" class="w-full py-2 bg-[#DF414F] text-white font-medium text-sm hover:bg-[#c73441] transition">SIMPAN</button>
      <div class="text-center mt-3">
        <button onclick="switchAccountTab('northpaySettings')" class="text-xs text-[#DF414F] hover:text-[#c73441]">Batal</button>
      </div>
    </div>
  `;
  
  showNorthpayForm(hasQ ? 'Ubah Pertanyaan Keamanan' : 'Atur Pertanyaan Keamanan', html);
}

async function saveSecurityQuestion() {
  const question = document.getElementById('security-question')?.value || '';
  const answer = document.getElementById('security-answer-set')?.value || '';
  
  if (!question) return showIosModal('Pilih pertanyaan keamanan');
  if (!answer) return showIosModal('Jawaban wajib diisi');
  
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9}om |s~$7{ o}~syx'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer })
    });
    const data = await res.json();
    if (data.success) {
      switchAccountTab('northpaySettings');
      showIosModal(data.message);
      loadNorthpaySettings();
    } else {
      showIosModal(data.message);
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan';
  }
}

async function saveDailyLimit() {
  const limit = parseInt(document.getElementById('daily-limit-input')?.value || '0');
  if (!limit || limit < 100000 || limit > 50000000) return showIosModal('Limit harian 100.000 - 50.000.000');
  
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9nksv$7vsws~'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit })
    });
    const data = await res.json();
    showIosModal(data.message);
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  }
}

function toggleAutoTopup(btn) {
  const active = getToggleState(btn);
  setToggleState(btn, !active);
  const settings = document.getElementById('auto-topup-settings');
  if (settings) settings.classList.toggle('hidden', active);
}

async function saveAutoTopupSettings() {
  const enabled = getToggleState(document.getElementById('auto-topup-toggle'));
  const amount = parseInt(document.getElementById('auto-topup-amount')?.value || '0');
  const threshold = parseInt(document.getElementById('auto-topup-threshold')?.value || '0');
  
  if (enabled) {
    if (!amount || amount < 10000 || amount > 500000) return showIosModal('Jumlah auto topup 10.000 - 500.000');
    if (!threshold || threshold < 5000 || threshold >= amount) return showIosModal('Ambang batas minimal 5.000 dan kurang dari jumlah topup');
  }
  
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9k ~y7~yz z'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, amount, threshold })
    });
    const data = await res.json();
    showIosModal(data.message);
    loadNorthpaySettings();
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  }
}

async function logoutAllDevices() {
  if (!confirm('Yakin ingin keluar dari semua perangkat? Anda perlu login ulang.')) return;
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9vyqy ~7kvv'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showIosModal(data.message);
      // Redirect ke beranda
      setTimeout(() => window.location.href = '/', 1500);
    } else {
      showIosModal(data.message);
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  }
}

function confirmDeleteAccount() {
  if (confirm('Yakin ingin menghapus akun? Tindakan ini tidak bisa dibatalkan.')) {
    showIosModal('Fitur hapus akun dalam pengembangan');
  }
}

function showRegisteredDevices() {
  const ip = _currentUser?.last_login_ip || 'Tidak terdeteksi';
  const ua = _currentUser?.last_login_ua || '';
  const deviceName = ua ? parseDeviceName(ua) : 'Tidak terdeteksi';
  const lastLogin = _currentUser?.last_login_at || _currentUser?.created_at || '';

  const html = `
    <div class="bg-white border border-gray-200">
      <div class="px-5 py-4 border-b border-gray-100">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Perangkat Terdaftar</p>
      </div>
      <div class="divide-y divide-gray-100">
        <div class="px-5 py-4 flex items-start gap-3">
          <div class="w-8 h-8 bg-[#DF414F]/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <img src="https://img.icons8.com/?size=100&id=ADyQCOfsd2iu&format=png&color=000000" class="w-4 h-4" alt="Device" loading="lazy">
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs md:text-sm font-medium text-gray-800">${deviceName || 'Perangkat tidak dikenal'}</p>
            <p class="text-[11px] text-gray-500 mt-0.5">IP: ${ip}</p>
            ${ua ? `<p class="text-[11px] text-gray-400 truncate max-w-[280px]" title="${escapeHtml(ua)}">${escapeHtml(ua)}</p>` : ''}
            <p class="text-[11px] text-gray-400 mt-1">Login terakhir: ${lastLogin ? new Date(lastLogin).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
          </div>
          <span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 font-medium shrink-0 mt-1">Perangkat ini</span>
        </div>
      </div>
      <div class="px-5 py-4 border-t border-gray-100 text-center">
        <button onclick="switchAccountTab('settings')" class="px-6 py-2 bg-[#DF414F] text-white font-medium text-sm hover:bg-[#c73441] transition">Tutup</button>
      </div>
    </div>
  `;
  
  showNorthpayForm('Perangkat Terdaftar', html);
}

function parseDeviceName(ua) {
  if (!ua) return 'Tidak terdeteksi';
  if (ua.includes('Android')) {
    const match = ua.match(/Android\s+([\d.]+)/);
    return 'Android' + (match ? ' ' + match[1] : '');
  }
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    const match = ua.match(/OS\s+([\d_]+)/);
    return 'iOS' + (match ? ' ' + match[1].replace(/_/g, '.') : '');
  }
  if (ua.includes('Windows')) {
    const match = ua.match(/Windows\s+NT\s+([\d.]+)/);
    return 'Windows' + (match ? ' ' + match[1] : '');
  }
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X\s+([\d_]+)/);
    return 'macOS' + (match ? ' ' + match[1].replace(/_/g, '.') : '');
  }
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  return 'Perangkat tidak dikenal';
}

function updateDeviceCount() {
  const el = document.getElementById('device-count');
  if (!el) return;
  const count = _currentUser?.last_login_ip ? 1 : 0;
  el.textContent = count + ' perangkat';
}

async function toggleNorthpay(btn) {
  const current = getToggleState(btn);
  const next = !current;

  if (current) {
    if (!confirm('Yakin ingin menonaktifkan NorthPay? Fitur pembayaran NorthPay akan dinonaktifkan sementara. Saldo Anda tetap tersimpan.')) return;
  }

  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9~yqqvo'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next })
    });
    const data = await res.json();
    if (data.success) {
      setToggleState(btn, next);
      showIosModal(data.message);
      loadNorthpaySettings();
    } else {
      showIosModal(data.message);
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  }
}

async function deleteNorthpayAccount() {
  if (!confirm('PERINGATAN: Ini akan menghapus PERMANEN data NorthPay Anda termasuk saldo. Tindakan ini TIDAK DAPAT DIBATALKAN.')) return;
  const pin = prompt('Masukkan PIN untuk konfirmasi hapus permanen:');
  if (!pin) return;
  
  try {
    const verify = await window.verifyNorthpayPin(pin);
    if (!verify.success) return showIosModal('PIN salah');
    
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9novo~o'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      showIosModal(data.message);
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showIosModal(data.message);
    }
  } catch (e) {
    showIosModal('Terjadi kesalahan');
  }
}

async function toggleBiometric(btn) {
  const enabled = getToggleState(btn);
  setToggleState(btn, !enabled);

  if (!enabled) {
    if (!window.PublicKeyCredential) {
      setToggleState(btn, false);
      return showIosModal('Browser/perangkat tidak mendukung biometrik');
    }
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: { name: 'Northline', id: window.location.hostname },
          user: { id: new TextEncoder().encode(String(_currentUser.id)), name: _currentUser.username, displayName: _currentUser.name },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000
        }
      });
      const deviceToken = btoa(JSON.stringify({ id: credential.id, rawId: Array.from(new Uint8Array(credential.rawId)) }));
      
      const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9lsywo~|sm'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, deviceToken })
      });
      const data = await res.json();
      if (!data.success) {
        setToggleState(btn, false);
        showIosModal(data.message);
      } else {
        showIosModal('Biometrik diaktifkan');
      }
    } catch (e) {
      setToggleState(btn, false);
      showIosModal('Gagal mengaktifkan biometrik: ' + e.message);
    }
  } else {
    try {
      const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9lsywo~|sm'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
      });
      const data = await res.json();
      if (!data.success) {
        setToggleState(btn, true);
        showIosModal(data.message);
      } else {
        showIosModal('Biometrik dinonaktifkan');
      }
    } catch (e) {
      setToggleState(btn, true);
      showIosModal('Terjadi kesalahan');
    }
  }
}

// PIN verification for checkout
window.verifyNorthpayPin = async function(pin) {
  if (!pin || !/^\d{6}$/.test(pin)) return { success: false, message: 'PIN tidak valid' };
  try {
    const res = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9zsx9!o|sp$'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: 'Gagal verifikasi PIN' };
  }
};

async function checkUnreadNotif() {
  try {
    const res = await fetch(_d('9kzs9xy~spsmk~syx}9vk~o}~'), { credentials: 'include' });
    const data = await res.json();
    const lastViewedId = parseInt(localStorage.getItem('lastViewedNotifId') || '0');
    if (data.latestId > lastViewedId) {
      const dot = document.getElementById('notif-dot');
      if (dot) dot.classList.remove('hidden');
    } else {
      markNotifRead();
    }
  } catch (e) {}
}

checkUnreadNotif();
loadNorthpayBalance();
