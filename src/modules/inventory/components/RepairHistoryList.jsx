// RepairHistoryList — append-only repair records for an item.
import useItemRepairs from '@modules/inventory/hooks/useItemRepairs';
import { toDate, safeNumber } from '@shared/safe';

export default function RepairHistoryList({ itemId }) {
  const { repairs, loading } = useItemRepairs(itemId);
  if (loading) return <p className="text-sm text-gray-400">Loading repairs…</p>;
  if (!repairs.length) return <p className="text-sm text-gray-400">No repairs recorded.</p>;

  return (
    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {repairs.map((r) => (
        <div key={r.id} className="flex items-start justify-between p-3">
          <div>
            <p className="text-sm font-medium text-gray-800">{r.issue || 'Repair'}</p>
            <p className="text-xs text-gray-500">
              {safeNumber(r.weightBefore)}g → {safeNumber(r.weightAfter)}g
              {r.charges ? ` · ₹${safeNumber(r.charges)}` : ''}
            </p>
          </div>
          <div className="text-right">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">{r.status}</span>
            <p className="mt-1 text-[11px] text-gray-400">{toDate(r.at)?.toLocaleDateString?.() || '—'}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
