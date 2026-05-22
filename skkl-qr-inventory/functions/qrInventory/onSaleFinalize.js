// onSaleFinalize — when a sale doc is created with itemIds, mark each item sold,
// append a movement, and audit. QR identity stays forever (sold items keep their id).
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { db, FieldValue, appendAudit, appendEvent } = require('./_shared');

exports.onSaleFinalize = onDocumentCreated('sales/{id}', async (event) => {
  const sale = event.data?.data();
  if (!sale) return;
  const ids = Array.isArray(sale.soldItemIds) ? sale.soldItemIds
    : (Array.isArray(sale.lineItems) ? sale.lineItems.map((l) => l.itemId).filter(Boolean) : []);
  if (!ids.length) return;

  const { shopId } = sale;
  const batch = db.batch();
  for (const itemId of ids) {
    const ref = db.doc(`items/${itemId}`);
    batch.set(ref, { status: 'sold', counterId: sale.counterId || null,
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();

  for (const itemId of ids) {
    await db.collection('item_movements').add({
      shopId, itemId, type: 'sold', refType: 'sale', refId: event.params.id,
      snapshotAfter: { status: 'sold' }, note: `Sold on bill ${sale.billNo || event.params.id}`,
      toCounterId: sale.counterId || null, byEmployeeId: sale.byEmployeeId || null,
      at: FieldValue.serverTimestamp(),
    });
    await appendAudit({ shopId, entityType: 'item', entityId: itemId, action: 'item.sold',
      after: { saleId: event.params.id }, byEmployeeId: sale.byEmployeeId || null, source: 'onSaleFinalize' });
    await appendEvent({ shopId, kind: 'sold', itemId, counterId: sale.counterId,
      amount: null, byEmployeeId: sale.byEmployeeId });
  }
});
