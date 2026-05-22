// functions/qrInventory/_shared.js — admin SDK helpers (Node, gen-2 friendly).
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const ITEM_ID_PREFIX = 'SKKL-ITM-';
const ITEM_ID_PAD = 6;
const fmtItemId = (n) => ITEM_ID_PREFIX + String(n).padStart(ITEM_ID_PAD, '0');
const seqDocId = (shopId) => `seq_items_${shopId}`;

async function appendAudit({ shopId, entityType, entityId, action, before, after, byEmployeeId, byUid, source }) {
  await db.collection('audit_logs').add({
    shopId, entityType, entityId, action,
    before: before ?? null, after: after ?? null,
    byEmployeeId: byEmployeeId ?? null, byUid: byUid ?? null,
    source: source || 'cloud_function', at: FieldValue.serverTimestamp(),
  });
}
async function appendEvent({ shopId, kind, itemId, branchId, counterId, amount, weightG, byEmployeeId }) {
  await db.collection('inventory_events').add({
    shopId, kind, itemId: itemId ?? null, branchId: branchId ?? null,
    counterId: counterId ?? null, amount: amount ?? null, weightG: weightG ?? null,
    byEmployeeId: byEmployeeId ?? null, at: FieldValue.serverTimestamp(),
  });
}
module.exports = { admin, db, FieldValue, fmtItemId, seqDocId, appendAudit, appendEvent };
