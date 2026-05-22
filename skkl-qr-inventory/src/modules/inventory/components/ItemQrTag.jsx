// ItemQrTag — renders the printable QR tag for an item using the restored TagCanvas.
// QR encodes the identity string ONLY (itemId). Logs the print to tag_history.
import { useMemo } from 'react';
import TagCanvas from '@modules/barcode/components/TagCanvas';
import { PRESET_TEMPLATES } from '@modules/barcode/lib/barcodeTemplate';
import { qrPayload } from '@modules/inventory/lib/qrIdentity';
import { appendTagPrint } from '@firebase/items';
import { useAuth } from '@app/providers/AuthProvider';

export default function ItemQrTag({ item, templateId = 'hang_81x12', copies = 1, dpi = 203 }) {
  const { shopId, employeeId } = useAuth();
  const template = useMemo(
    () => PRESET_TEMPLATES.find((t) => t.id === templateId) || PRESET_TEMPLATES[0],
    [templateId],
  );
  if (!item) return null;

  const payload = qrPayload(item.itemId);
  // Map item fields into the template's field bindings (HUID, weight, purity, price, qr)
  const fields = {
    qr: payload,
    itemId: item.itemId,
    huid: item.huid,
    purity: item.purity,
    grossWeight: item.grossWeight,
    netWeight: item.netWeight,
    sku: item.sku,
    designCode: item.designCode,
  };

  async function handlePrint() {
    try {
      await appendTagPrint({ itemId: item.itemId, templateId: template.id, copies,
        branchId: item.branchId }, { shopId, employeeId });
    } catch (e) { /* surface via toast in caller; print still proceeds */ }
    window.print();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-lg border border-gray-200 bg-white p-2 print:border-0">
        <TagCanvas template={template} fields={fields} dpi={dpi} />
      </div>
      <button
        type="button"
        onClick={handlePrint}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white print:hidden"
      >
        Print tag ({copies} {copies === 1 ? 'copy' : 'copies'})
      </button>
      <p className="text-xs text-gray-400 print:hidden">QR payload: <span className="font-mono">{payload}</span></p>
    </div>
  );
}
