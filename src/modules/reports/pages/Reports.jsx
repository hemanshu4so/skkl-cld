// src/pages/reports.js  —  Phase 1 Reports & Analytics
//
// Five sub-reports, all client-side computed off live Firestore subscriptions:
//   1. Daily Sales       — date-range filter, totals, per-day breakdown
//   2. GST Report        — taxable/exempt/tax buckets + HSN summary
//   3. Top Customers     — by total spend, by frequency
//   4. Stock Valuation   — using current gold/silver rates
//   5. Profit Estimate   — sale price - product cost (purchase price)
//
// Every report has a "📥 CSV" button that exports via lib/utils.downloadCSV.

import { useState, useEffect, useMemo } from "react";
import { db } from "@fb/client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useToast } from "../../../hooks/useToast";
import { formatINR, formatDate, HSN_CODES } from "../../../lib/constants";
import { downloadCSV, startOfDay, endOfDay } from "../../../lib/utils";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function Reports() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [tab, setTab] = useState("sales");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [rates, setRates] = useState({ goldRate: 0, silverRate: 0 });

  useEffect(() => {
    if (!shopId) return;
    const u1 = onSnapshot(query(collection(db, "sales"), where("shopId", "==", shopId)), (s) =>
      setSales(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "products"), where("shopId", "==", shopId)), (s) =>
      setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "customers"), where("shopId", "==", shopId)), (s) =>
      setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u4 = onSnapshot(collection(db, "rates"), (snap) => {
      const me = snap.docs.find((d) => d.id === shopId);
      if (me) setRates(me.data());
    });
    return () => { u1(); u2(); u3(); u4(); };
  }, [shopId]);

  const inRange = useMemo(() => {
    const f = startOfDay(new Date(from)).getTime();
    const t = endOfDay(new Date(to)).getTime();
    return sales.filter((s) => {
      const ms = s.createdAt?.toMillis?.() || 0;
      return ms >= f && ms <= t;
    });
  }, [sales, from, to]);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>📊 Reports & Analytics</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" style={{ width: 150 }} />
          <span style={{ color: "#888" }}>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" style={{ width: 150 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { id: "sales",      label: "Daily Sales" },
          { id: "gst",        label: "GST Report" },
          { id: "top",        label: "Top Customers" },
          { id: "stock",      label: "Stock Valuation" },
          { id: "profit",     label: "Profit Estimate" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 20, border: "1.5px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: tab === t.id ? "#1a1a2e" : "#ddd",
              background: tab === t.id ? "#1a1a2e" : "#fff",
              color: tab === t.id ? "#fff" : "#555",
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "sales"  && <DailySales  sales={inRange} toast={toast} />}
      {tab === "gst"    && <GSTReport   sales={inRange} toast={toast} />}
      {tab === "top"    && <TopCustomers sales={inRange} customers={customers} toast={toast} />}
      {tab === "stock"  && <StockValuation products={products} rates={rates} toast={toast} />}
      {tab === "profit" && <ProfitEstimate sales={inRange} products={products} toast={toast} />}
    </div>
  );
}

// ───── Daily sales ─────
function DailySales({ sales, toast }) {
  const totals = useMemo(() => {
    const t = { count: 0, gross: 0, discount: 0, tax: 0, net: 0, cash: 0, card: 0, upi: 0, credit: 0 };
    sales.forEach((s) => {
      t.count++;
      t.gross += Number(s.subtotal) || 0;
      t.discount += Number(s.discount) || 0;
      t.tax += Number(s.tax) || 0;
      t.net += Number(s.total) || 0;
      // Sum split payments by mode
      (s.payments || [{ mode: s.paymentMode, amount: s.amountPaid }]).forEach((p) => {
        const m = (p.mode || "cash").toLowerCase();
        if (t[m] !== undefined) t[m] += Number(p.amount) || 0;
      });
    });
    return t;
  }, [sales]);

  const byDay = useMemo(() => {
    const map = {};
    sales.forEach((s) => {
      const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { date: key, count: 0, total: 0 };
      map[key].count++; map[key].total += Number(s.total) || 0;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  const exportCSV = () =>
    downloadCSV(
      sales.map((s) => ({
        billNo: s.billNo, date: formatDate(s.createdAt),
        customer: s.customerName, items: s.items?.length || 0,
        subtotal: s.subtotal, discount: s.discount,
        tax: s.tax, total: s.total,
        paymentMode: s.payments?.map((p) => p.mode).join("/") || s.paymentMode,
      })),
      "daily-sales.csv"
    );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, flex: 1 }}>
          <Stat label="Bills" value={totals.count} raw />
          <Stat label="Gross" value={totals.gross} />
          <Stat label="Discount" value={totals.discount} accent="red" />
          <Stat label="GST collected" value={totals.tax} accent="purple" />
          <Stat label="Net Sales" value={totals.net} accent="green" bold />
        </div>
      </div>

      <div className="card mb-4" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
          <strong>By Day ({byDay.length})</strong>
          <button onClick={exportCSV} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>📥 CSV</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["Date", "Bills", "Total"].map((h) =>
                <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {byDay.length === 0 ? (
              <tr><td colSpan="3" style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No sales in range</td></tr>
            ) : byDay.map((d, i) => (
              <tr key={d.date} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "8px 14px" }}>{d.date}</td>
                <td style={{ padding: "8px 14px" }}>{d.count}</td>
                <td style={{ padding: "8px 14px", fontWeight: 700 }}>{formatINR(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}><strong>Payment Mode Split</strong></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", padding: 16, gap: 10 }}>
          <PayCell label="Cash" value={totals.cash} />
          <PayCell label="Card" value={totals.card} />
          <PayCell label="UPI" value={totals.upi} />
          <PayCell label="Credit" value={totals.credit} />
        </div>
      </div>
    </div>
  );
}

function PayCell({ label, value }) {
  return (
    <div style={{ padding: 12, background: "#f8f9fa", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatINR(value)}</div>
    </div>
  );
}

// ───── GST report ─────
function GSTReport({ sales, toast }) {
  const buckets = useMemo(() => {
    const out = { taxable: 0, exempt: 0, gstByRate: {} };
    sales.forEach((s) => {
      const tax = Number(s.tax) || 0;
      const rate = Number(s.taxPercent) || 0;
      if (tax > 0 && rate > 0) {
        out.taxable += Number(s.total) - tax;
        if (!out.gstByRate[rate]) out.gstByRate[rate] = { taxable: 0, gst: 0, count: 0 };
        out.gstByRate[rate].taxable += Number(s.total) - tax;
        out.gstByRate[rate].gst += tax;
        out.gstByRate[rate].count++;
      } else {
        out.exempt += Number(s.total) || 0;
      }
    });
    return out;
  }, [sales]);

  const hsnSummary = useMemo(() => {
    const map = {};
    sales.forEach((s) => {
      (s.items || []).forEach((it) => {
        const hsn = HSN_CODES[it.category] || HSN_CODES.Other || "—";
        if (!map[hsn]) map[hsn] = { hsn, qty: 0, value: 0 };
        map[hsn].qty += Number(it.qty) || 1;
        map[hsn].value += Number(it.lineTotal || it.total) || 0;
      });
    });
    return Object.values(map);
  }, [sales]);

  const exportGST = () => {
    const rows = Object.entries(buckets.gstByRate).map(([rate, b]) => ({
      rate: rate + "%", bills: b.count,
      taxableValue: b.taxable, totalGST: b.gst,
      cgst: (b.gst / 2).toFixed(2), sgst: (b.gst / 2).toFixed(2),
    }));
    downloadCSV(rows.length ? rows : [{ note: "no taxable sales" }], "gst-report.csv");
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Stat label="Taxable Value" value={buckets.taxable} accent="purple" />
        <Stat label="Exempt (no GST)" value={buckets.exempt} />
        <Stat label="Total GST" value={Object.values(buckets.gstByRate).reduce((s, b) => s + b.gst, 0)} bold accent="green" />
      </div>

      <div className="card mb-4" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
          <strong>By GST Rate</strong>
          <button onClick={exportGST} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>📥 CSV</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["Rate", "Bills", "Taxable", "GST", "CGST (½)", "SGST (½)"].map((h) =>
                <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {Object.keys(buckets.gstByRate).length === 0
              ? <tr><td colSpan="6" style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No GST sales in range</td></tr>
              : Object.entries(buckets.gstByRate).map(([rate, b], i) => (
                <tr key={rate} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "8px 14px" }}>{rate}%</td>
                  <td style={{ padding: "8px 14px" }}>{b.count}</td>
                  <td style={{ padding: "8px 14px" }}>{formatINR(b.taxable)}</td>
                  <td style={{ padding: "8px 14px", fontWeight: 700 }}>{formatINR(b.gst)}</td>
                  <td style={{ padding: "8px 14px" }}>{formatINR(b.gst / 2)}</td>
                  <td style={{ padding: "8px 14px" }}>{formatINR(b.gst / 2)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}><strong>HSN Summary</strong></div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["HSN", "Quantity", "Value"].map((h) =>
                <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {hsnSummary.length === 0
              ? <tr><td colSpan="3" style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No data</td></tr>
              : hsnSummary.map((h, i) => (
                <tr key={h.hsn} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace" }}>{h.hsn}</td>
                  <td style={{ padding: "8px 14px" }}>{h.qty}</td>
                  <td style={{ padding: "8px 14px", fontWeight: 600 }}>{formatINR(h.value)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───── Top customers ─────
function TopCustomers({ sales, customers, toast }) {
  const ranked = useMemo(() => {
    const map = {};
    sales.forEach((s) => {
      const id = s.customerId || `walkin:${s.customerPhone || s.customerName}`;
      if (!map[id]) map[id] = { id, name: s.customerName, phone: s.customerPhone, count: 0, total: 0 };
      map[id].count++;
      map[id].total += Number(s.total) || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 50);
  }, [sales]);

  const exportCSV = () =>
    downloadCSV(ranked.map((r) => ({
      name: r.name, phone: r.phone, bills: r.count, totalSpent: r.total,
    })), "top-customers.csv");

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
        <strong>Top Customers (by spend)</strong>
        <button onClick={exportCSV} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>📥 CSV</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8f9fa" }}>
            {["#", "Customer", "Phone", "Bills", "Total Spent"].map((h) =>
              <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {ranked.length === 0
            ? <tr><td colSpan="5" style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No sales in range</td></tr>
            : ranked.map((r, i) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "8px 14px", color: "#888" }}>{i + 1}</td>
                <td style={{ padding: "8px 14px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "8px 14px" }}>{r.phone}</td>
                <td style={{ padding: "8px 14px" }}>{r.count}</td>
                <td style={{ padding: "8px 14px", fontWeight: 700 }}>{formatINR(r.total)}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ───── Stock valuation ─────
const PURITY = { "24K": 0.999, "22K": 0.916, "20K": 0.833, "18K": 0.750, "14K": 0.583, "92.5": 0.925, "Sterling": 0.925, "80": 0.8, "N/A": 1 };

function StockValuation({ products, rates, toast }) {
  const valued = useMemo(() => products.map((p) => {
    const w = Number(p.weight) || 0;
    const q = Number(p.qty) || 0;
    const purity = PURITY[p.karat] ?? 1;
    let perGram = 0;
    if (p.category === "Gold")   perGram = (Number(rates.goldRate) || 0) / 10;
    if (p.category === "Silver") perGram = (Number(rates.silverRate) || 0) / 1000;
    const metalValue = Math.round(w * perGram * purity * q);
    const sellingValue = Math.round(((Number(p.price) || 0) || metalValue) * q);
    const stoneValue = (Number(p.stoneValue) || 0) * q;
    return { ...p, metalValue, sellingValue, stoneValue };
  }), [products, rates]);

  const totals = useMemo(() => {
    const t = { gold: 0, silver: 0, other: 0, stones: 0, selling: 0, count: 0 };
    valued.forEach((v) => {
      t.count += Number(v.qty) || 0;
      if (v.category === "Gold") t.gold += v.metalValue;
      else if (v.category === "Silver") t.silver += v.metalValue;
      else t.other += v.metalValue;
      t.stones += v.stoneValue;
      t.selling += v.sellingValue;
    });
    return t;
  }, [valued]);

  const exportCSV = () =>
    downloadCSV(valued.map((v) => ({
      name: v.name, category: v.category, karat: v.karat,
      weight: v.weight, qty: v.qty,
      metalValue: v.metalValue, stoneValue: v.stoneValue, sellingValue: v.sellingValue,
    })), "stock-valuation.csv");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Stat label="Items in stock" value={totals.count} raw />
        <Stat label="Gold metal value" value={totals.gold} accent="orange" />
        <Stat label="Silver metal value" value={totals.silver} />
        <Stat label="Other metals" value={totals.other} />
        <Stat label="Stones value" value={totals.stones} accent="purple" />
        <Stat label="Selling value" value={totals.selling} bold accent="green" />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
          <strong>Items ({valued.length})</strong>
          <button onClick={exportCSV} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>📥 CSV</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                {["Name", "Cat", "K", "Wt", "Qty", "Metal Val", "Stone Val", "Selling Val"].map((h) =>
                  <th key={h} style={{ padding: "8px 12px", fontSize: 10, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {valued.map((v, i) => (
                <tr key={v.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{v.name}</td>
                  <td style={{ padding: "8px 12px" }}>{v.category}</td>
                  <td style={{ padding: "8px 12px" }}>{v.karat}</td>
                  <td style={{ padding: "8px 12px" }}>{v.weight}g</td>
                  <td style={{ padding: "8px 12px" }}>{v.qty}</td>
                  <td style={{ padding: "8px 12px" }}>{formatINR(v.metalValue)}</td>
                  <td style={{ padding: "8px 12px" }}>{formatINR(v.stoneValue)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>{formatINR(v.sellingValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───── Profit estimate ─────
function ProfitEstimate({ sales, products, toast }) {
  // For each sold line, look up product cost (from /products.price as a proxy
  // since GRN now seeds price=cost at create time; user can refine later).
  const productCost = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.id] = Number(p.price) || 0; });
    return m;
  }, [products]);

  const enriched = useMemo(() => sales.map((s) => {
    const cost = (s.items || []).reduce((sum, it) =>
      sum + (productCost[it.productId] || 0) * (it.qty || 1), 0);
    const revenue = Number(s.total) || 0;
    const profit = revenue - cost;
    return { ...s, cost, revenue, profit };
  }), [sales, productCost]);

  const totals = enriched.reduce((acc, s) => ({
    revenue: acc.revenue + s.revenue,
    cost: acc.cost + s.cost,
    profit: acc.profit + s.profit,
  }), { revenue: 0, cost: 0, profit: 0 });

  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const exportCSV = () =>
    downloadCSV(enriched.map((s) => ({
      billNo: s.billNo, date: formatDate(s.createdAt),
      revenue: s.revenue, cost: s.cost, profit: s.profit,
    })), "profit-estimate.csv");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Stat label="Revenue" value={totals.revenue} />
        <Stat label="Cost (est)" value={totals.cost} accent="red" />
        <Stat label="Profit (est)" value={totals.profit} accent="green" bold />
        <Stat label="Margin" value={`${margin.toFixed(1)}%`} raw />
      </div>

      <div style={{ padding: 12, background: "#FFFDE7", border: "1px solid #FDD835", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>
        ℹ️ Cost is estimated from each sold product's <code>price</code> field at the time of sale.
        For exact margin tracking, capture <code>cost</code> at the GRN level (Phase 2).
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
          <strong>Per-bill breakdown</strong>
          <button onClick={exportCSV} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11 }}>📥 CSV</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["Bill", "Date", "Revenue", "Cost", "Profit"].map((h) =>
                <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0
              ? <tr><td colSpan="5" style={{ padding: 30, textAlign: "center", color: "#bbb" }}>No sales in range</td></tr>
              : enriched.slice(0, 50).map((s, i) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "8px 14px" }}>{s.billNo}</td>
                  <td style={{ padding: "8px 14px" }}>{formatDate(s.createdAt)}</td>
                  <td style={{ padding: "8px 14px" }}>{formatINR(s.revenue)}</td>
                  <td style={{ padding: "8px 14px", color: "#C62828" }}>{formatINR(s.cost)}</td>
                  <td style={{ padding: "8px 14px", fontWeight: 700, color: s.profit >= 0 ? "green" : "#C62828" }}>{formatINR(s.profit)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───── Stat card ─────
function Stat({ label, value, accent, bold, raw }) {
  const colors = {
    red: "#C62828", green: "#1B5E20", purple: "#6A1B9A",
    orange: "#E65100", default: "#1a1a2e",
  };
  return (
    <div className="card p-4">
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: bold ? 800 : 700, color: colors[accent] || colors.default }}>
        {raw ? value : formatINR(value)}
      </div>
    </div>
  );
}
