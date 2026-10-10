# models/

This folder holds the **optional** offline neural-translation models used by the
Bergamot engine (`engines/engine-bergamot.js`). It is **empty by default** —
the extension works without it using the browser's built-in on-device
Translator API (Chrome/Edge 138+).

## When do I need these?

Only if you want **fully offline translation that also works on Firefox** (and
on Chromium browsers that don't expose the built-in Translator API).

## How to fill it

From the extension root run **one** of:

```bash
node scripts/fetch-models.mjs es fr de it pt ru
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\fetch-models.ps1 es fr de it pt ru
```

Each language code you pass is downloaded as an `XX -> en` pair (the same
models Firefox Translations uses), gunzipped into `models/<pair>/`, and
recorded in `registry.json`.

You also need the Bergamot **WASM engine** files in `engines/bergamot/`
(`bergamot-translator-worker.js` and `.wasm`). See the comments at the top of
`scripts/fetch-models.mjs` for where to get them.

## Size (approximate)

Each `XX -> en` model set is roughly **15–40 MB** on disk after gunzip. A set of
~8 common languages is ~200–300 MB. Bundling *every* language Mozilla ships
(~40 pairs) would be **~1 GB+**, which is why models are fetched on demand
rather than shipped inside the extension — see the main README's trade-offs.
