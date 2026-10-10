/*
 * engines/engine-registry.js — chooses which translation engine to use.
 * ---------------------------------------------------------------------
 * Priority for engine = "auto":
 *   1. builtin  — browser on-device Translator API (Chrome/Edge 138+). Best.
 *   2. bergamot — bundled WASM neural models (all browsers, fully offline).
 *                 Only active if the optional model files have been fetched
 *                 (see scripts/fetch-models). Loaded lazily.
 *   3. online   — keyless MyMemory fallback, ONLY if the user opted in.
 *
 * If the user pins a specific engine in settings, we honour it (falling back
 * only when that engine genuinely cannot handle the language).
 */
(function (global) {
  "use strict";

  const api = (typeof browser !== "undefined") ? browser : chrome;
  const Engines = global.TLEngines = global.TLEngines || {};

  // Lazy-load the heavy Bergamot engine only when needed.
  let bergamotLoadTried = false;
  async function ensureBergamot() {
    if (Engines.bergamot || bergamotLoadTried) return Engines.bergamot || null;
    bergamotLoadTried = true;
    try {
      // engine-bergamot.js is a web-accessible resource; import on demand.
      const url = api.runtime.getURL("engines/engine-bergamot.js");
      await import(url);
    } catch (e) {
      // Bergamot not available (models not fetched, or browser blocks import).
    }
    return Engines.bergamot || null;
  }

  async function detectLanguage(text) {
    // Prefer the browser's built-in detector (strongest), else the bundled one.
    if (Engines.builtin && await Engines.builtin.isSupported()) {
      const d = await Engines.builtin.detect(text);
      if (d) return d;
    }
    const heuristic = global.TLDetect?.detect(text);
    return heuristic?.lang || null;
  }

  function engineOrder(settings) {
    const pref = settings.engine || "auto";
    const order = [];
    if (pref === "builtin") order.push("builtin");
    else if (pref === "bergamot") order.push("bergamot", "builtin");
    else if (pref === "online") order.push("online");
    else order.push("builtin", "bergamot"); // auto
    // Online is only ever tried if explicitly allowed; appended last.
    if (settings.allowOnline && !order.includes("online")) order.push("online");
    return order;
  }

  // Decide WHICH engine will handle srcLang and its download status, WITHOUT
  // creating a session yet. This lets the caller gate a gesture-required
  // model download (Chrome throws NotAllowedError if create() downloads
  // without a user gesture). Returns { engine, status } or null.
  async function planEngine(srcLang, settings) {
    for (const id of engineOrder(settings)) {
      let engine = Engines[id];
      if (id === "bergamot") engine = await ensureBergamot();
      if (!engine) continue;
      if (id === "online" && !settings.allowOnline) continue;
      try {
        if (!(await engine.isSupported())) continue;
        const status = await engine.canTranslate(srcLang);
        if (status === "no") continue;
        return { engine, status };
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // Create a ready-to-use session for a chosen engine.
  async function openSession(engine, srcLang, onProgress) {
    try {
      return await engine.createSession(srcLang, onProgress);
    } catch (e) {
      return null;
    }
  }

  // Convenience: plan + open in one go (used when no gesture gating is needed).
  async function pickEngine(srcLang, settings, onProgress) {
    const plan = await planEngine(srcLang, settings);
    if (!plan) return null;
    const session = await openSession(plan.engine, srcLang, onProgress);
    return session ? { engine: plan.engine, session, status: plan.status } : null;
  }

  global.TLRegistry = { detectLanguage, planEngine, openSession, pickEngine };
})(typeof self !== "undefined" ? self : window);
