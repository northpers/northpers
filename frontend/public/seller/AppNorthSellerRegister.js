function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

let _sellerUser = null;
(async () => {
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      _sellerUser = meData.data || meData.user || meData;
      loadSellerData();
    }
  } catch (e) {}
})();

window.updateAuthUI = () => {
  const user = _sellerUser;

  const authBtn = document.getElementById("auth-menu-btn");
  const tooltip = document.getElementById("account-tooltip");

  if (authBtn) {
    if (user && user.username) {
      authBtn.innerText = user.username;
      authBtn.href = "/AppNorthAccount";
      if (tooltip) tooltip.style.display = "block";
    } else {
      authBtn.innerText = "Sign Up";
      authBtn.href = "/AppNorthAuth";
      if (tooltip) tooltip.style.display = "none";
    }
  }

  const mobileText = document.getElementById("mobile-auth-text");
  if (mobileText) {
    mobileText.innerText = user && user.username ? "Log Out" : "Sign Up";
  }
};

async function submitSellerForm() {
  const user = _sellerUser;

  if (!user || !user.id) {
    showIosModal("Silahkan login terlebih dahulu");
    return;
  }

  const agreement = document.getElementById("seller-agreement");
  if (!agreement?.checked) {
    showIosModal("Setujui syarat & ketentuan terlebih dahulu");
    return;
  }

  const email = document.getElementById("business-email").value.trim();
  if (!email.endsWith("@gmail.com")) {
    showIosModal("Email harus menggunakan akhiran @gmail.com");
    return;
  }

  const waInput = document.getElementById("whatsapp").value.trim();
  if (waInput.length < 10 || waInput.length > 12) {
    showIosModal("Nomor WhatsApp harus antara 10 sampai 12 digit");
    return;
  }

  const logo = document.getElementById("logo-file")?.files[0];
  const banner = document.getElementById("banner-file")?.files[0];
  const ktp = document.getElementById("ktp-file")?.files[0];
  const selfie = document.getElementById("selfie-file")?.files[0];
  const npwp = document.getElementById("npwp-file")?.files[0];

  if (!logo) return showIosModal("Logo toko wajib diupload");
  if (!banner) return showIosModal("Banner toko wajib diupload");
  if (!ktp) return showIosModal("Foto KTP wajib diupload");
  if (!selfie) return showIosModal("Selfie KTP wajib diupload");

  const submitBtn = document.getElementById("submit-seller-btn");
  if (!submitBtn) return;

  submitBtn.disabled = true;
  submitBtn.innerText = "MENGIRIM...";
  submitBtn.classList.add("opacity-50", "cursor-not-allowed");

  const finalWa = waInput.startsWith("0")
    ? "62" + waInput.slice(1)
    : "62" + waInput;

  const formData = new FormData();

  formData.append("user_id", user.id);
  formData.append(
    "store_name",
    document.getElementById("store-name").value.trim(),
  );
  formData.append(
    "store_slug",
    document.getElementById("store-slug").value.trim(),
  );
  formData.append("business_email", email);
  formData.append("whatsapp", finalWa);
  formData.append("city", document.getElementById("city").value.trim());
  formData.append("address", document.getElementById("address").value.trim());
  formData.append("bank_name", document.getElementById("bank-name").value);
  formData.append(
    "bank_account",
    document.getElementById("bank-account").value.trim(),
  );
  formData.append(
    "store_description",
    document.getElementById("store-description").value.trim(),
  );

  formData.append("logo", logo);
  formData.append("banner", banner);
  formData.append("ktp", ktp);
  formData.append("selfie", selfie);

  if (npwp) formData.append("npwp", npwp);

  try {
    const res = await fetch("/api/seller/register", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      showIosModal("Pendaftaran seller berhasil dikirim");

      document.getElementById("status-store-name").innerText =
        document.getElementById("store-name").value;
      document.getElementById("status-store-slug").innerText =
        document.getElementById("store-slug").value;
      document.getElementById("status-email").innerText = email;
      document.getElementById("status-whatsapp").innerText = finalWa;

      document.getElementById("seller-form-wrapper").classList.add("hidden");
      document
        .getElementById("seller-status-wrapper")
        .classList.remove("hidden");
      localStorage.setItem(STORAGE_KEYS.SELLER_STATUS, "pending");
      setTimeout(function () {
        window.location.href = "/seller/AppNorthSellerDashboard";
      }, 1500);
    } else {
      resetButton();
      showIosModal(data.message || "Gagal mengirim data");
    }
  } catch (err) {
    resetButton();
    showIosModal("Server sedang sibuk");
  }
}

function resetButton() {
  const submitBtn = document.getElementById("submit-seller-btn");
  if (!submitBtn) return;

  submitBtn.disabled = false;
  submitBtn.innerText = "SUBMIT SEMUA DATA";
  submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
}

function validateSellerForm() {
  const requiredFields = [
    "store-name",
    "store-slug",
    "business-email",
    "whatsapp",
    "city",
    "address",
    "bank-name",
    "bank-account",
    "store-description",
  ];

  const btn = document.getElementById("submit-seller-btn");
  const agreement = document.getElementById("seller-agreement");
  const MAX_SIZE = 1 * 1024 * 1024;

  const getFile = (id) => {
    const el = document.getElementById(id);

    if (!el || !el.files || el.files.length === 0) {
      return false;
    }

    const file = el.files[0];

    if (file.size > MAX_SIZE) {
      showIosModal("File terlalu besar", "Maksimal ukuran gambar adalah 1MB");
      el.value = "";

      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        label.innerText = "+ UPLOAD";
        label.classList.remove("bg-green-100", "text-green-700");
      }
      return false;
    }

    return true;
  };

  const logo = getFile("logo-file");
  const banner = getFile("banner-file");
  const ktp = getFile("ktp-file");
  const selfie = getFile("selfie-file");

  const textValid = requiredFields.every((id) => {
    const el = document.getElementById(id);
    return el && el.value && el.value.trim().length > 0;
  });

  const filesValid = logo && banner && ktp && selfie;
  const agreementValid = !!agreement?.checked;

  const valid = Boolean(textValid && filesValid && agreementValid);

  if (btn) {
    btn.disabled = !valid;
    btn.classList.toggle("opacity-50", !valid);
    btn.classList.toggle("cursor-not-allowed", !valid);
  }
}

async function loadSellerData() {
  const user = _sellerUser;
  if (!user?.id) return;
  try {
    const response = await fetch(`/api/seller/status/${user.id}`);
    if (response.status === 404) {
      return;
    }
    const data = await response.json();
    if (!data.success || !data.seller) {
      return;
    }
    const s = data.seller;
    document.getElementById("seller-form-wrapper")?.classList.add("hidden");
    if (s.status === "approved") {
      document.getElementById("seller-status-wrapper")?.classList.add("hidden");
      document.getElementById("seller-form-wrapper")?.classList.add("hidden");
      document.title = "Northline Seller Center | Dashboard Penjual";
      window.location.href = "/seller/AppNorthSellerDashboard";
      return;
    } else {
      document
        .getElementById("seller-status-wrapper")
        ?.classList.remove("hidden");
      document.getElementById("status-store-name").innerText = s.store_name;
      document.getElementById("status-store-slug").innerText = s.store_slug;
      document.getElementById("status-email").innerText = s.business_email;
      document.getElementById("status-whatsapp").innerText = s.whatsapp;
      const badge = document.getElementById("seller-status-badge");
      if (badge) {
        badge.innerText =
          s.status === "rejected" ? "DITOLAK" : "MENUNGGU VERIFIKASI";
      }
    }
  } catch (err) {
    console.error("Gagal memuat data seller:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
});

function showIosModal(title, message = "") {
  const modal = document.getElementById("ios-warning-modal");
  const box = document.getElementById("ios-modal-box");

  document.getElementById("ios-modal-title").textContent = title;
  document.getElementById("ios-modal-message").textContent = message;

  modal.classList.remove("hidden");

  setTimeout(() => {
    modal.classList.remove("opacity-0");
    box.classList.remove("scale-95");
    box.classList.add("scale-100");
  }, 10);
}

function closeIosModal() {
  const modal = document.getElementById("ios-warning-modal");
  const box = document.getElementById("ios-modal-box");

  modal.classList.add("opacity-0");

  box.classList.remove("scale-100");
  box.classList.add("scale-95");

  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);
}

const indonesiaCities = [
  "Kab Karawang",
  "Kota Bekasi",
  "Kab Bekasi",
  "Kota Bandung",
  "Kab Bandung",
  "Kab Bandung Barat",
  "Kota Cimahi",
  "Kab Purwakarta",
  "Kab Subang",
  "Kab Cirebon",
  "Kota Cirebon",
  "Kab Indramayu",
  "Kab Majalengka",
  "Kab Sumedang",
  "Kab Garut",
  "Kab Tasikmalaya",
  "Kota Tasikmalaya",
  "Kab Ciamis",
  "Kab Pangandaran",
  "Kab Kuningan",
  "Kab Bogor",
  "Kota Bogor",
  "Kab Sukabumi",
  "Kota Sukabumi",
  "Kab Cianjur",
  "Kota Depok",
  "Kota Jakarta Pusat",
  "Kota Jakarta Barat",
  "Kota Jakarta Timur",
  "Kota Jakarta Selatan",
  "Kota Jakarta Utara",
  "Kab Kepulauan Seribu",
  "Kota Tangerang",
  "Kab Tangerang",
  "Kota Tangerang Selatan",
  "Kota Serang",
  "Kab Serang",
  "Kota Cilegon",
  "Kab Lebak",
  "Kab Pandeglang",
  "Kota Semarang",
  "Kab Semarang",
  "Kota Surabaya",
  "Kab Sidoarjo",
  "Kab Gresik",
  "Kota Malang",
  "Kab Malang",
  "Kota Yogyakarta",
  "Kab Sleman",
  "Kab Bantul",
  "Kab Kulon Progo",
  "Kab Gunungkidul",
  "Kota Medan",
  "Kota Palembang",
  "Kota Pekanbaru",
  "Kota Batam",
  "Kota Padang",
  "Kota Bandar Lampung",
  "Kota Pontianak",
  "Kota Banjarmasin",
  "Kota Samarinda",
  "Kota Balikpapan",
  "Kota Makassar",
  "Kota Manado",
  "Kota Denpasar",
  "Kota Mataram",
  "Kota Kupang",
  "Kota Jayapura",
];

function setupUpload(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (!input || !label) {
    return;
  }

  input.addEventListener("change", function () {
    if (!this.files.length) return;

    if (!label.dataset.originalText) {
      label.dataset.originalText = label.innerText;
    }

    label.innerText = "BERHASIL";

    validateSellerForm();
  });
}

async function openDocumentModal() {
  const user = _sellerUser;
  if (!user) return;

  try {
    const response = await fetch(`/api/seller/status/${user.id}`);
    const data = await response.json();

    if (data.success && data.seller) {
      const s = data.seller;
      const content = document.getElementById("document-content");

      content.innerHTML = `
    <div class="bg-white border shadow-sm text-[11px] md:text-sm">

        <div class="border-b px-3 md:px-6 py-3 md:py-5">
            <div class="flex items-center gap-2 md:gap-3">

                ${
                  s.logo_url
                    ? `<img
                        src="/uploads/seller/logo/${s.logo_url}"
                        class="w-10 h-10 md:w-14 md:h-14 object-cover border"
                    >`
                    : ""
                }

                <div>
                    <h2 class="font-bold text-sm md:text-lg text-gray-900">
                        Dokumen Pendaftaran Seller
                    </h2>

                    <p class="text-[10px] md:text-xs text-gray-500">
                        Northline Marketplace
                    </p>
                </div>

            </div>
        </div>

        <div class="px-3 md:px-6 py-3 md:py-5">

            <div class="mb-4 md:mb-6">
                <h3 class="font-bold text-gray-900 mb-2 md:mb-3 text-xs md:text-base">
                    Informasi Toko
                </h3>

                <div class="overflow-x-auto">
                    <table class="w-full border text-[10px] md:text-sm">
                        <tbody>

                            <tr class="border-b">
                                <td class="w-24 md:w-40 bg-gray-50 p-1.5 md:p-2 font-medium">
                                    Nama Toko
                                </td>
                                <td class="p-1.5 md:p-2 break-all">
                                    ${s.store_name || "-"}
                                </td>
                            </tr>

                            <tr class="border-b">
                                <td class="bg-gray-50 p-1.5 md:p-2 font-medium">
                                    Username
                                </td>
                                <td class="p-1.5 md:p-2 break-all">
                                    ${s.store_slug || "-"}
                                </td>
                            </tr>

                            <tr class="border-b">
                                <td class="bg-gray-50 p-1.5 md:p-2 font-medium">
                                    Email Bisnis
                                </td>
                                <td class="p-1.5 md:p-2 break-all">
                                    ${s.business_email || "-"}
                                </td>
                            </tr>

                            <tr class="border-b">
                                <td class="bg-gray-50 p-1.5 md:p-2 font-medium">
                                    WhatsApp
                                </td>
                                <td class="p-1.5 md:p-2 break-all">
                                    ${s.whatsapp || "-"}
                                </td>
                            </tr>

                            <tr>
                                <td class="bg-gray-50 p-1.5 md:p-2 font-medium">
                                    Alamat
                                </td>
                                <td class="p-1.5 md:p-2 break-words">
                                    ${s.address || "-"}
                                </td>
                            </tr>

                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mb-4 md:mb-6">
                <h3 class="font-bold text-gray-900 mb-2 md:mb-3 text-xs md:text-base">
                    Informasi Rekening
                </h3>

                <div class="overflow-x-auto">
                    <table class="w-full border text-[10px] md:text-sm">
                        <tbody>

                            <tr class="border-b">
                                <td class="w-24 md:w-40 bg-gray-50 p-1.5 md:p-2 font-medium">
                                    Nama Bank
                                </td>
                                <td class="p-1.5 md:p-2 break-all">
                                    ${s.bank_name || "-"}
                                </td>
                            </tr>

                            <tr>
                                <td class="bg-gray-50 p-1.5 md:p-2 font-medium">
                                    Nomor Rekening
                                </td>
                                <td class="p-1.5 md:p-2 break-all">
                                    ${s.bank_account || "-"}
                                </td>
                            </tr>

                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <h3 class="font-bold text-gray-900 mb-2 md:mb-3 text-xs md:text-base">
                    Dokumen Pendukung
                </h3>

                <div class="grid grid-cols-2 gap-2 md:gap-4">

                    ${
                      s.logo_url
                        ? `
                        <div>
                            <p class="text-[10px] md:text-xs font-medium mb-1">
                                Logo Toko
                            </p>

                            <img
                                src="/uploads/seller/logo/${s.logo_url}"
                                class="w-full h-24 md:h-40 object-cover border"
                            >
                        </div>
                        `
                        : ""
                    }

                    ${
                      s.banner_url
                        ? `
                        <div>
                            <p class="text-[10px] md:text-xs font-medium mb-1">
                                Banner Toko
                            </p>

                            <img
                                src="/uploads/seller/banner/${s.banner_url}"
                                class="w-full h-24 md:h-40 object-cover border"
                            >
                        </div>
                        `
                        : ""
                    }

                    ${
                      s.ktp_url
                        ? `
                        <div>
                            <p class="text-[10px] md:text-xs font-medium mb-1">
                                KTP/KP
                            </p>

                            <img
                                src="/uploads/seller/ktp/${s.ktp_url}"
                                class="w-full h-24 md:h-40 object-cover border"
                            >
                        </div>
                        `
                        : ""
                    }

                    ${
                      s.npwp_url
                        ? `
                        <div>
                            <p class="text-[10px] md:text-xs font-medium mb-1">
                                NPWP
                            </p>

                            <img
                                src="/uploads/seller/npwp/${s.npwp_url}"
                                class="w-full h-24 md:h-40 object-cover border"
                            >
                        </div>
                        `
                        : ""
                    }

                </div>
            </div>

            <div class="mt-4 md:mt-6 pt-3 md:pt-4 border-t">
                <div class="flex items-center justify-between text-[10px] md:text-xs text-gray-500">

                    <span>
                        Status Verifikasi:
                        <strong class="text-[#DF414F]">
                            ${(s.status || "Pending").toUpperCase()}
                        </strong>
                    </span>

                    <span>
                        ${
                          s.created_at
                            ? new Date(s.created_at).toLocaleDateString("id-ID")
                            : ""
                        }
                    </span>

                </div>
            </div>

        </div>

    </div>
    `;

      document.getElementById("document-modal").classList.remove("hidden");
    }
  } catch (err) {
    showIosModal("Gagal memuat dokumen");
  }
}

async function loadSellerHeader() {
  const user = _sellerUser;
  if (!user) return;
  try {
    const res = await fetch(`/api/seller/status/${user.id}`);
    const data = await res.json();
    if (!data.success) return;
    const s = data.seller;
    document.getElementById("seller-profile-name").textContent =
      s.store_name || "Northline Store";
    document.getElementById("seller-profile-username").textContent =
      `@${s.store_slug || "seller"}`;
    if (s.logo_url) {
      document.getElementById("seller-profile-logo").src =
        `/uploads/seller/logo/${s.logo_url}`;
    }
  } catch (err) {
    console.error(err);
  }
}

loadSellerHeader();

window.addEventListener("load", () => {
  setupUpload("logo-file", "logo-upload-label");
  setupUpload("banner-file", "banner-upload-label");
  setupUpload("product-main-file", "product-main-upload-label");
  setupUpload("product-detail-file", "product-detail-upload-label");
  setupUpload("product-additional-file", "product-additional-upload-label");

  validateSellerForm();
});

document.addEventListener("DOMContentLoaded", () => {
  window.updateAuthUI();

  const citySelect = document.getElementById("city");
  if (citySelect) {
    indonesiaCities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      citySelect.appendChild(option);
    });
  }

  const status = localStorage.getItem(STORAGE_KEYS.SELLER_STATUS);
  if (status === "pending") {
    document.getElementById("seller-form-wrapper")?.classList.add("hidden");
    document
      .getElementById("seller-status-wrapper")
      ?.classList.remove("hidden");
  }

  const submitBtn = document.getElementById("submit-seller-btn");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitSellerForm);
  }

  document.querySelectorAll("input, textarea, select").forEach((el) => {
    el.addEventListener("input", validateSellerForm);
    el.addEventListener("change", validateSellerForm);
  });

  validateSellerForm();
});

window.addEventListener("load", () => {
  setTimeout(() => {
    validateSellerForm();
  }, 50);
});

document.addEventListener("DOMContentLoaded", () => {
  loadSellerData();
});
