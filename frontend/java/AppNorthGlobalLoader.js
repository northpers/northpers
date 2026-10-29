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


// Source & DevTools Protection Shield
(function initSourceShield() {
  try {
    const isDev = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    const allowDev = isDev && (localStorage.getItem('north_dev_inspect') === '1');
    if (allowDev) return;

    // 1. Disable Right Click (Context Menu)
    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    }, { capture: true });

    // 2. Disable DevTools & View Source Keyboard Shortcuts
    document.addEventListener('keydown', function (e) {
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, { capture: true });

    // 3. Debugger Trap (Freezes DevTools if forced open via menu)
    function antiDebug() {
      function check(n) {
        if (('' + n / n).length !== 1 || n % 20 === 0) {
          (function () {}).constructor('debugger')();
        } else {
          debugger;
        }
        check(++n);
      }
      try {
        check(0);
      } catch (err) {}
    }

    // Only run persistent debugger loop on production or non-dev
    if (!isDev) {
      setInterval(antiDebug, 1000);
      try {
        console.log = function () {};
        console.info = function () {};
        console.warn = function () {};
        console.table = function () {};
      } catch (e) {}
    }
  } catch (err) {}
})();
