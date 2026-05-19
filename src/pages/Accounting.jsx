// src/pages/Accounting.jsx — Phase 2 Accounting v1
//
// Tabs:
//   1. Chart of Accounts — view & customize standard ledgers
//   2. Daybook           — manual cash/bank entries
//   3. Expenses          — quick expense capture (writes to /expenses)
//   4. P&L Snapshot      — rollup from /sales /purchases /expenses for date range

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../../../firebase";
import {
  collection, addDoc, deleteDoc, onSnapshot, query, where,
  doc, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import { assertShopId, downloadCSV, startOfDay, endOfDay } from "../../../lib/utils";
import { formatINR, DEFAULT_CHART_OF_ACCOUNTS, EXPENSE_CATEGORIES } from "../../../lib/constants";
import { logActivity } from "../../../lib/activityLog";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function Accounting() {
  const { userData, shopId } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("coa");

  const [accounts, setAccounts] = useState([]);
  const [daybook, setDaybook] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const refs = useRef({ accounts: null, daybook: null, expenses: null, sales: null, purchases: null });

  useEffect(() => {
    Object.values(refs.current).forEach((u) => u && u());
    refs.current = { accounts: null, daybook: null, expenses: null, sales: null, purchases: null };
    if (!shopId) return undefined;

    refs.current.accounts = onSnapshot(
      query(collection(db, "accounts"), where("shopId", "==", shopId)),
      (s) => setAccounts(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    refs.current.daybook = onSnapshot(
      query(collection(db, "dayBookEntries"), where("shopId", "==", shopId)),
      (s) => setDaybook(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    refs.current.expenses = onSnapshot(
      query(collection(db, "expenses"), where("shopId", "==", shopId)),
      (s) => setExpenses(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    refs.current.sales = onSnapshot(
      query(collection(db, "sales"), where("shopId", "==", shopId)),
      (s) => setSales(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    refs.current.purchases = onSnapshot(
      query(collection(db, "purchases"), where("shopId", "==", shopId)),
      (s) => setPurchases(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => Object.values(refs.current).forEach((u) => u && u());
  }, [shopId]);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>📒 Accounting</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "coa",      label: "Chart of Accounts" },
            { id: "daybook",  label: "Daybook" },
            { id: "expense",  label: "Expenses" },
            { id: "pnl",      label: "P&L" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                borderColor: tab === t.id ? "#1a1a2e" : "#ddd",
                background: tab === t.id ? "#1a1a2e" : "#fff",
                color: tab === t.id ? "#fff" : "#555",
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "coa"     && <COATab     shopId={shopId} userData={userData} toast={toast} accounts={accounts} />}
      {tab === "daybook" && <DaybookTab shopId={shopId} userData={userData} toast={toast} entries={daybook} accounts={accounts} />}
      {tab === "expense" && <ExpenseTab shopId={shopId} userData={userData} toast={toast} expenses={expenses} />}
      {tab === "pnl"     && <PnLTab    sales={sales} purchases={purchases} expenses={expenses} />}
    </div>
  );
}

// ───── Chart of Accounts ─────
function COATab({ shopId, userData, toast, accounts }) {
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState("");

  const seed = async () => {
    if (!assertShopId(shopId, toast, "Accounting.COATab.seed")) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      DEFAULT_CHART_OF_ACCOUNTS.forEach((acc) => {
        const ref = doc(collection(db, "accounts"));
        batch.set(ref, {
          shopId, ...acc,
          balance: 0,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      await logActivity({ shopId, action: "create", entity: "accounts", uid: userData?.id, name: userData?.name, meta: { seeded: DEFAULT_CHART_OF_ACCOUNTS.length } });
      toast(`Seeded ${DEFAULT_CHART_OF_ACCOUNTS.length} default accounts`, "success");
    } catch (err) {
      toast("Seed failed: " + err.message, "error");
    } finally { setSeeding(false); }
  };

  const handleDelete = async (a) => {
    if (!assertShopId(shopId, toast, "Accounting.COATab.delete")) return;
    if (!window.confirm(`Delete account ${a.name}?`)) return;
    await deleteDoc(doc(db, "accounts", a.id));
  };

  const filtered = accounts
    .filter((a) => !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.code?.includes(search))
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));

  const grouped = filtered.reduce((acc, a) => {
    const key = a.type || "other";
    (acc[key] = acc[key] || []).push(a);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search account"
          style={{ padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, width: 280 }} />
        {accounts.length === 0 && (
          <button onClick={seed} disabled={seeding} className="btn btn-primary">
            {seeding ? "Seeding…" : "🌱 Seed Default Chart"}
          </button>
        )}
      </div>

      {accounts.length === 0
        ? <div className="card p-10" style={{ textAlign: "center", color: "#888" }}>
            <div style={{ marginBottom: 8 }}>No chart of accounts yet</div>
            <div style={{ fontSize: 12 }}>Click 'Seed Default Chart' for a standard 22-account jewellery COA</div>
          </div>
        : Object.entries(grouped).map(([type, list]) => (
          <div key={type} className="card mb-3" style={{ overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#f8f9fa", borderBottom: "1px solid #eee", fontWeight: 700, textTransform: "capitalize" }}>
              {type} ({list.length})
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {list.map((a, i) => (
                  <tr key={a.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", color: "#888", width: 80 }}>{a.code}</td>
                    <td style={{ padding: "8px 14px", fontWeight: 600 }}>{a.name}</td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#666" }}>{a.group || "—"}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600 }}>{formatINR(a.balance)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>
                      <button onClick={() => handleDelete(a)} className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 10 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

// ───── Daybook ─────
function DaybookTab({ shopId, userData, toast, entries, accounts }) {
  const [form, setForm] = useState({
    date: today(),
    debitAccount: "", creditAccount: "",
    amount: "", narration: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!assertShopId(shopId, toast, "Accounting.Daybook.submit")) return;
    if (!form.debitAccount || !form.creditAccount || !form.amount) {
      toast("Fill debit, credit and amount", "warn"); return;
    }
    setSubmitting(true);
    try {
      const data = {
        shopId,
        date: form.date,
        debitAccount: form.debitAccount,
        creditAccount: form.creditAccount,
        amount: Number(form.amount),
        narration: form.narration,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };
      const r = await addDoc(collection(db, "dayBookEntries"), data);
      await logActivity({ shopId, action: "create", entity: "dayBookEntry", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { amount: data.amount } });
      toast("Entry recorded", "success");
      setForm({ date: today(), debitAccount: "", creditAccount: "", amount: "", narration: "" });
    } catch (err) {
      toast(err?.message, "error");
    } finally { setSubmitting(false); }
  };

  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <div className="card p-5 mb-4">
        <h3 style={{ marginTop: 0 }}>Manual Journal Entry</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <div><label className="label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input" /></div>
          <div><label className="label">Debit Account *</label>
            <select value={form.debitAccount} onChange={(e) => setForm((f) => ({ ...f, debitAccount: e.target.value }))} className="input bg-white">
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select></div>
          <div><label className="label">Credit Account *</label>
            <select value={form.creditAccount} onChange={(e) => setForm((f) => ({ ...f, creditAccount: e.target.value }))} className="input bg-white">
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select></div>
          <div><label className="label">Amount (₹) *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input" /></div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label">Narration</label>
            <input value={form.narration} onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))} className="input" placeholder="Description" />
          </div>
        </div>
        <button onClick={submit} disabled={submitting} className="btn btn-primary mt-4">
          {submitting ? "Saving…" : "💾 Record Entry"}
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>
          Daybook Entries ({sorted.length})
        </div>
        {sorted.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No entries yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Date", "Debit", "Credit", "Amount", "Narration"].map((h) =>
                    <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 14px" }}>{e.date}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace" }}>{e.debitAccount}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace" }}>{e.creditAccount}</td>
                    <td style={{ padding: "8px 14px", fontWeight: 700 }}>{formatINR(e.amount)}</td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#555" }}>{e.narration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ───── Expenses ─────
function ExpenseTab({ shopId, userData, toast, expenses }) {
  const [form, setForm] = useState({ date: today(), category: "Rent", amount: "", paidTo: "", mode: "cash", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!assertShopId(shopId, toast, "Accounting.Expense.submit")) return;
    if (!form.amount) { toast("Amount required", "warn"); return; }
    setSubmitting(true);
    try {
      const data = {
        shopId,
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
        paidTo: form.paidTo, mode: form.mode,
        notes: form.notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      };
      const r = await addDoc(collection(db, "expenses"), data);
      await logActivity({ shopId, action: "create", entity: "expense", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { category: data.category, amount: data.amount } });
      toast("Expense recorded", "success");
      setForm({ date: today(), category: "Rent", amount: "", paidTo: "", mode: "cash", notes: "" });
    } catch (err) {
      toast(err?.message, "error");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (e) => {
    if (!assertShopId(shopId, toast, "Accounting.Expense.delete")) return;
    if (!window.confirm("Delete this expense?")) return;
    await deleteDoc(doc(db, "expenses", e.id));
  };

  const sorted = [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const monthTotal = sorted
    .filter((e) => (e.date || "").slice(0, 7) === today().slice(0, 7))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const exportCSV = () => downloadCSV(
    sorted.map((e) => ({ date: e.date, category: e.category, amount: e.amount, paidTo: e.paidTo, mode: e.mode, notes: e.notes })),
    "expenses.csv"
  );

  return (
    <div>
      <div className="card p-5 mb-4">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <div><label className="label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input" /></div>
          <div><label className="label">Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input bg-white">
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className="label">Amount *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input" /></div>
          <div><label className="label">Paid To</label>
            <input value={form.paidTo} onChange={(e) => setForm((f) => ({ ...f, paidTo: e.target.value }))} className="input" placeholder="Vendor / payee" /></div>
          <div><label className="label">Mode</label>
            <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} className="input bg-white">
              {["cash", "upi", "bank", "cheque", "card"].map((m) => <option key={m}>{m}</option>)}
            </select></div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" />
          </div>
        </div>
        <button onClick={submit} disabled={submitting} className="btn btn-primary mt-4">
          {submitting ? "Saving…" : "💾 Save Expense"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Stat label="This month total" value={monthTotal} accent="red" bold />
        <Stat label="Total entries" value={sorted.length} raw />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
          <strong>Recent Expenses</strong>
          <button onClick={exportCSV} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>📥 CSV</button>
        </div>
        {sorted.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "#bbb" }}>No expenses yet</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  {["Date", "Category", "Amount", "Paid To", "Mode", "Notes", ""].map((h) =>
                    <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 100).map((e, i) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 14px" }}>{e.date}</td>
                    <td style={{ padding: "8px 14px", fontWeight: 600 }}>{e.category}</td>
                    <td style={{ padding: "8px 14px", color: "#C62828", fontWeight: 700 }}>{formatINR(e.amount)}</td>
                    <td style={{ padding: "8px 14px" }}>{e.paidTo || "—"}</td>
                    <td style={{ padding: "8px 14px", textTransform: "uppercase", fontSize: 11 }}>{e.mode}</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "#666" }}>{e.notes}</td>
                    <td><button onClick={() => handleDelete(e)} className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 10 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ───── P&L Snapshot ─────
function PnLTab({ sales, purchases, expenses }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const inRange = (createdAt, dateStr) => {
    const f = startOfDay(new Date(from)).getTime();
    const t = endOfDay(new Date(to)).getTime();
    if (dateStr) {
      const ms = new Date(dateStr).getTime();
      return ms >= f && ms <= t;
    }
    const ms = createdAt?.toMillis?.() || 0;
    return ms >= f && ms <= t;
  };

  const totals = useMemo(() => {
    const sRev = sales.filter((x) => inRange(x.createdAt))
      .reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
    const sTax = sales.filter((x) => inRange(x.createdAt))
      .reduce((s, x) => s + (Number(x.tax) || 0), 0);
    const sDisc = sales.filter((x) => inRange(x.createdAt))
      .reduce((s, x) => s + (Number(x.discount) || 0), 0);

    const pCogs = purchases.filter((x) => inRange(x.createdAt))
      .reduce((s, x) => s + (Number(x.total) || 0), 0);

    const eByCat = {};
    let eTotal = 0;
    expenses.filter((x) => inRange(null, x.date)).forEach((e) => {
      eTotal += Number(e.amount) || 0;
      const c = e.category || "Other";
      eByCat[c] = (eByCat[c] || 0) + (Number(e.amount) || 0);
    });

    const grossProfit = sRev - pCogs;
    const netProfit = grossProfit - eTotal;
    const margin = sRev > 0 ? (netProfit / sRev) * 100 : 0;

    return { sRev, sTax, sDisc, pCogs, eTotal, eByCat, grossProfit, netProfit, margin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, purchases, expenses, from, to]);

  return (
    <div>
      <div className="card p-5 mb-4" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div><label className="label">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" /></div>
        <div><label className="label">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Revenue (subtotal)" value={totals.sRev} accent="green" bold />
        <Stat label="GST collected" value={totals.sTax} accent="purple" />
        <Stat label="Discount given" value={totals.sDisc} accent="red" />
        <Stat label="COGS (purchases)" value={totals.pCogs} accent="red" />
        <Stat label="Total expenses" value={totals.eTotal} accent="red" />
      </div>

      <div className="card p-5 mb-4">
        <h3 style={{ marginTop: 0 }}>Profit & Loss</h3>
        <table style={{ width: "100%", fontSize: 14 }}>
          <tbody>
            <tr><td>Revenue</td><td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(totals.sRev)}</td></tr>
            <tr><td>(-) COGS</td><td style={{ textAlign: "right", color: "#C62828" }}>{formatINR(totals.pCogs)}</td></tr>
            <tr style={{ borderTop: "1px solid #ddd" }}>
              <td><strong>Gross Profit</strong></td>
              <td style={{ textAlign: "right", fontWeight: 700, color: totals.grossProfit >= 0 ? "green" : "#C62828" }}>{formatINR(totals.grossProfit)}</td>
            </tr>
            <tr><td>(-) Operating Expenses</td><td style={{ textAlign: "right", color: "#C62828" }}>{formatINR(totals.eTotal)}</td></tr>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td><strong>Net Profit</strong></td>
              <td style={{ textAlign: "right", fontWeight: 800, fontSize: 16, color: totals.netProfit >= 0 ? "green" : "#C62828" }}>
                {formatINR(totals.netProfit)} ({totals.margin.toFixed(1)}%)
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>Expenses by Category</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {Object.entries(totals.eByCat).length === 0
              ? <tr><td style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No expenses in range</td></tr>
              : Object.entries(totals.eByCat).map(([c, v], i) => (
                <tr key={c} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "8px 14px" }}>{c}</td>
                  <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600 }}>{formatINR(v)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, bold, raw }) {
  const colors = { red: "#C62828", green: "#1B5E20", purple: "#6A1B9A", default: "#1a1a2e" };
  return (
    <div className="card p-4">
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: bold ? 800 : 700, color: colors[accent] || colors.default }}>
        {raw ? value : formatINR(value)}
      </div>
    </div>
  );
}
