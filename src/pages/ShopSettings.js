// src/pages/ShopSettings.js
//
// Two tabs:
//   1. Company  — billing/header info (existing)
//   2. Users    — sub-user CRUD with role + per-module access toggles
//
// Sub-user creation uses a SECONDARY Firebase app instance (same trick as
// CreateShop.js) so it doesn't sign the current admin out.

import { useState, useEffect, useRef } from "react";
import { initializeApp, deleteApp, getApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { db } from "../firebase";
import {
  doc, getDoc, updateDoc, setDoc, deleteDoc,
  collection, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { assertShopId } from "../lib/utils";
import { logActivity } from "../lib/activityLog";

const ROLES = [
  { value: "admin",   label: "Admin (full access)" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "staff",   label: "Staff (read-only)" },
];

const MODULES = [
  { key: "billing",    label: "Billing / POS" },
  { key: "inventory",  label: "Inventory" },
  { key: "customers",  label: "Customers" },
  { key: "schemes",    label: "Schemes" },
  { key: "repairs",    label: "Repairs" },
  { key: "purchases",  label: "Purchases" },
  { key: "reports",    label: "Reports" },
  { key: "karigar",    label: "Karigar" },
  { key: "bullion",    label: "Bullion" },
  { key: "accounting", label: "Accounting" },
  { key: "rates",      label: "Rate Manager" },
  { key: "activity",   label: "Activity Log" },
  { key: "settings",   label: "Shop Settings" },
];

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

async function createUserWithoutHijackingSession(email, password) {
  const NAME = "skkl-secondary";
  const existing = getApps().find((a) => a.name === NAME);
  const app = existing || initializeApp(firebaseConfig, NAME);
  try {
    const secondaryAuth = getAuth(app);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await fbSignOut(secondaryAuth).catch(() => {});
    return cred.user.uid;
  } finally {
    try { await deleteApp(getApp(NAME)); } catch { /* already disposed */ }
  }
}

export default function ShopSettings() {
  const { userData, shopId, role } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("company");

  return (
    <div style={{ padding: 24, maxWidth: 920 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>⚙️ Shop Settings</h1>
      <div style={{ display: "flex", gap: 6, margin: "16px 0" }}>
        {[
          { id: "company", label: "Company" },
          ...(role === "admin" ? [{ id: "users", label: "Users" }] : []),
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 20, border: "1.5px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: tab === t.id ? "#1a1a2e" : "#ddd",
              background: tab === t.id ? "#1a1a2e" : "#fff",
              color: tab === t.id ? "#fff" : "#555",
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "company" && <CompanyTab shopId={shopId} userData={userData} toast={toast} />}
      {tab === "users"   && <UsersTab   shopId={shopId} userData={userData} toast={toast} />}
    </div>
  );
}

const COMPANY_EMPTY = { name: "", address: "", phone: "", email: "", gst: "", bankName: "", accountNo: "", ifsc: "" };

// ───── Company tab (existing functionality) ─────
function CompanyTab({ shopId, userData, toast }) {
  const [company, setCompany] = useState(COMPANY_EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shopId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", shopId));
        if (cancelled) return;
        if (snap.exists()) setCompany({ ...COMPANY_EMPTY, ...(snap.data().company || {}) });
      } catch (err) { toast("Failed to load: " + err.message, "error"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [shopId, toast]);

  const save = async () => {
    if (!assertShopId(shopId, toast, "ShopSettings.Company.save")) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "shops", shopId), { company, updatedAt: serverTimestamp() });
      toast("Settings saved", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    setSaving(false);
  };

  const field = (label, key, type = "text", placeholder = "") => (
    <div className="flex flex-col">
      <label className="label">{label}</label>
      <input type={type} className="input" value={company[key] || ""}
        placeholder={placeholder} onChange={(e) => setCompany((c) => ({ ...c, [key]: e.target.value }))} />
    </div>
  );

  if (loading) return <div className="text-silver-500">Loading…</div>;
  return (
    <>
      <div className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {field("Company Name", "name", "text", "SKKL Jewellers")}
        {field("Phone", "phone", "tel", "+91 …")}
        {field("Email", "email", "email")}
        {field("GST Number", "gst", "text", "27ABCDE1234F1Z5")}
        <div className="md:col-span-2">{field("Address", "address")}</div>
        <div className="md:col-span-2 mt-4 mb-2">
          <h2 className="text-sm font-bold text-navy-900">Bank Details</h2>
        </div>
        {field("Bank Name", "bankName")}
        {field("Account Number", "accountNo")}
        {field("IFSC Code", "ifsc")}
      </div>
      <button onClick={save} disabled={saving} className="btn btn-primary mt-6">
        {saving ? "Saving…" : "💾 Save Settings"}
      </button>
    </>
  );
}

// ───── Users tab — admin-only ─────
function UsersTab({ shopId, userData, toast }) {
  const [users, setUsers] = useState([]);
  const subRef = useRef(null);

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "users"), where("shopId", "==", shopId)),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => toast("Could not load users: " + err.message, "error")
    );
    subRef.current = u;
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [shopId, toast]);

  const empty = { name: "", email: "", password: "", role: "cashier", modules: defaultModulesFor("cashier") };
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);

  const create = async () => {
    if (!assertShopId(shopId, toast, "ShopSettings.Users.create")) return;
    if (!form.name || !form.email || !form.password) { toast("Name, email, password required", "warn"); return; }
    if (form.password.length < 6) { toast("Password must be at least 6 chars", "warn"); return; }
    setSubmitting(true);
    try {
      const uid = await createUserWithoutHijackingSession(form.email.trim(), form.password);
      await setDoc(doc(db, "users", uid), {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        modules: form.modules,
        shopId,
        createdAt: serverTimestamp(),
        createdByUid: userData?.id || null,
      });
      await logActivity({
        shopId, action: "create", entity: "user", entityId: uid,
        uid: userData?.id, name: userData?.name,
        meta: { name: form.name, email: form.email, role: form.role },
      });
      toast(`User ${form.name} created`, "success");
      setForm(empty); setEditId(null);
    } catch (err) {
      toast(err?.message || "Failed to create user", "error");
    } finally { setSubmitting(false); }
  };

  const updateExisting = async () => {
    if (!editId) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "users", editId), {
        name: form.name.trim(), role: form.role,
        modules: form.modules,
        updatedAt: serverTimestamp(),
      });
      await logActivity({ shopId, action: "update", entity: "user", entityId: editId, uid: userData?.id, name: userData?.name });
      toast("User updated", "success");
      setEditId(null); setForm(empty);
    } catch (err) { toast(err.message, "error"); }
    finally { setSubmitting(false); }
  };

  const handleEdit = (u) => {
    setEditId(u.id);
    setForm({
      name: u.name || "", email: u.email || "", password: "",
      role: u.role || "cashier",
      modules: u.modules || defaultModulesFor(u.role || "cashier"),
    });
  };

  const handleDelete = async (u) => {
    if (u.id === userData?.id) { toast("You cannot delete your own account here", "warn"); return; }
    if (!window.confirm(`Remove user ${u.name}? They lose access immediately.`)) return;
    try {
      await deleteDoc(doc(db, "users", u.id));
      await logActivity({ shopId, action: "delete", entity: "user", entityId: u.id, uid: userData?.id, name: userData?.name, before: u });
      toast("User removed (Firebase Auth account stays — disable from console if needed)", "success");
    } catch (err) { toast(err.message, "error"); }
  };

  const onModuleToggle = (key, value) => {
    setForm((f) => ({ ...f, modules: { ...(f.modules || {}), [key]: value } }));
  };

  const onRoleChange = (role) => {
    setForm((f) => ({ ...f, role, modules: defaultModulesFor(role) }));
  };

  const inputStyle = "input";

  return (
    <div>
      <div className="card p-5 mb-4">
        <h3 style={{ marginTop: 0 }}>{editId ? "Edit user" : "Create new user"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          <div><label className="label">Name *</label>
            <input className={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Email *</label>
            <input className={inputStyle} type="email" value={form.email} disabled={!!editId}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          {!editId && (
            <div><label className="label">Password *</label>
              <input className={inputStyle} type="password" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="min 6 chars" /></div>
          )}
          <div><label className="label">Role</label>
            <select className={inputStyle + " bg-white"} value={form.role} onChange={(e) => onRoleChange(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label className="label">Module access</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
            {MODULES.map((m) => (
              <label key={m.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: 6, background: "#f8f9fa", borderRadius: 6 }}>
                <input type="checkbox" checked={form.modules?.[m.key] !== false}
                  onChange={(e) => onModuleToggle(m.key, e.target.checked)} />
                <span style={{ fontSize: 12 }}>{m.label}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Frontend gate; pair with Firestore rules for hard enforcement.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {editId
            ? (<>
                <button onClick={updateExisting} disabled={submitting} className="btn btn-primary">{submitting ? "Saving…" : "💾 Save"}</button>
                <button onClick={() => { setEditId(null); setForm(empty); }} className="btn btn-secondary">Cancel</button>
              </>)
            : (<button onClick={create} disabled={submitting} className="btn btn-primary">
                {submitting ? "Creating…" : "+ Create User"}
              </button>)
          }
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>
          Users in this shop ({users.length})
        </div>
        {users.length === 0
          ? <div style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No users yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Name", "Email", "Role", "Modules", ""].map((h) =>
                    <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const allowed = u.modules || {};
                  const enabled = Object.keys(allowed).filter((k) => allowed[k] !== false).length;
                  return (
                    <tr key={u.id} style={{ borderTop: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "8px 14px", fontWeight: 600 }}>{u.name}{u.id === userData?.id && <span style={{ marginLeft: 6, fontSize: 10, color: "#1565C0" }}>(you)</span>}</td>
                      <td style={{ padding: "8px 14px", fontSize: 12 }}>{u.email}</td>
                      <td style={{ padding: "8px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: u.role === "admin" ? "#FFF8E1" : u.role === "manager" ? "#E3F2FD" : "#F5F5F5",
                          color: u.role === "admin" ? "#B8860B" : u.role === "manager" ? "#1565C0" : "#555" }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 12, color: "#666" }}>
                        {Object.keys(allowed).length === 0 ? "all" : `${enabled} of ${Object.keys(allowed).length}`}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <button onClick={() => handleEdit(u)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginRight: 6 }}>Edit</button>
                        <button onClick={() => handleDelete(u)} className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} disabled={u.id === userData?.id}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

function defaultModulesFor(role) {
  const allOn = MODULES.reduce((acc, m) => ({ ...acc, [m.key]: true }), {});
  if (role === "admin") return allOn;
  if (role === "manager") return { ...allOn, settings: false };
  if (role === "cashier") return {
    billing: true, customers: true, inventory: true, repairs: true, schemes: true,
    rates: true, reports: false, purchases: false, karigar: false, bullion: false,
    accounting: false, activity: false, settings: false,
  };
  // staff (read-only) — frontend gate keeps menu items hidden
  return {
    billing: false, customers: true, inventory: true, repairs: true, schemes: true,
    rates: false, reports: false, purchases: false, karigar: false, bullion: false,
    accounting: false, activity: false, settings: false,
  };
}
