/* popup/popup.js */
(function () {
  "use strict";
  const api = (typeof browser !== "undefined") ? browser : chrome;

  const $ = (id) => document.getElementById(id);
  const enabledEl = $("enabled");
  const engineEl = $("engine");
  const allowOnlineEl = $("allowOnline");
  const statusEl = $("status");
  const infoEl = $("engineInfo");
  const btnTranslate = $("btnTranslate");
  const btnRestore = $("btnRestore");

  let langNames;
  try { langNames = new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) { langNames = null; }
  const nameOf = (code) => {
    if (!code) return "unknown";
    try { return langNames ? langNames.of(code) : code; } catch (e) { return code; }
  };

  const DEFAULTS = {
    enabled: true, targetLang: "en", engine: "auto",
    allowOnline: false, skipLangs: ["en"]
  };

  let settings = { ...DEFAULTS };

  init();

  async function init() {
    settings = { ...DEFAULTS, ...(await api.storage.local.get(Object.keys(DEFAULTS))) };
    enabledEl.checked = !!settings.enabled;
    engineEl.value = settings.engine || "auto";
    allowOnlineEl.checked = !!settings.allowOnline;

    enabledEl.addEventListener("change", onToggle);
    engineEl.addEventListener("change", onAdvancedChange);
    allowOnlineEl.addEventListener("change", onAdvancedChange);
    btnTranslate.addEventListener("click", () => sendToTab("TRANSLATE_PAGE"));
    btnRestore.addEventListener("click", () => sendToTab("RESTORE_PAGE"));

    await refreshStatus();
  }

  async function onToggle() {
    settings.enabled = enabledEl.checked;
    await save();
    statusEl.textContent = settings.enabled
      ? "On. New pages will be translated on load."
      : "Off. Pages load in their original language.";
  }

  async function onAdvancedChange() {
    settings.engine = engineEl.value;
    settings.allowOnline = allowOnlineEl.checked;
    await save();
  }

  async function save() {
    await api.storage.local.set(settings);
    // Let open tabs know (global toggle applies on next load; engine/online
    // prefs are read fresh on each translate).
    try { await api.runtime.sendMessage({ type: "BROADCAST_SETTINGS", settings }); } catch (e) {}
  }

  async function activeTab() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(type) {
    const tab = await activeTab();
    if (!tab || !tab.id) return;
    try {
      const res = await api.tabs.sendMessage(tab.id, { type });
      if (res) renderState(res);
    } catch (e) {
      statusEl.textContent = "This page can't be translated (e.g. a browser or store page).";
    }
    setTimeout(refreshStatus, 600);
  }

  async function refreshStatus() {
    const tab = await activeTab();
    if (!tab || !tab.id) { statusEl.textContent = ""; return; }
    try {
      const res = await api.tabs.sendMessage(tab.id, { type: "GET_STATE" });
      renderState(res);
    } catch (e) {
      statusEl.textContent = "No translatable content here yet.";
      infoEl.textContent = "";
    }
  }

  function renderState(res) {
    if (!res || !res.ok) return;
    const lang = res.pageLang ? nameOf(res.pageLang) : null;

    if (res.mode === "translated") {
      statusEl.textContent = lang
        ? `Translated from ${lang} to English.`
        : "Translated to English.";
      btnTranslate.disabled = true; btnRestore.disabled = false;
    } else if (res.mode === "translating") {
      statusEl.textContent = "Translating…";
      btnTranslate.disabled = true; btnRestore.disabled = true;
    } else if (res.mode === "need-gesture") {
      statusEl.textContent = lang
        ? `Detected ${lang}. Click anywhere on the page once to download the model (one-time), then it translates automatically.`
        : "Click the page once to finish one-time setup.";
      btnTranslate.disabled = false; btnRestore.disabled = true;
    } else {
      statusEl.textContent = lang && res.pageLang !== "en"
        ? `Detected ${lang}. Will translate automatically.`
        : "This page looks like English already.";
      btnTranslate.disabled = false; btnRestore.disabled = true;
    }

    const parts = [];
    if (res.engineId) parts.push("Engine: " + engineLabel(res.engineId));
    parts.push(res.builtinSupported
      ? "Browser on-device translation: available."
      : "Browser on-device translation: not available here.");
    infoEl.textContent = parts.join("  ·  ");
  }

  function engineLabel(id) {
    return { builtin: "browser on-device", bergamot: "bundled offline", online: "online fallback" }[id] || id;
  }

  // Live-update the popup if the page reports a mode change while it's open.
  api.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "MODE_UPDATE") {
      renderState({ ok: true, mode: msg.mode, pageLang: msg.pageLang, engineId: msg.engineId, builtinSupported: true });
    }
  });
})();
