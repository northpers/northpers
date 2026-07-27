function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

function scrollToSection(id, button) {
  const section = document.getElementById(id);

  if (section) {
    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("text-[#DF414F]", "font-medium");

    btn.classList.add("text-gray-600");

    const indicator = btn.querySelector(".tab-indicator");

    if (indicator) {
      indicator.remove();
    }
  });

  button.classList.remove("text-gray-600");
  button.classList.add("text-[#DF414F]", "font-medium");

  const border = document.createElement("div");

  border.className =
    "tab-indicator absolute bottom-0 left-0 w-full h-[2px] bg-[#DF414F]";

  button.appendChild(border);
}

function formatFollowers(total) {
  if (total >= 1000) {
    return (total / 1000).toFixed(1).replace(".0", "") + "RB";
  }
  return total;
}

document.addEventListener("DOMContentLoaded", async () => {
  const followBtn = document.getElementById("follow-btn");
  if (!followBtn) return;

  let _currentUserId = null;
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      const me = meData.data || meData.user || meData;
      if (me && me.id) _currentUserId = me.id;
    }
  } catch (e) {}

  followBtn.addEventListener("click", async () => {
    if (!_currentUserId) {
      showIosModal("Login dulu untuk mengikuti Northline.");
      return;
    }

    const btn = followBtn;

    try {
      const response = await fetch("/api/follow-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: _currentUserId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        document.getElementById("followers-count").textContent =
          `${formatFollowers(result.followers)} Pengikut`;

        btn.innerHTML = `
                <span>Mengikuti</span>
            `;

        btn.classList.remove("border-white");
        btn.classList.add("border-white");

        btn.disabled = true;
      }
    } catch (err) {
      console.error(err);
      showIosModal("Gagal mengikuti toko.");
    }
  });

  if (_currentUserId) {
    try {
      const response = await fetch(`/api/check-follow/${_currentUserId}`);
      const result = await response.json();
      if (result.success && result.following) {
        followBtn.innerHTML = `
            <span>Mengikuti</span>
        `;
        followBtn.classList.remove("border-white");
        followBtn.classList.add("border-white");
        followBtn.disabled = true;
      }
    } catch (err) {
      console.error("Check follow gagal:", err);
    }
  }
});

async function loadFollowersCount() {
  const response = await fetch("/api/followers-count");
  const data = await response.json();

  if (data.success) {
    document.getElementById("followers-count").textContent =
      `${formatFollowers(data.followers)} Pengikut`;
  }
}

document.getElementById("btn-share").addEventListener("click", async () => {
  const shareData = {
    title: "Kunjungi Toko Kami",
    text: "Yuk cek produk menarik di toko kami!",
    url: "https://nl.hostinesia.my.id/nrtStore",
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      console.log("Berhasil dibagikan");
    } else {
      await navigator.clipboard.writeText(shareData.url);
      showIosModal("Link toko berhasil disalin ke clipboard!");
    }
  } catch (err) {
    console.error("Error saat share:", err);
  }
});

loadFollowersCount();
checkFollowStatus();
