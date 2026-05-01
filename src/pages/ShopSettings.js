import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function ShopSettings() {
  const user = JSON.parse(localStorage.getItem("user"));
  const [loading, setLoading] = useState(true);

  const [company, setCompany] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    gst: "",
    bankName: "",
    accountNo: "",
    ifsc: ""
  });

  // 🔄 LOAD DATA
  useEffect(() => {
  if (!user?.shopId) return;

  const load = async () => {
    const snap = await getDoc(doc(db, "shops", user.shopId));

    if (snap.exists()) {
      const data = snap.data();
      setCompany(data.company || {});
    }

    setLoading(false);
  };

  load();
}, [user?.shopId]);

  // 💾 SAVE DATA
  const save = async () => {
    try {
      await updateDoc(doc(db, "shops", user.shopId), {
        company
      });

      alert("Saved ✅");
    } catch (err) {
      console.error(err);
      alert("Error saving ❌");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: "600px" }}>
      <h2>🏢 Company Settings</h2>

      {/* BASIC */}
      <input
        placeholder="Company Name"
        value={company.name}
        onChange={(e) => setCompany({ ...company, name: e.target.value })}
      /><br /><br />

      <input
        placeholder="Address"
        value={company.address}
        onChange={(e) => setCompany({ ...company, address: e.target.value })}
      /><br /><br />

      <input
        placeholder="Phone"
        value={company.phone}
        onChange={(e) => setCompany({ ...company, phone: e.target.value })}
      /><br /><br />

      <input
        placeholder="Email"
        value={company.email}
        onChange={(e) => setCompany({ ...company, email: e.target.value })}
      /><br /><br />

      {/* GST */}
      <input
        placeholder="GST Number"
        value={company.gst}
        onChange={(e) => setCompany({ ...company, gst: e.target.value })}
      /><br /><br />

      {/* BANK */}
      <input
        placeholder="Bank Name"
        value={company.bankName}
        onChange={(e) => setCompany({ ...company, bankName: e.target.value })}
      /><br /><br />

      <input
        placeholder="Account Number"
        value={company.accountNo}
        onChange={(e) => setCompany({ ...company, accountNo: e.target.value })}
      /><br /><br />

      <input
        placeholder="IFSC Code"
        value={company.ifsc}
        onChange={(e) => setCompany({ ...company, ifsc: e.target.value })}
      /><br /><br />

      <button onClick={save}>💾 Save</button>
    </div>
  );
}