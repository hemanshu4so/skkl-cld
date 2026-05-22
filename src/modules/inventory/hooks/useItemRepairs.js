// useItemRepairs(itemId) — append-only repair history, client-sorted.
import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@fb/client';
import { toDate } from '@shared/safe';

export default function useItemRepairs(itemId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(!!itemId);
  const subRef = useRef(null);

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!itemId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, 'item_repairs'), where('itemId', '==', itemId));
    subRef.current = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (toDate(b.at)?.getTime?.() || 0) - (toDate(a.at)?.getTime?.() || 0));
      setRows(list); setLoading(false);
    }, () => setLoading(false));
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [itemId]);

  return { repairs: rows, loading };
}
