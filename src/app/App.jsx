// src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ToastProvider } from "../hooks/useToast";
import ErrorBoundary from "../components/ErrorBoundary";

// 🔹 Shop App
import MainLayout from "../layout/MainLayout";
import Dashboard from "../pages/Dashboard";
import Customers from "../pages/Customers";
import Inventory from "../pages/Inventory";
import Billing from "../pages/Billing";
import Schemes from "../pages/Schemes";
import Repairs from "../pages/repairs";
import Purchases from "../pages/purchases";
import Reports from "../pages/reports";
import RateManager from "../pages/RateManager";
import ShopSettings from "../pages/ShopSettings";
import Karigar from "../pages/Karigar";
import Bullion from "../pages/Bullion";
import Accounting from "../pages/Accounting";
import ActivityLog from "../pages/ActivityLog";
import Orders from "../pages/Orders";
import PrintTemplates from "../pages/PrintDesigner";
import Vouchers from "../pages/Vouchers";
import BarcodeDesigner from "../pages/BarcodeDesigner";

// 🔹 Auth + recovery
import Login from "../pages/Login";
import Renew from "../pages/Renew";
import AccountUnlinked from "../pages/AccountUnlinked";

// 🔹 Super Admin
import SuperAdminLayout from "../superadmin/SuperAdminLayout";
import SuperAdminDashboard from "../superadmin/SuperAdminDashboard";
import CreateShop from "../superadmin/CreateShop";
import ShopsList from "../superadmin/ShopsList";
import ShopDetails from "../superadmin/ShopDetails";
import EditShop from "../superadmin/EditShop";
import Plans from "../superadmin/Plans";
import Payments from "../superadmin/Payments";

// ─── Centralized loading splash ───────────────────────────────────────
function FullPageLoader({ label = "Loading your shop…" }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-silver-50">
      <div className="flex items-center gap-3 text-silver-600">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

// ─── Route Guard ──────────────────────────────────────────────────────
//
// Order of decisions:
//   1. If still loading → splash (don't render children that may read shopId)
//   2. If signed-out → /login
//   3. If signed-in WITH a hard error (NO_USER_DOC / NO_SHOP_ID / NO_SHOP_DOC)
//      → AccountUnlinked screen (NEVER render shop pages)
//   4. If shop is BLOCKED → /renew
//   5. If superadmin route but role !== superadmin → /
//   6. If shop route but no shopId (and not superadmin) → AccountUnlinked
//   7. Otherwise → render children with shopId guaranteed defined
//
function ProtectedRoute({ children, requireRole }) {
  const { authUser, role, loading, error, shopId } = useAuth();

  if (loading) return <FullPageLoader />;

  if (!authUser) return <Navigate to="/login" replace />;

  if (error === "SHOP_BLOCKED") return <Navigate to="/renew" replace />;
  if (error)                    return <AccountUnlinked code={error} />;

  if (requireRole === "superadmin") {
    if (role !== "superadmin") return <Navigate to="/" replace />;
    return children;
  }

  // Shop pages: shopId MUST be a non-empty string here. If it isn't, we
  // route to AccountUnlinked rather than letting pages crash.
  if (role !== "superadmin" && (!shopId || typeof shopId !== "string")) {
    return <AccountUnlinked code="NO_SHOP_ID" />;
  }

  return children;
}

const safe = (el) => <ErrorBoundary>{el}</ErrorBoundary>;

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Routes>
            {/* 🔐 PUBLIC */}
            <Route path="/login" element={safe(<Login />)} />
            <Route path="/renew" element={safe(<Renew />)} />

            {/* ⚡ SUPER ADMIN */}
            <Route
              path="/sa"
              element={
                <ProtectedRoute requireRole="superadmin">
                  <SuperAdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={safe(<SuperAdminDashboard />)} />
              <Route path="create-shop" element={safe(<CreateShop />)} />
              <Route path="shops" element={safe(<ShopsList />)} />
              <Route path="shop/:id" element={safe(<ShopDetails />)} />
              <Route path="edit-shop/:id" element={safe(<EditShop />)} />
              <Route path="plans" element={safe(<Plans />)} />
              <Route path="payments" element={safe(<Payments />)} />
            </Route>

            {/* 🏪 SHOP ERP */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={safe(<Dashboard />)} />
              <Route path="customers" element={safe(<Customers />)} />
              <Route path="inventory" element={safe(<Inventory />)} />
              <Route path="billing" element={safe(<Billing />)} />
              <Route path="schemes" element={safe(<Schemes />)} />
              <Route path="repairs" element={safe(<Repairs />)} />
              <Route path="purchases" element={safe(<Purchases />)} />
              <Route path="reports" element={safe(<Reports />)} />
              <Route path="karigar"    element={safe(<Karigar />)} />
              <Route path="bullion"    element={safe(<Bullion />)} />
              <Route path="accounting" element={safe(<Accounting />)} />
              <Route path="orders"     element={safe(<Orders />)} />
              <Route path="print-templates" element={safe(<PrintTemplates />)} />
              <Route path="vouchers"  element={safe(<Vouchers />)} />
              <Route path="barcode-designer" element={safe(<BarcodeDesigner />)} />
              <Route path="activity"   element={safe(<ActivityLog />)} />
              <Route path="rates"      element={safe(<RateManager />)} />
              <Route path="settings"   element={safe(<ShopSettings />)} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
