import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, query, where,
  doc, updateDoc, serverTimestamp, arrayUnion
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";

export default function Schemes() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [schemes, setSchemes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState({ amount: "", mode: "cash", month: "" });
  const [form, setForm] = useState({
    schemeName: "", type: "gold", duration: "11",
    monthlyAmount: "", customerId: "", customerName: "", customerPhone: ""
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "schemes"), where("shopId", "==", shopId));
    const unsub = onSnapshot(q, (snap) => {
      setSchemes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "customers"), where("shopId", "==", shopId));
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  const filteredCust = customers.filter(c =>
    customerSearch && (
      c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone?.includes(customerSearch)
    )
  ).slice(0, 5);

  const handleSave = async () => {
    if (!form.schemeName || !form.monthlyAmount || !form.customerId) {
      toast("Fill all required fields", "warn"); return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "schemes"), {
        shopId,
        schemeName: form.schemeName,
        type: form.type,
        duration: Number(form.duration),
        monthlyAmount: Number(form.monthlyAmount),
        customerId: form.customerId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        payments: [],
        status: "active",
        startDate: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp()
      });
      toast("Scheme created!", "success"); setForm({ schemeName: "", type: "gold", duration: "11", monthlyAmount: "", customerId: "", customerName: "", customerPhone: "" });
      setCustomerSearch(""); setShowForm(false);
      } catch (err) { toast(err.message, "error"); }
    setSaving(false);
  };

  const handlePayment = async () => {
    if (!payment.amount || !payment.month) { toast("Fill amount and month", "warn"); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "schemes", selected.id), {
        payments: arrayUnion({
          month: payment.month,
          amount: Number(payment.amount),
          mode: payment.mode,
          date: new Date().toISOString()
        })
      });
      toast("Payment recorded!", "success");
      setPayment({ amount: "", mode: "cash", month: "" });
      setShowPayment(false);
      } catch (err) { toast(err.message, "error"); }
    setSaving(false);
  };

  const totalPaid = (s) => s.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
  const totalExpected = (s) => s.monthlyAmount * s.duration;
  const progress = (s) => Math.round((totalPaid(s) / totalExpected(s)) * 100);

  return (
    <div style={{ padding: "24px", maxWidth: "1000px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e", margin: 0 }}>🎯 Schemes</h1>
          <p style={{ color: "#888", fontSize: "13px", margin: "4px 0 0" }}>{schemes.filter(s => s.status === "active").length} active schemes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{
            padding: "10px 20px", fontSize: "14px", fontWeight: "600",
            background: showForm ? "#fff" : "#1a1a2e", color: showForm ? "#333" : "#fff",
            border: "1.5px solid #1a1a2e", borderRadius: "10px", cursor: "pointer"
          }}>
          {showForm ? "✕ Cancel" : "+ New Scheme"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: "14px", padding: "22px", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 16px" }}>Create New Scheme</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {[
              ["Scheme Name *", "schemeName", "text", "e.g. Gold Diwali Scheme"],
              ["Monthly Amount (₹) *", "monthlyAmount", "number", "e.g. 5000"],
              ["Duration (months)", "duration", "number", "e.g. 11"],
            ].map(([label, field, type, placeholder]) => (
              <div key={field} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>{label}</label>
                <input
                  type={type} value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "14px", background: "#fff" }}>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>

          {/* Customer search */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#666", display: "block", marginBottom: "6px" }}>Customer *</label>
            {form.customerId ? (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#E8F5E9", borderRadius: "8px" }}>
                <span style={{ fontWeight: "600", fontSize: "13px" }}>{form.customerName} · {form.customerPhone}</span>
                <button onClick={() => setForm(f => ({ ...f, customerId: "", customerName: "", customerPhone: "" }))}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }}>×</button>
              </div>
            ) : (
              <div>
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Search customer..."
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                {filteredCust.map(c => (
                  <div key={c.id} onClick={() => { setForm(f => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone })); setCustomerSearch(""); }}
                    style={{ padding: "9px 12px", cursor: "pointer", border: "1px solid #eee", borderRadius: "8px", marginTop: "6px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: "600", fontSize: "13px" }}>{c.name}</span>
                    <span style={{ fontSize: "12px", color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "11px 28px", fontSize: "14px", fontWeight: "700", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer" }}>
            {saving ? "Saving..." : "💾 Create Scheme"}
          </button>
        </div>
      )}

      {/* Schemes List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {schemes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px", color: "#bbb", background: "#fff", borderRadius: "14px", border: "1px solid #eee" }}>
            No schemes yet. Create your first scheme above.
          </div>
        ) : schemes.map(s => (
          <div key={s.id} style={{
            background: "#fff", border: "1px solid #eee", borderRadius: "14px",
            padding: "18px", cursor: "pointer",
            borderLeft: `4px solid ${s.type === "gold" ? "#D4A017" : s.type === "silver" ? "#888" : "#4CAF50"}`
          }} onClick={() => setSelected(selected?.id === s.id ? null : s)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#1a1a2e" }}>{s.schemeName}</div>
                <div style={{ fontSize: "13px", color: "#555", marginTop: "3px" }}>
                  👤 {s.customerName} · {s.customerPhone}
                </div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  {s.type.toUpperCase()} · ₹{Number(s.monthlyAmount).toLocaleString("en-IN")}/month × {s.duration} months
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "16px", fontWeight: "800", color: "#1a1a2e" }}>
                  ₹{totalPaid(s).toLocaleString("en-IN")} <span style={{ fontSize: "12px", color: "#888" }}>/ ₹{totalExpected(s).toLocaleString("en-IN")}</span>
                </div>
                <div style={{
                  fontSize: "11px", fontWeight: "600", marginTop: "4px",
                  color: s.status === "active" ? "#1B5E20" : "#B71C1C"
                }}>{s.status.toUpperCase()} · {s.payments?.length || 0}/{s.duration} paid</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: "10px", background: "#f0f0f0", borderRadius: "20px", height: "6px", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "20px",
                width: `${Math.min(progress(s), 100)}%`,
                background: s.type === "gold" ? "#D4A017" : s.type === "silver" ? "#888" : "#4CAF50"
              }} />
            </div>

            {/* Payment panel */}
            {selected?.id === s.id && (
              <div onClick={e => e.stopPropagation()} style={{ marginTop: "14px", borderTop: "1px solid #f0f0f0", paddingTop: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "10px" }}>Payment History</div>
                {s.payments?.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#bbb", marginBottom: "10px" }}>No payments yet</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                    {s.payments.map((p, i) => (
                      <div key={i} style={{
                        padding: "6px 12px", background: "#E8F5E9", borderRadius: "20px", fontSize: "12px", fontWeight: "600", color: "#1B5E20"
                      }}>
                        {p.month} · ₹{p.amount}
                      </div>
                    ))}
                  </div>
                )}

                {showPayment && selected?.id === s.id ? (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <input type="number" value={payment.amount} onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))}
                      placeholder="Amount ₹" style={{ padding: "8px 12px", border: "1.5px solid #ddd", borderRadius: "8px", width: "120px", fontSize: "13px", outline: "none" }} />
                    <input type="month" value={payment.month} onChange={e => setPayment(p => ({ ...p, month: e.target.value }))}
                      style={{ padding: "8px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "13px", outline: "none" }} />
                    <select value={payment.mode} onChange={e => setPayment(p => ({ ...p, mode: e.target.value }))}
                      style={{ padding: "8px 12px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "13px", background: "#fff" }}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                    </select>
                    <button onClick={handlePayment} disabled={saving}
                      style={{ padding: "8px 16px", background: "#4CAF50", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                      ✓ Record
                    </button>
                    <button onClick={() => setShowPayment(false)}
                      style={{ padding: "8px 12px", background: "#f0f0f0", color: "#333", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowPayment(true)}
                    style={{ padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                    + Record Payment
                  </button>
                )}
                
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
