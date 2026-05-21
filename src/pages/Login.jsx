// src/pages/Login.js
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@fb/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { checkShopAccess } from "../utils/checkAccess";
import { useToast } from "../hooks/useToast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!email || !password) {
      toast("Email and password are required", "warn");
      return;
    }
    setSubmitting(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCred.user.uid;

      // Look up user/superadmin profile (AuthContext also does this; we just
      // need it here to decide where to navigate after login).
      let snap = await getDoc(doc(db, "users", uid));
      let role = "user";
      let userData = null;

      if (!snap.exists()) {
        snap = await getDoc(doc(db, "superadmins", uid));
        if (!snap.exists()) {
          toast("User profile not found in database", "error");
          setSubmitting(false);
          return;
        }
        role = "superadmin";
        userData = snap.data();
      } else {
        userData = snap.data();
        role = userData.role || "user";
      }

      // Trial / subscription gate (admins of blocked shops go to /renew).
      if (role !== "superadmin" && userData.shopId) {
        const access = await checkShopAccess(userData.shopId);
        if (!access.allowed) {
          navigate("/renew");
          return;
        }
      }

      // Note: we deliberately do NOT write to localStorage anymore.
      // AuthContext is the single source of truth — it already loaded
      // the same data via onAuthStateChanged.

      toast(`Welcome back, ${userData.name || "user"}!`, "success");
      navigate(role === "superadmin" ? "/sa" : "/");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[login]", err);
      toast(
        err?.code === "auth/invalid-credential"
          ? "Invalid email or password"
          : err?.message || "Login failed",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-silver-50 p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white rounded-2xl border border-silver-200 shadow-card p-8"
      >
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">💎</div>
          <h1 className="text-xl font-bold text-navy-900">SKKL Jewellers</h1>
          <p className="text-sm text-silver-500 mt-1">Sign in to your shop</p>
        </div>

        <label className="label">Email</label>
        <input
          type="email"
          className="input mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@shop.com"
          autoComplete="username"
          autoFocus
        />

        <label className="label">Password</label>
        <input
          type="password"
          className="input mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary w-full"
        >
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
