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
  const [liveRates, setLiveRates] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [liveError, setLiveError] = useState("");

  const fetchLive = async () => {
    setFetching(true); setLiveError("");
    try {
      // Free spot-price API (open.er-api.com gives currency rates only; metals.live
      // and goldapi.io require keys). We use a public endpoint that returns
      // goldprice.org's spot data via a CORS-friendly proxy.
      const ozGoldUSDApiCandidates = [
        "https://data-asg.goldprice.org/dbXRates/USD",
        "https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz",
      ];
      // Currency rate USD → INR (Free, no key)
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!fxRes.ok) throw new Error("FX API unavailable");
      const fx = await fxRes.json();
      const usdInr = fx?.rates?.INR;
      if (!usdInr) throw new Error("Could not read USD/INR rate");

      let goldUsdPerOz = null, silverUsdPerOz = null, source = "goldprice.org";
      for (const url of ozGoldUSDApiCandidates) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const j = await r.json();
          if (j?.items?.[0]) {
            goldUsdPerOz = j.items[0].xauPrice;
            silverUsdPerOz = j.items[0].xagPrice;
            source = "goldprice.org";
            break;
          }
          if (j?.metals?.gold) {
            goldUsdPerOz = j.metals.gold;
            silverUsdPerOz = j.metals.silver;
            source = "metals.dev";
            break;
          }
        } catch { /* try next */ }
      }
      if (!goldUsdPerOz) throw new Error("Live spot price unreachable");

      // 1 troy oz = 31.1035 g
      const TROY_OZ_G = 31.1035;
      const gold24kInrPerG = (goldUsdPerOz * usdInr) / TROY_OZ_G;
      // Indian retail typically quotes 22K (×0.916) per 10g
      const gold22kPer10g = Math.round(gold24kInrPerG * 0.916 * 10);
      const silverInrPerKg = Math.round((silverUsdPerOz * usdInr / TROY_OZ_G) * 1000);

      setLiveRates({
        gold: gold22kPer10g,
        silver: silverInrPerKg,
        usdInr,
        source,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      setLiveError(err.message + " — manual entry still works as fallback.");
    } finally { setFetching(false); }
  };

  const applyLive = () => {
    if (!liveRates) return;
    setGoldRate(String(liveRates.gold));
    setSilverRate(String(liveRates.silver));
    toast("Live rates pre-filled — review and Save to apply.", "info");
  };


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


      {/* ── Fetch Live (optional) ── */}
      <div style={{
        background: "#F0F7FF", border: "1.5px solid #2962FF40",
        borderRadius: 14, padding: "14px 16px", marginBottom: 18,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ fontSize: 14, color: "#1565C0" }}>📡 Fetch Live Reference Rates</strong>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
              Pulls international spot prices and converts to INR per 10g (gold) and per kg (silver).
              These are <strong>reference</strong> rates — your shop's selling rate may differ.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchLive} disabled={fetching}
              style={{
                padding: "8px 14px", background: "#2962FF", color: "#fff",
                border: "none", borderRadius: 8, cursor: fetching ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 600,
              }}>
              {fetching ? "Fetching…" : "🔄 Fetch Now"}
            </button>
            {liveRates && (
              <button onClick={applyLive} className="btn btn-secondary">
                Use as my rates
              </button>
            )}
          </div>
        </div>
        {liveRates && (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontSize: 12 }}>
            <div style={{ padding: 8, background: "#fff", borderRadius: 6 }}>
              <div style={{ color: "#888" }}>Live Gold (22K, 10g)</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>₹{Number(liveRates.gold).toLocaleString("en-IN")}</div>
              <div style={{ fontSize: 11, color: "#555" }}>
                Yours: ₹{Number(currentRates?.goldRate || 0).toLocaleString("en-IN")}
                {currentRates?.goldRate && (() => {
                  const diff = Number(liveRates.gold) - Number(currentRates.goldRate);
                  const pct = (diff / Number(currentRates.goldRate)) * 100;
                  return <span style={{ color: diff >= 0 ? "#1B5E20" : "#C62828", marginLeft: 6 }}>
                    ({diff >= 0 ? "+" : ""}{Math.round(diff)} / {pct.toFixed(2)}%)
                  </span>;
                })()}
              </div>
            </div>
            <div style={{ padding: 8, background: "#fff", borderRadius: 6 }}>
              <div style={{ color: "#888" }}>Live Silver (1kg)</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>₹{Number(liveRates.silver).toLocaleString("en-IN")}</div>
              <div style={{ fontSize: 11, color: "#555" }}>
                Yours: ₹{Number(currentRates?.silverRate || 0).toLocaleString("en-IN")}
              </div>
            </div>
            <div style={{ padding: 8, background: "#fff", borderRadius: 6, fontSize: 11, color: "#888" }}>
              Source: {liveRates.source}<br />Fetched at: {new Date(liveRates.fetchedAt).toLocaleTimeString("en-IN")}
            </div>
          </div>
        )}
        {liveError && (
          <div style={{ marginTop: 10, padding: 8, background: "#FFEBEE", color: "#C62828", borderRadius: 6, fontSize: 12 }}>
            ⚠️ {liveError}
          </div>
        )}
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
