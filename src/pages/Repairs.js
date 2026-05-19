// src/pages/repairs.js  —  Phase 1 Repairs / Job-Card Pipeline
//
// Full job-card lifecycle:
//   received -> estimated -> approved -> in_progress -> ready -> delivered
//                                                    \-> cancelled
//
// Captures: customer, item description, weight, before/after photos,
// karigar assignment, estimate, advance, completion notes.
//
// Status changes go through REPAIR_STATUS_FLOW (constants) so we never
// jump from received -> delivered by mistake.
//
// Activity log on every create/update/status_change.

import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import {
  collection, addDoc, onSnapshot, deleteDoc, query, where,
  doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import { assertShopId } from "../../../lib/utils";
import { REPAIR_STATUS, REPAIR_STATUS_FLOW } from "../../../lib/constants";
import { logActivity } from "../../../lib/activityLog";
import { uploadShopFile } from "../../../lib/upload";

const emptyForm = {
  customerId: "", customerName: "", customerPhone: "",
  itemDescription: "", category: "Gold", karat: "22K",
  weight: "", workType: "Polish",
  estimatedDays: "3", estimateAmount: "", advanceAmount: "",
  karigarId: "", karigarName: "",
  notes: "",
  beforePhotos: [], afterPhotos: [],
};

const WORK_TYPES = [
  "Polish", "Soldering", "Resize", "Setting Stone",
  "Replate", "Restring", "Engraving", "Re-design", "Other",
];

const statusMap = REPAIR_STATUS.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});

export default function Repairs() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const shopId = userData?.shopId;

  const [repairs, setRepairs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [karigars, setKarigars] = useState([]);

  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({ before: false, after: false });

  const [printRepair, setPrintRepair] = useState(null);

  useEffect(() => {
    if (!shopId) return;
    const u = onSnapshot(query(collection(db, "repairs"), where("shopId", "==", shopId)), (s) => {
      setRepairs(s.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    const u = onSnapshot(query(collection(db, "karigars"), where("shopId", "==", shopId)), (s) => {
      setKarigars(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => u();
  }, [shopId]);

  const filteredCust = customers.filter((c) =>
    customerSearch && (c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
  ).slice(0, 5);

  const handlePhotoUpload = async (kind, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const uploads = await Promise.all(files.map((file) =>
        uploadShopFile({ shopId, kind: "repairs", entityId: editId || "_draft", file })
      ));
      setForm((f) => ({ ...f, [`${kind}Photos`]: [...(f[`${kind}Photos`] || []), ...uploads] }));
      toast(`Uploaded ${uploads.length} photo(s)`, "success");
    } catch (err) {
      toast("Upload failed: " + err.message, "error");
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!assertShopId(shopId, toast, "Repairs.handleSave")) return;
    if (!form.customerId && !form.customerName) { toast("Select a customer", "warn"); return; }
    if (!form.itemDescription) { toast("Item description required", "warn"); return; }
    setSaving(true);
    try {
      const now = serverTimestamp();
      const payload = {
        shopId,
        customerId: form.customerId || null,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        itemDescription: form.itemDescription,
        category: form.category, karat: form.karat,
        weight: Number(form.weight) || 0,
        workType: form.workType,
        estimatedDays: Number(form.estimatedDays) || 0,
        estimateAmount: Number(form.estimateAmount) || 0,
        advanceAmount: Number(form.advanceAmount) || 0,
        karigarId: form.karigarId || null,
        karigarName: form.karigarName || "",
        notes: form.notes || "",
        beforePhotos: form.beforePhotos || [],
        afterPhotos: form.afterPhotos || [],
        updatedAt: now,
      };
      if (editId) {
        await updateDoc(doc(db, "repairs", editId), payload);
        await logActivity({ shopId, action: "update", entity: "repair", entityId: editId, uid: userData?.id, name: userData?.name, after: payload });
        toast("Job card updated", "success");
      } else {
        const jobNo = "JOB" + Date.now().toString().slice(-6);
        const data = { ...payload, jobNo, status: "received", history: [], createdAt: now };
        const ref = await addDoc(collection(db, "repairs"), data);
        await logActivity({ shopId, action: "create", entity: "repair", entityId: ref.id, uid: userData?.id, name: userData?.name, meta: { jobNo, status: "received" } });
        toast(`Job ${jobNo} created`, "success");
      }
      setForm(emptyForm); setEditId(null); setShowForm(false);
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
    setSaving(false);
  };

  const handleEdit = (r) => {
    setForm({
      customerId: r.customerId || "", customerName: r.customerName || "", customerPhone: r.customerPhone || "",
      itemDescription: r.itemDescription || "", category: r.category || "Gold", karat: r.karat || "22K",
      weight: String(r.weight || ""), workType: r.workType || "Polish",
      estimatedDays: String(r.estimatedDays || 3), estimateAmount: String(r.estimateAmount || ""),
      advanceAmount: String(r.advanceAmount || ""),
      karigarId: r.karigarId || "", karigarName: r.karigarName || "",
      notes: r.notes || "",
      beforePhotos: r.beforePhotos || [], afterPhotos: r.afterPhotos || [],
    });
    setEditId(r.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (r) => {
    if (!assertShopId(shopId, toast, "Repairs.handleDelete")) return;
    if (!window.confirm(`Delete job ${r.jobNo}?`)) return;
    await deleteDoc(doc(db, "repairs", r.id));
    await logActivity({ shopId, action: "delete", entity: "repair", entityId: r.id, uid: userData?.id, name: userData?.name, before: r });
    toast("Job deleted", "success");
  };

  const moveStatus = async (r, nextStatus) => {
    if (!assertShopId(shopId, toast, "Repairs.moveStatus")) return;
    if (!REPAIR_STATUS_FLOW[r.status]?.includes(nextStatus)) {
      toast(`Cannot move from ${r.status} to ${nextStatus}`, "warn");
      return;
    }
    try {
      const historyEntry = {
        from: r.status, to: nextStatus,
        at: new Date().toISOString(),
        by: userData?.name || "user",
      };
      await updateDoc(doc(db, "repairs", r.id), {
        status: nextStatus,
        history: [...(r.history || []), historyEntry],
        updatedAt: serverTimestamp(),
      });
      await logActivity({
        shopId, action: "status_change", entity: "repair", entityId: r.id,
        uid: userData?.id, name: userData?.name,
        meta: { from: r.status, to: nextStatus, jobNo: r.jobNo },
      });
      toast(`Status -> ${statusMap[nextStatus]?.label}`, "success");
    } catch (err) {
      toast("Status change failed: " + err.message, "error");
    }
  };

  const filtered = useMemo(() =>
    repairs.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (search) {
        const t = search.toLowerCase();
        return r.jobNo?.toLowerCase().includes(t) ||
          r.customerName?.toLowerCase().includes(t) ||
          r.customerPhone?.includes(search) ||
          r.itemDescription?.toLowerCase().includes(t);
      }
      return true;
    }),
  [repairs, filter, search]);

  const counts = useMemo(() => {
    const c = { all: repairs.length };
    REPAIR_STATUS.forEach((s) => { c[s.value] = repairs.filter((r) => r.status === s.value).length; });
    return c;
  }, [repairs]);

  // small inputs
  const inp = (label, field, type = "text", placeholder = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>{label}</label>
      <input type={type} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        placeholder={placeholder} className="input" />
    </div>
  );
  const sel = (label, field, options) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>{label}</label>
      <select value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className="input bg-white">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {printRepair && <PrintJobCard repair={printRepair} onClose={() => setPrintRepair(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>🔧 Repairs / Job Cards</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>{counts.all} total · {counts.in_progress || 0} in progress · {counts.ready || 0} ready</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setForm(emptyForm); setEditId(null); }} className="btn btn-primary">
          {showForm ? "✕ Cancel" : "+ New Job Card"}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 job no / name / phone / description"
          style={{ padding: "9px 14px", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, outline: "none", width: 280 }} />
        {[{ value: "all", label: `All (${counts.all})` }, ...REPAIR_STATUS.map((s) => ({ ...s, label: `${s.label} (${counts[s.value] || 0})` }))].map((s) => (
          <button key={s.value} onClick={() => setFilter(s.value)}
            style={{
              padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: filter === s.value ? "#1a1a2e" : "#ddd",
              background: filter === s.value ? "#1a1a2e" : "#fff",
              color: filter === s.value ? "#fff" : "#555",
            }}>{s.label}</button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", marginTop: 0, marginBottom: 16 }}>
            {editId ? "✏️ Edit Job Card" : "➕ New Job Card"}
          </h2>

          {/* Customer */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Customer *</label>
            {form.customerId ? (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#E8F5E9", borderRadius: 8 }}>
                <span><strong>{form.customerName}</strong> · {form.customerPhone}</span>
                <button onClick={() => setForm((f) => ({ ...f, customerId: "", customerName: "", customerPhone: "" }))}
                  style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer" }}>×</button>
              </div>
            ) : (
              <div>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search by name or phone…" className="input" />
                {filteredCust.map((c) => (
                  <div key={c.id} onClick={() => { setForm((f) => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone })); setCustomerSearch(""); }}
                    style={{ padding: "9px 12px", cursor: "pointer", border: "1px solid #eee", borderRadius: 8, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>{c.phone}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  Or type a name + phone for walk-ins:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Walk-in name" className="input" />
                  <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="Phone" className="input" />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
            {inp("Item Description *", "itemDescription", "text", "Gold chain, 22K, broken clasp")}
            {sel("Category", "category", ["Gold", "Silver", "Diamond", "Platinum", "Other"])}
            {sel("Karat", "karat", ["24K", "22K", "20K", "18K", "14K", "92.5", "Sterling", "N/A"])}
            {inp("Weight (g)", "weight", "number", "5.5")}
            {sel("Work Type", "workType", WORK_TYPES)}
            {inp("Estimated Days", "estimatedDays", "number", "3")}
            {inp("Estimate Amount (₹)", "estimateAmount", "number", "1500")}
            {inp("Advance (₹)", "advanceAmount", "number", "500")}
          </div>

          {/* Karigar */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Assign Karigar</label>
            <select value={form.karigarId}
              onChange={(e) => {
                const k = karigars.find((x) => x.id === e.target.value);
                setForm((f) => ({ ...f, karigarId: k?.id || "", karigarName: k?.name || "" }));
              }}
              className="input bg-white">
              <option value="">— None —</option>
              {karigars.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            {karigars.length === 0 && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                No karigars yet — add them under <code>karigars</code> collection (Phase 2).
              </div>
            )}
          </div>

          {/* Photos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <PhotoSet kind="before" photos={form.beforePhotos} uploading={uploading.before}
              onUpload={(e) => handlePhotoUpload("before", e)}
              onRemove={(i) => setForm((f) => ({ ...f, beforePhotos: f.beforePhotos.filter((_, idx) => idx !== i) }))} />
            <PhotoSet kind="after" photos={form.afterPhotos} uploading={uploading.after}
              onUpload={(e) => handlePhotoUpload("after", e)}
              onRemove={(i) => setForm((f) => ({ ...f, afterPhotos: f.afterPhotos.filter((_, idx) => idx !== i) }))} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="input" style={{ resize: "vertical" }} />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : editId ? "💾 Update Job" : "💾 Create Job Card"}
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0
          ? <div className="card p-10" style={{ textAlign: "center", color: "#bbb" }}>No job cards in this filter.</div>
          : filtered.map((r) => {
            const sm = statusMap[r.status] || { label: r.status, color: "gray" };
            const next = REPAIR_STATUS_FLOW[r.status] || [];
            return (
              <div key={r.id} className="card p-5">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 14, color: "#1a1a2e" }}>#{r.jobNo}</strong>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                        background: badgeBg(sm.color), color: badgeText(sm.color),
                      }}>{sm.label}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>👤 {r.customerName} · {r.customerPhone}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{r.itemDescription}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      {r.workType} · {r.category} {r.karat} {r.weight ? `· ${r.weight}g` : ""}
                      {r.karigarName && <span> · 🛠 {r.karigarName}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>₹{Number(r.estimateAmount || 0).toLocaleString("en-IN")}</div>
                    {r.advanceAmount > 0 && <div style={{ fontSize: 11, color: "#888" }}>Adv ₹{Number(r.advanceAmount).toLocaleString("en-IN")}</div>}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  {next.map((n) => (
                    <button key={n} onClick={() => moveStatus(r, n)} className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>
                      → {statusMap[n]?.label}
                    </button>
                  ))}
                  <button onClick={() => setPrintRepair(r)} className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>🖨️ Print Card</button>
                  <button onClick={() => handleEdit(r)} className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>Edit</button>
                  <button onClick={() => handleDelete(r)} className="btn btn-danger" style={{ padding: "5px 12px", fontSize: 12 }}>Delete</button>
                </div>

                {(r.history?.length > 0) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee", fontSize: 11, color: "#888" }}>
                    Timeline: {r.history.map((h, i) => `${h.from}→${h.to}`).join(" · ")}
                  </div>
                )}
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

function PhotoSet({ kind, photos, uploading, onUpload, onRemove }) {
  return (
    <div>
      <label className="label">{kind === "before" ? "📸 Before photos" : "✨ After photos"}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(photos || []).map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={p.url} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: "1px solid #eee" }} />
            <button onClick={() => onRemove(i)} style={{
              position: "absolute", top: -6, right: -6, width: 20, height: 20,
              borderRadius: "50%", border: "none", background: "#C62828", color: "#fff",
              cursor: "pointer", fontSize: 11,
            }}>×</button>
          </div>
        ))}
        <label style={{
          width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1.5px dashed #aaa", borderRadius: 6, cursor: uploading ? "wait" : "pointer",
          fontSize: 24, color: "#aaa",
        }}>
          {uploading ? "…" : "+"}
          <input type="file" accept="image/*" multiple onChange={onUpload} style={{ display: "none" }} disabled={uploading} />
        </label>
      </div>
    </div>
  );
}

function PrintJobCard({ repair, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      zIndex: 1000, padding: 20, overflowY: "auto",
    }}>
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 480, width: "100%" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #eee" }}>
          <strong>Job Card #{repair.jobNo}</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} className="btn btn-primary">🖨️ Print</button>
            <button onClick={onClose} className="btn btn-secondary">✕ Close</button>
          </div>
        </div>
        <div id="printArea" style={{ padding: 24, fontFamily: "monospace" }}>
          <h2 style={{ textAlign: "center", margin: 0 }}>JOB CARD</h2>
          <h3 style={{ textAlign: "center", margin: "4px 0", color: "#888" }}>#{repair.jobNo}</h3>
          <hr />
          <div><strong>Customer:</strong> {repair.customerName}</div>
          <div><strong>Phone:</strong> {repair.customerPhone}</div>
          <hr />
          <div><strong>Item:</strong> {repair.itemDescription}</div>
          <div><strong>Category:</strong> {repair.category} {repair.karat}</div>
          <div><strong>Weight:</strong> {repair.weight}g</div>
          <div><strong>Work:</strong> {repair.workType}</div>
          <hr />
          <div><strong>Estimate:</strong> ₹{Number(repair.estimateAmount || 0).toLocaleString("en-IN")}</div>
          <div><strong>Advance:</strong> ₹{Number(repair.advanceAmount || 0).toLocaleString("en-IN")}</div>
          <div><strong>Balance:</strong> ₹{Math.max(0, (repair.estimateAmount || 0) - (repair.advanceAmount || 0)).toLocaleString("en-IN")}</div>
          <div><strong>Days:</strong> {repair.estimatedDays}</div>
          <hr />
          <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
            Goods received in good condition. Customer signature: ___________________
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
    </div>
  );
}

function badgeBg(c) {
  return ({
    blue: "#E3F2FD", purple: "#F3E5F5", indigo: "#E8EAF6",
    orange: "#FFF3E0", green: "#E8F5E9", gray: "#F5F5F5", red: "#FFEBEE",
  })[c] || "#F5F5F5";
}
function badgeText(c) {
  return ({
    blue: "#1565C0", purple: "#6A1B9A", indigo: "#283593",
    orange: "#E65100", green: "#1B5E20", gray: "#666", red: "#C62828",
  })[c] || "#666";
}
