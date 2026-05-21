// src/layout/LockScreen.js
import { useState, useEffect, useCallback } from "react";
import { auth, db } from "@fb/client";
import { doc, getDoc } from "firebase/firestore";
import { verifyPin } from "@shared/pin";

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkPin = useCallback(async (value) => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) { setError("Session expired ❌"); return; }
      const uid = user.uid;

      let collection = "users";
      let snap = await getDoc(doc(db, collection, uid));
      if (!snap.exists()) {
        collection = "superadmins";
        snap = await getDoc(doc(db, collection, uid));
        if (!snap.exists()) { setError("User not found ❌"); return; }
      }

      const ok = await verifyPin({ collection, uid, pin: value, docData: snap.data() });
      if (ok) {
        setError("");
        onUnlock();
      } else {
        setError("Wrong PIN ❌");
        setPin("");
        const box = document.getElementById("lock-box");
        if (box) {
          box.style.animation = "shake 0.3s";
          setTimeout(() => (box.style.animation = ""), 300);
        }
      }
    } catch (err) {
      console.error("[lock]", err);
      setError("Error checking PIN ❌");
    } finally {
      setLoading(false);
    }
  }, [onUnlock]);

  useEffect(() => {
    if (pin.length === 4) checkPin(pin);
  }, [pin, checkPin]);

  return (
    <>
      <div style={styles.overlay}>
        <div id="lock-box" style={styles.box}>
          <h2>🔒 Locked</h2>
          <p style={{ color: "#aaa" }}>Enter your 4-digit PIN</p>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            autoFocus
            disabled={loading}
            onChange={(e) => {
              setError("");
              setPin(e.target.value.replace(/\D/g, ""));
            }}
            style={styles.input}
          />
          {loading && <p style={{ color: "#888" }}>Checking…</p>}
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      </div>
      <style>{`
        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.6)",
    display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999,
  },
  box: { background: "#111", padding: 30, borderRadius: 12, textAlign: "center", width: 300, color: "#fff" },
  input: {
    marginTop: 15, padding: 12, fontSize: 22, textAlign: "center", letterSpacing: 12,
    width: "100%", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#fff",
  },
};
