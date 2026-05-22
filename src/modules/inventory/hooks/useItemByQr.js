// useItemByQr — resolve a scanned/typed payload to an item. itemId === qrId === docId.
import { useState, useCallback } from 'react';
import { fetchItemByQr } from '@fb/items';
import { decodeScan } from '@modules/inventory/lib/qrIdentity';

export default function useItemByQr() {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const resolve = useCallback(async (raw) => {
    setError(null); setItem(null);
    const itemId = decodeScan(raw);
    if (!itemId) { setError('Not a valid SKKL QR / item id'); return null; }
    setLoading(true);
    try {
      const found = await fetchItemByQr(itemId);
      if (!found) { setError(`No item for ${itemId}`); return null; }
      setItem(found);
      return found;
    } catch (e) { setError(e.message); return null; }
    finally { setLoading(false); }
  }, []);

  return { item, loading, error, resolve };
}
