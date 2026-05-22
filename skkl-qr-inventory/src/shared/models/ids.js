// src/shared/models/ids.js
// Permanent identity formatting for QR-first inventory.
// The QR payload IS the itemId string. Format: SKKL-ITM-000001
import { safeNumber, safeStr } from '@shared/safe';

export const ITEM_ID_PREFIX = 'SKKL-ITM-';
export const ITEM_ID_PAD = 6;

/** Build a canonical itemId from a running sequence integer. */
export function formatItemId(seq) {
  const n = safeNumber(seq, 0);
  return ITEM_ID_PREFIX + String(n).padStart(ITEM_ID_PAD, '0');
}

/** True if a string is a valid SKKL item id / QR payload. */
export function isItemId(value) {
  return /^SKKL-ITM-\d{6,}$/.test(safeStr(value).trim());
}

/** Extract the numeric sequence from an itemId (or null). */
export function itemIdSeq(itemId) {
  const m = /^SKKL-ITM-(\d+)$/.exec(safeStr(itemId).trim());
  return m ? parseInt(m[1], 10) : null;
}

/** Normalise a scanned/typed value into a canonical itemId, or '' if invalid. */
export function normalizeScan(raw) {
  const v = safeStr(raw).trim().toUpperCase();
  if (isItemId(v)) return v;
  // tolerate scanners that drop the prefix and send just digits
  if (/^\d{1,}$/.test(v)) return formatItemId(parseInt(v, 10));
  return '';
}

// Sequence allocator doc id (one per shop) in the `counters` collection.
export function itemSequenceDocId(shopId) {
  return `seq_items_${safeStr(shopId)}`;
}
