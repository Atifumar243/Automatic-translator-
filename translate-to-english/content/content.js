/*
 * content/content.js — the page-side orchestrator (fully automatic).
 * ------------------------------------------------------------------
 * Flow (no buttons needed):
 *   1. On load, if auto-translate is ON, start watching the page.
 *   2. As soon as enough text exists, detect the language. English pages are
 *      left untouched. This is observer-driven, so single-page apps that
 *      render their text AFTER load (e.g. campus portals) still get caught.
 *   3. If the language model is already downloaded -> translate immediately,
 *      zero interaction.
 *      If Chrome still needs to DOWNLOAD the model, Chrome requires one user
 *      gesture first (it throws NotAllowedError otherwise). So we quietly wait
 *      for the user's first natural click/keypress anywhere on the page and
 *      kick off the download then. After that one-time download the language
 *      is cached and future pages translate with no interaction at all.
 *   4. New/changed content (infinite scroll, SPA navigation) is translated as
 *      it appears.
 *
 * Depends on globals from earlier content scripts:
 *   TLDetect (lib/detect.js), TLEngines + TLRegistry (engines/*).
 */
(function () {
  "use strict";

  const api = (typeof browser !== "undefined") ? browser : chrome;

  // ---- State -----------------------------------------------------------
  let settings = null;
  let pageLang = null;
  let mode = "idle";              // "idle" | "need-gesture" | "translating" | "translated"
  let activeEngineId = null;
  let session = null;
  let pendingPlan = null;         // engine plan awaiting a user gesture to download
  let busy = false;               // guard against overlapping attempts
  const records = [];             // { node, original } for restore
  let translated = new WeakSet(); // text nodes already translated (reset on restore)
  let observer = null;
  let gestureArmed = false;
  let hintShown = false;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "KBD", "SAMP", "VAR"
  ]);
  const MAX_NODES_PER_PASS = 1500;
  const CONCURRENCY = 6;
  const MIN_LETTERS = 12;         // need at least this much text before detecting

  // ---- Boot ------------------------------------------------------------
  init();

  async function init() {
    settings = await getSettings();
    listenForMessages();
    if (settings.enabled) start();
  }

  function start() {
    startObserver();                 // watch from the very beginning
    armGesture();                    // ready to use the first interaction if needed
    // First attempt shortly after load; the observer handles anything later.
    setTimeout(() => attemptTranslate(false).catch(reportError), 500);
  }

  async function getSettings() {
    const defaults = {
      enabled: true, targetLang: "en", engine: "auto",
      allowOnline: false, skipLangs: ["en"]
    };
    try {
      const stored = await api.storage.local.get(Object.keys(defaults));
      return { ...defaults, ...stored };
    } catch (e) {
      return defaults;
    }
  }

  // ---- Core attempt ----------------------------------------------------
  // force=true comes from the popup's manual "Translate now".
  async function attemptTranslate(force) {
    if (busy) return;
    if (mode === "translated" || mode === "translating") return;
    if (pendingPlan && !force) return; // already waiting for a gesture

    const sample = sampleText();
    if (!force && letterCount(sample) < MIN_LETTERS) return; // wait for content

    const lang = await TLRegistry.detectLanguage(sample);
    if (!lang || lang === "en" || settings.skipLangs.includes(lang)) {
      if (force) toast("This page already looks like English.", "info");
      return; // stay idle; observer may re-trigger as content changes
    }
    pageLang = lang;
    reportState();

    const plan = await TLRegistry.planEngine(lang, settings);
    if (!plan) {
      if (force) toast("No translation engine available for “" + langName(lang) + "”.", "error");
      return;
    }

    // Built-in engine needs a user gesture to START a model download.
    const needsGesture = plan.engine.id === "builtin" && plan.status === "downloadable";
    if (needsGesture && !force) {
      pendingPlan = plan;
      mode = "need-gesture";
      reportState();
      if (!hintShown) {
        hintShown = true;
        toast("Detected " + langName(lang) + ". Click anywhere on the page to translate to English (one-time setup for this language).", "info", 6000);
      }
      return; // armGesture() will finish the job on the next interaction
    }

    await doTranslate(plan);
  }

  async function doTranslate(plan) {
    busy = true;
    mode = "translating";
    reportState();
    let announced = false;
    try {
      session = await TLRegistry.openSession(plan.engine, pageLang, (frac) => {
        if (!announced) { announced = true; toast("Preparing the " + langName(pageLang) + " model…", "info", 0); }
        if (frac >= 1) dismissToast();
      });
      if (!session) {
        // The chosen engine failed to open; try any other engine once.
        const alt = await TLRegistry.pickEngine(pageLang, settings);
        if (alt) { session = alt.session; plan = { engine: alt.engine, status: alt.status }; }
      }
      if (!session) {
        toast("Couldn't start translation for “" + langName(pageLang) + "”.", "error");
        mode = "idle"; busy = false; reportState();
        return;
      }
      activeEngineId = plan.engine.id;
      if (announced) dismissToast();

      const nodes = collectTextNodes(document.body);
      await translateNodes(nodes);
      mode = "translated";
      reportState();
    } catch (e) {
      reportError(e);
      mode = "idle";
    } finally {
      busy = false;
    }
  }

  // ---- User-gesture download gate -------------------------------------
  function armGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    const onGesture = async () => {
      if (!pendingPlan || mode === "translated" || mode === "translating") return;
      const plan = pendingPlan;
      pendingPlan = null;
      // create() is CALLED synchronously inside this gesture handler, so Chrome
      // allows the model download to begin.
      await doTranslate(plan).catch(reportError);
    };
    // Capture phase, passive, so we never interfere with the page's own handlers.
    window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });
  }

  // ---- DOM text handling ----------------------------------------------
  function letterCount(s) { return (s.match(/\p{L}/gu) || []).length; }

  function sampleText() {
    const nodes = collectTextNodes(document.body, 500);
    let s = "";
    for (const n of nodes) {
      s += n.nodeValue.trim() + " ";
      if (s.length > 3000) break;
    }
    return s.trim();
  }

  function collectTextNodes(root, limit) {
    const out = [];
    if (!root) return out;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
        if (translated.has(node)) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (el.closest("#tl-toast")) return NodeFilter.FILTER_REJECT;
        if (!/\p{L}/u.test(v)) return NodeFilter.FILTER_REJECT; // numbers/symbols only
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const cap = limit || MAX_NODES_PER_PASS;
    let n;
    while ((n = walker.nextNode()) && out.length < cap) out.push(n);
    return out;
  }

  async function translateNodes(nodes) {
    if (!nodes.length || !session) return;
    let i = 0;
    async function worker() {
      while (i < nodes.length) {
        const node = nodes[i++];
        if (translated.has(node)) continue;
        const original = node.nodeValue;
        try {
          const out = await session.translate(original.trim());
          if (!node.isConnected) continue;
          if (out && out !== original.trim()) {
            records.push({ node, original });
            const lead = original.match(/^\s*/)[0];
            const trail = original.match(/\s*$/)[0];
            node.nodeValue = lead + out + trail;
          }
          translated.add(node);
        } catch (e) {
          translated.add(node); // don't retry a failing node forever
        }
      }
    }
    const pool = [];
    for (let k = 0; k < Math.min(CONCURRENCY, nodes.length); k++) pool.push(worker());
    await Promise.all(pool);
  }

  // ---- Observer: SPA / dynamic content --------------------------------
  function startObserver() {
    if (observer) return;
    let pending = [];
    let timer = null;

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((added) => {
            if (added.nodeType === Node.ELEMENT_NODE) pending.push(added);
            else if (added.nodeType === Node.TEXT_NODE && added.parentElement) pending.push(added.parentElement);
          });
        } else if (m.type === "characterData" && m.target.parentElement) {
          pending.push(m.target.parentElement);
        }
      }
      clearTimeout(timer);
      timer = setTimeout(flush, 300); // debounce bursts
    });

    const target = document.body || document.documentElement;
    observer.observe(target, { childList: true, subtree: true, characterData: true });

    async function flush() {
      const roots = pending; pending = [];

      if (mode === "translated" && session) {
        // Translate newly added/changed content.
        const nodes = [];
        for (const r of roots) if (r.isConnected) nodes.push(...collectTextNodes(r));
        if (nodes.length) await translateNodes(nodes).catch(() => {});
      } else if ((mode === "idle" || mode === "need-gesture") && settings.enabled) {
        // Content may have just appeared (SPA). Re-attempt detection.
        if (mode === "idle") attemptTranslate(false).catch(() => {});
      }
    }
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  // ---- Restore ---------------------------------------------------------
  function restoreOriginal() {
    stopObserver();
    for (const { node, original } of records) {
      if (node.isConnected) node.nodeValue = original;
    }
    records.length = 0;
    translated = new WeakSet();
    pendingPlan = null;
    mode = "idle";
    reportState();
  }

  // ---- Messaging with popup -------------------------------------------
  function listenForMessages() {
    api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      (async () => {
        switch (msg?.type) {
          case "GET_STATE":
            sendResponse({
              ok: true, mode, pageLang, engineId: activeEngineId,
              builtinSupported: await (TLEngines.builtin?.isSupported() ?? false)
            });
            break;
          case "TRANSLATE_PAGE":           // optional manual override
            await attemptTranslate(true).catch(reportError);
            sendResponse({ ok: true, mode });
            break;
          case "RESTORE_PAGE":
            restoreOriginal();
            sendResponse({ ok: true, mode });
            break;
          case "SETTINGS_CHANGED":
            settings = { ...settings, ...msg.settings };
            sendResponse({ ok: true });
            break;
          default:
            sendResponse({ ok: false });
        }
      })();
      return true;
    });
  }

  // ---- Helpers ---------------------------------------------------------
  let dn;
  try { dn = new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) { dn = null; }
  function langName(code) { try { return dn ? dn.of(code) : code; } catch (e) { return code; } }

  function reportState() {
    try {
      api.runtime.sendMessage({ type: "MODE_UPDATE", mode, pageLang, engineId: activeEngineId }).catch(() => {});
    } catch (e) {}
  }

  function reportError(err) {
    console.warn("[Translate to English]", err);
    toast("Translation error: " + (err && err.message ? err.message : err), "error");
  }

  // Small non-intrusive toast (bottom-right). duration 0 = sticky.
  let toastTimer = null;
  function toast(text, kind, duration) {
    let el = document.getElementById("tl-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "tl-toast";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
    el.setAttribute("data-kind", kind || "info");
    el.classList.add("tl-toast-show");
    clearTimeout(toastTimer);
    if (duration !== 0) toastTimer = setTimeout(dismissToast, duration || 4000);
  }
  function dismissToast() {
    const el = document.getElementById("tl-toast");
    if (el) el.classList.remove("tl-toast-show");
  }
})();
