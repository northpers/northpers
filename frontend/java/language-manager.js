/**
 * LanguageManager
 * Core i18n manager for Northline E-Commerce platform.
 * Supports dynamic language switching, localStorage persistence, browser auto-detection,
 * and MutationObserver for dynamically injected DOM elements.
 */
class LanguageManager {
  constructor() {
    this.storageKey = STORAGE_KEYS.LANGUAGE;
    this.currentLang = this.getInitialLanguage();
    this.dict = {};
    this.observer = null;
    this.langMeta = {
      id: { name: "Bahasa Indonesia", icon: "https://img.icons8.com/color/24/indonesia.png" },
      ms: { name: "Bahasa Malaysia", icon: "https://img.icons8.com/color/24/malaysia.png" },
      en: { name: "English (Singapore)", icon: "https://img.icons8.com/color/24/singapore.png" },
      th: { name: "ไทย", icon: "https://img.icons8.com/color/24/thailand.png" },
      vn: { name: "Tiếng Việt", icon: "https://img.icons8.com/color/24/vietnam.png" },
      "en-global": { name: "English", icon: "https://img.icons8.com/color/24/usa.png" }
    };
  }

  /**
   * Determine initial language based on localStorage or Browser Auto-Detection
   */
  getInitialLanguage() {
    // Check URL query param first (?lang=id)
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && this.isValidLang(urlLang)) {
      localStorage.setItem(this.storageKey, urlLang);
      localStorage.setItem(STORAGE_KEYS.LANGUAGE_LEGACY, urlLang);
      return urlLang;
    }

    const savedLang = localStorage.getItem(this.storageKey) || localStorage.getItem(STORAGE_KEYS.LANGUAGE_LEGACY);
    if (savedLang && this.isValidLang(savedLang)) {
      return savedLang;
    }

    // Auto-detect browser language
    const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
    if (navLang.startsWith("id")) return "id";
    if (navLang.startsWith("ms")) return "ms";
    if (navLang === "en-sg" || navLang === "en_sg") return "en";
    if (navLang.startsWith("th")) return "th";
    if (navLang.startsWith("vi") || navLang.startsWith("vn")) return "vn";
    
    return "en-global";
  }

  isValidLang(lang) {
    return ["id", "ms", "en", "th", "vn", "en-global"].includes(lang);
  }

  /**
   * Initialize LanguageManager:
   * Load current language, bind events, setup MutationObserver.
   */
  async init() {
    await this.setLanguage(this.currentLang, false);
    this.bindEvents();
    this.setupMutationObserver();
  }

  /**
   * Change current language dynamically.
   * @param {string} lang 
   * @param {boolean} persist 
   */
  async setLanguage(lang, persist = true) {
    if (!this.isValidLang(lang)) {
      console.warn(`[LanguageManager] Invalid language "${lang}", defaulting to "id".`);
      lang = "id";
    }

    this.currentLang = lang;
    if (persist) {
      localStorage.setItem(this.storageKey, lang);
      localStorage.setItem(STORAGE_KEYS.LANGUAGE_LEGACY, lang); // Legacy fallback
    }

    // Update URL with ?lang= parameter
    const url = new URL(window.location);
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url);

    // Load JSON via TranslationLoader
    if (window.TranslationLoader) {
      this.dict = await window.TranslationLoader.load(lang);
    } else {
      console.error("[LanguageManager] TranslationLoader instance not found!");
      return;
    }

    // Update UI elements & translate DOM
    this.updateSelectorUI(lang);
    this.translateDOM();

    // Update internal links with language param
    this.updateLinks();

    // Dispatch custom event for custom components listeners
    window.dispatchEvent(new CustomEvent("northline_language_changed", {
      detail: { lang, dict: this.dict }
    }));
  }

  /**
   * Translate all elements within target container or document.body
   * @param {HTMLElement} [container=document.body]
   */
  translateDOM(container = document.body) {
    if (!this.dict || Object.keys(this.dict).length === 0) return;

    // 1. Text Content
    const i18nElements = container.querySelectorAll("[data-i18n]");
    i18nElements.forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (this.dict[key]) {
        el.textContent = this.dict[key];
      }
    });

    // 2. Placeholders
    const placeholderElements = container.querySelectorAll("[data-i18n-placeholder]");
    placeholderElements.forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (this.dict[key]) {
        el.setAttribute("placeholder", this.dict[key]);
      }
    });

    // 3. Titles
    const titleElements = container.querySelectorAll("[data-i18n-title]");
    titleElements.forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (this.dict[key]) {
        el.setAttribute("title", this.dict[key]);
      }
    });

    // 4. Alt texts for images
    const altElements = container.querySelectorAll("[data-i18n-alt]");
    altElements.forEach(el => {
      const key = el.getAttribute("data-i18n-alt");
      if (this.dict[key]) {
        el.setAttribute("alt", this.dict[key]);
      }
    });

    // 5. Aria Labels
    const ariaElements = container.querySelectorAll("[data-i18n-aria]");
    ariaElements.forEach(el => {
      const key = el.getAttribute("data-i18n-aria");
      if (this.dict[key]) {
        el.setAttribute("aria-label", this.dict[key]);
      }
    });

    // 6. Values (inputs/buttons)
    const valueElements = container.querySelectorAll("[data-i18n-value]");
    valueElements.forEach(el => {
      const key = el.getAttribute("data-i18n-value");
      if (this.dict[key]) {
        el.value = this.dict[key];
      }
    });
  }

  /**
   * Update the language selector trigger text & icon in header
   */
  updateSelectorUI(lang) {
    const currentLangEl = document.getElementById("current-lang");
    if (currentLangEl) {
      const meta = this.langMeta[lang] || this.langMeta["id"];
      currentLangEl.innerHTML = `
        <img src="https://img.icons8.com/ios/20/ffffff/globe.png" class="w-3 h-3">
        ${meta.name}
      `;
    }
  }

  /**
   * Bind language dropdown click events and trigger listeners
   */
  bindEvents() {
    const wrapper = document.getElementById("lang-wrapper");
    const dropdown = document.getElementById("lang-dropdown");

    if (wrapper && dropdown) {
      wrapper.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("hidden");
      });

      document.addEventListener("click", () => {
        dropdown.classList.add("hidden");
      });
    }

    // Attach click listeners to language buttons (data-lang="code" or .lang-btn)
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lang], .lang-btn");
      if (btn) {
        const lang = btn.getAttribute("data-lang") || btn.dataset.lang;
        if (lang && this.isValidLang(lang)) {
          e.stopPropagation();
          if (dropdown) dropdown.classList.add("hidden");
          this.setLanguage(lang, true);
        }
      }
    });
  }

  /**
   * MutationObserver to dynamically translate new nodes inserted into DOM
   */
  setupMutationObserver() {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      let shouldTranslate = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.hasAttribute("data-i18n") || node.querySelector("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-alt]")) {
                shouldTranslate = true;
              }
            }
          });
        }
      });

      if (shouldTranslate) {
        this.translateDOM();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Helper function to get translation key text directly
   */
  t(key, fallbackText = "") {
    return this.dict[key] || fallbackText || key;
  }

  /**
   * Append ?lang= to all internal links for language persistence across pages
   */
  updateLinks() {
    const lang = this.currentLang;
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('javascript') && !href.startsWith('tel:') && !href.startsWith('mailto:')) {
        try {
          const url = new URL(href, window.location.origin);
          url.searchParams.set('lang', lang);
          a.setAttribute('href', url.pathname + url.search);
        } catch(e) {}
      }
    });
  }
}

// Export singleton instance globally
window.LanguageManager = new LanguageManager();

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.LanguageManager.init());
} else {
  window.LanguageManager.init();
}
