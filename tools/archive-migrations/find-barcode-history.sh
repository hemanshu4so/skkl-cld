#!/usr/bin/env bash
# Barcode file recovery — READ-ONLY history finder.
# For each of the 3 missing files it:
#   - lists every commit that touched the file (across its old AND new paths)
#   - inspects each commit's blob to skip "disabled/stub" versions (TagCanvas)
#   - recommends the newest GOOD commit
#   - prints the exact 'git show <hash>:<path> > <target>' restore command
#
# Executes ONLY: git log, git cat-file, git show (read). No writes. No restructuring.
# Mac bash 3.2 compatible.

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

# file_key | target(new path) | candidate historical paths (space-separated)
FILES="
TagCanvas|src/modules/barcode/components/TagCanvas.jsx|src/modules/barcode/components/TagCanvas.jsx src/components/barcode/TagCanvas.jsx
code128|src/modules/barcode/lib/code128.js|src/modules/barcode/lib/code128.js src/lib/code128.js
qr|src/modules/barcode/lib/qr.js|src/modules/barcode/lib/qr.js src/lib/qr.js
"

# Does a blob look like a disabled stub (only for TagCanvas)?
is_stub_blob() {
  # reads blob on stdin
  awk '
    /Phase B-[0-9]+ compat shim/ {shim=1}
    /DISABLED|TEMPORAR|disabled stub|TODO.*restore/ {marker=1}
    {body=body $0 "\n"; lines++}
    END {
      # crude: a real TagCanvas has > 15 lines and renders SVG; a stub returns null fast
      if (shim) {print "SHIM"; exit}
      if (marker && lines < 12) {print "STUB"; exit}
      if (body ~ /return null/ && lines < 8) {print "STUB"; exit}
      print "REAL"
    }'
}

restore_cmd() {
  echo "  git show $1:$2 > $3"
}

echo "Barcode file recovery — git history finder (READ-ONLY)"
echo "Repo: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo ""

printf '%s\n' "$FILES" | while IFS='|' read KEY TARGET PATHS; do
  [ -z "$KEY" ] && continue
  echo "================================================================"
  echo "  $KEY  →  restore target: $TARGET"
  echo "================================================================"

  # 1. Full history across all candidate paths (newest first)
  echo "  History (newest first):"
  # shellcheck disable=SC2086
  git log --all --oneline -- $PATHS | sed 's/^/    /' | head -30
  echo ""

  # 2. Walk commits newest→oldest, find newest GOOD blob
  FOUND=""
  # shellcheck disable=SC2086
  HASHES="$(git log --all --pretty=%H -- $PATHS)"
  for H in $HASHES; do
    for P in $PATHS; do
      if git cat-file -e "$H:$P" 2>/dev/null; then
        if [ "$KEY" = "TagCanvas" ]; then
          STATUS="$(git show "$H:$P" 2>/dev/null | is_stub_blob)"
        else
          # code128 / qr were never stubbed — any real (non-shim) blob is good
          if git show "$H:$P" 2>/dev/null | grep -q "compat shim"; then STATUS="SHIM"; else STATUS="REAL"; fi
        fi
        SHORT="$(git rev-parse --short "$H")"
        if [ "$STATUS" = "REAL" ] && [ -z "$FOUND" ]; then
          FOUND="$H|$P"
          echo "  ✓ RECOMMENDED: commit $SHORT  path $P  (content looks real)"
        else
          echo "    candidate: $SHORT  $P  [$STATUS]"
        fi
        break  # only the path that exists in this commit
      fi
    done
  done

  echo ""
  if [ -n "$FOUND" ]; then
    H="${FOUND%%|*}"; P="${FOUND#*|}"
    echo "  RESTORE COMMAND (copy/paste):"
    echo "    mkdir -p \"$(dirname "$TARGET")\""
    restore_cmd "$(git rev-parse --short "$H")" "$P" "$TARGET"
    echo ""
    echo "  VERIFY BEFORE BUILD:"
    echo "    head -20 $TARGET        # confirm real content, not a stub/shim"
  else
    echo "  ⚠ No real (non-stub, non-shim) version found in history for $KEY."
    echo "    Inspect manually:"
    echo "      git log --all --oneline -- $PATHS"
    echo "      git show <hash>:<path> | head -40"
  fi
  echo ""
done

echo "================================================================"
echo "  After restoring all 3 files:"
echo "================================================================"
cat <<'EOF'
    git add src/modules/barcode/components/TagCanvas.jsx \
            src/modules/barcode/lib/code128.js \
            src/modules/barcode/lib/qr.js
    npm run build          # must be green
    npm start              # boot, then verify in the browser:
                           #   - /barcode-designer opens
                           #   - side preview renders
                           #   - Inventory print preview works
    git commit -m "fix(barcode): recover TagCanvas + code128 + qr from git history"
EOF
