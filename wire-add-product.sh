#!/usr/bin/env bash
# wire-add-product.sh — additively wires QR item creation into the Inventory save flow.
# SAFE: backup-first, marker-idempotent, anchored INSERT only (never replaces JSX),
# build-verify-or-revert, and STOPS with manual instructions if confidence is low.
#
# Flags: --dry-run  (show plan)   QR_SKIP_BUILD=1  QR_ALLOW_DIRTY=1
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_qrlib.sh"
cd "$(qr_repo_root)" || { echo "Run inside a git repo." >&2; exit 2; }
[ -f qr-integration.config.json ] || { echo "Run detect-qr-runtime.sh first." >&2; exit 1; }
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

qr_require_clean || exit 1

PAGE="$(python3 -c "import json;print(json.load(open('qr-integration.config.json')).get('inventory',{}).get('pageFile',''))")"
HANDLER="$(python3 -c "import json;print(json.load(open('qr-integration.config.json')).get('inventory',{}).get('saveHandler') or '')")"
COLL="$(python3 -c "import json;print(json.load(open('qr-integration.config.json')).get('inventory',{}).get('productCollection') or 'products')")"
PAYLOAD="$(python3 -c "import json;print(json.load(open('qr-integration.config.json')).get('inventory',{}).get('payloadVar') or '')")"

if [ -z "$PAGE" ] || [ ! -f "$PAGE" ]; then
  echo "STOP: no Inventory page detected. Manual wiring below."
  cat "$HERE/MANUAL_WIRE.txt" 2>/dev/null || true
  exit 2
fi

echo "Target page : $PAGE"
echo "Handler     : ${HANDLER:-<unknown>}"
echo "Collection  : $COLL   payloadVar: ${PAYLOAD:-<unknown>}"

if qr_has_marker "$PAGE"; then
  echo "✓ QR-AUTO markers already present in $PAGE — nothing to do (idempotent)."
  exit 0
fi

# Confidence gate: need the product-save anchor + a payload var to pass to createQrItem.
if [ -z "$PAYLOAD" ]; then
  echo "STOP: could not identify the save payload variable with confidence."
  echo "      Refusing to edit blindly. Manual one-liner:"
  echo ""
  echo "  1) import:  import { useCreateQrItem } from '@modules/inventory/integration/createQrItem';"
  echo "  2) in the component body (with other hooks):  const { createQrItem } = useCreateQrItem();"
  echo "  3) right AFTER your '$COLL' addDoc await, add:"
  echo "       try { await createQrItem(<yourPayload>, { productId: <savedRef>.id, productCollection: '$COLL' }); }"
  echo "       catch (e) { console.error('[QR] item create failed (non-blocking):', e); }"
  exit 2
fi

if [ "$DRY" = "1" ]; then
  echo "[dry-run] would insert (idempotent, marked):"
  echo "   import useCreateQrItem (top)"
  echo "   const { createQrItem } = useCreateQrItem();  (after first hook)"
  echo "   QR call after the $COLL addDoc await, using payload '$PAYLOAD'"
  exit 0
fi

qr_backup "$PAGE"

PAGE="$PAGE" COLL="$COLL" PAYLOAD="$PAYLOAD" python3 - <<'PY'
import os,re
page=os.environ["PAGE"]; coll=os.environ["COLL"]; payload=os.environ["PAYLOAD"]
c=open(page,encoding="utf-8").read()
orig=c

IMPORT="import { useCreateQrItem } from '@modules/inventory/integration/createQrItem';"
# 1) add import after the LAST top-level import line
if "useCreateQrItem" not in c:
    imps=list(re.finditer(r'^import .*?;[ \t]*$', c, re.M))
    if imps:
        ins=imps[-1].end()
        c=c[:ins]+"\n"+IMPORT+"  /* QR-AUTO */"+c[ins:]
    else:
        c=IMPORT+"  /* QR-AUTO */\n"+c

# 2) add the hook call right after the first hook line (useAuth/useState/useQrRuntime)
if "useCreateQrItem()" not in c:
    hook=re.search(r'^[ \t]*const\s*\{[^}]*\}\s*=\s*use\w+\([^)]*\);[ \t]*$', c, re.M)
    line="\n  const { createQrItem } = useCreateQrItem(); /* QR-AUTO */"
    if hook:
        c=c[:hook.end()]+line+c[hook.end():]
    else:
        # fallback: after the function/component opening brace of the default export
        comp=re.search(r'export default function\s+\w+\s*\([^)]*\)\s*\{', c)
        if comp: c=c[:comp.end()]+line+c[comp.end():]

# 3) insert QR call right after the product-save await line
# match:  const X = await addDoc(collection(db,'<coll>'), <payload> ...);  (capture X if present)
pat=re.compile(r'((?:const|let|var)\s+(\w+)\s*=\s*)?await\s+(addDoc|setDoc)\(\s*(?:doc\(\s*)?collection\(\s*\w+\s*,\s*[\'"]'+re.escape(coll)+r'[\'"]\s*\)[^;]*;', re.S)
m=pat.search(c)
if m:
    saved=m.group(2)  # e.g. 'ref' if `const ref = await addDoc(...)`
    prod_id = (saved+".id") if saved else "undefined"
    block=("\n      /* QR-AUTO:BEGIN add-product → QR item (additive, non-blocking) */\n"
           f"      try {{ await createQrItem({payload}, {{ productId: {prod_id}, productCollection: '{coll}' }}); }}\n"
           "      catch (e) {{ console.error('[QR] item create failed (non-blocking):', e); }}\n"
           "      /* QR-AUTO:END */")
    # block uses literal braces; fix doubled braces from f-string-free string:
    block=block.replace("{{","{").replace("}}","}")
    c=c[:m.end()]+block+c[m.end():]
else:
    # could not anchor — abort edit (leave file as-is minus import/hook we may have added)
    print("ANCHOR_FAIL")
    raise SystemExit(0)

if c!=orig:
    open(page,"w",encoding="utf-8").write(c)
    print("EDITED")
else:
    print("NOCHANGE")
PY
RESULT=$?

# Detect anchor failure: if no QR-AUTO:BEGIN block landed, revert and emit manual help.
if ! grep -q "QR-AUTO:BEGIN" "$PAGE"; then
  echo "STOP: could not anchor the QR call after the '$COLL' save. Restoring backup."
  newest="$(ls -t "$PAGE".qrbak.* 2>/dev/null | head -1)"
  [ -n "$newest" ] && cp "$newest" "$PAGE"
  echo "  Manual: after your addDoc('$COLL', $PAYLOAD) await, add the QR-AUTO try/catch block"
  echo "  calling: await createQrItem($PAYLOAD, { productId: <ref>.id, productCollection: '$COLL' });"
  exit 2
fi

if qr_build_or_revert "$PAGE"; then
  echo "✓ wired QR item creation into $PAGE (additive, marked, backed-up)."
  echo "  Review: git diff -- $PAGE"
else
  echo "✗ build failed; $PAGE restored from backup. No changes kept."
  exit 1
fi
