/*
 * engines/engine-online.js — OPTIONAL keyless ONLINE fallback.
 * ------------------------------------------------------------
 * ⚠️ ONLINE ONLY. This is the one path that leaves your device.
 *    - It is DISABLED by default and only used if you turn on
 *      "Allow online fallback" in the popup.
 *    - It uses MyMemory (https://mymemory.translated.net), which is
 *      keyless and free but rate-limited (~a few thousand words/day,
 *      anonymous) and sends the page text to that third-party server.
 *    - No API key and no account are required — matching the "no keys"
 *      rule — but because it is NOT on-device, it is clearly flagged
 *      as a secondary path only.
 *
 * The actual network request is made by the background service worker
 * (engine-online runs in the content script and just forwards requests),
 * so it works regardless of the visited page's content-security policy.
 */
(function (global) {
  "use strict";

  const api = (typeof browser !== "undefined") ? browser : chrome;
  const TARGET = "en";

  const engine = {
    id: "online",

    async isSupported() {
      return true; // availability is gated by the user's "allowOnline" setting
    },

    async detect() {
      return null; // detection handled elsewhere
    },

    async canTranslate(srcLang) {
      return srcLang && srcLang !== TARGET ? "ready" : "no";
    },

    async createSession(srcLang) {
      if (!srcLang || srcLang === TARGET) return null;
      return {
        async translate(text) {
          const res = await api.runtime.sendMessage({
            type: "ONLINE_TRANSLATE",
            text,
            source: srcLang,
            target: TARGET
          });
          if (res && res.ok) return res.text;
          throw new Error(res?.error || "Online translation failed");
        },
        destroy() {}
      };
    }
  };

  (global.TLEngines = global.TLEngines || {}).online = engine;
})(typeof self !== "undefined" ? self : window);
