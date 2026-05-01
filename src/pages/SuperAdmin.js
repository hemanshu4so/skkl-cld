import { useState } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function SuperAdmin() {
  const [shopName, setShopName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const createShop = async () => {
    try {
      // 🔥 1. Create Shop
      const shopRef = await addDoc(collection(db, "shops"), {
        name: shopName,
        modules: {
          billing: true,
          inventory: true,
          reports: false
        },
        createdAt: new Date()
      });

      const shopId = shopRef.id;

      // 🔥 2. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        adminEmail,
        adminPassword
      );

      const uid = userCredential.user.uid;

      // 🔥 3. Store user in Firestore
      await addDoc(collection(db, "users"), {
        uid: uid,
        name: adminName,
        email: adminEmail,
        role: "admin",
        shopId: shopId,
        pin: "1234",
        createdAt: new Date()
      });

      alert("Shop & Admin Created (Auth + DB) ✅");

      setShopName("");
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");

    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>👑 Super Admin Panel</h2>

      <input placeholder="Shop Name" onChange={(e) => setShopName(e.target.value)} />
      <br /><br />

      <input placeholder="Admin Name" onChange={(e) => setAdminName(e.target.value)} />
      <br /><br />

      <input placeholder="Admin Email" onChange={(e) => setAdminEmail(e.target.value)} />
      <br /><br />

      <input
        type="password"
        placeholder="Admin Password"
        onChange={(e) => setAdminPassword(e.target.value)}
      />
      <br /><br />

      <button onClick={createShop}>Create Shop</button>
    </div>
  );
}