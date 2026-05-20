// src/components/PrintRenderer.jsx
import QRImage from "../../../components/QRImage";
const formatINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (ts) => { if (!ts) return ""; const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString("en-IN"); };

function Block({ block, doc, shop }) {
  if (!block?.enabled) return null;
  const company = shop?.company || {};
  const showGstin = company.showGstinOnBills !== false;
  switch (block.type) {
    case "logo":
      if (!company.logoUrl) return null;
      return <div style={{ textAlign: block.align || "center", margin: "4px 0" }}>
        <img src={company.logoUrl} alt="" style={{ maxHeight: block.maxHeight || 60, objectFit: "contain" }} /></div>;
    case "company": {
      const lines = [];
      if (block.showAddress && company.address) lines.push(company.address);
      if (block.showPhone && company.phone) lines.push(`Ph: ${company.phone}`);
      if (block.showEmail && company.email) lines.push(company.email);
      if (block.showGst && showGstin && company.gst) lines.push(`GSTIN: ${company.gst}`);
      return <div style={{ textAlign: block.align || "center", margin: "4px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{company.name || shop?.name || "—"}</div>
        {lines.map((l, i) => <div key={i} style={{ fontSize: 11 }}>{l}</div>)}
      </div>;
    }
    case "divider": return <hr style={{ borderTop: `2px ${block.style || "dashed"} #333`, margin: "6px 0" }} />;
    case "meta": return <div style={{ fontSize: 11 }}>
      {block.showBillNo && <div>{doc?.kind === "receipt" ? "Receipt" : "Bill"} No: <b>{doc?.billNo || doc?.voucherNo || "—"}</b></div>}
      {block.showDate   && <div>Date: {fmtDate(doc?.createdAt) || new Date().toLocaleDateString("en-IN")}</div>}
      {block.showRates && (doc?.goldRate || doc?.silverRate)
        ? <div style={{ color: "#555" }}>Gold ₹{doc.goldRate}/10g · Silver ₹{doc.silverRate}/kg</div>
        : null}
    </div>;
    case "customer": return <div style={{ fontSize: 11, marginTop: 4 }}>
      {block.showName && <div>Customer: <b>{doc?.customerName || "Walk-in"}</b></div>}
      {block.showPhone && doc?.customerPhone && <div>Phone: {doc.customerPhone}</div>}
      {block.showAddress && doc?.customerAddress && <div>Address: {doc.customerAddress}</div>}
      {block.showGstin && doc?.customerGstin && <div>GSTIN: {doc.customerGstin}</div>}
    </div>;
    case "items":
      if (!doc?.items?.length) return null;
      return <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 }}>
        <thead><tr style={{ borderBottom: "1px solid #333" }}>
          <th style={{ textAlign: "left", padding: "3px 0" }}>Item</th>
          {block.showQty       && <th style={{ textAlign: "right", padding: "3px 4px" }}>Qty</th>}
          {block.showWeight    && <th style={{ textAlign: "right", padding: "3px 4px" }}>Wt</th>}
          {block.showPerUnit   && <th style={{ textAlign: "right", padding: "3px 4px" }}>Per</th>}
          {block.showLineTotal && <th style={{ textAlign: "right", padding: "3px 0" }}>Total</th>}
        </tr></thead>
        <tbody>{doc.items.map((it, i) => (
          <tr key={i} style={{ borderBottom: "1px dotted #ddd" }}>
            <td style={{ padding: "3px 0" }}>
              <div>{it.name || "—"}</div>
              <div style={{ fontSize: 9, color: "#666" }}>{it.category} {it.karat}</div>
            </td>
            {block.showQty       && <td style={{ textAlign: "right" }}>{it.qty || 1}</td>}
            {block.showWeight    && <td style={{ textAlign: "right" }}>{it.weight ? `${it.weight}g` : ""}</td>}
            {block.showPerUnit   && <td style={{ textAlign: "right" }}>{formatINR(it.perUnit || it.total)}</td>}
            {block.showLineTotal && <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(it.lineTotal || it.total)}</td>}
          </tr>
        ))}</tbody>
      </table>;
    case "exchanges":
      if (!doc?.exchanges?.length) return null;
      return <div style={{ marginTop: 6, fontSize: 11 }}>
        <strong>Exchange:</strong>
        {doc.exchanges.map((ex, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{ex.label} {ex.weight}g @ {Math.round((ex.purity || 0) * 100)}%</span>
            <span style={{ color: "green" }}>-{formatINR(ex.value)}</span>
          </div>
        ))}
      </div>;
    case "totals": {
      const rows = [];
      if (block.showSubtotal && doc?.subtotal != null) rows.push(["Subtotal", doc.subtotal]);
      if (doc?.exchangeValue > 0) rows.push(["Exchange credit", -doc.exchangeValue]);
      if (block.showDiscount && doc?.discount > 0) rows.push(["Discount", -doc.discount]);
      if (block.showTax && doc?.tax > 0) rows.push([`GST (${doc.taxPercent || 0}%)`, doc.tax]);
      return <div style={{ borderTop: "1px solid #333", paddingTop: 4, fontSize: 11, marginTop: 6 }}>
        {rows.map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{l}</span>
            <span style={{ color: v < 0 ? "green" : "inherit" }}>{v < 0 ? "-" : ""}{formatINR(Math.abs(v))}</span>
          </div>
        ))}
        {block.showGrand && doc?.total != null && (
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14, borderTop: "2px solid #333", marginTop: 4, paddingTop: 4 }}>
            <span>TOTAL</span><span>{formatINR(doc.total)}</span>
          </div>
        )}
        {block.showPaid && doc?.amountPaid != null && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Paid</span><span>{formatINR(doc.amountPaid)}</span>
          </div>
        )}
        {block.showBalance && doc?.balance > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", color: "red", fontWeight: 700 }}>
            <span>Balance Due</span><span>{formatINR(doc.balance)}</span>
          </div>
        )}
      </div>;
    }
    case "payments":
      if (!doc?.payments?.length) return null;
      return <div style={{ marginTop: 4, fontSize: 10 }}>
        {doc.payments.map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{(p.mode || "cash").toUpperCase()}{p.ref ? ` (${p.ref})` : ""}</span>
            <span>{formatINR(p.amount)}</span>
          </div>
        ))}
      </div>;
    case "qr": {
      const value = doc?.billNo || doc?.voucherNo || doc?.id || "";
      if (!value) return null;
      return <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
        <QRImage value={String(value)} size={block.size || 64} />
      </div>;
    }
    case "signature":
      return <div style={{ textAlign: "right", marginTop: 14, fontSize: 11 }}>
        {block.showImage && shop?.company?.signatureUrl
          ? <img src={shop.company.signatureUrl} alt="" style={{ maxHeight: 50, maxWidth: 140 }} />
          : <div style={{ borderBottom: "1px solid #333", width: 140, height: 30, marginLeft: "auto" }} />}
        <div>{block.label || "Authorised Signatory"}</div>
      </div>;
    case "footer":
      if (!shop?.company?.footerNote) return null;
      return <div style={{ borderTop: "2px dashed #333", marginTop: 10, paddingTop: 6,
        textAlign: block.align || "center", fontSize: 10, color: "#666", whiteSpace: "pre-wrap" }}>
        {shop.company.footerNote}
      </div>;
    case "text":
      if (!block.text) return null;
      return <div style={{ textAlign: block.align || "left", fontSize: 12, fontWeight: 700, margin: "4px 0" }}>{block.text}</div>;
    default: return null;
  }
}

export default function PrintRenderer({ template, doc, shop }) {
  const tpl = template?.blocks?.length ? template : null;
  if (!tpl) return <FallbackPrint doc={doc} shop={shop} />;
  const widthMm = tpl.paperWidthMm || 80;
  return <div style={{ width: `${widthMm}mm`, padding: 12, fontFamily: "monospace", lineHeight: 1.25 }}>
    {tpl.blocks.map((b) => <Block key={b.id} block={b} doc={doc || {}} shop={shop} />)}
  </div>;
}

function FallbackPrint({ doc, shop }) {
  const company = shop?.company || {};
  return <div style={{ width: "80mm", padding: 12, fontFamily: "monospace", lineHeight: 1.25 }}>
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{company.name || shop?.name || "—"}</div>
      {company.address && <div style={{ fontSize: 11 }}>{company.address}</div>}
      {company.phone   && <div style={{ fontSize: 11 }}>Ph: {company.phone}</div>}
    </div>
    <hr />
    <div style={{ fontSize: 11 }}>
      <div>No: {doc?.billNo || doc?.voucherNo || "—"}</div>
      <div>Date: {fmtDate(doc?.createdAt) || new Date().toLocaleDateString("en-IN")}</div>
      <div>Customer: {doc?.customerName || "Walk-in"}</div>
    </div>
    <hr />
    {doc?.total != null && (
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14 }}>
        <span>TOTAL</span><span>{formatINR(doc.total)}</span>
      </div>
    )}
    {company.footerNote && (
      <div style={{ borderTop: "2px dashed #333", marginTop: 10, paddingTop: 6, textAlign: "center", fontSize: 10, color: "#666", whiteSpace: "pre-wrap" }}>
        {company.footerNote}
      </div>
    )}
  </div>;
}
