// src/lib/constants.js
// 🏪 Centralized constants for jewellery ERP

export const CATEGORIES = ["Gold", "Silver", "Diamond", "Platinum", "Other"];

export const KARATS = ["24K", "22K", "20K", "18K", "14K", "92.5", "80", "Sterling", "N/A"];

export const PURITY_FACTOR = {
  "24K": 0.999,
  "22K": 0.916,
  "20K": 0.833,
  "18K": 0.750,
  "14K": 0.583,
  "92.5": 0.925,
  "80": 0.800,
  "Sterling": 0.925,
  "N/A": 1,
};

export const ITEM_TYPES = [
  "Ring", "Necklace", "Bracelet", "Earring", "Pendant", "Bangle",
  "Chain", "Anklet", "Nose Pin", "Mangalsutra", "Kada", "Coin", "Bar",
  "Tikka", "Mathapatti", "Toe Ring", "Waist Belt", "Brooch", "Cufflink", "Other"
];

export const MAKING_TYPES = [
  { value: "per_gram", label: "Per Gram (₹)", suffix: "₹/g" },
  { value: "percent", label: "Percentage (%)", suffix: "%" },
  { value: "fixed", label: "Fixed Amount (₹)", suffix: "₹" },
];

export const PAYMENT_MODES = [
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "card", label: "Card", icon: "💳" },
  { value: "upi", label: "UPI", icon: "📱" },
  { value: "bank", label: "Bank Transfer", icon: "🏦" },
  { value: "cheque", label: "Cheque", icon: "📝" },
  { value: "credit", label: "Credit (Udhar)", icon: "📒" },
];

export const GST_RATES = [
  { value: 0, label: "0% (Exempt)" },
  { value: 1.5, label: "1.5% (Old Rate)" },
  { value: 3, label: "3% (Jewellery Standard)" },
  { value: 5, label: "5% (Making Charges)" },
  { value: 12, label: "12%" },
  { value: 18, label: "18%" },
];

export const REPAIR_STATUS = [
  { value: "received", label: "Received", color: "blue" },
  { value: "estimated", label: "Estimate Given", color: "purple" },
  { value: "approved", label: "Approved", color: "indigo" },
  { value: "in_progress", label: "In Progress", color: "orange" },
  { value: "ready", label: "Ready for Delivery", color: "green" },
  { value: "delivered", label: "Delivered", color: "gray" },
  { value: "cancelled", label: "Cancelled", color: "red" },
];

export const TXN_TYPES = [
  { value: "sale", label: "Sale", color: "green", in: false },
  { value: "purchase", label: "Purchase", color: "blue", in: false },
  { value: "old_gold", label: "Old Gold In", color: "gold", in: true },
  { value: "expense", label: "Expense", color: "red", in: false },
  { value: "income", label: "Other Income", color: "green", in: true },
  { value: "vendor_pay", label: "Vendor Payment", color: "orange", in: false },
  { value: "customer_recv", label: "Customer Received", color: "green", in: true },
];

export const HSN_CODES = {
  "Gold": "7113",
  "Silver": "7113",
  "Diamond": "7113",
  "Platinum": "7113",
  "Other": "7117",
};

export const USER_ROLES = ["admin", "manager", "cashier", "staff"];

export const SCHEME_TYPES = [
  { value: "monthly_gold", label: "Monthly Gold Plan (11+1)" },
  { value: "fixed_amount", label: "Fixed Amount Saving" },
  { value: "festival", label: "Festival Special" },
];

export const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

export const formatNum = (n) =>
  new Intl.NumberFormat("en-IN").format(Number(n) || 0);

export const formatDate = (d) => {
  if (!d) return "—";
  const date = d?.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

export const formatDateTime = (d) => {
  if (!d) return "—";
  const date = d?.toDate ? d.toDate() : new Date(d);
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

// ───── Phase 1 additions ─────────────────────────────────────────────

export const VENDOR_TYPES = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "wholesaler",   label: "Wholesaler" },
  { value: "bullion",      label: "Bullion Dealer" },
  { value: "stones",       label: "Stones / Diamond" },
  { value: "other",        label: "Other" },
];

export const EXCHANGE_TYPES = [
  { value: "old_gold",   label: "Old Gold",    purity: 0.916 },
  { value: "old_silver", label: "Old Silver",  purity: 0.925 },
  { value: "scrap_24k",  label: "Scrap 24K",   purity: 0.999 },
  { value: "scrap_18k",  label: "Scrap 18K",   purity: 0.750 },
];

// Allowed forward transitions for repair status.
// Used by Repairs UI to limit the dropdown to legal next steps.
export const REPAIR_STATUS_FLOW = {
  received:    ["estimated", "cancelled"],
  estimated:   ["approved", "cancelled"],
  approved:    ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready:       ["delivered"],
  delivered:   [],
  cancelled:   [],
};

export const SPLIT_MODES = ["cash", "card", "upi", "bank", "cheque", "credit"];

// Paid-in/out flags for ledger queries
export const LEDGER_DIRECTION = {
  IN:  ["sale", "old_gold", "income", "customer_recv"],
  OUT: ["purchase", "expense", "vendor_pay"],
};

// ───── Phase 2 additions ─────

export const KARIGAR_TXN_TYPES = [
  { value: "issue",     label: "Metal Issued",   in: false },  // gold OUT to karigar
  { value: "receive",   label: "Item Received",  in: true  },  // finished item back from karigar
  { value: "advance",   label: "Advance Payment", in: false }, // ₹ advance
  { value: "settlement",label: "Final Settlement", in: false },// ₹ final
];

export const BULLION_TXN_TYPES = [
  { value: "melt_in",      label: "Raw Metal In (for melting)" },
  { value: "fine_out",     label: "Fine Gold Out (after melting)" },
  { value: "purchase",     label: "Bullion Purchase" },
  { value: "rate_lock",    label: "Rate Lock Order" },
  { value: "delivery",     label: "Rate-locked Delivery" },
  { value: "payment",      label: "Payment to Dealer" },
];

// Standard chart of accounts (Indian jewellery shop)
export const DEFAULT_CHART_OF_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Cash in Hand",       type: "asset",     group: "Cash & Bank" },
  { code: "1010", name: "Bank Account",       type: "asset",     group: "Cash & Bank" },
  { code: "1100", name: "Stock — Gold",       type: "asset",     group: "Inventory" },
  { code: "1110", name: "Stock — Silver",     type: "asset",     group: "Inventory" },
  { code: "1120", name: "Stock — Diamond",    type: "asset",     group: "Inventory" },
  { code: "1200", name: "Customer Receivable",type: "asset",     group: "Receivables" },
  { code: "1300", name: "Karigar Advance",    type: "asset",     group: "Receivables" },
  // Liabilities
  { code: "2000", name: "Vendor Payable",     type: "liability", group: "Payables" },
  { code: "2010", name: "Customer Advance",   type: "liability", group: "Advances" },
  { code: "2100", name: "GST Payable",        type: "liability", group: "Tax" },
  // Income
  { code: "4000", name: "Sales Revenue",      type: "income",    group: "Revenue" },
  { code: "4010", name: "Making Charges",     type: "income",    group: "Revenue" },
  { code: "4020", name: "Repair Income",      type: "income",    group: "Revenue" },
  { code: "4900", name: "Other Income",       type: "income",    group: "Other" },
  // Expenses
  { code: "5000", name: "Cost of Goods Sold", type: "expense",   group: "COGS" },
  { code: "5100", name: "Karigar Wages",      type: "expense",   group: "Operating" },
  { code: "5110", name: "Hallmarking",        type: "expense",   group: "Operating" },
  { code: "5200", name: "Rent",               type: "expense",   group: "Overhead" },
  { code: "5210", name: "Electricity",        type: "expense",   group: "Overhead" },
  { code: "5220", name: "Salaries",           type: "expense",   group: "Overhead" },
  { code: "5230", name: "Marketing",          type: "expense",   group: "Overhead" },
  { code: "5290", name: "Misc Expense",       type: "expense",   group: "Overhead" },
];

export const EXPENSE_CATEGORIES = [
  "Rent", "Electricity", "Salaries", "Marketing", "Hallmarking",
  "Stationery", "Travel", "Repairs & Maintenance", "Bank Charges", "Misc",
];
