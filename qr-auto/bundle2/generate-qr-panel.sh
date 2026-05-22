#!/usr/bin/env bash
# generate-qr-panel.sh — creates NEW composite files only (never edits existing files):
#   src/modules/inventory/components/QrInventoryPanel.jsx  (scan → tag/movement/repair/audit)
#   src/modules/inventory/pages/QrItemView.jsx             (route target)
#   src/modules/inventory/integration/recordItemRepair.js  (repairs adapter hook)
# Idempotent: overwrites only these generated files.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }
mkdir -p src/modules/inventory/components src/modules/inventory/pages src/modules/inventory/integration

cat > src/modules/inventory/components/QrInventoryPanel.jsx <<'JSX'
// QrInventoryPanel — composite QR flow (GENERATED, additive). Scan → fetch → tag preview +
// print + movement history + repair history + audit. Reuses the installed QR components.
import { useState } from 'react';
import QrScanInput      from '@modules/inventory/components/QrScanInput';
import ItemQrTag        from '@modules/inventory/components/ItemQrTag';
import MovementTimeline from '@modules/inventory/components/MovementTimeline';
import RepairHistoryList from '@modules/inventory/components/RepairHistoryList';
import AuditTrail       from '@modules/inventory/components/AuditTrail';
import useItem          from '@modules/inventory/hooks/useItem';

export default function QrInventoryPanel({ initialItemId = null }) {
  const [activeId, setActiveId] = useState(initialItemId);
  const { item, loading } = useItem(activeId);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <QrScanInput onResolved={(it) => setActiveId(it.itemId)} />
        {loading && <p className="text-sm text-gray-400">Loading item…</p>}
        {item && (
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800">{item.sku || item.itemId}</h3>
            <p className="font-mono text-xs text-gray-500">{item.itemId}</p>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
              <dt className="text-gray-400">Category</dt><dd>{item.category}</dd>
              <dt className="text-gray-400">Metal/Purity</dt><dd>{item.metal} {item.purity}</dd>
              <dt className="text-gray-400">Gross</dt><dd>{item.grossWeight} g</dd>
              <dt className="text-gray-400">Net</dt><dd>{item.netWeight} g</dd>
              <dt className="text-gray-400">HUID</dt><dd>{item.huid || '—'}</dd>
              <dt className="text-gray-400">Status</dt><dd className="capitalize">{item.status}</dd>
            </dl>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {item && <ItemQrTag item={item} templateId="hang_81x12" />}
        {item && (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-gray-700">Movement history</h4>
            <MovementTimeline itemId={item.itemId} />
          </section>
        )}
        {item && (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-gray-700">Repairs</h4>
            <RepairHistoryList itemId={item.itemId} />
          </section>
        )}
        {item && (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-gray-700">Audit</h4>
            <AuditTrail entityType="item" entityId={item.itemId} />
          </section>
        )}
      </div>
    </div>
  );
}
JSX

cat > src/modules/inventory/pages/QrItemView.jsx <<'JSX'
// QrItemView — route target for the QR-first item flow (GENERATED, additive).
import QrInventoryPanel from '@modules/inventory/components/QrInventoryPanel';

export default function QrItemView() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">QR Item Lookup</h1>
      <QrInventoryPanel />
    </div>
  );
}
JSX

cat > src/modules/inventory/integration/recordItemRepair.js <<'JS'
// recordItemRepair — additive hook to log a repair against a scanned QR item (GENERATED).
// Append-only: writes an item_repairs row; the onRepairWrite Cloud Function flips item
// status (in_repair / in_stock) and appends a movement. QR identity never changes.
import { useCallback } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { useQrRuntime } from './qrRuntime';
import { appendRepair } from '@firebase/items';
import { buildRepair, REPAIR_STATUS } from '@shared/models/itemRepair';

export function useRecordItemRepair() {
  const { shopId, uid, employeeId } = useQrRuntime();
  const recordRepair = useCallback(async (input) => {
    if (!shopId) throw new Error('[QR] no shopId; cannot record repair');
    const doc = buildRepair({
      itemId: input.itemId,
      issue: input.issue,
      karigarId: input.karigarId,
      status: input.status || REPAIR_STATUS.RECEIVED,
      weightBefore: input.weightBefore,
      weightAfter: input.weightAfter,
      stonesAddedWeightG: input.stonesAddedWeightG,
      stonesRemovedWeightG: input.stonesRemovedWeightG,
      charges: input.charges,
      receivedAt: input.receivedAt || serverTimestamp(),
      deliveredAt: input.deliveredAt || null,
    }, { shopId, uid, employeeId });
    return appendRepair(doc, { shopId, employeeId });
  }, [shopId, uid, employeeId]);
  return { recordRepair };
}
JS

echo "generated:"
echo "  src/modules/inventory/components/QrInventoryPanel.jsx"
echo "  src/modules/inventory/pages/QrItemView.jsx"
echo "  src/modules/inventory/integration/recordItemRepair.js"
