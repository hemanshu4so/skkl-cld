// src/shared/models/itemMovement.js  — append-only movement records.
import { safeStr } from '@shared/safe';

export const MOVEMENT_TYPE = Object.freeze({
  CREATED: 'created', ASSIGNED: 'assigned', TRANSFERRED: 'transferred',
  SOLD: 'sold', RETURNED: 'returned', REPAIR_IN: 'repair_in', REPAIR_OUT: 'repair_out',
  WEIGHT_CHANGE: 'weight_change', STONE_ADDED: 'stone_added', STONE_REMOVED: 'stone_removed',
  EXCHANGED: 'exchanged', MELTED: 'melted', LOST: 'lost', FOUND: 'found',
});

export function buildMovement(input, { shopId, uid, employeeId }) {
  return {
    shopId: safeStr(shopId),
    itemId: safeStr(input.itemId),
    type: input.type,
    fromBranchId: input.fromBranchId ?? null,
    toBranchId: input.toBranchId ?? null,
    fromCounterId: input.fromCounterId ?? null,
    toCounterId: input.toCounterId ?? null,
    refType: safeStr(input.refType) || 'manual',
    refId: safeStr(input.refId) || null,
    snapshotBefore: input.snapshotBefore ?? null,
    snapshotAfter: input.snapshotAfter ?? null,
    note: safeStr(input.note),
    byEmployeeId: safeStr(employeeId) || null,
    byUid: safeStr(uid) || null,
    // at: serverTimestamp() set by data layer
  };
}
