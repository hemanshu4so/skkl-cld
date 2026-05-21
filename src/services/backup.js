// src/services/backup.js
// Lightweight client-side JSON export. Useful as a 'panic button' even before
// the scheduled Cloud Function is set up.

import { getDocs, query, where, collection } from "firebase/firestore";
import { db } from "@fb/client";

const SHOP_COLLECTIONS = [
  "products", "customers", "sales", "schemes", "schemeRedemptions",
  "repairs", "purchases", "vendors", "vendorPayments", "heldBills",
  "rates", "rateHistory", "karigars", "karigarTransactions",
  "bullionDealers", "bullionTransactions", "expenses", "dayBookEntries",
  "accounts", "activityLogs", "users", "shops",
];

export async function exportShopJSON(shopId) {
  if (!shopId) throw new Error("shopId required");
  const out = { shopId, exportedAt: new Date().toISOString(), data: {} };

  for (const name of SHOP_COLLECTIONS) {
    try {
      // /rates docs are keyed by shopId; everyone else has a shopId field
      let snap;
      if (name === "rates") {
        const r = await getDocs(query(collection(db, "rates"), where("__name__", "==", shopId)));
        snap = r;
      } else if (name === "shops") {
        const r = await getDocs(query(collection(db, "shops"), where("__name__", "==", shopId)));
        snap = r;
      } else {
        snap = await getDocs(query(collection(db, name), where("shopId", "==", shopId)));
      }
      out.data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      out.data[name] = { error: err.message };
    }
  }
  return out;
}

export function downloadJSON(obj, filename = "backup.json") {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
