#!/usr/bin/env bash
# patch-auth-runtime.sh — hardens QR auth resolution + diagnostics. SAFE/idempotent.
#  1) regenerates src/modules/inventory/integration/qrRuntime.js  (full fallback resolver)
#  2) regenerates createQrItem.js with success toast + Firebase write verification
#  3) writes qrDebug.js (runtime logger + minimal self-contained toast)
#  4) fixes bare `auth.currentUser|uid|user` ONLY inside QR-owned scope (our files + QR-AUTO
#     marked blocks); REPORTS occurrences in your own code without editing them
#  Backup-first, build-verify-or-revert. Never touches barcode module. No blind Inventory rewrite.
#
# Flags: --dry-run    env: QR_SKIP_BUILD=1  QR_ALLOW_DIRTY=1
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; . "$HERE/_qrlib.sh"
cd "$(qr_repo_root)" || exit 2
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
qr_require_clean || exit 1

DIR="src/modules/inventory/integration"
mkdir -p "$DIR"

# auth import (from prior detection or default)
AUTH_IMPORT="@app/providers/AuthProvider"; AUTH_HOOK="useAuth"
[ -f qr-integration.config.json ] && {
  AUTH_IMPORT="$(python3 -c "import json;c=json.load(open('qr-integration.config.json'));print(c.get('auth',{}).get('import') or '@app/providers/AuthProvider')")"
  AUTH_HOOK="$(python3 -c "import json;c=json.load(open('qr-integration.config.json'));print(c.get('auth',{}).get('hook') or 'useAuth')")"
}
echo "auth import: $AUTH_IMPORT  hook: $AUTH_HOOK"

if [ "$DRY" = "1" ]; then
  echo "[dry-run] would regenerate qrRuntime.js, createQrItem.js, qrDebug.js and fix QR-owned auth.* refs"
  exit 0
fi

# back up the files we will (re)write
for f in "$DIR/qrRuntime.js" "$DIR/createQrItem.js" "$DIR/qrDebug.js"; do [ -f "$f" ] && qr_backup "$f"; done

# 1) hardened resolver
AUTH_IMPORT="$AUTH_IMPORT" AUTH_HOOK="$AUTH_HOOK" python3 - "$DIR" <<'PY'
import os,sys
DIR=sys.argv[1]; imp=os.environ["AUTH_IMPORT"]; hook=os.environ["AUTH_HOOK"]
open(os.path.join(DIR,"qrRuntime.js"),"w").write(f'''// qrRuntime.js (GENERATED, hardened) — resolves uid/shopId/employeeId from ANY common
// auth shape: user | currentUser | profile | session(.user) | claims. Never references a
// bare `auth` global; everything comes from {hook}().
import {{ {hook} }} from '{imp}';

function pickFirst(...vals) {{ for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; return null; }}

export function resolveQrRuntime(a) {{
  a = a || {{}};
  const user    = a.user || a.currentUser || a.profile || (a.session && a.session.user) || a.session || {{}};
  const claims  = a.claims || user.claims || {{}};
  const uid = pickFirst(
    user.uid, a.uid, a.currentUser && a.currentUser.uid, a.user && a.user.uid,
    a.profile && a.profile.uid, claims.uid, claims.user_id,
  );
  const shopId = pickFirst(
    a.shopId, user.shopId, a.profile && a.profile.shopId, a.session && a.session.shopId,
    claims.shopId, a.shop && a.shop.id, user.shop && user.shop.id,
  );
  const employeeId = pickFirst(
    a.employeeId, user.employeeId, a.profile && a.profile.employeeId,
    a.employee && a.employee.id, claims.employeeId,
  );
  const branchId = pickFirst(a.branchId, user.branchId, a.profile && a.profile.branchId, a.branch && a.branch.id);
  const counterId = pickFirst(a.counterId, user.counterId, a.counter && a.counter.id);
  const role = pickFirst(a.role, user.role, a.profile && a.profile.role, claims.role);
  return {{ uid, shopId, employeeId, branchId, counterId, role, ready: !!shopId }};
}}

export function useQrRuntime() {{
  const a = {hook}() || {{}};
  return resolveQrRuntime(a);
}}
''')
print("  ✓ qrRuntime.js (hardened)")
PY

# 2) qrDebug.js — logger + toast + write-verify helper
cat > "$DIR/qrDebug.js" <<'JS'
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
JS
echo "  ✓ qrDebug.js"

# 3) regenerate createQrItem.js with toast + write-verify + debug logs
cat > "$DIR/createQrItem.js" <<'JS'
// createQrItem.js (GENERATED, hardened) — additive QR item creation with diagnostics.
import { useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@firebase/client';
import { useQrRuntime } from './qrRuntime';
import { qrLog, qrErr, qrToast, verifyItemWrite } from './qrDebug';
import { buildItemDraft } from '@shared/models/item';
import { createItemWithIdentity } from '@firebase/items';

function mapProductToItemInput(p) {
  p = p || {};
  return {
    sku: p.sku ?? p.code ?? '', designCode: p.designCode ?? p.design ?? '',
    category: p.category ?? p.type ?? 'other', subCategory: p.subCategory ?? '',
    metal: p.metal ?? p.material ?? 'gold', purity: p.purity ?? p.karat ?? '',
    hallmark: p.hallmark ?? !!p.huid, huid: p.huid ?? '',
    grossWeight: p.grossWeight ?? p.weight ?? p.grossWt ?? 0,
    netWeight: p.netWeight ?? p.netWt ?? 0, stoneWeight: p.stoneWeight ?? p.stoneWt ?? 0,
    diamondWeight: p.diamondWeight ?? 0,
    stoneDetails: Array.isArray(p.stoneDetails) ? p.stoneDetails : [],
    makingChargeType: p.makingChargeType ?? 'per_gram',
    makingChargeValue: p.makingChargeValue ?? p.making ?? 0,
    wastagePct: p.wastagePct ?? p.wastage ?? 0,
    vendorId: p.vendorId ?? null, branchId: p.branchId ?? null, counterId: p.counterId ?? null,
    location: p.location ?? '', rateAtEntry: p.rateAtEntry ?? p.rate ?? 0,
    images: Array.isArray(p.images) ? p.images : [], tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

export function useCreateQrItem() {
  const rt = useQrRuntime();
  const { shopId, uid, employeeId, branchId, counterId } = rt;

  const createQrItem = useCallback(async (payload, opts = {}) => {
    qrLog('createQrItem: runtime', rt);
    if (!shopId) { qrErr('no shopId resolved from auth runtime', rt); qrToast('QR item skipped: no shop in session', 'error'); throw new Error('[QR] no shopId in auth runtime'); }
    const input = mapProductToItemInput(payload);
    if (branchId && !input.branchId) input.branchId = branchId;
    if (counterId && !input.counterId) input.counterId = counterId;
    const draft = buildItemDraft(input, { shopId, uid, employeeId });
    if (opts.productId) draft.linkedProductId = opts.productId;

    qrLog('creating item with draft', draft);
    const itemId = await createItemWithIdentity(draft, { shopId, uid, employeeId });
    qrLog('createItemWithIdentity returned', itemId);

    await verifyItemWrite(itemId);                 // Firebase write verification log

    if (opts.productId && opts.linkBack !== false) {
      try {
        await updateDoc(doc(db, opts.productCollection || 'products', opts.productId),
          { itemId, qrId: itemId, qrLinkedAt: serverTimestamp() });
        qrLog('linked product', opts.productId, '→', itemId);
      } catch (e) { qrErr('product link failed (non-blocking):', e); }
    }
    qrToast(`QR item created: ${itemId}`);          // success toast
    return itemId;
  }, [shopId, uid, employeeId, branchId, counterId]);

  return { createQrItem };
}
JS
echo "  ✓ createQrItem.js (toast + write-verify + debug)"

# 4) fix bare auth.* ONLY in QR-owned scope; report others
python3 - <<'PY'
import os,re,glob
ROOT=os.getcwd(); SRC=os.path.join(ROOT,"src")
def read(p):
    try: return open(p,encoding="utf-8",errors="ignore").read()
    except: return ""
fixed=[]; reported=[]
for ext in ("js","jsx","ts","tsx"):
    for f in glob.glob(f"{SRC}/**/*.{ext}",recursive=True):
        if "/modules/barcode/" in f: continue          # never touch barcode
        c=read(f); 
        if not re.search(r'\bauth\.\w+', c): continue
        defined = bool(re.search(r'\b(const|let|var)\s+auth\b', c)) or \
                  bool(re.search(r'import\s+\{[^}]*\bauth\b[^}]*\}\s+from', c)) or \
                  bool(re.search(r'import\s+auth\s+from', c)) or \
                  bool(re.search(r'function\s+\w+\s*\([^)]*\bauth\b', c))
        if defined: continue
        qr_owned = ("/modules/inventory/integration/" in f) or ("QR-AUTO" in c)
        rel=os.path.relpath(f,ROOT)
        if qr_owned and "/modules/inventory/integration/" in f:
            # our integration files are regenerated above; nothing to fix here
            continue
        if qr_owned:
            # 1) ensure useQrRuntime import + a marked component-top binding `__qrAuth`
            changed=False
            if "useQrRuntime" not in c:
                imps=list(re.finditer(r'^import .*?;[ \t]*$', c, re.M))
                IMP="import { useQrRuntime } from '@modules/inventory/integration/qrRuntime';  /* QR-AUTO */"
                if imps: c=c[:imps[-1].end()]+"\n"+IMP+c[imps[-1].end():]; changed=True
            if "__qrAuth" not in c:
                hook=re.search(r'^[ \t]*const\s*\{[^}]*\}\s*=\s*use\w+\([^)]*\);[ \t]*$', c, re.M)
                bind="\n  const __qrAuth = useQrRuntime(); /* QR-AUTO */"
                if hook: c=c[:hook.end()]+bind+c[hook.end():]; changed=True
                else:
                    comp=re.search(r'export default function\s+\w+\s*\([^)]*\)\s*\{', c)
                    if comp: c=c[:comp.end()]+bind+c[comp.end():]; changed=True
            # 2) within QR-AUTO blocks, rewrite bare auth.* -> __qrAuth.*
            lines=c.splitlines(); inblk=False
            for i,ln in enumerate(lines):
                if "QR-AUTO:BEGIN" in ln: inblk=True
                if inblk:
                    new=ln
                    new=re.sub(r'\bauth\.currentUser\.uid\b','__qrAuth.uid',new)
                    new=re.sub(r'\bauth\.(currentUser|user|profile)\b','__qrAuth',new)
                    new=re.sub(r'\bauth\.uid\b','__qrAuth.uid',new)
                    new=re.sub(r'\bauth\.shopId\b','__qrAuth.shopId',new)
                    new=re.sub(r'\bauth\.employeeId\b','__qrAuth.employeeId',new)
                    if new!=ln: lines[i]=new; changed=True
                if "QR-AUTO:END" in ln: inblk=False
            if changed:
                open(f,"w").write("\n".join(lines)+("\n" if c.endswith("\n") else ""))
                fixed.append(rel)
        else:
            for i,ln in enumerate(c.splitlines(),1):
                if re.search(r'\bauth\.\w+', ln): reported.append((rel,i,ln.strip()[:90]))
print("fixed (QR-owned scope):", fixed or "(none)")
if reported:
    print("REPORT — bare `auth.` in YOUR code (NOT edited; fix manually):")
    for (f,i,ln) in reported:
        print(f"  {f}:{i}  {ln}")
    print("  Suggested fix: import { useQrRuntime } from '@modules/inventory/integration/qrRuntime';")
    print("                 const { uid, shopId } = useQrRuntime();  // then use uid/shopId instead of auth.*")
PY

# build-verify-or-revert across the files we touched
qr_build_or_revert "$DIR/qrRuntime.js" "$DIR/createQrItem.js" "$DIR/qrDebug.js" \
  && echo "✓ auth runtime hardened; build green." \
  || { echo "✗ build failed; backups restored."; exit 1; }
