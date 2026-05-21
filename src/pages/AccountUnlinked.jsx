// src/pages/AccountUnlinked.jsx
//
// Shown when AuthContext returns one of:
//   NO_USER_DOC  → no /users/{uid} profile
//   NO_SHOP_ID   → user doc has no shopId
//   NO_SHOP_DOC  → user has shopId but the shop is missing
//
// We deliberately do NOT auto-create a shop or auto-attach the user to one
// — that is a privileged action only the superadmin should perform.
// We give the user a clear message and a sign-out button.

import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";

const MESSAGES = {
  NO_USER_DOC: {
    title: "Account not linked to a shop",
    body:
      "You're signed in to Firebase, but there's no profile in our database " +
      "for your user. Ask the super admin to create your account from the " +
      "Super Admin → Create Shop / Add User panel, then sign in again.",
  },
  NO_SHOP_ID: {
    title: "Your profile is not connected to any shop",
    body:
      "Your user profile exists but the `shopId` field is empty. " +
      "The super admin must edit your /users record and add the correct shopId " +
      "before you can use the system.",
  },
  NO_SHOP_DOC: {
    title: "Your shop has been removed",
    body:
      "We couldn't find a shop with that ID. It may have been deleted by " +
      "the super admin. Please contact support.",
  },
  SHOP_BLOCKED: {
    title: "Your shop is currently blocked",
    body:
      "The super admin has paused access to this shop. Subscription, payment, " +
      "or trial may need attention. Use the Renew screen, or contact support.",
  },
  DEFAULT: {
    title: "Account error",
    body: "Something is wrong with your account. Please sign out and try again.",
  },
};

export default function AccountUnlinked({ code }) {
  const navigate = useNavigate();
  const { logout, authUser } = useAuth();
  const m = MESSAGES[code] || MESSAGES.DEFAULT;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-silver-50 p-6">
      <div className="card p-8 w-full max-w-lg">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-bold text-navy-900 mb-1">{m.title}</h1>
        <p className="text-sm text-silver-600 mb-5">{m.body}</p>

        <div className="bg-silver-50 rounded-lg p-3 text-xs font-mono text-silver-700 mb-5">
          <div>Signed in as: <strong>{authUser?.email || "—"}</strong></div>
          <div>UID: {authUser?.uid || "—"}</div>
          <div>Reason code: <strong>{code || "UNKNOWN"}</strong></div>
        </div>

        <div className="flex gap-2">
          {code === "SHOP_BLOCKED" && (
            <button onClick={() => navigate("/renew")} className="btn btn-primary">
              Open Renew
            </button>
          )}
          <button onClick={handleLogout} className="btn btn-secondary">
            Sign out
          </button>
          <button onClick={() => window.location.reload()} className="btn btn-ghost">
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
