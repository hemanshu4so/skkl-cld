import { useEffect, useRef } from "react";
export function useAutoFocus(key = "default") {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.focus === "function") {
      Promise.resolve().then(() => el.focus());
    }
  }, [key]);
  return ref;
}
export default useAutoFocus;
