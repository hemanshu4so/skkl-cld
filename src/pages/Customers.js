import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, deleteDoc,
  doc, query, where, updateDoc, serverTimestamp, orderBy
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { assertShopId } from "../lib/utils";

const emptyForm = {
  name: "", phone: "", email: "", address: "",
  city: "", anniversary: "", birthday: "", notes: ""
};

export default function Customers() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  // Load customers
  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "customers"),
      where("shopId", "==", shopId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingList(false);
    }, (err) => { console.error('[customers] snapshot:', err); setLoadingList(false); });
    return () => unsub();
  }, [shopId]);

  // Load selected customer's purchase history
  useEffect(() => {
    if (!selected) { setPurchases([]); return; }
    const q = query(
      collection(db, "sales"),
      where("shopId", "==", shopId),
      where("customerId", "==", selected.id),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selected, shopId]);

  const handleSave = async () => {
    if (!assertShopId(shopId, toast, "Customers.handleSave")) return;
    if (!form.name || !form.phone) { toast("Name and phone required", "warn"); return; }
    setSaving(true);
    try {
      const data = {
        shopId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        anniversary: form.anniversary,
        birthday: form.birthday,
        notes: form.notes,
        updatedAt: serverTimestamp()
      };
      if (editId) {
        await updateDoc(doc(db, "customers", editId), data);
        toast("Customer updated!", "success");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "customers"), data);
        toast("Customer added!", "success");
      }
      setForm(emptyForm); setEditId(null); setShowForm(false);
      } catch (err) {
      toast(err.message, "error");
    }
    setSaving(false);
  };

  const handleEdit = (c) => {
    setForm({
      name: c.name || "", phone: c.phone || "",
      email: c.email || "", address: c.address || "",
      city: c.city || "", anniversary: c.anniversary || "",
      birthday: c.birthday || "", notes: c.notes || ""
    });
    setEditId(c.id);
    setShowForm(true);
    setSelected(null);
  };

  const handleDelete = async (id) => {
    if (!assertShopId(shopId, toast, "Customers.handleDelete")) return;
    if (!window.confirm("Delete this customer?")) return;
    await deleteDoc(doc(db, "customers", id));
    if (selected?.id === id) setSelected(null);
  };

  const filtered = customers.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.city?.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const inp = (label, field, type = "text", placeholder = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>{label}</label>
      <input
        type={type} value={form[field]}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        placeholder={placeholder}
        style={{
          padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px",
          fontSize: "14px", outline: "none", boxSizing: "border-box"
        }}
      />
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e", margin: 0 }}>👤 Customers</h1>
          <p style={{ color: "#888", fontSize: "13px", margin: "4px 0 0" }}>{customers.length} total customers</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setForm(emptyForm); setEditId(null); setSelected(null); }}
          style={{
            padding: "10px 20px", fontSize: "14px", fontWeight: "600",
            background: showForm ? "#fff" : "#1a1a2e",
            color: showForm ? "#333" : "#fff",
            border: "1.5px solid #1a1a2e", borderRadius: "10px", cursor: "pointer"
          }}
        >{showForm ? "✕ Cancel" : "+ Add Customer"}</button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{
          background: "#fff", border: "1px solid #eee", borderRadius: "14px",
          padding: "22px", marginBottom: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)"
        }}>
          <h2 style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 18px" }}>
            {editId ? "✏️ Edit Customer" : "➕ New Customer"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {inp("Full Name *", "name", "text", "Customer name")}
            {inp("Phone *", "phone", "tel", "Mobile number")}
            {inp("Email", "email", "email", "Optional")}
            {inp("City", "city", "text", "City")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {inp("Birthday", "birthday", "date")}
            {inp("Anniversary", "anniversary", "date")}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", gridColumn: "span 2" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>Address</label>
              <input
                type="text" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Full address"
                style={{ padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "14px", outline: "none" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "18px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>Notes</label>
            <textarea
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Special preferences, VIP status, etc."
              rows={2}
              style={{
                padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px",
                fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit"
              }}
            />
          </div>
          
          <button
            onClick={handleSave} disabled={saving}
            style={{
              padding: "11px 28px", fontSize: "14px", fontWeight: "700",
              background: "#1a1a2e", color: "#fff", border: "none",
              borderRadius: "10px", cursor: "pointer"
            }}
          >{saving ? "Saving..." : editId ? "💾 Update" : "💾 Add Customer"}</button>
        </div>
      )}

      {/* Search */}
      <input
        type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Search by name, phone, city..."
        style={{
          width: "100%", maxWidth: "400px", padding: "10px 14px",
          border: "1.5px solid #ddd", borderRadius: "10px", fontSize: "13px",
          outline: "none", marginBottom: "16px", boxSizing: "border-box"
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: "20px" }}>
        {/* Customer List */}
        <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #eee", overflow: "hidden" }}>
          {loadingList ? (
            <div style={{ padding: "50px", textAlign: "center", color: "#bbb" }}>Loading customers…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "50px", textAlign: "center", color: "#bbb" }}>No customers yet. Add your first customer above.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Name", "Phone", "City", "Added", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", fontSize: "11px", color: "#888", textAlign: "left", fontWeight: "600", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(selected?.id === c.id ? null : c)}
                    style={{
                      borderTop: "1px solid #f5f5f5",
                      background: selected?.id === c.id ? "#E3F2FD" : i % 2 === 0 ? "#fff" : "#fafafa",
                      cursor: "pointer"
                    }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: "600", fontSize: "14px", color: "#1a1a2e" }}>{c.name}</div>
                      {c.email && <div style={{ fontSize: "11px", color: "#aaa" }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: "13px" }}>{c.phone}</td>
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#555" }}>{c.city || "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: "12px", color: "#aaa" }}>{formatDate(c.createdAt)}</td>
                    <td style={{ padding: "12px 14px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => handleEdit(c)}
                          style={{ padding: "5px 10px", fontSize: "12px", background: "#E3F2FD", color: "#1565C0", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(c.id)}
                          style={{ padding: "5px 10px", fontSize: "12px", background: "#FFEBEE", color: "#C62828", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Customer Detail Panel */}
        {selected && (
          <div style={{
            background: "#fff", borderRadius: "14px", border: "1px solid #eee",
            padding: "20px", position: "sticky", top: "20px", maxHeight: "calc(100vh - 80px)", overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#1a1a2e" }}>{selected.name}</div>
                <div style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>{selected.phone}</div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa" }}>×</button>
            </div>

            {/* Info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px", fontSize: "13px" }}>
              {selected.email && <div><span style={{ color: "#aaa" }}>Email: </span>{selected.email}</div>}
              {selected.city && <div><span style={{ color: "#aaa" }}>City: </span>{selected.city}</div>}
              {selected.birthday && <div><span style={{ color: "#aaa" }}>Birthday: </span>{selected.birthday}</div>}
              {selected.anniversary && <div><span style={{ color: "#aaa" }}>Anniversary: </span>{selected.anniversary}</div>}
            </div>
            {selected.address && (
              <div style={{ fontSize: "13px", color: "#555", marginBottom: "8px" }}>
                <span style={{ color: "#aaa" }}>Address: </span>{selected.address}
              </div>
            )}
            {selected.notes && (
              <div style={{
                padding: "10px", background: "#FFF8E1", borderRadius: "8px",
                fontSize: "12px", color: "#7D5A0A", marginBottom: "16px"
              }}>
                📝 {selected.notes}
              </div>
            )}

            {/* Purchase Stats */}
            <div style={{
              display: "flex", gap: "10px", marginBottom: "16px"
            }}>
              <div style={{ flex: 1, background: "#E8F5E9", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: "800", color: "#1B5E20" }}>{purchases.length}</div>
                <div style={{ fontSize: "11px", color: "#388E3C" }}>Total Purchases</div>
              </div>
              <div style={{ flex: 1, background: "#E3F2FD", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: "800", color: "#0D47A1" }}>
                  ₹{purchases.reduce((s, p) => s + (p.total || 0), 0).toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: "11px", color: "#1565C0" }}>Total Spent</div>
              </div>
            </div>

            {/* Purchase History */}
            <h3 style={{ fontSize: "13px", fontWeight: "600", color: "#555", marginBottom: "10px" }}>
              Purchase History
            </h3>
            {purchases.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", padding: "20px", fontSize: "13px" }}>
                No purchases yet
              </div>
            ) : (
              purchases.map(p => (
                <div key={p.id} style={{
                  padding: "10px 12px", border: "1px solid #f0f0f0",
                  borderRadius: "8px", marginBottom: "8px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontWeight: "600", fontSize: "13px" }}>
                      #{p.billNo || p.id.slice(-5)}
                    </span>
                    <span style={{ fontWeight: "700", fontSize: "13px" }}>
                      ₹{Number(p.total || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#888" }}>
                    {p.items?.length || 0} items · {(p.paymentMode || "cash").toUpperCase()} · {formatDate(p.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
