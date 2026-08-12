/**
 * TranslationLoader
 * Responsible for fetching and caching JSON locale files.
 */
class TranslationLoader {
  constructor() {
    this.cache = {};
  }

  /**
   * Load JSON translation for a given language code.
   * @param {string} lang 
   * @returns {Promise<Object>}
   */
  async load(lang) {
    if (!lang) lang = 'id';
    
    // Return cached translation if already loaded
    if (this.cache[lang]) {
      return this.cache[lang];
    }

    try {
      // Try /locales/ first
      let res = await fetch(`/locales/${lang}.json`);
      if (!res.ok) {
        // Fallback to /lang/
        res = await fetch(`/lang/${lang}.json`);
      }

      if (!res.ok) {
        throw new Error(`Failed to load translation file for language: ${lang}`);
      }

      const data = await res.json();
      this.cache[lang] = data;
      return data;
    } catch (err) {
      console.error(`[TranslationLoader] Error loading language "${lang}":`, err);
      // Return empty object on failure to prevent crashes
      return this.cache[lang] || {};
    }
  }

  /**
   * Get cached data for a language
   * @param {string} lang 
   */
  getCache(lang) {
    return this.cache[lang] || null;
  }
}

// Export singleton instance globally
window.TranslationLoader = new TranslationLoader();
