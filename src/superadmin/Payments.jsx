// src/superadmin/Payments.js
import { useState } from "react";
import { db } from "@fb/client";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "../hooks/useToast";

export default function Payments() {
  const { toast } = useToast();
  const [shopId, setShopId] = useState("");
  const [amount, setAmount] = useState("");
  const [planId, setPlanId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handlePay = async () => {
    if (!shopId || !amount) { toast("Shop ID and amount are required", "warn"); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "payments"), {
        shopId: shopId.trim(),
        amount: Number(amount),
        planId: planId.trim() || null,
        type: "plan",
        date: serverTimestamp(),
      });
      toast("Payment recorded", "success");
      setShopId(""); setAmount(""); setPlanId("");
    } catch (err) {
      toast(err?.message || "Failed to add payment", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    padding: "10px 12px", borderRadius: 8, border: "1px solid #333",
    background: "#1a1a1a", color: "#fff", fontSize: 14,
    width: "100%", marginBottom: 14,
  };

  return (
    <div style={{ maxWidth: 480, color: "#fff" }}>
      <h2 style={{ marginBottom: 8 }}>💳 Add Payment</h2>
      <p style={{ color: "#aaa", fontSize: 13, marginBottom: 24 }}>
        Record a plan/subscription payment for a shop.
      </p>
      <input style={inputStyle} placeholder="Shop ID" value={shopId} onChange={(e) => setShopId(e.target.value)} />
      <input style={inputStyle} placeholder="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input style={inputStyle} placeholder="Plan ID (optional)" value={planId} onChange={(e) => setPlanId(e.target.value)} />
      <button onClick={handlePay} disabled={submitting}
        style={{
          padding: "10px 20px", background: "#00c853", color: "#fff",
          border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}>
        {submitting ? "Saving…" : "Save Payment"}
      </button>
    </div>
  );
}
