import { useState } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function CreateShop() {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleCreate = async () => {
    try {
      // 🔐 Create Auth user
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const uid = userCred.user.uid;
      const shopId = "shop_" + Date.now();

      // 🏪 Shop entry
      await setDoc(doc(db, "shops", shopId), {
        name: shopName,
        ownerId: uid,
        plan: "trial",
        status: "active",

        trial: {
          isTrial: true,
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      // 👤 User entry
      await setDoc(doc(db, "users", uid), {
        name: ownerName,
        email,
        role: "admin",
        shopId
      });

      alert("Shop Created ✅");

    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h2>Create Shop</h2>

      <input placeholder="Shop Name" onChange={(e) => setShopName(e.target.value)} /><br /><br />
      <input placeholder="Owner Name" onChange={(e) => setOwnerName(e.target.value)} /><br /><br />
      <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} /><br /><br />
      <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} /><br /><br />

      <button onClick={handleCreate}>Create</button>
    </div>
  );
}