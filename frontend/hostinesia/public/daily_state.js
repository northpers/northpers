let currentWeek = new Date();

function getWeekRange(date) {
  const start = new Date(date);
  const day = start.getDay() || 7;

  start.setDate(start.getDate() - day + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    label: `${start.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    })} - ${end.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`,
  };
}

async function loadWeek() {
  const range = getWeekRange(currentWeek);

  document.getElementById("week-label").innerText =
    range.label;

  const res = await fetch(
    `/api/attendance/by-week?start=${range.start}&end=${range.end}`
  );

  const data = await res.json();

  const container =
    document.getElementById("weekly-history");

  container.innerHTML = "";

  data.forEach((day) => {
    container.innerHTML += `
      <div class="bg-white rounded-lg border border-gray-100 p-4 mb-3">

        <div class="flex justify-between items-center mb-3">
          <h3 class="text-sm font-semibold text-gray-700">
            ${day.date}
          </h3>

          <span class="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-600">
            ${day.total} Siswa
          </span>
        </div>

        <div class="grid grid-cols-4 gap-2">

          <div class="bg-green-50 rounded-lg p-2 text-center">
            <p class="text-[10px] text-green-600">Hadir</p>
            <p class="font-semibold">${day.hadir}</p>
          </div>

          <div class="bg-blue-50 rounded-lg p-2 text-center">
            <p class="text-[10px] text-blue-600">Izin</p>
            <p class="font-semibold">${day.izin}</p>
          </div>

          <div class="bg-yellow-50 rounded-lg p-2 text-center">
            <p class="text-[10px] text-yellow-600">Sakit</p>
            <p class="font-semibold">${day.sakit}</p>
          </div>

          <div class="bg-red-50 rounded-lg p-2 text-center">
            <p class="text-[10px] text-red-600">Alpha</p>
            <p class="font-semibold">${day.alpha}</p>
          </div>

        </div>

      </div>
    `;
  });
}

function changeWeek(step) {
  currentWeek.setDate(
    currentWeek.getDate() + step * 7
  );

  loadWeek();
}