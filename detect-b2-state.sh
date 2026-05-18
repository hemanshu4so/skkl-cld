#!/usr/bin/env bash
# Phase B-2 detector — read-only.
# Classifies each of the 9 B-2 file pairs and prints a state table.
# Exit 0 if no blockers, 1 otherwise.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo."; exit 2; }

PAIRS=(
  "src/lib/safe.js|src/shared/safe/index.js|shared/safe"
  "src/components/SafePage.jsx|src/shared/safe/SafePage.jsx|shared/safe/SafePage"
  "src/hooks/useSafeSnapshot.js|src/shared/safe/useSafeSnapshot.js|shared/safe/useSafeSnapshot"
  "src/utils/pin.js|src/shared/pin/index.js|shared/pin"
  "src/firebase.js|src/firebase/client.js|firebase/client"
  "src/context/AuthContext.jsx|src/app/providers/AuthProvider.jsx|app/providers/AuthProvider"
  "src/components/Sidebar.jsx|src/app/layout/Sidebar.jsx|app/layout/Sidebar"
  "src/components/Topbar.jsx|src/app/layout/Topbar.jsx|app/layout/Topbar"
  "src/App.js|src/app/App.jsx|app/App"
)

is_shim() { [[ -f "$1" ]] && grep -q "Phase B-2 compat shim" "$1" 2>/dev/null; }
is_stub() { [[ -f "$1" ]] && grep -q "TODO Phase B-2" "$1" 2>/dev/null; }

classify() {
  local OLD="$1" NEW="$2"
  local OLD_EXISTS="no" NEW_EXISTS="no" OLD_SHIM="no" NEW_STUB="no"
  [[ -f "$OLD" ]] && OLD_EXISTS="yes"
  [[ -f "$NEW" ]] && NEW_EXISTS="yes"
  is_shim "$OLD" && OLD_SHIM="yes"
  is_stub "$NEW" && NEW_STUB="yes"

  if [[ "$OLD_EXISTS" == "yes" && "$NEW_EXISTS" == "yes" ]]; then
    if [[ "$OLD_SHIM" == "yes" && "$NEW_STUB" == "no"  ]]; then echo "DONE"; return; fi
    if [[ "$OLD_SHIM" == "no"  && "$NEW_STUB" == "yes" ]]; then echo "TODO_REPLACE_STUB"; return; fi
    if [[ "$OLD_SHIM" == "yes" && "$NEW_STUB" == "yes" ]]; then echo "BOTH_SHIMS"; return; fi
    echo "SPLIT_BRAIN"; return
  fi
  if [[ "$OLD_EXISTS" == "yes" && "$NEW_EXISTS" == "no"  ]]; then
    if [[ "$OLD_SHIM" == "yes" ]]; then echo "OLD_IS_SHIM_NO_NEW"; return; fi
    echo "TODO_FRESH_MOVE"; return
  fi
  if [[ "$OLD_EXISTS" == "no"  && "$NEW_EXISTS" == "yes" ]]; then
    if [[ "$NEW_STUB" == "yes" ]]; then echo "STUB_NO_OLD"; return; fi
    echo "MOVED_NO_SHIM"; return
  fi
  echo "ABSENT"
}

consumers_for() {
  # Find files that import the OLD path's basename (best-effort)
  local OLD="$1"
  local stem="${OLD%.*}"
  # Anything that imports either the bare module or the file
  git grep -lE "from ['\"][^'\"]*${stem##*/}['\"]" -- src 2>/dev/null \
    | grep -v "^$OLD$" || true
}

printf "%-44s %-44s %-20s %s\n" "OLD" "NEW" "STATE" "CONSUMERS_OF_OLD"
printf "%-44s %-44s %-20s %s\n" "----" "----" "-----" "----------------"

BLOCKERS=0
TODOS=0
for entry in "${PAIRS[@]}"; do
  OLD="${entry%%|*}"
  rest="${entry#*|}"
  NEW="${rest%%|*}"
  state="$(classify "$OLD" "$NEW")"
  cons_count=$(consumers_for "$OLD" | wc -l | tr -d ' ')
  printf "%-44s %-44s %-20s %s\n" "$OLD" "$NEW" "$state" "$cons_count"

  case "$state" in
    SPLIT_BRAIN|BOTH_SHIMS|STUB_NO_OLD|OLD_IS_SHIM_NO_NEW) BLOCKERS=$((BLOCKERS+1)) ;;
    TODO_FRESH_MOVE|TODO_REPLACE_STUB)                      TODOS=$((TODOS+1)) ;;
    MOVED_NO_SHIM)
      if [[ "$cons_count" -gt 0 ]]; then TODOS=$((TODOS+1)); fi
      ;;
  esac
done

echo ""
echo "Summary: blockers=$BLOCKERS, todos=$TODOS"
if [[ $BLOCKERS -gt 0 ]]; then
  echo ""
  echo "Blockers above need human resolution before migrate-b2-continue.sh can run."
  echo "  SPLIT_BRAIN          → both old and new have real content. Diff and merge manually, keep ONE."
  echo "  BOTH_SHIMS           → both files are shims/stubs. Restore one from 'git log -- <path>'."
  echo "  STUB_NO_OLD          → new is a stub and old is gone. Restore old from 'git log --diff-filter=D'."
  echo "  OLD_IS_SHIM_NO_NEW   → old is already a shim but new is missing. Create new from 'git show <hash>:<old>'."
  exit 1
fi
echo "No blockers. Run migrate-b2-continue.sh to process the $TODOS todo(s)."
