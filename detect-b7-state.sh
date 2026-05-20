#!/usr/bin/env bash
# Phase B-7 detector — read-only.
# Mac bash 3.2 compatible: no mapfile/readarray, no ${var,,}/${var^^}, no associative arrays.
# Module: inventory (high blast radius — consumed by Billing/Repairs/Orders/Purchases/Barcode)
#
# Exit 0 if no blockers in B-7 modules, 1 otherwise.

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
vendors|Vendors
karigar|Karigar
bullion|Bullion
purchases|Purchases
reports|Reports
accounting|Accounting
schemes|Schemes
barcode|Barcode
superadmin|Superadmin
printing|Printing
inventory|Inventory
"
# (Earlier-batch modules included read-only so the detector reports unified status;
# blockers in earlier batches will NOT halt this script — only B-7 blockers do.)

B7_SET=" inventory "

is_shim_b3() { [[ -f "$1" ]] && grep -qE "Phase B-[0-9]+ compat shim" "$1" 2>/dev/null; }
is_stub_b1() { [[ -f "$1" ]] && grep -q "TODO Phase B-" "$1" 2>/dev/null; }

discover_page_old() {
  NAME="$1"; SLUG="$2"
  # Try standard candidates first, plus per-module conventional names
  EXTRAS=""
  case "$SLUG" in
    barcode)     EXTRAS="src/pages/BarcodeDesigner.jsx src/pages/BarcodeDesigner.js" ;;
    superadmin)  EXTRAS="src/pages/SuperAdmin.jsx src/pages/SuperAdmin.js" ;;
    printing)    EXTRAS="src/pages/PrintDesigner.jsx src/pages/PrintDesigner.js src/pages/PrintTemplateDesigner.jsx" ;;
    inventory)   EXTRAS="src/pages/InventoryV2.jsx src/pages/InventoryList.jsx" ;;
  esac
  for c in \
    "src/pages/${NAME}.jsx" "src/pages/${NAME}.js" "src/pages/${NAME}.tsx" "src/pages/${NAME}.ts" \
    "src/pages/${SLUG}.jsx" "src/pages/${SLUG}.js" \
    "src/pages/${SLUG}/index.jsx" "src/pages/${SLUG}/index.js" \
    "src/pages/${NAME}/index.jsx" "src/pages/${NAME}/index.js" \
    $EXTRAS; do
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

# B-5: sub-pages folder enumerator (multi-page modules like superadmin)
discover_subpages_folder_files() {
  SLUG="$1"; NAME="$2"; SKIP="$3"
  for d in "src/pages/${SLUG}" "src/pages/${NAME}"; do
    if [ -d "$d" ]; then
      find "$d" -type f \( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) 2>/dev/null \
        | while read f; do
            [ "$f" = "$SKIP" ] && continue
            echo "$f"
          done
    fi
  done
}

# B-5: per-module extras
extra_files_for_module() {
  SLUG="$1"
  case "$SLUG" in
    barcode)
      echo "src/lib/code128.js|src/modules/barcode/lib/code128.js"
      echo "src/lib/qr.js|src/modules/barcode/lib/qr.js"
      echo "src/lib/barcodeTemplate.js|src/modules/barcode/lib/barcodeTemplate.js"
      ;;
    printing)
      echo "src/lib/printTemplate.js|src/modules/printing/lib/printTemplate.js"
      echo "src/components/PrintRenderer.jsx|src/modules/printing/components/PrintRenderer.jsx"
      ;;
    inventory)
      # Discovered at run time — include only files that actually exist
      [ -f "src/lib/inventoryUtils.js"    ] && echo "src/lib/inventoryUtils.js|src/modules/inventory/lib/inventoryUtils.js"
      [ -f "src/lib/huid.js"              ] && echo "src/lib/huid.js|src/modules/inventory/lib/huid.js"
      [ -f "src/lib/stockMath.js"         ] && echo "src/lib/stockMath.js|src/modules/inventory/lib/stockMath.js"
      [ -f "src/components/InventoryQR.jsx" ] && echo "src/components/InventoryQR.jsx|src/modules/inventory/components/InventoryQR.jsx"
      [ -f "src/components/StockBadge.jsx"  ] && echo "src/components/StockBadge.jsx|src/modules/inventory/components/StockBadge.jsx"
      ;;
  esac
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

  case " $B7_SET " in *" $SLUG "*) IS_B7=yes ;; *) IS_B7=no ;; esac
  TAG="(batch-1)"
  [ "$IS_B7" = "yes" ] && TAG="(B-7)"

  echo ""
  echo "============ Module: $SLUG ($NAME) $TAG ============"

  PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  PAGE_NEW_ACTUAL="$(discover_page_new "$NAME" "$SLUG")"
  if [ -n "$PAGE_OLD" ]; then
    PAGE_BASENAME="$(basename "$PAGE_OLD")"
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${PAGE_BASENAME}"
  else
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"
  fi

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
      TODO_*|MOVED_NO_SHIM) [ "$IS_B7" = "yes" ] && ALL_TODOS=$((ALL_TODOS+1)) ;;
      *) [ "$IS_B7" = "yes" ] && ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
    esac
  else
    echo "  page:  (none discovered for $NAME)   ABSENT"
  fi

  # Components (bash-3.2-safe: parse one-per-line)
  COMP_LIST="$(discover_component_files "$SLUG" "$NAME")"
  if [ -z "$COMP_LIST" ]; then
    echo "  comps: (no component folder for $SLUG)"

    # B-5 print: sub-pages folder (even when no components)
    SUBPAGES_LIST="$(discover_subpages_folder_files "$SLUG" "$NAME" "$PAGE_OLD")"
    if [ -n "$SUBPAGES_LIST" ]; then
      echo "$SUBPAGES_LIST" | while IFS= read f; do
        [ -z "$f" ] && continue
        rel="${f#src/pages/}"
        case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
        NEW="src/modules/${SLUG}/pages/${rel}"
        STATE="$(classify_file "$f" "$NEW")"
        printf "  page+: %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
      done
    fi

    # B-5 print: extras
    EXTRAS_LIST="$(extra_files_for_module "$SLUG")"
    if [ -n "$EXTRAS_LIST" ]; then
      echo "$EXTRAS_LIST" | while IFS='|' read EOLD ENEW; do
        [ -z "$EOLD" ] && continue
        STATE="$(classify_file "$EOLD" "$ENEW")"
        printf "  extra: %-50s -> %-50s  %s\n" "$EOLD" "$ENEW" "$STATE"
      done
    fi
  else
    echo "$COMP_LIST" | while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/components/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      printf "  comp:  %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
    done

    # B-5 print: sub-pages folder
    SUBPAGES_LIST="$(discover_subpages_folder_files "$SLUG" "$NAME" "$PAGE_OLD")"
    if [ -n "$SUBPAGES_LIST" ]; then
      echo "$SUBPAGES_LIST" | while IFS= read f; do
        [ -z "$f" ] && continue
        rel="${f#src/pages/}"
        case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
        NEW="src/modules/${SLUG}/pages/${rel}"
        STATE="$(classify_file "$f" "$NEW")"
        printf "  page+: %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
      done
    fi

    # B-5 print: extras
    EXTRAS_LIST="$(extra_files_for_module "$SLUG")"
    if [ -n "$EXTRAS_LIST" ]; then
      echo "$EXTRAS_LIST" | while IFS='|' read EOLD ENEW; do
        [ -z "$EOLD" ] && continue
        STATE="$(classify_file "$EOLD" "$ENEW")"
        printf "  extra: %-50s -> %-50s  %s\n" "$EOLD" "$ENEW" "$STATE"
      done
    fi

    # Compute blockers/todos in a separate pass (subshell-safe)
    while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/components/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_*|MOVED_NO_SHIM) [ "$IS_B7" = "yes" ] && echo "TODO" || echo "B1_NOOP" ;;
        *) [ "$IS_B7" = "yes" ] && echo "BLOCKER" || echo "B1_NOOP" ;;
      esac
    done <<<"$COMP_LIST" > /tmp/.b7_states.$$
    while IFS= read line; do
      case "$line" in
        TODO)    ALL_TODOS=$((ALL_TODOS+1)) ;;
        BLOCKER) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
      esac
    done < /tmp/.b7_states.$$
    rm -f /tmp/.b7_states.$$
  fi
done

# NOTE: the while-pipe runs in a subshell so counters above won't survive — we recompute
# blockers/todos cleanly with a non-pipe loop just for the summary.
ALL_BLOCKERS=0
ALL_TODOS=0
while IFS='|' read SLUG NAME; do
  [ -z "$SLUG" ] && continue
  case " $B7_SET " in *" $SLUG "*) ;; *) continue ;; esac

  PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  PAGE_NEW_ACTUAL="$(discover_page_new "$NAME" "$SLUG")"
  if [ -n "$PAGE_OLD" ]; then
    PAGE_BASENAME="$(basename "$PAGE_OLD")"
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${PAGE_BASENAME}"
  else
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"
  fi

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

  # B-5 count: sub-pages folder
  SUBPAGES_LIST="$(discover_subpages_folder_files "$SLUG" "$NAME" "$PAGE_OLD")"
  if [ -n "$SUBPAGES_LIST" ]; then
    while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/pages/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/pages/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_*|MOVED_NO_SHIM) ALL_TODOS=$((ALL_TODOS+1)) ;;
        *) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
      esac
    done <<<"$SUBPAGES_LIST"
  fi

  # B-5 count: extras
  EXTRAS_LIST="$(extra_files_for_module "$SLUG")"
  if [ -n "$EXTRAS_LIST" ]; then
    while IFS='|' read EOLD ENEW; do
      [ -z "$EOLD" ] && continue
      STATE="$(classify_file "$EOLD" "$ENEW")"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_*|MOVED_NO_SHIM) ALL_TODOS=$((ALL_TODOS+1)) ;;
        *) ALL_BLOCKERS=$((ALL_BLOCKERS+1)) ;;
      esac
    done <<<"$EXTRAS_LIST"
  fi
done <<EOF
$MODULES
EOF

echo ""
echo "================ B-7 Summary ================"
echo "blockers=$ALL_BLOCKERS  todos=$ALL_TODOS"
if [ $ALL_BLOCKERS -gt 0 ]; then
  echo "Resolve B-7 blockers (SPLIT_BRAIN, BOTH_SHIMS, STUB_NO_OLD, OLD_IS_SHIM_NO_NEW) manually before running the migrator."
  exit 1
fi
echo "No B-7 blockers. Run migrate-b7.sh to process the $ALL_TODOS todo(s)."
exit 0
