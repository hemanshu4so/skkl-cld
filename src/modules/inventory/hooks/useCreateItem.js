// useCreateItem — wraps the data-layer transactional create (ID + QR write-once).
import { useState, useCallback } from 'react';
import { useAuth } from '@app/providers/AuthProvider';
import { buildItemDraft, validateItemDraft } from '@shared/models/item';
import { createItemWithIdentity } from '@fb/items';

export default function useCreateItem() {
  const { shopId, user, employeeId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const create = useCallback(async (formInput) => {
    setError(null);
    const draft = buildItemDraft(formInput, { shopId, uid: user?.uid, employeeId });
    const errs = validateItemDraft(draft);
    if (errs.length) { setError(errs.join('; ')); return null; }
    setBusy(true);
    try {
      const itemId = await createItemWithIdentity(draft, { shopId, uid: user?.uid, employeeId });
      return itemId;          // == qrId; ready to print tag
    } catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }, [shopId, user, employeeId]);

  return { create, busy, error };
}
