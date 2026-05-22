// qrDebug.js (GENERATED) — additive diagnostics. Zero deps, self-contained toast.
// Enable verbose logs: localStorage.setItem('QR_DEBUG','1')  (or window.__QR_DEBUG = true)
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@firebase/client';

function debugOn() {
  try { return (typeof window !== 'undefined' && (window.__QR_DEBUG || localStorage.getItem('QR_DEBUG') === '1')); }
  catch { return false; }
}
export function qrLog(...args)  { if (debugOn()) console.log('%c[QR]', 'color:#b45309;font-weight:600', ...args); }
export function qrWarn(...args) { console.warn('[QR]', ...args); }
export function qrErr(...args)  { console.error('[QR]', ...args); }

// Minimal transient toast (no dependency on the app's toast system).
export function qrToast(message, kind = 'success') {
  try {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.textContent = message;
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed', 'z-index:99999', 'bottom:20px', 'right:20px',
      'padding:10px 14px', 'border-radius:10px', 'font:600 13px system-ui,sans-serif',
      'color:#fff', 'box-shadow:0 6px 24px rgba(0,0,0,.18)',
      `background:${kind === 'error' ? '#dc2626' : kind === 'warn' ? '#d97706' : '#059669'}`,
      'opacity:0', 'transition:opacity .15s ease',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 2600);
  } catch { /* no-op */ }
}

// Read-back verification: confirm the item doc actually landed in Firestore.
export async function verifyItemWrite(itemId) {
  try {
    const snap = await getDoc(doc(db, 'items', itemId));
    if (snap.exists()) { qrLog('write verified:', itemId, snap.data()); return true; }
    qrErr('write verification FAILED — doc missing:', itemId); return false;
  } catch (e) { qrErr('write verification error:', e); return false; }
}
