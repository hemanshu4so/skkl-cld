// MovementTimeline — append-only item history (immutable).
import useItemMovements from '@modules/inventory/hooks/useItemMovements';
import { toDate } from '@shared/safe';

const LABEL = {
  created: 'Created', assigned: 'Assigned to counter', transferred: 'Transferred',
  sold: 'Sold', returned: 'Returned', repair_in: 'Sent to repair', repair_out: 'Back from repair',
  weight_change: 'Weight changed', stone_added: 'Stone added', stone_removed: 'Stone removed',
  exchanged: 'Exchanged', melted: 'Melted', lost: 'Marked lost', found: 'Found',
};

export default function MovementTimeline({ itemId }) {
  const { movements, loading } = useItemMovements(itemId);
  if (loading) return <p className="text-sm text-gray-400">Loading history…</p>;
  if (!movements.length) return <p className="text-sm text-gray-400">No movements yet.</p>;

  return (
    <ol className="relative ml-3 border-l border-gray-200">
      {movements.map((m) => (
        <li key={m.id} className="mb-4 ml-4">
          <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-amber-500" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{LABEL[m.type] || m.type}</span>
            <time className="text-xs text-gray-400">{toDate(m.at)?.toLocaleString?.() || '—'}</time>
          </div>
          {(m.fromBranchId || m.toBranchId) && (
            <p className="text-xs text-gray-500">{m.fromBranchId || '—'} → {m.toBranchId || '—'}</p>
          )}
          {m.note && <p className="text-xs text-gray-500">{m.note}</p>}
          {m.refId && <p className="text-[11px] text-gray-400">ref: {m.refType}/{m.refId}</p>}
        </li>
      ))}
    </ol>
  );
}
