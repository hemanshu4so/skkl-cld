// src/lib/activityLog.js
//
// Append-only event log used by every module (inventory, billing, repairs,
// purchases, schemes, …). Powers Phase 3 audit/notifications.
//
// Document shape:
//   {
//     shopId, action, entity, entityId,
//     uid, name,            // who did it
//     before, after,        // optional snapshot diffs
//     meta,                 // free-form module-specific data
//     createdAt             // serverTimestamp
//   }

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@fb/client";

export async function logActivity({
  shopId, action, entity, entityId,
  uid = null, name = null,
  before = null, after = null,
  meta = null,
}) {
  if (!shopId || !action || !entity) return;
  try {
    await addDoc(collection(db, "activityLogs"), {
      shopId,
      action,        // "create" | "update" | "delete" | "stock_adjust" | "status_change" | …
      entity,        // "product" | "customer" | "sale" | "repair" | …
      entityId: entityId || null,
      uid, name,
      before, after, meta,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Never block business writes on logging failures.
    // eslint-disable-next-line no-console
    console.warn("[activityLog]", err.message);
  }
}
