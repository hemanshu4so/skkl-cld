// src/modules/inventory/lib/qrIdentity.js
// QR = permanent identity ONLY. This module encodes/decodes the itemId STRING.
// It deliberately stores NO jewellery data in the QR. Reuses the restored
// pure-JS QR encoder from the barcode module.
import { qrSVG } from '@modules/barcode/lib/qr';
import { isItemId, normalizeScan } from '@shared/models/ids';

/**
 * Build the QR matrix for an item's identity string.
 * @param {string} itemId  e.g. "SKKL-ITM-000001"
 * @returns {number[][]}   QR module matrix (1/0) for rendering by TagCanvas
 */
export function buildItemQrMatrix(itemId) {
  if (!isItemId(itemId)) {
    throw new Error(`refusing to encode non-identity payload: ${itemId}`);
  }

  return qrSVG(itemId, {
    size: 128,
    margin: 2,
  });
}

/** The exact string that gets printed under/inside the QR. Never JSON, never data. */
export function qrPayload(itemId) {
  if (!isItemId(itemId)) throw new Error(`invalid itemId: ${itemId}`);
  return itemId;
}

/** Decode a scan (camera/manual/keyboard-wedge) back to a canonical itemId. */
export function decodeScan(raw) {
  const id = normalizeScan(raw);
  return id || null;
}
