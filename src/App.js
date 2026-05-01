// src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./hooks/useToast";
import ErrorBoundary from "./components/ErrorBoundary";

// 🔹 Shop App
import MainLayout from "./layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Inventory from "./pages/Inventory";
import Billing from "./pages/Billing";
import Schemes from "./pages/Schemes";
import Repairs from "./pages/repairs";
import Purchases from "./pages/purchases";
import Reports from "./pages/reports";
import RateManager from "./pages/RateManager";
import ShopSettings from "./pages/ShopSettings";

// 🔹 Auth
import Login from "./pages/Login";
import Renew from "./pages/Renew";

// 🔹 Super Admin
import SuperAdminLayout from "./superadmin/SuperAdminLayout";
import SuperAdminDashboard from "./superadmin/SuperAdminDashboard";
import CreateShop from "./superadmin/CreateShop";
import ShopsList from "./superadmin/ShopsList";
import ShopDetails from "./superadmin/ShopDetails";
import EditShop from "./superadmin/EditShop";
import Plans from "./superadmin/Plans";
import Payments from "./superadmin/Payments";

// 🔐 Route Guards
function ProtectedRoute({ children, requireRole }) {
  const { authUser, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-silver-500">Loading…</div>
      </div>
    );
  }
  if (!authUser) return <Navigate to="/login" replace />;
  if (requireRole === "superadmin" && role !== "superadmin")
    return <Navigate to="/" replace />;
  return children;
}

// Small helper: wrap each leaf page in its own ErrorBoundary so a render
// failure in one screen doesn't blank the whole app.
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
              <Route path="rates" element={safe(<RateManager />)} />
              <Route path="settings" element={safe(<ShopSettings />)} />
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
