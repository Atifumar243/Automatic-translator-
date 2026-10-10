/*
 * background.js — service worker (Chromium) / event page (Firefox)
 * -----------------------------------------------------------------
 * Responsibilities:
 *   1. Hold the single source of truth for settings (in chrome.storage).
 *   2. Keep the toolbar badge in sync with the global ON/OFF state.
 *   3. Relay "re-apply settings" broadcasts to open tabs.
 *
 * It intentionally does NO translation itself — translation happens in the
 * content script, which has access to the page DOM and (on Chrome) the
 * on-device Translator API. The background script is just bookkeeping.
 */

// Firefox exposes the WebExtension API as `browser`; Chromium uses `chrome`.
// This shim lets the rest of the file use `api` on both.
const api = (typeof browser !== "undefined") ? browser : chrome;

// Default configuration applied on first install.
const DEFAULTS = {
  enabled: true,            // global auto-translate on/off
  targetLang: "en",         // we always translate INTO English
  engine: "auto",           // "auto" | "builtin" | "bergamot" | "online"
  allowOnline: false,       // opt-in online keyless fallback (privacy-sensitive)
  skipLangs: ["en"]         // source languages to leave untouched
};

// ---- Install / startup --------------------------------------------------

api.runtime.onInstalled.addListener(async () => {
  const stored = await api.storage.local.get(Object.keys(DEFAULTS));
  const merged = { ...DEFAULTS, ...stored };
  await api.storage.local.set(merged);
  updateBadge(merged.enabled);
});

api.runtime.onStartup?.addListener(async () => {
  const { enabled = true } = await api.storage.local.get("enabled");
  updateBadge(enabled);
});

// ---- Badge --------------------------------------------------------------

function updateBadge(enabled) {
  try {
    api.action.setBadgeText({ text: enabled ? "" : "OFF" });
    api.action.setBadgeBackgroundColor({ color: "#9ca3af" });
  } catch (e) {
    // Some browsers restrict badge APIs; non-fatal.
  }
}

// Keep the badge correct whenever the global toggle changes anywhere.
api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) {
    updateBadge(changes.enabled.newValue);
  }
});

// ---- Messaging ----------------------------------------------------------
// The popup asks the background to broadcast setting changes to every tab so
// already-open pages can react (e.g. when the user flips the global toggle).

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "BROADCAST_SETTINGS") {
    broadcast({ type: "SETTINGS_CHANGED", settings: msg.settings });
    sendResponse?.({ ok: true });
    return false;
  }

  if (msg?.type === "ONLINE_TRANSLATE") {
    // Done here (not in the content script) so it is not blocked by the
    // visited page's CSP and so host permissions cover the request.
    onlineTranslate(msg.text, msg.source, msg.target)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true; // async response
  }

  return false;
});

// MyMemory keyless endpoint. Online-only, rate-limited, third-party.
async function onlineTranslate(text, source, target) {
  const q = encodeURIComponent(text.slice(0, 500)); // endpoint caps length per call
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${encodeURIComponent(source)}|${encodeURIComponent(target)}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const data = await resp.json();
  const out = data?.responseData?.translatedText;
  if (!out) throw new Error("Empty response");
  return out;
}

async function broadcast(message) {
  try {
    const tabs = await api.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      api.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab has no content script (e.g. chrome://, PDF viewer). Ignore.
      });
    }
  } catch (e) {
    // tabs permission edge cases — safe to ignore.
  }
}
