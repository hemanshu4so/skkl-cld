// src/shared/models/item.js
// Item model: builder + validation + current-snapshot mutation helpers.
// QR identity (itemId/qrId) is set ONCE and never mutated here.
import { safeNumber, safeStr, pick } from '@shared/safe';

export const ITEM_STATUS = Object.freeze({
  IN_STOCK: 'in_stock', ASSIGNED: 'assigned', SOLD: 'sold',
  IN_REPAIR: 'in_repair', TRANSFERRED: 'transferred', EXCHANGED: 'exchanged',
  MELTED: 'melted', LOST: 'lost',
});

export const METALS = ['gold', 'silver', 'platinum'];
export const MAKING_CHARGE_TYPES = ['per_gram', 'flat', 'percent'];

/**
 * Build a NEW item payload (pre-create). itemId/qrId are assigned by the
 * allocateItemId Cloud Function / data layer — leave them out here.
 */
export function buildItemDraft(input, { shopId, uid, employeeId }) {
  return {
    shopId: safeStr(shopId),
    sku: safeStr(input.sku),
    designCode: safeStr(input.designCode),
    category: safeStr(input.category),
    subCategory: safeStr(input.subCategory),
    metal: METALS.includes(input.metal) ? input.metal : 'gold',
    purity: safeStr(input.purity),
    hallmark: !!input.hallmark,
    huid: safeStr(input.huid).toUpperCase(),

    grossWeight: safeNumber(input.grossWeight, 0),
    netWeight: safeNumber(input.netWeight, 0),
    stoneWeight: safeNumber(input.stoneWeight, 0),
    diamondWeight: safeNumber(input.diamondWeight, 0),
    stoneDetails: Array.isArray(input.stoneDetails) ? input.stoneDetails : [],

    makingChargeType: MAKING_CHARGE_TYPES.includes(input.makingChargeType) ? input.makingChargeType : 'per_gram',
    makingChargeValue: safeNumber(input.makingChargeValue, 0),
    wastagePct: safeNumber(input.wastagePct, 0),

    vendorId: safeStr(input.vendorId) || null,
    branchId: safeStr(input.branchId) || null,
    counterId: safeStr(input.counterId) || null,
    location: safeStr(input.location),

    status: ITEM_STATUS.IN_STOCK,
    rateAtEntry: safeNumber(input.rateAtEntry, 0),
    tagPrinted: false,
    images: Array.isArray(input.images) ? input.images : [],
    tags: Array.isArray(input.tags) ? input.tags : [],

    lastMovementId: null,
    lastRepairId: null,

    createdByEmployeeId: safeStr(employeeId) || null,
    createdBy: safeStr(uid) || null,
    // itemId, qrId, qrGenerated, qrGeneratedAt, createdAt, updatedAt set by allocator/CF
  };
}

/** Validation — returns array of error strings (empty = valid). */
export function validateItemDraft(d) {
  const errs = [];
  if (!d.shopId) errs.push('shopId required');
  if (!d.category) errs.push('category required');
  if (!METALS.includes(d.metal)) errs.push('metal invalid');
  if (!d.purity) errs.push('purity required');
  if (safeNumber(d.grossWeight) <= 0) errs.push('grossWeight must be > 0');
  if (safeNumber(d.netWeight) < 0) errs.push('netWeight invalid');
  if (d.hallmark && d.huid && !/^[A-Z0-9]{6}$/.test(d.huid)) errs.push('HUID must be 6 alphanumerics');
  return errs;
}

/** Pull the subset of fields we snapshot into movement/audit history. */
export function itemSnapshot(item) {
  return {
    status: pick(item, 'status', null),
    grossWeight: safeNumber(pick(item, 'grossWeight', 0)),
    netWeight: safeNumber(pick(item, 'netWeight', 0)),
    stoneWeight: safeNumber(pick(item, 'stoneWeight', 0)),
    branchId: pick(item, 'branchId', null),
    counterId: pick(item, 'counterId', null),
  };
}
