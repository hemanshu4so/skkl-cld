#!/usr/bin/env bash
# Phase B-3 Batch 1 detector — read-only.
# For each batch-1 module, discovers its files in the working tree and classifies
# each one's migration state into:
#   DONE / TODO_FRESH_MOVE / TODO_REPLACE_STUB / MOVED_NO_SHIM
#   SPLIT_BRAIN / BOTH_SHIMS / STUB_NO_OLD / OLD_IS_SHIM_NO_NEW / ABSENT
#
# Exit 0 if no blockers in the batch-1 modules, 1 otherwise.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

# Module table: lowercase-slug | PascalCase page name
MODULES=(
  "dashboard|Dashboard"
  "customers|Customers"
  "notifications|Notifications"
  "activity-log|ActivityLog"
  "settings|Settings"
  "backup|Backup"
  "user-admin|UserAdmin"
)

is_shim_b3() { [[ -f "$1" ]] && grep -q "Phase B-3 compat shim" "$1" 2>/dev/null; }
is_stub_b1() { [[ -f "$1" ]] && grep -q "TODO Phase B-" "$1" 2>/dev/null; }

# Discover the old page file for a module
discover_page_old() {
  local NAME="$1" SLUG="$2"
  local cands=(
    "src/pages/${NAME}.jsx" "src/pages/${NAME}.js" "src/pages/${NAME}.tsx" "src/pages/${NAME}.ts"
    "src/pages/${SLUG}.jsx" "src/pages/${SLUG}.js"
    "src/pages/${SLUG}/index.jsx" "src/pages/${SLUG}/index.js"
    "src/pages/${NAME}/index.jsx" "src/pages/${NAME}/index.js"
  )
  for c in "${cands[@]}"; do
    [[ -f "$c" ]] && { echo "$c"; return; }
  done
  echo ""
}

# Discover the new page file for a module
discover_page_new() {
  local NAME="$1" SLUG="$2"
  local cands=(
    "src/modules/${SLUG}/pages/${NAME}.jsx" "src/modules/${SLUG}/pages/${NAME}.js"
    "src/modules/${SLUG}/pages/index.jsx" "src/modules/${SLUG}/pages/index.js"
  )
  for c in "${cands[@]}"; do
    [[ -f "$c" ]] && { echo "$c"; return; }
  done
  echo ""
}

# Discover all component files for a module (recursive, returns list space-separated by NUL)
discover_component_files() {
  local SLUG="$1" NAME="$2"
  local dirs=(
    "src/components/${SLUG}"
    "src/components/${NAME}"
  )
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      find "$d" -type f \( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) 2>/dev/null
    fi
  done
}

classify_file() {
  local OLD="$1" NEW="$2"
  local OE=no NE=no OS=no NS=no
  [[ -f "$OLD" ]] && OE=yes
  [[ -f "$NEW" ]] && NE=yes
  is_shim_b3 "$OLD" && OS=yes
  is_stub_b1 "$NEW" && NS=yes

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

ALL_BLOCKERS=0
ALL_TODOS=0

for entry in "${MODULES[@]}"; do
  SLUG="${entry%%|*}"; NAME="${entry#*|}"
  echo ""
  echo "============ Module: $SLUG ($NAME) ============"

  PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  if [[ -z "$PAGE_OLD" ]]; then
    PAGE_NEW="$(discover_page_new "$NAME" "$SLUG")"
    if [[ -n "$PAGE_NEW" ]]; then
      echo "  page:  $PAGE_NEW   MOVED_NO_SHIM (consider re-running B-3 once consumers point to new)"
      ALL_TODOS=$((ALL_TODOS+1))
    else
      echo "  page:  (none discovered for $NAME)   ABSENT"
    fi
  else
    # Pick canonical NEW path with .jsx extension
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"
    PAGE_NEW_ACTUAL="$(discover_page_new "$NAME" "$SLUG")"
    PAGE_NEW="${PAGE_NEW_ACTUAL:-$PAGE_NEW_CANON}"
    STATE="$(classify_file "$PAGE_OLD" "$PAGE_NEW")"
    printf "  page:  %-50s -> %-50s  %s\n" "$PAGE_OLD" "$PAGE_NEW" "$STATE"
    case "$STATE" in
      DONE|ABSENT) ;;
      TODO_*|MOVED_NO_SHIM) ALL_TODOS=$((ALL_TODOS+1)) ;;
      *) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
    esac
  fi

  # Components
  COMP_FILES=""
  COMP_FILES="$(discover_component_files "$SLUG" "$NAME" || true)"
  if [[ $(echo "$COMP_FILES" | wc -w) -eq 0 ]]; then
    echo "  comps: (no component folder for $SLUG)"
  else
    for f in $COMP_FILES; do
      # Map old to new: replace src/components/<X>/ with src/modules/<SLUG>/components/
      rel="${f#src/components/}"
      rel="${rel#${SLUG}/}"; rel="${rel#${NAME}/}"
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      printf "  comp:  %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
      case "$STATE" in
        DONE|ABSENT) ;;
        TODO_*|MOVED_NO_SHIM) ALL_TODOS=$((ALL_TODOS+1)) ;;
        *) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
      esac
    done
  fi
done

echo ""
echo "================ Summary ================"
echo "blockers=$ALL_BLOCKERS  todos=$ALL_TODOS"
if [[ $ALL_BLOCKERS -gt 0 ]]; then
  echo ""
  echo "Resolve blockers (SPLIT_BRAIN, BOTH_SHIMS, STUB_NO_OLD, OLD_IS_SHIM_NO_NEW) manually before running the migrator."
  exit 1
fi
echo "No blockers. Run migrate-b3-batch1.sh to process the $ALL_TODOS todo(s)."
