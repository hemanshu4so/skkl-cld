// src/superadmin/EditShop.js
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { db } from "@fb/client";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "../hooks/useToast";

export default function EditShop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("active");
  const [plan, setPlan] = useState("trial");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", id));
        if (cancelled) return;
        if (snap.exists()) {
          const d = snap.data();
          setName(d.name || "");
          setCity(d.city || "");
          setStatus(d.status || "active");
          setPlan(d.plan || "trial");
        }
      } catch (err) {
        toast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, toast]);

  const handleUpdate = async () => {
    if (!name.trim()) { toast("Shop name is required", "warn"); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "shops", id), {
        name: name.trim(), city: city.trim(), status, plan,
        updatedAt: serverTimestamp(),
      });
      toast("Shop updated", "success");
      navigate("/sa/shops");
    } catch (err) {
      toast(err?.message || "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: "#fff" }}>Loading…</p>;

  const inputStyle = {
    padding: "10px 12px", borderRadius: 8, border: "1px solid #333",
    background: "#1a1a1a", color: "#fff", fontSize: 14,
    width: "100%", marginBottom: 14,
  };

  return (
    <div style={{ color: "#fff", maxWidth: 480 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: "transparent", color: "#aaa", border: "none", cursor: "pointer", marginBottom: 12 }}>
        ⬅ Back
      </button>
      <h2 style={{ marginBottom: 16 }}>Edit Shop</h2>

      <label style={{ color: "#aaa", fontSize: 12 }}>Shop Name</label>
      <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={{ color: "#aaa", fontSize: 12 }}>City</label>
      <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />

      <label style={{ color: "#aaa", fontSize: 12 }}>Plan</label>
      <input style={inputStyle} value={plan} onChange={(e) => setPlan(e.target.value)} />

      <label style={{ color: "#aaa", fontSize: 12 }}>Status</label>
      <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="active">active</option>
        <option value="blocked">blocked</option>
      </select>

      <button onClick={handleUpdate} disabled={saving}
        style={{
          padding: "10px 20px", background: "#2962ff", color: "#fff",
          border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}>
        {saving ? "Updating…" : "Update Shop"}
      </button>
    </div>
  );
}
