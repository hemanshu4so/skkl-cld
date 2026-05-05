import { useEffect } from "react";
const MOD_KEYS = ["ctrl", "shift", "alt", "meta"];
function parseSpec(spec) {
  const parts = spec.toLowerCase().split("+").map((p) => p.trim());
  const key = parts.find((p) => !MOD_KEYS.includes(p)) || "";
  const ctrl = parts.includes("ctrl") || parts.includes("cmd") || parts.includes("meta");
  return { key, ctrl, shift: parts.includes("shift"), alt: parts.includes("alt") };
}
function matches(e, spec) {
  const m = parseSpec(spec);
  const eKey = (e.key || "").toLowerCase();
  if (m.key && eKey !== m.key) return false;
  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  if (m.ctrl !== ctrlOrMeta) return false;
  if (m.shift !== e.shiftKey) return false;
  if (m.alt !== e.altKey) return false;
  return true;
}
export function useShortcut(spec, handler, deps = []) {
  useEffect(() => {
    const specs = Array.isArray(spec) ? spec : [spec];
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toUpperCase();
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const isModified = e.ctrlKey || e.metaKey || e.altKey;
      if (isTyping && !isModified && (e.key || "").toLowerCase() !== "escape") return;
      for (const s of specs) {
        if (matches(e, s)) { e.preventDefault(); handler(e); return; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
export default useShortcut;
