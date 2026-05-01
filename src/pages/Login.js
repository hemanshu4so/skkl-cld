import { useState } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { checkShopAccess } from "../utils/checkAccess"; // 🔥 IMPORTANT

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      // 🔐 Firebase Auth Login
      const userCred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const uid = userCred.user.uid;

      // 🔍 Check USERS collection
      let userRef = doc(db, "users", uid);
      let snap = await getDoc(userRef);

      let role = "user";
      let userData = null;

      // 🔍 If not found → check SUPERADMIN
      if (!snap.exists()) {
        userRef = doc(db, "superadmins", uid);
        snap = await getDoc(userRef);

        if (!snap.exists()) {
          alert("User data not found ❌");
          return;
        }

        role = "superadmin";
        userData = snap.data();
      } else {
        userData = snap.data();
        role = userData.role || "user";
      }

      console.log("LOGIN USER:", userData);

      // 🔥 CHECK SHOP ACCESS (ONLY FOR NON-SUPERADMIN)
      if (role !== "superadmin" && userData.shopId) {
        const access = await checkShopAccess(userData.shopId);

        if (!access.allowed) {
          navigate("/renew");
          return;
        }
      }

      // ✅ SAFE STORE (no password)
      localStorage.setItem(
        "user",
        JSON.stringify({
          uid: uid,
          name: userData.name || "",
          role: role,
          shopId: userData.shopId || null
        })
      );

      // 🚀 ROLE BASED ROUTING
      if (role === "superadmin") {
        navigate("/sa");
      } else {
        navigate("/");
      }

    } catch (err) {
      console.error(err);
      alert("Invalid email or password ❌");
    }
  };

  return (
    <div style={{ padding: "100px" }}>
      <h2>Login</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br /><br />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <br /><br />

      <button onClick={handleLogin}>Login</button>
    </div>
  );
}