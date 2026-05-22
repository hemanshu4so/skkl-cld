// src/firebase/items.js
// Data layer for QR-first inventory. All shop-scoped writes pass through assertShopId.
// History collections (movements/repairs/tag_history/audit/events) are append-only.
//
// itemId == qrId == docId, so scan->fetch is a single getDoc(items/{scanned}).
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, where, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@fb/client';
import { formatItemId, itemSequenceDocId } from '@shared/models/ids';
import { itemSnapshot } from '@shared/models/item';
import { buildMovement, MOVEMENT_TYPE } from '@shared/models/itemMovement';
import { buildAudit } from '@shared/models/auditLog';



function assertShopId(shopId, source='unknown') {
  if (!shopId) {
    throw new Error(`Missing shopId in ${source}`);
  }
}

// ----- collection refs (string names live in COL; add the new ones there too) -----
const C = {
  items: COL.items || 'items',
  movements: COL.itemMovements || 'item_movements',
  repairs: COL.itemRepairs || 'item_repairs',
  tagHistory: COL.tagHistory || 'tag_history',
  audit: COL.auditLogs || 'audit_logs',
  events: COL.inventoryEvents || 'inventory_events',
  counters: COL.counters || 'counters',
};

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
export async function fetchItemById(itemId) {
  const snap = await getDoc(doc(db, C.items, itemId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Scan resolves directly: itemId === qrId === docId. */
export const fetchItemByQr = fetchItemById;

export async function listItemsByStatus(shopId, status) {
  assertShopId(shopId, 'listItemsByStatus');
  const q = query(collection(db, C.items),
    where('shopId', '==', shopId), where('status', '==', status));
  const r = await getDocs(q);
  return r.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// CREATE (transactional ID allocation + QR identity, write-once)
// Use this only if you are NOT delegating creation to the allocateItemId
// Cloud Function. It does the same allocation atomically on the client.
// ---------------------------------------------------------------------------
export async function createItemWithIdentity(draft, ctx) {
  const { shopId, uid, employeeId } = ctx;
  assertShopId(shopId, 'createItemWithIdentity');

  const seqRef = doc(db, C.counters, itemSequenceDocId(shopId));

  const itemId = await runTransaction(db, async (tx) => {
    const seqSnap = await tx.get(seqRef);
    const current = seqSnap.exists() ? (seqSnap.data().value || 0) : 0;
    const next = current + 1;
    const id = formatItemId(next);

    // allocate sequence
    if (seqSnap.exists()) {
      tx.update(seqRef, { value: next });
    } else {
      tx.set(seqRef, { counterId: itemSequenceDocId(shopId), type: 'sequence',
        shopId, scope: 'items', value: next });
    }

    // write item with permanent identity (write-once; rules forbid later id change)
    const itemRef = doc(db, C.items, id);
    tx.set(itemRef, {
      ...draft,
      itemId: id,
      qrId: id,                       // QR payload = identity string only
      qrGenerated: true,
      qrGeneratedAt: serverTimestamp(),
      shopId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  });

  // append-only: creation movement + audit + event (outside tx is fine; they're logs)
  await appendMovement({
    itemId, type: MOVEMENT_TYPE.CREATED,
    toBranchId: draft.branchId || null, toCounterId: draft.counterId || null,
    refType: 'purchase', refId: draft.sourcePurchaseId || null,
    snapshotAfter: { status: draft.status, grossWeight: draft.grossWeight, branchId: draft.branchId },
    note: 'Item entry',
  }, ctx);
  await appendAudit({ entityType: 'item', entityId: itemId, action: 'item.created',
    after: { itemId, sku: draft.sku } }, { ...ctx, source: 'inventory_module' });
  await appendEvent({ kind: 'item_created', itemId, branchId: draft.branchId,
    counterId: draft.counterId, weightG: draft.grossWeight }, ctx);

  return itemId;
}

// ---------------------------------------------------------------------------
// MUTATE current snapshot + append history (QR never changes)
// ---------------------------------------------------------------------------
export async function applyItemChange(itemId, patch, movementMeta, ctx) {
  const { shopId } = ctx;
  assertShopId(shopId, 'applyItemChange');
  const itemRef = doc(db, C.items, itemId);
  const before = await fetchItemById(itemId);
  if (!before) throw new Error(`item ${itemId} not found`);
  if (before.shopId !== shopId) throw new Error('cross-shop write blocked');

  await updateDoc(itemRef, { ...patch, updatedAt: serverTimestamp() });
  const after = { ...before, ...patch };

  const mvId = await appendMovement({
    itemId,
    type: movementMeta.type,
    fromBranchId: before.branchId ?? null, toBranchId: after.branchId ?? null,
    fromCounterId: before.counterId ?? null, toCounterId: after.counterId ?? null,
    refType: movementMeta.refType, refId: movementMeta.refId,
    snapshotBefore: itemSnapshot(before), snapshotAfter: itemSnapshot(after),
    note: movementMeta.note,
  }, ctx);

  await updateDoc(itemRef, { lastMovementId: mvId });
  await appendAudit({ entityType: 'item', entityId: itemId,
    action: `item.${movementMeta.type}`, before: itemSnapshot(before), after: itemSnapshot(after) },
    { ...ctx, source: movementMeta.source || 'inventory_module' });
  return mvId;
}

// ---------------------------------------------------------------------------
// APPEND-ONLY writers
// ---------------------------------------------------------------------------
export async function appendMovement(input, ctx) {
  assertShopId(ctx.shopId, 'appendMovement');
  const payload = buildMovement(input, ctx);
  const ref = await addDoc(collection(db, C.movements), { ...payload, at: serverTimestamp() });
  return ref.id;
}

export async function appendAudit(input, ctx) {
  assertShopId(ctx.shopId, 'appendAudit');
  const payload = buildAudit(input, ctx);
  const ref = await addDoc(collection(db, C.audit), { ...payload, at: serverTimestamp() });
  return ref.id;
}

export async function appendEvent(input, ctx) {
  assertShopId(ctx.shopId, 'appendEvent');
  const ref = await addDoc(collection(db, C.events), {
    shopId: ctx.shopId, kind: input.kind, itemId: input.itemId || null,
    branchId: input.branchId || null, counterId: input.counterId || null,
    amount: input.amount ?? null, weightG: input.weightG ?? null,
    byEmployeeId: ctx.employeeId || null, at: serverTimestamp(),
  });
  return ref.id;
}

export async function appendTagPrint(input, ctx) {
  assertShopId(ctx.shopId, 'appendTagPrint');
  const ref = await addDoc(collection(db, C.tagHistory), {
    shopId: ctx.shopId, itemId: input.itemId, qrId: input.itemId,
    templateId: input.templateId || null, copies: input.copies || 1,
    branchId: input.branchId || null, byEmployeeId: ctx.employeeId || null,
    printedAt: serverTimestamp(),
  });
  // mark item tagPrinted (snapshot field; QR unchanged)
  await updateDoc(doc(db, C.items, input.itemId), { tagPrinted: true, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function appendRepair(repairDoc, ctx) {
  assertShopId(ctx.shopId, 'appendRepair');
  const ref = await addDoc(collection(db, C.repairs), { ...repairDoc, at: serverTimestamp() });
  return ref.id;
}