// src/pages/Vouchers.jsx — Phase 5 vouchers module
//
// Two tabs:
//   1. Receipt vouchers — money IN
//        Optional link: customer (writes /customerTransactions credit)
//        Optional link: bill (matches a /sales doc by id)
//   2. Payment vouchers — money OUT
//        Optional link: vendor   → /vendorPayments
//                       karigar  → /karigarTransactions (advance/settlement)
//                       expense  → /expenses
//                       free-form → /paymentVouchers only
//
// Each voucher gets its own /paymentVouchers or /receiptVouchers doc PLUS
// an optional side-effect write to the appropriate ledger collection so
// running balances update immediately.

import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@fb/client";
import {
  collection, addDoc, deleteDoc, onSnapshot, query, where,
  doc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useToast } from "../../../hooks/useToast";
import { assertShopId } from "../../../lib/utils";
import { formatINR, formatDate } from "../../../lib/constants";
import { logActivity } from "../../../lib/activityLog";
import { recordCustomerTxn } from "../../../services/customerLedger";
import PrintRenderer from "@modules/printing/components/PrintRenderer";
import { pickDefault } from "@modules/printing/lib/printTemplate";

const PAY_MODES = ["cash", "upi", "bank", "cheque", "card", "credit"];

// ───────── Top-level ─────────
export default function Vouchers() {
  const { userData, shopId, shopData } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("receipt");

  // Live data
  const [receiptVouchers, setReceiptVouchers] = useState([]);
  const [paymentVouchers, setPaymentVouchers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [karigars, setKarigars] = useState([]);
  const [sales, setSales] = useState([]);
  const [receiptTemplate, setReceiptTemplate] = useState(null);

  const subRefs = useRef({});

  useEffect(() => {
    Object.values(subRefs.current).forEach((u) => u && u());
    subRefs.current = {};
    if (!shopId) return undefined;

    subRefs.current.r = onSnapshot(
      query(collection(db, "receiptVouchers"), where("shopId", "==", shopId)),
      (s) => setReceiptVouchers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    subRefs.current.p = onSnapshot(
      query(collection(db, "paymentVouchers"), where("shopId", "==", shopId)),
      (s) => setPaymentVouchers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    subRefs.current.c = onSnapshot(
      query(collection(db, "customers"), where("shopId", "==", shopId)),
      (s) => setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    subRefs.current.v = onSnapshot(
      query(collection(db, "vendors"), where("shopId", "==", shopId)),
      (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    subRefs.current.k = onSnapshot(
      query(collection(db, "karigars"), where("shopId", "==", shopId)),
      (s) => setKarigars(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    subRefs.current.s = onSnapshot(
      query(collection(db, "sales"), where("shopId", "==", shopId)),
      (s) => setSales(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    subRefs.current.t = onSnapshot(
      query(collection(db, "printTemplates"), where("shopId", "==", shopId), where("kind", "==", "receipt")),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReceiptTemplate(pickDefault(list, "receipt"));
      }
    );
    return () => Object.values(subRefs.current).forEach((u) => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>📒 Vouchers</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "receipt", label: "Receipt (in)" },
            { id: "payment", label: "Payment (out)" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                borderColor: tab === t.id ? "#1a1a2e" : "#ddd",
                background: tab === t.id ? "#1a1a2e" : "#fff",
                color: tab === t.id ? "#fff" : "#555",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "receipt" && (
        <ReceiptTab
          shopId={shopId} userData={userData} toast={toast} shopData={shopData}
          customers={customers} sales={sales} list={receiptVouchers}
          template={receiptTemplate}
        />
      )}
      {tab === "payment" && (
        <PaymentTab
          shopId={shopId} userData={userData} toast={toast}
          vendors={vendors} karigars={karigars} list={paymentVouchers}
        />
      )}
    </div>
  );
}

// ───────── Receipt voucher ─────────
function ReceiptTab({ shopId, userData, toast, shopData, customers, sales, list, template }) {
  const empty = {
    customerId: "", customerName: "", customerPhone: "",
    saleId: "", billNo: "",
    amount: "", mode: "cash", ref: "", date: today(), notes: "",
  };
  const [form, setForm] = useState(empty);
  const [customerSearch, setCustomerSearch] = useState("");
  const [billSearch, setBillSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [printVoucher, setPrintVoucher] = useState(null);

  const filteredCust = useMemo(() => customers.filter((c) =>
    customerSearch && (c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
  ).slice(0, 5), [customers, customerSearch]);

  const matchedBills = useMemo(() => {
    const q = (billSearch || "").trim().toLowerCase();
    if (!q) return [];
    return sales.filter((s) => (s.billNo || "").toLowerCase().includes(q)).slice(0, 5);
  }, [sales, billSearch]);

  const submit = async () => {
    if (!assertShopId(shopId, toast, "Vouchers.Receipt.submit")) return;
    if (!form.amount || Number(form.amount) <= 0) { toast("Amount required", "warn"); return; }
    setSubmitting(true);
    try {
      const voucherNo = "REC" + Date.now().toString().slice(-6);
      const data = {
        shopId, voucherNo, kind: "receipt",
        date: form.date,
        customerId: form.customerId || null,
        customerName: form.customerName || "Walk-in",
        customerPhone: form.customerPhone || "",
        saleId: form.saleId || null,
        billNo: form.billNo || null,
        amount: Number(form.amount),
        mode: form.mode, ref: form.ref, notes: form.notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };
      const r = await addDoc(collection(db, "receiptVouchers"), data);

      // Side-effect: update customer ledger if linked.
      if (form.customerId) {
        await recordCustomerTxn({
          shopId, userData,
          customer: { id: form.customerId, name: form.customerName, phone: form.customerPhone },
          type: form.saleId ? "receipt" : "advance",
          amount: Number(form.amount),
          mode: form.mode,
          ref: voucherNo + (form.billNo ? ` / ${form.billNo}` : ""),
          notes: form.notes,
        });
      }

      await logActivity({
        shopId, action: "create", entity: "receiptVoucher", entityId: r.id,
        uid: userData?.id, name: userData?.name,
        meta: { voucherNo, amount: data.amount, customerName: data.customerName },
      });
      setPrintVoucher({ ...data, id: r.id, kind: "receipt", total: data.amount, amountPaid: data.amount });
      toast(`Receipt ${voucherNo} saved · ${formatINR(data.amount)}`, "success");
      setForm(empty);
    } catch (err) { toast(err?.message || "Save failed", "error"); }
    setSubmitting(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {printVoucher && <PrintModal data={printVoucher} shop={shopData} template={template} onClose={() => setPrintVoucher(null)} />}

      <div className="card p-5">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>New receipt voucher</h3>
        <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
          Records money received. If you link a customer the customer ledger is
          updated automatically; if you also link a bill it counts as a receipt
          against that bill, otherwise as an advance.
        </p>

        {/* Customer */}
        <div style={{ marginBottom: 12 }}>
          <label className="label">Customer (optional)</label>
          {form.customerId ? (
            <div style={{ padding: "8px 12px", background: "#E8F5E9", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
              <span><strong>{form.customerName}</strong>{form.customerPhone ? ` · ${form.customerPhone}` : ""}</span>
              <button onClick={() => setForm((f) => ({ ...f, customerId: "", customerName: "", customerPhone: "" }))}
                style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <>
              <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customer name or phone…" className="input" />
              {filteredCust.map((c) => (
                <div key={c.id} onClick={() => { setForm((f) => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone })); setCustomerSearch(""); }}
                  style={{ padding: "8px 12px", cursor: "pointer", border: "1px solid #eee", borderRadius: 8, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: "#888" }}>{c.phone}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Bill linkage */}
        <div style={{ marginBottom: 12 }}>
          <label className="label">Link to bill (optional)</label>
          {form.saleId ? (
            <div style={{ padding: "8px 12px", background: "#E3F2FD", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
              <span>Bill <strong>{form.billNo}</strong></span>
              <button onClick={() => setForm((f) => ({ ...f, saleId: "", billNo: "" }))}
                style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <>
              <input value={billSearch} onChange={(e) => setBillSearch(e.target.value)}
                placeholder="Type bill number…" className="input" />
              {matchedBills.map((s) => (
                <div key={s.id} onClick={() => { setForm((f) => ({ ...f, saleId: s.id, billNo: s.billNo, customerId: s.customerId || f.customerId, customerName: s.customerName || f.customerName, customerPhone: s.customerPhone || f.customerPhone })); setBillSearch(""); }}
                  style={{ padding: "8px 12px", cursor: "pointer", border: "1px solid #eee", borderRadius: 8, marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span><strong>#{s.billNo}</strong> · {s.customerName}</span>
                  <span style={{ color: "#666" }}>{formatINR(s.total)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><label className="label">Amount *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input" /></div>
          <div><label className="label">Mode</label>
            <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} className="input bg-white">
              {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
            </select></div>
          <div><label className="label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
          <div><label className="label">Reference</label>
            <input value={form.ref} onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))} className="input" placeholder="cheque/UPI ref" /></div>
          <div><label className="label">Notes</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" /></div>
        </div>
        <button onClick={submit} disabled={submitting} className="btn btn-primary">
          {submitting ? "Saving…" : "💾 Save & Print receipt"}
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #eee", fontSize: 12, fontWeight: 700, color: "#555" }}>
          Recent receipt vouchers ({list.length})
        </div>
        <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {list.length === 0
            ? <div style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No receipts yet</div>
            : [...list].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).map((v) => (
              <div key={v.id} style={{ padding: "10px 14px", borderTop: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{v.voucherNo}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {v.customerName}
                    {v.billNo ? ` · for #${v.billNo}` : " · advance"} · {(v.mode || "").toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: "#999" }}>{formatDate(v.createdAt)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 800, color: "#1B5E20" }}>{formatINR(v.amount)}</span>
                  <button onClick={() => setPrintVoucher({ ...v, kind: "receipt", total: v.amount, amountPaid: v.amount })}
                    className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>🖨️</button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ───────── Payment voucher ─────────
function PaymentTab({ shopId, userData, toast, vendors, karigars, list }) {
  const empty = {
    target: "vendor",  // vendor | karigar | expense | other
    vendorId: "", vendorName: "",
    karigarId: "", karigarName: "",
    expenseCategory: "Misc",
    payeeName: "",
    amount: "", mode: "cash", ref: "", date: today(), notes: "",
  };
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!assertShopId(shopId, toast, "Vouchers.Payment.submit")) return;
    if (!form.amount || Number(form.amount) <= 0) { toast("Amount required", "warn"); return; }
    setSubmitting(true);
    try {
      const voucherNo = "PAY" + Date.now().toString().slice(-6);
      const baseData = {
        shopId, voucherNo, kind: "payment",
        date: form.date,
        target: form.target,
        amount: Number(form.amount),
        mode: form.mode, ref: form.ref, notes: form.notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };

      const data = { ...baseData };
      if (form.target === "vendor") {
        data.vendorId = form.vendorId || null;
        data.vendorName = form.vendorName || form.payeeName || "—";
      } else if (form.target === "karigar") {
        data.karigarId = form.karigarId || null;
        data.karigarName = form.karigarName || form.payeeName || "—";
      } else if (form.target === "expense") {
        data.expenseCategory = form.expenseCategory;
        data.payeeName = form.payeeName || "—";
      } else {
        data.payeeName = form.payeeName || "—";
      }

      const ref = await addDoc(collection(db, "paymentVouchers"), data);

      // Side-effects → integrate with existing ledgers
      if (form.target === "vendor" && form.vendorId) {
        await addDoc(collection(db, "vendorPayments"), {
          shopId, vendorId: form.vendorId, vendorName: form.vendorName,
          amount: Number(form.amount), mode: form.mode, ref: voucherNo,
          type: "payment", source: "voucher",
          createdAt: serverTimestamp(),
        });
      } else if (form.target === "karigar" && form.karigarId) {
        await addDoc(collection(db, "karigarTransactions"), {
          shopId, karigarId: form.karigarId, karigarName: form.karigarName,
          type: "advance", amount: Number(form.amount), mode: form.mode,
          notes: `Voucher ${voucherNo}` + (form.notes ? ` · ${form.notes}` : ""),
          createdAt: serverTimestamp(), createdBy: userData?.name || "admin",
        });
      } else if (form.target === "expense") {
        await addDoc(collection(db, "expenses"), {
          shopId, date: form.date,
          category: form.expenseCategory, amount: Number(form.amount),
          paidTo: form.payeeName, mode: form.mode,
          notes: `Voucher ${voucherNo}` + (form.notes ? ` · ${form.notes}` : ""),
          createdAt: serverTimestamp(), createdBy: userData?.name || "admin",
        });
      }

      await logActivity({
        shopId, action: "create", entity: "paymentVoucher", entityId: ref.id,
        uid: userData?.id, name: userData?.name,
        meta: { voucherNo, target: form.target, amount: data.amount },
      });
      toast(`Payment ${voucherNo} saved · ${formatINR(data.amount)}`, "success");
      setForm(empty);
    } catch (err) { toast(err?.message || "Save failed", "error"); }
    setSubmitting(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card p-5">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>New payment voucher</h3>
        <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
          Records money paid out. Linked target updates the matching ledger:
          vendor → /vendorPayments, karigar → /karigarTransactions (advance),
          expense → /expenses. 'Other' just records the voucher.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { id: "vendor",  label: "Vendor"  },
            { id: "karigar", label: "Karigar" },
            { id: "expense", label: "Expense" },
            { id: "other",   label: "Other"   },
          ].map((t) => (
            <button key={t.id} onClick={() => setForm((f) => ({ ...f, target: t.id }))}
              style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 600,
                background: form.target === t.id ? "#1a1a2e" : "#fff",
                color: form.target === t.id ? "#fff" : "#555",
                border: "1.5px solid " + (form.target === t.id ? "#1a1a2e" : "#ddd"),
                borderRadius: 18, cursor: "pointer",
              }}>{t.label}</button>
          ))}
        </div>

        {form.target === "vendor" && (
          <div style={{ marginBottom: 10 }}>
            <label className="label">Vendor</label>
            <select value={form.vendorId}
              onChange={(e) => {
                const v = vendors.find((x) => x.id === e.target.value);
                setForm((f) => ({ ...f, vendorId: v?.id || "", vendorName: v?.name || "" }));
              }} className="input bg-white">
              <option value="">— Select —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        {form.target === "karigar" && (
          <div style={{ marginBottom: 10 }}>
            <label className="label">Karigar</label>
            <select value={form.karigarId}
              onChange={(e) => {
                const k = karigars.find((x) => x.id === e.target.value);
                setForm((f) => ({ ...f, karigarId: k?.id || "", karigarName: k?.name || "" }));
              }} className="input bg-white">
              <option value="">— Select —</option>
              {karigars.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
        )}
        {form.target === "expense" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
            <div><label className="label">Category</label>
              <select value={form.expenseCategory} onChange={(e) => setForm((f) => ({ ...f, expenseCategory: e.target.value }))} className="input bg-white">
                {["Rent","Electricity","Salaries","Marketing","Hallmarking","Stationery","Travel","Repairs & Maintenance","Bank Charges","Misc"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className="label">Payee</label>
              <input value={form.payeeName} onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))} className="input" /></div>
          </div>
        )}
        {form.target === "other" && (
          <div style={{ marginBottom: 10 }}>
            <label className="label">Payee</label>
            <input value={form.payeeName} onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))} className="input" />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><label className="label">Amount *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input" /></div>
          <div><label className="label">Mode</label>
            <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} className="input bg-white">
              {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
            </select></div>
          <div><label className="label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
          <div><label className="label">Reference</label>
            <input value={form.ref} onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))} className="input" /></div>
          <div><label className="label">Notes</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" /></div>
        </div>
        <button onClick={submit} disabled={submitting} className="btn btn-primary">
          {submitting ? "Saving…" : "💾 Save voucher"}
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #eee", fontSize: 12, fontWeight: 700, color: "#555" }}>
          Recent payment vouchers ({list.length})
        </div>
        <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {list.length === 0
            ? <div style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No payments yet</div>
            : [...list].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).map((v) => (
              <div key={v.id} style={{ padding: "10px 14px", borderTop: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{v.voucherNo}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {v.target === "vendor"  ? `Vendor → ${v.vendorName}`
                     : v.target === "karigar" ? `Karigar → ${v.karigarName}`
                     : v.target === "expense" ? `Expense (${v.expenseCategory}) → ${v.payeeName}`
                     : `Other → ${v.payeeName}`} · {(v.mode || "").toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: "#999" }}>{formatDate(v.createdAt)}</div>
                </div>
                <span style={{ fontWeight: 800, color: "#C62828" }}>{formatINR(v.amount)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function PrintModal({ data, shop, template, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 20, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 520, width: "100%" }}>
        <div className="no-print" style={{ padding: "12px 18px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
          <strong>Receipt voucher preview</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} className="btn btn-primary">🖨️ Print</button>
            <button onClick={onClose} className="btn btn-secondary">✕ Close</button>
          </div>
        </div>
        <div id="printArea">
          <PrintRenderer template={template} doc={data} shop={shop} />
        </div>
      </div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #printArea, #printArea * { visibility: visible; }
          #printArea { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
