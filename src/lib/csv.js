// src/lib/csv.js
//
// Simple RFC-4180-ish CSV parser that handles quoted fields with commas and
// embedded "" quotes. Designed for our bulk-import flows; for adversarial
// input we'd use papaparse, but this keeps the bundle lean.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(cur); cur = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = []; cur = "";
      continue;
    }
    cur += c;
  }
  // tail
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], data: [] };
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((h) => h.trim());

  const data = dataRows
    .filter((r) => r.some((v) => String(v).trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
      return obj;
    });

  return { headers, data };
}
