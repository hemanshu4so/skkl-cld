import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItem = (path, label) => {
    const isActive = location.pathname === path;

    return {
      padding: "12px 15px",
      cursor: "pointer",
      borderBottom: "1px solid #222",
      background: isActive ? "#1f1f1f" : "transparent",
      color: isActive ? "#00ffae" : "#ccc",
      fontWeight: isActive ? "bold" : "normal"
    };
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem("user");
    navigate("/login");
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a" }}>
      
      {/* 🔥 SIDEBAR */}
      <div style={{
        width: "240px",
        background: "#111",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between"
      }}>
        
        <div>
          <h2 style={{ padding: "20px", borderBottom: "1px solid #222" }}>
            ⚡ SUPER ADMIN
          </h2>

          <div style={menuItem("/sa", "Dashboard")} onClick={() => navigate("/sa")}>
            📊 Dashboard
          </div>

          <div style={menuItem("/sa/create-shop", "Create")} onClick={() => navigate("/sa/create-shop")}>
            ➕ Create Shop
          </div>

          <div style={menuItem("/sa/shops", "Shops")} onClick={() => navigate("/sa/shops")}>
            🏪 All Shops
          </div>
        </div>

        {/* 👤 USER + LOGOUT */}
        <div style={{ padding: "15px", borderTop: "1px solid #222" }}>
          <div style={{ marginBottom: "10px", fontSize: "14px", color: "#aaa" }}>
            {user?.name || "Super Admin"}
          </div>

          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "10px",
              background: "#ff3b3b",
              border: "none",
              color: "#fff",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* 🔥 MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        
        {/* 🔹 TOP BAR */}
        <div style={{
          padding: "15px 20px",
          background: "#111",
          borderBottom: "1px solid #222",
          color: "#fff"
        }}>
          <b>SKKL CRM - Super Admin</b>
        </div>

        {/* 🔹 PAGE CONTENT */}
        <div style={{ padding: "20px", flex: 1 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}