let currentQrUrl = "";
let lastToken = "";

function showQr(name, nis, token) {
  const initials = name
    .split(" ")
    .map((v) => v[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(token)}`;
  currentQrUrl = qrUrl;

  document.getElementById("qr-initials").innerText = initials;
  document.getElementById("qr-name").innerText = name;
  document.getElementById("qr-nis").innerText = `NIS ${nis}`;
  document.getElementById("qr-image").src = qrUrl;
  document.getElementById("qr-modal").classList.remove("hidden");
}

function closeQr() {
  document.getElementById("qr-modal").classList.add("hidden");
}

function downloadQr() {
  const a = document.createElement("a");
  a.href = currentQrUrl;
  a.download = "qr-siswa.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function showScanModal(student, already) {
  const modal = document.getElementById("scan-success-modal");
  const icon = document.getElementById("scan-status-icon");
  const title = document.getElementById("scan-status-title");

  document.getElementById("scan-student-name").innerText = student.name;
  document.getElementById("scan-student-nis").innerText = `NIS ${student.nis}`;

  if (already) {
    icon.className =
      "w-20 h-20 mx-auto rounded-full bg-orange-100 flex items-center justify-center";
    icon.innerHTML = `
            <img
                src="https://img.icons8.com/?size=100&id=61012&format=png&color=EA580C"
                class="w-10 h-10">
        `;
    title.innerText = "Sudah Hadir Hari Ini";
  } else {
    icon.className =
      "w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center";
    icon.innerHTML = `
            <img
                src="https://img.icons8.com/?size=100&id=82769&format=png&color=16A34A"
                class="w-10 h-10">
        `;
    title.innerText = "Absensi Berhasil";
  }
  modal.classList.remove("hidden");
}

function closeScanModal() {
  document.getElementById("scan-success-modal").classList.add("hidden");

  setTimeout(() => {
    lastToken = "";
  }, 1500);
}
