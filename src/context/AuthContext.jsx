// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase"; 
// ⚠️ jo tari firebase.js bija path par hoy to aa import path badle

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authUser, setAuthUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthUser(null);
        setUserData(null);
        setShopData(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setAuthUser(user);

      // 1. Pehla check kar — superadmin che?
      const superSnap = await getDoc(doc(db, "superadmins", user.uid));
      if (superSnap.exists()) {
        setUserData({ id: user.uid, ...superSnap.data() });
        setRole("superadmin");
        setShopData(null);
        setLoading(false);
        return;
      }

      // 2. Nai to regular user (admin or staff)
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) {
        const u = { id: user.uid, ...userSnap.data() };
        setUserData(u);
        setRole(u.role);

        // Shop no data pan load kar
        if (u.shopId) {
          const shopSnap = await getDoc(doc(db, "shops", u.shopId));
          if (shopSnap.exists()) {
            setShopData({ id: shopSnap.id, ...shopSnap.data() });
          }
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const login = (email, password) => 
    signInWithEmailAndPassword(auth, email, password);
  
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider
      value={{ 
        authUser, 
        userData, 
        shopData, 
        role, 
        loading, 
        login, 
        logout 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);   