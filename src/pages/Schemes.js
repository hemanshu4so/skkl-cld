// src/pages/Schemes.js — Phase 2 Schemes v2
//
// Builds on the existing 11+1 monthly-gold pattern with:
//   - Payment-due reminders panel (current month not paid)
//   - Maturity bonus calc (one extra installment at the end)
//   - Close-scheme button that creates a /sales doc using the accumulated value
//   - Activity log on every action

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, query, where,
  doc, updateDoc, deleteDoc, serverTimestamp, arrayUnion,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { whatsappActions } from "../services/whatsapp";
import { assertShopId } from "../lib/utils";
import { formatINR, formatDate } from "../lib/constants";
import { logActivity } from "../lib/activityLog";

const monthOfDateString = (s) => (s || "").slice(0, 7); // YYYY-MM
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function Schemes() {
  const { userData, shopId, shopData } = useAuth();
  const { toast } = useToast();

  const [schemes, setSchemes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState({ amount: "", mode: "cash", month: currentMonth() });
  const [form, setForm] = useState({
    schemeName: "", type: "gold", duration: "11",
    monthlyAmount: "", maturityBonusInstallments: "1",
    customerId: "", customerName: "", customerPhone: "",
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const schemesRef = useRef(null);
  const customersRef = useRef(null);

  useEffect(() => {
    if (schemesRef.current) { schemesRef.current(); schemesRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "schemes"), where("shopId", "==", shopId)),
      (snap) => setSchemes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error("[schemes] snapshot:", err); toast("Could not load schemes", "error"); }
    );
    schemesRef.current = u;
    return () => { if (schemesRef.current) { schemesRef.current(); schemesRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (customersRef.current) { customersRef.current(); customersRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "customers"), where("shopId", "==", shopId)),
      (s) => setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    customersRef.current = u;
    return () => { if (customersRef.current) { customersRef.current(); customersRef.current = null; } };
  }, [shopId]);

  const filteredCust = customers.filter((c) =>
    customerSearch && (c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
  ).slice(0, 5);

  const handleSave = async () => {
    if (!assertShopId(shopId, toast, "Schemes.handleSave")) return;
    if (!form.schemeName || !form.monthlyAmount || !form.customerId) {
      toast("Fill all required fields", "warn"); return;
    }
    setSaving(true);
    try {
      const data = {
        shopId,
        schemeName: form.schemeName,
        type: form.type,
        duration: Number(form.duration),
        monthlyAmount: Number(form.monthlyAmount),
        maturityBonusInstallments: Number(form.maturityBonusInstallments) || 0,
        customerId: form.customerId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        payments: [],
        status: "active",
        startDate: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      };
      const r = await addDoc(collection(db, "schemes"), data);
      await logActivity({ shopId, action: "create", entity: "scheme", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { type: data.type, monthly: data.monthlyAmount, duration: data.duration } });
      toast("Scheme created!", "success");
      setForm({ schemeName: "", type: "gold", duration: "11", monthlyAmount: "", maturityBonusInstallments: "1", customerId: "", customerName: "", customerPhone: "" });
      setCustomerSearch(""); setShowForm(false);
    } catch (err) { toast(err.message, "error"); }
    setSaving(false);
  };

  const handlePayment = async () => {
    if (!assertShopId(shopId, toast, "Schemes.handlePayment")) return;
    if (!payment.amount || !payment.month) { toast("Fill amount and month", "warn"); return; }
    setSaving(true);
    try {
      const entry = {
        month: payment.month,
        amount: Number(payment.amount),
        mode: payment.mode,
        date: new Date().toISOString(),
      };
      await updateDoc(doc(db, "schemes", selected.id), { payments: arrayUnion(entry) });
      await logActivity({
        shopId, action: "payment", entity: "scheme", entityId: selected.id,
        uid: userData?.id, name: userData?.name,
        meta: { customerName: selected.customerName, month: entry.month, amount: entry.amount },
      });
      toast("Payment recorded!", "success");
      setPayment({ amount: "", mode: "cash", month: currentMonth() });
      setShowPayment(false);
    } catch (err) { toast(err.message, "error"); }
    setSaving(false);
  };

  const closeScheme = async (s) => {
    if (!assertShopId(shopId, toast, "Schemes.closeScheme")) return;
    if (!window.confirm(`Close scheme "${s.schemeName}" and create a redemption bill credit?`)) return;
    try {
      const totalPaid = (s.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const bonus = (Number(s.maturityBonusInstallments) || 0) * (Number(s.monthlyAmount) || 0);
      const finalCredit = totalPaid + bonus;

      await addDoc(collection(db, "schemeRedemptions"), {
        shopId,
        schemeId: s.id, schemeName: s.schemeName,
        customerId: s.customerId, customerName: s.customerName, customerPhone: s.customerPhone,
        totalPaid, bonus, finalCredit,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "schemes", s.id), {
        status: "matured",
        maturedAt: serverTimestamp(),
        finalCredit,
      });

      await logActivity({
        shopId, action: "matured", entity: "scheme", entityId: s.id,
        uid: userData?.id, name: userData?.name,
        meta: { customerName: s.customerName, finalCredit },
      });

      toast(`Scheme matured · ₹${finalCredit.toLocaleString("en-IN")} credit available`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteScheme = async (s) => {
    if (!window.confirm(`Delete "${s.schemeName}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "schemes", s.id));
    await logActivity({ shopId, action: "delete", entity: "scheme", entityId: s.id, uid: userData?.id, name: userData?.name, before: s });
    toast("Deleted", "success");
  };

  const totalPaid = (s) => (s.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalExpected = (s) => Number(s.monthlyAmount) * Number(s.duration);
  const progress = (s) => Math.min(100, Math.round((totalPaid(s) / totalExpected(s)) * 100));
  const monthsPaid = (s) => new Set((s.payments || []).map((p) => p.month)).size;

  // Reminders: schemes whose current-month payment isn't recorded yet
  const dueThisMonth = useMemo(() => {
    const m = currentMonth();
    return schemes.filter((s) =>
      s.status === "active" &&
      monthsPaid(s) < Number(s.duration) &&
      !(s.payments || []).some((p) => monthOfDateString(p.month) === m)
    );
  }, [schemes]);

  const matured = useMemo(() => schemes.filter((s) => monthsPaid(s) >= Number(s.duration) && s.status !== "matured"), [schemes]);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>🎯 Schemes</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>
            {schemes.filter((s) => s.status === "active").length} active · {dueThisMonth.length} due this month
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{
            padding: "10px 20px", fontSize: 14, fontWeight: 600,
            background: showForm ? "#fff" : "#1a1a2e", color: showForm ? "#333" : "#fff",
            border: "1.5px solid #1a1a2e", borderRadius: 10, cursor: "pointer",
          }}>
          {showForm ? "✕ Cancel" : "+ New Scheme"}
        </button>
      </div>

      {/* Reminders panel */}
      {dueThisMonth.length > 0 && (
        <div className="card p-4 mb-4" style={{ borderLeft: "4px solid #FB8C00", background: "#FFF8E1" }}>
          <strong style={{ fontSize: 14 }}>🔔 Payments due this month ({dueThisMonth.length})</strong>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {dueThisMonth.slice(0, 6).map((sch) => (
              <div key={sch.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, alignItems: "center", gap: 8 }}>
                <span>{sch.customerName} · {sch.customerPhone} · {sch.schemeName}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>{formatINR(sch.monthlyAmount)}</span>
                  {sch.customerPhone && (
                    <button
                      onClick={() => whatsappActions({ shop: shopData }).reminder(sch, currentMonth()).onClick()}
                      style={{ padding: "3px 8px", fontSize: 10, background: "#25D366", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                      📱 WhatsApp
                    </button>
                  )}
                </span>
              </div>
            ))}
            {dueThisMonth.length > 6 && <div style={{ fontSize: 11, color: "#888" }}>… and {dueThisMonth.length - 6} more</div>}
          </div>
        </div>
      )}

      {/* Matured banner */}
      {matured.length > 0 && (
        <div className="card p-4 mb-4" style={{ borderLeft: "4px solid #4CAF50", background: "#E8F5E9" }}>
          <strong style={{ fontSize: 14 }}>🏁 Schemes ready to mature ({matured.length})</strong>
          <p style={{ fontSize: 12, color: "#388E3C", margin: "4px 0 0" }}>
            All installments paid — click 'Close & Create Credit' on any of these to issue the maturity credit.
          </p>
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-4">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px" }}>Create New Scheme</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
            {[
              ["Scheme Name *", "schemeName", "text", "e.g. Gold Diwali Scheme"],
              ["Monthly Amount (₹) *", "monthlyAmount", "number", "5000"],
              ["Duration (months)", "duration", "number", "11"],
              ["Maturity bonus (months)", "maturityBonusInstallments", "number", "1 = 11+1 plan"],
            ].map(([label, field, type, placeholder]) => (
              <div key={field}>
                <label className="label">{label}</label>
                <input type={type} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder} className="input" />
              </div>
            ))}
            <div>
              <label className="label">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input bg-white">
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Customer *</label>
            {form.customerId ? (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#E8F5E9", borderRadius: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{form.customerName} · {form.customerPhone}</span>
                <button onClick={() => setForm((f) => ({ ...f, customerId: "", customerName: "", customerPhone: "" }))}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }}>×</button>
              </div>
            ) : (
              <div>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer…" className="input" />
                {filteredCust.map((c) => (
                  <div key={c.id} onClick={() => { setForm((f) => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone })); setCustomerSearch(""); }}
                    style={{ padding: "9px 12px", cursor: "pointer", border: "1px solid #eee", borderRadius: 8, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "💾 Create Scheme"}
          </button>
        </div>
      )}

      {/* Schemes list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {schemes.length === 0 ? (
          <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>
            No schemes yet. Create your first scheme above.
          </div>
        ) : schemes.map((s) => {
          const paid = totalPaid(s); const expected = totalExpected(s);
          const isMatured = monthsPaid(s) >= Number(s.duration);
          const cur = currentMonth();
          const dueNow = !s.payments?.some((p) => monthOfDateString(p.month) === cur) && !isMatured;
          return (
            <div key={s.id} className="card p-4" style={{ cursor: "pointer", borderLeft: `4px solid ${s.type === "gold" ? "#D4A017" : s.type === "silver" ? "#888" : "#4CAF50"}` }}
              onClick={() => setSelected(selected?.id === s.id ? null : s)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>
                    {s.schemeName}
                    {s.status === "matured" && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: "#4CAF50", color: "#fff", borderRadius: 12 }}>MATURED</span>}
                    {dueNow && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: "#FB8C00", color: "#fff", borderRadius: 12 }}>DUE</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#555", marginTop: 3 }}>👤 {s.customerName} · {s.customerPhone}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {s.type.toUpperCase()} · {formatINR(s.monthlyAmount)}/month × {s.duration} months
                    {s.maturityBonusInstallments > 0 && <span> · +{s.maturityBonusInstallments} bonus</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    {formatINR(paid)} <span style={{ fontSize: 12, color: "#888" }}>/ {formatINR(expected)}</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: s.status === "matured" ? "#1B5E20" : "#555" }}>
                    {monthsPaid(s)}/{s.duration} months paid
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, background: "#f0f0f0", borderRadius: 20, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 20, width: `${progress(s)}%`, background: s.type === "gold" ? "#D4A017" : s.type === "silver" ? "#888" : "#4CAF50" }} />
              </div>

              {selected?.id === s.id && (
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Payment History ({(s.payments || []).length})</strong>
                    <div style={{ display: "flex", gap: 8 }}>
                      {s.status !== "matured" && isMatured && (
                        <button onClick={() => closeScheme(s)} className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}>
                          ✓ Close & Create Credit
                        </button>
                      )}
                      <button onClick={() => deleteScheme(s)} className="btn btn-danger" style={{ padding: "5px 12px", fontSize: 12 }}>Delete</button>
                    </div>
                  </div>

                  {(s.payments || []).length === 0
                    ? <div style={{ fontSize: 12, color: "#bbb" }}>No payments yet</div>
                    : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {[...(s.payments || [])].sort((a, b) => (a.month || "").localeCompare(b.month || "")).map((p, i) => (
                          <div key={i} style={{ padding: "5px 10px", background: "#E8F5E9", borderRadius: 16, fontSize: 11, fontWeight: 600, color: "#1B5E20" }}>
                            {p.month} · {formatINR(p.amount)} · {(p.mode || "").toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}

                  {s.status === "matured"
                    ? <div style={{ padding: 10, background: "#E8F5E9", borderRadius: 8, fontSize: 13, color: "#1B5E20", fontWeight: 600 }}>
                        ✅ Matured on {formatDate(s.maturedAt)} — final credit {formatINR(s.finalCredit)}
                      </div>
                    : showPayment && selected?.id === s.id
                    ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <input type="number" value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
                          placeholder="Amount ₹" style={{ padding: "8px 12px", border: "1.5px solid #ddd", borderRadius: 8, width: 110, fontSize: 13 }} />
                        <input type="month" value={payment.month} onChange={(e) => setPayment((p) => ({ ...p, month: e.target.value }))}
                          style={{ padding: "8px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 13 }} />
                        <select value={payment.mode} onChange={(e) => setPayment((p) => ({ ...p, mode: e.target.value }))}
                          style={{ padding: "8px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 13, background: "#fff" }}>
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                        </select>
                        <button onClick={handlePayment} disabled={saving} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>✓ Record</button>
                        <button onClick={() => setShowPayment(false)} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>Cancel</button>
                      </div>
                    )
                    : (
                      <button onClick={() => setShowPayment(true)} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>
                        + Record Payment
                      </button>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
