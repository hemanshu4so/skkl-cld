import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const menuItems = [
  { icon: "🏠", label: "Dashboard",    path: "/" },
  { icon: "👤", label: "Customers",    path: "/customers" },
  { icon: "📦", label: "Inventory",    path: "/inventory" },
  { icon: "🧾", label: "Billing",      path: "/billing" },
  { icon: "💰", label: "Purchases",    path: "/purchases" },
  { icon: "🎯", label: "Schemes",      path: "/schemes" },
  { icon: "🔧", label: "Repairs",      path: "/repairs" },
  { icon: "📊", label: "Reports",      path: "/reports" },
  { icon: "📈", label: "Gold/Silver Rates", path: "/rates" },
  { icon: "⚙️", label: "Settings",    path: "/settings" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, shopData, role, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div style={{
      width: "230px",
      minWidth: "230px",
      background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
      color: "#fff",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      overflowY: "auto",
      boxShadow: "2px 0 12px rgba(0,0,0,0.3)"
    }}>

      {/* TOP: Logo + Shop Name */}
      <div>
        <div style={{
          padding: "20px 16px",
          borderBottom: "1px solid rgba(255,215,0,0.2)",
          background: "rgba(255,215,0,0.05)"
        }}>
          <div style={{ fontSize: "22px", marginBottom: "4px" }}>💎</div>
          <div style={{
            fontSize: "16px",
            fontWeight: "700",
            color: "#FFD700",
            letterSpacing: "0.5px"
          }}>
            {shopData?.name || "SKKL Jewellers"}
          </div>
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>
            {shopData?.city || "Jewellery ERP"}
          </div>
        </div>

        {/* MENU ITEMS */}
        <nav style={{ padding: "8px 0" }}>
          {menuItems.map((item) => (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                cursor: "pointer",
                borderRadius: "0 24px 24px 0",
                marginRight: "12px",
                marginBottom: "2px",
                fontSize: "13.5px",
                fontWeight: isActive(item.path) ? "600" : "400",
                background: isActive(item.path)
                  ? "linear-gradient(90deg, rgba(255,215,0,0.2), rgba(255,215,0,0.05))"
                  : "transparent",
                color: isActive(item.path) ? "#FFD700" : "#ccc",
                borderLeft: isActive(item.path) ? "3px solid #FFD700" : "3px solid transparent",
                transition: "all 0.15s ease"
              }}
              onMouseEnter={e => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.color = "#fff";
                }
              }}
              onMouseLeave={e => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#ccc";
                }
              }}
            >
              <span style={{ fontSize: "16px", minWidth: "20px" }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}

          {/* Super Admin Link */}
          {role === "superadmin" && (
            <div
              onClick={() => navigate("/sa")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                cursor: "pointer",
                fontSize: "13.5px",
                color: "#FFD700",
                marginTop: "8px",
                borderTop: "1px solid rgba(255,215,0,0.2)",
                paddingTop: "16px"
              }}
            >
              <span style={{ fontSize: "16px" }}>👑</span>
              <span>Super Admin</span>
            </div>
          )}
        </nav>
      </div>

      {/* BOTTOM: User Info + Logout */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.1)",
        padding: "14px 16px"
      }}>
        <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "4px" }}>
          Logged in as
        </div>
        <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>
          👤 {userData?.name || "User"}
          {role && (
            <span style={{
              marginLeft: "8px",
              fontSize: "10px",
              background: "rgba(255,215,0,0.2)",
              color: "#FFD700",
              padding: "2px 6px",
              borderRadius: "10px"
            }}>
              {role}
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            padding: "8px",
            background: "rgba(255,70,70,0.15)",
            border: "1px solid rgba(255,70,70,0.3)",
            color: "#ff6b6b",
            cursor: "pointer",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "500",
            transition: "all 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,70,70,0.3)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,70,70,0.15)"}
        >
          🚪 Logout
        </button>
      </div>
    </div>
  );
}
