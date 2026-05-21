// src/pages/Bullion.jsx — Phase 2 Bullion System
//
// Tabs:
//   1. Dealers     — bullion dealer master (kind = bullion vendor)
//   2. Melting     — raw metal in → fine metal out, with wastage
//   3. Rate Lock   — rate-locked orders (lock today's rate for future delivery)
//   4. Ledger      — per-dealer fine-gold balance + ₹ outstanding
//
// Collections:
//   /bullionDealers         master
//   /bullionTransactions    appended entries; type ∈ BULLION_TXN_TYPES

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@fb/client";
import {
  collection, addDoc, deleteDoc, onSnapshot, query, where,
  doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useToast } from "../../../hooks/useToast";
import { assertShopId } from "../../../lib/utils";
import { formatINR, formatDate } from "../../../lib/constants";
import { logActivity } from "../../../lib/activityLog";

const PURITY = { "24K": 0.999, "22K": 0.916, "20K": 0.833, "18K": 0.750, "14K": 0.583, "92.5": 0.925, "Sterling": 0.925, "80": 0.8, "N/A": 1 };
const fine = (weight, karat) => Math.round((Number(weight) || 0) * (PURITY[karat] ?? 1) * 1000) / 1000;

export default function Bullion() {
  const { userData, shopId } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("dealers");

  const [dealers, setDealers] = useState([]);
  const [txns, setTxns] = useState([]);

  const dealersRef = useRef(null);
  const txnsRef = useRef(null);

  useEffect(() => {
    if (dealersRef.current) { dealersRef.current(); dealersRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "bullionDealers"), where("shopId", "==", shopId)),
      (snap) => setDealers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[bullionDealers] snapshot:", err)
    );
    dealersRef.current = u;
    return () => { if (dealersRef.current) { dealersRef.current(); dealersRef.current = null; } };
  }, [shopId]);

  useEffect(() => {
    if (txnsRef.current) { txnsRef.current(); txnsRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "bullionTransactions"), where("shopId", "==", shopId)),
      (snap) => setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[bullionTxn] snapshot:", err)
    );
    txnsRef.current = u;
    return () => { if (txnsRef.current) { txnsRef.current(); txnsRef.current = null; } };
  }, [shopId]);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>🪙 Bullion</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "dealers",   label: "Dealers" },
            { id: "melting",   label: "Melting" },
            { id: "ratelock",  label: "Rate Lock" },
            { id: "ledger",    label: "Ledger" },
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

      {tab === "dealers"  && <DealersTab  shopId={shopId} userData={userData} toast={toast} dealers={dealers} />}
      {tab === "melting"  && <MeltingTab  shopId={shopId} userData={userData} toast={toast} dealers={dealers} />}
      {tab === "ratelock" && <RateLockTab shopId={shopId} userData={userData} toast={toast} dealers={dealers} />}
      {tab === "ledger"   && <LedgerTab   dealers={dealers} txns={txns} />}
    </div>
  );
}

// ───── Dealers ─────
function DealersTab({ shopId, userData, toast, dealers }) {
  const empty = { name: "", contactPerson: "", phone: "", gst: "", openingFineGrams: "0", openingBalance: "0", notes: "" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const save = async () => {
    if (!assertShopId(shopId, toast, "Bullion.DealersTab.save")) return;
    if (!form.name) { toast("Name required", "warn"); return; }
    try {
      const data = {
        shopId,
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        gst: form.gst.trim(),
        openingFineGrams: Number(form.openingFineGrams) || 0,
        openingBalance: Number(form.openingBalance) || 0,
        notes: form.notes,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, "bullionDealers", editId), data);
        await logActivity({ shopId, action: "update", entity: "bullionDealer", entityId: editId, uid: userData?.id, name: userData?.name });
        toast("Dealer updated", "success");
      } else {
        data.createdAt = serverTimestamp();
        const r = await addDoc(collection(db, "bullionDealers"), data);
        await logActivity({ shopId, action: "create", entity: "bullionDealer", entityId: r.id, uid: userData?.id, name: userData?.name });
        toast("Dealer added", "success");
      }
      setForm(empty); setEditId(null); setShowForm(false);
    } catch (err) { toast("Error: " + err.message, "error"); }
  };

  const handleDelete = async (d) => {
    if (!assertShopId(shopId, toast, "Bullion.DealersTab.delete")) return;
    if (!window.confirm(`Delete dealer ${d.name}?`)) return;
    await deleteDoc(doc(db, "bullionDealers", d.id));
    await logActivity({ shopId, action: "delete", entity: "bullionDealer", entityId: d.id, uid: userData?.id, name: userData?.name });
    toast("Dealer deleted", "success");
  };

  const inp = (label, field, type = "text") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label className="label">{label}</label>
      <input type={type} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className="input" />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => { setShowForm(!showForm); setForm(empty); setEditId(null); }} className="btn btn-primary">
          {showForm ? "✕ Cancel" : "+ Add Dealer"}
        </button>
      </div>
      {showForm && (
        <div className="card p-5 mb-4">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {inp("Dealer Name *", "name")}
            {inp("Contact Person", "contactPerson")}
            {inp("Phone", "phone", "tel")}
            {inp("GST", "gst")}
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
        {dealers.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No bullion dealers yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Name", "Contact", "Phone", "GST", "Opening Fine", "Opening ₹", ""].map((h) =>
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {dealers.map((d, i) => (
                  <tr key={d.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{d.name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{d.contactPerson || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{d.phone || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, fontFamily: "monospace" }}>{d.gst || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{d.openingFineGrams ? `${d.openingFineGrams}g` : "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{formatINR(d.openingBalance)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => { setForm({ ...d, openingFineGrams: String(d.openingFineGrams || 0), openingBalance: String(d.openingBalance || 0) }); setEditId(d.id); setShowForm(true); }} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginRight: 6 }}>Edit</button>
                      <button onClick={() => handleDelete(d)} className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }}>Del</button>
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

// ───── Melting register ─────
function MeltingTab({ shopId, userData, toast, dealers }) {
  const [form, setForm] = useState({
    dealerId: "", dealerName: "",
    rawWeight: "", rawPurity: "22K",
    fineWeight: "", fineMeasured: "",
    wastage: "",
    chargePerGram: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const expectedFine = form.rawWeight ? fine(form.rawWeight, form.rawPurity) : "";
  const wastageAuto = form.fineMeasured && expectedFine
    ? Math.max(0, Math.round((Number(expectedFine) - Number(form.fineMeasured)) * 1000) / 1000)
    : "";

  const submit = async () => {
    if (!assertShopId(shopId, toast, "Bullion.Melting.submit")) return;
    if (!form.dealerId) { toast("Pick a dealer", "warn"); return; }
    if (!form.rawWeight) { toast("Raw weight required", "warn"); return; }
    setSubmitting(true);
    try {
      const data = {
        shopId, type: "melting",
        dealerId: form.dealerId, dealerName: form.dealerName,
        rawWeight: Number(form.rawWeight),
        rawPurity: form.rawPurity,
        rawFine: Number(expectedFine),
        fineMeasured: Number(form.fineMeasured) || Number(expectedFine) || 0,
        wastage: Number(form.wastage || wastageAuto) || 0,
        chargePerGram: Number(form.chargePerGram) || 0,
        chargeTotal: (Number(form.chargePerGram) || 0) * (Number(form.rawWeight) || 0),
        notes: form.notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };
      const r = await addDoc(collection(db, "bullionTransactions"), data);
      await logActivity({ shopId, action: "create", entity: "bullionTransaction", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { type: "melting", dealer: data.dealerName, rawWeight: data.rawWeight } });
      toast("Melting recorded", "success");
      setForm((f) => ({ ...f, rawWeight: "", fineMeasured: "", wastage: "", chargePerGram: "", notes: "" }));
    } catch (err) {
      toast("Error: " + err.message, "error");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="card p-5">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>♨️ Melting Register</h2>
      <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 16 }}>
        Send raw metal to a bullion dealer for refining; record actual fine metal received and wastage.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div>
          <label className="label">Dealer *</label>
          <select value={form.dealerId}
            onChange={(e) => {
              const d = dealers.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, dealerId: d?.id || "", dealerName: d?.name || "" }));
            }}
            className="input bg-white">
            <option value="">— Select —</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Raw Weight (g) *</label>
          <input type="number" value={form.rawWeight} onChange={(e) => setForm((f) => ({ ...f, rawWeight: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="label">Raw Purity</label>
          <select value={form.rawPurity} onChange={(e) => setForm((f) => ({ ...f, rawPurity: e.target.value }))} className="input bg-white">
            {Object.keys(PURITY).map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Expected Fine (g)</label>
          <input value={expectedFine} className="input" disabled />
        </div>
        <div>
          <label className="label">Fine Received (g)</label>
          <input type="number" value={form.fineMeasured} onChange={(e) => setForm((f) => ({ ...f, fineMeasured: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="label">Wastage (g)</label>
          <input type="number" value={form.wastage || wastageAuto} onChange={(e) => setForm((f) => ({ ...f, wastage: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="label">Refining Charge (₹/g)</label>
          <input type="number" value={form.chargePerGram} onChange={(e) => setForm((f) => ({ ...f, chargePerGram: e.target.value }))} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" />
      </div>
      <button onClick={submit} disabled={submitting} className="btn btn-primary mt-4">
        {submitting ? "Saving…" : "💾 Record Melting"}
      </button>
    </div>
  );
}

// ───── Rate-locked order ─────
function RateLockTab({ shopId, userData, toast, dealers }) {
  const [form, setForm] = useState({
    dealerId: "", dealerName: "",
    metal: "Gold", weight: "",
    lockedRate: "", deliveryDate: "",
    advance: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!assertShopId(shopId, toast, "Bullion.RateLock.submit")) return;
    if (!form.dealerId) { toast("Pick a dealer", "warn"); return; }
    if (!form.weight || !form.lockedRate) { toast("Weight and rate required", "warn"); return; }
    setSubmitting(true);
    try {
      const totalValue = (Number(form.weight) || 0) * (Number(form.lockedRate) || 0);
      const data = {
        shopId, type: "rate_lock", status: "open",
        dealerId: form.dealerId, dealerName: form.dealerName,
        metal: form.metal,
        weight: Number(form.weight),
        lockedRate: Number(form.lockedRate),
        totalValue,
        advance: Number(form.advance) || 0,
        balance: totalValue - (Number(form.advance) || 0),
        deliveryDate: form.deliveryDate,
        notes: form.notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };
      const r = await addDoc(collection(db, "bullionTransactions"), data);
      await logActivity({ shopId, action: "create", entity: "bullionTransaction", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { type: "rate_lock", weight: data.weight, lockedRate: data.lockedRate } });
      toast(`Rate-lock saved · ${form.weight}g @ ₹${form.lockedRate}/g`, "success");
      setForm((f) => ({ ...f, weight: "", lockedRate: "", advance: "", notes: "" }));
    } catch (err) { toast(err?.message, "error"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="card p-5">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>🔒 Rate-Lock Order</h2>
      <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 16 }}>
        Lock today's rate for future delivery. Useful when you commit to a fixed rate while gold prices are volatile.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <div>
          <label className="label">Dealer *</label>
          <select value={form.dealerId}
            onChange={(e) => {
              const d = dealers.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, dealerId: d?.id || "", dealerName: d?.name || "" }));
            }}
            className="input bg-white">
            <option value="">— Select —</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Metal</label>
          <select value={form.metal} onChange={(e) => setForm((f) => ({ ...f, metal: e.target.value }))} className="input bg-white">
            {["Gold", "Silver"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Weight (g) *</label>
          <input type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="label">Locked Rate (₹/g) *</label>
          <input type="number" value={form.lockedRate} onChange={(e) => setForm((f) => ({ ...f, lockedRate: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="label">Advance (₹)</label>
          <input type="number" value={form.advance} onChange={(e) => setForm((f) => ({ ...f, advance: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="label">Delivery Date</label>
          <input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} className="input" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="label">Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" />
      </div>
      <button onClick={submit} disabled={submitting} className="btn btn-primary mt-4">
        {submitting ? "Saving…" : "💾 Save Rate-Lock"}
      </button>
    </div>
  );
}

// ───── Ledger ─────
function LedgerTab({ dealers, txns }) {
  const [dealerId, setDealerId] = useState(dealers[0]?.id || "");
  useEffect(() => { if (!dealerId && dealers[0]?.id) setDealerId(dealers[0].id); }, [dealers, dealerId]);

  const d = dealers.find((x) => x.id === dealerId);
  const myTxns = useMemo(() => txns.filter((t) => t.dealerId === dealerId), [txns, dealerId]);

  const balance = useMemo(() => {
    let fineOut = Number(d?.openingFineGrams) || 0;
    let cash = Number(d?.openingBalance) || 0;
    myTxns.forEach((t) => {
      if (t.type === "melting") {
        fineOut -= Number(t.fineMeasured) || 0;
        cash += Number(t.chargeTotal) || 0;
      } else if (t.type === "rate_lock") {
        cash += Number(t.totalValue) || 0;
        cash -= Number(t.advance) || 0;
      }
    });
    return { fine: Math.round(fineOut * 1000) / 1000, cash };
  }, [d, myTxns]);

  if (dealers.length === 0)
    return <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>Add a dealer first</div>;

  const sorted = [...myTxns].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

  return (
    <div>
      <div className="card p-5 mb-4">
        <label className="label">Dealer</label>
        <select value={dealerId} onChange={(e) => setDealerId(e.target.value)} className="input bg-white" style={{ maxWidth: 320 }}>
          {dealers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Fine Gold Balance" value={`${balance.fine}g`} accent={balance.fine < 0 ? "red" : "green"} bold raw />
        <Stat label="Outstanding ₹" value={balance.cash} accent={balance.cash > 0 ? "red" : "green"} bold />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>
          Timeline — {d?.name}
        </div>
        {sorted.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No transactions yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Date", "Type", "Detail", "Fine (g)", "Value ₹", "Notes"].map((h) =>
                    <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 14px", fontSize: 12 }}>{formatDate(t.createdAt)}</td>
                    <td style={{ padding: "8px 14px", fontWeight: 600 }}>{t.type === "melting" ? "♨️ Melting" : "🔒 Rate Lock"}</td>
                    <td style={{ padding: "8px 14px", fontSize: 12 }}>
                      {t.type === "melting"
                        ? `Raw ${t.rawWeight}g ${t.rawPurity} · waste ${t.wastage || 0}g`
                        : `${t.weight}g @ ₹${t.lockedRate}/g · delivery ${t.deliveryDate || "—"}`}
                    </td>
                    <td style={{ padding: "8px 14px" }}>{t.fineMeasured ? `${t.fineMeasured}g` : "—"}</td>
                    <td style={{ padding: "8px 14px" }}>{formatINR(t.totalValue || t.chargeTotal || 0)}</td>
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
