// onRepairWrite — when a repair is created or its status changes, reflect the item's
// status (in_repair / back to in_stock) WITHOUT touching QR identity, and audit it.
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { db, FieldValue, appendAudit } = require('./_shared');

exports.onRepairWrite = onDocumentWritten('item_repairs/{id}', async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;                 // deleted (shouldn't happen — rules forbid)
  const before = event.data?.before?.data() || null;
  const { shopId, itemId, status } = after;
  if (!itemId) return;

  const itemRef = db.doc(`items/${itemId}`);
  let newStatus = null;
  if (status === 'received' || status === 'in_progress') newStatus = 'in_repair';
  if (status === 'delivered') newStatus = 'in_stock';

  if (newStatus) {
    const snap = await itemRef.get();
    const prev = snap.exists ? snap.data().status : null;
    if (prev !== newStatus) {
      await itemRef.set({ status: newStatus, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      // append-only movement reflecting repair flow
      await db.collection('item_movements').add({
        shopId, itemId, type: newStatus === 'in_repair' ? 'repair_in' : 'repair_out',
        refType: 'repair', refId: event.params.id,
        snapshotBefore: { status: prev }, snapshotAfter: { status: newStatus },
        note: `Repair ${status}`, byEmployeeId: after.byEmployeeId || null,
        at: FieldValue.serverTimestamp(),
      });
      await appendAudit({ shopId, entityType: 'item', entityId: itemId,
        action: `item.${newStatus === 'in_repair' ? 'repair_in' : 'repair_out'}`,
        before: { status: prev }, after: { status: newStatus },
        byEmployeeId: after.byEmployeeId || null, source: 'onRepairWrite' });
    }
  }

  if (!before) {
    await appendAudit({ shopId, entityType: 'repair', entityId: event.params.id,
      action: 'repair.created', after: { itemId, status }, source: 'onRepairWrite' });
  }
});
