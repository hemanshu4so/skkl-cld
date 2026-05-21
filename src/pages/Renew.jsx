// src/pages/Renew.js
//
// Shown when checkShopAccess() returns { allowed: false } — i.e. the shop is
// in trial-expired, subscription-expired, or manually-blocked state.
// Previously this was a one-line placeholder; blocked users had no exit path.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "@fb/client";
import { useAuth } from "@app/providers/AuthProvider";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Renew() {
  const navigate = useNavigate();
  const { authUser, userData, loading } = useAuth();

  const [shop, setShop] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loadingShop, setLoadingShop] = useState(true);

  useEffect(() => {
    if (loading) return;

    // If somehow not signed in, send them to login
    if (!authUser) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (userData?.shopId) {
          const snap = await getDoc(doc(db, "shops", userData.shopId));
          if (!cancelled && snap.exists()) {
            setShop({ id: snap.id, ...snap.data() });
          }
        }
        const snap = await getDocs(query(collection(db, "plans"), orderBy("price", "asc")));
        if (!cancelled) {
          setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch {
        // ignore — page still works without plans list
      } finally {
        if (!cancelled) setLoadingShop(false);
      }
    })();

    return () => { cancelled = true; };
  }, [loading, authUser, userData, navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  // Build a human reason for why access is blocked
  const reason = (() => {
    if (!shop) return "Your shop is not currently active.";
    if (shop.status === "blocked") return "Your shop has been manually deactivated by the administrator.";
    if (shop.trial?.isTrial) {
      const end = shop.trial.endDate?.toDate ? shop.trial.endDate.toDate() : null;
      if (end && end < new Date()) {
        return `Your free trial ended on ${fmtDate(shop.trial.endDate)}.`;
      }
    }
    if (shop.subscription?.endDate) {
      const end = shop.subscription.endDate.toDate ? shop.subscription.endDate.toDate() : null;
      if (end && end < new Date()) {
        return `Your subscription expired on ${fmtDate(shop.subscription.endDate)}.`;
      }
    }
    return "Your shop access has been paused.";
  })();

  if (loading || loadingShop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-silver-50">
        <div className="text-silver-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-silver-50 p-6 flex items-start justify-center">
      <div className="w-full max-w-2xl mt-12">
        <div className="card p-8">
          <div className="text-4xl mb-3">⏳</div>
          <h1 className="text-xl font-bold text-navy-900 mb-1">
            Renew your subscription to continue
          </h1>
          <p className="text-sm text-silver-600 mb-6">{reason}</p>

          {shop && (
            <div className="bg-silver-50 rounded-xl p-4 mb-6 text-sm">
              <div><span className="text-silver-500">Shop:</span> <strong>{shop.name}</strong></div>
              <div><span className="text-silver-500">Plan:</span> {shop.plan || "—"}</div>
              <div><span className="text-silver-500">Status:</span> {shop.status || "—"}</div>
              {shop.trial?.endDate && (
                <div><span className="text-silver-500">Trial ended:</span> {fmtDate(shop.trial.endDate)}</div>
              )}
              {shop.subscription?.endDate && (
                <div><span className="text-silver-500">Subscription ended:</span> {fmtDate(shop.subscription.endDate)}</div>
              )}
            </div>
          )}

          {plans.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-navy-900 mb-3">Available Plans</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {plans.map((p) => (
                  <div key={p.id} className="border border-silver-200 rounded-xl p-4">
                    <div className="font-bold text-navy-900">{p.name}</div>
                    <div className="text-2xl font-bold text-gold-700 my-1">
                      ₹{Number(p.price || 0).toLocaleString("en-IN")}
                      <span className="text-xs text-silver-500 font-normal"> /{p.period || "month"}</span>
                    </div>
                    {p.limits?.users != null && (
                      <div className="text-xs text-silver-600">Users: {p.limits.users}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="bg-gold-50 border border-gold-300 rounded-xl p-4 mb-6">
            <div className="text-sm font-semibold text-gold-900 mb-1">
              How to renew
            </div>
            <p className="text-sm text-silver-700">
              Please contact your account administrator to extend your subscription.
              They can update the plan/end-date from the Super Admin panel and you'll
              regain access immediately on next sign-in.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleLogout} className="btn btn-secondary">
              Sign out
            </button>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              I've renewed — try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
