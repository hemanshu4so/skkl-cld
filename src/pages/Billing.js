import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, query, where,
  doc, getDoc, serverTimestamp, updateDoc, increment
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

// ─── Bill Print Component ────────────────────────────────────────────────────
function PrintBill({ bill, shopData, onClose }) {
  const handlePrint = () => window.print();

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      zIndex: 1000, padding: "20px", overflowY: "auto"
    }}>
      <div style={{ background: "#fff", borderRadius: "12px", maxWidth: "500px", width: "100%" }}>
        {/* Print Actions */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #eee",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }} className="no-print">
          <span style={{ fontWeight: "600", fontSize: "15px" }}>Bill Preview</span>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handlePrint}
              style={{
                padding: "8px 20px", background: "#1a1a2e", color: "#fff",
                border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px"
              }}
            >🖨️ Print</button>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px", background: "#f0f0f0", color: "#333",
                border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px"
              }}
            >✕ Close</button>
          </div>
        </div>

        {/* Actual Bill */}
        <div id="printArea" style={{ padding: "24px", fontFamily: "monospace" }}>
          {/* Shop Header */}
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#1a1a2e" }}>
              {shopData?.name || "SKKL Jewellers"}
            </div>
            {shopData?.address && <div style={{ fontSize: "12px", color: "#555" }}>{shopData.address}</div>}
            {shopData?.phone && <div style={{ fontSize: "12px", color: "#555" }}>Ph: {shopData.phone}</div>}
            {shopData?.gst && <div style={{ fontSize: "12px", color: "#555" }}>GST: {shopData.gst}</div>}
          </div>

          <div style={{ borderTop: "2px dashed #333", borderBottom: "2px dashed #333", padding: "8px 0", marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span>Bill No: <strong>{bill.billNo}</strong></span>
              <span>{new Date(bill.createdAt?.toDate ? bill.createdAt.toDate() : Date.now()).toLocaleDateString("en-IN")}</span>
            </div>
            <div style={{ fontSize: "12px", marginTop: "4px" }}>
              Customer: <strong>{bill.customerName || "Walk-in"}</strong>
              {bill.customerPhone && <span> | Ph: {bill.customerPhone}</span>}
            </div>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              Gold Rate: ₹{bill.goldRate}/10g | Silver Rate: ₹{bill.silverRate}/kg
            </div>
          </div>

          {/* Items */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left", padding: "4px 0" }}>Item</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Wt(g)</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Metal</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Making</th>
                <th style={{ textAlign: "right", padding: "4px 0" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items?.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px dotted #ddd" }}>
                  <td style={{ padding: "5px 0", verticalAlign: "top" }}>
                    <div>{item.name}</div>
                    <div style={{ fontSize: "10px", color: "#777" }}>{item.category} {item.karat}</div>
                  </td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>{item.weight}</td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>₹{Number(item.metalValue || 0).toLocaleString("en-IN")}</td>
                  <td style={{ textAlign: "right", padding: "5px 4px" }}>₹{Number(item.makingValue || 0).toLocaleString("en-IN")}</td>
                  <td style={{ textAlign: "right", padding: "5px 0", fontWeight: "700" }}>₹{Number(item.total || 0).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ borderTop: "1px solid #333", paddingTop: "8px", fontSize: "12px" }}>
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
              fontWeight: "800", fontSize: "16px",
              borderTop: "2px solid #333", marginTop: "6px", paddingTop: "6px"
            }}>
              <span>TOTAL</span>
              <span>₹{Number(bill.total || 0).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
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

          <div style={{ borderTop: "2px dashed #333", marginTop: "12px", paddingTop: "8px", textAlign: "center", fontSize: "11px", color: "#777" }}>
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

// ─── Main Billing Page ───────────────────────────────────────────────────────
export default function Billing() {
  const { userData, shopData } = useAuth();
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
  const [msg, setMsg] = useState("");
  const [printBill, setPrintBill] = useState(null);

  // Load rates
  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(doc(db, "rates", shopId), (snap) => {
      if (snap.exists()) setRates(snap.data());
    });
    return () => unsub();
  }, [shopId]);

  // Load customers
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "customers"), where("shopId", "==", shopId));
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  // Load products
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "products"), where("shopId", "==", shopId));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [shopId]);

  // ── Calculate item total ──────────────────────────────────────────────────
  const calcItemTotal = (item) => {
    const rate = item.category === "Gold"
      ? (rates.goldRate || 0) / 10  // per gram
      : item.category === "Silver"
      ? (rates.silverRate || 0) / 1000  // silver rate per kg → per gram
      : 0;

    const metalValue = item.weight * rate;

    let makingValue = 0;
    if (item.makingType === "per_gram") {
      makingValue = item.weight * (item.makingCharge || 0);
    } else if (item.makingType === "percent") {
      makingValue = metalValue * ((item.makingCharge || 0) / 100);
    } else {
      makingValue = item.makingCharge || 0;
    }

    return {
      metalValue: Math.round(metalValue),
      makingValue: Math.round(makingValue),
      total: Math.round(metalValue + makingValue)
    };
  };

  const addToCart = (product) => {
    const exists = cartItems.find(c => c.productId === product.id);
    if (exists) return;
    const { metalValue, makingValue, total } = calcItemTotal(product);
    setCartItems(prev => [...prev, {
      productId: product.id,
      name: product.name,
      category: product.category,
      karat: product.karat,
      weight: product.weight,
      makingCharge: product.makingCharge || 0,
      makingType: product.makingType || "per_gram",
      metalValue, makingValue, total,
      qty: 1
    }]);
    setProductSearch("");
  };

  const removeFromCart = (productId) => {
    setCartItems(prev => prev.filter(c => c.productId !== productId));
  };

  const subtotal = cartItems.reduce((sum, i) => sum + i.total, 0);
  const taxAmount = applyTax ? Math.round(subtotal * (taxPercent / 100)) : 0;
  const grandTotal = subtotal - Number(discount || 0) + taxAmount;
  const balance = grandTotal - Number(amountPaid || 0);

  const filteredCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  ).slice(0, 8);

  const filteredProducts = products.filter(p =>
    productSearch && (
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(productSearch.toLowerCase())
    ) && p.qty > 0
  ).slice(0, 6);

  // ── Save Bill ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (cartItems.length === 0) { setMsg("⚠️ Add at least one item"); return; }
    if (!selectedCustomer && !walkIn) { setMsg("⚠️ Select customer or mark as walk-in"); return; }
    setSaving(true);

    try {
      const billNo = "BILL" + Date.now().toString().slice(-6);
      const billData = {
        shopId,
        billNo,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || "Walk-in",
        customerPhone: selectedCustomer?.phone || "",
        items: cartItems,
        goldRate: rates.goldRate,
        silverRate: rates.silverRate,
        subtotal,
        discount: Number(discount || 0),
        taxPercent: applyTax ? taxPercent : 0,
        tax: taxAmount,
        total: grandTotal,
        paymentMode,
        amountPaid: Number(amountPaid || grandTotal),
        balance: balance > 0 ? balance : 0,
        notes,
        createdAt: serverTimestamp(),
        createdBy: userData?.name || "admin"
      };

      const saleRef = await addDoc(collection(db, "sales"), billData);

      // Decrement product qty
      for (const item of cartItems) {
        if (item.productId) {
          await updateDoc(doc(db, "products", item.productId), {
            qty: increment(-1)
          });
        }
      }

      // Show print
      setPrintBill({ ...billData, id: saleRef.id, createdAt: { toDate: () => new Date() } });

      // Reset
      setCartItems([]);
      setSelectedCustomer(null);
      setCustomerSearch("");
      setDiscount(0);
      setAmountPaid("");
      setNotes("");
      setMsg("✅ Bill created!");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg("❌ Error: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px" }}>
      {printBill && (
        <PrintBill
          bill={printBill}
          shopData={shopData}
          onClose={() => setPrintBill(null)}
        />
      )}

      <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e", marginBottom: "6px" }}>
        🧾 New Sale / Billing
      </h1>

      {/* Rates Banner */}
      <div style={{
        display: "flex", gap: "16px", marginBottom: "20px",
        padding: "12px 16px", background: "#FFFDE7",
        border: "1px solid #FDD835", borderRadius: "10px", fontSize: "13px"
      }}>
        <span>🥇 Gold: <strong>₹{Number(rates.goldRate || 0).toLocaleString("en-IN")}</strong>/10g</span>
        <span>🥈 Silver: <strong>₹{Number(rates.silverRate || 0).toLocaleString("en-IN")}</strong>/kg</span>
        {!rates.goldRate && <span style={{ color: "#E65100" }}>⚠️ Please set today's rates first!</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "20px", alignItems: "start" }}>
        {/* LEFT: Customer + Products */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Customer Selection */}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #eee", padding: "18px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#333", margin: "0 0 12px" }}>
              👤 Customer
            </h2>
            {selectedCustomer ? (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: "#E8F5E9", borderRadius: "8px"
              }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: "12px", color: "#555" }}>{selectedCustomer.phone}</div>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: "18px" }}>×</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <input
                    type="text" value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setWalkIn(false); }}
                    placeholder="Search customer by name or phone..."
                    style={{
                      flex: 1, padding: "9px 12px", border: "1.5px solid #ddd",
                      borderRadius: "8px", fontSize: "13px", outline: "none"
                    }}
                  />
                  <button
                    onClick={() => { setWalkIn(true); setCustomerSearch(""); setSelectedCustomer(null); }}
                    style={{
                      padding: "9px 16px", fontSize: "12px", fontWeight: "600",
                      background: walkIn ? "#1a1a2e" : "#f0f0f0",
                      color: walkIn ? "#fff" : "#555",
                      border: "none", borderRadius: "8px", cursor: "pointer"
                    }}
                  >Walk-in</button>
                </div>
                {customerSearch && filteredCustomers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setWalkIn(false); }}
                    style={{
                      padding: "10px 12px", cursor: "pointer", borderRadius: "8px",
                      border: "1px solid #eee", marginBottom: "6px",
                      display: "flex", justifyContent: "space-between",
                      transition: "background 0.1s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <span style={{ fontWeight: "600", fontSize: "13px" }}>{c.name}</span>
                    <span style={{ fontSize: "12px", color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
                {walkIn && (
                  <div style={{ padding: "10px", background: "#FFF3E0", borderRadius: "8px", fontSize: "13px", color: "#E65100" }}>
                    ✓ Walk-in customer selected
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add Products to Cart */}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #eee", padding: "18px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#333", margin: "0 0 12px" }}>
              📦 Add Items
            </h2>
            <input
              type="text" value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Search product by name or barcode..."
              style={{
                width: "100%", padding: "9px 12px", border: "1.5px solid #ddd",
                borderRadius: "8px", fontSize: "13px", outline: "none",
                boxSizing: "border-box", marginBottom: "10px"
              }}
            />
            {filteredProducts.map(p => {
              const { total } = calcItemTotal(p);
              return (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  style={{
                    padding: "10px 14px", cursor: "pointer", borderRadius: "8px",
                    border: "1px solid #eee", marginBottom: "6px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    transition: "background 0.1s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                  onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                >
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "13px" }}>{p.name}</div>
                    <div style={{ fontSize: "11px", color: "#888" }}>{p.category} · {p.karat} · {p.weight}g · Qty: {p.qty}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: "700", fontSize: "14px", color: "#1a1a2e" }}>₹{total.toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>+ click to add</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cart */}
          {cartItems.length > 0 && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #eee", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#333", margin: 0 }}>
                  🛒 Cart ({cartItems.length} items)
                </h2>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    {["Item", "Wt", "Metal ₹", "Making ₹", "Total", ""].map(h => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: "11px", color: "#888", textAlign: "left", fontWeight: "600" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map(item => (
                    <tr key={item.productId} style={{ borderTop: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: "600" }}>{item.name}</div>
                        <div style={{ fontSize: "11px", color: "#888" }}>{item.category} · {item.karat}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{item.weight}g</td>
                      <td style={{ padding: "10px 12px" }}>₹{item.metalValue.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px" }}>₹{item.makingValue.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px", fontWeight: "700" }}>₹{item.total.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: "18px" }}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT: Summary + Payment */}
        <div style={{ position: "sticky", top: "20px" }}>
          <div style={{
            background: "#fff", borderRadius: "14px",
            border: "1px solid #eee", padding: "20px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)"
          }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 18px" }}>Bill Summary</h2>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
              <span style={{ color: "#666" }}>Subtotal</span>
              <span style={{ fontWeight: "600" }}>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>

            {/* Discount */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <label style={{ fontSize: "13px", color: "#666", flex: 1 }}>Discount (₹)</label>
              <input
                type="number" value={discount}
                onChange={e => setDiscount(e.target.value)}
                style={{
                  width: "100px", padding: "6px 10px", border: "1.5px solid #ddd",
                  borderRadius: "6px", fontSize: "13px", textAlign: "right", outline: "none"
                }}
              />
            </div>

            {/* Tax */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <label style={{ fontSize: "13px", color: "#666", display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                <input type="checkbox" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} />
                GST
              </label>
              {applyTax && (
                <select
                  value={taxPercent}
                  onChange={e => setTaxPercent(Number(e.target.value))}
                  style={{ width: "80px", padding: "6px", border: "1.5px solid #ddd", borderRadius: "6px", fontSize: "13px" }}
                >
                  {[1.5, 3, 5, 12, 18].map(v => <option key={v} value={v}>{v}%</option>)}
                </select>
              )}
              {applyTax && <span style={{ fontSize: "13px", fontWeight: "600" }}>₹{taxAmount.toLocaleString("en-IN")}</span>}
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "12px 0", borderTop: "2px solid #f0f0f0",
              marginBottom: "16px"
            }}>
              <span style={{ fontSize: "16px", fontWeight: "700" }}>Total</span>
              <span style={{ fontSize: "20px", fontWeight: "800", color: "#1a1a2e" }}>
                ₹{grandTotal.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Payment Mode */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#666", display: "block", marginBottom: "6px" }}>Payment Mode</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {["cash", "card", "upi", "credit"].map(m => (
                  <button
                    key={m} onClick={() => setPaymentMode(m)}
                    style={{
                      flex: 1, padding: "8px 4px", fontSize: "11px", fontWeight: "600",
                      border: "1.5px solid",
                      borderColor: paymentMode === m ? "#1a1a2e" : "#ddd",
                      background: paymentMode === m ? "#1a1a2e" : "#fff",
                      color: paymentMode === m ? "#fff" : "#555",
                      borderRadius: "8px", cursor: "pointer",
                      textTransform: "uppercase"
                    }}
                  >{m}</button>
                ))}
              </div>
            </div>

            {/* Amount Paid */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#666", display: "block", marginBottom: "6px" }}>Amount Paid (₹)</label>
              <input
                type="number" value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                placeholder={String(grandTotal)}
                style={{
                  width: "100%", padding: "10px", border: "1.5px solid #ddd",
                  borderRadius: "8px", fontSize: "14px", outline: "none",
                  boxSizing: "border-box", fontWeight: "600"
                }}
              />
            </div>

            {amountPaid && balance > 0 && (
              <div style={{
                padding: "8px 12px", background: "#FFEBEE", borderRadius: "8px",
                fontSize: "13px", color: "#C62828", marginBottom: "12px", fontWeight: "600"
              }}>
                Balance Due: ₹{balance.toLocaleString("en-IN")}
              </div>
            )}

            {/* Notes */}
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)..."
              rows={2}
              style={{
                width: "100%", padding: "8px 10px", border: "1.5px solid #ddd",
                borderRadius: "8px", fontSize: "12px", outline: "none",
                resize: "none", fontFamily: "inherit", boxSizing: "border-box",
                marginBottom: "14px"
              }}
            />

            {msg && (
              <div style={{
                padding: "10px", background: msg.startsWith("✅") ? "#E8F5E9" : "#FFF3E0",
                borderRadius: "8px", fontSize: "13px", marginBottom: "10px"
              }}>{msg}</div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || cartItems.length === 0}
              style={{
                width: "100%", padding: "14px",
                fontSize: "15px", fontWeight: "700",
                background: saving || cartItems.length === 0
                  ? "#ccc"
                  : "linear-gradient(135deg, #1a1a2e, #2d2d4e)",
                color: "#fff", border: "none", borderRadius: "10px",
                cursor: saving || cartItems.length === 0 ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(26,26,46,0.3)"
              }}
            >
              {saving ? "Saving..." : "💾 Save & Print Bill"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
