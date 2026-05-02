// src/pages/Karigar.jsx — Phase 2 Karigar Management
//
// Tabs:
//   1. Karigars      — master CRUD (name, phone, speciality, opening fine-gold balance, ₹ opening)
//   2. Issue Metal   — record gold given to karigar (weight + purity → fine grams)
//   3. Receive Item  — record finished item back from karigar (gross weight, fine weight, wastage,
//                      labour ₹). Optionally auto-add the finished item to /products.
//   4. Payments      — advances + final settlement entries
//   5. Ledger        — per-karigar fine-gold balance + ₹ outstanding, with timeline
//
// Collections:
//   /karigars                 master
//   /karigarTransactions      append-only entries with type ∈ KARIGAR_TXN_TYPES
//
// Activity log on every mutation.

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, deleteDoc, onSnapshot, query, where,
  doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { assertShopId } from "../lib/utils";
import { formatINR, formatDate } from "../lib/constants";
import { logActivity } from "../lib/activityLog";
import { CATEGORIES, KARATS, ITEM_TYPES, MAKING_TYPES } from "../lib/constants";

const PURITY = { "24K": 0.999, "22K": 0.916, "20K": 0.833, "18K": 0.750, "14K": 0.583, "92.5": 0.925, "Sterling": 0.925, "80": 0.8, "N/A": 1 };
const fine = (weight, karat) => Math.round((Number(weight) || 0) * (PURITY[karat] ?? 1) * 1000) / 1000; // 3 dp grams

export default function Karigar() {
  const { userData, shopId } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("master");

  const [karigars, setKarigars] = useState([]);
  const [txns, setTxns] = useState([]);

  const karigarsUnsubRef = useRef(null);
  const txnsUnsubRef = useRef(null);

  useEffect(() => {
    if (karigarsUnsubRef.current) { karigarsUnsubRef.current(); karigarsUnsubRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "karigars"), where("shopId", "==", shopId)),
      (snap) => setKarigars(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error("[karigars] snapshot error:", err); toast("Could not load karigars — check Firestore rules.", "error"); }
    );
    karigarsUnsubRef.current = u;
    return () => { if (karigarsUnsubRef.current) { karigarsUnsubRef.current(); karigarsUnsubRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (txnsUnsubRef.current) { txnsUnsubRef.current(); txnsUnsubRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "karigarTransactions"), where("shopId", "==", shopId)),
      (snap) => setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[karigarTxn] snapshot error:", err)
    );
    txnsUnsubRef.current = u;
    return () => { if (txnsUnsubRef.current) { txnsUnsubRef.current(); txnsUnsubRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>🔨 Karigar</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "master",   label: "Karigars" },
            { id: "issue",    label: "Issue Metal" },
            { id: "receive",  label: "Receive Item" },
            { id: "payment",  label: "Payments" },
            { id: "ledger",   label: "Ledger" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                borderColor: tab === t.id ? "#1a1a2e" : "#ddd",
                background: tab === t.id ? "#1a1a2e" : "#fff",
                color: tab === t.id ? "#fff" : "#555",
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "master"  && <MasterTab  shopId={shopId} userData={userData} toast={toast} karigars={karigars} />}
      {tab === "issue"   && <TxnForm    kind="issue"   shopId={shopId} userData={userData} toast={toast} karigars={karigars} />}
      {tab === "receive" && <TxnForm    kind="receive" shopId={shopId} userData={userData} toast={toast} karigars={karigars} />}
      {tab === "payment" && <TxnForm    kind="payment" shopId={shopId} userData={userData} toast={toast} karigars={karigars} />}
      {tab === "ledger"  && <LedgerTab  shopId={shopId} karigars={karigars} txns={txns} />}
    </div>
  );
}

// ───── Master tab ─────
function MasterTab({ shopId, userData, toast, karigars }) {
  const empty = { name: "", phone: "", speciality: "", openingFineGrams: "0", openingBalance: "0", notes: "" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const save = async () => {
    if (!assertShopId(shopId, toast, "Karigar.MasterTab.save")) return;
    if (!form.name) { toast("Name required", "warn"); return; }
    try {
      const data = {
        shopId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        speciality: form.speciality.trim(),
        openingFineGrams: Number(form.openingFineGrams) || 0,
        openingBalance: Number(form.openingBalance) || 0,
        notes: form.notes,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, "karigars", editId), data);
        await logActivity({ shopId, action: "update", entity: "karigar", entityId: editId, uid: userData?.id, name: userData?.name });
        toast("Karigar updated", "success");
      } else {
        data.createdAt = serverTimestamp();
        const r = await addDoc(collection(db, "karigars"), data);
        await logActivity({ shopId, action: "create", entity: "karigar", entityId: r.id, uid: userData?.id, name: userData?.name });
        toast("Karigar added", "success");
      }
      setForm(empty); setEditId(null); setShowForm(false);
    } catch (err) { toast("Error: " + err.message, "error"); }
  };

  const handleEdit = (k) => {
    setForm({
      name: k.name || "", phone: k.phone || "", speciality: k.speciality || "",
      openingFineGrams: String(k.openingFineGrams || 0),
      openingBalance: String(k.openingBalance || 0),
      notes: k.notes || "",
    });
    setEditId(k.id); setShowForm(true);
  };

  const handleDelete = async (k) => {
    if (!assertShopId(shopId, toast, "Karigar.MasterTab.handleDelete")) return;
    if (!window.confirm(`Delete karigar ${k.name}?`)) return;
    await deleteDoc(doc(db, "karigars", k.id));
    await logActivity({ shopId, action: "delete", entity: "karigar", entityId: k.id, uid: userData?.id, name: userData?.name });
    toast("Karigar deleted", "success");
  };

  const filtered = karigars.filter((k) =>
    !search || k.name?.toLowerCase().includes(search.toLowerCase()) || k.phone?.includes(search)
  );

  const inp = (label, field, type = "text") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label className="label">{label}</label>
      <input type={type} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className="input" />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search karigar"
          style={{ padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, width: 280 }} />
        <button onClick={() => { setShowForm(!showForm); setForm(empty); setEditId(null); }} className="btn btn-primary">
          {showForm ? "✕ Cancel" : "+ Add Karigar"}
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-4">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {inp("Name *", "name")}
            {inp("Phone", "phone", "tel")}
            {inp("Speciality", "speciality")}
            {inp("Opening Fine Grams", "openingFineGrams", "number")}
            {inp("Opening ₹ Outstanding", "openingBalance", "number")}
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" />
          </div>
          <button onClick={save} className="btn btn-primary mt-4">{editId ? "💾 Update" : "💾 Save"}</button>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {filtered.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No karigars yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Name", "Phone", "Speciality", "Opening Fine", "Opening ₹", ""].map((h) =>
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((k, i) => (
                  <tr key={k.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{k.name}</td>
                    <td style={{ padding: "10px 14px" }}>{k.phone || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#555" }}>{k.speciality || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{k.openingFineGrams ? `${k.openingFineGrams}g` : "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{formatINR(k.openingBalance)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => handleEdit(k)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginRight: 6 }}>Edit</button>
                      <button onClick={() => handleDelete(k)} className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ───── Generic transaction form for issue / receive / payment ─────
function TxnForm({ kind, shopId, userData, toast, karigars }) {
  const cfg = {
    issue: {
      title: "📤 Issue Metal to Karigar",
      help: "Record raw gold/silver issued to a karigar for fabrication.",
      fields: ["karigar", "metal", "purity", "weight", "value", "notes"],
      okLabel: "Issue Metal",
    },
    receive: {
      title: "📥 Receive Finished Item",
      help: "Record finished item received back. Wastage = issued fine − returned fine.",
      fields: ["karigar", "metal", "purity", "weight", "fineExpected", "wastageGrams", "labour", "addToInventory", "notes"],
      okLabel: "Receive Item",
    },
    payment: {
      title: "💰 Karigar Payment",
      help: "Cash advance or final settlement to a karigar.",
      fields: ["karigar", "paymentType", "amount", "mode", "notes"],
      okLabel: "Record Payment",
    },
  }[kind];

  const [form, setForm] = useState({
    karigarId: "", karigarName: "",
    metal: "Gold", purity: "22K",
    weight: "", value: "",
    fineExpected: "", wastageGrams: "", labour: "",
    addToInventory: false,
    productName: "", itemType: "Other", makingCharge: "", makingType: "per_gram",
    paymentType: "advance", amount: "", mode: "cash",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!assertShopId(shopId, toast, `Karigar.TxnForm.${kind}`)) return;
    if (!form.karigarId) { toast("Pick a karigar", "warn"); return; }

    setSubmitting(true);
    try {
      let data = {
        shopId,
        karigarId: form.karigarId, karigarName: form.karigarName,
        notes: form.notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };

      if (kind === "issue") {
        if (!form.weight) { toast("Weight required", "warn"); setSubmitting(false); return; }
        data = {
          ...data, type: "issue",
          metal: form.metal, purity: form.purity,
          weight: Number(form.weight),
          fineGrams: fine(form.weight, form.purity),
          value: Number(form.value) || 0,
        };
      } else if (kind === "receive") {
        if (!form.weight) { toast("Weight required", "warn"); setSubmitting(false); return; }
        data = {
          ...data, type: "receive",
          metal: form.metal, purity: form.purity,
          weight: Number(form.weight),
          fineGrams: fine(form.weight, form.purity),
          fineExpected: Number(form.fineExpected) || 0,
          wastageGrams: Number(form.wastageGrams) || 0,
          labour: Number(form.labour) || 0,
        };
      } else if (kind === "payment") {
        if (!form.amount) { toast("Amount required", "warn"); setSubmitting(false); return; }
        data = {
          ...data,
          type: form.paymentType === "settlement" ? "settlement" : "advance",
          amount: Number(form.amount),
          mode: form.mode,
        };
      }

      const ref = await addDoc(collection(db, "karigarTransactions"), data);
      await logActivity({
        shopId, action: "create", entity: "karigarTransaction", entityId: ref.id,
        uid: userData?.id, name: userData?.name,
        meta: { type: data.type, karigar: data.karigarName, weight: data.weight, amount: data.amount },
      });

      // Optionally also add the finished item to inventory
      if (kind === "receive" && form.addToInventory && form.productName) {
        await addDoc(collection(db, "products"), {
          shopId,
          name: form.productName.trim(),
          itemType: form.itemType,
          category: form.metal,
          karat: form.purity,
          weight: Number(form.weight),
          netWeight: Number(form.weight),
          makingCharge: Number(form.makingCharge) || 0,
          makingType: form.makingType,
          wastagePct: 0, hallmarkCharge: 0,
          qty: 1, price: 0, barcode: "", huid: "",
          description: `Received from karigar ${form.karigarName}`,
          stones: [], stoneValue: 0, photos: [],
          lowStockThreshold: 1,
          sourceKarigarTxn: ref.id,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }

      toast(`${cfg.title.split(" ").slice(1).join(" ")} recorded`, "success");
      setForm((f) => ({
        ...f, weight: "", value: "", fineExpected: "", wastageGrams: "",
        labour: "", amount: "", productName: "", makingCharge: "", notes: "",
      }));
    } catch (err) {
      toast(err?.message || "Error", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>{cfg.title}</h2>
      <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 16 }}>{cfg.help}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div>
          <label className="label">Karigar *</label>
          <select value={form.karigarId}
            onChange={(e) => {
              const k = karigars.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, karigarId: k?.id || "", karigarName: k?.name || "" }));
            }}
            className="input bg-white">
            <option value="">— Select —</option>
            {karigars.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>

        {(kind === "issue" || kind === "receive") && (
          <>
            <div>
              <label className="label">Metal</label>
              <select value={form.metal} onChange={(e) => setForm((f) => ({ ...f, metal: e.target.value }))} className="input bg-white">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Purity</label>
              <select value={form.purity} onChange={(e) => setForm((f) => ({ ...f, purity: e.target.value }))} className="input bg-white">
                {KARATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Weight (g) *</label>
              <input type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Fine grams (auto)</label>
              <input value={form.weight ? fine(form.weight, form.purity) : ""} className="input" disabled />
            </div>
          </>
        )}

        {kind === "issue" && (
          <div>
            <label className="label">Notional Value (₹)</label>
            <input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="input" />
          </div>
        )}

        {kind === "receive" && (
          <>
            <div>
              <label className="label">Fine Expected (g)</label>
              <input type="number" value={form.fineExpected} onChange={(e) => setForm((f) => ({ ...f, fineExpected: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Wastage (g)</label>
              <input type="number" value={form.wastageGrams} onChange={(e) => setForm((f) => ({ ...f, wastageGrams: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Labour Charge (₹)</label>
              <input type="number" value={form.labour} onChange={(e) => setForm((f) => ({ ...f, labour: e.target.value }))} className="input" />
            </div>
          </>
        )}

        {kind === "payment" && (
          <>
            <div>
              <label className="label">Type</label>
              <select value={form.paymentType} onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))} className="input bg-white">
                <option value="advance">Advance</option>
                <option value="settlement">Final Settlement</option>
              </select>
            </div>
            <div>
              <label className="label">Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Mode</label>
              <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} className="input bg-white">
                {["cash", "upi", "bank", "cheque"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {kind === "receive" && (
        <div style={{ padding: 12, border: "1.5px dashed #ddd", borderRadius: 10, marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={form.addToInventory}
              onChange={(e) => setForm((f) => ({ ...f, addToInventory: e.target.checked }))} />
            {" "}Also add this finished item to inventory
          </label>
          {form.addToInventory && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
              <div>
                <label className="label">Product Name</label>
                <input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Item Type</label>
                <select value={form.itemType} onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value }))} className="input bg-white">
                  {ITEM_TYPES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Making Type</label>
                <select value={form.makingType} onChange={(e) => setForm((f) => ({ ...f, makingType: e.target.value }))} className="input bg-white">
                  {MAKING_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Making Charge</label>
                <input type="number" value={form.makingCharge} onChange={(e) => setForm((f) => ({ ...f, makingCharge: e.target.value }))} className="input" />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="label">Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" />
      </div>

      <button onClick={submit} disabled={submitting} className="btn btn-primary mt-4">
        {submitting ? "Saving…" : `💾 ${cfg.okLabel}`}
      </button>
    </div>
  );
}

// ───── Ledger tab ─────
function LedgerTab({ shopId, karigars, txns }) {
  const [karigarId, setKarigarId] = useState(karigars[0]?.id || "");
  useEffect(() => {
    if (!karigarId && karigars[0]?.id) setKarigarId(karigars[0].id);
  }, [karigars, karigarId]);

  const k = karigars.find((x) => x.id === karigarId);
  const myTxns = useMemo(() => txns.filter((t) => t.karigarId === karigarId), [txns, karigarId]);

  const balance = useMemo(() => {
    let fineOut = Number(k?.openingFineGrams) || 0;
    let cashOut = Number(k?.openingBalance) || 0;
    let labourEarned = 0, paid = 0;
    myTxns.forEach((t) => {
      if (t.type === "issue")      fineOut += Number(t.fineGrams) || 0;
      if (t.type === "receive")    { fineOut -= (Number(t.fineGrams) || 0) + (Number(t.wastageGrams) || 0); labourEarned += Number(t.labour) || 0; }
      if (t.type === "advance" || t.type === "settlement") { paid += Number(t.amount) || 0; }
    });
    return {
      fineBalance: Math.round(fineOut * 1000) / 1000,
      labourEarned, paid,
      cashBalance: cashOut + labourEarned - paid,
    };
  }, [k, myTxns]);

  if (karigars.length === 0)
    return <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>Add a karigar first</div>;

  const sorted = [...myTxns].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

  return (
    <div>
      <div className="card p-5 mb-4">
        <label className="label">Karigar</label>
        <select value={karigarId} onChange={(e) => setKarigarId(e.target.value)} className="input bg-white" style={{ maxWidth: 320 }}>
          {karigars.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Fine Gold Balance (g)" value={`${balance.fineBalance}g`} accent={balance.fineBalance > 0 ? "red" : "green"} bold raw />
        <Stat label="Labour Earned" value={balance.labourEarned} accent="green" />
        <Stat label="Total Paid" value={balance.paid} />
        <Stat label="₹ Outstanding" value={balance.cashBalance} accent={balance.cashBalance > 0 ? "red" : "green"} bold />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>
          Timeline — {k?.name}
        </div>
        {sorted.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No transactions yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Date", "Type", "Metal/Mode", "Wt/Amt", "Fine", "Notes"].map((h) =>
                    <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 14px", fontSize: 12 }}>{formatDate(t.createdAt)}</td>
                    <td style={{ padding: "8px 14px", fontWeight: 600 }}>
                      {t.type === "issue" ? "📤 Issue"
                        : t.type === "receive" ? "📥 Receive"
                        : t.type === "advance" ? "💵 Advance"
                        : "✅ Settlement"}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12 }}>
                      {t.metal ? `${t.metal} ${t.purity}` : (t.mode || "").toUpperCase()}
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      {t.weight ? `${t.weight}g` : t.amount ? formatINR(t.amount) : "—"}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12 }}>
                      {t.fineGrams ? `${t.fineGrams}g` : "—"}
                      {t.wastageGrams ? ` (waste ${t.wastageGrams}g)` : ""}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "#666" }}>{t.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, bold, raw }) {
  const colors = { red: "#C62828", green: "#1B5E20", default: "#1a1a2e" };
  return (
    <div className="card p-4">
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: bold ? 800 : 700, color: colors[accent] || colors.default }}>
        {raw ? value : formatINR(value)}
      </div>
    </div>
  );
}
