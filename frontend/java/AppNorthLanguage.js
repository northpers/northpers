/**
 * Northline Language Initialization Script
 * Entry point for Multi-Language (i18n) support.
 * Loads translation-loader.js first, then language-manager.js sequentially.
 * Tries /java/ path first, then root path as fallback.
 */

(function initI18n() {
  if (window._northlineI18nInit) return;
  window._northlineI18nInit = true;

  function loadScript(src, callback) {
    if (document.querySelector('script[src="' + src + '"]')) {
      if (callback) callback();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = callback || null;
    s.onerror = function () {
      console.error("[i18n] Failed to load:", src);
      if (callback) callback();
    };
    document.head.appendChild(s);
  }

  // Load TranslationLoader -> LanguageManager sequentially
  if (!window.TranslationLoader) {
    loadScript("/java/AppNorthTranslationLoader.js", function () {
      if (!window.LanguageManager) {
        loadScript("/java/AppNorthLanguageManager.js");
      }
    });
  } else if (!window.LanguageManager) {
    loadScript("/java/AppNorthLanguageManager.js");
  }
})();