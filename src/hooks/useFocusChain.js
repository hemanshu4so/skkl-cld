// src/hooks/useFocusChain.js
//
// Build a chain of refs and let Enter (or Tab) move focus to the next field.
//
// Usage:
//   const chain = useFocusChain(["name", "phone", "address", "save"]);
//   <input ref={chain.ref("name")} onKeyDown={chain.onKey("name")} />
//   <input ref={chain.ref("phone")} onKeyDown={chain.onKey("phone")} />
//   ...
//   <button ref={chain.ref("save")} onClick={save}>Save</button>

import { useRef } from "react";

export function useFocusChain(keys = []) {
  const refs = useRef({});
  const order = useRef(keys);

  // Keep the order ref in sync without re-creating refs map every render
  order.current = keys;

  const ref = (key) => (el) => {
    if (el) refs.current[key] = el;
    else delete refs.current[key];
  };

  const focus = (key) => {
    const el = refs.current[key];
    if (el && typeof el.focus === "function") {
      el.focus();
      if (typeof el.select === "function") {
        try { el.select(); } catch { /* not all elements support .select() */ }
      }
    }
  };

  const onKey = (key) => (e) => {
    if (e.key !== "Enter") return;
    // Shift+Enter is "submit" or "newline" depending on element; we don't override.
    if (e.shiftKey) return;
    const idx = order.current.indexOf(key);
    if (idx === -1 || idx === order.current.length - 1) return;
    e.preventDefault();
    focus(order.current[idx + 1]);
  };

  return { ref, onKey, focus };
}

export default useFocusChain;
