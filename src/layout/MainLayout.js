import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import LockScreen from "./LockScreen";

export default function MainLayout() {
  // 🔒 Load lock state from localStorage
  const [locked, setLocked] = useState(
    localStorage.getItem("locked") === "true"
  );

  useEffect(() => {
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setLocked(true);
        localStorage.setItem("locked", "true"); // 🔥 SAVE LOCK
      }, 60000); // 1 min
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);

    resetTimer();

    return () => {
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, []);

  // 🔓 Unlock function
  const handleUnlock = () => {
    setLocked(false);
    localStorage.setItem("locked", "false"); // 🔥 REMOVE LOCK
  };

  // 🔒 Lock screen show
  if (locked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: "20px" }}>
        <Outlet />
      </div>
    </div>
  );
}