let attendanceChart;

async function loadAttendanceChart() {
  const res = await fetch("/api/dashboard/chart");
  const data = await res.json();

  const labels = data.map((d) =>
    new Date(d.attendance_date).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "2-digit",
    }),
  );

  const values = data.map((d) => d.total);

  const ctx = document.getElementById("attendanceChart");

  if (attendanceChart) {
    attendanceChart.destroy();
  }

  attendanceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Kehadiran",
          data: values,

          borderColor: "#3B82F6",
          backgroundColor: "rgba(59,130,246,0.08)",

          fill: true,

          // 🔥 ini kunci biar gak lurus
          tension: 0.6,

          // bikin kayak crypto chart naik-turun tajam
          cubicInterpolationMode: "monotone",

          borderWidth: 2,

          pointRadius: 0, // crypto style biasanya ga ada titik
          pointHoverRadius: 5,

          pointBackgroundColor: "#3B82F6",

          // bikin feel lebih "market chart"
          stepped: false,
        },
      ],
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      interaction: {
        mode: "index",
        intersect: false,
      },

      plugins: {
        legend: { display: false },

        tooltip: {
          backgroundColor: "#0F172A",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "#1E293B",
          borderWidth: 1,
        },
      },

      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94A3B8" },
        },
        y: {
          grid: {
            color: "rgba(148,163,184,0.15)",
          },
          ticks: {
            color: "#94A3B8",
            precision: 0,
          },
        },
      },
    },
  });
}
