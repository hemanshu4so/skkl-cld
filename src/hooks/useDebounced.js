// src/hooks/useDebounced.js
import { useEffect, useState } from "react";

/**
 * Debounce a value. Useful for search inputs:
 *   const debouncedSearch = useDebounced(search, 250);
 *   useEffect(() => { runSearch(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default useDebounced;
