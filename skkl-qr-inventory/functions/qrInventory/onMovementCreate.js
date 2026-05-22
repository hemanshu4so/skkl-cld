// onMovementCreate — enforce append-only invariants + mirror to events.
// Firestore rules already forbid update/delete; this guards content integrity and
// keeps the item's lastMovementId pointer + analytics event in sync.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { db, FieldValue, appendEvent } = require('./_shared');

exports.onMovementCreate = onDocumentCreated('item_movements/{id}', async (event) => {
  const mv = event.data?.data();
  if (!mv) return;
  const { shopId, itemId, type } = mv;
  if (!itemId) return;

  // keep current-snapshot pointer fresh (does not mutate identity)
  await db.doc(`items/${itemId}`).set(
    { lastMovementId: event.params.id, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // mirror selected movements into the analytics stream
  const kindMap = { sold: 'sold', transferred: 'transferred', assigned: 'assigned', repair_in: 'repaired' };
  if (kindMap[type]) {
    await appendEvent({ shopId, kind: kindMap[type], itemId,
      branchId: mv.toBranchId, counterId: mv.toCounterId,
      weightG: mv.snapshotAfter?.grossWeight, byEmployeeId: mv.byEmployeeId });
  }
});
