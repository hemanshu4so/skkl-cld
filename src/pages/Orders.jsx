// src/pages/Orders.jsx — Phase 4 Orders module
import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import { collection, addDoc, deleteDoc, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { assertShopId } from "../lib/utils";
import { formatINR } from "../lib/constants";
import { logActivity } from "../lib/activityLog";
import { uploadShopFile } from "../lib/upload";
import { openWhatsApp } from "../services/whatsapp";

const STATUS = [
  { value: "draft",       label: "Draft",        color: "#9E9E9E" },
  { value: "confirmed",   label: "Confirmed",    color: "#2196F3" },
  { value: "in_progress", label: "In Progress",  color: "#FF9800" },
  { value: "ready",       label: "Ready",        color: "#4CAF50" },
  { value: "delivered",   label: "Delivered",    color: "#9E9E9E" },
  { value: "cancelled",   label: "Cancelled",    color: "#E53935" },
];
const STATUS_FLOW = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};
const empty = {
  customerId: "", customerName: "", customerPhone: "",
  itemDescription: "", category: "Gold", karat: "22K",
  weight: "", makingCharge: "", makingType: "per_gram",
  estimatedAmount: "", advance: "", designNotes: "",
  assignedTo: "karigar", karigarId: "", karigarName: "",
  vendorId: "", vendorName: "", expectedDate: "", photos: [],
};

export default function Orders() {
  const { userData, shopId, shopData } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [karigars, setKarigars] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const subRefs = useRef({});

  useEffect(() => {
    Object.values(subRefs.current).forEach((u) => u && u());
    subRefs.current = {};
    if (!shopId) return undefined;
    subRefs.current.orders = onSnapshot(query(collection(db, "orders"), where("shopId", "==", shopId)),
      (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error("[orders]", err); toast("Could not load orders", "error"); });
    subRefs.current.customers = onSnapshot(query(collection(db, "customers"), where("shopId", "==", shopId)),
      (s) => setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    subRefs.current.karigars = onSnapshot(query(collection(db, "karigars"), where("shopId", "==", shopId)),
      (s) => setKarigars(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    subRefs.current.vendors = onSnapshot(query(collection(db, "vendors"), where("shopId", "==", shopId)),
      (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => Object.values(subRefs.current).forEach((u) => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const filteredCust = customers.filter((c) =>
    customerSearch && (c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
  ).slice(0, 5);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (!assertShopId(shopId, toast, "Orders.upload")) return;
    setUploading(true);
    try {
      const uploads = await Promise.all(files.map((file) => uploadShopFile({ shopId, kind: "orders", entityId: editId || "_draft", file })));
      setForm((f) => ({ ...f, photos: [...(f.photos || []), ...uploads] }));
      toast(`Uploaded ${uploads.length} photo(s)`, "success");
    } catch (err) { toast("Upload failed: " + err.message, "error"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const save = async () => {
    if (!assertShopId(shopId, toast, "Orders.save")) return;
    if (!form.customerName) { toast("Pick or type a customer", "warn"); return; }
    if (!form.itemDescription) { toast("Item description required", "warn"); return; }
    setSaving(true);
    try {
      const payload = {
        shopId,
        customerId: form.customerId || null,
        customerName: form.customerName, customerPhone: form.customerPhone,
        itemDescription: form.itemDescription, category: form.category, karat: form.karat,
        weight: Number(form.weight) || 0,
        makingCharge: Number(form.makingCharge) || 0, makingType: form.makingType,
        estimatedAmount: Number(form.estimatedAmount) || 0,
        advance: Number(form.advance) || 0,
        designNotes: form.designNotes,
        assignedTo: form.assignedTo,
        karigarId:  form.assignedTo === "karigar"   ? form.karigarId  || null : null,
        karigarName: form.assignedTo === "karigar"  ? form.karigarName || ""  : "",
        vendorId:   form.assignedTo === "wholesaler" ? form.vendorId   || null : null,
        vendorName: form.assignedTo === "wholesaler" ? form.vendorName || ""   : "",
        expectedDate: form.expectedDate, photos: form.photos || [],
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, "orders", editId), payload);
        await logActivity({ shopId, action: "update", entity: "order", entityId: editId, uid: userData?.id, name: userData?.name });
        toast("Order updated", "success");
      } else {
        const orderNo = "ORD" + Date.now().toString().slice(-6);
        const data = { ...payload, orderNo, status: "draft", history: [], createdAt: serverTimestamp() };
        const r = await addDoc(collection(db, "orders"), data);
        await logActivity({ shopId, action: "create", entity: "order", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { orderNo, customer: data.customerName } });
        toast(`Order ${orderNo} created`, "success");
      }
      setForm(empty); setEditId(null); setShowForm(false);
    } catch (err) { toast("Error: " + err.message, "error"); }
    setSaving(false);
  };

  const handleEdit = (o) => {
    setForm({
      customerId: o.customerId || "", customerName: o.customerName || "", customerPhone: o.customerPhone || "",
      itemDescription: o.itemDescription || "", category: o.category || "Gold", karat: o.karat || "22K",
      weight: String(o.weight || ""), makingCharge: String(o.makingCharge || ""), makingType: o.makingType || "per_gram",
      estimatedAmount: String(o.estimatedAmount || ""), advance: String(o.advance || ""),
      designNotes: o.designNotes || "",
      assignedTo: o.assignedTo || "karigar",
      karigarId: o.karigarId || "", karigarName: o.karigarName || "",
      vendorId:  o.vendorId  || "", vendorName: o.vendorName || "",
      expectedDate: o.expectedDate || "", photos: o.photos || [],
    });
    setEditId(o.id); setShowForm(true);
  };

  const handleDelete = async (o) => {
    if (!window.confirm(`Delete order ${o.orderNo}?`)) return;
    await deleteDoc(doc(db, "orders", o.id));
    await logActivity({ shopId, action: "delete", entity: "order", entityId: o.id, uid: userData?.id, name: userData?.name });
    toast("Order deleted", "success");
  };

  const moveStatus = async (o, next) => {
    if (!STATUS_FLOW[o.status]?.includes(next)) { toast(`Cannot move from ${o.status} to ${next}`, "warn"); return; }
    const entry = { from: o.status, to: next, at: new Date().toISOString(), by: userData?.name || "user" };
    await updateDoc(doc(db, "orders", o.id), { status: next, history: [...(o.history || []), entry], updatedAt: serverTimestamp() });
    await logActivity({ shopId, action: "status_change", entity: "order", entityId: o.id, uid: userData?.id, name: userData?.name, meta: { orderNo: o.orderNo, from: o.status, to: next } });
    toast(`Status → ${STATUS.find((s) => s.value === next)?.label}`, "success");
  };

  const sendWhatsApp = (o) => {
    const shopName = shopData?.company?.name || shopData?.name || "our shop";
    const lines = [
      `Hi ${o.customerName || "there"},`, "",
      `Update from ${shopName} on order #${o.orderNo}:`,
      o.itemDescription,
      `${o.category} ${o.karat}${o.weight ? ` · ${o.weight}g` : ""}`,
      `Status: ${STATUS.find((s) => s.value === o.status)?.label || o.status}`,
      o.estimatedAmount ? `Estimate: ₹${Number(o.estimatedAmount).toLocaleString("en-IN")}` : null,
      o.advance ? `Advance paid: ₹${Number(o.advance).toLocaleString("en-IN")}` : null,
      o.expectedDate ? `Expected by: ${o.expectedDate}` : null,
      "", "Reach out if you have any questions 🙏",
    ].filter(Boolean);
    openWhatsApp(o.customerPhone, lines.join("\n"));
  };

  const filtered = useMemo(() => orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (search) {
      const t = search.toLowerCase();
      return (o.orderNo || "").toLowerCase().includes(t)
        || (o.customerName || "").toLowerCase().includes(t)
        || (o.customerPhone || "").includes(search)
        || (o.itemDescription || "").toLowerCase().includes(t);
    }
    return true;
  }).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
  [orders, filter, search]);

  const counts = useMemo(() => {
    const c = { all: orders.length };
    STATUS.forEach((s) => { c[s.value] = orders.filter((o) => o.status === s.value).length; });
    return c;
  }, [orders]);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>📋 Orders</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>
            {counts.all} total · {counts.in_progress || 0} in progress · {counts.ready || 0} ready
          </p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setForm(empty); setEditId(null); }} className="btn btn-primary">
          {showForm ? "✕ Cancel" : "+ New Order"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 order # / name / phone / description"
          style={{ padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, width: 280 }} />
        {[{ value: "all", label: `All (${counts.all})` }, ...STATUS.map((s) => ({ ...s, label: `${s.label} (${counts[s.value] || 0})` }))].map((s) => (
          <button key={s.value} onClick={() => setFilter(s.value)}
            style={{ padding: "8px 14px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: filter === s.value ? "#1a1a2e" : "#ddd",
              background: filter === s.value ? "#1a1a2e" : "#fff", color: filter === s.value ? "#fff" : "#555" }}>
            {s.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card p-5 mb-4">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>{editId ? "Edit Order" : "New Order"}</h2>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Customer *</label>
            {form.customerId || form.customerName ? (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#E8F5E9", borderRadius: 8 }}>
                <span><strong>{form.customerName}</strong>{form.customerPhone ? ` · ${form.customerPhone}` : ""}</span>
                <button onClick={() => setForm((f) => ({ ...f, customerId: "", customerName: "", customerPhone: "" }))}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }}>×</button>
              </div>
            ) : (
              <div>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search by name or phone…" className="input" />
                {filteredCust.map((c) => (
                  <div key={c.id} onClick={() => { setForm((f) => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone })); setCustomerSearch(""); }}
                    style={{ padding: "9px 12px", cursor: "pointer", border: "1px solid #eee", borderRadius: 8, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Or type a walk-in name + phone:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Walk-in name" className="input" />
                  <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="Phone" className="input" />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div><label className="label">Item Description *</label>
              <input value={form.itemDescription} onChange={(e) => setForm((f) => ({ ...f, itemDescription: e.target.value }))} placeholder="e.g. Custom 22K gold ring 5g" className="input" /></div>
            <div><label className="label">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input bg-white">
                {["Gold", "Silver", "Diamond", "Platinum", "Other"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className="label">Karat</label>
              <select value={form.karat} onChange={(e) => setForm((f) => ({ ...f, karat: e.target.value }))} className="input bg-white">
                {["24K","22K","20K","18K","14K","9K","92.5","Sterling","N/A"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className="label">Weight (g)</label>
              <input type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} className="input" /></div>
            <div><label className="label">Estimate</label>
              <input type="number" value={form.estimatedAmount} onChange={(e) => setForm((f) => ({ ...f, estimatedAmount: e.target.value }))} className="input" /></div>
            <div><label className="label">Advance</label>
              <input type="number" value={form.advance} onChange={(e) => setForm((f) => ({ ...f, advance: e.target.value }))} className="input" /></div>
            <div><label className="label">Expected Date</label>
              <input type="date" value={form.expectedDate} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} className="input" /></div>
          </div>

          <div style={{ padding: 12, border: "1.5px dashed #ddd", borderRadius: 10, marginBottom: 14 }}>
            <label className="label">Assign to</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {["karigar", "wholesaler"].map((opt) => (
                <button key={opt} onClick={() => setForm((f) => ({ ...f, assignedTo: opt }))}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    background: form.assignedTo === opt ? "#1a1a2e" : "#fff",
                    color: form.assignedTo === opt ? "#fff" : "#555",
                    border: "1.5px solid " + (form.assignedTo === opt ? "#1a1a2e" : "#ddd"),
                    borderRadius: 18, cursor: "pointer", textTransform: "capitalize" }}>
                  {opt}
                </button>
              ))}
            </div>
            {form.assignedTo === "karigar" ? (
              <select value={form.karigarId}
                onChange={(e) => { const k = karigars.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, karigarId: k?.id || "", karigarName: k?.name || "" })); }}
                className="input bg-white">
                <option value="">— Pick karigar —</option>
                {karigars.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            ) : (
              <select value={form.vendorId}
                onChange={(e) => { const v = vendors.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, vendorId: v?.id || "", vendorName: v?.name || "" })); }}
                className="input bg-white">
                <option value="">— Pick wholesaler —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label">📷 Design photos</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(form.photos || []).map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={p.url} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: "1px solid #eee" }} />
                  <button onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }))}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#C62828", color: "#fff", cursor: "pointer", fontSize: 11 }}>×</button>
                </div>
              ))}
              <label style={{ width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px dashed #aaa", borderRadius: 6, cursor: uploading ? "wait" : "pointer", fontSize: 24, color: "#aaa" }}>
                {uploading ? "…" : "+"}
                <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ display: "none" }} disabled={uploading} />
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label">Design notes</label>
            <textarea rows={2} value={form.designNotes} onChange={(e) => setForm((f) => ({ ...f, designNotes: e.target.value }))} className="input" />
          </div>

          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : editId ? "💾 Update Order" : "💾 Create Order"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0
          ? <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>No orders in this filter.</div>
          : filtered.map((o) => {
            const sm = STATUS.find((s) => s.value === o.status) || { label: o.status, color: "#888" };
            const next = STATUS_FLOW[o.status] || [];
            const balance = Math.max(0, (Number(o.estimatedAmount) || 0) - (Number(o.advance) || 0));
            return (
              <div key={o.id} className="card p-5">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 14, color: "#1a1a2e" }}>#{o.orderNo}</strong>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${sm.color}25`, color: sm.color }}>{sm.label}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>👤 {o.customerName} · {o.customerPhone}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{o.itemDescription}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      {o.category} {o.karat} {o.weight ? `· ${o.weight}g` : ""}
                      {o.assignedTo === "karigar" && o.karigarName && <span> · 🛠 {o.karigarName}</span>}
                      {o.assignedTo === "wholesaler" && o.vendorName && <span> · 🏪 {o.vendorName}</span>}
                      {o.expectedDate && <span> · 📅 by {o.expectedDate}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(o.estimatedAmount)}</div>
                    {o.advance > 0 && <div style={{ fontSize: 11, color: "#888" }}>
                      Adv {formatINR(o.advance)}{balance > 0 ? <span style={{ color: "#C62828" }}> · bal {formatINR(balance)}</span> : null}
                    </div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  {next.map((n) => (
                    <button key={n} onClick={() => moveStatus(o, n)} className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>
                      → {STATUS.find((s) => s.value === n)?.label}
                    </button>
                  ))}
                  {o.customerPhone && (
                    <button onClick={() => sendWhatsApp(o)}
                      style={{ padding: "5px 12px", fontSize: 12, background: "#25D366", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                      📱 WhatsApp
                    </button>
                  )}
                  <button onClick={() => handleEdit(o)} className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>Edit</button>
                  <button onClick={() => handleDelete(o)} className="btn btn-danger" style={{ padding: "5px 12px", fontSize: 12 }}>Delete</button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
