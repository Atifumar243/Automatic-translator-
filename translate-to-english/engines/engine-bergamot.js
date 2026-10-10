/*
 * engines/engine-bergamot.js — OPTIONAL fully-offline, all-browser engine.
 * ------------------------------------------------------------------------
 * This is the path that gives you true offline translation on EVERY browser
 * (including Firefox), using the same neural models as Firefox Translations:
 * the Bergamot WASM engine + per-language-pair models, all bundled locally.
 *
 * ❗ REQUIRES EXTERNAL BINARIES that are NOT in this source tree because they
 *    are large and binary. Run `scripts/fetch-models.mjs` (or the .ps1) to
 *    download:
 *       engines/bergamot/bergamot-translator-worker.js   (WASM glue)
 *       engines/bergamot/bergamot-translator-worker.wasm (engine)
 *       models/<pair>/*                                   (model files)
 *       models/registry.json                              (which pairs exist)
 *
 * If those files are absent, this engine reports "not supported" and the
 * extension silently falls back to the browser built-in engine. Nothing
 * breaks.
 *
 * ⚠️ HONESTY NOTE: The browser built-in engine (engine-builtin.js) is the
 *    tested, recommended default. This Bergamot path is a faithful
 *    implementation of the documented bergamot-translator API, but the exact
 *    emscripten glue/model packaging varies by release — after fetching, if
 *    translation fails, check that the glue version matches the gemm-precision
 *    and file names used below (see translator-worker.js).
 *
 * This module is loaded lazily (dynamic import) by engine-registry.js.
 */
(function (global) {
  "use strict";

  const api = (typeof browser !== "undefined") ? browser : chrome;
  const TARGET = "en";

  let registry = null;        // models/registry.json contents
  let registryTried = false;

  async function loadRegistry() {
    if (registryTried) return registry;
    registryTried = true;
    try {
      const url = api.runtime.getURL("models/registry.json");
      const resp = await fetch(url);
      if (resp.ok) registry = await resp.json();
    } catch (e) { registry = null; }
    return registry;
  }

  // One worker per source language, reused across calls.
  const workers = new Map();

  function pairFor(src) { return `${src}${TARGET}`; }

  async function makeWorker(src) {
    const reg = await loadRegistry();
    const pair = pairFor(src);
    if (!reg || !reg.pairs || !reg.pairs[pair]) return null;

    const worker = new Worker(api.runtime.getURL("engines/bergamot/translator-worker.js"));
    const files = reg.pairs[pair]; // { model, lex, vocab | srcvocab+trgvocab, gemm }

    // Resolve relative model paths to absolute extension URLs.
    const toUrl = (p) => api.runtime.getURL("models/" + pair + "/" + p);
    const config = {
      type: "load",
      pair,
      gemm: files.gemm || "int8shiftAlphaAll",
      urls: {
        model: toUrl(files.model),
        lex: toUrl(files.lex),
        vocab: files.vocab ? toUrl(files.vocab) : null,
        srcvocab: files.srcvocab ? toUrl(files.srcvocab) : null,
        trgvocab: files.trgvocab ? toUrl(files.trgvocab) : null
      },
      glue: api.runtime.getURL("engines/bergamot/bergamot-translator-worker.js"),
      wasm: api.runtime.getURL("engines/bergamot/bergamot-translator-worker.wasm")
    };

    const ready = new Promise((resolve, reject) => {
      const onMsg = (e) => {
        if (e.data?.type === "ready") { worker.removeEventListener("message", onMsg); resolve(true); }
        else if (e.data?.type === "error") { worker.removeEventListener("message", onMsg); reject(new Error(e.data.error)); }
      };
      worker.addEventListener("message", onMsg);
    });
    worker.postMessage(config);
    await ready;
    return worker;
  }

  function translateWith(worker, text) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        if (e.data?.id !== id) return;
        worker.removeEventListener("message", onMsg);
        if (e.data.type === "result") resolve(e.data.text);
        else reject(new Error(e.data.error || "translate failed"));
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ type: "translate", id, text });
    });
  }

  const engine = {
    id: "bergamot",

    async isSupported() {
      const reg = await loadRegistry();
      return !!(reg && reg.pairs && Object.keys(reg.pairs).length);
    },

    async detect() { return null; },

    async canTranslate(src) {
      if (!src || src === TARGET) return "no";
      const reg = await loadRegistry();
      return (reg && reg.pairs && reg.pairs[pairFor(src)]) ? "ready" : "no";
    },

    async createSession(src) {
      if (!src || src === TARGET) return null;
      let worker = workers.get(src);
      if (!worker) {
        worker = await makeWorker(src);
        if (!worker) return null;
        workers.set(src, worker);
      }
      return {
        async translate(text) { return await translateWith(worker, text); },
        destroy() { /* keep worker warm for the session */ }
      };
    }
  };

  (global.TLEngines = global.TLEngines || {}).bergamot = engine;
})(typeof self !== "undefined" ? self : window);
