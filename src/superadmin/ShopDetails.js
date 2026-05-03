// src/superadmin/ShopDetails.js
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useToast } from "../hooks/useToast";

const MODULES = [
  { key: "billing",    label: "Billing / POS" },
  { key: "inventory",  label: "Inventory" },
  { key: "customers",  label: "Customers / CRM" },
  { key: "schemes",    label: "Schemes" },
  { key: "repairs",    label: "Repairs" },
  { key: "purchases",  label: "Purchases" },
  { key: "reports",    label: "Reports" },
  { key: "karigar",    label: "Karigar" },
  { key: "bullion",    label: "Bullion" },
  { key: "accounting", label: "Accounting" },
  { key: "rates",      label: "Rate Manager" },
];

export default function ShopDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", id));
        if (cancelled) return;
        if (snap.exists()) setShop({ id: snap.id, ...snap.data() });
      } catch (err) {
        toast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, toast]);

  const update = async (patch) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "shops", id), { ...patch, updatedAt: serverTimestamp() });
      setShop((s) => ({ ...s, ...patch }));
      toast("Saved", "success");
    } catch (err) { toast(err.message, "error"); }
    setSaving(false);
  };

  const toggleModule = (key, value) => {
    update({ modules: { ...(shop?.modules || {}), [key]: value } });
  };

  const setStatus = (status) => update({ status });
  const extendTrial = (days) => update({
    "trial.endDate": Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
    "trial.isTrial": true,
    status: "active",
  });

  if (loading) return <p style={{ color: "#fff" }}>Loading…</p>;
  if (!shop)   return <p style={{ color: "#fff" }}>Shop not found.</p>;

  const card = { background: "#111", color: "#fff", padding: 20, borderRadius: 10, marginBottom: 16 };
  const btn = { padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 };

  return (
    <div style={{ color: "#fff", maxWidth: 720 }}>
      <button onClick={() => navigate(-1)} style={{ background: "transparent", color: "#aaa", border: "none", cursor: "pointer", marginBottom: 12 }}>⬅ Back</button>
      <h2 style={{ margin: 0, fontSize: 22 }}>{shop.name}</h2>
      <p style={{ color: "#888", fontSize: 12 }}>shopId: <code>{shop.id}</code></p>

      <div style={card}>
        <h3 style={{ margin: "0 0 12px" }}>Plan & Status</h3>
        <p><b>Plan:</b> {shop.plan || "—"}</p>
        <p><b>Status:</b> {shop.status || "—"}</p>
        <p><b>Trial:</b> {shop.trial?.isTrial ? "Yes" : "No"}{" "}{shop.trial?.endDate?.toDate ? `(ends ${shop.trial.endDate.toDate().toLocaleDateString("en-IN")})` : ""}</p>
        <p><b>Subscription:</b> {shop.subscription?.endDate?.toDate ? `until ${shop.subscription.endDate.toDate().toLocaleDateString("en-IN")}` : "—"}</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {shop.status !== "active" && <button disabled={saving} onClick={() => setStatus("active")}  style={{ ...btn, background: "#00c853", color: "#fff" }}>✓ Activate</button>}
          {shop.status !== "blocked" && <button disabled={saving} onClick={() => setStatus("blocked")} style={{ ...btn, background: "#d50000", color: "#fff" }}>⏸ Block</button>}
          <button disabled={saving} onClick={() => extendTrial(7)}  style={{ ...btn, background: "#2962ff", color: "#fff" }}>+7 trial days</button>
          <button disabled={saving} onClick={() => extendTrial(30)} style={{ ...btn, background: "#2962ff", color: "#fff" }}>+30 trial days</button>
          <button disabled={saving} onClick={() => navigate(`/sa/edit-shop/${shop.id}`)} style={{ ...btn, background: "#555", color: "#fff" }}>✏️ Edit details</button>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ margin: "0 0 12px" }}>Modules enabled for this shop</h3>
        <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
          Disabling a module hides its menu and routes for everyone in this shop.
          (Frontend gate; back this with Firestore rules for hard enforcement.)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {MODULES.map((m) => {
            const enabled = shop.modules?.[m.key] !== false; // default ON
            return (
              <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "#0c0c0c", borderRadius: 6 }}>
                <input type="checkbox" checked={enabled} disabled={saving} onChange={(e) => toggleModule(m.key, e.target.checked)} />
                <span style={{ fontSize: 13 }}>{m.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
