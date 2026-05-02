// src/context/AuthContext.jsx
//
// Single source of truth for auth + tenancy. Root-fix for the
// "shopId is undefined" class of bugs:
//
//   1. We DON'T flip `loading` to false until we have a confirmed answer
//      (signed-out, or signed-in WITH a fully-resolved profile + shop).
//   2. When the answer is "signed-in but profile is broken" we surface a
//      precise `error` code so the UI can show a recovery screen instead
//      of letting pages render with an undefined shopId.
//   3. /users/{uid} and /shops/{shopId} are watched with onSnapshot, so
//      role/permission/shop changes propagate live (no need to reload).

import { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { onSnapshot, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// Possible error codes when an account is signed-in but unusable for the shop app:
//   "NO_USER_DOC"   — there is no /users/{uid} doc (and not a superadmin)
//   "NO_SHOP_ID"    — user doc exists but has no shopId field
//   "NO_SHOP_DOC"   — user has shopId but /shops/{shopId} is missing/deleted
//   "SHOP_BLOCKED"  — shop exists but status === "blocked" (renew flow)
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [authUser, setAuthUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [role,     setRole]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Hold inner subscription disposers so we can clean them up across auth changes
  const userUnsubRef = useRef(null);
  const shopUnsubRef = useRef(null);

  useEffect(() => {
    const cleanupInner = () => {
      if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
      if (shopUnsubRef.current) { shopUnsubRef.current(); shopUnsubRef.current = null; }
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      cleanupInner();

      // ── Signed out ────────────────────────────────────────────────
      if (!fbUser) {
        setAuthUser(null);
        setUserData(null);
        setShopData(null);
        setRole(null);
        setError(null);
        setLoading(false);
        return;
      }

      // ── Signed in: resolve identity, then attach live listeners ───
      setAuthUser(fbUser);
      setError(null);
      setLoading(true);

      // Step 1: superadmin?
      try {
        const superSnap = await getDoc(doc(db, "superadmins", fbUser.uid));
        if (superSnap.exists()) {
          setUserData({ id: fbUser.uid, ...superSnap.data() });
          setRole("superadmin");
          setShopData(null);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("[auth] superadmin lookup failed:", err);
      }

      // Step 2: regular user — live-watch /users/{uid}
      userUnsubRef.current = onSnapshot(
        doc(db, "users", fbUser.uid),
        (snap) => {
          if (!snap.exists()) {
            // user is authenticated in Firebase Auth, but has no Firestore
            // profile — common cause: shop wasn't fully provisioned, or
            // they're trying to use credentials from a different tenant.
            setUserData(null);
            setRole(null);
            setShopData(null);
            setError("NO_USER_DOC");
            setLoading(false);
            console.error(
              "[auth] No /users/" + fbUser.uid + " doc. Account is not " +
              "linked to any shop. Sign out and contact your administrator."
            );
            return;
          }

          const u = { id: snap.id, ...snap.data() };
          setUserData(u);
          setRole(u.role || "user");

          // Step 3: live-watch /shops/{shopId}
          if (!u.shopId) {
            setShopData(null);
            setError("NO_SHOP_ID");
            setLoading(false);
            console.error(
              "[auth] User doc has no shopId field. Account is not " +
              "linked to any shop. Contact your administrator."
            );
            return;
          }

          // Detach old shop listener (in case shopId changed)
          if (shopUnsubRef.current) { shopUnsubRef.current(); shopUnsubRef.current = null; }

          shopUnsubRef.current = onSnapshot(
            doc(db, "shops", u.shopId),
            (shopSnap) => {
              if (!shopSnap.exists()) {
                setShopData(null);
                setError("NO_SHOP_DOC");
                setLoading(false);
                console.error("[auth] /shops/" + u.shopId + " is missing.");
                return;
              }
              const s = { id: shopSnap.id, ...shopSnap.data() };
              setShopData(s);
              if (s.status === "blocked") setError("SHOP_BLOCKED");
              else setError(null);
              setLoading(false);
            },
            (err) => {
              console.error("[auth] shop snapshot error:", err);
              setError("NO_SHOP_DOC");
              setLoading(false);
            }
          );
        },
        (err) => {
          console.error("[auth] user snapshot error:", err);
          setError("NO_USER_DOC");
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      cleanupInner();
    };
  }, []);

  const login  = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
  const logout = () => signOut(auth);

  // A simple convenience: ready === we know the answer for sure
  const ready = !loading;

  // Strict shopId — guaranteed string when no error, else null
  const shopId =
    role === "superadmin"
      ? null
      : (userData && typeof userData.shopId === "string" && userData.shopId.length > 0)
        ? userData.shopId
        : null;

  return (
    <AuthContext.Provider
      value={{
        authUser,
        userData,
        shopData,
        role,
        loading,
        ready,
        error,            // null | "NO_USER_DOC" | "NO_SHOP_ID" | "NO_SHOP_DOC" | "SHOP_BLOCKED"
        shopId,           // canonical shopId; falsy iff superadmin or error state
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
