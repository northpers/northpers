function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

const loader = document.getElementById("global-loader");
function showLoader() {
  if (!loader) return;
  loader.classList.remove("hidden");
}
function hideLoader() {
  if (!loader) return;
  loader.classList.add("hidden");
}
document.addEventListener("click", function (e) {
  const link = e.target.closest("a");
  if (!link) return;
  const href = link.getAttribute("href");
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("javascript:") ||
    link.target === "_blank" ||
    e.ctrlKey ||
    e.metaKey
  ) return;
  const isExternal = href.startsWith("http");
  if (isExternal) {
    showLoader();
    setTimeout(() => {
      window.location.href = href;
    }, 200);
    e.preventDefault();
    return;
  }
  e.preventDefault();
  showLoader();
  setTimeout(() => {
    window.location.href = href;
  }, 150);
});
document.addEventListener("click", function (e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const onclick = btn.getAttribute("onclick");
  if (!onclick) return;
  if (onclick.includes("window.location.href")) {
    showLoader();
    return;
  }
});
window.addEventListener("pageshow", () => {
  hideLoader();
});

(function trackAffiliateHit() {
  try {
    const params = new URLSearchParams(window.location.search);
    const affCode = params.get("aff");
    if (!affCode) return;
    fetch(_d('9kzs9kppsvsk~o9rs~'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code: affCode })
    }).catch(() => {});
  } catch (e) {}
})();

setInterval(() => {
  if (typeof checkGlobalNotifications === 'function') {
    checkGlobalNotifications();
  }
}, 30000);