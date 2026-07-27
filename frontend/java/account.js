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
    window.location.href = "index.html";
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
    } else {
      loadFallbackData();
    }
  } catch (error) {
    console.warn(
      "API server offline/Error fetching data. Activating localized fallback.",
    );
    loadFallbackData();
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
    const response = await fetch("/api/user/profile/update", {
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
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; OpenStreetMap contributors",
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

function switchAccountTab(tabName) {
  const menuProfile = document.getElementById("sidebar-menu-profile");
  const menuAddress = document.getElementById("sidebar-menu-address");
  const menuPassword = document.getElementById("sidebar-menu-password");
  const menuNotif = document.getElementById("sidebar-menu-notif");

  [menuProfile, menuAddress, menuPassword, menuNotif].forEach((el) => {
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

  [profileSection, addressSection, passwordSection, notifSection].forEach(
    (sec) => {
      if (sec) sec.classList.add("hidden");
    },
  );

  if (tabName === "address" && addressSection) {
    addressSection.classList.remove("hidden");

    if (_currentUser) {
      let fullAddress = _currentUser.address || "";

      if (fullAddress.includes(" @Coordinates:")) {
        fullAddress = fullAddress.split(" @Coordinates:")[0];
      }

      if (fullAddress.includes(" | ")) {
        const parts = fullAddress.split(" | ");
        document.getElementById("addr-detail").value = parts[0] || "";
        document.getElementById("addr-kecamatan").value = parts[1] || "";
        document.getElementById("addr-kota").value = parts[2] || "";
        document.getElementById("addr-provinsi").value = parts[3] || "";
        document.getElementById("addr-kodepos").value = parts[4] || "";
      } else {
        document.getElementById("addr-detail").value = fullAddress;
      }

      if (!addressMap) {
        initAddressMap();
      } else {
        setTimeout(() => {
          addressMap.invalidateSize();
          const savedLat =
            parseFloat(document.getElementById("addr-latitude").value) ||
            -6.4194;
          const savedLng =
            parseFloat(document.getElementById("addr-longitude").value) ||
            107.4589;
          addressMap.setView([savedLat, savedLng], 15);
          addressMarker.setLatLng([savedLat, savedLng]);
        }, 100);
      }
    }
  } else if (tabName === "profile" && profileSection) {
    profileSection.classList.remove("hidden");
  } else if (tabName === "password" && passwordSection) {
    passwordSection.classList.remove("hidden");
  } else if (tabName === "notif" && notifSection) {
    notifSection.classList.remove("hidden");
    loadNotifications();
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
    const response = await fetch(`/api/auth/update-address`, {
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
        submitBtn.textContent = "SAVED ✅";
        submitBtn.classList.replace("bg-northline-orange", "bg-emerald-600");
      }

      setTimeout(() => {
        if (submitBtn) {
          submitBtn.textContent = "SAVE ADDRESS";
          submitBtn.classList.replace("bg-emerald-600", "bg-northline-orange");
          submitBtn.disabled = false;
        }
      }, 2000);
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

async function loadNotifications() {
  const container = document.getElementById("notif-list");
  container.innerHTML = `<div class="py-12 text-center text-gray-400 text-xs">Loading...</div>`;

  try {
    const response = await fetch(_d('9kzs9k ~r9xy~spsmk~syx}'), {
      credentials: "include",
    });
    const data = await response.json();

    if (!data || data.length === 0) {
      container.innerHTML = `
                <div class="py-16 text-center flex flex-col items-center">
                    <img src="https://img.icons8.com/?size=100&id=11668&format=png&color=E5E7EB" class="w-16 h-16 mb-4" alt="no-notif">
                    <p class="text-xs text-gray-400">No notifications yet</p>
                </div>
            `;
      return;
    }

    container.innerHTML = data
      .map(
        (n) => `
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
  } catch (err) {
    container.innerHTML = `<p class="py-10 text-center text-xs text-red-500">Failed to load.</p>`;
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
        const res = await fetch(`/api/following-count/${userId}`);
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

  const user = _currentUser;

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
  if (!user || !user.username) {
    const tooltip = document.getElementById("account-tooltip");
    if (tooltip) {
      tooltip.style.display = "none";
    }
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
