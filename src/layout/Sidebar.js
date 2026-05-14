// src/layout/Sidebar.js
//
// Responsive sidebar:
//   - >= 768px: sticky 230px column, no toggle
//   - < 768px: hidden by default; hamburger button in top-left opens a slide-in
//              drawer; outside click or item click closes it.

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Package, ReceiptText, Wallet,
  Target, Wrench, BarChart3, TrendingUp, Settings, Crown, LogOut,
  Hammer, Coins, BookOpenCheck, History, Menu, X, ClipboardList, Printer, FileText, QrCode,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const MENU = [
  { Icon: LayoutDashboard, label: "Dashboard",         path: "/" },
  { Icon: Users,           label: "Customers",         path: "/customers" },
  { Icon: Package,         label: "Inventory",         path: "/inventory" },
  { Icon: ReceiptText,     label: "Billing",           path: "/billing" },
  { Icon: FileText,        label: "Vouchers",          path: "/vouchers" },
  { Icon: Wallet,          label: "Purchases",         path: "/purchases" },
  { Icon: Target,          label: "Schemes",           path: "/schemes" },
  { Icon: Wrench,          label: "Repairs",           path: "/repairs" },
  { Icon: ClipboardList,   label: "Orders",            path: "/orders" },
  { Icon: BarChart3,       label: "Reports",           path: "/reports" },
  { Icon: Hammer,          label: "Karigar",           path: "/karigar" },
  { Icon: Coins,           label: "Bullion",           path: "/bullion" },
  { Icon: BookOpenCheck,   label: "Accounting",        path: "/accounting" },
  { Icon: History,         label: "Activity Log",      path: "/activity" },
  { Icon: TrendingUp,      label: "Gold/Silver Rates", path: "/rates" },
  { Icon: Printer,         label: "Print Templates",   path: "/print-templates" },
  { Icon: QrCode,          label: "Barcode Designer",  path: "/barcode-designer" },
  { Icon: Settings,        label: "Settings",          path: "/settings" },
];

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, shopData, role, logout, moduleAccess } = useAuth();

  const moduleKeyForPath = (path) => ({
    "/customers": "customers", "/inventory": "inventory",
    "/billing": "billing",
    "/vouchers": "billing", "/purchases": "purchases",
    "/schemes": "schemes", "/repairs": "repairs",
    "/orders": "orders",
    "/reports": "reports", "/karigar": "karigar",
    "/bullion": "bullion", "/accounting": "accounting",
    "/activity": "activity", "/rates": "rates",
    "/print-templates": "settings",
    "/barcode-designer": "settings",
    "/settings": "settings",
  })[path];

  const visibleMenu = MENU.filter((item) => {
    // Dashboard always visible; otherwise consult moduleAccess
    if (item.path === "/") return true;
    const key = moduleKeyForPath(item.path);
    if (!key) return true;
    if (!moduleAccess) return true;        // null = no restrictions
    return moduleAccess[key] !== false;    // explicit false hides it
  });
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Close drawer on route change (mobile)
  useEffect(() => { if (isMobile) setOpen(false); }, [location.pathname, isMobile]);

  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const aside = (
    <aside
      className="text-white"
      style={{
        background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
        boxShadow: "2px 0 12px rgba(0,0,0,0.3)",
        width: 230, minWidth: 230,
        height: "100vh",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        overflowY: "auto",
        position: isMobile ? "fixed" : "sticky",
        top: 0, left: 0, zIndex: 60,
        transform: isMobile && !open ? "translateX(-100%)" : "translateX(0)",
        transition: "transform 0.2s ease",
      }}
    >
      <div>
        <div className="px-4 py-5 border-b border-gold-500/20" style={{ background: "rgba(255,215,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="text-2xl mb-1">💎</div>
            <div className="text-base font-bold tracking-wide" style={{ color: "#FFD700" }}>{shopData?.name || "SKKL Jewellers"}</div>
            <div className="text-[11px] text-silver-400 mt-0.5">{shopData?.city || "Jewellery ERP"}</div>
          </div>
          {isMobile && (
            <button onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="py-2">
          {visibleMenu.map(({ Icon, label, path }) => {
            const active = isActive(path);
            return (
              <button key={path} onClick={() => navigate(path)}
                className={[
                  "w-full text-left flex items-center gap-2.5",
                  "px-4 py-2.5 mr-3 mb-0.5 rounded-r-3xl text-[13.5px]",
                  "transition-colors duration-150",
                  active ? "font-semibold border-l-[3px]"
                    : "font-normal border-l-[3px] border-transparent text-silver-300 hover:bg-white/5 hover:text-white",
                ].join(" ")}
                style={active ? {
                  background: "linear-gradient(90deg, rgba(255,215,0,0.2), rgba(255,215,0,0.05))",
                  color: "#FFD700",
                  borderLeftColor: "#FFD700",
                } : undefined}>
                <Icon size={16} /><span>{label}</span>
              </button>
            );
          })}

          {role === "superadmin" && (
            <button onClick={() => navigate("/sa")}
              className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] mt-2 pt-4 border-t border-gold-500/20"
              style={{ color: "#FFD700" }}>
              <Crown size={16} /><span>Super Admin</span>
            </button>
          )}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="text-[12px] text-silver-400 mb-1">Logged in as</div>
        <div className="text-[13px] font-semibold mb-3 flex items-center flex-wrap gap-2">
          <span>👤 {userData?.name || "User"}</span>
          {role && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,215,0,0.2)", color: "#FFD700" }}>{role}</span>}
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-lg transition-colors"
          style={{ background: "rgba(255,70,70,0.15)", border: "1px solid rgba(255,70,70,0.3)", color: "#ff6b6b" }}>
          <LogOut size={14} />Logout
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile-only hamburger */}
      {isMobile && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          style={{
            position: "fixed", top: 12, left: 12, zIndex: 55,
            width: 40, height: 40, borderRadius: 8,
            border: "1px solid #ddd", background: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          }}>
          <Menu size={18} />
        </button>
      )}

      {/* Backdrop on mobile when open */}
      {isMobile && open && (
        <div onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 55,
          }} />
      )}

      {aside}
    </>
  );
}
