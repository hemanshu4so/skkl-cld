// src/pages/Billing.js
//
// POS / Billing screen.
//
// FIX P0-13:
//   The previous implementation called updateDoc(qty: increment(-1)) for each
//   line in the cart, regardless of how many units of that product were sold.
//   It also did the writes in a non-transactional loop, so two cashiers ringing
//   up the same SKU at the same time could oversell.
//
//   This rewrite:
//     1. Adds a per-line quantity selector (defaults to 1 on add).
//     2. Recomputes per-line totals from { weight, makingCharge, qty }.
//     3. Validates available stock before save, and during the transaction.
//     4. Performs the bill-write + every stock decrement inside ONE
//        Firestore transaction (all-or-nothing, contention-safe).
//     5. Computes balance correctly when amountPaid is empty.

import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, where,
  doc, serverTimestamp, runTransaction,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";

// ───────── Bill print component ─────────────────────────────────────────────
function PrintBill({ bill, shopData, onClose }) {
  const handlePrint = () => window.print();
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      zIndex: 1000, padding: 20, overflowY: "auto",
    }}>
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 500, width: "100%" }}>
        <div className="no-print" style={{
          padding: "14px 20px", borderBottom: "1px solid #eee",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Bill Preview</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handlePrint} className="btn btn-primary">🖨️ Print</button>
            <button onClick={onClose} className="btn btn-secondary">✕ Close</button>
          </div>
        </div>

        <div id="printArea" style={{ padding: 24, fontFamily: "monospace" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>
              {shopData?.company?.name || shopData?.name || "SKKL Jewellers"}
            </div>
            {shopData?.company?.address && <div style={{ fontSize: 12, color: "#555" }}>{shopData.company.address}</div>}
            {shopData?.company?.phone && <div style={{ fontSize: 12, color: "#555" }}>Ph: {shopData.company.phone}</div>}
            {shopData?.company?.gst && <div style={{ fontSize: 12, color: "#555" }}>GST: {shopData.company.gst}</div>}
          </div>

          <div style={{ borderTop: "2px dashed #333", borderBottom: "2px dashed #333", padding: "8px 0", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Bill No: <strong>{bill.billNo}</strong></span>
              <span>{new Date(bill.createdAt?.toDate ? bill.createdAt.toDate() : Date.now()).toLocaleDateString("en-IN")}</span>
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Customer: <strong>{bill.customerName || "Walk-in"}</strong>
              {bill.customerPhone && <span> | Ph: {bill.customerPhone}</span>}
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
              Gold Rate: ₹{bill.goldRate}/10g | Silver Rate: ₹{bill.silverRate}/kg
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left",  padding: "4px 0" }}>Item</th>
                <th style={{ textAlign: "right", padding: "4px"   }}>Qty</th>
                <th style={{ textAlign: "right", padding: "4px"   }}>Wt(g)</th>
                <th style={{ textAlign: "right", padding: "4px"   }}>Metal</th>
                <th style={{ textAlign: "right", padding: "4px"   }}>Making</th>
                <th style={{ textAlign: "right", padding: "4px 0" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items?.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px dotted #ddd" }}>
                  <td style={{ padding: "5px 0", verticalAlign: "top" }}>
                    <div>{item.name}</div>
                    <div style={{ fontSize: 10, color: "#777" }}>{item.category} {item.karat}</div>
                  </td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>{item.qty}</td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>{item.weight}</td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>₹{Number(item.metalValue || 0).toLocaleString("en-IN")}</td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>₹{Number(item.makingValue || 0).toLocaleString("en-IN")}</td>
                  <td style={{ textAlign: "right", padding: "5px 0", fontWeight: 700 }}>₹{Number(item.lineTotal || item.total || 0).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ borderTop: "1px solid #333", paddingTop: 8, fontSize: 12 }}>
            {[
              ["Subtotal", bill.subtotal],
              bill.discount > 0 ? ["Discount", -bill.discount] : null,
              bill.tax > 0 ? [`GST (${bill.taxPercent}%)`, bill.tax] : null,
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>{label}</span>
                <span style={{ color: val < 0 ? "green" : "inherit" }}>
                  {val < 0 ? "-" : ""}₹{Math.abs(val).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontWeight: 800, fontSize: 16,
              borderTop: "2px solid #333", marginTop: 6, paddingTop: 6,
            }}>
              <span>TOTAL</span>
              <span>₹{Number(bill.total || 0).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span>Payment: {(bill.paymentMode || "cash").toUpperCase()}</span>
              <span>Paid: ₹{Number(bill.amountPaid || 0).toLocaleString("en-IN")}</span>
            </div>
            {bill.balance > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "red" }}>
                <span>Balance Due</span>
                <span>₹{Number(bill.balance || 0).toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>

          <div style={{ borderTop: "2px dashed #333", marginTop: 12, paddingTop: 8, textAlign: "center", fontSize: 11, color: "#777" }}>
            Thank you for shopping with us!<br />
            Exchange / return subject to store policy.
          </div>
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

// ───────── Pricing helper (single source of truth) ──────────────────────────
function calcLine({ category, weight, karat, makingType, makingCharge, qty, customPrice }, rates) {
  const w = Number(weight) || 0;
  const q = Math.max(1, Number(qty) || 1);

  if (customPrice && Number(customPrice) > 0) {
    const t = Math.round(Number(customPrice));
    return { metalValue: 0, makingValue: 0, total: t, lineTotal: t * q, qty: q };
  }

  const PURITY = {
    "24K": 0.999, "22K": 0.916, "20K": 0.833, "18K": 0.750, "14K": 0.583,
    "92.5": 0.925, "Sterling": 0.925, "80": 0.8, "N/A": 1,
  };
  const purity = PURITY[karat] ?? 1;

  let perGramRate = 0;
  if (category === "Gold")   perGramRate = (Number(rates.goldRate)   || 0) / 10;
  if (category === "Silver") perGramRate = (Number(rates.silverRate) || 0) / 1000;

  const metalValue = Math.round(w * perGramRate * purity);

  let makingValue = 0;
  const mc = Number(makingCharge) || 0;
  if (makingType === "per_gram") makingValue = Math.round(w * mc);
  else if (makingType === "percent") makingValue = Math.round((metalValue * mc) / 100);
  else if (makingType === "fixed") makingValue = Math.round(mc);

  const total = metalValue + makingValue;
  return { metalValue, makingValue, total, lineTotal: total * q, qty: q };
}

// ───────── Main Billing Page ────────────────────────────────────────────────
export default function Billing() {
  const { userData, shopData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [rates, setRates] = useState({ goldRate: 0, silverRate: 0 });
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [walkIn, setWalkIn] = useState(false);

  const [cartItems, setCartItems] = useState([]);
  const [productSearch, setProductSearch] = useState("");

  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(3);
  const [applyTax, setApplyTax] = useState(false);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [printBill, setPrintBill] = useState(null);

  useEffect(() => {
    if (!shopId) return;
    const u = onSnapshot(doc(db, "rates", shopId), (s) => {
      if (s.exists()) setRates(s.data());
    });
    return () => u();
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    const u = onSnapshot(query(collection(db, "customers"), where("shopId", "==", shopId)), (s) => {
      setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => u();
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    const u = onSnapshot(query(collection(db, "products"), where("shopId", "==", shopId)), (s) => {
      setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => u();
  }, [shopId]);

  const addToCart = (product) => {
    setCartItems((prev) => {
      const exists = prev.find((c) => c.productId === product.id);
      if (exists) {
        const stock = Number(product.qty) || 0;
        if (exists.qty + 1 > stock) {
          toast(`Only ${stock} in stock for ${product.name}`, "warn");
          return prev;
        }
        return prev.map((c) =>
          c.productId === product.id
            ? { ...c, ...calcLine({ ...product, qty: c.qty + 1 }, rates) }
            : c
        );
      }
      const stock = Number(product.qty) || 0;
      if (stock <= 0) {
        toast(`${product.name} is out of stock`, "warn");
        return prev;
      }
      const calc = calcLine({ ...product, qty: 1 }, rates);
      return [...prev, {
        productId: product.id,
        name: product.name,
        category: product.category,
        karat: product.karat,
        weight: Number(product.weight) || 0,
        makingCharge: Number(product.makingCharge) || 0,
        makingType: product.makingType || "per_gram",
        customPrice: Number(product.price) || 0,
        ...calc,
        availableStock: stock,
      }];
    });
    setProductSearch("");
  };

  const updateQty = (productId, nextQty) => {
    setCartItems((prev) =>
      prev.flatMap((c) => {
        if (c.productId !== productId) return [c];
        const q = Math.max(0, Math.floor(Number(nextQty) || 0));
        if (q === 0) return [];
        if (q > c.availableStock) {
          toast(`Only ${c.availableStock} in stock for ${c.name}`, "warn");
          return [{ ...c, ...calcLine({ ...c, qty: c.availableStock }, rates) }];
        }
        return [{ ...c, ...calcLine({ ...c, qty: q }, rates) }];
      })
    );
  };

  const removeFromCart = (productId) =>
    setCartItems((prev) => prev.filter((c) => c.productId !== productId));

  const subtotal = cartItems.reduce((s, i) => s + (i.lineTotal || 0), 0);
  const taxAmount = applyTax ? Math.round(subtotal * (Number(taxPercent) / 100)) : 0;
  const grandTotal = Math.max(0, subtotal - Number(discount || 0) + taxAmount);
  const effectivePaid = amountPaid === "" ? grandTotal : Number(amountPaid || 0);
  const balance = Math.max(0, grandTotal - effectivePaid);

  const filteredCustomers = customers.filter((c) =>
    c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  ).slice(0, 8);

  const filteredProducts = products.filter((p) =>
    productSearch && (
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(productSearch.toLowerCase())
    ) && (Number(p.qty) || 0) > 0
  ).slice(0, 6);

  const handleSave = async () => {
    if (cartItems.length === 0) { toast("Add at least one item", "warn"); return; }
    if (!selectedCustomer && !walkIn) { toast("Select a customer or mark as walk-in", "warn"); return; }

    setSaving(true);
    try {
      const billNo = "BILL" + Date.now().toString().slice(-6);
      const newSaleRef = doc(collection(db, "sales"));

      const billData = {
        shopId,
        billNo,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || "Walk-in",
        customerPhone: selectedCustomer?.phone || "",
        items: cartItems.map((c) => ({
          productId: c.productId,
          name: c.name,
          category: c.category,
          karat: c.karat,
          weight: c.weight,
          makingCharge: c.makingCharge,
          makingType: c.makingType,
          qty: c.qty,
          metalValue: c.metalValue,
          makingValue: c.makingValue,
          total: c.total,
          lineTotal: c.lineTotal,
        })),
        goldRate: rates.goldRate || 0,
        silverRate: rates.silverRate || 0,
        subtotal,
        discount: Number(discount || 0),
        taxPercent: applyTax ? Number(taxPercent) : 0,
        tax: taxAmount,
        total: grandTotal,
        paymentMode,
        amountPaid: effectivePaid,
        balance,
        notes: (notes || "").trim(),
        createdAt: serverTimestamp(),
        createdBy: userData?.name || userData?.id || "admin",
        createdByUid: userData?.id || null,
      };

      await runTransaction(db, async (tx) => {
        const productSnapshots = await Promise.all(
          billData.items
            .filter((i) => i.productId)
            .map((i) => tx.get(doc(db, "products", i.productId)))
        );

        const updates = [];
        productSnapshots.forEach((snap, idx) => {
          const item = billData.items.filter((i) => i.productId)[idx];
          if (!snap.exists()) {
            throw new Error(`Product no longer exists: ${item.name}`);
          }
          const liveQty = Number(snap.data().qty) || 0;
          if (item.qty > liveQty) {
            throw new Error(
              `Insufficient stock for ${item.name}: have ${liveQty}, need ${item.qty}`
            );
          }
          updates.push({ ref: snap.ref, newQty: liveQty - item.qty });
        });

        updates.forEach((u) => tx.update(u.ref, { qty: u.newQty }));
        tx.set(newSaleRef, billData);
      });

      setPrintBill({ ...billData, id: newSaleRef.id, createdAt: { toDate: () => new Date() } });
      toast(`Bill ${billNo} saved`, "success");

      setCartItems([]);
      setSelectedCustomer(null);
      setCustomerSearch("");
      setWalkIn(false);
      setDiscount(0);
      setAmountPaid("");
      setNotes("");
    } catch (err) {
      console.error("[billing.save]", err);
      toast(err?.message || "Failed to save bill", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {printBill && <PrintBill bill={printBill} shopData={shopData} onClose={() => setPrintBill(null)} />}

      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>
        🧾 New Sale / Billing
      </h1>

      <div style={{
        display: "flex", gap: 16, marginBottom: 20,
        padding: "12px 16px", background: "#FFFDE7",
        border: "1px solid #FDD835", borderRadius: 10, fontSize: 13,
      }}>
        <span>🥇 Gold: <strong>₹{Number(rates.goldRate || 0).toLocaleString("en-IN")}</strong>/10g</span>
        <span>🥈 Silver: <strong>₹{Number(rates.silverRate || 0).toLocaleString("en-IN")}</strong>/kg</span>
        {!rates.goldRate && <span style={{ color: "#E65100" }}>⚠️ Please set today's rates first!</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eee", padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#333", margin: "0 0 12px" }}>👤 Customer</h2>
            {selectedCustomer ? (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: "#E8F5E9", borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{selectedCustomer.phone}</div>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <input type="text" value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setWalkIn(false); }}
                    placeholder="Search customer by name or phone..."
                    style={{ flex: 1, padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 13, outline: "none" }} />
                  <button
                    onClick={() => { setWalkIn(true); setCustomerSearch(""); setSelectedCustomer(null); }}
                    style={{
                      padding: "9px 16px", fontSize: 12, fontWeight: 600,
                      background: walkIn ? "#1a1a2e" : "#f0f0f0",
                      color: walkIn ? "#fff" : "#555",
                      border: "none", borderRadius: 8, cursor: "pointer",
                    }}>Walk-in</button>
                </div>
                {customerSearch && filteredCustomers.map((c) => (
                  <div key={c.id}
                    onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setWalkIn(false); }}
                    style={{
                      padding: "10px 12px", cursor: "pointer", borderRadius: 8,
                      border: "1px solid #eee", marginBottom: 6,
                      display: "flex", justifyContent: "space-between",
                    }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
                {walkIn && (
                  <div style={{ padding: 10, background: "#FFF3E0", borderRadius: 8, fontSize: 13, color: "#E65100" }}>
                    ✓ Walk-in customer selected
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eee", padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#333", margin: "0 0 12px" }}>📦 Add Items</h2>
            <input type="text" value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search product by name or barcode..."
              style={{
                width: "100%", padding: "9px 12px", border: "1.5px solid #ddd",
                borderRadius: 8, fontSize: 13, outline: "none",
                boxSizing: "border-box", marginBottom: 10,
              }} />
            {filteredProducts.map((p) => {
              const calc = calcLine({ ...p, qty: 1 }, rates);
              return (
                <div key={p.id} onClick={() => addToCart(p)}
                  style={{
                    padding: "10px 14px", cursor: "pointer", borderRadius: 8,
                    border: "1px solid #eee", marginBottom: 6,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.category} · {p.karat} · {p.weight}g · Stock: {p.qty}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>₹{calc.total.toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>+ click to add</div>
                  </div>
                </div>
              );
            })}
          </div>

          {cartItems.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eee", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#333", margin: 0 }}>
                  🛒 Cart ({cartItems.length} {cartItems.length === 1 ? "item" : "items"})
                </h2>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    {["Item", "Qty", "Wt", "Metal ₹", "Making ₹", "Line Total", ""].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, color: "#888", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => (
                    <tr key={item.productId} style={{ borderTop: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{item.category} · {item.karat} · stock {item.availableStock}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <input type="number" min={1} max={item.availableStock} value={item.qty}
                          onChange={(e) => updateQty(item.productId, e.target.value)}
                          style={{
                            width: 60, padding: "4px 6px", border: "1px solid #ddd",
                            borderRadius: 6, fontSize: 13, textAlign: "center",
                          }} />
                      </td>
                      <td style={{ padding: "10px 12px" }}>{item.weight}g</td>
                      <td style={{ padding: "10px 12px" }}>₹{item.metalValue.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px" }}>₹{item.makingValue.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>₹{item.lineTotal.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => removeFromCart(item.productId)}
                          style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 18 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ position: "sticky", top: 20 }}>
          <div style={{
            background: "#fff", borderRadius: 14,
            border: "1px solid #eee", padding: 20,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 18px" }}>Bill Summary</h2>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#666" }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 13, color: "#666", flex: 1 }}>Discount (₹)</label>
              <input type="number" value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                style={{ width: 100, padding: "6px 10px", border: "1.5px solid #ddd",
                  borderRadius: 6, fontSize: 13, textAlign: "right", outline: "none" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />
                GST
              </label>
              {applyTax && (
                <select value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))}
                  style={{ width: 80, padding: 6, border: "1.5px solid #ddd", borderRadius: 6, fontSize: 13 }}>
                  {[1.5, 3, 5, 12, 18].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              )}
              {applyTax && <span style={{ fontSize: 13, fontWeight: 600 }}>₹{taxAmount.toLocaleString("en-IN")}</span>}
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "12px 0", borderTop: "2px solid #f0f0f0", marginBottom: 16,
            }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>
                ₹{grandTotal.toLocaleString("en-IN")}
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 6 }}>Payment Mode</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["cash", "card", "upi", "credit"].map((m) => (
                  <button key={m} onClick={() => setPaymentMode(m)}
                    style={{
                      flex: 1, padding: "8px 4px", fontSize: 11, fontWeight: 600,
                      border: "1.5px solid",
                      borderColor: paymentMode === m ? "#1a1a2e" : "#ddd",
                      background: paymentMode === m ? "#1a1a2e" : "#fff",
                      color: paymentMode === m ? "#fff" : "#555",
                      borderRadius: 8, cursor: "pointer", textTransform: "uppercase",
                    }}>{m}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 6 }}>
                Amount Paid (₹) <span style={{ fontWeight: 400, color: "#aaa" }}>blank = full</span>
              </label>
              <input type="number" value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder={String(grandTotal)}
                style={{
                  width: "100%", padding: 10, border: "1.5px solid #ddd",
                  borderRadius: 8, fontSize: 14, outline: "none",
                  boxSizing: "border-box", fontWeight: 600,
                }} />
            </div>

            {balance > 0 && (
              <div style={{
                padding: "8px 12px", background: "#FFEBEE", borderRadius: 8,
                fontSize: 13, color: "#C62828", marginBottom: 12, fontWeight: 600,
              }}>
                Balance Due: ₹{balance.toLocaleString("en-IN")}
              </div>
            )}

            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)..." rows={2}
              style={{
                width: "100%", padding: "8px 10px", border: "1.5px solid #ddd",
                borderRadius: 8, fontSize: 12, outline: "none",
                resize: "none", fontFamily: "inherit", boxSizing: "border-box",
                marginBottom: 14,
              }} />

            <button onClick={handleSave} disabled={saving || cartItems.length === 0}
              style={{
                width: "100%", padding: 14,
                fontSize: 15, fontWeight: 700,
                background: saving || cartItems.length === 0
                  ? "#ccc"
                  : "linear-gradient(135deg, #1a1a2e, #2d2d4e)",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: saving || cartItems.length === 0 ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(26,26,46,0.3)",
              }}>
              {saving ? "Saving…" : "💾 Save & Print Bill"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
