/*
 * engines/bergamot/translator-worker.js
 * --------------------------------------
 * Web Worker that drives the Bergamot WASM translation engine.
 * It receives { type:"load", ... } once, builds a TranslationModel, then
 * answers { type:"translate", id, text } messages with { type:"result", id, text }.
 *
 * This follows the documented browsermt/bergamot-translator WASM API (the
 * same engine Firefox Translations uses). The emscripten glue + .wasm and the
 * model files are fetched by scripts/fetch-models — they are NOT in the repo.
 *
 * If your fetched glue is a newer/older build and translation errors out, the
 * two things most likely to need tweaking are:
 *   (a) the `gemm-precision` value in buildConfig() — must match the model
 *       file type (e.g. int8shiftAlphaAll for *.intgemm.alphas.bin), and
 *   (b) whether the model uses a single shared vocab or separate src/trg vocab.
 */

/* global Module, importScripts */

let service = null;
let model = null;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load(msg);
      self.postMessage({ type: "ready" });
    } else if (msg.type === "translate") {
      const text = translate(msg.text);
      self.postMessage({ type: "result", id: msg.id, text });
    }
  } catch (err) {
    if (msg.type === "translate") {
      self.postMessage({ type: "error", id: msg.id, error: String(err && err.message || err) });
    } else {
      self.postMessage({ type: "error", error: String(err && err.message || err) });
    }
  }
};

async function load(cfg) {
  // 1) Boot the emscripten module. The glue reads `Module` from global scope.
  await new Promise((resolve, reject) => {
    self.Module = {
      locateFile: (path) => (path.endsWith(".wasm") ? cfg.wasm : path),
      onRuntimeInitialized: () => resolve(),
      onAbort: (what) => reject(new Error("WASM abort: " + what))
    };
    try {
      importScripts(cfg.glue);
    } catch (err) {
      reject(new Error("Failed to load bergamot glue: " + err.message +
        " (did you run scripts/fetch-models?)"));
    }
  });

  // 2) Create the blocking translation service.
  service = new Module.BlockingService({ cacheSize: 0 });

  // 3) Download + align the model binaries.
  const [modelBuf, lexBuf, ...vocabBufs] = await Promise.all([
    fetchBytes(cfg.urls.model),
    fetchBytes(cfg.urls.lex),
    ...resolveVocabUrls(cfg.urls).map(fetchBytes)
  ]);

  const modelMem = alignedFrom(modelBuf, 256);
  const lexMem = alignedFrom(lexBuf, 64);
  const vocabMems = new Module.AlignedMemoryList();
  for (const vb of vocabBufs) vocabMems.push_back(alignedFrom(vb, 64));

  // 4) Build the model from an in-memory config + the aligned buffers.
  const config = buildConfig(cfg.gemm);
  model = new Module.TranslationModel(config, modelMem, lexMem, vocabMems, null);
}

function resolveVocabUrls(urls) {
  if (urls.vocab) return [urls.vocab];               // shared vocab
  return [urls.srcvocab, urls.trgvocab].filter(Boolean); // separate vocabs
}

function buildConfig(gemm) {
  // Minimal Marian/Bergamot config. Values mirror Firefox Translations.
  return [
    "beam-size: 1",
    "normalize: 1.0",
    "word-penalty: 0",
    "max-length-break: 128",
    "mini-batch-words: 1024",
    "workspace: 128",
    "max-length-factor: 2.0",
    "skip-cost: true",
    "cpu-threads: 0",
    "quiet: true",
    "quiet-translation: true",
    "gemm-precision: " + (gemm || "int8shiftAlphaAll"),
    "alignment: soft"
  ].join("\n") + "\n";
}

function translate(text) {
  if (!model || !service) throw new Error("Model not loaded");
  const input = new Module.VectorString();
  input.push_back(text);

  const options = new Module.VectorResponseOptions();
  options.push_back({ qualityScores: false, alignment: false, html: false });

  const responses = service.translate(model, input, options);
  const out = responses.size() ? responses.get(0).getTranslatedText() : text;

  input.delete(); options.delete(); responses.delete();
  return out;
}

// ---- helpers -----------------------------------------------------------
async function fetchBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Fetch failed: " + url + " (" + resp.status + ")");
  return await resp.arrayBuffer();
}

function alignedFrom(buffer, alignment) {
  const bytes = new Uint8Array(buffer);
  const mem = new Module.AlignedMemory(bytes.byteLength, alignment);
  mem.getByteArrayView().set(bytes);
  return mem;
}
