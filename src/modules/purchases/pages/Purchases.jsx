// src/pages/purchases.js  —  Phase 1 Purchases (Vendor + GRN + Ledger)
//
// Three tabs:
//   1. Vendors  — master CRUD with type, contact, GST, opening balance
//   2. GRN      — Goods Receipt Note: pick vendor, add line items;
//                  on save, all line items are appended to /products and
//                  the GRN doc is written to /purchases.
//   3. Ledger   — per-vendor view: GRNs (debit), payments (credit), balance.

import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import {
  collection, addDoc, deleteDoc, onSnapshot, query, where,
  doc, updateDoc, serverTimestamp, runTransaction,
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import { CATEGORIES, KARATS, ITEM_TYPES, VENDOR_TYPES, formatINR, formatDate } from "../../../lib/constants";
import { logActivity } from "../../../lib/activityLog";
import useShortcut from "../../../hooks/useShortcut";
import useAutoFocus from "../../../hooks/useAutoFocus";
import { assertShopId } from "../../../lib/utils";

const emptyVendor = {
  name: "", type: "manufacturer", phone: "", email: "",
  city: "", gst: "", openingBalance: "0", notes: "",
};

const emptyLine = () => ({
  name: "", category: "Gold", karat: "22K", itemType: "Other",
  weight: "", qty: "1", makingCharge: "", makingType: "per_gram",
  costPerUnit: "",
});

export default function Purchases() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [tab, setTab] = useState("vendors");
  const [vendors, setVendors] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (!shopId) return;
    const u1 = onSnapshot(query(collection(db, "vendors"), where("shopId", "==", shopId)), (s) =>
      setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "purchases"), where("shopId", "==", shopId)), (s) =>
      setPurchases(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "vendorPayments"), where("shopId", "==", shopId)), (s) =>
      setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, [shopId]);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>💰 Purchases</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "vendors",  label: "Vendors" },
            { id: "grn",      label: "New GRN" },
            { id: "history",  label: "GRN History" },
            { id: "ledger",   label: "Ledger" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: "8px 16px", borderRadius: 20, border: "1.5px solid",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                borderColor: tab === t.id ? "#1a1a2e" : "#ddd",
                background: tab === t.id ? "#1a1a2e" : "#fff",
                color: tab === t.id ? "#fff" : "#555",
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "vendors" && <VendorsTab shopId={shopId} userData={userData} toast={toast} vendors={vendors} />}
      {tab === "grn"     && <GRNTab     shopId={shopId} userData={userData} toast={toast} vendors={vendors} />}
      {tab === "history" && <HistoryTab purchases={purchases} />}
      {tab === "ledger"  && <LedgerTab  vendors={vendors} purchases={purchases} payments={payments} shopId={shopId} userData={userData} toast={toast} />}
    </div>
  );
}

// ───── Vendors tab ─────
function VendorsTab({ shopId, userData, toast, vendors }) {
  const [form, setForm] = useState(emptyVendor);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const save = async () => {
    if (!assertShopId(shopId, toast, "Purchases.Vendors.save")) return;
    if (!form.name) { toast("Vendor name required", "warn"); return; }
    try {
      const data = {
        shopId,
        name: form.name.trim(), type: form.type, phone: form.phone.trim(),
        email: form.email.trim(), city: form.city.trim(), gst: form.gst.trim(),
        openingBalance: Number(form.openingBalance) || 0,
        notes: form.notes,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, "vendors", editId), data);
        await logActivity({ shopId, action: "update", entity: "vendor", entityId: editId, uid: userData?.id, name: userData?.name });
        toast("Vendor updated", "success");
      } else {
        data.createdAt = serverTimestamp();
        const r = await addDoc(collection(db, "vendors"), data);
        await logActivity({ shopId, action: "create", entity: "vendor", entityId: r.id, uid: userData?.id, name: userData?.name });
        toast("Vendor added", "success");
      }
      setForm(emptyVendor); setEditId(null); setShowForm(false);
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
  };

  const handleEdit = (v) => {
    setForm({
      name: v.name || "", type: v.type || "manufacturer", phone: v.phone || "",
      email: v.email || "", city: v.city || "", gst: v.gst || "",
      openingBalance: String(v.openingBalance || 0), notes: v.notes || "",
    });
    setEditId(v.id); setShowForm(true);
  };

  const handleDelete = async (v) => {
    if (!assertShopId(shopId, toast, "Purchases.Vendors.handleDelete")) return;
    if (!window.confirm(`Delete vendor ${v.name}?`)) return;
    await deleteDoc(doc(db, "vendors", v.id));
    await logActivity({ shopId, action: "delete", entity: "vendor", entityId: v.id, uid: userData?.id, name: userData?.name });
    toast("Vendor deleted", "success");
  };

  const filtered = vendors.filter((v) =>
    !search || v.name?.toLowerCase().includes(search.toLowerCase()) || v.phone?.includes(search) || v.gst?.includes(search)
  );

  const inp = (label, field, type = "text") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label className="label">{label}</label>
      <input type={type} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className="input" />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search vendor"
          style={{ padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, width: 280 }} />
        <button onClick={() => { setShowForm(!showForm); setForm(emptyVendor); setEditId(null); }} className="btn btn-primary">
          {showForm ? "✕ Cancel" : "+ Add Vendor"}
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-4">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {inp("Name *", "name")}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label className="label">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input bg-white">
                {VENDOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {inp("Phone", "phone")}
            {inp("Email", "email", "email")}
            {inp("City", "city")}
            {inp("GST Number", "gst")}
            {inp("Opening Balance (₹)", "openingBalance", "number")}
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="input" />
          </div>
          <button onClick={save} className="btn btn-primary mt-4">{editId ? "💾 Update" : "💾 Save"}</button>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {filtered.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No vendors yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Name", "Type", "Phone", "City", "GST", "Opening", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => (
                  <tr key={v.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{v.name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{VENDOR_TYPES.find((t) => t.value === v.type)?.label || v.type}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{v.phone || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{v.city || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, fontFamily: "monospace" }}>{v.gst || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{formatINR(v.openingBalance)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => handleEdit(v)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginRight: 6 }}>Edit</button>
                      <button onClick={() => handleDelete(v)} className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }}>Del</button>
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

// ───── GRN tab ─────
function GRNTab({ shopId, userData, toast, vendors }) {
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [showInlineVendor, setShowInlineVendor] = useState(false);
  const [inlineVendor, setInlineVendor] = useState({ name: "", phone: "", gst: "" });
  const [inlineSaving, setInlineSaving] = useState(false);
  const inlineVendorRef = useAutoFocus(showInlineVendor ? "open" : "closed");
  useShortcut("ctrl+n", () => setShowInlineVendor(true));

  const createInlineVendor = async () => {
    if (!assertShopId(shopId, toast, "Purchases.GRN.inlineVendor")) return;
    if (!inlineVendor.name) { toast("Vendor name required", "warn"); return; }
    setInlineSaving(true);
    try {
      const data = {
        shopId,
        name: inlineVendor.name.trim(),
        type: "wholesaler",
        phone: inlineVendor.phone.trim(),
        email: "", city: "", gst: inlineVendor.gst.trim(),
        openingBalance: 0, notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "vendors"), data);
      await logActivity({ shopId, action: "create", entity: "vendor", entityId: ref.id,
        uid: userData?.id, name: userData?.name, meta: { name: data.name, inline: true } });
      // Auto-select the new vendor for this GRN.
      setVendorId(ref.id);
      setVendorName(data.name);
      setInlineVendor({ name: "", phone: "", gst: "" });
      setShowInlineVendor(false);
      toast(`Vendor ${data.name} added & selected`, "success");
    } catch (err) {
      toast("Failed to add vendor: " + err.message, "error");
    } finally { setInlineSaving(false); }
  };

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([emptyLine()]);
  const [paid, setPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const setLine = (i, patch) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.costPerUnit) || 0) * (Number(l.qty) || 0), 0),
    [lines]
  );

  const handleSave = async () => {
    if (!assertShopId(shopId, toast, "Purchases.GRN.handleSave")) return;
    if (!vendorId) { toast("Pick a vendor", "warn"); return; }
    if (lines.length === 0 || lines.every((l) => !l.name)) { toast("Add at least one item", "warn"); return; }
    setSaving(true);
    try {
      const grnNo = "GRN" + Date.now().toString().slice(-6);
      const cleaned = lines
        .filter((l) => l.name && l.qty)
        .map((l) => ({
          name: l.name.trim(),
          category: l.category, karat: l.karat, itemType: l.itemType,
          weight: Number(l.weight) || 0,
          qty: Number(l.qty) || 1,
          makingCharge: Number(l.makingCharge) || 0,
          makingType: l.makingType,
          costPerUnit: Number(l.costPerUnit) || 0,
          lineCost: (Number(l.costPerUnit) || 0) * (Number(l.qty) || 0),
        }));

      const grnData = {
        shopId, grnNo, vendorId, vendorName,
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        items: cleaned,
        total,
        paid: Number(paid) || 0,
        balance: Math.max(0, total - (Number(paid) || 0)),
        paymentMode,
        notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };

      // Use a transaction so GRN write + product creates feel atomic-ish
      // (Firestore tx max 500 writes; jewelry GRNs rarely exceed that).
      const grnRef = doc(collection(db, "purchases"));
      await runTransaction(db, async (tx) => {
        tx.set(grnRef, grnData);
        for (const l of cleaned) {
          const productRef = doc(collection(db, "products"));
          tx.set(productRef, {
            shopId,
            name: l.name, itemType: l.itemType,
            category: l.category, karat: l.karat,
            weight: l.weight, netWeight: l.weight,
            makingCharge: l.makingCharge, makingType: l.makingType,
            wastagePct: 0, hallmarkCharge: 0,
            qty: l.qty,
            price: l.costPerUnit,            // selling price = cost initially; user can adjust
            barcode: `SKKL-${(l.category || "X").slice(0, 1).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            huid: "",
            description: `From GRN ${grnNo}`,
            stones: [], stoneValue: 0, photos: [],
            lowStockThreshold: 1,
            sourceGRN: grnRef.id,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }
      });

      // Optional payment record
      if (Number(paid) > 0) {
        await addDoc(collection(db, "vendorPayments"), {
          shopId, vendorId, vendorName,
          amount: Number(paid), mode: paymentMode,
          ref: grnNo, type: "grn_advance",
          createdAt: serverTimestamp(),
        });
      }

      await logActivity({
        shopId, action: "create", entity: "purchase", entityId: grnRef.id,
        uid: userData?.id, name: userData?.name,
        meta: { grnNo, total, items: cleaned.length, vendorName },
      });

      toast(`GRN ${grnNo} saved · ${cleaned.length} item(s) added to inventory`, "success");
      setVendorId(""); setVendorName(""); setInvoiceNo("");
      setLines([emptyLine()]); setPaid(""); setNotes("");
    } catch (err) {
      console.error("[grn]", err);
      toast(err?.message || "GRN save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card p-5 mb-4">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label className="label">Vendor *</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value);
                  const v = vendors.find((x) => x.id === e.target.value);
                  setVendorName(v?.name || "");
                }}
                className="input bg-white" style={{ flex: 1 }}>
                <option value="">— Select —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button onClick={() => setShowInlineVendor((v) => !v)}
                title="Add vendor inline (Ctrl+N)"
                style={{ padding: "0 12px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                {showInlineVendor ? "✕" : "+"}
              </button>
            </div>
            {showInlineVendor && (
              <div style={{ marginTop: 8, padding: 10, background: "#FFFDE7", border: "1px solid #FDD835", borderRadius: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
                  <input ref={inlineVendorRef} value={inlineVendor.name} onChange={(e) => setInlineVendor((v) => ({ ...v, name: e.target.value }))}
                    placeholder="Vendor name" className="input" />
                  <input value={inlineVendor.phone} onChange={(e) => setInlineVendor((v) => ({ ...v, phone: e.target.value }))}
                    placeholder="Phone" className="input" />
                  <input value={inlineVendor.gst} onChange={(e) => setInlineVendor((v) => ({ ...v, gst: e.target.value.toUpperCase() }))}
                    placeholder="GST (opt)" className="input" style={{ textTransform: "uppercase" }} />
                </div>
                <button onClick={createInlineVendor} disabled={inlineSaving}
                  style={{ marginTop: 8, padding: "6px 14px", background: "#4CAF50", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {inlineSaving ? "Adding…" : "💾 Add Vendor"}
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="label">Invoice No</label>
            <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="input" placeholder="INV-2026-0042" />
          </div>
          <div>
            <label className="label">Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="input" />
          </div>
        </div>
      </div>

      <div className="card p-5 mb-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong>Items received</strong>
          <button onClick={() => setLines((l) => [...l, emptyLine()])} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>
            + Line
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                {["#", "Name", "Cat", "Karat", "Type", "Weight", "Qty", "Mk Type", "Mk", "Cost/u", "Line"].map((h) => (
                  <th key={h} style={{ padding: 8, textAlign: "left", fontSize: 10, color: "#888", fontWeight: 600 }}>{h}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: 6, color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: 6 }}><input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="Gold ring 5g" style={miniInp} /></td>
                  <td style={{ padding: 6 }}>
                    <select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} style={miniInp}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6 }}>
                    <select value={l.karat} onChange={(e) => setLine(i, { karat: e.target.value })} style={miniInp}>
                      {KARATS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6 }}>
                    <select value={l.itemType} onChange={(e) => setLine(i, { itemType: e.target.value })} style={miniInp}>
                      {ITEM_TYPES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6 }}><input type="number" value={l.weight} onChange={(e) => setLine(i, { weight: e.target.value })} style={{ ...miniInp, width: 70 }} /></td>
                  <td style={{ padding: 6 }}><input type="number" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} style={{ ...miniInp, width: 50 }} /></td>
                  <td style={{ padding: 6 }}>
                    <select value={l.makingType} onChange={(e) => setLine(i, { makingType: e.target.value })} style={miniInp}>
                      <option value="per_gram">per g</option><option value="percent">%</option><option value="fixed">flat</option>
                    </select>
                  </td>
                  <td style={{ padding: 6 }}><input type="number" value={l.makingCharge} onChange={(e) => setLine(i, { makingCharge: e.target.value })} style={{ ...miniInp, width: 60 }} /></td>
                  <td style={{ padding: 6 }}><input type="number" value={l.costPerUnit} onChange={(e) => setLine(i, { costPerUnit: e.target.value })} style={{ ...miniInp, width: 80 }} /></td>
                  <td style={{ padding: 6, fontWeight: 700 }}>₹{((Number(l.costPerUnit) || 0) * (Number(l.qty) || 0)).toLocaleString("en-IN")}</td>
                  <td style={{ padding: 6 }}>
                    <button onClick={() => setLines((arr) => arr.filter((_, idx) => idx !== i))} disabled={lines.length === 1}
                      style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 16 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="10" style={{ textAlign: "right", padding: 10, fontWeight: 700 }}>Total</td>
                <td style={{ padding: 10, fontWeight: 800, fontSize: 14 }}>₹{total.toLocaleString("en-IN")}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12 }}>
          <div>
            <label className="label">Paid Now</label>
            <input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} className="input" placeholder="0 = no payment" />
          </div>
          <div>
            <label className="label">Mode</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="input bg-white">
              {["cash", "upi", "bank", "cheque", "card", "credit"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary mt-4">
          {saving ? "Saving…" : "💾 Save GRN & Add to Inventory"}
        </button>
      </div>
    </div>
  );
}

// ───── GRN history tab ─────
function HistoryTab({ purchases }) {
  const sorted = [...purchases].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  if (sorted.length === 0) return <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>No GRNs yet</div>;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8f9fa" }}>
            {["GRN", "Vendor", "Invoice", "Date", "Items", "Total", "Paid", "Balance"].map((h) => (
              <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{p.grnNo}</td>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>{p.vendorName}</td>
              <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "monospace" }}>{p.invoiceNo || "—"}</td>
              <td style={{ padding: "10px 14px", fontSize: 12 }}>{formatDate(p.createdAt)}</td>
              <td style={{ padding: "10px 14px", fontSize: 12 }}>{p.items?.length || 0}</td>
              <td style={{ padding: "10px 14px", fontWeight: 700 }}>{formatINR(p.total)}</td>
              <td style={{ padding: "10px 14px", color: "green" }}>{formatINR(p.paid)}</td>
              <td style={{ padding: "10px 14px", color: p.balance > 0 ? "#C62828" : "#888", fontWeight: p.balance > 0 ? 700 : 400 }}>{formatINR(p.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───── Ledger tab ─────
function LedgerTab({ vendors, purchases, payments, shopId, userData, toast }) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || "");
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");

  // Sync default vendor when list changes
  useEffect(() => {
    if (!vendorId && vendors[0]?.id) setVendorId(vendors[0].id);
  }, [vendors, vendorId]);

  const vendor = vendors.find((v) => v.id === vendorId);
  const vGRNs = purchases.filter((p) => p.vendorId === vendorId);
  const vPays = payments.filter((p) => p.vendorId === vendorId);

  const totalPurchases = vGRNs.reduce((s, p) => s + (p.total || 0), 0);
  const totalPaid = vPays.reduce((s, p) => s + (p.amount || 0), 0)
    + vGRNs.reduce((s, p) => s + (p.paid || 0), 0);
  const opening = Number(vendor?.openingBalance) || 0;
  const balance = opening + totalPurchases - totalPaid;

  const recordPayment = async () => {
    if (!assertShopId(shopId, toast, "Purchases.Ledger.recordPayment")) return;
    if (!vendorId) { toast("Pick a vendor", "warn"); return; }
    if (!payAmount || Number(payAmount) <= 0) { toast("Enter amount", "warn"); return; }
    try {
      await addDoc(collection(db, "vendorPayments"), {
        shopId, vendorId, vendorName: vendor?.name,
        amount: Number(payAmount), mode: payMode, type: "payment",
        createdAt: serverTimestamp(),
      });
      await logActivity({ shopId, action: "create", entity: "vendor_payment", uid: userData?.id, name: userData?.name, meta: { vendorName: vendor?.name, amount: Number(payAmount) } });
      toast("Payment recorded", "success");
      setPayAmount("");
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
  };

  if (!vendor) return <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>Add a vendor first</div>;

  return (
    <div>
      <div className="card p-5 mb-4">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Vendor</label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="input bg-white">
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Pay Amount</label>
            <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Mode</label>
            <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="input bg-white">
              {["cash", "upi", "bank", "cheque", "card"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <button onClick={recordPayment} className="btn btn-primary">+ Record Payment</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Opening Balance" value={opening} />
        <Stat label="Total Purchases" value={totalPurchases} accent="red" />
        <Stat label="Total Paid" value={totalPaid} accent="green" />
        <Stat label="Outstanding" value={balance} accent={balance > 0 ? "red" : "green"} bold />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>
          Ledger — {vendor.name}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["Date", "Particulars", "Debit", "Credit", "Mode"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opening > 0 && (
              <tr style={{ borderTop: "1px solid #f5f5f5" }}>
                <td style={{ padding: "10px 14px", color: "#888", fontSize: 12 }}>Opening</td>
                <td style={{ padding: "10px 14px" }}>Opening balance</td>
                <td style={{ padding: "10px 14px", color: "#C62828", fontWeight: 600 }}>{formatINR(opening)}</td>
                <td></td><td></td>
              </tr>
            )}
            {[
              ...vGRNs.map((p) => ({ kind: "grn", date: p.createdAt, label: `GRN ${p.grnNo} (Inv ${p.invoiceNo || "-"})`, debit: p.total, credit: p.paid, mode: p.paymentMode, ts: p.createdAt?.toMillis?.() || 0 })),
              ...vPays.filter((p) => p.type !== "grn_advance").map((p) => ({ kind: "pay", date: p.createdAt, label: `Payment`, debit: 0, credit: p.amount, mode: p.mode, ts: p.createdAt?.toMillis?.() || 0 })),
            ].sort((a, b) => a.ts - b.ts).map((row, i) => (
              <tr key={i} style={{ borderTop: "1px solid #f5f5f5" }}>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>{formatDate(row.date)}</td>
                <td style={{ padding: "10px 14px" }}>{row.label}</td>
                <td style={{ padding: "10px 14px", color: "#C62828" }}>{row.debit ? formatINR(row.debit) : ""}</td>
                <td style={{ padding: "10px 14px", color: "green" }}>{row.credit ? formatINR(row.credit) : ""}</td>
                <td style={{ padding: "10px 14px", textTransform: "uppercase", fontSize: 11, color: "#888" }}>{row.mode || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const miniInp = { padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, outline: "none", width: "100%", background: "#fff" };

function Stat({ label, value, accent, bold }) {
  const colors = { red: "#C62828", green: "#1B5E20", default: "#1a1a2e" };
  return (
    <div className="card p-4">
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: bold ? 800 : 700, color: colors[accent] || colors.default }}>{formatINR(value)}</div>
    </div>
  );
}
