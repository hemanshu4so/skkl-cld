export const SCALE = 96 / 25.4;
export const TAG_FORMATS = [
  { id: "small_30x20",  label: "Small (30 × 20 mm)",  width: 30, height: 20, fields: ["name", "rate", "weight", "barcodeQR"], qrSize: 14, notes: "TSC TE244 default for small items" },
  { id: "medium_50x25", label: "Medium (50 × 25 mm)", width: 50, height: 25, fields: ["name", "category", "karat", "weight", "huid", "rate", "barcodeQR"], qrSize: 18, notes: "Standard retail tag" },
  { id: "large_80x40",  label: "Large (80 × 40 mm)",  width: 80, height: 40, fields: ["name", "category", "karat", "weight", "netWeight", "huid", "stoneValue", "rate", "barcodeQR"], qrSize: 22, notes: "Showpiece tag" },
];
export function getFormat(id) { return TAG_FORMATS.find((f) => f.id === id) || TAG_FORMATS[1]; }
export const FIELD_LABELS = {
  name: "Name", category: "Category", karat: "Karat",
  weight: "Gross Weight", netWeight: "Net Weight", huid: "HUID",
  rate: "Price", stoneValue: "Stone Value",
  barcodeQR: "Barcode + QR", barcodeOnly: "Barcode only", qrOnly: "QR only",
};
