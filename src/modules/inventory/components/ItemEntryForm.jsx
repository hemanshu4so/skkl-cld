// ItemEntryForm — manufacturing/purchase item entry → allocates id + QR (write-once)
// → returns itemId so the caller can print the tag.
import { useState } from 'react';
import useCreateItem from '@modules/inventory/hooks/useCreateItem';

const CATEGORIES = ['ring','chain','necklace','bangle','bracelet','earring','pendant','coin','other'];
const PURITIES = ['24K','22K','18K','14K','999','916','750'];

export default function ItemEntryForm({ vendorId, branchId, counterId, onCreated }) {
  const { create, busy, error } = useCreateItem();
  const [f, setF] = useState({
    sku: '', designCode: '', category: 'ring', subCategory: '',
    metal: 'gold', purity: '22K', hallmark: true, huid: '',
    grossWeight: '', netWeight: '', stoneWeight: '', diamondWeight: '',
    makingChargeType: 'per_gram', makingChargeValue: '', wastagePct: '',
    rateAtEntry: '', location: '',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const itemId = await create({ ...f, vendorId, branchId, counterId });
    if (itemId && onCreated) onCreated(itemId);
  }

  const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <input className={input} placeholder="SKU" value={f.sku} onChange={set('sku')} />
      <input className={input} placeholder="Design code" value={f.designCode} onChange={set('designCode')} />
      <select className={input} value={f.category} onChange={set('category')}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input className={input} placeholder="Sub-category" value={f.subCategory} onChange={set('subCategory')} />
      <select className={input} value={f.metal} onChange={set('metal')}>
        {['gold','silver','platinum'].map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className={input} value={f.purity} onChange={set('purity')}>
        {PURITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input className={input} placeholder="Gross wt (g)" inputMode="decimal" value={f.grossWeight} onChange={set('grossWeight')} />
      <input className={input} placeholder="Net wt (g)" inputMode="decimal" value={f.netWeight} onChange={set('netWeight')} />
      <input className={input} placeholder="Stone wt (g)" inputMode="decimal" value={f.stoneWeight} onChange={set('stoneWeight')} />
      <input className={input} placeholder="Diamond wt (ct)" inputMode="decimal" value={f.diamondWeight} onChange={set('diamondWeight')} />
      <input className={input} placeholder="HUID (6)" maxLength={6} value={f.huid} onChange={set('huid')} />
      <input className={input} placeholder="Rate/g at entry" inputMode="decimal" value={f.rateAtEntry} onChange={set('rateAtEntry')} />
      <select className={input} value={f.makingChargeType} onChange={set('makingChargeType')}>
        {['per_gram','flat','percent'].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input className={input} placeholder="Making charge" inputMode="decimal" value={f.makingChargeValue} onChange={set('makingChargeValue')} />
      <input className={input} placeholder="Wastage %" inputMode="decimal" value={f.wastagePct} onChange={set('wastagePct')} />
      <input className={input} placeholder="Location (showcase)" value={f.location} onChange={set('location')} />
      <label className="col-span-2 flex items-center gap-2 text-sm md:col-span-1">
        <input type="checkbox" checked={f.hallmark} onChange={set('hallmark')} /> Hallmarked
      </label>

      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
      <div className="col-span-full flex justify-end">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create item + QR'}
        </button>
      </div>
    </form>
  );
}
