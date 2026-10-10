/*
 * scripts/fetch-models.mjs — download Bergamot models (+ optionally the WASM
 * engine) for the OPTIONAL fully-offline engine.
 * ----------------------------------------------------------------------------
 * Run with Node 18+ (has global fetch + zlib). From the extension root:
 *
 *     node scripts/fetch-models.mjs es fr de it pt ru nl pl
 *
 * With no arguments it fetches a sensible default set. Each language XX is
 * fetched as the pair XX->en from Mozilla's firefox-translations-models repo
 * (the same models Firefox Translations uses), gunzipped, and written to
 * models/<pair>/. A models/registry.json is generated so the extension knows
 * which pairs are available.
 *
 * NOTE ON THE WASM ENGINE: the Bergamot WASM glue (.js) and engine (.wasm) are
 * NOT auto-downloadable from a single stable URL. Set WASM_JS_URL / WASM_WASM_URL
 * below (see the comment for sources) to have this script fetch them too;
 * otherwise it prints instructions and fetches only the models.
 *
 * You do NOT need this script at all if you only use the browser built-in
 * engine (Chrome/Edge 138+). This is for true-offline / Firefox coverage.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MODELS_DIR = join(ROOT, "models");
const BERGAMOT_DIR = join(ROOT, "engines", "bergamot");

// --- WASM engine sources (OPTIONAL — fill in to auto-download) --------------
// Good sources to copy these two files from:
//   1. The Firefox Translations add-on (unzip the .xpi, look under /controller/
//      or /bergamot/ for bergamot-translator-worker.{js,wasm}).
//   2. A browsermt/bergamot-translator CI/release build.
// Paste direct download URLs here, or leave blank to skip.
const WASM_JS_URL = "";     // -> engines/bergamot/bergamot-translator-worker.js
const WASM_WASM_URL = "";   // -> engines/bergamot/bergamot-translator-worker.wasm

// --- Model repo -------------------------------------------------------------
const GH = "https://api.github.com/repos/mozilla/firefox-translations-models/contents";
const RAW = "https://raw.githubusercontent.com/mozilla/firefox-translations-models/main";
const CHANNELS = ["prod", "dev"]; // look in prod first, then dev

const DEFAULT_LANGS = ["es", "fr", "de", "it", "pt", "ru", "nl", "pl"];

const langs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_LANGS;

async function ghList(path) {
  const resp = await fetch(`${GH}/${path}`, {
    headers: { "User-Agent": "translate-to-english-fetch", "Accept": "application/vnd.github+json" }
  });
  if (!resp.ok) return null;
  return await resp.json();
}

async function download(url) {
  const resp = await fetch(url, { headers: { "User-Agent": "translate-to-english-fetch" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

function classify(name) {
  // Returns a role for a model filename, or null if irrelevant.
  if (/^model\..*\.bin(\.gz)?$/.test(name)) return "model";
  if (/^lex\..*\.bin(\.gz)?$/.test(name)) return "lex";
  if (/^vocab\..*\.spm(\.gz)?$/.test(name)) return "vocab";
  if (/^srcvocab\..*\.spm(\.gz)?$/.test(name)) return "srcvocab";
  if (/^trgvocab\..*\.spm(\.gz)?$/.test(name)) return "trgvocab";
  return null;
}

function gemmFor(modelName) {
  // Pick the gemm-precision that matches the model file variant.
  if (modelName.includes("intgemm.alphas")) return "int8shiftAlphaAll";
  if (modelName.includes("intgemm")) return "int8shiftAll";
  return "int8shiftAlphaAll";
}

async function fetchPair(lang) {
  const pair = `${lang}en`;
  let listing = null, channel = null;
  for (const ch of CHANNELS) {
    listing = await ghList(`models/${ch}/${pair}`);
    if (Array.isArray(listing) && listing.length) { channel = ch; break; }
  }
  if (!listing || !Array.isArray(listing)) {
    console.warn(`  ✗ ${pair}: not found in the model repo (skipping)`);
    return null;
  }

  const roles = {};
  for (const f of listing) {
    const role = classify(f.name);
    if (role && !roles[role]) roles[role] = f.name;
  }
  if (!roles.model || !roles.lex || (!roles.vocab && !(roles.srcvocab && roles.trgvocab))) {
    console.warn(`  ✗ ${pair}: incomplete model file set (skipping)`);
    return null;
  }

  const outDir = join(MODELS_DIR, pair);
  await mkdir(outDir, { recursive: true });

  const entry = { gemm: gemmFor(roles.model) };
  for (const [role, fname] of Object.entries(roles)) {
    const url = `${RAW}/models/${channel}/${pair}/${fname}`;
    let buf = await download(url);
    let outName = fname;
    if (fname.endsWith(".gz")) {
      buf = gunzipSync(buf);           // store raw so the worker can mmap it
      outName = fname.slice(0, -3);
    }
    await writeFile(join(outDir, outName), buf);
    entry[role] = outName;
    console.log(`    • ${fname} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  console.log(`  ✓ ${pair} done`);
  return [pair, entry];
}

async function fetchWasm() {
  if (!WASM_JS_URL || !WASM_WASM_URL) {
    console.log(
      "\nℹ WASM engine not fetched (WASM_JS_URL / WASM_WASM_URL are blank).\n" +
      "  The built-in browser engine works without it. To enable the offline\n" +
      "  Bergamot engine, set those two URLs at the top of this script (see the\n" +
      "  comment for sources) and re-run, OR copy the two files manually into\n" +
      "  engines/bergamot/.\n"
    );
    return;
  }
  await mkdir(BERGAMOT_DIR, { recursive: true });
  console.log("Fetching WASM engine…");
  await writeFile(join(BERGAMOT_DIR, "bergamot-translator-worker.js"), await download(WASM_JS_URL));
  await writeFile(join(BERGAMOT_DIR, "bergamot-translator-worker.wasm"), await download(WASM_WASM_URL));
  console.log("  ✓ WASM engine saved");
}

(async () => {
  console.log(`Fetching ${langs.length} language pair(s) -> English: ${langs.join(", ")}\n`);
  await mkdir(MODELS_DIR, { recursive: true });

  const pairs = {};
  for (const lang of langs) {
    console.log(`${lang} -> en:`);
    const res = await fetchPair(lang).catch((e) => { console.warn("  ✗ " + e.message); return null; });
    if (res) pairs[res[0]] = res[1];
  }

  const registry = {
    generated: new Date().toISOString(),
    note: "Auto-generated by scripts/fetch-models.mjs. Each pair is <src>en.",
    pairs
  };
  await writeFile(join(MODELS_DIR, "registry.json"), JSON.stringify(registry, null, 2));
  console.log(`\nWrote models/registry.json with ${Object.keys(pairs).length} pair(s).`);

  await fetchWasm();
  console.log("\nDone.");
})();
