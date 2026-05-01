import { useState } from "react";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";

export default function Payments() {
  const [shopId, setShopId] = useState("");
  const [amount, setAmount] = useState("");

  const handlePay = async () => {
    await addDoc(collection(db, "payments"), {
      shopId,
      amount: Number(amount),
      date: new Date(),
      type: "plan"
    });

    alert("Payment Added ✅");
  };

  return (
    <div>
      <h2>Add Payment</h2>

      <input placeholder="Shop ID" onChange={e => setShopId(e.target.value)} /><br /><br />
      <input placeholder="Amount" onChange={e => setAmount(e.target.value)} /><br /><br />

      <button onClick={handlePay}>Save Payment</button>
    </div>
  );
}