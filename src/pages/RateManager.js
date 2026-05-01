import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp, collection, query, where, orderBy, limit, onSnapshot, addDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";

export default function RateManager() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [goldRate, setGoldRate] = useState("");
  const [silverRate, setSilverRate] = useState("");
  const [currentRates, setCurrentRates] = useState(null);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  // Load current rates
  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(doc(db, "rates", shopId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setCurrentRates(d);
        setGoldRate(String(d.goldRate || ""));
        setSilverRate(String(d.silverRate || ""));
      }
    });
    return () => unsub();
  }, [shopId]);

  // Load rate history
  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "rateHistory"),
      where("shopId", "==", shopId),
      orderBy("updatedAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  const handleSave = async () => {
    if (!goldRate || !silverRate) {
      toast("Both rates are required", "warn");
      return;
    }
    setSaving(true);
    try {
      // Save to rates/{shopId}
      await setDoc(doc(db, "rates", shopId), {
        goldRate: Number(goldRate),
        silverRate: Number(silverRate),
        updatedAt: serverTimestamp(),
        updatedBy: userData?.name || "admin"
      });

      // Also save to history
      await addDoc(collection(db, "rateHistory"), {
        shopId,
        goldRate: Number(goldRate),
        silverRate: Number(silverRate),
        updatedAt: serverTimestamp(),
        updatedBy: userData?.name || "admin"
      });

      toast("Rates updated successfully!", "success");
      } catch (err) {
      toast("Error: " + err.message, "error");
    }
    setSaving(false);
  };

  const formatTS = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const inputStyle = {
    width: "100%", padding: "12px 16px", fontSize: "18px",
    border: "1.5px solid #ddd", borderRadius: "10px",
    outline: "none", boxSizing: "border-box",
    fontWeight: "600"
  };

  return (
    <div style={{ padding: "24px", maxWidth: "800px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e", marginBottom: "6px" }}>
        📈 Gold & Silver Rates
      </h1>
      <p style={{ color: "#888", fontSize: "13px", marginBottom: "28px" }}>
        Update today's market rates. These rates will be used automatically in billing.
      </p>

      {/* Rate Cards */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "32px", flexWrap: "wrap" }}>

        {/* Gold */}
        <div style={{
          flex: 1, minWidth: "240px",
          background: "linear-gradient(135deg, #FFF8E1, #FFF3CD)",
          border: "1.5px solid #D4A01740",
          borderRadius: "16px", padding: "24px"
        }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
            <span style={{ fontSize: "28px" }}>🥇</span>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#7D5A0A" }}>Gold Rate</div>
              <div style={{ fontSize: "12px", color: "#9A7B20" }}>per 10 grams (22K)</div>
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
              fontSize: "18px", color: "#9A7B20", fontWeight: "700"
            }}>₹</span>
            <input
              type="number"
              value={goldRate}
              onChange={e => setGoldRate(e.target.value)}
              placeholder="e.g. 65000"
              style={{ ...inputStyle, paddingLeft: "32px", background: "rgba(255,255,255,0.7)" }}
            />
          </div>
          {currentRates?.goldRate && (
            <div style={{ fontSize: "11px", color: "#9A7B20", marginTop: "8px" }}>
              Current: ₹{Number(currentRates.goldRate).toLocaleString("en-IN")}
            </div>
          )}
        </div>

        {/* Silver */}
        <div style={{
          flex: 1, minWidth: "240px",
          background: "linear-gradient(135deg, #F5F5F5, #EEEEEE)",
          border: "1.5px solid #A8A9AD40",
          borderRadius: "16px", padding: "24px"
        }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
            <span style={{ fontSize: "28px" }}>🥈</span>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#555" }}>Silver Rate</div>
              <div style={{ fontSize: "12px", color: "#777" }}>per 1 KG</div>
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
              fontSize: "18px", color: "#777", fontWeight: "700"
            }}>₹</span>
            <input
              type="number"
              value={silverRate}
              onChange={e => setSilverRate(e.target.value)}
              placeholder="e.g. 75000"
              style={{ ...inputStyle, paddingLeft: "32px", background: "rgba(255,255,255,0.8)" }}
            />
          </div>
          {currentRates?.silverRate && (
            <div style={{ fontSize: "11px", color: "#777", marginTop: "8px" }}>
              Current: ₹{Number(currentRates.silverRate).toLocaleString("en-IN")}
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "14px 40px", fontSize: "15px", fontWeight: "700",
          background: saving ? "#ccc" : "linear-gradient(135deg, #D4A017, #F5C842)",
          color: saving ? "#999" : "#5A3E00",
          border: "none", borderRadius: "12px",
          cursor: saving ? "not-allowed" : "pointer",
          boxShadow: saving ? "none" : "0 4px 12px rgba(212,160,23,0.3)",
          transition: "all 0.2s"
        }}
      >
        {saving ? "Saving..." : "💾 Update Rates"}
      </button>

      

      {/* Rate History */}
      {history.length > 0 && (
        <div style={{ marginTop: "36px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#333", marginBottom: "14px" }}>
            📋 Rate History (Last 20 updates)
          </h2>
          <div style={{
            background: "#fff", borderRadius: "12px",
            border: "1px solid #eee", overflow: "hidden"
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Date & Time", "Gold Rate (10g)", "Silver Rate (1kg)", "Updated By"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", fontSize: "11px",
                      color: "#888", textAlign: "left", fontWeight: "600",
                      textTransform: "uppercase"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} style={{
                    borderTop: "1px solid #f5f5f5",
                    background: i === 0 ? "#FFFDE7" : i % 2 === 0 ? "#fff" : "#fafafa"
                  }}>
                    <td style={{ padding: "10px 14px", fontSize: "12px", color: "#555" }}>
                      {i === 0 && <span style={{ fontSize: "10px", color: "#D4A017", fontWeight: "700", marginRight: "6px" }}>LATEST</span>}
                      {formatTS(h.updatedAt)}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "13px", fontWeight: "700", color: "#D4A017" }}>
                      ₹{Number(h.goldRate || 0).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "13px", fontWeight: "700", color: "#777" }}>
                      ₹{Number(h.silverRate || 0).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "12px", color: "#888" }}>
                      {h.updatedBy || "admin"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
