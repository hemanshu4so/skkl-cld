// src/pages/Billing.js  —  Phase 1 POS v2
//
// Adds:
//   - Per-line discount (₹ amount or %)
//   - Old-gold exchange row (subtracts gold value from bill)
//   - Multi-mode split payment (cash/card/upi/bank/cheque/credit)
//   - Hold-bill / recall-bill via /heldBills collection
//   - Keyboard shortcuts: F2 customer, F4 add item, F8 save, ESC clear
//   - Activity log on save / hold / recall

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, deleteDoc, onSnapshot, query, where,
  doc, serverTimestamp, runTransaction} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { whatsappActions } from "../services/whatsapp";
import useShortcut from "../hooks/useShortcut";
import PrintRenderer from "../components/PrintRenderer";
import { pickDefault } from "../lib/printTemplate";
import { assertShopId } from "../lib/utils";
import { logActivity } from "../lib/activityLog";
import { EXCHANGE_TYPES, SPLIT_MODES } from "../lib/constants";

// ───── Pricing ─────
function calcLine({ category, weight, karat, makingType, makingCharge, qty, customPrice, wastagePct, hallmarkCharge, stoneValue, lineDiscount, lineDiscountType }, rates) {
  const w = Number(weight) || 0;
  const q = Math.max(1, Number(qty) || 1);

  let base;
  if (customPrice && Number(customPrice) > 0) {
    base = { metalValue: 0, makingValue: 0, total: Math.round(Number(customPrice)) };
  } else {
    const PURITY = { "24K": 0.999, "22K": 0.916, "20K": 0.833, "18K": 0.750, "14K": 0.583, "92.5": 0.925, "Sterling": 0.925, "80": 0.8, "N/A": 1 };
    const purity = PURITY[karat] ?? 1;
    let perGramRate = 0;
    if (category === "Gold") perGramRate = (Number(rates.goldRate) || 0) / 10;
    if (category === "Silver") perGramRate = (Number(rates.silverRate) || 0) / 1000;
    const metalValue = Math.round(w * perGramRate * purity);
    let makingValue = 0;
    const mc = Number(makingCharge) || 0;
    if (makingType === "per_gram") makingValue = Math.round(w * mc);
    else if (makingType === "percent") makingValue = Math.round((metalValue * mc) / 100);
    else if (makingType === "fixed") makingValue = Math.round(mc);
    const wastage = Math.round((metalValue * (Number(wastagePct) || 0)) / 100);
    const total = metalValue + makingValue + wastage + (Number(hallmarkCharge) || 0) + (Number(stoneValue) || 0);
    base = { metalValue, makingValue, wastage, total };
  }

  // Per-line discount (subtracted from per-unit total before qty)
  const ld = Number(lineDiscount) || 0;
  const discPerUnit = lineDiscountType === "percent" ? Math.round((base.total * ld) / 100) : ld;
  const totalAfterDisc = Math.max(0, base.total - discPerUnit);
  return {
    ...base,
    lineDiscountAmount: discPerUnit,
    perUnit: totalAfterDisc,
    lineTotal: totalAfterDisc * q,
    qty: q,
  };
}

// ───── Print bill ─────
function PrintBill({ bill, shopData, onClose, template }) {
  const handlePrint = () => window.print();
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      zIndex: 1000, padding: 20, overflowY: "auto",
    }}>
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 520, width: "100%" }}>
        <div className="no-print" style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Bill Preview</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handlePrint} className="btn btn-primary">🖨️ Print</button>
            {bill.customerPhone && (
              <button
                onClick={() => whatsappActions({ shop: shopData }).bill(bill).onClick()}
                className="btn btn-secondary"
                style={{ background: "#25D366", color: "#fff", borderColor: "#25D366" }}
              >📱 WhatsApp</button>
            )}
            <button onClick={onClose} className="btn btn-secondary">✕ Close</button>
          </div>
        </div>
        <div id="printArea">
          <PrintRenderer template={template} doc={bill} shop={shopData} />
        </div>
      </div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #printArea, #printArea * { visibility: visible; }
          #printArea { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

// ───── Main POS ─────

// Sort array of {createdAt, ...} server-side or client-side. Pending writes
// (where createdAt is still null waiting for serverTimestamp roundtrip) and
// legacy docs missing the field both fall back to a sane order so the row
// shows immediately rather than disappearing.
const _ts = (d) => {
  const v = d?.createdAt;
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return Number(v) || 0;
};
const sortByCreatedDesc = (arr) => [...(arr || [])].sort((a, b) => _ts(b) - _ts(a));

export default function Billing() {
  const { userData, shopData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [rates, setRates] = useState({ goldRate: 0, silverRate: 0 });
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [heldBills, setHeldBills] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [walkIn, setWalkIn] = useState(false);

  const [cartItems, setCartItems] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [exchanges, setExchanges] = useState([]); // [{type, label, weight, purity, ratePerGram, value}]

  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(3);
  const [applyTax, setApplyTax] = useState(false);
  const [payments, setPayments] = useState([{ mode: "cash", amount: "", ref: "" }]);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [printBill, setPrintBill] = useState(null);
  // Default bill template (Phase 5). Falls back to PrintRenderer's built-in
  // layout when no admin-configured default exists.
  const [billTemplate, setBillTemplate] = useState(null);
  const billTemplateRef = useRef(null);
  useEffect(() => {
    if (billTemplateRef.current) { billTemplateRef.current(); billTemplateRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "printTemplates"),
        where("shopId", "==", shopId), where("kind", "==", "bill")),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBillTemplate(pickDefault(list, "bill"));
      },
      (err) => console.warn("[billing.template] snapshot:", err.message)
    );
    billTemplateRef.current = u;
    return () => { if (billTemplateRef.current) { billTemplateRef.current(); billTemplateRef.current = null; } };
  }, [shopId]);

  // Snapshot subscription refs — guarantee one listener per query, defensive
  // double-unsub guards on every effect re-run / strict-mode double-mount.
  const ratesUnsubRef     = useRef(null);
  const customersUnsubRef = useRef(null);
  const productsUnsubRef  = useRef(null);
  const heldBillsUnsubRef = useRef(null);

  const customerInputRef = useRef(null);
  const productInputRef = useRef(null);
  const saveBtnRef = useRef(null);

  // Live data
  // Rates — single live listener
  useEffect(() => {
    if (ratesUnsubRef.current) { ratesUnsubRef.current(); ratesUnsubRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(doc(db, "rates", shopId),
      (snap) => { if (snap.exists()) setRates(snap.data()); },
      (err) => console.error("[rates] snapshot error:", err)
    );
    ratesUnsubRef.current = u;
    return () => { if (ratesUnsubRef.current) { ratesUnsubRef.current(); ratesUnsubRef.current = null; } };
  }, [shopId]);

  // Customers — single live listener
  useEffect(() => {
    if (customersUnsubRef.current) { customersUnsubRef.current(); customersUnsubRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "customers"), where("shopId", "==", shopId)),
      (snap) => setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[billing.customers] snapshot error:", err)
    );
    customersUnsubRef.current = u;
    return () => { if (customersUnsubRef.current) { customersUnsubRef.current(); customersUnsubRef.current = null; } };
  }, [shopId]);

  // Products — single live listener
  useEffect(() => {
    if (productsUnsubRef.current) { productsUnsubRef.current(); productsUnsubRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "products"), where("shopId", "==", shopId)),
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[billing.products] snapshot error:", err)
    );
    productsUnsubRef.current = u;
    return () => { if (productsUnsubRef.current) { productsUnsubRef.current(); productsUnsubRef.current = null; } };
  }, [shopId]);

  // Held bills — single live listener
  useEffect(() => {
    if (heldBillsUnsubRef.current) { heldBillsUnsubRef.current(); heldBillsUnsubRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "heldBills"), where("shopId", "==", shopId)),
      (snap) => setHeldBills(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[billing.heldBills] snapshot error:", err)
    );
    heldBillsUnsubRef.current = u;
    return () => { if (heldBillsUnsubRef.current) { heldBillsUnsubRef.current(); heldBillsUnsubRef.current = null; } };
  }, [shopId]);

  useShortcut("ctrl+b", () => productInputRef.current?.focus());
  useShortcut("ctrl+n", () => customerInputRef.current?.focus());

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "F2") { e.preventDefault(); customerInputRef.current?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); productInputRef.current?.focus(); }
      else if (e.key === "F8") { e.preventDefault(); saveBtnRef.current?.click(); }
      else if (e.key === "Escape") {
        setProductSearch(""); setCustomerSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Cart ops
  const addToCart = (product) => {
    setCartItems((prev) => {
      const exists = prev.find((c) => c.productId === product.id);
      const stock = Number(product.qty) || 0;
      if (exists) {
        if (exists.qty + 1 > stock) { toast(`Only ${stock} in stock for ${product.name}`, "warn"); return prev; }
        return prev.map((c) => c.productId === product.id
          ? { ...c, ...calcLine({ ...c, qty: c.qty + 1 }, rates) } : c);
      }
      if (stock <= 0) { toast(`${product.name} out of stock`, "warn"); return prev; }
      const calc = calcLine({
        ...product, qty: 1, customPrice: Number(product.price) || 0,
        stoneValue: product.stoneValue, lineDiscount: 0, lineDiscountType: "amount",
      }, rates);
      return [...prev, {
        productId: product.id,
        name: product.name, category: product.category, karat: product.karat,
        weight: Number(product.weight) || 0,
        makingCharge: Number(product.makingCharge) || 0,
        makingType: product.makingType || "per_gram",
        wastagePct: Number(product.wastagePct) || 0,
        hallmarkCharge: Number(product.hallmarkCharge) || 0,
        stoneValue: Number(product.stoneValue) || 0,
        customPrice: Number(product.price) || 0,
        lineDiscount: 0, lineDiscountType: "amount",
        ...calc,
        availableStock: stock,
      }];
    });
    setProductSearch("");
  };

  const updateLine = (productId, patch) => {
    setCartItems((prev) =>
      prev.flatMap((c) => {
        if (c.productId !== productId) return [c];
        const merged = { ...c, ...patch };
        if (patch.qty !== undefined) {
          const q = Math.max(0, Math.floor(Number(patch.qty) || 0));
          if (q === 0) return [];
          if (q > c.availableStock) {
            toast(`Only ${c.availableStock} in stock for ${c.name}`, "warn");
            merged.qty = c.availableStock;
          }
        }
        return [{ ...merged, ...calcLine(merged, rates) }];
      })
    );
  };
  const removeFromCart = (productId) => setCartItems((prev) => prev.filter((c) => c.productId !== productId));

  // Old-gold exchange
  const addExchange = () => {
    const def = EXCHANGE_TYPES[0];
    setExchanges((prev) => [...prev, {
      type: def.value, label: def.label, weight: "", purity: def.purity,
      ratePerGram: (rates.goldRate || 0) / 10, value: 0,
    }]);
  };
  const updateExchange = (i, patch) => {
    setExchanges((prev) => prev.map((ex, idx) => {
      if (idx !== i) return ex;
      const next = { ...ex, ...patch };
      const w = Number(next.weight) || 0;
      const purity = Number(next.purity) || 0;
      const rate = Number(next.ratePerGram) || 0;
      next.value = Math.round(w * purity * rate);
      return next;
    }));
  };
  const removeExchange = (i) => setExchanges((prev) => prev.filter((_, idx) => idx !== i));

  // Totals
  const subtotal = useMemo(() => cartItems.reduce((s, i) => s + (i.lineTotal || 0), 0), [cartItems]);
  const exchangeValue = useMemo(() => exchanges.reduce((s, x) => s + (Number(x.value) || 0), 0), [exchanges]);
  const taxableBase = Math.max(0, subtotal - exchangeValue - Number(discount || 0));
  const taxAmount = applyTax ? Math.round(taxableBase * (Number(taxPercent) / 100)) : 0;
  const grandTotal = Math.max(0, taxableBase + taxAmount);
  const totalPaid = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);
  const effectivePaid = totalPaid > 0 ? totalPaid : grandTotal;
  const balance = Math.max(0, grandTotal - effectivePaid);

  // Filtering
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const addInlineCustomer = async () => {
    const q = (customerSearch || "").trim();
    if (!q) { toast("Type a name or phone first", "warn"); return; }
    if (!shopId) { toast("Shop is not loaded yet", "error"); return; }
    setCreatingCustomer(true);
    try {
      const isPhone = /^[0-9 +-]+$/.test(q);
      const data = {
        shopId, name: isPhone ? "" : q,
        phone: isPhone ? q.replace(/\D/g, "") : "",
        email: "", address: "", city: "",
        anniversary: "", birthday: "", notes: "",
        aadhaar: "", pan: "", gst: "",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "customers"), data);
      setSelectedCustomer({ id: ref.id, ...data });
      setCustomerSearch("");
      toast("Customer added", "success");
    } catch (err) {
      toast("Failed to add customer: " + err.message, "error");
    } finally { setCreatingCustomer(false); }
  };

    const filteredCustomers = sortByCreatedDesc(customers).filter((c) =>
    c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  ).slice(0, 8);
  const filteredProducts = sortByCreatedDesc(products).filter((p) =>
    productSearch && (
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.huid?.toLowerCase().includes(productSearch.toLowerCase())
    ) && (Number(p.qty) || 0) > 0
  ).slice(0, 8);

  // Hold / Recall
  const holdBill = async () => {
    if (!assertShopId(shopId, toast, "Billing.holdBill")) return;
    if (cartItems.length === 0) { toast("Cart is empty", "warn"); return; }
    try {
      await addDoc(collection(db, "heldBills"), {
        shopId,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || "Walk-in",
        customerPhone: selectedCustomer?.phone || "",
        cart: cartItems, exchanges, discount, taxPercent, applyTax, notes, walkIn,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin",
      });
      await logActivity({ shopId, action: "hold", entity: "sale", uid: userData?.id, name: userData?.name, meta: { items: cartItems.length, total: grandTotal } });
      toast("Bill held — recall later", "success");
      resetCart();
    } catch (err) {
      toast("Hold failed: " + err.message, "error");
    }
  };
  const recallBill = async (h) => {
    setCartItems(h.cart || []);
    setExchanges(h.exchanges || []);
    setDiscount(h.discount || 0);
    setTaxPercent(h.taxPercent || 3);
    setApplyTax(!!h.applyTax);
    setNotes(h.notes || "");
    if (h.customerId) setSelectedCustomer({ id: h.customerId, name: h.customerName, phone: h.customerPhone });
    setWalkIn(!!h.walkIn);
    try { await deleteDoc(doc(db, "heldBills", h.id)); } catch {}
    toast(`Recalled bill from ${h.customerName}`, "success");
  };

  const resetCart = () => {
    setCartItems([]); setExchanges([]);
    setSelectedCustomer(null); setCustomerSearch(""); setWalkIn(false);
    setDiscount(0); setApplyTax(false);
    setPayments([{ mode: "cash", amount: "", ref: "" }]);
    setNotes("");
  };

  // Save bill
  const handleSave = async () => {
    if (!assertShopId(shopId, toast, "Billing.handleSave")) return;
    if (cartItems.length === 0) { toast("Add at least one item", "warn"); return; }
    if (!selectedCustomer && !walkIn) { toast("Select a customer or mark as walk-in", "warn"); return; }
    setSaving(true);
    try {
      const billNo = "BILL" + Date.now().toString().slice(-6);
      const newSaleRef = doc(collection(db, "sales"));
      const cleanedPayments = payments.filter((p) => Number(p.amount) > 0).map((p) => ({
        mode: p.mode, amount: Math.round(Number(p.amount)), ref: p.ref || "",
      }));

      const billData = {
        shopId, billNo,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || "Walk-in",
        customerPhone: selectedCustomer?.phone || "",
        items: cartItems.map((c) => ({
          productId: c.productId, name: c.name, category: c.category, karat: c.karat,
          weight: c.weight, makingCharge: c.makingCharge, makingType: c.makingType,
          wastagePct: c.wastagePct, hallmarkCharge: c.hallmarkCharge,
          stoneValue: c.stoneValue, qty: c.qty,
          lineDiscount: Number(c.lineDiscount) || 0,
          lineDiscountType: c.lineDiscountType || "amount",
          lineDiscountAmount: c.lineDiscountAmount || 0,
          metalValue: c.metalValue, makingValue: c.makingValue, wastage: c.wastage || 0,
          perUnit: c.perUnit, total: c.total, lineTotal: c.lineTotal,
        })),
        exchanges,
        goldRate: rates.goldRate || 0, silverRate: rates.silverRate || 0,
        subtotal, exchangeValue,
        discount: Number(discount || 0),
        taxPercent: applyTax ? Number(taxPercent) : 0,
        tax: taxAmount, total: grandTotal,
        payments: cleanedPayments,
        amountPaid: cleanedPayments.length > 0 ? totalPaid : grandTotal,
        balance,
        notes: (notes || "").trim(),
        createdAt: serverTimestamp(),
        createdBy: userData?.name || userData?.id || "admin",
        createdByUid: userData?.id || null,
      };

      await runTransaction(db, async (tx) => {
        const productItems = billData.items.filter((i) => i.productId);
        const snaps = await Promise.all(productItems.map((i) => tx.get(doc(db, "products", i.productId))));
        const updates = [];
        snaps.forEach((snap, idx) => {
          const item = productItems[idx];
          if (!snap.exists()) throw new Error(`Product gone: ${item.name}`);
          const liveQty = Number(snap.data().qty) || 0;
          if (item.qty > liveQty) throw new Error(`Insufficient stock for ${item.name}: ${liveQty}/${item.qty}`);
          updates.push({ ref: snap.ref, newQty: liveQty - item.qty });
        });
        updates.forEach((u) => tx.update(u.ref, { qty: u.newQty }));
        tx.set(newSaleRef, billData);
      });

      await logActivity({
        shopId, action: "create", entity: "sale", entityId: newSaleRef.id,
        uid: userData?.id, name: userData?.name,
        meta: { billNo, total: grandTotal, items: cartItems.length, balance },
      });

      setPrintBill({ ...billData, id: newSaleRef.id, createdAt: { toDate: () => new Date() } });
      toast(`Bill ${billNo} saved`, "success");
      resetCart();
    } catch (err) {
      console.error("[billing.save]", err);
      toast(err?.message || "Failed to save bill", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      {printBill && <PrintBill bill={printBill} shopData={shopData} template={billTemplate} onClose={() => setPrintBill(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>🧾 New Sale / Billing</h1>
        <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#888" }}>
          <kbd style={kbd}>F2</kbd>customer
          <kbd style={kbd}>F4</kbd>item
          <kbd style={kbd}>F8</kbd>save
          <kbd style={kbd}>Esc</kbd>clear
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, padding: "10px 14px", background: "#FFFDE7", border: "1px solid #FDD835", borderRadius: 10, fontSize: 13, alignItems: "center", flexWrap: "wrap" }}>
        <span>🥇 Gold: <strong>₹{Number(rates.goldRate || 0).toLocaleString("en-IN")}</strong>/10g</span>
        <span>🥈 Silver: <strong>₹{Number(rates.silverRate || 0).toLocaleString("en-IN")}</strong>/kg</span>
        {!rates.goldRate && <span style={{ color: "#E65100" }}>⚠️ Set rates first</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {heldBills.length > 0 && (
            <select onChange={(e) => { const h = heldBills.find((x) => x.id === e.target.value); if (h) recallBill(h); }} value=""
              style={{ padding: "6px 10px", borderRadius: 6, border: "1.5px solid #FDD835", background: "#fff", fontSize: 12 }}>
              <option value="">↺ Recall held ({heldBills.length})</option>
              {sortByCreatedDesc(heldBills).map((h) => (
                <option key={h.id} value={h.id}>{h.customerName} · {(h.cart || []).length} items</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Customer */}
          <div className="card p-5">
            <h2 style={section}>👤 Customer</h2>
            {selectedCustomer ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#E8F5E9", borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{selectedCustomer.phone}</div>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <input ref={customerInputRef} type="text" value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setWalkIn(false); }}
                    placeholder="(F2) Search by name or phone…"
                    style={inpStyle} />
                  <button onClick={() => { setWalkIn(true); setCustomerSearch(""); setSelectedCustomer(null); }}
                    style={{ padding: "9px 16px", fontSize: 12, fontWeight: 600,
                      background: walkIn ? "#1a1a2e" : "#f0f0f0", color: walkIn ? "#fff" : "#555",
                      border: "none", borderRadius: 8, cursor: "pointer" }}>Walk-in</button>
                </div>
                {customerSearch && filteredCustomers.map((c) => (
                  <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setWalkIn(false); }}
                    style={pickRow}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
                {walkIn && <div style={{ padding: 8, background: "#FFF3E0", borderRadius: 8, fontSize: 13, color: "#E65100" }}>✓ Walk-in</div>}
              </div>
            )}
          </div>

          {/* Add items */}
          <div className="card p-5">
            <h2 style={section}>📦 Add Items</h2>
            <input ref={productInputRef} type="text" value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="(F4) Search by name / barcode / HUID…"
              style={{ ...inpStyle, marginBottom: 8 }} />
            {filteredProducts.map((p) => {
              const calc = calcLine({ ...p, qty: 1, customPrice: Number(p.price) || 0, stoneValue: p.stoneValue, lineDiscount: 0, lineDiscountType: "amount" }, rates);
              return (
                <div key={p.id} onClick={() => addToCart(p)} style={pickRow}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.category} · {p.karat} · {p.weight}g · stock {p.qty}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>₹{calc.perUnit.toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>+ click</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cart */}
          {cartItems.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                <h2 style={section}>🛒 Cart ({cartItems.length})</h2>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    {["Item", "Qty", "Disc", "Type", "Per Unit", "Line Total", ""].map((h) =>
                      <th key={h} style={{ padding: "8px", fontSize: 10, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => (
                    <tr key={item.productId} style={{ borderTop: "1px solid #f5f5f5" }}>
                      <td style={{ padding: 8 }}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 10, color: "#888" }}>{item.category}·{item.karat}·{item.weight}g</div>
                      </td>
                      <td style={{ padding: 8 }}>
                        <input type="number" min={1} max={item.availableStock} value={item.qty}
                          onChange={(e) => updateLine(item.productId, { qty: e.target.value })}
                          style={{ ...miniInp, width: 50 }} />
                      </td>
                      <td style={{ padding: 8 }}>
                        <input type="number" value={item.lineDiscount}
                          onChange={(e) => updateLine(item.productId, { lineDiscount: e.target.value })}
                          style={{ ...miniInp, width: 60 }} />
                      </td>
                      <td style={{ padding: 8 }}>
                        <select value={item.lineDiscountType}
                          onChange={(e) => updateLine(item.productId, { lineDiscountType: e.target.value })}
                          style={{ ...miniInp, width: 60 }}>
                          <option value="amount">₹</option>
                          <option value="percent">%</option>
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>₹{item.perUnit.toLocaleString("en-IN")}</td>
                      <td style={{ padding: 8, fontWeight: 700 }}>₹{item.lineTotal.toLocaleString("en-IN")}</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => removeFromCart(item.productId)} style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 16 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Exchange */}
          <div className="card p-5">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={section}>🔄 Old-Gold Exchange</h2>
              <button onClick={addExchange} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>+ Add row</button>
            </div>
            {exchanges.length === 0
              ? <div style={{ fontSize: 12, color: "#aaa" }}>No exchange added</div>
              : exchanges.map((ex, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 90px 90px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <select value={ex.type}
                    onChange={(e) => {
                      const t = EXCHANGE_TYPES.find((x) => x.value === e.target.value);
                      updateExchange(i, { type: t.value, label: t.label, purity: t.purity });
                    }}
                    style={miniInp}>
                    {EXCHANGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="number" placeholder="Wt g" value={ex.weight}
                    onChange={(e) => updateExchange(i, { weight: e.target.value })} style={miniInp} />
                  <input type="number" placeholder="Purity" value={ex.purity}
                    onChange={(e) => updateExchange(i, { purity: e.target.value })} style={miniInp} />
                  <input type="number" placeholder="Rate/g" value={ex.ratePerGram}
                    onChange={(e) => updateExchange(i, { ratePerGram: e.target.value })} style={miniInp} />
                  <div style={{ fontWeight: 700, color: "green", textAlign: "right" }}>₹{Number(ex.value).toLocaleString("en-IN")}</div>
                  <button onClick={() => removeExchange(i)} style={{ background: "#FFEBEE", color: "#C62828", border: "none", borderRadius: 6, cursor: "pointer", height: 32 }}>×</button>
                </div>
              ))
            }
          </div>
        </div>

        {/* RIGHT — Summary + Payment */}
        <div style={{ position: "sticky", top: 20 }}>
          <div className="card p-5" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
            <h2 style={{ ...section, marginBottom: 14 }}>Bill Summary</h2>

            <Row label="Subtotal" value={subtotal} />
            {exchangeValue > 0 && <Row label="Exchange credit" value={-exchangeValue} green />}

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
              <label style={{ fontSize: 13, color: "#666", flex: 1 }}>Bill discount (₹)</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ ...miniInp, width: 100, textAlign: "right" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 12px" }}>
              <label style={{ fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />GST
              </label>
              {applyTax && (
                <select value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} style={{ ...miniInp, width: 80 }}>
                  {[1.5, 3, 5, 12, 18].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              )}
              {applyTax && <span style={{ fontSize: 13, fontWeight: 600 }}>₹{taxAmount.toLocaleString("en-IN")}</span>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #f0f0f0", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>₹{grandTotal.toLocaleString("en-IN")}</span>
            </div>

            {/* Split payments */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>Payments (split allowed)</label>
                <button onClick={() => setPayments((p) => [...p, { mode: "cash", amount: "", ref: "" }])}
                  style={{ background: "none", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>+</button>
              </div>
              {payments.map((p, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "85px 1fr 90px 24px", gap: 6, marginBottom: 6 }}>
                  <select value={p.mode} onChange={(e) => setPayments((arr) => arr.map((x, idx) => idx === i ? { ...x, mode: e.target.value } : x))} style={miniInp}>
                    {SPLIT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                  <input type="text" placeholder="Ref" value={p.ref}
                    onChange={(e) => setPayments((arr) => arr.map((x, idx) => idx === i ? { ...x, ref: e.target.value } : x))} style={miniInp} />
                  <input type="number" placeholder="₹" value={p.amount}
                    onChange={(e) => setPayments((arr) => arr.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} style={{ ...miniInp, textAlign: "right" }} />
                  <button onClick={() => setPayments((arr) => arr.filter((_, idx) => idx !== i))}
                    style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }} disabled={payments.length === 1}>×</button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                Paid {totalPaid.toLocaleString("en-IN")} / {grandTotal.toLocaleString("en-IN")} (blank = full)
              </div>
            </div>

            {balance > 0 && (
              <div style={{ padding: "8px 12px", background: "#FFEBEE", borderRadius: 8, fontSize: 13, color: "#C62828", marginBottom: 10, fontWeight: 600 }}>
                Balance Due: ₹{balance.toLocaleString("en-IN")}
              </div>
            )}

            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)..." rows={2}
              style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={holdBill} disabled={cartItems.length === 0} className="btn btn-secondary" style={{ flex: 1 }}>⏸ Hold</button>
              <button ref={saveBtnRef} onClick={handleSave} disabled={saving || cartItems.length === 0} className="btn btn-primary" style={{ flex: 2 }}>
                {saving ? "Saving…" : "💾 Save (F8)"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const section = { fontSize: 14, fontWeight: 700, color: "#333", margin: 0 };
const inpStyle = { flex: 1, padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 13, outline: "none" };
const miniInp = { padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, outline: "none" };
const pickRow = { padding: "10px 12px", cursor: "pointer", borderRadius: 8, border: "1px solid #eee", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" };
const kbd = { fontFamily: "monospace", padding: "2px 5px", background: "#fff", border: "1px solid #ddd", borderRadius: 3, fontSize: 10, color: "#333" };

function Row({ label, value, green }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 600, color: green ? "green" : "#1a1a2e" }}>
        {value < 0 ? "-" : ""}₹{Math.abs(value).toLocaleString("en-IN")}
      </span>
    </div>
  );
}
