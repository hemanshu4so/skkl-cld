#!/usr/bin/env bash
# Phase B-2 continuation migrator.
# - Detect-first: classify each pair, refuse to act on any blocker.
# - For each TODO pair: ensure dest dir exists; replace stub if present; git mv; write shim;
#   build (unless --skip-build); commit.
# - For each MOVED_NO_SHIM pair with consumers: write shim at OLD; build; commit.
#
# Flags:
#   --dry-run        : print plan, change nothing
#   --skip-build     : skip 'npm run build' between commits
#   --allow-dirty    : proceed despite uncommitted changes
#   --label REGEX    : only process pairs whose label matches REGEX
#
# Exit 0 on success, non-zero on any failure. Never commits a broken build.

set -uo pipefail

DRY_RUN=0
SKIP_BUILD=0
ALLOW_DIRTY=0
LABEL_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --label)       LABEL_FILTER="$2"; shift ;;
    -h|--help)
      sed -n '1,15p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo."; exit 2; }

if [[ "$ALLOW_DIRTY" -eq 0 && -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree not clean. Commit/stash, or pass --allow-dirty." >&2
  git status --short
  exit 1
fi

PAIRS=(
  "src/lib/safe.js|src/shared/safe/index.js|shared_safe|named"
  "src/components/SafePage.jsx|src/shared/safe/SafePage.jsx|shared_safe_SafePage|default_named"
  "src/hooks/useSafeSnapshot.js|src/shared/safe/useSafeSnapshot.js|shared_safe_useSafeSnapshot|default_named"
  "src/utils/pin.js|src/shared/pin/index.js|shared_pin|named"
  "src/firebase.js|src/firebase/client.js|firebase_client|named"
  "src/context/AuthContext.jsx|src/app/providers/AuthProvider.jsx|app_providers_AuthProvider|named"
  "src/components/Sidebar.jsx|src/app/layout/Sidebar.jsx|app_layout_Sidebar|default_named"
  "src/components/Topbar.jsx|src/app/layout/Topbar.jsx|app_layout_Topbar|default_named"
  "src/App.js|src/app/App.jsx|app_App|default"
)

is_shim() { [[ -f "$1" ]] && grep -q "Phase B-2 compat shim" "$1" 2>/dev/null; }
is_stub() { [[ -f "$1" ]] && grep -q "TODO Phase B-2" "$1" 2>/dev/null; }

# Translate src/<...> path into the alias path used inside the shim body
alias_for() {
  case "$1" in
    src/shared/*)   echo "@shared/${1#src/shared/}" ;;
    src/app/*)      echo "@app/${1#src/app/}"       ;;
    src/firebase/*) echo "@firebase/${1#src/firebase/}" ;;
    src/config/*)   echo "@config/${1#src/config/}" ;;
    src/modules/*)  echo "@modules/${1#src/modules/}" ;;
    *) echo "$1" ;;
  esac
}

shim_body() {
  local NEW="$1" KIND="$2"
  # Strip extension for re-export target
  local TARGET; TARGET="$(alias_for "$NEW")"
  TARGET="${TARGET%.jsx}"; TARGET="${TARGET%.js}"; TARGET="${TARGET%/index}"
  case "$KIND" in
    named)
      printf "// Phase B-2 compat shim. Real file lives at %s.\nexport * from '%s';\n" "$TARGET" "$TARGET" ;;
    default)
      printf "// Phase B-2 compat shim. Real file lives at %s.\nexport { default } from '%s';\n" "$TARGET" "$TARGET" ;;
    default_named)
      printf "// Phase B-2 compat shim. Real file lives at %s.\nexport { default } from '%s';\nexport * from '%s';\n" "$TARGET" "$TARGET" "$TARGET" ;;
  esac
}

classify() {
  local OLD="$1" NEW="$2"
  local OE="no" NE="no" OS="no" NS="no"
  [[ -f "$OLD" ]] && OE="yes"
  [[ -f "$NEW" ]] && NE="yes"
  is_shim "$OLD" && OS="yes"
  is_stub "$NEW" && NS="yes"

  if [[ "$OE" == "yes" && "$NE" == "yes" ]]; then
    [[ "$OS" == "yes" && "$NS" == "no"  ]] && { echo "DONE"; return; }
    [[ "$OS" == "no"  && "$NS" == "yes" ]] && { echo "TODO_REPLACE_STUB"; return; }
    [[ "$OS" == "yes" && "$NS" == "yes" ]] && { echo "BOTH_SHIMS"; return; }
    echo "SPLIT_BRAIN"; return
  fi
  if [[ "$OE" == "yes" && "$NE" == "no"  ]]; then
    [[ "$OS" == "yes" ]] && { echo "OLD_IS_SHIM_NO_NEW"; return; }
    echo "TODO_FRESH_MOVE"; return
  fi
  if [[ "$OE" == "no"  && "$NE" == "yes" ]]; then
    [[ "$NS" == "yes" ]] && { echo "STUB_NO_OLD"; return; }
    echo "MOVED_NO_SHIM"; return
  fi
  echo "ABSENT"
}

consumers_count() {
  local OLD="$1"; local stem="${OLD%.*}"
  git grep -lE "from ['\"][^'\"]*${stem##*/}['\"]" -- src 2>/dev/null | grep -v "^$OLD$" | wc -l | tr -d ' '
}

run_build() {
  if [[ "$SKIP_BUILD" -eq 1 ]]; then
    echo "  (--skip-build set, not running npm run build)"
    return 0
  fi
  echo "  Running npm run build ..."
  npm run build --silent
}

# ---------------- pass 1: classify everything ----------------
echo ""
echo "== Phase B-2 detection =="
printf "%-3s %-44s %-44s %s\n" "#" "OLD" "NEW" "STATE"
BLOCKERS=()
PLAN=()
i=0
for entry in "${PAIRS[@]}"; do
  i=$((i+1))
  OLD="${entry%%|*}"; rest="${entry#*|}"
  NEW="${rest%%|*}"; rest2="${rest#*|}"
  LABEL="${rest2%%|*}"; KIND="${rest2#*|}"
  [[ -n "$LABEL_FILTER" && ! "$LABEL" =~ $LABEL_FILTER ]] && { continue; }
  STATE="$(classify "$OLD" "$NEW")"
  printf "%-3s %-44s %-44s %s\n" "$i" "$OLD" "$NEW" "$STATE"
  case "$STATE" in
    DONE|ABSENT) ;;
    TODO_FRESH_MOVE|TODO_REPLACE_STUB) PLAN+=("MOVE|$OLD|$NEW|$LABEL|$KIND|$STATE") ;;
    MOVED_NO_SHIM)
      if [[ "$(consumers_count "$OLD")" -gt 0 ]]; then
        PLAN+=("SHIM|$OLD|$NEW|$LABEL|$KIND|$STATE")
      fi
      ;;
    SPLIT_BRAIN|BOTH_SHIMS|STUB_NO_OLD|OLD_IS_SHIM_NO_NEW)
      BLOCKERS+=("$i $OLD $NEW $STATE") ;;
  esac
done

if [[ ${#BLOCKERS[@]} -gt 0 ]]; then
  echo ""
  echo "BLOCKERS found. Resolve manually, then re-run:"
  printf '  %s\n' "${BLOCKERS[@]}"
  exit 1
fi

if [[ ${#PLAN[@]} -eq 0 ]]; then
  echo ""
  echo "Nothing to do. All pairs in DONE / ABSENT state."
  exit 0
fi

echo ""
echo "== Plan =="
for step in "${PLAN[@]}"; do
  IFS='|' read -r OP OLD NEW LABEL KIND STATE <<<"$step"
  echo "  [$OP] $OLD -> $NEW   ($LABEL, $KIND, from=$STATE)"
done

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  echo "--dry-run set. Exiting without changes."
  exit 0
fi

# ---------------- pass 2: execute ----------------
echo ""
echo "== Executing =="
for step in "${PLAN[@]}"; do
  IFS='|' read -r OP OLD NEW LABEL KIND STATE <<<"$step"
  echo ""
  echo "---- $OP: $LABEL ($OLD -> $NEW) ----"

  case "$OP" in
    MOVE)
      mkdir -p "$(dirname "$NEW")"
      if [[ -f "$NEW" ]]; then
        if is_stub "$NEW"; then
          git rm -f "$NEW" >/dev/null
          echo "  removed Phase B-1 stub at $NEW"
        else
          echo "ERROR: $NEW exists but is not a stub. Aborting." >&2
          exit 1
        fi
      fi
      git mv "$OLD" "$NEW"
      shim_body "$NEW" "$KIND" > "$OLD"
      git add "$OLD" "$NEW"
      run_build || { echo "BUILD FAILED. Reverting step and stopping." >&2
                     git checkout -- "$OLD" "$NEW" 2>/dev/null
                     git restore --staged "$OLD" "$NEW" 2>/dev/null
                     exit 1; }
      git commit -m "refactor(phase-b2): move ${LABEL//_//} with compat shim" >/dev/null
      echo "  ✓ committed: refactor(phase-b2): move ${LABEL//_//} with compat shim"
      ;;
    SHIM)
      # OLD missing; create shim file at OLD pointing to NEW
      mkdir -p "$(dirname "$OLD")"
      shim_body "$NEW" "$KIND" > "$OLD"
      git add "$OLD"
      run_build || { echo "BUILD FAILED. Reverting shim and stopping." >&2
                     git restore --staged "$OLD" 2>/dev/null
                     rm -f "$OLD"
                     exit 1; }
      git commit -m "refactor(phase-b2): add compat shim for ${LABEL//_//}" >/dev/null
      echo "  ✓ committed: refactor(phase-b2): add compat shim for ${LABEL//_//}"
      ;;
  esac
done

echo ""
echo "== All requested migrations complete =="
git log --oneline -n ${#PLAN[@]}
