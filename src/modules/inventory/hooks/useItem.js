// useItem(itemId) — live single item via ref-tracked snapshot (no Target ID conflicts).
import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@fb/client';

export default function useItem(itemId) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(!!itemId);
  const [error, setError] = useState(null);
  const subRef = useRef(null);

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!itemId) { setItem(null); setLoading(false); return; }
    setLoading(true);
    subRef.current = onSnapshot(doc(db, 'items', itemId),
      (snap) => { setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null); setLoading(false); },
      (err) => { setError(err.message); setLoading(false); });
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [itemId]);

  return { item, loading, error };
}
