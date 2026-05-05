import { useMemo } from "react";
import { qrSVG } from "../lib/qr";
export default function QRImage({ value, size = 96, color = "#000", bg = "#fff", style }) {
  const html = useMemo(() => qrSVG(value || "", { size, color, bg }), [value, size, color, bg]);
  if (!value) return null;
  return (
    <span role="img" aria-label={`QR ${value}`}
      style={{ display: "inline-block", lineHeight: 0, ...(style || {}) }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
