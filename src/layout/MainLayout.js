// src/layout/MainLayout.js
import { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import LockScreen from "./LockScreen";
import NotificationBell from "./NotificationBell";
import { useAuth } from "../context/AuthContext";

// Auto-lock after this much idle time. 60s was too aggressive; 5 min is the
// industry-standard for in-store POS.
const IDLE_LOCK_MS = 5 * 60 * 1000;

export default function MainLayout() {
  const { shopData } = useAuth();
  const lockEnabled = shopData?.pinLockEnabled !== false;
  const [locked, setLocked] = useState(lockEnabled && localStorage.getItem("locked") === "true");
  const timerRef = useRef(null);

  useEffect(() => {
    if (locked || !lockEnabled) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setLocked(true);
        localStorage.setItem("locked", "true");
      }, IDLE_LOCK_MS);
    };

    const evts = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evts.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      evts.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [locked, lockEnabled]);

  const handleUnlock = () => {
    setLocked(false);
    localStorage.setItem("locked", "false");
  };

  if (locked && lockEnabled) return <LockScreen onUnlock={handleUnlock} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <NotificationBell />
      <div className="skkl-main" style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          padding: 20,
          // top breathing room on mobile so the hamburger doesn't overlap
        }}>
          <style>{`
            @media (max-width: 768px) {
              .skkl-main > div { padding: 60px 12px 16px !important; }
            }
            @media (max-width: 768px) {
              table { font-size: 12px !important; }
            }
            .skkl-table-wrap { overflow-x: auto; }
          `}</style>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
