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
const originalHref = Object.getOwnPropertyDescriptor(Location.prototype, "href");
Object.defineProperty(window.location, "href", {
  set: function (url) {
    showLoader();
    setTimeout(() => {
      originalHref.set.call(window.location, url);
    }, 150);
  },
  get: function () {
    return window.location.toString();
  }
});

window.addEventListener("pageshow", () => {
  hideLoader();
});