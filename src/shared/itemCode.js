// src/shared/itemCode.js
// Linking/UI + QR payload helper for QR-first migration.
// PURE — no imports, no aliases, no Firebase. Additive; legacy barcode preserved.
// Priority everywhere: itemId → qrId → barcode.

/** Display/print code for a product or item: new QR identity first, legacy barcode last. */
export function itemCode(p) {
  if (!p) return '';
  return p.itemId || p.qrId || p.barcode || '';
}

/** True once a product has been linked to a QR item. */
export function isQrLinked(p) {
  return !!(p && (p.itemId || p.qrId));
}

/** Is this a new QR identity (SKKL-ITM-XXXXXX) vs a legacy barcode? */
export function isItemId(value) {
  return /^SKKL-ITM-\d{6,}$/.test(String(value || '').trim().toUpperCase());
}
