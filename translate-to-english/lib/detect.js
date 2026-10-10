/*
 * lib/detect.js — tiny, offline, dependency-free language detector.
 * ------------------------------------------------------------------
 * Exposes a global `TLDetect` with one method:
 *     TLDetect.detect(text) -> { lang: "fr", confidence: 0.8 } | { lang: null }
 *
 * Strategy (fast + good-enough, not academic-grade):
 *   1. Unicode-script detection for non-Latin writing systems. This is very
 *      reliable (Cyrillic, Greek, Arabic, Hebrew, CJK, Devanagari, Thai...).
 *   2. For Latin-script text, score against short stop-word lists for the
 *      most common languages, plus diacritic hints.
 *
 * On Chrome/Edge the content script prefers the browser's built-in
 * `LanguageDetector` API (much stronger); this file is the cross-browser
 * fallback and the "is this English?" gatekeeper.
 */
(function (global) {
  "use strict";

  // --- 1. Script-range detection (non-Latin) -----------------------------
  // Each entry: [regex, language]. Order matters (specific before generic).
  const SCRIPTS = [
    [/[぀-ゟ゠-ヿ]/, "ja"], // Hiragana / Katakana => Japanese
    [/[가-힯ᄀ-ᇿ]/, "ko"], // Hangul => Korean
    [/[一-鿿㐀-䶿]/, "zh"], // CJK ideographs (no kana) => Chinese
    [/[Ѐ-ӿ]/, "ru"],              // Cyrillic => (default) Russian
    [/[Ͱ-Ͽ]/, "el"],              // Greek
    [/[֐-׿]/, "he"],              // Hebrew
    [/[؀-ۿݐ-ݿ]/, "ar"], // Arabic
    [/[ऀ-ॿ]/, "hi"],              // Devanagari => Hindi
    [/[฀-๿]/, "th"],              // Thai
    [/[ঀ-৿]/, "bn"],              // Bengali
    [/[਀-੿]/, "pa"],              // Gurmukhi => Punjabi
    [/[஀-௿]/, "ta"],              // Tamil
    [/[ఀ-౿]/, "te"],              // Telugu
    [/[ሀ-፿]/, "am"]               // Ethiopic => Amharic
  ];

  // --- 2. Latin-script stop-word fingerprints ----------------------------
  // Small but high-signal word lists. Scoring counts how many of a page's
  // words fall in each list.
  const STOPWORDS = {
    en: ["the", "and", "is", "to", "of", "in", "that", "it", "you", "for", "with", "this", "are", "on", "be"],
    es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "es", "por", "con", "para", "no", "se"],
    fr: ["le", "la", "les", "des", "et", "est", "un", "une", "que", "dans", "pour", "pas", "sur", "avec", "ce", "nous"],
    de: ["der", "die", "das", "und", "ist", "ein", "eine", "den", "nicht", "mit", "auf", "für", "von", "zu", "dem"],
    it: ["il", "la", "che", "di", "e", "un", "una", "per", "non", "con", "sono", "questo", "come", "del", "si"],
    pt: ["o", "a", "os", "as", "de", "que", "e", "um", "uma", "para", "com", "não", "por", "se", "como", "do"],
    nl: ["de", "het", "een", "en", "van", "is", "dat", "op", "te", "niet", "met", "voor", "zijn", "je", "aan"],
    pl: ["i", "w", "nie", "na", "to", "że", "się", "jest", "do", "z", "co", "tak", "jak", "ale", "po"],
    sv: ["och", "att", "det", "som", "en", "är", "på", "för", "med", "av", "den", "inte", "om", "har", "jag"],
    tr: ["ve", "bir", "bu", "için", "ile", "da", "de", "çok", "ne", "var", "daha", "gibi", "ama", "olarak"],
    id: ["yang", "dan", "di", "ini", "itu", "dengan", "untuk", "tidak", "pada", "dari", "ke", "akan", "saya"],
    vi: ["và", "của", "là", "có", "các", "được", "cho", "một", "những", "trong", "không", "người", "này"]
  };

  // Diacritic hints give Latin languages an extra nudge.
  const DIACRITICS = {
    es: /[ñáíóúü¿¡]/i,
    fr: /[àâçéèêëîïôûùüÿœ]/i,
    de: /[äöüß]/i,
    pt: /[ãõáâàçéêíóôú]/i,
    pl: /[ąćęłńóśźż]/i,
    sv: /[åäö]/i,
    tr: /[çğıöşü]/i,
    vi: /[ăâđêôơưàảãạ]/i
  };

  function detect(text) {
    if (!text) return { lang: null, confidence: 0 };
    const sample = text.slice(0, 2000);

    // 1) Non-Latin scripts win immediately when present in meaningful amount.
    for (const [re, lang] of SCRIPTS) {
      const matches = sample.match(new RegExp(re.source, "g"));
      if (matches && matches.length >= 3) {
        return { lang, confidence: 0.95 };
      }
    }

    // 2) Latin stop-word scoring.
    const words = sample.toLowerCase().match(/[a-zàâäçéèêëîïôûùüÿœñáíóúãõ]+/g) || [];
    if (words.length < 3) return { lang: null, confidence: 0 };

    const scores = {};
    for (const lang in STOPWORDS) scores[lang] = 0;

    const wordSet = {};
    for (const lang in STOPWORDS) {
      wordSet[lang] = new Set(STOPWORDS[lang]);
    }
    for (const w of words) {
      for (const lang in wordSet) {
        if (wordSet[lang].has(w)) scores[lang] += 1;
      }
    }
    // Diacritic bonus.
    for (const lang in DIACRITICS) {
      if (DIACRITICS[lang].test(sample)) scores[lang] += 2;
    }

    let best = null, bestScore = 0, total = 0;
    for (const lang in scores) {
      total += scores[lang];
      if (scores[lang] > bestScore) { bestScore = scores[lang]; best = lang; }
    }

    if (!best || bestScore === 0) {
      // All ASCII, no stop-word hits — most likely short English or a proper noun.
      return { lang: "en", confidence: 0.3 };
    }

    const confidence = Math.min(0.9, bestScore / Math.max(6, words.length / 4));
    return { lang: best, confidence };
  }

  global.TLDetect = { detect };
})(typeof self !== "undefined" ? self : window);
