// src/lib/printTemplate.js
export const BLOCK_TYPES = {
  logo:      { label: "Logo",            defaults: { align: "center", maxHeight: 60 } },
  company:   { label: "Company details", defaults: { align: "center", showAddress: true, showPhone: true, showEmail: true, showGst: true } },
  divider:   { label: "Divider",         defaults: { style: "dashed" } },
  meta:      { label: "Bill meta",       defaults: { showBillNo: true, showDate: true, showRates: true } },
  customer:  { label: "Customer details", defaults: { showName: true, showPhone: true, showAddress: false, showGstin: false } },
  items:     { label: "Item table",      defaults: { showWeight: true, showQty: true, showPerUnit: true, showLineTotal: true } },
  exchanges: { label: "Old-gold exchange", defaults: {} },
  totals:    { label: "Totals + GST",    defaults: { showSubtotal: true, showDiscount: true, showTax: true, showGrand: true, showPaid: true, showBalance: true } },
  payments:  { label: "Payment split",   defaults: {} },
  qr:        { label: "QR code",         defaults: { size: 64 } },
  signature: { label: "Signature",       defaults: { showImage: true, label: "Authorised Signatory" } },
  footer:    { label: "Footer note",     defaults: { align: "center" } },
  text:      { label: "Custom text",     defaults: { align: "left", text: "" } },
};
export const DEFAULT_BILL_TEMPLATE = {
  name: "Default thermal bill", kind: "bill", paperWidthMm: 80, isDefault: true,
  blocks: [
    { id: "b1",  type: "logo",      enabled: true, ...BLOCK_TYPES.logo.defaults },
    { id: "b2",  type: "company",   enabled: true, ...BLOCK_TYPES.company.defaults },
    { id: "b3",  type: "divider",   enabled: true, ...BLOCK_TYPES.divider.defaults },
    { id: "b4",  type: "meta",      enabled: true, ...BLOCK_TYPES.meta.defaults },
    { id: "b5",  type: "customer",  enabled: true, ...BLOCK_TYPES.customer.defaults },
    { id: "b6",  type: "divider",   enabled: true, ...BLOCK_TYPES.divider.defaults },
    { id: "b7",  type: "items",     enabled: true, ...BLOCK_TYPES.items.defaults },
    { id: "b8",  type: "exchanges", enabled: true, ...BLOCK_TYPES.exchanges.defaults },
    { id: "b9",  type: "totals",    enabled: true, ...BLOCK_TYPES.totals.defaults },
    { id: "b10", type: "payments",  enabled: true, ...BLOCK_TYPES.payments.defaults },
    { id: "b11", type: "qr",        enabled: false, ...BLOCK_TYPES.qr.defaults },
    { id: "b12", type: "signature", enabled: false, ...BLOCK_TYPES.signature.defaults },
    { id: "b13", type: "footer",    enabled: true, ...BLOCK_TYPES.footer.defaults },
  ],
};
export const DEFAULT_RECEIPT_TEMPLATE = {
  name: "Default receipt voucher", kind: "receipt", paperWidthMm: 80, isDefault: true,
  blocks: [
    { id: "r1", type: "logo",     enabled: true, ...BLOCK_TYPES.logo.defaults },
    { id: "r2", type: "company",  enabled: true, ...BLOCK_TYPES.company.defaults },
    { id: "r3", type: "divider",  enabled: true, ...BLOCK_TYPES.divider.defaults },
    { id: "r4", type: "text",     enabled: true, text: "RECEIPT", align: "center" },
    { id: "r5", type: "meta",     enabled: true, ...BLOCK_TYPES.meta.defaults },
    { id: "r6", type: "customer", enabled: true, ...BLOCK_TYPES.customer.defaults },
    { id: "r7", type: "totals",   enabled: true, showSubtotal: false, showDiscount: false, showTax: false, showGrand: true, showPaid: true, showBalance: false },
    { id: "r8", type: "footer",   enabled: true, ...BLOCK_TYPES.footer.defaults },
  ],
};
export function getDefaultTemplate(kind = "bill") { return kind === "receipt" ? DEFAULT_RECEIPT_TEMPLATE : DEFAULT_BILL_TEMPLATE; }
export function pickDefault(templates, kind) { return (templates || []).find((t) => t.kind === kind && t.isDefault) || null; }
