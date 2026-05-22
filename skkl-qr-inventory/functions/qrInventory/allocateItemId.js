// allocateItemId — CALLABLE. Atomically allocates the next SKKL-ITM id for a shop and
// creates the item with permanent QR identity (write-once). Use this from the client
// instead of the client-side transaction when you want server authority over the sequence.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue, fmtItemId, seqDocId, appendAudit, appendEvent } = require('./_shared');

exports.allocateItemId = onCall(async (req) => {
  const { auth, data } = req;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const shopId = data?.shopId;
  const draft = data?.draft || {};
  if (!shopId) throw new HttpsError('invalid-argument', 'shopId required');

  // verify caller belongs to shop
  const userSnap = await db.doc(`users/${auth.uid}`).get();
  if (!userSnap.exists || userSnap.data().shopId !== shopId) {
    throw new HttpsError('permission-denied', 'cross-shop allocation blocked');
  }

  const seqRef = db.doc(`counters/${seqDocId(shopId)}`);
  const itemId = await db.runTransaction(async (tx) => {
    const seq = await tx.get(seqRef);
    const next = (seq.exists ? (seq.data().value || 0) : 0) + 1;
    const id = fmtItemId(next);
    if (seq.exists) tx.update(seqRef, { value: next });
    else tx.set(seqRef, { counterId: seqDocId(shopId), type: 'sequence', shopId, scope: 'items', value: next });

    tx.set(db.doc(`items/${id}`), {
      ...draft,
      itemId: id, qrId: id, qrGenerated: true,
      qrGeneratedAt: FieldValue.serverTimestamp(),
      shopId, status: draft.status || 'in_stock',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
    });
    return id;
  });

  // creation movement (append-only) + audit + event
  await db.collection('item_movements').add({
    shopId, itemId, type: 'created',
    fromBranchId: null, toBranchId: draft.branchId || null,
    fromCounterId: null, toCounterId: draft.counterId || null,
    refType: 'purchase', refId: draft.sourcePurchaseId || null,
    snapshotBefore: null,
    snapshotAfter: { status: draft.status || 'in_stock', grossWeight: draft.grossWeight || 0, branchId: draft.branchId || null },
    note: 'Item entry', byUid: auth.uid, byEmployeeId: draft.createdByEmployeeId || null,
    at: FieldValue.serverTimestamp(),
  });
  await appendAudit({ shopId, entityType: 'item', entityId: itemId, action: 'item.created',
    after: { itemId, sku: draft.sku || null }, byUid: auth.uid, source: 'allocateItemId' });
  await appendEvent({ shopId, kind: 'item_created', itemId, branchId: draft.branchId,
    counterId: draft.counterId, weightG: draft.grossWeight });

  return { itemId, qrId: itemId };
});
