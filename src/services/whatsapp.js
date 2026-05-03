// src/services/whatsapp.js
//
// Thin WhatsApp service layer using wa.me deep links — no API key, works on
// both phone (opens WhatsApp app) and desktop (opens WhatsApp Web).
//
// For server-side automated sends (no human in the loop), wire this to
// WhatsApp Business Cloud API later — same call signatures.

// Sanitize an Indian phone number to the E.164 form WhatsApp expects (no '+').
//   "98765 43210"  → "919876543210"
//   "+919876543210"→ "919876543210"
//   "9876543210"   → "919876543210"
export function normalizePhone(raw, defaultCountry = "91") {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  // Already prefixed with country code (>= 11 digits)
  if (digits.length >= 11) return digits;
  // 10-digit Indian mobile → prepend country
  if (digits.length === 10) return defaultCountry + digits;
  // Anything else: send as-is and let WhatsApp complain
  return digits;
}

export function buildWaLink(phone, message) {
  const p = normalizePhone(phone);
  const text = encodeURIComponent(message || "");
  if (!p) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${p}?text=${text}`;
}

export function openWhatsApp(phone, message) {
  const url = buildWaLink(phone, message);
  // Use noopener for safety; same-tab open would lose the cart context
  window.open(url, "_blank", "noopener");
  return url;
}

// ───────────────── message templates ─────────────────

const formatINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export function billMessage({ shopName, billNo, customerName, total, balance, billUrl }) {
  const lines = [
    `Hi ${customerName || "there"},`,
    "",
    `Thank you for shopping at ${shopName || "our shop"}.`,
    `Your bill #${billNo} for ${formatINR(total)} is ready.`,
  ];
  if (balance > 0) lines.push(`Balance due: ${formatINR(balance)}`);
  if (billUrl)    lines.push(`View bill: ${billUrl}`);
  lines.push("", "We appreciate your business 💎");
  return lines.join("\n");
}

export function reminderMessage({ shopName, customerName, schemeName, amount, monthLabel }) {
  return [
    `Hi ${customerName || "there"},`,
    "",
    `This is a friendly reminder from ${shopName || "our shop"}.`,
    `Your ${schemeName || "scheme"} installment of ${formatINR(amount)} for ${monthLabel || "this month"} is due.`,
    "Please drop by at your convenience to make the payment.",
    "",
    "Thank you 🙏",
  ].join("\n");
}

export function birthdayMessage({ shopName, customerName }) {
  return [
    `Dear ${customerName || "valued customer"},`,
    "",
    `🎉 Wishing you a very happy birthday from all of us at ${shopName || "our shop"}!`,
    "May this year sparkle as bright as the gold you love. ✨",
    "",
    "Visit us this week for a special birthday treat 🎁",
  ].join("\n");
}

export function anniversaryMessage({ shopName, customerName }) {
  return [
    `Dear ${customerName || "valued customer"},`,
    "",
    `💐 Happy Anniversary from ${shopName || "our shop"}!`,
    "Wishing you many more years of love and togetherness.",
    "",
    "We have something special for you this week — do drop by 🎁",
  ].join("\n");
}

export function paymentDueMessage({ shopName, customerName, billNo, balance }) {
  return [
    `Hi ${customerName || "there"},`,
    "",
    `This is a gentle reminder from ${shopName || "our shop"} regarding bill #${billNo}.`,
    `Outstanding balance: ${formatINR(balance)}`,
    "Please settle at your earliest convenience.",
    "",
    "Thank you 🙏",
  ].join("\n");
}

// Convenience: returns a button-action shape for any UI to render
//   const actions = whatsappActions(customer, shop);
//   actions.bill(bill).onClick();
export function whatsappActions({ shop }) {
  const shopName = shop?.company?.name || shop?.name || "our shop";
  return {
    bill: (bill, billUrl) => ({
      label: "📱 WhatsApp Bill",
      onClick: () => openWhatsApp(bill.customerPhone, billMessage({
        shopName, billNo: bill.billNo, customerName: bill.customerName,
        total: bill.total, balance: bill.balance, billUrl,
      })),
    }),
    reminder: (sch, monthLabel) => ({
      label: "📱 Send Reminder",
      onClick: () => openWhatsApp(sch.customerPhone, reminderMessage({
        shopName, customerName: sch.customerName,
        schemeName: sch.schemeName, amount: sch.monthlyAmount, monthLabel,
      })),
    }),
    birthday: (customer) => ({
      label: "🎂 Birthday Wish",
      onClick: () => openWhatsApp(customer.phone, birthdayMessage({
        shopName, customerName: customer.name,
      })),
    }),
    anniversary: (customer) => ({
      label: "💐 Anniversary Wish",
      onClick: () => openWhatsApp(customer.phone, anniversaryMessage({
        shopName, customerName: customer.name,
      })),
    }),
    paymentDue: (sale) => ({
      label: "📱 Payment Reminder",
      onClick: () => openWhatsApp(sale.customerPhone, paymentDueMessage({
        shopName, customerName: sale.customerName, billNo: sale.billNo, balance: sale.balance,
      })),
    }),
  };
}
