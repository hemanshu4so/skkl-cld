// src/layout/NotificationBell.jsx
//
// Bell icon + dropdown panel mounted in MainLayout's top corner.
// Shows unread count, lists 20 most recent for the current shop+user.

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@fb/client";
import { useAuth } from "@app/providers/AuthProvider";
import { markRead } from "../services/notifications";
import { timeAgo } from "../lib/utils";

const KIND_COLOR = {
  success: { bg: "#E8F5E9", fg: "#1B5E20" },
  warn:    { bg: "#FFF3E0", fg: "#E65100" },
  info:    { bg: "#E3F2FD", fg: "#1565C0" },
  system:  { bg: "#F5F5F5", fg: "#555"   },
};

export default function NotificationBell() {
  const { shopId, userData } = useAuth();
  const uid = userData?.id || null;
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const subRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "notifications"), where("shopId", "==", shopId)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[notifications] snapshot:", err.message)
    );
    subRef.current = u;
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [shopId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const visible = useMemo(
    () => items
      .filter((n) => !n.uid || n.uid === uid)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
    [items, uid]
  );
  const unread = visible.filter((n) => !n.read).length;

  return (
    <div ref={panelRef} style={{ position: "fixed", top: 14, right: 16, zIndex: 50 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        style={{
          position: "relative", width: 38, height: 38, borderRadius: "50%",
          border: "1px solid #ddd", background: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
        }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#E53935", color: "#fff",
            borderRadius: 10, padding: "2px 6px",
            fontSize: 10, fontWeight: 700, minWidth: 18,
          }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 46, right: 0, width: 360,
          background: "#fff", borderRadius: 12, border: "1px solid #eee",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
          maxHeight: "70vh", display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            <span style={{ fontSize: 11, color: "#888" }}>{unread} unread · {visible.length} total</span>
          </div>
          <div style={{ overflowY: "auto" }}>
            {visible.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#bbb", fontSize: 13 }}>
                No notifications
              </div>
            ) : visible.slice(0, 30).map((n) => {
              const c = KIND_COLOR[n.kind] || KIND_COLOR.info;
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.link) { setOpen(false); navigate(n.link); }
                  }}
                  style={{
                    padding: "10px 14px", borderBottom: "1px solid #f5f5f5",
                    cursor: n.link ? "pointer" : "default",
                    background: n.read ? "#fff" : "#FFFDE7",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e" }}>{n.title}</div>
                    <span style={{ fontSize: 9, color: c.fg, background: c.bg, borderRadius: 10, padding: "2px 6px", fontWeight: 700, textTransform: "uppercase" }}>{n.kind || "info"}</span>
                  </div>
                  {n.body && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
