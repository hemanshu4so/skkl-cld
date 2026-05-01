// src/superadmin/Plans.js
// Reads /plans. Previously crashed if a plan was missing the `limits` field.
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "plans"));
        if (cancelled) return;
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p style={{ color: "#fff" }}>Loading…</p>;

  return (
    <div style={{ color: "#fff" }}>
      <h2>📋 Plans</h2>
      {error && (
        <div style={{ padding: 12, background: "#3b1212", borderRadius: 8, marginBottom: 12, color: "#ff8a8a" }}>
          {error}
        </div>
      )}
      {plans.length === 0 ? (
        <div style={{ marginTop: 20, padding: 16, background: "#1a1a1a", borderRadius: 10, color: "#aaa" }}>
          No plans yet. Create plan documents in the Firestore console under <code>/plans</code>:
          <pre style={{ background: "#000", padding: 12, borderRadius: 6, marginTop: 10, fontSize: 12 }}>{`{
  "name": "Pro",
  "price": 999,
  "period": "month",
  "limits": { "users": 5, "products": 1000 }
}`}</pre>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {plans.map((p) => (
            <div key={p.id} style={{ background: "#111", color: "#fff", padding: 18, borderRadius: 10, border: "1px solid #222" }}>
              <h3 style={{ margin: 0 }}>{p.name || "(unnamed)"}</h3>
              <p style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                ₹{Number(p.price || 0).toLocaleString("en-IN")}
                <span style={{ fontSize: 12, color: "#aaa", fontWeight: 400 }}> /{p.period || "month"}</span>
              </p>
              <p style={{ color: "#aaa", fontSize: 13 }}>
                Users: {p.limits?.users ?? "—"}<br />
                Products: {p.limits?.products ?? "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
