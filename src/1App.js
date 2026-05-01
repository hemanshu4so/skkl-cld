import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";

// 🔹 Normal Shop App
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

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>

          {/* 🔐 PUBLIC */}
          <Route path="/login" element={<Login />} />
          <Route path="/renew" element={<Renew />} />

          {/* ⚡ SUPER ADMIN */}
          <Route path="/sa" element={<SuperAdminLayout />}>
            <Route index element={<SuperAdminDashboard />} />
            <Route path="create-shop" element={<CreateShop />} />
            <Route path="shops" element={<ShopsList />} />
            <Route path="shop/:id" element={<ShopDetails />} />
            <Route path="edit-shop/:id" element={<EditShop />} />
            <Route path="plans" element={<Plans />} />
            <Route path="payments" element={<Payments />} />
          </Route>

          {/* 🏪 SHOP ERP */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="billing" element={<Billing />} />
            <Route path="schemes" element={<Schemes />} />
            <Route path="repairs" element={<Repairs />} />
            <Route path="purchases" element={<Purchases/>} />
            <Route path="reports" element={<Reports />} />
            <Route path="rates" element={<RateManager />} />
            <Route path="settings" element={<ShopSettings />} />
          </Route>

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
