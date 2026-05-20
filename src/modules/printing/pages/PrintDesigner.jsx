import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, addDoc, deleteDoc, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import { assertShopId } from "../../../lib/utils";
import { logActivity } from "../../../lib/activityLog";
import { BLOCK_TYPES, getDefaultTemplate, pickDefault } from "../../../lib/printTemplate";
import PrintRenderer from "../../../components/PrintRenderer";

const SAMPLE_BILL = {
  kind: "bill", billNo: "BILL000123",
  createdAt: { toDate: () => new Date() },
  customerName: "Demo Customer", customerPhone: "9876543210",
  customerAddress: "Main Bazaar, Junagadh", customerGstin: "24ABCDE1234F1Z5",
  goldRate: 65000, silverRate: 92000,
  items: [
    { name: "Gold Ring", category: "Gold", karat: "22K", weight: 5.5, qty: 1, perUnit: 39850, lineTotal: 39850 },
    { name: "Gold Earrings", category: "Gold", karat: "18K", weight: 3.2, qty: 1, perUnit: 18760, lineTotal: 18760 },
  ],
  exchanges: [{ label: "Old Gold", weight: 2, purity: 0.916, value: 11920 }],
  subtotal: 58610, exchangeValue: 11920, discount: 100, taxPercent: 3, tax: 1408,
  total: 47998, amountPaid: 47998, balance: 0,
  payments: [{ mode: "cash", amount: 30000 }, { mode: "upi", amount: 17998, ref: "TXN8821" }],
};

export default function PrintTemplates() {
  const { userData, shopId, shopData } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const subRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(getDefaultTemplate("bill"));

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!shopId) return undefined;
    const u = onSnapshot(
      query(collection(db, "printTemplates"), where("shopId", "==", shopId)),
      (snap) => { setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error(err); setLoading(false); toast("Could not load templates", "error"); }
    );
    subRef.current = u;
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [shopId, toast]);

  const billDefault    = useMemo(() => pickDefault(templates, "bill"),    [templates]);
  const receiptDefault = useMemo(() => pickDefault(templates, "receipt"), [templates]);

  const startNew = (kind) => { setEditingId(null); setDraft(getDefaultTemplate(kind)); };
  const editExisting = (t) => { setEditingId(t.id); setDraft({ ...t }); };
  const toggleBlock = (id) => setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => b.id === id ? { ...b, enabled: !b.enabled } : b) }));
  const setProp = (id, key, val) => setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => b.id === id ? { ...b, [key]: val } : b) }));

  const save = async () => {
    if (!assertShopId(shopId, toast, "PrintTemplates.save")) return;
    if (!draft.name) { toast("Template name required", "warn"); return; }
    try {
      const data = { ...draft, shopId, updatedAt: serverTimestamp() };
      if (editingId) {
        await updateDoc(doc(db, "printTemplates", editingId), data);
        await logActivity({ shopId, action: "update", entity: "printTemplate", entityId: editingId, uid: userData?.id, name: userData?.name });
        toast("Template updated", "success");
      } else {
        data.createdAt = serverTimestamp();
        if (data.isDefault) {
          await Promise.all(templates.filter((t) => t.kind === data.kind && t.isDefault).map((t) =>
            updateDoc(doc(db, "printTemplates", t.id), { isDefault: false })));
        }
        const r = await addDoc(collection(db, "printTemplates"), data);
        setEditingId(r.id);
        await logActivity({ shopId, action: "create", entity: "printTemplate", entityId: r.id, uid: userData?.id, name: userData?.name, meta: { name: data.name, kind: data.kind } });
        toast("Template saved", "success");
      }
    } catch (err) { toast("Save failed: " + err.message, "error"); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    await deleteDoc(doc(db, "printTemplates", t.id));
    await logActivity({ shopId, action: "delete", entity: "printTemplate", entityId: t.id, uid: userData?.id, name: userData?.name });
    if (editingId === t.id) { setEditingId(null); setDraft(getDefaultTemplate("bill")); }
    toast("Template deleted", "success");
  };

  const setDefault = async (t) => {
    await Promise.all(templates.filter((x) => x.kind === t.kind && x.isDefault && x.id !== t.id).map((x) =>
      updateDoc(doc(db, "printTemplates", x.id), { isDefault: false })));
    await updateDoc(doc(db, "printTemplates", t.id), { isDefault: true });
    toast(`Set as default for ${t.kind}`, "success");
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>🧾 Print Templates</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>
            {templates.length} saved · default bill: {billDefault?.name || "built-in"} · default receipt: {receiptDefault?.name || "built-in"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => startNew("bill")}    className="btn btn-primary">+ New bill template</button>
          <button onClick={() => startNew("receipt")} className="btn btn-secondary">+ New receipt template</button>
        </div>
      </div>
      {loading ? <div style={{ padding: 30, color: "#888" }}>Loading…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 18 }}>
          <div>
            {templates.length > 0 && (
              <div className="card mb-4" style={{ overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #eee", fontSize: 12, fontWeight: 700, color: "#555" }}>Saved templates</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id} style={{ borderTop: "1px solid #f5f5f5" }}>
                        <td style={{ padding: "8px 14px", fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: "8px 14px", color: "#666" }}>{t.kind}</td>
                        <td style={{ padding: "8px 14px" }}>
                          {t.isDefault
                            ? <span style={{ fontSize: 10, padding: "2px 8px", background: "#1B5E20", color: "#fff", borderRadius: 12, fontWeight: 700 }}>DEFAULT</span>
                            : <button onClick={() => setDefault(t)} className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 10 }}>Make default</button>}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right" }}>
                          <button onClick={() => editExisting(t)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginRight: 6 }}>Edit</button>
                          <button onClick={() => remove(t)} className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Builder draft={draft} setDraft={setDraft} toggleBlock={toggleBlock} setProp={setProp} save={save} editingId={editingId} />
          </div>
          <div>
            <div className="card p-3" style={{ position: "sticky", top: 16, background: "#f8f9fa" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <strong style={{ color: "#1a1a2e" }}>Live preview</strong>
                <span>{draft.paperWidthMm}mm</span>
              </div>
              <div style={{ background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", maxHeight: "70vh", overflowY: "auto", padding: 4 }}>
                <PrintRenderer template={draft} doc={SAMPLE_BILL} shop={shopData} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Builder({ draft, setDraft, toggleBlock, setProp, save, editingId }) {
  return (
    <div className="card p-5">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 1fr", gap: 12, marginBottom: 14 }}>
        <div><label className="label">Template Name</label>
          <input value={draft.name || ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="input" placeholder="e.g. Diwali Bill" /></div>
        <div><label className="label">Kind</label>
          <select value={draft.kind || "bill"} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))} className="input bg-white">
            <option value="bill">Bill</option><option value="receipt">Receipt</option>
          </select></div>
        <div><label className="label">Paper Width (mm)</label>
          <select value={draft.paperWidthMm || 80} onChange={(e) => setDraft((d) => ({ ...d, paperWidthMm: Number(e.target.value) }))} className="input bg-white">
            <option value={58}>58 (small thermal)</option><option value={80}>80 (thermal)</option><option value={210}>210 (A4)</option>
          </select></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={!!draft.isDefault} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} />Use as default
          </label>
        </div>
      </div>
      <div style={{ marginBottom: 8, fontSize: 12, color: "#666" }}>
        Toggle blocks below; the preview updates live. Drag &amp; drop / resize is queued for Step 2.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {(draft.blocks || []).map((b) => (
          <div key={b.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, background: b.enabled ? "#fff" : "#fafafa" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={!!b.enabled} onChange={() => toggleBlock(b.id)} />
                <strong style={{ fontSize: 13 }}>{BLOCK_TYPES[b.type]?.label || b.type}</strong>
                <span style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase" }}>{b.type}</span>
              </label>
            </div>
            {b.enabled && <BlockOptions block={b} setProp={setProp} />}
          </div>
        ))}
      </div>
      <button onClick={save} className="btn btn-primary">{editingId ? "💾 Update template" : "💾 Save template"}</button>
    </div>
  );
}

function BlockOptions({ block, setProp }) {
  const opts = [];
  if (["logo", "company", "footer", "text"].includes(block.type)) {
    opts.push(
      <div key="align" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "#888" }}>Align</span>
        <select value={block.align || "left"} onChange={(e) => setProp(block.id, "align", e.target.value)}
          style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}>
          <option value="left">left</option><option value="center">center</option><option value="right">right</option>
        </select>
      </div>
    );
  }
  const subs = {
    company: ["showAddress", "showPhone", "showEmail", "showGst"],
    customer: ["showName", "showPhone", "showAddress", "showGstin"],
    meta: ["showBillNo", "showDate", "showRates"],
    items: ["showQty", "showWeight", "showPerUnit", "showLineTotal"],
    totals: ["showSubtotal", "showDiscount", "showTax", "showGrand", "showPaid", "showBalance"],
    signature: ["showImage"],
  };
  (subs[block.type] || []).forEach((key) => {
    opts.push(
      <label key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
        <input type="checkbox" checked={block[key] !== false} onChange={(e) => setProp(block.id, key, e.target.checked)} />
        {key.replace(/^show/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase()}
      </label>
    );
  });
  if (block.type === "text") {
    opts.push(<input key="text" value={block.text || ""} onChange={(e) => setProp(block.id, "text", e.target.value)}
      placeholder="Text…" style={{ flex: 1, padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />);
  }
  if (block.type === "qr") {
    opts.push(<label key="size" style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
      Size <input type="number" min={32} max={200} value={block.size || 64}
        onChange={(e) => setProp(block.id, "size", Number(e.target.value))}
        style={{ width: 60, padding: 4, border: "1px solid #ddd", borderRadius: 4 }} /></label>);
  }
  if (block.type === "logo") {
    opts.push(<label key="maxh" style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
      Max height <input type="number" min={20} max={120} value={block.maxHeight || 60}
        onChange={(e) => setProp(block.id, "maxHeight", Number(e.target.value))}
        style={{ width: 60, padding: 4, border: "1px solid #ddd", borderRadius: 4 }} /></label>);
  }
  if (opts.length === 0) return null;
  return <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 12, padding: 8, background: "#fafafa", borderRadius: 6 }}>{opts}</div>;
}
