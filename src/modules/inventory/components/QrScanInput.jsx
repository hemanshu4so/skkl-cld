// QrScanInput — manual + keyboard-wedge + (optional) camera scan of a SKKL item id.
// Resolves to the full item via Firebase. Stores NOTHING in the QR; just reads identity.
import { useState, useRef } from 'react';
import useItemByQr from '@modules/inventory/hooks/useItemByQr';

export default function QrScanInput({ onResolved }) {
  const { resolve, loading, error } = useItemByQr();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  async function submit(raw) {
    const found = await resolve(raw);
    if (found && onResolved) onResolved(found);
    setValue('');
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">Scan / enter QR</label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
          placeholder="SKKL-ITM-000001"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(value); }}
        />
        <button
          type="button"
          onClick={() => submit(value)}
          disabled={loading || !value}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Looking…' : 'Resolve'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">
        Hardware scanners type the id + Enter automatically. QR holds the id only — all
        details load from the database.
      </p>
    </div>
  );
}
