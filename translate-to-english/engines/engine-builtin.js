/*
 * engines/engine-builtin.js — Browser built-in on-device translation.
 * -------------------------------------------------------------------
 * Uses the W3C/Chromium **Translator API** and **Language Detector API**
 * (Chrome/Edge 138+, and other Chromium browsers that expose them).
 *
 *   - 100% on-device. No API key, no account, no server round-trip.
 *   - The browser itself downloads a small language pack the FIRST time a
 *     given language is used, then caches it locally and runs it offline.
 *     (So it is "on-device", but not literally "pre-bundled" — the browser
 *     manages the model files, not this extension. See README trade-offs.)
 *
 * Interface implemented (shared by all engines):
 *   id
 *   async isSupported()                      -> boolean
 *   async detect(text)                       -> langCode | null
 *   async canTranslate(srcLang)              -> "ready" | "downloadable" | "no"
 *   async createSession(srcLang, onProgress) -> { translate(str), destroy() } | null
 */
(function (global) {
  "use strict";

  const TARGET = "en";

  function hasTranslator() {
    return typeof Translator !== "undefined" && typeof Translator.create === "function";
  }
  function hasDetector() {
    return typeof LanguageDetector !== "undefined" && typeof LanguageDetector.create === "function";
  }

  let detectorPromise = null;
  async function getDetector() {
    if (!hasDetector()) return null;
    if (!detectorPromise) {
      detectorPromise = (async () => {
        try {
          const avail = await LanguageDetector.availability();
          if (avail === "unavailable") return null;
          return await LanguageDetector.create();
        } catch (e) {
          return null;
        }
      })();
    }
    return detectorPromise;
  }

  const engine = {
    id: "builtin",

    async isSupported() {
      return hasTranslator();
    },

    // Returns a BCP-47 language code, or null if it cannot decide.
    async detect(text) {
      const det = await getDetector();
      if (!det) return null;
      try {
        const results = await det.detect(text.slice(0, 2000));
        if (results && results.length) {
          const top = results[0];
          if (top.detectedLanguage && top.detectedLanguage !== "und" && top.confidence > 0.5) {
            return top.detectedLanguage;
          }
        }
      } catch (e) { /* fall through */ }
      return null;
    },

    // "ready"        -> model present, translate immediately (no gesture)
    // "downloadable" -> supported, but a user gesture is needed to start the download
    // "downloading"  -> a download is already in progress; create() may proceed
    // "no"           -> this source language is not supported here
    async canTranslate(srcLang) {
      if (!hasTranslator() || !srcLang || srcLang === TARGET) return "no";
      try {
        const status = await Translator.availability({
          sourceLanguage: srcLang,
          targetLanguage: TARGET
        });
        if (status === "available") return "ready";
        if (status === "downloading") return "downloading";
        if (status === "downloadable") return "downloadable";
        return "no";
      } catch (e) {
        return "no";
      }
    },

    // onProgress(fraction 0..1) is called while a pack downloads (optional).
    async createSession(srcLang, onProgress) {
      if (!hasTranslator() || !srcLang || srcLang === TARGET) return null;
      try {
        const translator = await Translator.create({
          sourceLanguage: srcLang,
          targetLanguage: TARGET,
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => {
              if (typeof onProgress === "function") {
                // e.loaded is 0..1 in the current spec.
                onProgress(typeof e.loaded === "number" ? e.loaded : 0);
              }
            });
          }
        });
        return {
          async translate(text) {
            return await translator.translate(text);
          },
          destroy() {
            try { translator.destroy?.(); } catch (e) {}
          }
        };
      } catch (e) {
        return null;
      }
    }
  };

  (global.TLEngines = global.TLEngines || {}).builtin = engine;
})(typeof self !== "undefined" ? self : window);
