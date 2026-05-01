// src/pages/ShopSettings.js
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";

const EMPTY = {
  name: "", address: "", phone: "", email: "",
  gst: "", bankName: "", accountNo: "", ifsc: "",
};

export default function ShopSettings() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [company, setCompany] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shopId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", shopId));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          setCompany({ ...EMPTY, ...(data.company || {}) });
        }
      } catch (err) {
        toast("Failed to load shop settings: " + err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId, toast]);

  const save = async () => {
    if (!shopId) {
      toast("No shop attached to your account", "error");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "shops", shopId), {
        company,
        updatedAt: serverTimestamp(),
      });
      toast("Settings saved", "success");
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, type = "text", placeholder = "") => (
    <div className="flex flex-col">
      <label className="label">{label}</label>
      <input
        type={type}
        className="input"
        value={company[key] || ""}
        placeholder={placeholder}
        onChange={(e) => setCompany((c) => ({ ...c, [key]: e.target.value }))}
      />
    </div>
  );

  if (loading) return <div className="p-6 text-silver-500">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-navy-900 mb-1">🏢 Company Settings</h1>
      <p className="text-sm text-silver-500 mb-6">
        These details appear on bills, invoices, and reports.
      </p>

      <div className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {field("Company Name", "name", "text", "SKKL Jewellers")}
        {field("Phone", "phone", "tel", "+91 …")}
        {field("Email", "email", "email")}
        {field("GST Number", "gst", "text", "27ABCDE1234F1Z5")}
        <div className="md:col-span-2">{field("Address", "address")}</div>

        <div className="md:col-span-2 mt-4 mb-2">
          <h2 className="text-sm font-bold text-navy-900">Bank Details</h2>
        </div>
        {field("Bank Name", "bankName")}
        {field("Account Number", "accountNo")}
        {field("IFSC Code", "ifsc")}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="btn btn-primary mt-6"
      >
        {saving ? "Saving…" : "💾 Save Settings"}
      </button>
    </div>
  );
}
