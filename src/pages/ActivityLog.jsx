// src/pages/ActivityLog.jsx
//
// Reads /activityLogs scoped to the current shop. The Phase 1 lib/activityLog.js
// has been writing to this collection since Inventory v2; we now have a real
// audit trail to inspect.
//
// Filters: action (create/update/delete/...), entity (product/sale/...),
// user (createdBy uid), free-text search (matches name + meta.json).
// Append-only — no edit/delete from the UI.

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useDebounced } from "../hooks/useDebounced";
import { formatDate } from "../lib/constants";
import { timeAgo } from "../lib/utils";
import { SkeletonTable } from "../components/ui/Skeleton";

const PAGE_SIZE = 50;

const ACTION_ICONS = {
  create:        "➕",
  update:        "✏️",
  delete:        "🗑️",
  payment:       "💵",
  status_change: "🔄",
  hold:          "⏸️",
  matured:       "🏁",
  bulk_import:   "📥",
};

const ENTITY_LABELS = {
  product: "Product", customer: "Customer", sale: "Sale",
  scheme: "Scheme",  repair: "Repair",   purchase: "Purchase",
  vendor: "Vendor",  vendor_payment: "Vendor Payment",
  karigar: "Karigar", karigarTransaction: "Karigar Txn",
  bullionDealer: "Bullion Dealer", bullionTransaction: "Bullion Txn",
  expense: "Expense", dayBookEntry: "Daybook", accounts: "Accounts",
};

export default function ActivityLog() {
  const { shopId } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [userFilter, setUserFilter]   = useState("all");
  const [search, setSearch]           = useState("");
  const [showCount, setShowCount]     = useState(PAGE_SIZE);

  const debouncedSearch = useDebounced(search, 200);

  const subRef = useRef(null);

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "activityLogs"), where("shopId", "==", shopId)),
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error("[activityLog] snapshot:", err); setLoading(false); }
    );
    subRef.current = u;
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [shopId]);

  const users = useMemo(() => {
    const set = new Set();
    logs.forEach((l) => l.name && set.add(l.name));
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return logs
      .filter((l) => actionFilter === "all" || l.action === actionFilter)
      .filter((l) => entityFilter === "all" || l.entity === entityFilter)
      .filter((l) => userFilter === "all"   || l.name === userFilter)
      .filter((l) => {
        if (!term) return true;
        const blob = (
          l.entity + " " + l.action + " " + (l.name || "") + " " +
          JSON.stringify(l.meta || {}) + " " +
          (l.entityId || "")
        ).toLowerCase();
        return blob.includes(term);
      })
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  }, [logs, actionFilter, entityFilter, userFilter, debouncedSearch]);

  const visible = filtered.slice(0, showCount);

  const actions = useMemo(() => {
    const set = new Set();
    logs.forEach((l) => l.action && set.add(l.action));
    return [...set].sort();
  }, [logs]);

  const entities = useMemo(() => {
    const set = new Set();
    logs.forEach((l) => l.entity && set.add(l.entity));
    return [...set].sort();
  }, [logs]);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>📜 Activity Log</h1>
        <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>
          {logs.length} total · showing {Math.min(visible.length, filtered.length)} of {filtered.length}
        </p>
      </div>

      <div className="card p-4 mb-4">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowCount(PAGE_SIZE); }}
            placeholder="🔍 Search (name, entity id, meta…)"
            className="input"
          />
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setShowCount(PAGE_SIZE); }} className="input bg-white">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setShowCount(PAGE_SIZE); }} className="input bg-white">
            <option value="all">All entities</option>
            {entities.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>)}
          </select>
          <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setShowCount(PAGE_SIZE); }} className="input bg-white">
            <option value="all">All users</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : visible.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center", color: "#bbb" }}>
            No activity matches the current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["When", "Who", "Action", "Entity", "Detail"].map((h) =>
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((l, i) => (
                  <tr key={l.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#666", fontSize: 12 }}>
                      <div>{timeAgo(l.createdAt)}</div>
                      <div style={{ color: "#aaa", fontSize: 10 }}>{formatDate(l.createdAt)}</div>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>
                      {l.name || <span style={{ color: "#aaa" }}>system</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span title={l.action} style={{ fontSize: 16, marginRight: 4 }}>{ACTION_ICONS[l.action] || "•"}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{l.action}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{ENTITY_LABELS[l.entity] || l.entity}</div>
                      {l.entityId && <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>{String(l.entityId).slice(0, 12)}…</div>}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                      <DetailCell entry={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && visible.length < filtered.length && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={() => setShowCount((c) => c + PAGE_SIZE)} className="btn btn-secondary">
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

function DetailCell({ entry }) {
  // Prefer meta — that's the human-friendly summary writers attach.
  const meta = entry.meta || {};
  const friendly = [];
  if (meta.billNo)         friendly.push(`bill ${meta.billNo}`);
  if (meta.jobNo)          friendly.push(`job ${meta.jobNo}`);
  if (meta.grnNo)          friendly.push(`GRN ${meta.grnNo}`);
  if (meta.customerName)   friendly.push(`for ${meta.customerName}`);
  if (meta.vendorName)     friendly.push(`from ${meta.vendorName}`);
  if (meta.karigar || meta.karigarName) friendly.push(`karigar ${meta.karigar || meta.karigarName}`);
  if (meta.from && meta.to) friendly.push(`${meta.from} → ${meta.to}`);
  if (meta.total != null)  friendly.push(`₹${Number(meta.total).toLocaleString("en-IN")}`);
  if (meta.amount != null) friendly.push(`₹${Number(meta.amount).toLocaleString("en-IN")}`);
  if (meta.added != null)  friendly.push(`${meta.added} added`);
  if (meta.failed)         friendly.push(`${meta.failed} failed`);

  return (
    <div>
      {friendly.length > 0 && <div>{friendly.join(" · ")}</div>}
      {Object.keys(meta).length > 0 && (
        <details style={{ fontSize: 10, color: "#aaa" }}>
          <summary style={{ cursor: "pointer" }}>raw</summary>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(meta, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
