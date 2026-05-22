// src/pages/Inventory.js  —  Phase 1
//
// Jewellery-grade inventory:
//   - HUID (BIS hallmark unique ID)
//   - Stones (array of {type, weight, count, value})
//   - Wastage % and Hallmark charges
//   - Product photos (Firebase Storage)
//   - Barcode generator + bulk print
//   - Low-stock alert threshold + visual flag
//   - Bulk CSV import
//   - Activity log on add / edit / delete

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@fb/client";
import {
  collection, addDoc, onSnapshot, deleteDoc,
  doc, query, where, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useToast } from "../../../hooks/useToast";
import { useDebounced } from "../../../hooks/useDebounced";
import useShortcut from "../../../hooks/useShortcut";
import useAutoFocus from "../../../hooks/useAutoFocus";
import QRImage from "../../../components/QRImage";
import { createItemWithIdentity } from "@fb/items";
import QrScanInput from "../components/QrScanInput";
import { TAG_FORMATS, getFormat, FIELD_LABELS, SCALE } from "../../../lib/tagFormats";
import { pickDefaultBarcode } from "../../../lib/barcodeTemplate";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { assertShopId } from "../../../lib/utils";
import { CATEGORIES, KARATS, ITEM_TYPES, MAKING_TYPES } from "../../../lib/constants";
import { logActivity } from "../../../lib/activityLog";
import { uploadShopFile } from "../../../lib/upload";
import { parseCSV } from "../../../lib/csv";

const emptyForm = {
  name: "", itemType: "Ring", category: "Gold",
  karat: "22K", weight: "", makingCharge: "", makingType: "per_gram",
  qty: "1", price: "", barcode: "", description: "",
  // Phase 1 jewellery fields
  huid: "",
  stones: [],            // [{type, weight, count, value}]
  wastagePct: "",
  hallmarkCharge: "",
  netWeight: "",
  lowStockThreshold: "2",
  photos: [],            // [{url, path}]
};

// Generates a short shop-unique-ish barcode "SKKL-CAT-####"
function generateBarcode(category) {
  const code = (category || "X").slice(0, 1).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SKKL-${code}-${rand}`;
}

// Visual barcode (Code 128-ish stripe rendering — readable to most scanners
// when printed at >= 4cm wide. For perfect spec compliance use a real lib.)
function BarcodeStripes({ value }) {
  if (!value) return null;
  const stripes = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    for (let b = 0; b < 8; b++) {
      const on = (code >> b) & 1;
      stripes.push(
        <div key={`${i}-${b}`} style={{
          display: "inline-block", width: on ? 2 : 1, height: 40,
          background: on ? "#000" : "#fff", marginRight: 1,
        }} />
      );
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "flex-end", padding: 4 }}>{stripes}</div>
      <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}


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

export default function Inventory() {
  const { userData, shopData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  // Bulk operations
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [printSet, setPrintSet] = useState(new Set());
  const [printOpen, setPrintOpen] = useState(false);

  // Live products list — single subscription per shopId
  const productsUnsubRef = useRef(null);
  useEffect(() => {
    // Tear down any prior listener before subscribing again.
    if (productsUnsubRef.current) {
      productsUnsubRef.current();
      productsUnsubRef.current = null;
    }
    if (!shopId) return undefined;
    const q = query(
      collection(db, "products"),
      where("shopId", "==", shopId)
    );
    const unsub = onSnapshot(q,
      (snap) => {
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingList(false);
      },
      (err) => { console.error("[inventory] snapshot error:", err); setLoadingList(false); toast("Could not load products — check Firestore rules / connection.", "error"); }
    );
    productsUnsubRef.current = unsub;
    return () => {
      if (productsUnsubRef.current) {
        productsUnsubRef.current();
        productsUnsubRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const searchInputRef = useRef(null);
  const productNameRef = useAutoFocus(showForm ? (editId || "new") : "closed");
  useShortcut("ctrl+n", () => { setShowForm(true); setEditId(null); setForm(emptyForm); });
  useShortcut("ctrl+b", () => searchInputRef.current?.focus());

  const handleSearchKey = (e) => {
    if (e.key !== "Enter") return;
    const code = (search || "").trim();
    if (!code) return;
    const hit = products.find(
      (p) => (p.barcode || "").toLowerCase() === code.toLowerCase()
        || (p.huid || "").toLowerCase() === code.toLowerCase()
    );
    if (hit) {
      handleEdit(hit);
      setSearch("");
      toast(`Scanned: ${hit.name}`, "success");
    }
  };

    const handleAddStone = () => {
    setForm((f) => ({
      ...f, stones: [...(f.stones || []), { type: "Diamond", weight: "", count: "1", value: "" }],
    }));
  };
  const handleStoneChange = (i, field, val) =>
    setForm((f) => ({
      ...f,
      stones: f.stones.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)),
    }));
  const handleRemoveStone = (i) =>
    setForm((f) => ({ ...f, stones: f.stones.filter((_, idx) => idx !== i) }));

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploads = await Promise.all(files.map((file) =>
        uploadShopFile({ shopId, kind: "products", entityId: editId || "_draft", file })
      ));
      setForm((f) => ({ ...f, photos: [...(f.photos || []), ...uploads] }));
      toast(`Uploaded ${uploads.length} photo(s)`, "success");
    } catch (err) {
      toast("Upload failed: " + err.message, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  const handleRemovePhoto = (i) =>
    setForm((f) => ({ ...f, photos: (f.photos || []).filter((_, idx) => idx !== i) }));

  const handleSave = async () => {

    // QR inventory create flow
    try {
      const created = await createItemWithIdentity(
        {
          name: form.name || "",
          category: form.category || "",
          grossWeight: Number(form.grossWeight || 0),
          netWeight: Number(form.netWeight || 0),
          sellingPrice: Number(form.price || 0),
          status: "available",
        },
        {
          shopId,
          uid: auth?.currentUser?.uid || "system",
          employeeId: null,
        }
      );

      console.log("✅ QR ITEM CREATED:", created);

    } catch (err) {
      console.error("QR create failed:", err);
    }

    if (!assertShopId(shopId, toast, "Inventory.handleSave")) return;
    if (!form.name || !form.weight) {
      toast("Product name and weight are required", "warn");
      return;
    }
    setSaving(true);
    try {
      // Auto-generate barcode if blank
      const barcode = form.barcode?.trim() || generateBarcode(form.category);

      const stones = (form.stones || [])
        .filter((s) => s.type)
        .map((s) => ({
          type: s.type,
          weight: Number(s.weight) || 0,
          count: Number(s.count) || 1,
          value: Number(s.value) || 0,
        }));
      const stoneValue = stones.reduce((s, x) => s + (x.value || 0), 0);

      const data = {
        shopId,
        name: form.name.trim(),
        itemType: form.itemType,
        category: form.category,
        karat: form.karat,
        weight: Number(form.weight) || 0,
        netWeight: Number(form.netWeight) || Number(form.weight) || 0,
        makingCharge: Number(form.makingCharge) || 0,
        makingType: form.makingType,
        wastagePct: Number(form.wastagePct) || 0,
        hallmarkCharge: Number(form.hallmarkCharge) || 0,
        qty: Number(form.qty) || 1,
        price: Number(form.price) || 0,
        barcode,
        huid: form.huid?.trim() || "",
        description: form.description || "",
        stones, stoneValue,
        photos: form.photos || [],
        lowStockThreshold: Number(form.lowStockThreshold) || 0,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        const before = products.find((p) => p.id === editId);
        await updateDoc(doc(db, "products", editId), data);
        await logActivity({
          shopId, action: "update", entity: "product", entityId: editId,
          uid: userData?.id, name: userData?.name,
          before, after: data,
        });
        toast("Product updated!", "success");
      } else {
        data.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, "products"), data);
        await logActivity({
          shopId, action: "create", entity: "product", entityId: ref.id,
          uid: userData?.id, name: userData?.name, after: data,
        });
        toast("Product added!", "success");
      }

      setForm(emptyForm); setEditId(null); setShowForm(false);
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
    setSaving(false);
  };

  const handleEdit = (p) => {
    setForm({
      name: p.name || "", itemType: p.itemType || "Ring",
      category: p.category || "Gold", karat: p.karat || "22K",
      weight: String(p.weight || ""), netWeight: String(p.netWeight || ""),
      makingCharge: String(p.makingCharge || ""),
      makingType: p.makingType || "per_gram",
      wastagePct: String(p.wastagePct || ""),
      hallmarkCharge: String(p.hallmarkCharge || ""),
      qty: String(p.qty || 1), price: String(p.price || ""),
      barcode: p.barcode || "", description: p.description || "",
      huid: p.huid || "",
      stones: (p.stones || []).map((s) => ({
        type: s.type, weight: String(s.weight || ""),
        count: String(s.count || 1), value: String(s.value || ""),
      })),
      photos: p.photos || [],
      lowStockThreshold: String(p.lowStockThreshold ?? 2),
    });
    setEditId(p.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (p) => {
    if (!assertShopId(shopId, toast, "Inventory.handleDelete")) return;
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try {
      await deleteDoc(doc(db, "products", p.id));
      await logActivity({
        shopId, action: "delete", entity: "product", entityId: p.id,
        uid: userData?.id, name: userData?.name, before: p,
      });
      toast("Product deleted", "success");
    } catch (err) {
      toast("Delete failed: " + err.message, "error");
    }
  };

  // ── Bulk CSV import ───────────────────────────────────────────────────
  const handleCsvImport = async () => {
    if (!assertShopId(shopId, toast, "Inventory.handleCsvImport")) return;
    if (!csvText.trim()) { toast("Paste CSV content first", "warn"); return; }
    setCsvBusy(true);
    try {
      const { data } = parseCSV(csvText);
      let added = 0, failed = 0;
      for (const row of data) {
        try {
          await addDoc(collection(db, "products"), {
            shopId,
            name: row.name || row.Name || "",
            itemType: row.itemType || row.type || "Other",
            category: row.category || "Gold",
            karat: row.karat || row.purity || "22K",
            weight: Number(row.weight) || 0,
            netWeight: Number(row.netWeight) || Number(row.weight) || 0,
            makingCharge: Number(row.makingCharge) || 0,
            makingType: row.makingType || "per_gram",
            wastagePct: Number(row.wastagePct) || 0,
            hallmarkCharge: Number(row.hallmarkCharge) || 0,
            qty: Number(row.qty) || 1,
            price: Number(row.price) || 0,
            barcode: row.barcode || generateBarcode(row.category || "Gold"),
            huid: row.huid || "",
            description: row.description || "",
            stones: [], stoneValue: 0, photos: [],
            lowStockThreshold: Number(row.lowStockThreshold) || 2,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          added++;
        } catch { failed++; }
      }
      await logActivity({
        shopId, action: "bulk_import", entity: "product",
        uid: userData?.id, name: userData?.name,
        meta: { added, failed, total: data.length },
      });
      toast(`Imported ${added} of ${data.length} (${failed} failed)`, added ? "success" : "warn");
      setCsvText(""); setCsvOpen(false);
    } catch (err) {
      toast("CSV parse failed: " + err.message, "error");
    } finally {
      setCsvBusy(false);
    }
  };

  // ── Filtering ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => sortByCreatedDesc(products).filter((p) => {
    const matchCat = filterCat === "All" || p.category === filterCat;
    const ms = !debouncedSearch ||
      p.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      p.huid?.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchCat && ms;
  }), [products, filterCat, debouncedSearch]);

  const lowStock = useMemo(
    () => products.filter((p) => Number(p.qty) <= Number(p.lowStockThreshold ?? 2)),
    [products]
  );

  const togglePrint = (id) => {
    setPrintSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const printSelected = products.filter((p) => printSet.has(p.id));

  // ── small inputs ──────────────────────────────────────────────────────
  const inp = (label, field, type = "text", placeholder = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        placeholder={placeholder}
        style={{ padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }}
      />
    </div>
  );
  const sel = (label, field, options) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>{label}</label>
      <select
        value={form[field]}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        style={{ padding: "9px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", background: "#fff" }}
      >
        {options.map((o) =>
          typeof o === "string"
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>📦 Inventory</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>
            {products.length} products · Gold {products.filter((p) => p.category === "Gold").length} · Silver {products.filter((p) => p.category === "Silver").length}
            {lowStock.length > 0 && (
              <span style={{ color: "#E65100", marginLeft: 12, fontWeight: 600 }}>
                ⚠️ {lowStock.length} low-stock
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setCsvOpen(true)} className="btn btn-secondary">📥 Import CSV</button>
          <button onClick={() => { setPrintOpen(true); }} disabled={printSet.size === 0} className="btn btn-secondary">
            🏷️ Print Tags ({printSet.size})
          </button>
          <button onClick={() => { setShowForm(!showForm); setForm(emptyForm); setEditId(null); }} className="btn btn-primary">
            {showForm ? "✕ Cancel" : "+ Add Product"}
          </button>
        </div>
      </div>

      {/* CSV import modal */}
      {csvOpen && (
        <div className="card p-5 mb-4" style={{ background: "#FFFDE7", borderColor: "#FDD835" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>Bulk import — paste CSV</h3>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px" }}>
            Headers: <code>name,itemType,category,karat,weight,netWeight,makingCharge,makingType,wastagePct,hallmarkCharge,qty,price,barcode,huid,description,lowStockThreshold</code>
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder="name,category,karat,weight,qty,price&#10;Gold Ring 5g,Gold,22K,5.5,3,18000"
            style={{ width: "100%", padding: 10, border: "1.5px solid #ddd", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleCsvImport} disabled={csvBusy} className="btn btn-primary">
              {csvBusy ? "Importing…" : "Import"}
            </button>
            <button onClick={() => { setCsvOpen(false); setCsvText(""); }} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Print sheet modal */}
      {printOpen && (
        <PrintTags items={printSelected} shopConfig={shopData?.tagConfig} barcodeTemplates={shopData?.barcodeTemplates || []} shopData={shopData} onClose={() => { setPrintOpen(false); setPrintSet(new Set()); }} />
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", marginTop: 0, marginBottom: 18 }}>
            {editId ? "✏️ Edit Product" : "➕ Add New Product"}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
            {inp("Product Name *", "name", "text", "Gold Necklace 25g")}
            {sel("Item Type", "itemType", ITEM_TYPES)}
            {sel("Category *", "category", CATEGORIES)}
            {sel("Karat / Purity", "karat", KARATS)}
            {inp("Gross Weight (g) *", "weight", "number", "5.5")}
            {inp("Net Weight (g)", "netWeight", "number", "5.0")}
            {inp("Quantity", "qty", "number", "1")}
            {inp("Low-Stock Threshold", "lowStockThreshold", "number", "2")}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
            {sel("Making Charge Type", "makingType", MAKING_TYPES)}
            {inp(`Making Charge`, "makingCharge", "number", "250")}
            {inp("Wastage %", "wastagePct", "number", "8")}
            {inp("Hallmark Charge (₹)", "hallmarkCharge", "number", "45")}
            {inp("Selling Price override (₹)", "price", "number", "0 = auto")}
            {inp("Barcode (auto if blank)", "barcode", "text", "SKKL-G-XXXXXX")}
            {inp("HUID (BIS)", "huid", "text", "6-char hallmark id")}
          </div>

          {/* Stones repeater */}
          <div style={{ marginBottom: 16, padding: 14, background: "#F5F5F5", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>💎 Stones / Diamonds ({form.stones.length})</strong>
              <button onClick={handleAddStone} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>
                + Add stone
              </button>
            </div>
            {form.stones.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 32px", gap: 8, marginBottom: 8 }}>
                <input value={s.type} onChange={(e) => handleStoneChange(i, "type", e.target.value)} placeholder="Diamond / Ruby" className="input" />
                <input type="number" value={s.weight} onChange={(e) => handleStoneChange(i, "weight", e.target.value)} placeholder="Wt (carat)" className="input" />
                <input type="number" value={s.count} onChange={(e) => handleStoneChange(i, "count", e.target.value)} placeholder="Count" className="input" />
                <input type="number" value={s.value} onChange={(e) => handleStoneChange(i, "value", e.target.value)} placeholder="Value ₹" className="input" />
                <button onClick={() => handleRemoveStone(i)} style={{ background: "#FFEBEE", color: "#C62828", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            ))}
          </div>

          {/* Photos */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">📷 Photos</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              {(form.photos || []).map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={p.url} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }} />
                  <button onClick={() => handleRemovePhoto(i)} style={{
                    position: "absolute", top: -6, right: -6, width: 22, height: 22,
                    borderRadius: "50%", border: "none", background: "#C62828", color: "#fff",
                    cursor: "pointer", fontSize: 12,
                  }}>×</button>
                </div>
              ))}
              <label style={{
                width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px dashed #aaa", borderRadius: 8, cursor: uploading ? "wait" : "pointer",
                fontSize: 28, color: "#aaa",
              }}>
                {uploading ? "…" : "+"}
                <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ display: "none" }} disabled={uploading} />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
            <label className="label">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Design details, notes..."
              rows={2}
              className="input"
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : editId ? "💾 Update Product" : "💾 Save Product"}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          ref={searchInputRef} type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKey}
          placeholder="🔍 Search / scan barcode / HUID  (Ctrl+B)"
          style={{ padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, outline: "none", width: 320 }}
        />
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c} onClick={() => setFilterCat(c)}
            style={{
              padding: "8px 16px", borderRadius: 20, border: "1.5px solid",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              borderColor: filterCat === c ? "#1a1a2e" : "#ddd",
              background: filterCat === c ? "#1a1a2e" : "#fff",
              color: filterCat === c ? "#fff" : "#555",
            }}
          >{c}</button>
        ))}
      </div>

      {/* Products table */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", overflow: "hidden" }}>
        {loadingList ? (
          <SkeletonTable rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center", color: "#bbb" }}>
            No products found. Add one above or import via CSV.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                {["☑", "Photo", "Name", "HUID", "Type", "Category", "Karat", "Weight", "Stones", "Qty", "Price", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "#888", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const isLow = Number(p.qty) <= Number(p.lowStockThreshold ?? 2);
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <input type="checkbox" checked={printSet.has(p.id)} onChange={() => togglePrint(p.id)} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {p.photos?.[0]?.url
                        ? <img src={p.photos[0].url} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />
                        : <div style={{ width: 36, height: 36, background: "#f0f0f0", borderRadius: 6 }} />
                      }
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{p.name}</div>
                      {p.barcode && <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{p.barcode}</div>}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "monospace", color: "#555" }}>{p.huid || "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "#555" }}>{p.itemType}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
                        background: p.category === "Gold" ? "#FFF8E1" : p.category === "Silver" ? "#F5F5F5" : p.category === "Diamond" ? "#E3F2FD" : "#F3E5F5",
                        color: p.category === "Gold" ? "#B8860B" : p.category === "Silver" ? "#666" : p.category === "Diamond" ? "#1565C0" : "#6A1B9A",
                      }}>{p.category}</span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#555" }}>{p.karat}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>{p.weight}g</td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "#555" }}>{p.stones?.length || 0}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                        background: p.qty === 0 ? "#FFEBEE" : isLow ? "#FFF3E0" : "#E8F5E9",
                        color: p.qty === 0 ? "#C62828" : isLow ? "#E65100" : "#1B5E20",
                      }}>{p.qty}</span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>
                      {p.price ? `₹${Number(p.price).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleEdit(p)} style={{ padding: "5px 12px", fontSize: 12, background: "#E3F2FD", color: "#1565C0", border: "none", borderRadius: 6, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => handleDelete(p)} style={{ padding: "5px 12px", fontSize: 12, background: "#FFEBEE", color: "#C62828", border: "none", borderRadius: 6, cursor: "pointer" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ───────── Print tag sheet ──────────────────────────────────────────────
function TagBody({ p, fmt }) {
  const fields = fmt.fields;
  return (
    <div style={{
      width: fmt.width * SCALE, height: fmt.height * SCALE,
      border: "1px dashed #999", borderRadius: 4, overflow: "hidden",
      padding: 4, fontSize: Math.max(7, Math.min(10, fmt.height / 4)),
      lineHeight: 1.15, display: "flex", flexDirection: "column", justifyContent: "space-between",
      boxSizing: "border-box",
    }}>
      <div style={{ overflow: "hidden" }}>
        {fields.includes("name") && (
          <div style={{ fontWeight: 700, fontSize: Math.max(8, Math.min(11, fmt.height / 3.2)), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.name}
          </div>
        )}
        <div style={{ fontSize: 8, color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fields.includes("category") && <span>{p.category} </span>}
          {fields.includes("karat") && <span>{p.karat} </span>}
          {fields.includes("weight") && <span>· {p.weight}g </span>}
          {fields.includes("netWeight") && p.netWeight ? <span>(net {p.netWeight}g) </span> : null}
        </div>
        {fields.includes("huid") && p.huid && <div style={{ fontSize: 7, fontFamily: "monospace" }}>HUID {p.huid}</div>}
        {fields.includes("rate") && (
          <div style={{ fontSize: Math.max(8, Math.min(11, fmt.height / 3.2)), fontWeight: 800 }}>
            {p.price ? `₹${Number(p.price).toLocaleString("en-IN")}` : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        {(fields.includes("barcodeQR") || fields.includes("barcodeOnly")) && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <BarcodeStripes value={p.barcode} />
            <div style={{ fontSize: 6, fontFamily: "monospace", textAlign: "center" }}>{p.barcode}</div>
          </div>
        )}
        {(fields.includes("barcodeQR") || fields.includes("qrOnly")) && p.barcode && (
          <QRImage value={p.barcode} size={fmt.qrSize * 4} />
        )}
      </div>
    </div>
  );
}

function PrintTags({ items, onClose, shopConfig, barcodeTemplates = [], shopData }) {
  const ref = useRef(null);

  const defaultFormatId = shopConfig?.defaultTagFormat || "medium_50x25";
  const [fmtId, setFmtId] = useState(defaultFormatId);
  const fmt = getFormat(fmtId);
  const defaultBarcodeTpl = pickDefaultBarcode(barcodeTemplates);
  const [barcodeTplId, setBarcodeTplId] = useState(defaultBarcodeTpl?.id || "");
  const barcodeTpl = barcodeTemplates.find((t) => t.id === barcodeTplId) || null;
  const print = () => window.print();
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start",
      padding: 20, overflowY: "auto",
    }}>
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 800, width: "100%" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #eee" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong>Print Tags ({items.length})</strong>
            <select value={fmtId} onChange={(e) => { setFmtId(e.target.value); setBarcodeTplId(""); }}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12 }}>
              {TAG_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            {barcodeTemplates && barcodeTemplates.length > 0 && (
              <select value={barcodeTplId} onChange={(e) => setBarcodeTplId(e.target.value)}
                style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12 }}>
                <option value="">— Use designer template —</option>
                {barcodeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>
                ))}
              </select>
            )}
            <span style={{ fontSize: 11, color: "#888" }}>
              {barcodeTpl ? `${barcodeTpl?.dimensions?.widthMm || 0}×${barcodeTpl?.dimensions?.heightMm || 0} mm` : `Fields: ${fmt.fields.map((f) => FIELD_LABELS[f] || f).join(" · ")}`}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection:"column", gap: 10, width:"100%" }}>
            <QrScanInput
              onScan={(code)=>console.log("QR scanned:", code)}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={print} className="btn btn-primary">🖨️ Print</button>
              <button onClick={onClose} className="btn btn-secondary">✕ Close</button>
            </div>
          </div>
        </div>
        <div id="printArea" ref={ref} style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
         {items.map((p) => (
  <TagBody key={p.id} p={p} fmt={fmt} />
))}
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
    </div>
  );
}
