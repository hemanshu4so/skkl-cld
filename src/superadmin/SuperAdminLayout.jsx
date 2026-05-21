// src/superadmin/SuperAdminLayout.js
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { path: "/sa",              label: "📊 Dashboard"  },
  { path: "/sa/create-shop",  label: "➕ Create Shop" },
  { path: "/sa/shops",        label: "🏪 All Shops"   },
  { path: "/sa/plans",        label: "📋 Plans"       },
  { path: "/sa/payments",     label: "💳 Payments"    },
];

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData } = useAuth();

  const itemStyle = (path) => {
    const isActive = location.pathname === path;
    return {
      padding: "12px 15px",
      cursor: "pointer",
      borderBottom: "1px solid #222",
      background: isActive ? "#1f1f1f" : "transparent",
      color: isActive ? "#00ffae" : "#ccc",
      fontWeight: isActive ? "bold" : "normal",
    };
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a" }}>
      <div style={{
        width: "240px", background: "#111", color: "#fff",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}>
        <div>
          <h2 style={{ padding: "20px", borderBottom: "1px solid #222" }}>⚡ SUPER ADMIN</h2>
          {NAV.map((n) => (
            <div key={n.path} style={itemStyle(n.path)} onClick={() => navigate(n.path)}>
              {n.label}
            </div>
          ))}
        </div>

        <div style={{ padding: "15px", borderTop: "1px solid #222" }}>
          <div style={{ marginBottom: "10px", fontSize: "14px", color: "#aaa" }}>
            {userData?.name || "Super Admin"}
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "10px", background: "#ff3b3b",
              border: "none", color: "#fff", borderRadius: "6px", cursor: "pointer",
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{
          padding: "15px 20px", background: "#111",
          borderBottom: "1px solid #222", color: "#fff",
        }}>
          <b>SKKL CRM — Super Admin</b>
        </div>
        <div style={{ padding: "20px", flex: 1 }}><Outlet /></div>
      </div>
    </div>
  );
}
