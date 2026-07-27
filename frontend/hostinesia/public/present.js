const pageHistory = [];
let currentPage = "dashboard";

function goBack() {
  if (pageHistory.length === 0) {
    showPage("dashboard");
    return;
  }
  const lastPage = pageHistory.pop();
  showPage(lastPage);
}

function showPage(page) {
  const attendancePage = document.getElementById("attendance-page");
  const studentPage = document.getElementById("student-page");
  if (attendancePage) {
    attendancePage.classList.add("hidden");
  }
  if (studentPage) {
    studentPage.classList.add("hidden");
  }
  if (page === "attendance") {
    attendancePage?.classList.remove("hidden");
  }
  if (page === "student") {
    studentPage?.classList.remove("hidden");
  }
  if (page === "scan") {
    scanPage.classList.remove("hidden");
    if (!window.scannerStarted) {
      startScanner();
      window.scannerStarted = true;
    }
  }
}

function toggleAttendanceSummary() {
  document.getElementById("attendance-summary").classList.toggle("hidden");
  document.getElementById("attendance-arrow").classList.toggle("rotate-180");
}

function updateDate() {
  const now = new Date();
  const options = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  const formattedDate = now.toLocaleDateString("id-ID", options);
  document.getElementById("current-date").textContent = formattedDate;
}
updateDate();

function updateTime() {
  const now = new Date();
  const time = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  document.getElementById("current-time").textContent = time;
}
updateTime();
setInterval(updateTime, 1000);

async function saveStudent() {
  const name = document.getElementById("student-name").value.trim();
  if (!name) {
    alert("Nama siswa wajib diisi");
    return;
  }
  const response = await fetch("/api/students", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
    }),
  });
  const result = await response.json();
  if (result.success) {
    document.getElementById("student-name").value = "";
    await loadStudents();
    alert(`Siswa berhasil ditambahkan\nNIS: ${result.student.nis}`);
  } else {
    alert(result.message);
  }
}

async function loadStudents() {
  const response = await fetch("/api/students");
  const students = await response.json();
  const container = document.getElementById("student-list");
  container.innerHTML = `
        <div class="flex justify-between px-4 py-3 text-xs text-gray-400 border-b">
            <span>Data Siswa</span>
            <span>QR</span>
        </div>
    `;
  students.forEach((student) => {
    const initials = student.name
      .split(" ")
      .map((v) => v[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    container.innerHTML += `
        <div
          class="student-item flex justify-between items-center px-4 py-3 border-b"
          data-name="${student.name.toLowerCase()}"
          data-nis="${student.nis}"
          data-status="">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                    ${initials}
                </div>
                <div>
                    <h4 class="text-xs font-semibold text-gray-700">
                        ${student.name}
                    </h4>
                    <p class="text-[10px] text-gray-400">
                        NIS ${student.nis}
                    </p>
                </div>
            </div>
            <img
                onclick="showQr(
                    '${student.name}',
                    '${student.nis}',
                    '${student.qr_token}'
                )"
                src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(student.qr_token)}"
                class="w-8 h-8 border cursor-pointer hover:scale-105 transition">
        </div>
    `;
  });
}

function startScanner() {
  const scanner = new Html5QrcodeScanner("reader", {
    fps: 10,
    qrbox: 250,
  });
  scanner.render(async (decodedText) => {
    if (decodedText === lastToken) {
      return;
    }
    lastToken = decodedText;
    const response = await fetch("/api/attendance/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: decodedText,
      }),
    });
    const result = await response.json();
    if (result.success) {
      showScanModal(result.student, result.already);
      if (!result.already) {
        addAttendanceToList({
          ...result.student,
          attendance_time: result.attendance_time,
        });
        loadAttendanceCount();
      }
    }
  });
}

function addAttendanceToList(student) {
  const container = document.getElementById("attendance-list");
  const initials = student.name
    .split(" ")
    .map((v) => v[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const html = `
        <div
          class="student-item flex justify-between items-center px-4 py-3 border-b"
          data-name="${student.name.toLowerCase()}"
          data-nis="${student.nis}"
          data-status="hadir">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-xs font-medium text-blue-600">
                    ${initials}
                </div>
                <div>
                    <h4 class="text-xs font-semibold text-gray-700">
                        ${student.name}
                    </h4>

                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[10px] text-gray-400">
                            NIS ${student.nis}
                        </span>

                        <span class="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            ${student.attendance_time?.substring(0, 5) || "--:--"}
                        </span>
                    </div>
                </div>
            </div>
            <span class="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                Hadir
            </span>

        </div>
        `;
  container.insertAdjacentHTML("afterbegin", html);
}

async function loadTodayAttendance() {
  const response = await fetch("/api/attendance/today");
  const data = await response.json();

  const container = document.getElementById("attendance-list");
  container.innerHTML = "";

  data
    .filter((student) => student.status === "hadir")
    .forEach((student) => {
      addAttendanceToList(student);
    });
}

async function loadAttendanceCount() {
  const response = await fetch("/api/attendance/count");
  const data = await response.json();

  document.getElementById("total-attendance").innerText = `${data.hadir} Siswa`;

  document.getElementById("total-hadir").innerText = data.hadir;
  document.getElementById("total-izin").innerText = data.izin;
  document.getElementById("total-sakit").innerText = data.sakit;
  document.getElementById("total-alpha").innerText = data.alpha;
}

document
  .getElementById("search-student")
  .addEventListener("input", function () {

    const keyword = this.value.toLowerCase().trim();

    document
      .querySelectorAll(".student-item")
      .forEach((el) => {

        const name = el.dataset.name || "";
        const nis = el.dataset.nis || "";
        const status = el.dataset.status || "";

        const match =
          name.includes(keyword) ||
          nis.includes(keyword) ||
          status.includes(keyword);

        el.style.display = match ? "flex" : "none";
      });
  });

async function loadDashboardStats() {
  try {
    const res = await fetch("/api/dashboard/stats");
    const data = await res.json();

    document.getElementById("dash-total-student").innerText =
      data.totalStudents;

    document.getElementById("dash-total-attendance").innerText =
      data.totalAttendance;
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

async function loadAbsentStudents() {
  const res = await fetch("/api/students/absent");
  const students = await res.json();

  const container = document.getElementById("attendance-list-absent");
  container.innerHTML = "";

  students.forEach((s) => {
    if (s.status === "hadir") return;

    const initials = s.name
      .split(" ")
      .map((v) => v[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    let badgeColor = "bg-gray-100 text-gray-600";
    let badgeText = "Belum";

    if (s.status === "izin") {
      badgeColor = "bg-blue-50 text-blue-600";
      badgeText = "Izin";
    } else if (s.status === "sakit") {
      badgeColor = "bg-yellow-50 text-yellow-600";
      badgeText = "Sakit";
    } else if (s.status === "alpha") {
      badgeColor = "bg-red-50 text-red-600";
      badgeText = "Alpha";
    }

    container.innerHTML += `
      <div
        class="student-item flex justify-between items-center px-4 py-3 border-b"
        data-name="${s.name.toLowerCase()}"
        data-nis="${s.nis}"
        data-status="${s.status || 'belum'}">

        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
            ${initials}
          </div>

          <div>
            <h4 class="text-xs font-semibold text-gray-700">${s.name}</h4>
            <p class="text-[10px] text-gray-400">NIS ${s.nis}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">

          <span class="text-[10px] px-2 py-1 rounded-lg font-medium ${badgeColor}">
            ${badgeText}
          </span>

          <select
            onchange="markAttendance(${s.id}, this.value)"
            class="text-[11px] px-2 py-1 border rounded-lg">

            <option value="">Pilih</option>
            <option value="hadir" ${s.status === "hadir" ? "selected" : ""}>Hadir</option>
            <option value="izin" ${s.status === "izin" ? "selected" : ""}>Izin</option>
            <option value="sakit" ${s.status === "sakit" ? "selected" : ""}>Sakit</option>
            <option value="alpha" ${s.status === "alpha" ? "selected" : ""}>Alpha</option>

          </select>

        </div>

      </div>
    `;
  });
}

async function markAttendance(studentId, status) {
  if (!status) return;

  await fetch("/api/attendance/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: studentId, status }),
  });

  await loadAbsentStudents();
  await loadAttendanceList();
  await loadDashboardStats();
}

async function loadSettings() {
  const res = await fetch("/api/settings");
  const data = await res.json();

  document.getElementById("school-name").value = data.school_name;
  document.getElementById("start-time").value = data.attendance_start.substring(
    0,
    5,
  );
  document.getElementById("end-time").value = data.attendance_end.substring(
    0,
    5,
  );
  document.getElementById("auto-reset").checked = data.auto_reset;
  document.getElementById("scan-notif").checked = data.scan_notif;
  const days = JSON.parse(data.attendance_days || "[]");

  document.querySelectorAll(".attendance-day").forEach((el) => {
    el.checked = days.includes(el.value);
  });
}

async function saveSettings() {
  const days = [];

  document.querySelectorAll(".attendance-day:checked").forEach((el) => {
    days.push(el.value);
  });

  const payload = {
    school_name: document.getElementById("school-name").value,
    attendance_start: document.getElementById("start-time").value,
    attendance_end: document.getElementById("end-time").value,
    attendance_days: days,
    auto_reset: document.getElementById("auto-reset").checked ? 1 : 0,
    scan_notif: document.getElementById("scan-notif").checked ? 1 : 0,
  };

  const res = await fetch("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();

  if (result.success) {
    alert("Pengaturan berhasil disimpan");
  }
}

function showPage(page) {
  if (currentPage !== page) {
    pageHistory.push(currentPage);
  }

  currentPage = page;

  const dashboardPage = document.getElementById("dashboard-page");
  const dashboardMenu = document.getElementById("dashboard-menu");
  const attendancePage = document.getElementById("attendance-page");
  const studentPage = document.getElementById("student-page");
  const scanPage = document.getElementById("scan-page");
  const attendanceMenu = document.getElementById("attendance-menu");
  const studentMenu = document.getElementById("student-menu");
  const scanMenu = document.getElementById("scan-menu");
  const settingsPage = document.getElementById("settings-page");
  const settingsMenu = document.getElementById("settings-menu");

  dashboardPage.classList.add("hidden");
  attendancePage.classList.add("hidden");
  studentPage.classList.add("hidden");
  scanPage.classList.add("hidden");
  settingsPage.classList.add("hidden");
  attendanceMenu.classList.remove("text-blue-500");
  attendanceMenu.classList.add("text-gray-400");
  studentMenu.classList.remove("text-blue-500");
  studentMenu.classList.add("text-gray-400");
  scanMenu.classList.remove("text-blue-500");
  scanMenu.classList.add("text-gray-400");
  dashboardMenu.classList.remove("text-blue-500");
  dashboardMenu.classList.add("text-gray-400");
  settingsMenu.classList.remove("text-blue-500");
  settingsMenu.classList.add("text-gray-400");

  settingsMenu.querySelector("img").src =
    "https://img.icons8.com/?size=100&id=cjKG0gGVVbhH&format=png&color=9CA3AF";
  dashboardMenu.querySelector("img").src =
    "https://img.icons8.com/?size=100&id=uNaaq8c2jqFp&format=png&color=9CA3AF";
  attendanceMenu.querySelector("img").src =
    "https://img.icons8.com/?size=100&id=40902&format=png&color=9CA3AF";
  studentMenu.querySelector("img").src =
    "https://img.icons8.com/?size=100&id=9542&format=png&color=9CA3AF";
  scanMenu.querySelector("img").src =
    "https://img.icons8.com/?size=100&id=87471&format=png&color=9CA3AF";

  if (page === "dashboard") {
    dashboardPage.classList.remove("hidden");
    dashboardMenu.classList.remove("text-gray-400");
    dashboardMenu.classList.add("text-blue-500");
    dashboardMenu.querySelector("img").src =
      "https://img.icons8.com/?size=100&id=uNaaq8c2jqFp&format=png&color=3B82F6";
  }

  if (page === "attendance") {
    attendancePage.classList.remove("hidden");
    attendanceMenu.classList.remove("text-gray-400");
    attendanceMenu.classList.add("text-blue-500");
    attendanceMenu.querySelector("img").src =
      "https://img.icons8.com/?size=100&id=40902&format=png&color=3B82F6";
  }

  if (page === "student") {
    studentPage.classList.remove("hidden");
    studentMenu.classList.remove("text-gray-400");
    studentMenu.classList.add("text-blue-500");
    studentMenu.querySelector("img").src =
      "https://img.icons8.com/?size=100&id=9542&format=png&color=3B82F6";
  }

  if (page === "scan") {
    scanPage.classList.remove("hidden");
    scanMenu.classList.remove("text-gray-400");
    scanMenu.classList.add("text-blue-500");
    scanMenu.querySelector("img").src =
      "https://img.icons8.com/?size=100&id=87471&format=png&color=3B82F6";
    if (!window.scannerStarted) {
      startScanner();
      window.scannerStarted = true;
    }
  }

  if (page === "settings") {
    settingsPage.classList.remove("hidden");
    settingsMenu.classList.remove("text-gray-400");
    settingsMenu.classList.add("text-blue-500");
    settingsMenu.querySelector("img").src =
      "https://img.icons8.com/?size=100&id=cjKG0gGVVbhH&format=png&color=3B82F6";
  }
}

window.onload = () => {
  showPage("dashboard");
};
window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  loadStudents();
  loadTodayAttendance();
  loadAttendanceCount();
  loadDashboardStats();
  loadAttendanceChart();
  loadAbsentStudents();
});
