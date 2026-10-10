# Translate to English (On-Device)

A Manifest V3 browser extension that **automatically translates any webpage into
English**, on-device, with **no API keys and no accounts**. It auto-detects the
page language, leaves English pages alone, keeps up with dynamically loaded
content (SPAs, infinite scroll), and gives you a simple toolbar on/off switch
plus per-page translate/restore.

---

## ⚠️ Read this first: the honest trade-off

You asked for **every language pre-bundled, nothing downloaded after setup,
working on every browser, with no keys and a practical size**. In reality those
constraints *cannot all be true at once* today — so this extension uses a
**layered approach** and tells you exactly what each layer gives you:

| Layer | Works on | Offline? | Downloads? | Keys/Account? | Languages |
|-------|----------|----------|-----------|---------------|-----------|
| **1. Browser built-in** (default) | Chrome/Edge 138+, Chromium browsers that expose it | Yes, runs on-device | The **browser** fetches a small pack the first time each language is used, then caches it offline | **None** | All languages the browser's Translator API supports |
| **2. Bergamot WASM** (optional) | **Every** browser incl. Firefox | Yes, fully offline from first use | You fetch model files **once** via the included script | **None** | The languages you choose to fetch |
| **3. Online fallback** (opt-in, off) | Every browser | **No — online only** | No | **None** (keyless MyMemory) | Many |

**Why not literally bundle every language inside the extension?** The Bergamot
neural models are ~15–40 MB **per language pair**. Bundling all ~40 that Mozilla
ships would make the extension **~1 GB+** — impractical to copy around or load
unpacked. So:

- **On Chrome/Edge (your primary targets):** nothing to download manually. The
  built-in engine covers everything, on-device, no keys. This is the default and
  the recommended path. The only caveat is that the browser itself fetches a
  language pack the first time you hit a new language (one-time, cached, free).
- **For true "nothing ever leaves the device, even on Firefox":** use Layer 2 and
  run the fetch script for the languages you care about (defaults to 8 common
  ones, ~200–300 MB). This is the honest ceiling on "everything bundled."
- **The online fallback (Layer 3) is OFF by default** and clearly flagged,
  because it sends page text to a third party. It uses **no key and no account**,
  matching your "no keys" rule, but it is not private.

**What is bundled in this download:** all the extension code + working PNG icons
(~tens of KB). **What is not:** the optional Bergamot WASM engine and model files
(fetched by the script). The extension is fully functional on Chrome/Edge 138+
**without** fetching anything.

---

## Files

```
translate-to-english/
├── manifest.json                 # Manifest V3 (Chromium: Chrome/Edge/Brave/Opera)
├── manifest.firefox.json         # Firefox variant (see "Firefox" below)
├── background.js                 # Service worker: settings, badge, online fetch
├── content/
│   ├── content.js                # Detects, translates, watches dynamic content, restore
│   └── content.css               # Styles for the small status toast
├── engines/
│   ├── engine-builtin.js         # Browser built-in Translator API (default)
│   ├── engine-bergamot.js        # Optional offline WASM engine (all browsers)
│   ├── engine-online.js          # Optional keyless online fallback (off by default)
│   ├── engine-registry.js        # Chooses the best available engine
│   └── bergamot/
│       └── translator-worker.js  # Web Worker that drives the Bergamot WASM engine
├── lib/
│   └── detect.js                 # Tiny offline language detector (fallback)
├── popup/
│   ├── popup.html / .css / .js   # Toolbar popup UI and logic
├── icons/
│   └── icon-16/32/48/128.png     # Generated globe icons (included)
├── models/
│   ├── registry.json             # Which offline models are installed (empty by default)
│   └── README.md
└── scripts/
    ├── fetch-models.mjs          # Node downloader for offline models
    └── fetch-models.ps1          # PowerShell downloader (no Node needed)
```

---

## Install — Chrome / Edge / Brave / Opera (beginner-friendly)

You'll load the folder as an "unpacked extension." No store, no account.

1. Make sure you're on a recent version: **Chrome or Edge 138 or newer** (menu →
   Help → About). Brave/Opera: use a recent build (they're Chromium-based; the
   built-in engine may be gated — if translation says it's unavailable, use the
   optional offline engine below).
2. Download/copy this whole `translate-to-english` folder somewhere permanent
   (don't delete it later — the browser loads it from this location).
3. Open the Extensions page:
   - Chrome: type `chrome://extensions` in the address bar, press Enter.
   - Edge: type `edge://extensions`.
   - Brave: `brave://extensions`. Opera: `opera://extensions`.
4. Turn on **Developer mode** (toggle, usually top-right).
5. Click **Load unpacked**.
6. Select the `translate-to-english` folder (the one containing `manifest.json`).
7. You'll see the globe icon appear in the toolbar. Pin it if you like.
8. Open any non-English page (e.g. a French or Spanish news site). It should
   translate to English automatically. First use of a new language may pause a
   second while the browser prepares that language — a small toast tells you.

> If you don't see a toolbar icon, click the puzzle-piece (Extensions) button and
> pin "Translate to English".

---

## Install — Firefox (beginner-friendly)

Firefox does **not** expose the Chromium built-in Translator API to extensions,
so on Firefox you must use the **offline Bergamot engine** (fetch models first —
see below). Then:

1. First, rename the manifest so Firefox uses its version:
   - Keep a copy of `manifest.json`, then **replace** `manifest.json` with the
     contents of `manifest.firefox.json` (or rename `manifest.firefox.json` to
     `manifest.json`). The key differences are already written for you: Firefox
     uses `background.scripts` instead of a `service_worker`, and adds a
     `browser_specific_settings.gecko` id.
2. In Firefox, type `about:debugging#/runtime/this-firefox` in the address bar.
3. Click **Load Temporary Add-on…**.
4. Select the `manifest.json` file inside the folder.
5. The extension loads until you restart Firefox (temporary add-ons are cleared
   on restart; for a permanent install you'd need to sign/package it, which is
   out of scope here).

> On Firefox, if you haven't fetched any offline models, pages won't translate
> (there's no built-in engine to fall back to). Run the fetch script first, or
> enable the online fallback in the popup.

---

## Using it

Click the toolbar globe to open the popup:

- **Auto-translate pages** (master switch): ON = every non-English page you open
  is translated automatically on load. OFF = pages load in their original
  language. Changing this applies to the **next** page you load (as requested).
- **This page → Translate now / Show original**: translate or restore the
  current page right now, without touching the global setting.
- **Advanced**:
  - *Translation engine*: Auto (recommended), Browser built-in, Bundled offline
    (Bergamot), or Online fallback only.
  - *Allow online fallback*: opt-in. Only used when on-device translation can't
    handle a language. **Sends page text to MyMemory — online, not private.**

A small toast appears at the bottom-right for progress ("Preparing the … model")
or errors ("Couldn't translate this page…") so it never fails silently.

---

## Enable the optional offline engine (all browsers / Firefox)

1. From the extension folder, fetch some models (pick the languages you want):

   ```bash
   node scripts/fetch-models.mjs es fr de it pt ru
   ```
   or, on Windows without Node:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\fetch-models.ps1 es fr de it pt ru
   ```

2. Get the Bergamot **WASM engine** files into `engines/bergamot/`
   (`bergamot-translator-worker.js` and `.wasm`). See the comment block at the
   top of `scripts/fetch-models.mjs` for where to obtain them (e.g. from the
   Firefox Translations add-on or a browsermt/bergamot-translator build), then
   either set the two URLs in the script or copy the files in manually.
3. Reload the extension (Extensions page → reload). Set the engine to "Auto" or
   "Bundled offline". Done — those languages now translate fully offline on any
   browser.

> **Honesty note:** The built-in engine path is the tested default. The Bergamot
> integration follows the documented bergamot-translator API, but exact packaging
> varies by release; if it errors after fetching, see the troubleshooting notes
> in `engines/bergamot/translator-worker.js`.

---

## Scope & privacy

- No accounts, no analytics, no telemetry, no tracking.
- The only path that ever sends data off your device is the **opt-in** online
  fallback (off by default). Everything else is on-device.
- Only the top frame of each page is translated (not cross-origin iframes).
- `code`, `pre`, `script`, `style`, and editable fields are left untouched so
  the extension doesn't mangle code samples or forms.
```
