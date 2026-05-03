// src/layout/MainLayout.js
import { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import LockScreen from "./LockScreen";
import NotificationBell from "./NotificationBell";

// Auto-lock after this much idle time. 60s was too aggressive; 5 min is the
// industry-standard for in-store POS.
const IDLE_LOCK_MS = 5 * 60 * 1000;

export default function MainLayout() {
  const [locked, setLocked] = useState(localStorage.getItem("locked") === "true");
  const timerRef = useRef(null);

  useEffect(() => {
    if (locked) return;

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
  }, [locked]);

  const handleUnlock = () => {
    setLocked(false);
    localStorage.setItem("locked", "false");
  };

  if (locked) return <LockScreen onUnlock={handleUnlock} />;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <NotificationBell />
      <div style={{ flex: 1, padding: 20 }}>
        <Outlet />
      </div>
    </div>
  );
}
