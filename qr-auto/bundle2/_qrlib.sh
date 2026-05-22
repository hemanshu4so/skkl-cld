#!/usr/bin/env bash
# _qrlib.sh — shared safety helpers for QR auto-integration. Source this.
# Mac bash 3.2 compatible.
QR_TS() { date +%Y%m%d%H%M%S; }

qr_repo_root() { git rev-parse --show-toplevel 2>/dev/null; }

# Backup a file before editing (timestamped). Idempotent-friendly.
qr_backup() {
  f="$1"
  [ -f "$f" ] || return 0
  bak="$f.qrbak.$(QR_TS)"
  cp "$f" "$bak"
  echo "  backup: $bak"
}

# Does the file already contain our marker?
qr_has_marker() { grep -q "QR-AUTO" "$1" 2>/dev/null; }

# Run build; on failure restore the given files from their newest .qrbak and return 1.
qr_build_or_revert() {
  if [ "${QR_SKIP_BUILD:-0}" = "1" ]; then echo "  (QR_SKIP_BUILD=1, not building)"; return 0; fi
  echo "  npm run build ..."
  if npm run build --silent; then return 0; fi
  echo "  ✗ build failed — restoring backups"
  for f in "$@"; do
    newest="$(ls -t "$f".qrbak.* 2>/dev/null | head -1)"
    [ -n "$newest" ] && { cp "$newest" "$f"; echo "    restored $f"; }
  done
  return 1
}

qr_require_clean() {
  [ "${QR_ALLOW_DIRTY:-0}" = "1" ] && return 0
  if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree not clean. Commit/stash or set QR_ALLOW_DIRTY=1." >&2
    git status --short; return 1
  fi
}
