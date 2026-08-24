// QRImage — spec-correct QR rendered by qrcode.react (scannable by any phone).
// C-01: the previous homegrown pure-JS encoder (src/lib/qr → barcode/lib/qr) had
// no alignment patterns for v>=2 and a hand-built format/separator region, so the
// code was *visible but undecodable*. qrcode.react is already a dependency.
// Props are unchanged (value/size/color/bg/style) so every call site keeps working.
import { QRCodeSVG } from "qrcode.react";
export default function QRImage({ value, size = 96, color = "#000", bg = "#fff", style }) {
  if (!value) return null;
  return (
    <span
      role="img"
      aria-label={`QR ${value}`}
      style={{ display: "inline-block", lineHeight: 0, ...(style || {}) }}
    >
      <QRCodeSVG
        value={String(value)}
        size={size}
        fgColor={color}
        bgColor={bg}
        level="M"
        marginSize={2}
      />
    </span>
  );
}
