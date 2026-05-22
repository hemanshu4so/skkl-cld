// src/shared/models/itemRepair.js — append-only repair records.
import { safeNumber, safeStr } from '@shared/safe';

export const REPAIR_STATUS = Object.freeze({
  RECEIVED: 'received', IN_PROGRESS: 'in_progress',
  READY: 'ready', DELIVERED: 'delivered', CANCELLED: 'cancelled',
});

export function buildRepair(input, { shopId, uid, employeeId }) {
  return {
    shopId: safeStr(shopId),
    itemId: safeStr(input.itemId),
    status: input.status || REPAIR_STATUS.RECEIVED,
    karigarId: safeStr(input.karigarId) || null,
    issue: safeStr(input.issue),
    weightBefore: safeNumber(input.weightBefore, 0),
    weightAfter: safeNumber(input.weightAfter, 0),
    stonesAddedWeightG: safeNumber(input.stonesAddedWeightG, 0),
    stonesRemovedWeightG: safeNumber(input.stonesRemovedWeightG, 0),
    charges: safeNumber(input.charges, 0),
    currency: 'INR',
    receivedAt: input.receivedAt ?? null,
    deliveredAt: input.deliveredAt ?? null,
    byEmployeeId: safeStr(employeeId) || null,
    byUid: safeStr(uid) || null,
  };
}
