import { useEffect, useRef, useState } from "react";
import { onSnapshot } from "firebase/firestore";
export function useSafeSnapshot(buildQuery, deps = [], options = {}) {
  const { mapper = (d) => ({ id: d.id, ...d.data() }), enabled = true } = options;
  const [data, setData] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  const unsubRef = useRef(null);
  useEffect(() => {
    if (unsubRef.current) { try { unsubRef.current(); } catch {} unsubRef.current = null; }
    if (!enabled) { setLoading(false); return undefined; }
    let q; try { q = buildQuery(); } catch (err) { setError(err); setLoading(false); return undefined; }
    if (!q) { setLoading(false); return undefined; }
    const u = onSnapshot(q,
      (snap)=>{try{setData(snap.docs.map(mapper));setError(null);}catch(err){setError(err);}finally{setLoading(false);}},
      (err)=>{setError(err);setLoading(false);});
    unsubRef.current = u;
    return ()=>{ if (unsubRef.current) { try { unsubRef.current(); } catch {} unsubRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}
export default useSafeSnapshot;
