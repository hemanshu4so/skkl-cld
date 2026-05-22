// src/shared/models/auditLog.js — immutable audit trail.
import { safeStr } from '@shared/safe';

export function buildAudit(input, { shopId, uid, employeeId, source }) {
  return {
    shopId: safeStr(shopId),
    entityType: safeStr(input.entityType),    // item|sale|repair|transfer|purchase|counter|branch
    entityId: safeStr(input.entityId),
    action: safeStr(input.action),            // e.g. item.created, item.weight_change, item.sold
    before: input.before ?? null,
    after: input.after ?? null,
    byEmployeeId: safeStr(employeeId) || null,
    byUid: safeStr(uid) || null,
    source: safeStr(source) || 'app',
    // at: serverTimestamp()
  };
}
