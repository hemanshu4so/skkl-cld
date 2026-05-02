// src/layout/Sidebar.js
//
// Tailwind sidebar using existing tokens (navy/gold) + lucide-react icons.
// (lucide-react was already in package.json but unused.)

import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Package, ReceiptText, Wallet,
  Target, Wrench, BarChart3, TrendingUp, Settings, Crown, LogOut,
  Hammer, Coins, BookOpenCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const MENU = [
  { Icon: LayoutDashboard, label: "Dashboard",         path: "/" },
  { Icon: Users,           label: "Customers",         path: "/customers" },
  { Icon: Package,         label: "Inventory",         path: "/inventory" },
  { Icon: ReceiptText,     label: "Billing",           path: "/billing" },
  { Icon: Wallet,          label: "Purchases",         path: "/purchases" },
  { Icon: Target,          label: "Schemes",           path: "/schemes" },
  { Icon: Wrench,          label: "Repairs",           path: "/repairs" },
  { Icon: BarChart3,       label: "Reports",           path: "/reports" },
  { Icon: Hammer,          label: "Karigar",           path: "/karigar" },
  { Icon: Coins,           label: "Bullion",           path: "/bullion" },
  { Icon: BookOpenCheck,   label: "Accounting",        path: "/accounting" },
  { Icon: TrendingUp,      label: "Gold/Silver Rates", path: "/rates" },
  { Icon: Settings,        label: "Settings",          path: "/settings" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, shopData, role, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <aside
      className="sticky top-0 h-screen overflow-y-auto w-[230px] min-w-[230px] flex flex-col justify-between text-white"
      style={{
        background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
        boxShadow: "2px 0 12px rgba(0,0,0,0.3)",
      }}
    >
      <div>
        <div className="px-4 py-5 border-b border-gold-500/20" style={{ background: "rgba(255,215,0,0.05)" }}>
          <div className="text-2xl mb-1">💎</div>
          <div className="text-base font-bold tracking-wide" style={{ color: "#FFD700" }}>
            {shopData?.name || "SKKL Jewellers"}
          </div>
          <div className="text-[11px] text-silver-400 mt-0.5">
            {shopData?.city || "Jewellery ERP"}
          </div>
        </div>

        <nav className="py-2">
          {MENU.map(({ Icon, label, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={[
                  "w-full text-left flex items-center gap-2.5",
                  "px-4 py-2.5 mr-3 mb-0.5 rounded-r-3xl text-[13.5px]",
                  "transition-colors duration-150",
                  active
                    ? "font-semibold border-l-[3px]"
                    : "font-normal border-l-[3px] border-transparent text-silver-300 hover:bg-white/5 hover:text-white",
                ].join(" ")}
                style={
                  active
                    ? {
                        background: "linear-gradient(90deg, rgba(255,215,0,0.2), rgba(255,215,0,0.05))",
                        color: "#FFD700",
                        borderLeftColor: "#FFD700",
                      }
                    : undefined
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            );
          })}

          {role === "superadmin" && (
            <button
              onClick={() => navigate("/sa")}
              className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] mt-2 pt-4 border-t border-gold-500/20"
              style={{ color: "#FFD700" }}
            >
              <Crown size={16} />
              <span>Super Admin</span>
            </button>
          )}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="text-[12px] text-silver-400 mb-1">Logged in as</div>
        <div className="text-[13px] font-semibold mb-3 flex items-center flex-wrap gap-2">
          <span>👤 {userData?.name || "User"}</span>
          {role && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,215,0,0.2)", color: "#FFD700" }}>
              {role}
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-lg transition-colors"
          style={{
            background: "rgba(255,70,70,0.15)",
            border: "1px solid rgba(255,70,70,0.3)",
            color: "#ff6b6b",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,70,70,0.3)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,70,70,0.15)")}
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </aside>
  );
}
