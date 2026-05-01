import { useState, useEffect, useCallback } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkPin = useCallback(async (value) => {
    try {
      setLoading(true);

      const user = auth.currentUser;

      if (!user) {
        setError("Session expired ❌");
        return;
      }

      const uid = user.uid;

      // 🔍 Check in users
      let userRef = doc(db, "users", uid);
      let snap = await getDoc(userRef);

      // 🔍 If not → check superadmins
      if (!snap.exists()) {
        userRef = doc(db, "superadmins", uid);
        snap = await getDoc(userRef);

        if (!snap.exists()) {
          setError("User not found ❌");
          return;
        }
      }

      const data = snap.data();

      console.log("Entered PIN:", value);
      console.log("DB PIN:", data.pin);

      if (String(value) === String(data.pin)) {
        setError("");
        onUnlock();
      } else {
        setError("Wrong PIN ❌");
        setPin("");

        // 🔥 shake
        const box = document.getElementById("lock-box");
        if (box) {
          box.style.animation = "shake 0.3s";
          setTimeout(() => (box.style.animation = ""), 300);
        }
      }

    } catch (err) {
      console.error(err);
      setError("Error checking PIN ❌");
    } finally {
      setLoading(false);
    }
  }, [onUnlock]);

  useEffect(() => {
    if (pin.length === 4) {
      checkPin(pin);
    }
  }, [pin, checkPin]);

  return (
    <>
      <div style={styles.overlay}>
        <div id="lock-box" style={styles.box}>
          <h2>🔒 Locked</h2>
          <p style={{ color: "#aaa" }}>Enter your 4-digit PIN</p>

          <input
            type="password"
            maxLength={4}
            value={pin}
            autoFocus
            disabled={loading}
            onChange={(e) => {
              setError("");
              setPin(e.target.value);
            }}
            style={styles.input}
          />

          {loading && <p style={{ color: "#888" }}>Checking...</p>}

          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      </div>

      <style>
        {`
        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
          100% { transform: translateX(0); }
        }
      `}
      </style>
    </>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backdropFilter: "blur(6px)",
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  box: {
    background: "#111",
    padding: "30px",
    borderRadius: "12px",
    textAlign: "center",
    width: "300px",
    color: "#fff",
  },
  input: {
    marginTop: "15px",
    padding: "12px",
    fontSize: "22px",
    textAlign: "center",
    letterSpacing: "12px",
    width: "100%",
    borderRadius: "8px",
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#fff",
  },
};