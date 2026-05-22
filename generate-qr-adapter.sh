#!/usr/bin/env bash
# generate-qr-adapter.sh — creates the defensive runtime adapter from the detected config.
# ONLY creates NEW files under src/modules/inventory/integration/. Never edits existing files.
# Idempotent: re-running overwrites only the generated adapter files (which are ours).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }
[ -f qr-integration.config.json ] || { echo "Run detect-qr-runtime.sh first (no config)." >&2; exit 1; }

DIR="src/modules/inventory/integration"
mkdir -p "$DIR"

python3 - "$DIR" <<'PY'
import os, json, sys
DIR=sys.argv[1]
cfg=json.load(open("qr-integration.config.json"))
auth_import = cfg.get("auth",{}).get("import") or "@app/providers/AuthProvider"
auth_hook   = cfg.get("auth",{}).get("hook") or "useAuth"

# qrRuntime.js — defensive resolution of shopId/uid/employeeId regardless of auth shape.
runtime = f'''// src/modules/inventory/integration/qrRuntime.js  (GENERATED — safe to regenerate)
// Defensive adapter: resolves shopId / uid / employeeId from the repo's REAL auth hook,
// tolerating multiple shapes so the QR layer never hard-codes your auth structure.
import {{ {auth_hook} }} from '{auth_import}';

export function useQrRuntime() {{
  const auth = ({auth_hook}() || {{}});
  const shopId =
    auth.shopId || (auth.shop && auth.shop.id) ||
    (auth.user && auth.user.shopId) || null;
  const uid =
    (auth.user && auth.user.uid) || (auth.currentUser && auth.currentUser.uid) ||
    auth.uid || null;
  const employeeId =
    auth.employeeId || (auth.employee && auth.employee.id) ||
    (auth.user && auth.user.employeeId) || null;
  const branchId =
    auth.branchId || (auth.branch && auth.branch.id) ||
    (auth.user && auth.user.branchId) || null;
  const counterId =
    auth.counterId || (auth.counter && auth.counter.id) || null;
  return {{ shopId, uid, employeeId, branchId, counterId, ready: !!shopId }};
}}
'''
open(os.path.join(DIR,"qrRuntime.js"),"w").write(runtime)

# createQrItem.js — hook that maps a product form/payload → QR item (additive, non-blocking).
create = '''// src/modules/inventory/integration/createQrItem.js  (GENERATED — safe to regenerate)
// Additive QR item creation. Maps your existing product payload into the QR item draft,
// allocates a permanent itemId + QR identity (write-once), and optionally links the
// existing product doc. Throws are caught by the caller (non-blocking by design).
import { useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@firebase/client';
import { useQrRuntime } from './qrRuntime';
import { buildItemDraft } from '@shared/models/item';
import { createItemWithIdentity } from '@firebase/items';

// Best-effort field mapping from a product payload to the QR item draft.
// Unknown fields are ignored by buildItemDraft; tweak here if your form differs.
function mapProductToItemInput(payload) {
  const p = payload || {};
  return {
    sku: p.sku ?? p.code ?? '',
    designCode: p.designCode ?? p.design ?? '',
    category: p.category ?? p.type ?? 'other',
    subCategory: p.subCategory ?? '',
    metal: p.metal ?? p.material ?? 'gold',
    purity: p.purity ?? p.karat ?? '',
    hallmark: p.hallmark ?? !!p.huid,
    huid: p.huid ?? '',
    grossWeight: p.grossWeight ?? p.weight ?? p.grossWt ?? 0,
    netWeight: p.netWeight ?? p.netWt ?? 0,
    stoneWeight: p.stoneWeight ?? p.stoneWt ?? 0,
    diamondWeight: p.diamondWeight ?? 0,
    stoneDetails: Array.isArray(p.stoneDetails) ? p.stoneDetails : [],
    makingChargeType: p.makingChargeType ?? 'per_gram',
    makingChargeValue: p.makingChargeValue ?? p.making ?? 0,
    wastagePct: p.wastagePct ?? p.wastage ?? 0,
    vendorId: p.vendorId ?? null,
    branchId: p.branchId ?? null,
    counterId: p.counterId ?? null,
    location: p.location ?? '',
    rateAtEntry: p.rateAtEntry ?? p.rate ?? 0,
    images: Array.isArray(p.images) ? p.images : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

export function useCreateQrItem() {
  const { shopId, uid, employeeId, branchId, counterId } = useQrRuntime();

  const createQrItem = useCallback(async (payload, opts = {}) => {
    if (!shopId) throw new Error('[QR] no shopId in auth runtime; cannot create item');
    const input = mapProductToItemInput(payload);
    if (branchId && !input.branchId) input.branchId = branchId;
    if (counterId && !input.counterId) input.counterId = counterId;
    const draft = buildItemDraft(input, { shopId, uid, employeeId });
    if (opts.productId) draft.linkedProductId = opts.productId;

    const itemId = await createItemWithIdentity(draft, { shopId, uid, employeeId });

    // Optional additive link back onto the existing product doc (does not alter your logic).
    if (opts.productId && opts.linkBack !== false) {
      try {
        await updateDoc(doc(db, opts.productCollection || 'products', opts.productId), {
          itemId, qrId: itemId, qrLinkedAt: serverTimestamp(),
        });
      } catch (e) { /* link is best-effort; item already exists with permanent identity */ }
    }
    return itemId;
  }, [shopId, uid, employeeId, branchId, counterId]);

  return { createQrItem };
}
'''
open(os.path.join(DIR,"createQrItem.js"),"w").write(create)
print("generated:")
print("  "+os.path.join(DIR,"qrRuntime.js"))
print("  "+os.path.join(DIR,"createQrItem.js"))
print("auth import used:", auth_import, "hook:", auth_hook)
PY
