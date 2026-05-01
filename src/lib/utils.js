// src/lib/utils.js
import clsx from "clsx";

// 🎨 Tailwind className merger
export const cn = (...args) => clsx(args);

// 💰 Calculate jewellery item price
// metalRate is per 10g for gold, per kg for silver
export const calculateItemPrice = ({
  category,
  weight,
  karat,
  goldRate,
  silverRate,
  makingType,
  makingCharge,
  customPrice,
}) => {
  if (customPrice && Number(customPrice) > 0) {
    return {
      metalValue: 0,
      makingValue: 0,
      total: Number(customPrice),
    };
  }

  const w = Number(weight) || 0;

  // Determine purity
  const PURITY = {
    "24K": 0.999, "22K": 0.916, "20K": 0.833,
    "18K": 0.750, "14K": 0.583,
    "92.5": 0.925, "Sterling": 0.925, "80": 0.80,
    "N/A": 1,
  };
  const purity = PURITY[karat] || 1;

  // Per gram metal rate
  let perGramRate = 0;
  if (category === "Gold") {
    perGramRate = (Number(goldRate) || 0) / 10;
  } else if (category === "Silver") {
    perGramRate = (Number(silverRate) || 0) / 1000;
  }

  const metalValue = w * perGramRate * purity;

  // Making charge
  let makingValue = 0;
  const mc = Number(makingCharge) || 0;
  if (makingType === "per_gram") makingValue = w * mc;
  else if (makingType === "percent") makingValue = (metalValue * mc) / 100;
  else if (makingType === "fixed") makingValue = mc;

  return {
    metalValue: Math.round(metalValue * 100) / 100,
    makingValue: Math.round(makingValue * 100) / 100,
    total: Math.round((metalValue + makingValue) * 100) / 100,
  };
};

// 🧾 Generate bill number: SKKL-YYYYMMDD-XXX
export const generateBillNo = (prefix = "BILL") => {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${datePart}-${rand}`;
};

// 📅 Date range helpers
export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const startOfMonth = (d = new Date()) => {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
};

export const endOfMonth = (d = new Date()) => {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
};

export const lastNDays = (n) => {
  const end = endOfDay();
  const start = startOfDay();
  start.setDate(start.getDate() - (n - 1));
  return { start, end };
};

// 🔍 Safely get nested value
export const get = (obj, path, fallback = undefined) => {
  try {
    const result = path.split(".").reduce((o, k) => o?.[k], obj);
    return result === undefined ? fallback : result;
  } catch {
    return fallback;
  }
};

// 📊 Group array by key
export const groupBy = (arr, keyFn) => {
  return arr.reduce((acc, item) => {
    const key = typeof keyFn === "function" ? keyFn(item) : item[keyFn];
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
};

// 🔢 Sum array by key
export const sumBy = (arr, keyFn) => {
  return arr.reduce((acc, item) => {
    const v = typeof keyFn === "function" ? keyFn(item) : item[keyFn];
    return acc + (Number(v) || 0);
  }, 0);
};

// 🪪 Truncate text
export const truncate = (str, len = 30) => {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
};

// 📞 Format phone (Indian)
export const formatPhone = (p) => {
  if (!p) return "";
  const digits = String(p).replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0,5)} ${digits.slice(5)}`;
  return p;
};

// 🎲 Pick badge color by status
export const getStatusColor = (status, map = {}) => {
  return map[status] || "silver";
};

// 📥 Download data as CSV
export const downloadCSV = (rows, filename = "export.csv") => {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r =>
      headers.map(h => {
        const v = r[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
