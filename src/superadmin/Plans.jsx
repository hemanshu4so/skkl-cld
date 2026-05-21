// src/superadmin/Plans.js — full CRUD for billing plans
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useToast } from "../hooks/useToast";

export default function Plans() {
  const { toast } = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const empty = { name: "", price: "", period: "month", users: "5", products: "1000", trialDays: "7" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "plans"),
      (snap) => { setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { toast(err.message, "error"); setLoading(false); }
    );
    return () => unsub();
  }, [toast]);

  const save = async () => {
    if (!form.name || !form.price) { toast("Name and price required", "warn"); return; }
    try {
      const data = {
        name: form.name.trim(),
        price: Number(form.price),
        period: form.period,
        trialDays: Number(form.trialDays) || 0,
        limits: { users: Number(form.users) || 0, products: Number(form.products) || 0 },
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, "plans", editId), data);
        toast("Plan updated", "success");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "plans"), data);
        toast("Plan created", "success");
      }
      setForm(empty); setEditId(null); setShowForm(false);
    } catch (err) { toast(err.message, "error"); }
  };

  const handleEdit = (p) => {
    setForm({
      name: p.name || "", price: String(p.price || ""), period: p.period || "month",
      users: String(p.limits?.users || 0), products: String(p.limits?.products || 0),
      trialDays: String(p.trialDays || 7),
    });
    setEditId(p.id); setShowForm(true);
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete plan ${p.name}?`)) return;
    await deleteDoc(doc(db, "plans", p.id));
    toast("Plan deleted", "success");
  };

  if (loading) return <p style={{ color: "#fff" }}>Loading…</p>;

  const inputStyle = {
    padding: "9px 12px", borderRadius: 6, border: "1px solid #333",
    background: "#0c0c0c", color: "#fff", fontSize: 13, width: "100%",
  };

  return (
    <div style={{ color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📋 Plans</h2>
        <button onClick={() => { setShowForm(!showForm); setForm(empty); setEditId(null); }}
          style={{ padding: "8px 16px", background: showForm ? "#444" : "#00c853", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          {showForm ? "✕ Cancel" : "+ Add Plan"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#111", padding: 18, borderRadius: 10, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            <div><label style={{ fontSize: 11, color: "#aaa" }}>Plan Name *</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Pro" /></div>
            <div><label style={{ fontSize: 11, color: "#aaa" }}>Price (₹) *</label>
              <input type="number" style={inputStyle} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11, color: "#aaa" }}>Period</label>
              <select style={inputStyle} value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                <option value="month">month</option><option value="year">year</option>
              </select></div>
            <div><label style={{ fontSize: 11, color: "#aaa" }}>Trial Days</label>
              <input type="number" style={inputStyle} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11, color: "#aaa" }}>Max Users</label>
              <input type="number" style={inputStyle} value={form.users} onChange={(e) => setForm((f) => ({ ...f, users: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11, color: "#aaa" }}>Max Products</label>
              <input type="number" style={inputStyle} value={form.products} onChange={(e) => setForm((f) => ({ ...f, products: e.target.value }))} /></div>
          </div>
          <button onClick={save} style={{ marginTop: 14, padding: "9px 18px", background: "#2962ff", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            {editId ? "💾 Update" : "💾 Save"}
          </button>
        </div>
      )}

      {plans.length === 0
        ? <div style={{ padding: 16, background: "#1a1a1a", borderRadius: 10, color: "#aaa" }}>No plans yet.</div>
        : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {plans.map((p) => (
              <div key={p.id} style={{ background: "#111", padding: 18, borderRadius: 10, border: "1px solid #222" }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <p style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                  ₹{Number(p.price || 0).toLocaleString("en-IN")}
                  <span style={{ fontSize: 12, color: "#aaa", fontWeight: 400 }}> /{p.period || "month"}</span>
                </p>
                <p style={{ color: "#aaa", fontSize: 13 }}>
                  Users: {p.limits?.users ?? "—"}<br />
                  Products: {p.limits?.products ?? "—"}<br />
                  Trial: {p.trialDays || 0} days
                </p>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={() => handleEdit(p)} style={{ flex: 1, padding: 6, background: "#2962ff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>Edit</button>
                  <button onClick={() => handleDelete(p)} style={{ flex: 1, padding: 6, background: "#ff3d00", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
