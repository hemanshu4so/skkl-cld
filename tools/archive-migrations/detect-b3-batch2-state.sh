#!/usr/bin/env bash
# Phase B-3 Batch 2 detector — read-only.
# Mac bash 3.2 compatible: no mapfile/readarray, no ${var,,}/${var^^}, no associative arrays.
# Modules: rates, repairs, orders, vouchers
#
# Exit 0 if no blockers in batch-2 modules, 1 otherwise.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

# Module table — pipe-delimited entries: "slug|PascalName"
MODULES="
dashboard|Dashboard
customers|Customers
notifications|Notifications
activity-log|ActivityLog
settings|Settings
backup|Backup
user-admin|UserAdmin
rates|Rates
repairs|Repairs
orders|Orders
vouchers|Vouchers
"
# (Batch 1 modules included read-only so the detector reports unified status;
# blockers in Batch 1 modules will NOT halt this script — only batch-2 blockers do.)

BATCH2_SET=" rates repairs orders vouchers "

is_shim_b3() { [[ -f "$1" ]] && grep -q "Phase B-3 compat shim" "$1" 2>/dev/null; }
is_stub_b1() { [[ -f "$1" ]] && grep -q "TODO Phase B-" "$1" 2>/dev/null; }

discover_page_old() {
  NAME="$1"; SLUG="$2"
  for c in \
    "src/pages/${NAME}.jsx" "src/pages/${NAME}.js" "src/pages/${NAME}.tsx" "src/pages/${NAME}.ts" \
    "src/pages/${SLUG}.jsx" "src/pages/${SLUG}.js" \
    "src/pages/${SLUG}/index.jsx" "src/pages/${SLUG}/index.js" \
    "src/pages/${NAME}/index.jsx" "src/pages/${NAME}/index.js"; do
    [ -f "$c" ] && { echo "$c"; return; }
  done
  echo ""
}

discover_page_new() {
  NAME="$1"; SLUG="$2"
  for c in \
    "src/modules/${SLUG}/pages/${NAME}.jsx" "src/modules/${SLUG}/pages/${NAME}.js" \
    "src/modules/${SLUG}/pages/index.jsx"  "src/modules/${SLUG}/pages/index.js"; do
    [ -f "$c" ] && { echo "$c"; return; }
  done
  echo ""
}

# bash-3.2-safe: emit one path per line on stdout
discover_component_files() {
  SLUG="$1"; NAME="$2"
  for d in "src/components/${SLUG}" "src/components/${NAME}"; do
    if [ -d "$d" ]; then
      find "$d" -type f \( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) 2>/dev/null
    fi
  done
}

classify_file() {
  OLD="$1"; NEW="$2"
  OE=no; NE=no; OS=no; NS=no
  [ -f "$OLD" ] && OE=yes
  [ -f "$NEW" ] && NE=yes
  is_shim_b3 "$OLD" && OS=yes
  is_stub_b1 "$NEW" && NS=yes
  if [ "$OE" = "yes" ] && [ "$NE" = "yes" ]; then
    if [ "$OS" = "yes" ] && [ "$NS" = "no"  ]; then echo "DONE"; return; fi
    if [ "$OS" = "no"  ] && [ "$NS" = "yes" ]; then echo "TODO_REPLACE_STUB"; return; fi
    if [ "$OS" = "yes" ] && [ "$NS" = "yes" ]; then echo "BOTH_SHIMS"; return; fi
    echo "SPLIT_BRAIN"; return
  fi
  if [ "$OE" = "yes" ] && [ "$NE" = "no" ]; then
    if [ "$OS" = "yes" ]; then echo "OLD_IS_SHIM_NO_NEW"; return; fi
    echo "TODO_FRESH_MOVE"; return
  fi
  if [ "$OE" = "no" ] && [ "$NE" = "yes" ]; then
    if [ "$NS" = "yes" ]; then echo "STUB_NO_OLD"; return; fi
    echo "MOVED_NO_SHIM"; return
  fi
  echo "ABSENT"
}

ALL_BLOCKERS=0
ALL_TODOS=0

echo "$MODULES" | while IFS='|' read SLUG NAME; do
  [ -z "$SLUG" ] && continue

  case " $BATCH2_SET " in *" $SLUG "*) IS_B2=yes ;; *) IS_B2=no ;; esac
  TAG="(batch-1)"
  [ "$IS_B2" = "yes" ] && TAG="(BATCH-2)"

  echo ""
  echo "============ Module: $SLUG ($NAME) $TAG ============"

  PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  PAGE_NEW_ACTUAL="$(discover_page_new "$NAME" "$SLUG")"
  PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"

  if [ -n "$PAGE_OLD" ] || [ -n "$PAGE_NEW_ACTUAL" ]; then
    PAGE_NEW="${PAGE_NEW_ACTUAL:-$PAGE_NEW_CANON}"
    if [ -z "$PAGE_OLD" ] && [ -n "$PAGE_NEW_ACTUAL" ]; then
      STATE="MOVED_NO_SHIM_OR_DONE"
      # If a shim exists at any candidate OLD path → DONE
      SHIM_FOUND=no
      for c in src/pages/${NAME}.jsx src/pages/${NAME}.js src/pages/${SLUG}.jsx src/pages/${SLUG}.js; do
        if is_shim_b3 "$c"; then SHIM_FOUND=yes; PAGE_OLD="$c"; break; fi
      done
      [ "$SHIM_FOUND" = "yes" ] && STATE="DONE" || STATE="MOVED_NO_SHIM"
      printf "  page:  %-50s -> %-50s  %s\n" "${PAGE_OLD:-(no old, no shim)}" "$PAGE_NEW" "$STATE"
    else
      STATE="$(classify_file "$PAGE_OLD" "$PAGE_NEW")"
      printf "  page:  %-50s -> %-50s  %s\n" "$PAGE_OLD" "$PAGE_NEW" "$STATE"
    fi
    case "$STATE" in
      DONE|ABSENT) : ;;
      TODO_*|MOVED_NO_SHIM) [ "$IS_B2" = "yes" ] && ALL_TODOS=$((ALL_TODOS+1)) ;;
      *) [ "$IS_B2" = "yes" ] && ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
    esac
  else
    echo "  page:  (none discovered for $NAME)   ABSENT"
  fi

  # Components (bash-3.2-safe: parse one-per-line)
  COMP_LIST="$(discover_component_files "$SLUG" "$NAME")"
  if [ -z "$COMP_LIST" ]; then
    echo "  comps: (no component folder for $SLUG)"
  else
    echo "$COMP_LIST" | while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/components/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      printf "  comp:  %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
    done
    # Compute blockers/todos in a separate pass (subshell-safe)
    while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/components/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_*|MOVED_NO_SHIM) [ "$IS_B2" = "yes" ] && echo "TODO" || echo "B1_NOOP" ;;
        *) [ "$IS_B2" = "yes" ] && echo "BLOCKER" || echo "B1_NOOP" ;;
      esac
    done <<<"$COMP_LIST" > /tmp/.b3b2_states.$$
    while IFS= read line; do
      case "$line" in
        TODO)    ALL_TODOS=$((ALL_TODOS+1)) ;;
        BLOCKER) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
      esac
    done < /tmp/.b3b2_states.$$
    rm -f /tmp/.b3b2_states.$$
  fi
done

# NOTE: the while-pipe runs in a subshell so counters above won't survive — we recompute
# blockers/todos cleanly with a non-pipe loop just for the summary.
ALL_BLOCKERS=0
ALL_TODOS=0
while IFS='|' read SLUG NAME; do
  [ -z "$SLUG" ] && continue
  case " $BATCH2_SET " in *" $SLUG "*) ;; *) continue ;; esac

  PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  PAGE_NEW_ACTUAL="$(discover_page_new "$NAME" "$SLUG")"
  PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"

  if [ -n "$PAGE_OLD" ] || [ -n "$PAGE_NEW_ACTUAL" ]; then
    PAGE_NEW="${PAGE_NEW_ACTUAL:-$PAGE_NEW_CANON}"
    if [ -z "$PAGE_OLD" ] && [ -n "$PAGE_NEW_ACTUAL" ]; then
      STATE=MOVED_NO_SHIM
      for c in src/pages/${NAME}.jsx src/pages/${NAME}.js src/pages/${SLUG}.jsx src/pages/${SLUG}.js; do
        if is_shim_b3 "$c"; then STATE=DONE; break; fi
      done
    else
      STATE="$(classify_file "$PAGE_OLD" "$PAGE_NEW")"
    fi
    case "$STATE" in
      DONE|ABSENT) : ;;
      TODO_*|MOVED_NO_SHIM) ALL_TODOS=$((ALL_TODOS+1)) ;;
      *) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
    esac
  fi

  COMP_LIST="$(discover_component_files "$SLUG" "$NAME")"
  if [ -n "$COMP_LIST" ]; then
    while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/components/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_*|MOVED_NO_SHIM) ALL_TODOS=$((ALL_TODOS+1)) ;;
        *) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
      esac
    done <<<"$COMP_LIST"
  fi
done <<EOF
$MODULES
EOF

echo ""
echo "================ Batch-2 Summary ================"
echo "blockers=$ALL_BLOCKERS  todos=$ALL_TODOS"
if [ $ALL_BLOCKERS -gt 0 ]; then
  echo "Resolve Batch-2 blockers (SPLIT_BRAIN, BOTH_SHIMS, STUB_NO_OLD, OLD_IS_SHIM_NO_NEW) manually before running the migrator."
  exit 1
fi
echo "No batch-2 blockers. Run migrate-b3-batch2.sh to process the $ALL_TODOS todo(s)."
exit 0
