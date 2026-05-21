// src/services/customerLedger.js
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@fb/client";
import { logActivity } from "../lib/activityLog";

const TYPE_DIRECTION = {
  receipt:     "credit",
  advance:     "credit",
  credit_note: "credit",
  debit_note:  "debit",
};

export async function recordCustomerTxn({ shopId, userData, customer, type, amount, mode = "cash", ref = "", notes = "" }) {
  if (!shopId || !customer?.id) throw new Error("shopId and customer required");
  if (!TYPE_DIRECTION[type]) throw new Error("Unknown type: " + type);
  const data = {
    shopId,
    customerId: customer.id,
    customerName: customer.name || "",
    customerPhone: customer.phone || "",
    type, amount: Number(amount) || 0,
    direction: TYPE_DIRECTION[type],
    mode, ref, notes,
    createdAt: serverTimestamp(),
    createdBy: userData?.name || userData?.id || "admin",
  };
  const r = await addDoc(collection(db, "customerTransactions"), data);
  await logActivity({ shopId, action: type, entity: "customerTransaction", entityId: r.id,
    uid: userData?.id, name: userData?.name, meta: { customerName: data.customerName, amount: data.amount, mode } });
  return r;
}

export async function deleteCustomerTxn({ shopId, userData, txnId }) {
  await deleteDoc(doc(db, "customerTransactions", txnId));
  await logActivity({ shopId, action: "delete", entity: "customerTransaction", entityId: txnId,
    uid: userData?.id, name: userData?.name });
}

export function computeCustomerBalance(sales, txns) {
  let balance = 0;
  const events = [];
  for (const s of sales) {
    const total = Number(s.total) || 0;
    const paid = Number(s.amountPaid) || 0;
    const due = Math.max(0, total - paid);
    if (due > 0) {
      balance += due;
      events.push({ kind: "bill", id: s.id, ts: s.createdAt, debit: due, credit: 0,
        ref: s.billNo || s.id.slice(-5),
        notes: `Bill total ₹${total.toLocaleString("en-IN")} · paid ₹${paid.toLocaleString("en-IN")}` });
    } else {
      events.push({ kind: "bill", id: s.id, ts: s.createdAt, debit: 0, credit: 0,
        ref: s.billNo || s.id.slice(-5), notes: `Bill ₹${total.toLocaleString("en-IN")} · fully paid` });
    }
  }
  for (const t of txns) {
    const amt = Number(t.amount) || 0;
    const credit = t.direction === "credit" ? amt : 0;
    const debit  = t.direction === "debit"  ? amt : 0;
    balance -= credit;
    balance += debit;
    events.push({ kind: t.type, id: t.id, ts: t.createdAt, debit, credit, ref: t.ref || "",
      notes: t.notes || ({ receipt: "Receipt", advance: "Advance", credit_note: "Credit note", debit_note: "Debit note" })[t.type] });
  }
  events.sort((a, b) => (a.ts?.toMillis?.() || 0) - (b.ts?.toMillis?.() || 0));
  return { balance, events };
}
