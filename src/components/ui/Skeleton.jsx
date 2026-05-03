// src/components/ui/Skeleton.jsx
//
// Drop-in replacement for "Loading…" text rows.
// Renders a shimmering grey rectangle with sensible defaults.

const SHIMMER_BG = "linear-gradient(90deg, #e5e5e5 0px, #f5f5f5 40px, #e5e5e5 80px)";

export function Skeleton({ width = "100%", height = 14, radius = 6, style = {}, className = "" }) {
  return (
    <div
      className={className}
      style={{
        width, height, borderRadius: radius,
        backgroundImage: SHIMMER_BG,
        backgroundSize: "1000px 100%",
        animation: "shimmer 2s infinite linear",
        ...style,
      }}
    />
  );
}

export function SkeletonRow({ cols = 5, height = 14 }) {
  const widths = ["20%", "30%", "15%", "20%", "15%", "15%", "10%", "10%"];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderTop: "1px solid #f5f5f5" }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height={height} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

export default Skeleton;
