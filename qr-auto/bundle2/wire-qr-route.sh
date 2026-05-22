#!/usr/bin/env bash
# wire-qr-route.sh — registers the QrItemView route additively. Handles both:
#   (a) array-style routes  (export default [ {path, element}, ... ])
#   (b) JSX <Routes><Route/></Routes>
# Backup-first, marked, idempotent, build-verify-or-revert. STOPS with manual help if no
# safe anchor. Never edits existing route entries.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; . "$HERE/_qrlib.sh"
cd "$(qr_repo_root)" || exit 2
qr_require_clean || exit 1

# Find candidate routes files
CANDS="$(ls src/modules/inventory/routes.jsx src/modules/inventory/routes.js \
            src/app/routes/routes.config.jsx src/app/routes/routes.config.js 2>/dev/null || true)"
[ -z "$CANDS" ] && CANDS="$(grep -rl --include='*.jsx' --include='*.js' -E "Routes>|path:\s*['\"]/inventory" src 2>/dev/null | head -3)"

TARGET=""
for f in $CANDS; do [ -f "$f" ] && { TARGET="$f"; break; }; done
if [ -z "$TARGET" ]; then
  echo "STOP: no routes file found. Manual: add a route rendering QrItemView, e.g."
  echo "   { path: '/inventory/qr', element: <QrItemView/> }"
  echo "   import QrItemView from '@modules/inventory/pages/QrItemView';"
  exit 2
fi
echo "Routes file: $TARGET"

if qr_has_marker "$TARGET"; then echo "✓ QR-AUTO route already present — idempotent no-op."; exit 0; fi

qr_backup "$TARGET"
TARGET="$TARGET" python3 - <<'PY'
import os,re
f=os.environ["TARGET"]; c=open(f,encoding="utf-8").read(); orig=c
IMP="import QrItemView from '@modules/inventory/pages/QrItemView';"
if "QrItemView" not in c:
    imps=list(re.finditer(r'^import .*?;[ \t]*$', c, re.M))
    if imps: c=c[:imps[-1].end()]+"\n"+IMP+"  /* QR-AUTO */"+c[imps[-1].end():]
    else:    c=IMP+"  /* QR-AUTO */\n"+c

inserted=False
# (b) JSX <Routes> ... </Routes>
mjsx=re.search(r'</Routes>', c)
marr=re.search(r'(export\s+default\s+)?\[\s*', c)
if mjsx:
    route="\n      {/* QR-AUTO */}\n      <Route path=\"/inventory/qr\" element={<QrItemView/>} />\n    "
    c=c[:mjsx.start()]+route+c[mjsx.start():]
    inserted=True
else:
    # (a) array-style: append an entry after the opening [ of the exported array
    m=re.search(r'(const\s+\w+\s*=\s*\[|export\s+default\s*\[)', c)
    if m:
        entry="\n  /* QR-AUTO */ { path: '/inventory/qr', element: <QrItemView/> },"
        c=c[:m.end()]+entry+c[m.end():]
        inserted=True

if inserted and c!=orig:
    open(f,"w",encoding="utf-8").write(c); print("EDITED")
else:
    print("ANCHOR_FAIL")
PY

if ! grep -q "QR-AUTO" "$TARGET"; then
  echo "STOP: could not anchor a route. Restoring backup + manual instructions:"
  newest="$(ls -t "$TARGET".qrbak.* 2>/dev/null | head -1)"; [ -n "$newest" ] && cp "$newest" "$TARGET"
  echo "   import QrItemView from '@modules/inventory/pages/QrItemView';"
  echo "   add route: { path: '/inventory/qr', element: <QrItemView/> }  (or <Route .../>)"
  exit 2
fi

if qr_build_or_revert "$TARGET"; then
  echo "✓ QR route wired into $TARGET → /inventory/qr"
else
  echo "✗ build failed; $TARGET restored."; exit 1
fi
