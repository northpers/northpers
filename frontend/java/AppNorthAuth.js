function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

const slidesData = [
  {
    imgSrc: "/public/image/Model 10.webp",
    bgClass: "bg-stone-50",
    description: "Special Offer: First 10 Customers Get 10% Off Instantly!",
  },
  {
    imgSrc: "/public/image/Model 11.webp",
    bgClass: "bg-stone-50",
    description:
      "Exclusive Bundle: Save IDR133.000 On All Matching Swimsets Today!",
  },
  {
    imgSrc: "/public/image/Model 12.webp",
    bgClass: "bg-stone-50",
    description:
      "Weekend Sale: Enjoy Extra 5% Off Across All Swimwear Collections.",
  },
  {
    imgSrc: "/public/image/Model 13.webp",
    bgClass: "bg-stone-50",
    description:
      "Flash Sale: Limited 10% Discount Active Daily From 12 PM - 1 PM Only!",
  },
  {
    imgSrc: "/public/image/Model 18.jpeg",
    bgClass: "bg-stone-50",
    description:
      "Join The Northline: Sign Up Now For An Additional 5% Off Your First Order!",
  },
];

let currentSlideIdx = 0;
const slideIntervalTime = 4000;

const carouselContainer = document.getElementById("carousel-container");
const carouselImg = document.getElementById("carousel-img");
const carouselDesc = document.getElementById("carousel-desc");
const carouselDotsContainer = document.getElementById("carousel-dots");

let otpTimeLeft = 60;
let otpInterval;

function startOtpTimer() {
  clearInterval(otpInterval);
  const timerEl = document.getElementById("timer");
  const timerWrapper = document.getElementById("otp-timer-wrapper");
  const resendBtn = document.getElementById("resend-otp-btn");
  otpTimeLeft = 60;
  resendBtn.classList.add("hidden");
  timerWrapper.classList.remove("hidden");
  otpInterval = setInterval(() => {
    otpTimeLeft--;
    timerEl.innerText = otpTimeLeft;
    if (otpTimeLeft <= 0) {
      clearInterval(otpInterval);
      timerWrapper.classList.add("hidden");
      resendBtn.classList.remove("hidden");
    }
  }, 1000);
}

const passwordInput = document.getElementById("login-password");
const togglePassword = document.getElementById("toggle-password");
const eyeIcon = document.getElementById("eye-icon");

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  eyeIcon.src = isPassword
    ? "https://img.icons8.com/material-rounded/24/666666/hide.png"
    : "https://img.icons8.com/material-outlined/24/666666/visible--v1.png";
});

const toggleRegisterPassword = document.getElementById(
  "toggle-register-password",
);
const registerPasswordInput = document.getElementById("reg-password");
const registerEyeIcon = document.getElementById("register-eye-icon");

toggleRegisterPassword.addEventListener("click", () => {
  const isPassword = registerPasswordInput.type === "password";
  registerPasswordInput.type = isPassword ? "text" : "password";
  registerEyeIcon.src = isPassword
    ? "https://img.icons8.com/material-outlined/24/666666/invisible.png"
    : "https://img.icons8.com/material-outlined/24/666666/visible--v1.png";
});

async function handleResendOtp() {
  const resendBtn = document.getElementById("resend-otp-btn");
  resendBtn.disabled = true;
  resendBtn.innerText = "Sending...";
  try {
    const response = await fetch(_d('9kzs9k ~r9}oxn7y~z7yxv$'), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: userPhoneNumber,
      }),
    });
    const result = await response.json();
    if (result.success) {
      showIosModal("OTP berhasil dikirim ulang!");
      resendBtn.disabled = false;
      resendBtn.innerText = "Resend OTP";
      startOtpTimer();
    } else {
      showIosModal(result.message || "Gagal resend OTP");
      resendBtn.disabled = false;
      resendBtn.innerText = "Resend OTP";
    }
  } catch (err) {
    console.error(err);
    showIosModal("Server sedang sibuk");
    resendBtn.disabled = false;
    resendBtn.innerText = "Resend OTP";
  }
}

function initCarousel() {
  if (
    !carouselContainer ||
    !carouselImg ||
    !carouselDesc ||
    !carouselDotsContainer
  )
    return;

  carouselDotsContainer.innerHTML = "";

  slidesData.forEach((_, idx) => {
    const dot = document.createElement("button");
    dot.className = `w-1.5 h-1.5 rounded-full transition-all duration-300 ${idx === 0 ? "bg-black w-4" : "bg-black/30"}`;
    dot.addEventListener("click", () => changeSlide(idx));
    carouselDotsContainer.appendChild(dot);
  });

  updateSlideUI();
  setInterval(autoSlide, slideIntervalTime);
}

function updateSlideUI() {
  const currentSlide = slidesData[currentSlideIdx];

  carouselImg.src = currentSlide.imgSrc;
  carouselDesc.textContent = currentSlide.description;

  slidesData.forEach((slide) => {
    if (slide.bgClass) carouselContainer.classList.remove(slide.bgClass);
  });
  if (currentSlide.bgClass)
    carouselContainer.classList.add(currentSlide.bgClass);

  const dots = carouselDotsContainer.children;
  for (let i = 0; i < dots.length; i++) {
    if (i === currentSlideIdx) {
      dots[i].classList.remove("bg-black/30");
      dots[i].classList.add("bg-black", "w-4");
    } else {
      dots[i].classList.remove("bg-black", "w-4");
      dots[i].classList.add("bg-black/30");
    }
  }
}

function changeSlide(index) {
  currentSlideIdx = index;
  updateSlideUI();
}

function autoSlide() {
  currentSlideIdx = (currentSlideIdx + 1) % slidesData.length;
  updateSlideUI();
}

let userPhoneNumber = "";

function authRedirectPath(fallback) {
  try {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) return r;
  } catch (e) {}
  return fallback || "/AppNorthAccount";
}

function switchAuthPanel(panelName) {
  const panels = [
    "login-classic",
    "register-phone",
    "otp",
    "confirm-account",
    "register-fields",
  ];
  panels.forEach((p) =>
    document.getElementById(`panel-${p}`).classList.add("hidden"),
  );

  document.getElementById(`panel-${panelName}`).classList.remove("hidden");
}

async function handleClassicLogin(e) {
  e.preventDefault();
  let identifier = document.getElementById("login-identifier").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!identifier || !password) {
    showIosModal("Email atau Nomor HP dan Password wajib diisi!");
    return;
  }
  const isNumeric = /^[0-9]+$/.test(identifier);
  if (isNumeric) {
    if (identifier.startsWith("0")) {
      identifier = "62" + identifier.slice(1);
    } else if (identifier.startsWith("+62")) {
      identifier = identifier.replace("+", "");
    }
  }
  const loginBtn = document.getElementById("btn-login-classic");
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.innerText = "LOGGING IN...";
  }
  try {
    const response = await fetch(_d('9kzs9k ~r9vyqsx'), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: identifier, password: password }),
    });
    const result = await response.json();
    if (response.ok) {
      showIosModal("Login berhasil! Mengalihkan...");
      setTimeout(function() {
        window.location.href = authRedirectPath();
      }, 300);
    } else {
      showIosModal(result.message || "Email/Nomor HP atau Password salah!");
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerText = "LOG IN";
      }
    }
  } catch (err) {
    console.error("Login Error:", err);
    showIosModal("Gagal terhubung ke server. Periksa koneksi internet kamu.");
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerText = "LOG IN";
    }
  }
}

async function openQrLoginModal() {
  document.getElementById("qr-login-modal").classList.remove("hidden");
  const response = await fetch(_d('9kzs9k ~r9m|ok~o7vyqsx7{|'), { credentials: "same-origin" });
  const result = await response.json();
  const qrBox = document.getElementById("qr-login-code");
  qrBox.innerHTML = "";
  new QRCode(qrBox, {
    text: result.sessionId,
    width: 240,
    height: 240,
  });
  startQrCountdown();
}

async function generateLoginQr() {
  const response = await fetch(_d('9kzs9k ~r9m|ok~o7vyqsx7{|'), { credentials: "same-origin" });
  const result = await response.json();
  const qrBox = document.getElementById("qr-login-code");
  qrBox.innerHTML = "";
  new QRCode(qrBox, {
    text: result.sessionId,
    width: 240,
    height: 240,
  });
}

function closeQrLoginModal() {
  const modal = document.getElementById("qr-login-modal");
  modal.classList.add("hidden");
  clearInterval(qrTimer);
}

let qrTimer;
function startQrCountdown() {
  let time = 60;
  document.getElementById("qr-countdown").textContent = time;
  clearInterval(qrTimer);
  qrTimer = setInterval(async () => {
    time--;
    document.getElementById("qr-countdown").textContent = time;
    if (time <= 0) {
      clearInterval(qrTimer);
      await generateLoginQr();
      startQrCountdown();
    }
  }, 1000);
}

function backToPasswordLogin() {
  closeQrLoginModal();
  const loginPanel = document.getElementById("panel-login-classic");
  if (loginPanel) {
    loginPanel.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
  setTimeout(() => {
    document.getElementById("login-identifier")?.focus();
  }, 300);
}

async function handleSendOtp(e) {
  e.preventDefault();
  userPhoneNumber = document.getElementById("auth-phone").value.trim();

  try {
    const response = await fetch(_d('9kzs9k ~r9}oxn7y~z7yxv$'), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: userPhoneNumber }),
    });

    if (response.ok) {
      document.getElementById("display-phone").innerText = userPhoneNumber;
      switchAuthPanel("otp");
      startOtpTimer();
    } else {
      let serverMsg = "";
      try {
        const j = await response.json();
        serverMsg = j && j.message ? j.message : "";
      } catch (e) {}
      showIosModal(serverMsg || "Pastikan no kamu sudah benar!");
    }
  } catch (err) {
    console.error(err);
  }
}

function moveOtpFocus(input, index) {
  if (input.value.length === 1 && index < 5) {
    document.getElementById("otp-inputs").children[index + 1].focus();
  }
}
function handleOtpDelete(e, index) {
  if (e.key === "Backspace" && !e.target.value && index > 0) {
    document.getElementById("otp-inputs").children[index - 1].focus();
  }
}

async function handleVerifyOtp() {
  const boxes = document.getElementById("otp-inputs").children;
  let typedOtp = "";
  for (let box of boxes) typedOtp += box.value;

  try {
    const response = await fetch(_d('9kzs9k ~r9!o|sp$7y~z'), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: userPhoneNumber, otpCode: typedOtp }),
    });
    const result = await response.json();

    if (response.ok) {
      if (result.isRegistered && result.user) {
        document.getElementById("db-username").innerText = result.user.username;
        document.getElementById("db-phone").innerText =
          result.user.phone || userPhoneNumber;

        if (result.user.avatar) {
          document.getElementById("db-avatar").src = result.user.avatar;
        }

        switchAuthPanel("confirm-account");
      } else {
        switchAuthPanel("register-fields");
      }
    } else {
      showIosModal(result.message || "Kode OTP salah!");
    }
  } catch (err) {
    console.error("Error verifikasi OTP:", err);
  }
}

async function loginVerifiedUser() {
  await handleLoginVerifiedUserWithMigration();
}

async function handleFinalRegister(e) {
  e.preventDefault();
  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value.trim();

  if (!username || !email || !password) {
    showIosModal("Semua field wajib diisi!");
    return;
  }

  const guestTokenEntries = typeof window.getGuestOrderAccessEntries === 'function'
    ? window.getGuestOrderAccessEntries()
    : [];
  const hasGuestOrders = guestTokenEntries.length > 0;

  let guestOrderMigration = null;
  if (hasGuestOrders) {
    guestOrderMigration = confirm(
      "Kami menemukan pesanan guest yang masih tertaut. Ingin memindahkan pesanan tersebut ke akun baru ini?"
    ) ? "move" : "skip";
  }

  try {
    const response = await fetch(_d('9kzs9k ~r9|oqs}~o|7mywzvo~o'), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        email: email,
        password: password,
        phone: userPhoneNumber,
        guestOrderMigration,
        guestOrderTokens: guestTokenEntries.map((entry) => entry.token),
      }),
    });

    const result = await response.json();

    if (response.ok) {
      if (result.guestMigrationMessage) {
        showIosModal(result.guestMigrationMessage);
      } else {
        showIosModal(
          "Akun sukses dibikin dan otomatis masuk! Menuju beranda utama",
        );
      }
      setTimeout(() => {
        window.location.href = authRedirectPath("/index");
      }, 500);
    } else {
      showIosModal(result.message || "Gagal membuat akun!");
    }
  } catch (err) {
    console.error("Register Error:", err);
    showIosModal("Server sedang sibuk!");
  }
}

async function handleLoginVerifiedUserWithMigration() {
  try {
    const guestTokenEntries = typeof window.getGuestOrderAccessEntries === 'function'
      ? window.getGuestOrderAccessEntries()
      : [];
    const hasGuestOrders = guestTokenEntries.length > 0;

    let guestOrderMigration = null;
    if (hasGuestOrders) {
      guestOrderMigration = confirm(
        "Terdapat pesanan guest yang belum dipindahkan. Pindahkan pesanan ke akun ini sekarang?"
      ) ? "move" : "skip";
    }

    const response = await fetch(_d('9kzs9k ~r9vyqsx7y~z7} mmo}}'), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: userPhoneNumber,
        guestOrderMigration,
        guestOrderTokens: guestTokenEntries.map((entry) => entry.token),
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      if (result.guestMigrationMessage) {
        showIosModal(result.guestMigrationMessage);
      } else {
        showIosModal(result.message);
      }
      window.location.href = authRedirectPath("/index");
    } else {
      showIosModal(result.message || "Gagal login otomatis!");
    }
  } catch (err) {
    console.error("Error bypass login:", err);
    showIosModal("Server sedang sibuk!");
  }
}

function updateButtonState(buttonId, isFormValid) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  if (isFormValid) {
    btn.disabled = false;
    btn.classList.remove("opacity-40", "cursor-not-allowed");
    btn.classList.add(
      "opacity-100",
      "cursor-pointer",
      "hover:bg-[#f76d79de]",
      "active:scale-[0.98]",
    );
  } else {
    btn.disabled = true;
    btn.classList.remove(
      "opacity-100",
      "cursor-pointer",
      "hover:bg-[#f76d79de]",
      "active:scale-[0.98]",
    );
    btn.classList.add("opacity-40", "cursor-not-allowed");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("form-login-classic");
  if (loginForm) {
    loginForm.addEventListener("input", () => {
      const idVal = document.getElementById("login-identifier").value.trim();
      const passVal = document.getElementById("login-password").value.trim();
      updateButtonState("btn-login-classic", idVal !== "" && passVal !== "");
    });
  }

  const regPhoneForm = document.getElementById("form-register-phone");
  if (regPhoneForm) {
    regPhoneForm.addEventListener("input", () => {
      const phoneVal = document.getElementById("auth-phone").value.trim();
      updateButtonState(
        "btn-register-phone",
        phoneVal !== "" && phoneVal !== "+62",
      );
    });
  }

  const regFieldsForm = document.getElementById("form-register-fields");
  if (regFieldsForm) {
    regFieldsForm.addEventListener("input", () => {
      const nameVal = document.getElementById("reg-username").value.trim();
      const emailVal = document.getElementById("reg-email").value.trim();
      const passVal = document.getElementById("reg-password").value.trim();

      const isValid = nameVal !== "" && emailVal !== "" && passVal !== "";
      updateButtonState("btn-register-complete", isValid);
    });
  }
});

const originalMoveOtpFocus = moveOtpFocus;
moveOtpFocus = function (input, index) {
  if (input.value.length === 1 && index < 5) {
    document.getElementById("otp-inputs").children[index + 1].focus();
  }

  const boxes = document.getElementById("otp-inputs").children;
  let typedOtp = "";
  for (let box of boxes) typedOtp += box.value.trim();

  updateButtonState("btn-otp-submit", typedOtp.length === 6);
};

const LEGAL_DATA = {
  terms: {
    title: "Syarat & Ketentuan",
    content: `
            <div class="space-y-6 text-sm leading-relaxed text-gray-700">

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        1. Pendahuluan
                    </h3>
                    <p>
                        Selamat datang di Northline Marketplace ("Northline").
                        Dengan mengakses, mendaftar, atau menggunakan layanan
                        Northline Marketplace, Anda menyatakan telah membaca,
                        memahami, dan menyetujui seluruh Syarat & Ketentuan ini.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        2. Definisi
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li><b>Platform</b> adalah Northline Marketplace.</li>
                        <li><b>Pengguna</b> adalah seluruh pihak yang mengakses layanan.</li>
                        <li><b>Penjual</b> adalah pengguna yang telah terverifikasi untuk menjual produk.</li>
                        <li><b>Pembeli</b> adalah pengguna yang melakukan transaksi pembelian.</li>
                        <li><b>Produk</b> adalah barang atau jasa yang ditawarkan melalui platform.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        3. Akun Pengguna
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Pengguna wajib memberikan data yang benar dan akurat.</li>
                        <li>Pengguna bertanggung jawab atas keamanan akun dan kata sandi.</li>
                        <li>Dilarang membagikan akun kepada pihak lain.</li>
                        <li>Northline berhak menonaktifkan akun yang terbukti melanggar ketentuan.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        4. Verifikasi Penjual
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Penjual wajib mengunggah identitas resmi yang valid.</li>
                        <li>Northline berhak melakukan verifikasi tambahan kapan saja.</li>
                        <li>Pemalsuan dokumen akan menyebabkan penolakan atau penutupan akun permanen.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        5. Produk Terlarang
                    </h3>

                    <p>
                        Dilarang menjual produk yang melanggar hukum atau peraturan
                        yang berlaku di Indonesia, termasuk namun tidak terbatas pada:
                    </p>

                    <ul class="list-disc pl-5 mt-2 space-y-1">
                        <li>Narkotika dan zat terlarang.</li>
                        <li>Senjata api dan bahan peledak.</li>
                        <li>Produk hasil pelanggaran hak cipta.</li>
                        <li>Dokumen palsu.</li>
                        <li>Barang hasil tindak pidana.</li>
                        <li>Produk yang membahayakan keselamatan publik.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        6. Hak dan Kewajiban Penjual
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Menyediakan informasi produk yang benar dan lengkap.</li>
                        <li>Mengirimkan pesanan sesuai deskripsi.</li>
                        <li>Menjaga kualitas pelayanan pelanggan.</li>
                        <li>Bertanggung jawab atas stok dan keaslian produk.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        7. Hak dan Kewajiban Pembeli
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Memberikan data pengiriman yang benar.</li>
                        <li>Melakukan pembayaran sesuai nominal transaksi.</li>
                        <li>Menggunakan fitur komplain secara wajar.</li>
                        <li>Berhak memperoleh produk sesuai deskripsi.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        8. Transaksi dan Pembayaran
                    </h3>

                    <p>
                        Semua transaksi harus dilakukan melalui sistem pembayaran
                        resmi Northline Marketplace. Transaksi di luar platform
                        sepenuhnya menjadi tanggung jawab pengguna.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        9. Pengiriman
                    </h3>

                    <p>
                        Penjual wajib memproses pesanan dalam batas waktu yang
                        ditentukan. Keterlambatan berulang dapat mengakibatkan
                        pembatasan fitur atau penonaktifan akun.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        10. Refund dan Sengketa
                    </h3>

                    <p>
                        Northline menyediakan mekanisme penyelesaian sengketa antara
                        pembeli dan penjual. Keputusan hasil investigasi Northline
                        bersifat final sesuai bukti yang tersedia.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        11. Biaya Platform
                    </h3>

                    <p>
                        Northline dapat mengenakan biaya layanan, biaya transaksi,
                        atau komisi tertentu kepada penjual sesuai kebijakan yang
                        berlaku dan dapat diperbarui sewaktu-waktu.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        12. Kekayaan Intelektual
                    </h3>

                    <p>
                        Seluruh merek, logo, desain, sistem, dan konten milik
                        Northline dilindungi oleh hukum hak cipta dan kekayaan
                        intelektual yang berlaku.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        13. Penangguhan Akun
                    </h3>

                    <p>
                        Northline berhak membatasi, menangguhkan, atau menghapus akun
                        yang terbukti melakukan pelanggaran, penyalahgunaan sistem,
                        aktivitas penipuan, atau tindakan yang merugikan pengguna lain.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        14. Perubahan Ketentuan
                    </h3>

                    <p>
                        Northline berhak mengubah Syarat & Ketentuan kapan saja.
                        Perubahan akan berlaku sejak dipublikasikan pada platform.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        15. Persetujuan
                    </h3>

                    <p>
                        Dengan menggunakan layanan Northline Marketplace, pengguna
                        dianggap telah memahami dan menyetujui seluruh isi
                        Syarat & Ketentuan ini.
                    </p>
                </section>

            </div>
            `,
  },

  privacy: {
    title: "Kebijakan Privasi",
    content: `
            <div class="space-y-6 text-sm leading-relaxed text-gray-700">

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        1. Komitmen Privasi
                    </h3>

                    <p>
                        Northline Marketplace berkomitmen untuk melindungi
                        kerahasiaan, keamanan, dan integritas data pribadi pengguna.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        2. Informasi yang Kami Kumpulkan
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Nama lengkap.</li>
                        <li>Alamat email.</li>
                        <li>Nomor telepon.</li>
                        <li>Alamat pengiriman.</li>
                        <li>Informasi rekening bank.</li>
                        <li>Data identitas untuk verifikasi.</li>
                        <li>Riwayat transaksi.</li>
                        <li>Alamat IP dan data perangkat.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        3. Tujuan Penggunaan Data
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Verifikasi akun pengguna.</li>
                        <li>Pemrosesan transaksi.</li>
                        <li>Pencegahan penipuan.</li>
                        <li>Peningkatan layanan platform.</li>
                        <li>Layanan pelanggan.</li>
                        <li>Kepatuhan terhadap peraturan hukum.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        4. Penyimpanan dan Keamanan Data
                    </h3>

                    <p>
                        Kami menerapkan sistem keamanan, enkripsi, pembatasan akses,
                        serta prosedur perlindungan data sesuai standar industri
                        untuk menjaga keamanan informasi pengguna.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        5. Pembagian Data kepada Pihak Ketiga
                    </h3>

                    <p>
                        Data dapat dibagikan kepada mitra pembayaran, penyedia
                        logistik, penyedia layanan teknologi, dan pihak berwenang
                        apabila diwajibkan oleh hukum.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        6. Cookies
                    </h3>

                    <p>
                        Northline menggunakan cookies dan teknologi serupa untuk
                        meningkatkan pengalaman pengguna, analitik, serta keamanan akun.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        7. Hak Pengguna
                    </h3>

                    <ul class="list-disc pl-5 space-y-1">
                        <li>Mengakses data pribadi.</li>
                        <li>Memperbarui data pribadi.</li>
                        <li>Meminta penghapusan data tertentu.</li>
                        <li>Menarik persetujuan penggunaan data sesuai ketentuan hukum.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        8. Penyimpanan Data
                    </h3>

                    <p>
                        Data pengguna dapat tetap disimpan selama akun aktif atau
                        selama diwajibkan oleh peraturan perundang-undangan.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        9. Perubahan Kebijakan Privasi
                    </h3>

                    <p>
                        Northline berhak memperbarui Kebijakan Privasi ini sewaktu-waktu.
                        Perubahan akan diumumkan melalui platform.
                    </p>
                </section>

                <section>
                    <h3 class="font-bold text-gray-900 text-base mb-2">
                        10. Kontak
                    </h3>

                    <p>
                        Jika memiliki pertanyaan terkait privasi dan perlindungan
                        data, silakan hubungi tim dukungan Northline Marketplace.
                    </p>
                </section>

            </div>
            `,
  },
};

function openLegalModal(type) {
  const modal = document.getElementById("legal-modal");
  const titleEl = document.getElementById("modal-title");
  const contentEl = document.getElementById("modal-content");

  titleEl.innerText = LEGAL_DATA[type].title;
  contentEl.innerHTML = LEGAL_DATA[type].content;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLegalModal() {
  document.getElementById("legal-modal").classList.add("hidden");
  document.body.style.overflow = "auto";
}

document.addEventListener("DOMContentLoaded", initCarousel);
