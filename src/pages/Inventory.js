import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, deleteDoc,
  doc, query, where, updateDoc, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = ["Gold", "Silver", "Diamond", "Other"];
const KARATS = ["24K", "22K", "18K", "14K", "92.5", "80", "Sterling", "N/A"];
const ITEM_TYPES = [
  "Ring", "Necklace", "Bracelet", "Earring", "Pendant", "Bangle",
  "Chain", "Anklet", "Nose Pin", "Mangalsutra", "Kada", "Coin", "Bar", "Other"
];

const emptyForm = {
  name: "", itemType: "Ring", category: "Gold",
  karat: "22K", weight: "", makingCharge: "", makingType: "per_gram",
  qty: "1", price: "", barcode: "", description: ""
};

export default function Inventory() {
  const { userData } = useAuth();
  const shopId = userData?.shopId;

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Load products
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "products"), where("shopId", "==", shopId));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  const handleSave = async () => {
    if (!form.name || !form.weight) {
      setMsg("⚠️ Product name and weight are required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        shopId,
        name: form.name,
        itemType: form.itemType,
        category: form.category,
        karat: form.karat,
        weight: Number(form.weight),
        makingCharge: Number(form.makingCharge || 0),
        makingType: form.makingType, // "per_gram" or "percent" or "fixed"
        qty: Number(form.qty || 1),
        price: Number(form.price || 0),
        barcode: form.barcode,
        description: form.description,
        updatedAt: serverTimestamp()
      };

      if (editId) {
        await updateDoc(doc(db, "products", editId), data);
        setMsg("✅ Product updated!");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "products"), data);
        setMsg("✅ Product added!");
      }

      setForm(emptyForm);
      setEditId(null);
      setShowForm(false);
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setMsg("❌ Error: " + err.message);
    }
    setSaving(false);
  };

  const handleEdit = (p) => {
    setForm({
      name: p.name || "", itemType: p.itemType || "Ring",
      category: p.category || "Gold", karat: p.karat || "22K",
      weight: String(p.weight || ""), makingCharge: String(p.makingCharge || ""),
      makingType: p.makingType || "per_gram",
      qty: String(p.qty || 1), price: String(p.price || ""),
      barcode: p.barcode || "", description: p.description || ""
    });
    setEditId(p.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await deleteDoc(doc(db, "products", id));
  };

  const filtered = products.filter(p => {
    const matchCat = filterCat === "All" || p.category === filterCat;
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const inp = (label, field, type = "text", placeholder = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        placeholder={placeholder}
        style={{
          padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px",
          fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box"
        }}
      />
    </div>
  );

  const sel = (label, field, options) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>{label}</label>
      <select
        value={form[field]}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        style={{
          padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px",
          fontSize: "14px", outline: "none", background: "#fff"
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e", margin: 0 }}>📦 Inventory</h1>
          <p style={{ color: "#888", fontSize: "13px", margin: "4px 0 0" }}>
            {products.length} products · Gold: {products.filter(p => p.category === "Gold").length} · Silver: {products.filter(p => p.category === "Silver").length}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setForm(emptyForm); setEditId(null); }}
          style={{
            padding: "10px 20px", fontSize: "14px", fontWeight: "600",
            background: showForm ? "#fff" : "#1a1a2e",
            color: showForm ? "#333" : "#fff",
            border: "1.5px solid #1a1a2e", borderRadius: "10px", cursor: "pointer"
          }}
        >
          {showForm ? "✕ Cancel" : "+ Add Product"}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{
          background: "#fff", border: "1px solid #eee",
          borderRadius: "14px", padding: "24px", marginBottom: "24px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)"
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#1a1a2e", marginTop: 0, marginBottom: "20px" }}>
            {editId ? "✏️ Edit Product" : "➕ Add New Product"}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {inp("Product Name *", "name", "text", "e.g. Gold Ring")}
            {sel("Item Type", "itemType", ITEM_TYPES)}
            {sel("Category *", "category", CATEGORIES)}
            {sel("Karat / Purity", "karat", KARATS)}
            {inp("Weight (grams) *", "weight", "number", "e.g. 5.5")}
            {inp("Quantity", "qty", "number", "e.g. 1")}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {/* Making charge type */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>Making Charge Type</label>
              <select
                value={form.makingType}
                onChange={e => setForm(f => ({ ...f, makingType: e.target.value }))}
                style={{ padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "14px", outline: "none", background: "#fff" }}
              >
                <option value="per_gram">Per Gram (₹)</option>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>
            {inp(`Making Charge (${form.makingType === "per_gram" ? "₹/g" : form.makingType === "percent" ? "%" : "₹ fixed"})`, "makingCharge", "number", "e.g. 250")}
            {inp("Selling Price (₹) — optional override", "price", "number", "Leave 0 for auto-calc")}
            {inp("Barcode / Tag No.", "barcode", "text", "Optional")}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "20px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Design details, notes..."
              rows={2}
              style={{
                padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px",
                fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit"
              }}
            />
          </div>

          {msg && (
            <div style={{ marginBottom: "14px", padding: "10px 14px", background: msg.startsWith("✅") ? "#E8F5E9" : "#FFF3E0", borderRadius: "8px", fontSize: "13px" }}>
              {msg}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "12px 32px", fontSize: "14px", fontWeight: "700",
              background: saving ? "#ccc" : "#1a1a2e",
              color: "#fff", border: "none", borderRadius: "10px",
              cursor: saving ? "not-allowed" : "pointer"
            }}
          >
            {saving ? "Saving..." : editId ? "💾 Update Product" : "💾 Save Product"}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search by name or barcode..."
          style={{
            padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: "10px",
            fontSize: "13px", outline: "none", width: "250px"
          }}
        />
        {["All", ...CATEGORIES].map(c => (
          <button
            key={c} onClick={() => setFilterCat(c)}
            style={{
              padding: "8px 16px", borderRadius: "20px", border: "1.5px solid",
              fontSize: "13px", fontWeight: "600", cursor: "pointer",
              borderColor: filterCat === c ? "#1a1a2e" : "#ddd",
              background: filterCat === c ? "#1a1a2e" : "#fff",
              color: filterCat === c ? "#fff" : "#555"
            }}
          >{c}</button>
        ))}
      </div>

      {/* Products Table */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #eee", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "50px", textAlign: "center", color: "#bbb" }}>
            No products found. Add your first product above.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                {["Name", "Type", "Category", "Karat", "Weight", "Making", "Qty", "Price", "Actions"].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", fontSize: "11px", fontWeight: "600",
                    color: "#888", textAlign: "left", textTransform: "uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#1a1a2e" }}>{p.name}</div>
                    {p.barcode && <div style={{ fontSize: "11px", color: "#aaa" }}>#{p.barcode}</div>}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: "12px", color: "#555" }}>{p.itemType}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "20px",
                      background: p.category === "Gold" ? "#FFF8E1" : p.category === "Silver" ? "#F5F5F5" : p.category === "Diamond" ? "#E3F2FD" : "#F3E5F5",
                      color: p.category === "Gold" ? "#B8860B" : p.category === "Silver" ? "#666" : p.category === "Diamond" ? "#1565C0" : "#6A1B9A"
                    }}>{p.category}</span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: "#555" }}>{p.karat}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", fontWeight: "600" }}>{p.weight}g</td>
                  <td style={{ padding: "12px 14px", fontSize: "12px", color: "#555" }}>
                    {p.makingCharge}{p.makingType === "per_gram" ? "₹/g" : p.makingType === "percent" ? "%" : "₹"}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      fontSize: "12px", fontWeight: "700", padding: "3px 8px", borderRadius: "6px",
                      background: p.qty === 0 ? "#FFEBEE" : p.qty <= 2 ? "#FFF3E0" : "#E8F5E9",
                      color: p.qty === 0 ? "#C62828" : p.qty <= 2 ? "#E65100" : "#1B5E20"
                    }}>{p.qty}</span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", fontWeight: "700", color: "#1a1a2e" }}>
                    {p.price ? `₹${Number(p.price).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => handleEdit(p)}
                        style={{
                          padding: "5px 12px", fontSize: "12px",
                          background: "#E3F2FD", color: "#1565C0",
                          border: "none", borderRadius: "6px", cursor: "pointer"
                        }}
                      >Edit</button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{
                          padding: "5px 12px", fontSize: "12px",
                          background: "#FFEBEE", color: "#C62828",
                          border: "none", borderRadius: "6px", cursor: "pointer"
                        }}
                      >Delete</button>
                    </div>
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
