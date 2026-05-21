// src/superadmin/CreateShop.js
//
// Creates a new shop + its first admin user. The trick: calling
// createUserWithEmailAndPassword on the *primary* Firebase Auth instance
// signs the new user in, kicking the superadmin out. Fix: spin up a
// SECOND Firebase app instance just for this signup, then dispose of it.

import { useState } from "react";
import { initializeApp, deleteApp, getApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@fb/client";
import { useToast } from "../hooks/useToast";

// Read same config from env so the secondary app talks to the same project.
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
  // Re-use existing secondary app if a previous attempt left one around.
  const existing = getApps().find((a) => a.name === NAME);
  const app = existing || initializeApp(firebaseConfig, NAME);
  try {
    const secondaryAuth = getAuth(app);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    // Don't keep the new user signed-in on the secondary auth; just dispose.
    await fbSignOut(secondaryAuth).catch(() => {});
    return cred.user.uid;
  } finally {
    try { await deleteApp(getApp(NAME)); } catch { /* already disposed */ }
  }
}

export default function CreateShop() {
  const { toast } = useToast();
  const [shopName, setShopName] = useState("");
  const [city, setCity] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [trialDays, setTrialDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!shopName || !ownerName || !email || !password) {
      toast("Fill shop name, owner name, email, and password", "warn");
      return;
    }
    if (password.length < 6) {
      toast("Password must be at least 6 characters", "warn");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create the auth user via secondary app (does NOT log superadmin out)
      const uid = await createUserWithoutHijackingSession(email.trim(), password);

      // 2. Create the shop, owned by that uid, with a trial window
      const shopId = "shop_" + Date.now();
      const trialEnd = new Date(Date.now() + Number(trialDays || 7) * 24 * 60 * 60 * 1000);

      await setDoc(doc(db, "shops", shopId), {
        name: shopName.trim(),
        city: city.trim(),
        ownerId: uid,
        plan: "trial",
        status: "active",
        trial: {
          isTrial: true,
          startDate: Timestamp.now(),
          endDate: Timestamp.fromDate(trialEnd),
        },
        createdAt: serverTimestamp(),
      });

      // 3. Create the user profile keyed by uid (matches AuthContext lookup)
      await setDoc(doc(db, "users", uid), {
        name: ownerName.trim(),
        email: email.trim(),
        role: "admin",
        shopId,
        createdAt: serverTimestamp(),
      });

      toast(`Shop "${shopName}" created — trial ends ${trialEnd.toLocaleDateString("en-IN")}`, "success");
      setShopName(""); setCity(""); setOwnerName(""); setEmail(""); setPassword("");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[create-shop]", err);
      toast(err?.message || "Failed to create shop", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label, value, setter, type = "text", placeholder = "") => (
    <div className="flex flex-col mb-4">
      <label className="label" style={{ color: "#aaa" }}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setter(e.target.value)}
        style={{
          padding: "10px 12px", borderRadius: "8px", border: "1px solid #333",
          background: "#1a1a1a", color: "#fff", fontSize: "14px",
        }}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 520, color: "#fff" }}>
      <h2 style={{ marginBottom: 8 }}>➕ Create Shop</h2>
      <p style={{ color: "#aaa", fontSize: 13, marginBottom: 24 }}>
        Sets up a shop, its owner account, and a trial period.
      </p>

      {field("Shop Name *", shopName, setShopName, "text", "SKKL Jewellers - Mumbai")}
      {field("City",       city,     setCity,     "text", "Mumbai")}
      {field("Owner Name *", ownerName, setOwnerName, "text", "Hardik Soni")}
      {field("Owner Email *", email, setEmail, "email", "owner@shop.com")}
      {field("Owner Password *", password, setPassword, "password", "min 6 chars")}
      {field("Trial Days", trialDays, setTrialDays, "number", "7")}

      <button
        onClick={handleCreate}
        disabled={submitting}
        style={{
          padding: "10px 20px", background: "#00c853", color: "#fff",
          border: "none", borderRadius: "8px", cursor: submitting ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
      >
        {submitting ? "Creating…" : "Create Shop"}
      </button>
    </div>
  );
}
