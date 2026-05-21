import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@fb/client";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";

const PURITY_FACTORS = { "24K": 0.999, "22K": 0.916, "20K": 0.833, "18K": 0.750, "14K": 0.583, "9K": 0.375 };

function RateStrip({ rates, onClick }) {
  const gold10g = Number(rates.goldRate) || 0;
  const goldPerG = gold10g / 10;
  const purities = Object.entries(PURITY_FACTORS).map(([k, f]) => ({
    karat: k, perG: Math.round(goldPerG * f), per10g: Math.round(goldPerG * f * 10),
  }));
  return (
    <div onClick={onClick} style={{
      cursor: onClick ? "pointer" : "default",
      background: "linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)",
      border: "1.5px solid #FDD83540", borderRadius: 14, padding: "14px 16px",
      display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12, borderRight: "1px solid #FDD83555" }}>
        <span style={{ fontSize: 22 }}>🥇</span>
        <div>
          <div style={{ fontSize: 11, color: "#7D5A0A", fontWeight: 600 }}>GOLD per 10g</div>
          <div style={{ fontSize: 10, color: "#9A7B20" }}>tap to update</div>
        </div>
      </div>
      {purities.map((p) => (
        <div key={p.karat} style={{ display: "flex", flexDirection: "column", minWidth: 80 }}>
          <div style={{ fontSize: 10, color: "#9A7B20", fontWeight: 600 }}>{p.karat}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#5A3E00" }}>
            {gold10g ? `₹${p.per10g.toLocaleString("en-IN")}` : "—"}
          </div>
          <div style={{ fontSize: 9, color: "#9A7B20" }}>
            {gold10g ? `₹${p.perG.toLocaleString("en-IN")}/g` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
function SilverCard({ rates, onClick }) {
  return (
    <div onClick={onClick} style={{
      cursor: onClick ? "pointer" : "default",
      background: "linear-gradient(135deg, #F5F5F5, #EEEEEE)",
      border: "1.5px solid #A8A9AD40", borderRadius: 14, padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 14, minWidth: 220,
    }}>
      <span style={{ fontSize: 26 }}>🥈</span>
      <div>
        <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>SILVER</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#222" }}>
          {rates.silverRate ? `₹${Number(rates.silverRate).toLocaleString("en-IN")}` : "—"}
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>per kg</div>
      </div>
    </div>
  );
}
function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "#fff", border: "1px solid #eee", borderRadius: 14, padding: 16,
      display: "flex", flexDirection: "column", gap: 4, cursor: onClick ? "pointer" : "default",
      borderLeft: `4px solid ${color}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#999" }}>{sub}</div>}
    </div>
  );
}
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 13, color: "#1a1a2e", fontWeight: 600 }}>
    {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
  </span>;
}
function ShopLogo({ shop }) {
  const url = shop?.company?.logoUrl;
  if (url) return <img src={url} alt={shop?.name || "Shop logo"}
    style={{ height: 56, width: "auto", maxWidth: 160, objectFit: "contain", borderRadius: 8 }}
    onError={(e) => { e.currentTarget.style.display = "none"; }} />;
  return <div style={{
    height: 56, width: 56, borderRadius: 14,
    background: "linear-gradient(135deg, #FFD700, #FFA000)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#fff",
  }}>💎</div>;
}

export default function Dashboard() {
  const { userData, shopData, shopId } = useAuth();
  const navigate = useNavigate();
  const [rates, setRates] = useState({});
  const [stats, setStats] = useState({ todaySales: 0, todayRevenue: 0, totalCustomers: 0, pendingRepairs: 0, activeSchemes: 0, lowStock: 0 });
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    const u = onSnapshot(doc(db, "rates", shopId),
      (snap) => { if (snap.exists()) setRates(snap.data()); },
      (err) => console.error("[dashboard.rates]", err));
    return () => u();
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    let firstFired = false;
    const flipReady = () => { if (!firstFired) { firstFired = true; setLoading(false); } };
    const watchdog = setTimeout(flipReady, 6000);
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const u1 = onSnapshot(query(collection(db, "sales"), where("shopId", "==", shopId)),
      (snap) => {
        let count = 0, revenue = 0;
        snap.docs.forEach((d) => {
          const x = d.data();
          const ms = x.createdAt?.toMillis?.() ?? (x.createdAt?.seconds ? x.createdAt.seconds * 1000 : 0);
          if (ms >= todayMs) { count++; revenue += Number(x.total) || 0; }
        });
        setStats((s) => ({ ...s, todaySales: count, todayRevenue: revenue }));
        flipReady();
      }, (err) => { console.error(err); flipReady(); });
    const u2 = onSnapshot(query(collection(db, "customers"), where("shopId", "==", shopId)),
      (s) => { setStats((x) => ({ ...x, totalCustomers: s.size })); flipReady(); }, (err) => { console.error(err); flipReady(); });
    const u3 = onSnapshot(query(collection(db, "repairs"), where("shopId", "==", shopId), where("status", "in", ["received", "estimated", "approved", "in_progress", "ready"])),
      (s) => { setStats((x) => ({ ...x, pendingRepairs: s.size })); flipReady(); }, (err) => { console.error(err); flipReady(); });
    const u4 = onSnapshot(query(collection(db, "schemes"), where("shopId", "==", shopId)),
      (s) => { setStats((x) => ({ ...x, activeSchemes: s.size })); flipReady(); }, (err) => { console.error(err); flipReady(); });
    const u5 = onSnapshot(query(collection(db, "products"), where("shopId", "==", shopId)),
      (s) => {
        let low = 0;
        s.docs.forEach((d) => { const x = d.data(); if ((Number(x.qty) || 0) <= (Number(x.lowStockThreshold) || 2)) low++; });
        setStats((x) => ({ ...x, lowStock: low }));
        flipReady();
      }, (err) => { console.error(err); flipReady(); });
    return () => { clearTimeout(watchdog); u1(); u2(); u3(); u4(); u5(); };
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    const u = onSnapshot(query(collection(db, "sales"), where("shopId", "==", shopId)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const ms = (x) => x.createdAt?.toMillis?.() ?? (x.createdAt?.seconds ? x.createdAt.seconds * 1000 : 0);
        all.sort((a, b) => ms(b) - ms(a));
        setRecentSales(all.slice(0, 5));
      }, (err) => console.error(err));
    return () => u();
  }, [shopId]);

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"; })();

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
    <div style={{ fontSize: 16, color: "#888" }}>Loading dashboard…</div></div>;

  return (
    <div style={{ padding: 24, maxWidth: 1280, background: "#f8f9fa", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ShopLogo shop={shopData} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
              Good {greeting}, {userData?.name?.split(" ")[0] || "there"} 👋
            </h1>
            <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>{shopData?.name}</span><span style={{ color: "#ddd" }}>·</span>
              <span>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              <span style={{ color: "#ddd" }}>·</span><LiveClock />
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 480 }}><RateStrip rates={rates} onClick={() => navigate("/rates")} /></div>
        <SilverCard rates={rates} onClick={() => navigate("/rates")} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <StatCard icon="🧾" label="Today's Sales" value={stats.todaySales} sub={`₹${Number(stats.todayRevenue).toLocaleString("en-IN")} revenue`} color="#4CAF50" onClick={() => navigate("/billing")} />
        <StatCard icon="👤" label="Total Customers" value={stats.totalCustomers} sub="All time" color="#2196F3" onClick={() => navigate("/customers")} />
        <StatCard icon="🔧" label="Pending Repairs" value={stats.pendingRepairs} sub="Active job cards" color="#FF9800" onClick={() => navigate("/repairs")} />
        <StatCard icon="🎯" label="Active Schemes" value={stats.activeSchemes} sub="Running plans" color="#9C27B0" onClick={() => navigate("/schemes")} />
        {stats.lowStock > 0 && <StatCard icon="⚠️" label="Low Stock Items" value={stats.lowStock} sub="Below threshold" color="#E53935" onClick={() => navigate("/inventory")} />}
      </div>

      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 10 }}>Quick Actions</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "New Sale", icon: "🧾", path: "/billing", color: "#4CAF50" },
            { label: "Add Customer", icon: "👤", path: "/customers", color: "#2196F3" },
            { label: "Add Product", icon: "📦", path: "/inventory", color: "#FF9800" },
            { label: "New Repair", icon: "🔧", path: "/repairs", color: "#9C27B0" },
            { label: "Buy Gold/Silver", icon: "💰", path: "/purchases", color: "#D4A017" },
            { label: "Reports", icon: "📊", path: "/reports", color: "#607D8B" },
          ].map((a) => (
            <button key={a.path} onClick={() => navigate(a.path)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                background: `${a.color}15`, border: `1.5px solid ${a.color}40`,
                borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, color: a.color }}>
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: 0 }}>Recent Sales</h2>
          <button onClick={() => navigate("/billing")} style={{ fontSize: 12, color: "#2196F3", background: "none", border: "none", cursor: "pointer" }}>View All →</button>
        </div>
        {recentSales.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#bbb", fontSize: 13 }}>
            No sales yet. <span onClick={() => navigate("/billing")} style={{ color: "#2196F3", cursor: "pointer" }}>Create first bill →</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fa" }}>
                {["Bill", "Customer", "Items", "Amount", "Mode", "Time"].map((h) =>
                  <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#888", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                )}
              </tr></thead>
              <tbody>
                {recentSales.map((sale, i) => (
                  <tr key={sale.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600 }}>#{sale.billNo || sale.id.slice(-5).toUpperCase()}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{sale.customerName || "Walk-in"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#555" }}>{sale.items?.length || 0} item(s)</td>
                    <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700 }}>₹{Number(sale.total || 0).toLocaleString("en-IN")}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 16, background: "#E3F2FD", color: "#1565C0" }}>
                        {(sale.payments?.[0]?.mode || sale.paymentMode || "cash").toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 11, color: "#999" }}>{formatTime(sale.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
