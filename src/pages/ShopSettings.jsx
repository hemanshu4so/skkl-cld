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
import { db } from "@fb/client";
import {
  doc, getDoc, updateDoc, setDoc, deleteDoc,
  collection, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useToast } from "../hooks/useToast";
import { assertShopId } from "../lib/utils";
import { logActivity } from "../lib/activityLog";
import { setPin, DEFAULT_PIN, hashPin, generateSalt } from "@shared/pin";
import { uploadShopFile } from "../lib/upload";
import { exportShopJSON, downloadJSON } from "../services/backup";

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

// Read env vars from Vite (import.meta.env.VITE_*) AND CRA (process.env.REACT_APP_*).
// Same resolution rules as src/firebase.js.
const _viteEnv = (() => { try { return (typeof import.meta !== "undefined" && import.meta && import.meta.env) || {}; } catch { return {}; } })();
const _procEnv = (() => { try { return (typeof process !== "undefined" && process.env) || {}; } catch { return {}; } })();
const _envKey = (k) => _viteEnv[`VITE_FIREBASE_${k}`] || _viteEnv[`REACT_APP_FIREBASE_${k}`] || _procEnv[`REACT_APP_FIREBASE_${k}`] || _procEnv[`VITE_FIREBASE_${k}`] || "";

const firebaseConfig = {
  apiKey:            _envKey("API_KEY"),
  authDomain:        _envKey("AUTH_DOMAIN"),
  projectId:         _envKey("PROJECT_ID"),
  storageBucket:     _envKey("STORAGE_BUCKET"),
  messagingSenderId: _envKey("MESSAGING_SENDER_ID"),
  appId:             _envKey("APP_ID"),
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

const COMPANY_EMPTY = { name: "", address: "", phone: "", email: "", gst: "", bankName: "", accountNo: "", ifsc: "", logoUrl: "", signatureUrl: "", footerNote: "", showGstinOnBills: true };

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
      <BrandingSection company={company} setCompany={setCompany} shopId={shopId} userData={userData} toast={toast} />

      <PinLockToggleSection shopId={shopId} userData={userData} toast={toast} />

      <button onClick={save} disabled={saving} className="btn btn-primary mt-6">
        {saving ? "Saving…" : "💾 Save Settings"}
      </button>

      <BackupSection shopId={shopId} userData={userData} toast={toast} />
    </>
  );
}

function BackupSection({ shopId, userData, toast }) {
  const [busy, setBusy] = useState(false);
  const handleDownload = async () => {
    if (!assertShopId(shopId, toast, "ShopSettings.backup")) return;
    setBusy(true);
    try {
      const data = await exportShopJSON(shopId);
      downloadJSON(data, `skkl-backup-${shopId}-${new Date().toISOString().slice(0, 10)}.json`);
      await logActivity({ shopId, action: "create", entity: "backup", uid: userData?.id, name: userData?.name, meta: { tables: Object.keys(data.data).length } });
      toast("Backup downloaded", "success");
    } catch (err) { toast("Backup failed: " + err.message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="card p-5 mt-6" style={{ background: "#FFFDE7", borderColor: "#FDD835" }}>
      <h3 style={{ margin: 0 }}>📦 Backup</h3>
      <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Download a JSON snapshot of every collection in your shop. Schedule daily
        automated backups by deploying functions/index.js (see project README).
      </p>
      <button onClick={handleDownload} disabled={busy} className="btn btn-primary">
        {busy ? "Preparing…" : "⬇️ Download Backup (JSON)"}
      </button>
    </div>
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
      const _salt = generateSalt();
      const _hash = await hashPin(DEFAULT_PIN, _salt);
      await setDoc(doc(db, "users", uid), {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        modules: form.modules,
        shopId,
        pinHash: _hash,
        pinSalt: _salt,
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
                        <button onClick={async () => {
                          if (!window.confirm(`Reset PIN for ${u.name} to ${DEFAULT_PIN}?`)) return;
                          try { await setPin({ collection: "users", uid: u.id, pin: DEFAULT_PIN }); toast(`PIN reset to ${DEFAULT_PIN}`, "success"); }
                          catch (err) { toast(err.message, "error"); }
                        }} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginRight: 6 }}>Reset PIN</button>
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


function PinLockToggleSection({ shopId, userData, toast }) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!shopId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", shopId));
        if (cancelled) return;
        if (snap.exists()) {
          const v = snap.data().pinLockEnabled;
          setEnabled(v === undefined ? true : !!v);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [shopId]);
  const toggle = async () => {
    if (!shopId) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "shops", shopId), { pinLockEnabled: !enabled, updatedAt: serverTimestamp() });
      setEnabled((v) => !v);
      toast(`PIN lock ${!enabled ? "enabled" : "disabled"}`, "success");
    } catch (err) { toast(err.message, "error"); }
    setBusy(false);
  };
  if (loading) return null;
  return (
    <div className="card p-4 mt-4" style={{ background: "#FFFDE7", borderColor: "#FDD835" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong style={{ fontSize: 13 }}>🔒 Idle PIN lock</strong>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
            Locks the screen after 5 minutes of inactivity. Default PIN for new
            users is <code>1234</code>; admin can reset from the Users tab.
          </div>
        </div>
        <button onClick={toggle} disabled={busy}
          style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "1px solid",
            background: enabled ? "#1B5E20" : "#E53935",
            borderColor: enabled ? "#1B5E20" : "#E53935",
            color: "#fff", cursor: "pointer" }}>
          {busy ? "…" : enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
        </button>
      </div>
    </div>
  );
}


function BrandingSection({ company, setCompany, shopId, userData, toast }) {
  const [busy, setBusy] = useState({ logo: false, sig: false });
  const upload = async (kind, file) => {
    if (!file) return;
    if (!shopId) { toast("Shop not loaded yet", "error"); return; }
    setBusy((b) => ({ ...b, [kind]: true }));
    try {
      const { url } = await uploadShopFile({ shopId, kind: "branding", entityId: kind, file });
      const field = kind === "logo" ? "logoUrl" : "signatureUrl";
      setCompany((c) => ({ ...c, [field]: url }));
      toast(`${kind === "logo" ? "Logo" : "Signature"} uploaded`, "success");
    } catch (err) { toast("Upload failed: " + err.message, "error"); }
    finally { setBusy((b) => ({ ...b, [kind]: false })); }
  };
  const clearImg = (field) => setCompany((c) => ({ ...c, [field]: "" }));
  return (
    <div className="card p-5 mt-4" style={{ background: "#FFFDFA", borderColor: "#E0C97F" }}>
      <h3 style={{ marginTop: 0, fontSize: 14, fontWeight: 700, color: "#5A3E00" }}>🖼 Print &amp; Branding</h3>
      <p style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
        Used on bills, receipts, and tag prints. Stored in Firebase Storage; URL on the shop document.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
        <div>
          <label className="label">Shop logo</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {company?.logoUrl
              ? <img src={company.logoUrl} alt="" style={{ width: 90, height: 90, objectFit: "contain", borderRadius: 8, border: "1px solid #eee", background: "#fff" }} />
              : <div style={{ width: 90, height: 90, background: "#f5f5f5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#aaa", border: "1px dashed #ddd" }}>💎</div>}
            <div>
              <label style={{ display: "inline-block", padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "#1a1a2e", color: "#fff", borderRadius: 6, cursor: busy.logo ? "wait" : "pointer" }}>
                {busy.logo ? "Uploading…" : (company?.logoUrl ? "Replace" : "Upload")}
                <input type="file" accept="image/*" onChange={(e) => upload("logo", e.target.files?.[0])} style={{ display: "none" }} disabled={busy.logo} />
              </label>
              {company?.logoUrl && <button onClick={() => clearImg("logoUrl")} style={{ marginLeft: 6, padding: "6px 10px", fontSize: 11, background: "#FFEBEE", color: "#C62828", border: "none", borderRadius: 6, cursor: "pointer" }}>Remove</button>}
            </div>
          </div>
        </div>
        <div>
          <label className="label">Authorised signature</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {company?.signatureUrl
              ? <img src={company.signatureUrl} alt="" style={{ width: 140, height: 60, objectFit: "contain", borderRadius: 6, border: "1px solid #eee", background: "#fff" }} />
              : <div style={{ width: 140, height: 60, background: "#f5f5f5", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#aaa", border: "1px dashed #ddd" }}>(no signature)</div>}
            <div>
              <label style={{ display: "inline-block", padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "#1a1a2e", color: "#fff", borderRadius: 6, cursor: busy.sig ? "wait" : "pointer" }}>
                {busy.sig ? "Uploading…" : (company?.signatureUrl ? "Replace" : "Upload")}
                <input type="file" accept="image/*" onChange={(e) => upload("sig", e.target.files?.[0])} style={{ display: "none" }} disabled={busy.sig} />
              </label>
              {company?.signatureUrl && <button onClick={() => clearImg("signatureUrl")} style={{ marginLeft: 6, padding: "6px 10px", fontSize: 11, background: "#FFEBEE", color: "#C62828", border: "none", borderRadius: 6, cursor: "pointer" }}>Remove</button>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="label">Footer note (terms / thank you)</label>
        <textarea rows={3} value={company?.footerNote || ""}
          onChange={(e) => setCompany((c) => ({ ...c, footerNote: e.target.value }))}
          placeholder="e.g. Goods once sold will not be taken back. Thank you!" className="input" style={{ resize: "vertical" }} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}>
        <input type="checkbox" checked={company?.showGstinOnBills !== false}
          onChange={(e) => setCompany((c) => ({ ...c, showGstinOnBills: e.target.checked }))} />
        <span>Show GSTIN on bills and receipts</span>
      </label>
    </div>
  );
}
