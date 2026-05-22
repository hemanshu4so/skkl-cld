// src/modules/inventory/integration/createQrItem.js  (GENERATED — safe to regenerate)
// Additive QR item creation. Maps your existing product payload into the QR item draft,
// allocates a permanent itemId + QR identity (write-once), and optionally links the
// existing product doc. Throws are caught by the caller (non-blocking by design).
import { useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@fb/client';
import { useQrRuntime } from './qrRuntime';
import { buildItemDraft } from '@shared/models/item';
import { createItemWithIdentity } from '@fb/items';

// Best-effort field mapping from a product payload to the QR item draft.
// Unknown fields are ignored by buildItemDraft; tweak here if your form differs.
function mapProductToItemInput(payload) {
  const p = payload || {};
  return {
    sku: p.sku ?? p.code ?? '',
    designCode: p.designCode ?? p.design ?? '',
    category: p.category ?? p.type ?? 'other',
    subCategory: p.subCategory ?? '',
    metal: p.metal ?? p.material ?? 'gold',
    purity: p.purity ?? p.karat ?? '',
    hallmark: p.hallmark ?? !!p.huid,
    huid: p.huid ?? '',
    grossWeight: p.grossWeight ?? p.weight ?? p.grossWt ?? 0,
    netWeight: p.netWeight ?? p.netWt ?? 0,
    stoneWeight: p.stoneWeight ?? p.stoneWt ?? 0,
    diamondWeight: p.diamondWeight ?? 0,
    stoneDetails: Array.isArray(p.stoneDetails) ? p.stoneDetails : [],
    makingChargeType: p.makingChargeType ?? 'per_gram',
    makingChargeValue: p.makingChargeValue ?? p.making ?? 0,
    wastagePct: p.wastagePct ?? p.wastage ?? 0,
    vendorId: p.vendorId ?? null,
    branchId: p.branchId ?? null,
    counterId: p.counterId ?? null,
    location: p.location ?? '',
    rateAtEntry: p.rateAtEntry ?? p.rate ?? 0,
    images: Array.isArray(p.images) ? p.images : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

export function useCreateQrItem() {
  const { shopId, uid, employeeId, branchId, counterId } = useQrRuntime();

  const createQrItem = useCallback(async (payload, opts = {}) => {
    if (!shopId) throw new Error('[QR] no shopId in auth runtime; cannot create item');
    const input = mapProductToItemInput(payload);
    if (branchId && !input.branchId) input.branchId = branchId;
    if (counterId && !input.counterId) input.counterId = counterId;
    const draft = buildItemDraft(input, { shopId, uid, employeeId });
    if (opts.productId) draft.linkedProductId = opts.productId;

    const itemId = await createItemWithIdentity(draft, { shopId, uid, employeeId });

    // Optional additive link back onto the existing product doc (does not alter your logic).
    if (opts.productId && opts.linkBack !== false) {
      try {
        await updateDoc(doc(db, opts.productCollection || 'products', opts.productId), {
          itemId, qrId: itemId, qrLinkedAt: serverTimestamp(),
        });
      } catch (e) { /* link is best-effort; item already exists with permanent identity */ }
    }
    return itemId;
  }, [shopId, uid, employeeId, branchId, counterId]);

  return { createQrItem };
}
