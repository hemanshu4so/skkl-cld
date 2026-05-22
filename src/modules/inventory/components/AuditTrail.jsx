// AuditTrail — immutable audit_logs for one entity (default: this item).
import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@firebase/client';
import { useAuth } from '@app/providers/AuthProvider';
import { toDate } from '@shared/safe';

export default function AuditTrail({ entityType = 'item', entityId }) {
  const { shopId } = useAuth();
  const [rows, setRows] = useState([]);
  const subRef = useRef(null);

  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!entityId || !shopId) return;
    const q = query(collection(db, 'audit_logs'),
      where('shopId', '==', shopId), where('entityType', '==', entityType), where('entityId', '==', entityId));
    subRef.current = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (toDate(b.at)?.getTime?.() || 0) - (toDate(a.at)?.getTime?.() || 0));
      setRows(list);
    });
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [shopId, entityType, entityId]);

  if (!rows.length) return <p className="text-sm text-gray-400">No audit entries.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
          <span className="font-mono text-gray-700">{a.action}</span>
          <span className="text-gray-400">{a.byEmployeeId || a.byUid || '—'} · {toDate(a.at)?.toLocaleString?.() || ''}</span>
        </li>
      ))}
    </ul>
  );
}
