// src/superadmin/SuperAdminDashboard.js — real analytics
import { useEffect, useMemo, useState } from "react";
import { db } from "@fb/client";
import { collection, onSnapshot } from "firebase/firestore";

export default function SuperAdminDashboard() {
  const [shops, setShops]       = useState([]);
  const [users, setUsers]       = useState([]);
  const [plans, setPlans]       = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "shops"),    (s) => setShops(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, "users"),    (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(collection(db, "plans"),    (s) => setPlans(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u4 = onSnapshot(collection(db, "payments"), (s) => { setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); });
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const stats = useMemo(() => {
    const active   = shops.filter((s) => s.status === "active").length;
    const blocked  = shops.filter((s) => s.status === "blocked").length;
    const trialing = shops.filter((s) => s.trial?.isTrial).length;
    const owners   = users.filter((u) => u.role === "admin").length;

    const monthMs = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); })();
    const mtdRevenue = payments
      .filter((p) => (p.date?.toMillis?.() || 0) >= monthMs)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return { totalShops: shops.length, active, blocked, trialing, owners, mtdRevenue };
  }, [shops, users, payments]);

  const card = { background: "#1a1a1a", padding: 20, borderRadius: 10, color: "#fff", flex: 1, minWidth: 180 };
  const value = { fontSize: 28, fontWeight: 800, marginTop: 6 };

  return (
    <div>
      <h1 style={{ marginTop: 0, color: "#fff" }}>🚀 Super Admin Panel</h1>
      <p style={{ color: "#888", marginTop: 4 }}>Control entire CRM system from here</p>

      <div style={{ display: "flex", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
        <div style={card}><h3 style={{ margin: 0 }}>Total Shops</h3><div style={value}>{loading ? "—" : stats.totalShops}</div></div>
        <div style={card}><h3 style={{ margin: 0 }}>Active</h3><div style={{ ...value, color: "#69F0AE" }}>{stats.active}</div></div>
        <div style={card}><h3 style={{ margin: 0 }}>Blocked</h3><div style={{ ...value, color: "#FF8A80" }}>{stats.blocked}</div></div>
        <div style={card}><h3 style={{ margin: 0 }}>Trialing</h3><div style={{ ...value, color: "#FFD180" }}>{stats.trialing}</div></div>
        <div style={card}><h3 style={{ margin: 0 }}>Shop Admins</h3><div style={value}>{stats.owners}</div></div>
        <div style={card}><h3 style={{ margin: 0 }}>Plans</h3><div style={value}>{plans.length}</div></div>
        <div style={card}><h3 style={{ margin: 0 }}>MTD Revenue</h3><div style={{ ...value, color: "#FFD700" }}>₹{stats.mtdRevenue.toLocaleString("en-IN")}</div></div>
      </div>

      <div style={{ marginTop: 24, background: "#1a1a1a", padding: 18, borderRadius: 10, color: "#fff" }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>Recent Shops</h3>
        {shops.length === 0 ? <p style={{ color: "#888" }}>No shops yet.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Shop", "Plan", "Status", "Created"].map((h) =>
              <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#888", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
            )}</tr></thead>
            <tbody>
              {[...shops]
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
                .slice(0, 8).map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #222" }}>
                  <td style={{ padding: "6px 8px" }}>{s.name}</td>
                  <td style={{ padding: "6px 8px", color: "#aaa" }}>{s.plan || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: s.status === "active" ? "#1B5E20" : s.status === "blocked" ? "#B71C1C" : "#555",
                      color: "#fff",
                    }}>{(s.status || "?").toUpperCase()}</span>
                  </td>
                  <td style={{ padding: "6px 8px", color: "#888", fontSize: 11 }}>
                    {s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString("en-IN") : "—"}
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
