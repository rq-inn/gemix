import { loadCsv } from "./csv.js";

export async function loadMessages() {
  const rows = await loadCsv("./data/message.csv");
  const map = new Map();
  rows.forEach((row) => map.set(row.key, row));
  return map;
}

export function getMessage(messages, key, languageNumber) {
  const row = messages.get(key);
  if (!row) {
    return key;
  }
  const resolvedKey = `name_L${languageNumber}`;
  return row[resolvedKey] || row.name_L1 || key;
}
