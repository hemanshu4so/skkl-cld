#!/usr/bin/env bash
# wire-repairs-qr.sh — additively log a QR item_repairs row when a repair is saved.
# Backup-first, marked, idempotent, build-verify-or-revert, manual fallback.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; . "$HERE/_qrlib.sh"
cd "$(qr_repo_root)" || exit 2
qr_require_clean || exit 1

# locate repairs page + its save (addDoc to repairs/item_repairs)
PAGE="$(ls src/modules/repairs/pages/Repairs.jsx src/modules/repairs/pages/*.jsx 2>/dev/null | head -1)"
[ -z "$PAGE" ] && { echo "STOP: no repairs page found. Skip (optional bundle)."; exit 2; }
echo "Repairs page: $PAGE"
if qr_has_marker "$PAGE"; then echo "✓ QR-AUTO already present — no-op."; exit 0; fi

# detect a save anchor + an itemId-bearing variable
INFO="$(PAGE="$PAGE" python3 - <<'PY'
import os,re
c=open(os.environ["PAGE"],encoding="utf-8").read()
m=re.search(r'await\s+addDoc\(\s*collection\(\s*\w+\s*,\s*[\'"](repairs|item_repairs)[\'"]\s*\)\s*,\s*([A-Za-z_]\w*)', c)
print((m.group(2) if m else "")+"|"+("yes" if m else "no"))
PY
)"
PAYLOAD="${INFO%%|*}"; FOUND="${INFO##*|}"
if [ "$FOUND" != "yes" ] || [ -z "$PAYLOAD" ]; then
  echo "STOP: no confident repairs save anchor. Manual one-liner:"
  echo "  import { useRecordItemRepair } from '@modules/inventory/integration/recordItemRepair';"
  echo "  const { recordRepair } = useRecordItemRepair();"
  echo "  // after saving the repair, if it targets a QR item:"
  echo "  try { await recordRepair({ itemId, issue, karigarId, weightBefore }); } catch(e){ console.error('[QR] repair log failed', e); }"
  exit 2
fi

qr_backup "$PAGE"
PAGE="$PAGE" PAYLOAD="$PAYLOAD" python3 - <<'PY'
import os,re
f=os.environ["PAGE"]; payload=os.environ["PAYLOAD"]; c=open(f,encoding="utf-8").read(); orig=c
IMP="import { useRecordItemRepair } from '@modules/inventory/integration/recordItemRepair';"
if "useRecordItemRepair" not in c:
    imps=list(re.finditer(r'^import .*?;[ \t]*$', c, re.M))
    if imps: c=c[:imps[-1].end()]+"\n"+IMP+"  /* QR-AUTO */"+c[imps[-1].end():]
if "useRecordItemRepair()" not in c:
    hook=re.search(r'^[ \t]*const\s*\{[^}]*\}\s*=\s*use\w+\([^)]*\);[ \t]*$', c, re.M)
    line="\n  const { recordRepair } = useRecordItemRepair(); /* QR-AUTO */"
    if hook: c=c[:hook.end()]+line+c[hook.end():]
m=re.search(r'await\s+addDoc\(\s*collection\(\s*\w+\s*,\s*[\'"](?:repairs|item_repairs)[\'"]\s*\)\s*,\s*'+re.escape(payload)+r'[^;]*;', c)
if m:
    blk=("\n      /* QR-AUTO:BEGIN repair → QR item log (additive, non-blocking) */\n"
         "      try { if ("+payload+" && "+payload+".itemId) await recordRepair("+payload+"); }\n"
         "      catch (e) { console.error('[QR] repair log failed (non-blocking):', e); }\n"
         "      /* QR-AUTO:END */")
    c=c[:m.end()]+blk+c[m.end():]
    open(f,"w",encoding="utf-8").write(c); print("EDITED")
else:
    print("ANCHOR_FAIL")
PY
if ! grep -q "QR-AUTO:BEGIN" "$PAGE"; then
  echo "STOP: could not anchor repair log. Restoring backup."
  newest="$(ls -t "$PAGE".qrbak.* 2>/dev/null | head -1)"; [ -n "$newest" ] && cp "$newest" "$PAGE"
  exit 2
fi
if qr_build_or_revert "$PAGE"; then echo "✓ repairs QR logging wired into $PAGE (additive)."; else echo "✗ build failed; restored."; exit 1; fi
