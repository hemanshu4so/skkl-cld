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
