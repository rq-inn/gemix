import { loadCsv } from "./csv.js";

export async function loadLanguages() {
  return loadCsv("./data/language.csv");
}

export function detectInitialLanguageNumber(languages) {
  const browserLanguage = (navigator.language || "en").toLowerCase();

  if (browserLanguage.startsWith("ja")) {
    return findLanguageNumber(languages, ["日本語", "japanese"]) ?? "2";
  }

  if (browserLanguage.startsWith("zh-tw") || browserLanguage.startsWith("zh-hk")) {
    return findLanguageNumber(languages, ["繁體中文", "traditional"]) ?? "3";
  }

  if (browserLanguage.startsWith("zh-cn") || browserLanguage.startsWith("zh-sg")) {
    return findLanguageNumber(languages, ["繁體中文", "traditional"]) ?? "3";
  }

  return findLanguageNumber(languages, ["english"]) ?? "1";
}

function findLanguageNumber(languages, candidates) {
  const lowered = candidates.map((value) => value.toLowerCase());
  const match = languages.find((item) => lowered.some((candidate) => item.language.toLowerCase().includes(candidate)));
  return match?.Number;
}
