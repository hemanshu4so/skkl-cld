import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, query, where, onSnapshot,
  doc, getDoc, orderBy, limit, Timestamp
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { Card, Button } from "../components/ui";

// ─── Reusable Stat Card ─────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid #eee`,
        borderRadius: "14px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        cursor: onClick ? "pointer" : "default",
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        transition: "transform 0.15s, box-shadow 0.15s",
        flex: "1",
        minWidth: "150px"
      }}
      onMouseEnter={e => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.1)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
      }}
    >
      <div style={{ fontSize: "24px" }}>{icon}</div>
      <div style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>{value}</div>
      <div style={{ fontSize: "13px", fontWeight: "600", color: "#555" }}>{label}</div>
      {sub && <div style={{ fontSize: "11px", color: "#999" }}>{sub}</div>}
    </div>
  );
}

// ─── Rate Display Card ───────────────────────────────────────────────────────
function RateCard({ type, rate, unit, color, icon }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
      border: `1.5px solid ${color}40`,
      borderRadius: "16px",
      padding: "22px 28px",
      flex: 1,
      minWidth: "200px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <span style={{ fontSize: "28px" }}>{icon}</span>
        <span style={{ fontSize: "15px", fontWeight: "600", color: "#555" }}>{type} Rate</span>
      </div>
      <div style={{ fontSize: "32px", fontWeight: "800", color }}>
        ₹{rate ? Number(rate).toLocaleString("en-IN") : "—"}
      </div>
      <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>per {unit}</div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { userData, shopData } = useAuth();
  const navigate = useNavigate();
  const shopId = userData?.shopId;

  const [rates, setRates] = useState({ goldRate: null, silverRate: null, updatedAt: null });
  const [stats, setStats] = useState({
    todaySales: 0, todayRevenue: 0,
    totalCustomers: 0, pendingRepairs: 0,
    activeSchemes: 0, lowStock: 0
  });
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Load Gold/Silver Rates ──────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(doc(db, "rates", shopId), (snap) => {
      if (snap.exists()) {
        setRates(snap.data());
      }
    });
    return () => unsub();
  }, [shopId]);

  // ── Load Stats ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Today's sales
    const salesQ = query(
      collection(db, "sales"),
      where("shopId", "==", shopId),
      where("createdAt", ">=", Timestamp.fromDate(todayStart))
    );
    const unsubSales = onSnapshot(salesQ, (snap) => {
      let revenue = 0;
      snap.docs.forEach(d => { revenue += (d.data().total || 0); });
      setStats(s => ({ ...s, todaySales: snap.size, todayRevenue: revenue }));
    });

    // Customers
    const custQ = query(collection(db, "customers"), where("shopId", "==", shopId));
    const unsubCust = onSnapshot(custQ, (snap) => {
      setStats(s => ({ ...s, totalCustomers: snap.size }));
    });

    // Pending Repairs
    const repairQ = query(
      collection(db, "repairs"),
      where("shopId", "==", shopId),
      where("status", "in", ["received", "in-progress"])
    );
    const unsubRepair = onSnapshot(repairQ, (snap) => {
      setStats(s => ({ ...s, pendingRepairs: snap.size }));
    });

    // Active Schemes
    const schemeQ = query(collection(db, "schemes"), where("shopId", "==", shopId));
    const unsubScheme = onSnapshot(schemeQ, (snap) => {
      setStats(s => ({ ...s, activeSchemes: snap.size }));
    });

    setLoading(false);

    return () => {
      unsubSales(); unsubCust(); unsubRepair(); unsubScheme();
    };
  }, [shopId]);

  // ── Recent Sales ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "sales"),
      where("shopId", "==", shopId),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsub = onSnapshot(q, (snap) => {
      setRecentSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <div style={{ fontSize: "16px", color: "#888" }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", background: "#f8f9fa", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e", margin: 0 }}>
          Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"} 👋
        </h1>
        <p style={{ fontSize: "13px", color: "#888", margin: "4px 0 0" }}>
          {shopData?.name} — {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* ── Gold & Silver Rates ── */}
      <div style={{
        display: "flex", gap: "16px", marginBottom: "24px",
        flexWrap: "wrap", alignItems: "stretch"
      }}>
        <RateCard
          type="Gold (22K)"
          rate={rates.goldRate}
          unit="10 grams"
          color="#D4A017"
          icon="🥇"
        />
        <RateCard
          type="Silver"
          rate={rates.silverRate}
          unit="1 KG"
          color="#A8A9AD"
          icon="🥈"
        />
        <div
          onClick={() => navigate("/rates")}
          style={{
            background: "#fff",
            border: "1.5px dashed #ddd",
            borderRadius: "16px",
            padding: "22px 28px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            gap: "8px",
            minWidth: "160px",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#D4A017"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#ddd"}
        >
          <span style={{ fontSize: "24px" }}>✏️</span>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#555" }}>Update Rates</span>
          {rates.updatedAt && (
            <span style={{ fontSize: "10px", color: "#aaa" }}>
              Updated: {formatDate(rates.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "24px" }}>
        <StatCard
          icon="🧾" label="Today's Sales" value={stats.todaySales}
          sub={`₹${stats.todayRevenue.toLocaleString("en-IN")} revenue`}
          color="#4CAF50" onClick={() => navigate("/billing")}
        />
        <StatCard
          icon="👤" label="Total Customers" value={stats.totalCustomers}
          sub="All time" color="#2196F3"
          onClick={() => navigate("/customers")}
        />
        <StatCard
          icon="🔧" label="Pending Repairs" value={stats.pendingRepairs}
          sub="Active job cards" color="#FF9800"
          onClick={() => navigate("/repairs")}
        />
        <StatCard
          icon="🎯" label="Active Schemes" value={stats.activeSchemes}
          sub="Running plans" color="#9C27B0"
          onClick={() => navigate("/schemes")}
        />
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#555", marginBottom: "12px" }}>
          Quick Actions
        </h2>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {[
            { label: "New Sale", icon: "🧾", path: "/billing", color: "#4CAF50" },
            { label: "Add Customer", icon: "👤", path: "/customers", color: "#2196F3" },
            { label: "Add Product", icon: "📦", path: "/inventory", color: "#FF9800" },
            { label: "New Repair", icon: "🔧", path: "/repairs", color: "#9C27B0" },
            { label: "Buy Gold/Silver", icon: "💰", path: "/purchases", color: "#D4A017" },
            { label: "View Reports", icon: "📊", path: "/reports", color: "#607D8B" },
          ].map(a => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                background: `${a.color}15`,
                border: `1.5px solid ${a.color}40`,
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                color: a.color,
                transition: "all 0.15s"
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${a.color}25`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = `${a.color}15`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent Sales ── */}
      <div style={{
        background: "#fff",
        borderRadius: "14px",
        border: "1px solid #eee",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#1a1a2e", margin: 0 }}>
            Recent Sales
          </h2>
          <button
            onClick={() => navigate("/billing")}
            style={{ fontSize: "12px", color: "#2196F3", background: "none", border: "none", cursor: "pointer" }}
          >
            View All →
          </button>
        </div>

        {recentSales.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>
            No sales yet. <span
              onClick={() => navigate("/billing")}
              style={{ color: "#2196F3", cursor: "pointer" }}
            >Create first bill →</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                {["Bill No.", "Customer", "Items", "Amount", "Mode", "Time"].map(h => (
                  <th key={h} style={{
                    padding: "10px 16px", fontSize: "11px", fontWeight: "600",
                    color: "#888", textAlign: "left", textTransform: "uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale, i) => (
                <tr key={sale.id} style={{
                  borderTop: "1px solid #f5f5f5",
                  background: i % 2 === 0 ? "#fff" : "#fafafa"
                }}>
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: "600", color: "#1a1a2e" }}>
                    #{sale.billNo || sale.id.slice(-5).toUpperCase()}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#333" }}>
                    {sale.customerName || "Walk-in"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#555" }}>
                    {sale.items?.length || 0} item(s)
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: "700", color: "#1a1a2e" }}>
                    ₹{Number(sale.total || 0).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      fontSize: "11px", fontWeight: "600",
                      padding: "3px 8px", borderRadius: "20px",
                      background: sale.paymentMode === "cash" ? "#E8F5E9" : sale.paymentMode === "upi" ? "#E3F2FD" : "#FFF3E0",
                      color: sale.paymentMode === "cash" ? "#2E7D32" : sale.paymentMode === "upi" ? "#1565C0" : "#E65100",
                    }}>
                      {(sale.paymentMode || "cash").toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px", color: "#999" }}>
                    {formatTime(sale.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Card>
  <h2>New UI Working 💎</h2>
  <Button>Test</Button>
</Card>
    </div>
  );
}
