#!/usr/bin/env bash
# Phase B-8 migrator — detect-first, one commit per module.
# Module: inventory (high blast radius — consumed by Billing/Repairs/Orders/Purchases/Barcode).
# (Billing/POS/Printing remain off-limits this batch.)
#
# Mac bash 3.2 compatible:
#   - No mapfile/readarray
#   - No ${var,,} or ${var^^}
#   - No associative arrays
#   - No bash 4+ features
#
# Per-module flow:
#   1. Discover files (page + components) in working tree.
#   2. Classify (DONE / TODO_* / SPLIT_BRAIN / etc.).
#   3. On any blocker → skip module, exit 1 at end.
#   4. Save HEAD ref, apply moves + shims, run build.
#   5. Pass → one commit "refactor(phase-b8): migrate <slug> module with compat shims".
#   6. Fail → git reset --hard <saved-HEAD>, clean -fd, continue (or stop with --strict).
#
# Flags:
#   --dry-run         show plan, no changes
#   --skip-build      skip 'npm run build' between commits
#   --allow-dirty     proceed with uncommitted changes
#   --module SLUG     process only this module (repeatable)
#   --use-alias       use '@modules/...' shim targets (default: relative)
#   --strict          stop on first build failure

set -uo pipefail

DRY_RUN=0
SKIP_BUILD=0
ALLOW_DIRTY=0
USE_ALIAS=0
STRICT=0
ONLY_MODULES=""   # space-separated for bash 3.2

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)     DRY_RUN=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --use-alias)   USE_ALIAS=1 ;;
    --strict)      STRICT=1 ;;
    --module)      ONLY_MODULES="$ONLY_MODULES $2"; shift ;;
    -h|--help)     sed -n '1,28p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

if [ $ALLOW_DIRTY -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree not clean. Commit/stash, or pass --allow-dirty." >&2
  git status --short
  exit 1
fi

# B-8 module: billing (single, FINAL BOSS).
# Run the dependency analyzer FIRST (analyze-b8-dependency.sh) — biggest blast radius.
# Typical files included in the one commit (detected dynamically):
#   - src/pages/Billing.jsx                → src/modules/billing/pages/Billing.jsx
#   - src/components/billing/*             → src/modules/billing/components/*
#   - src/lib/billingMath.js (if any)      → src/modules/billing/lib/billingMath.js
#   - src/lib/heldBills.js / saleEngine.js / cart.js → src/modules/billing/lib/
#   - top-level billing components         → src/modules/billing/components/
MODULES="
billing|Billing
"


is_shim_b3() { [ -f "$1" ] && grep -qE "Phase B-[0-9]+ compat shim" "$1" 2>/dev/null; }
is_stub_b1() { [ -f "$1" ] && grep -q "TODO Phase B-" "$1" 2>/dev/null; }

discover_page_old() {
  NAME="$1"; SLUG="$2"
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

# NEW for B-5: sub-pages folder discovery (multi-page modules like superadmin)
# Returns one file per line under src/pages/<slug>/ excluding the canonical page
# already returned by discover_page_old.
discover_subpages_folder_files() {
  SLUG="$1"; NAME="$2"; SKIP_PATH="$3"
  for d in "src/pages/${SLUG}" "src/pages/${NAME}"; do
    if [ -d "$d" ]; then
      find "$d" -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) 2>/dev/null \
        | while read f; do
            [ "$f" = "$SKIP_PATH" ] && continue
            echo "$f"
          done
    fi
  done
}

# NEW for B-5: per-module extras (lib files etc.) — "OLD|NEW" per line
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
      [ -f "src/lib/inventoryUtils.js"      ] && echo "src/lib/inventoryUtils.js|src/modules/inventory/lib/inventoryUtils.js"
      [ -f "src/lib/huid.js"                ] && echo "src/lib/huid.js|src/modules/inventory/lib/huid.js"
      [ -f "src/lib/stockMath.js"           ] && echo "src/lib/stockMath.js|src/modules/inventory/lib/stockMath.js"
      [ -f "src/components/InventoryQR.jsx" ] && echo "src/components/InventoryQR.jsx|src/modules/inventory/components/InventoryQR.jsx"
      [ -f "src/components/StockBadge.jsx"  ] && echo "src/components/StockBadge.jsx|src/modules/inventory/components/StockBadge.jsx"
      ;;
    billing)
      [ -f "src/lib/billingMath.js"     ]      && echo "src/lib/billingMath.js|src/modules/billing/lib/billingMath.js"
      [ -f "src/lib/heldBills.js"       ]      && echo "src/lib/heldBills.js|src/modules/billing/lib/heldBills.js"
      [ -f "src/lib/saleEngine.js"      ]      && echo "src/lib/saleEngine.js|src/modules/billing/lib/saleEngine.js"
      [ -f "src/lib/cart.js"            ]      && echo "src/lib/cart.js|src/modules/billing/lib/cart.js"
      [ -f "src/components/Cart.jsx"    ]      && echo "src/components/Cart.jsx|src/modules/billing/components/Cart.jsx"
      [ -f "src/components/CartItem.jsx" ]     && echo "src/components/CartItem.jsx|src/modules/billing/components/CartItem.jsx"
      [ -f "src/components/PaymentBox.jsx" ]   && echo "src/components/PaymentBox.jsx|src/modules/billing/components/PaymentBox.jsx"
      [ -f "src/components/HeldBillsDrawer.jsx" ] && echo "src/components/HeldBillsDrawer.jsx|src/modules/billing/components/HeldBillsDrawer.jsx"
      ;;
    *)
      : # no extras
      ;;
  esac
}

discover_page_new_existing() {
  NAME="$1"; SLUG="$2"
  for c in \
    "src/modules/${SLUG}/pages/${NAME}.jsx" "src/modules/${SLUG}/pages/${NAME}.js" \
    "src/modules/${SLUG}/pages/index.jsx"  "src/modules/${SLUG}/pages/index.js"; do
    [ -f "$c" ] && { echo "$c"; return; }
  done
  echo ""
}

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

# Relative path from OLD's dir to NEW (without extension)
relative_target() {
  OLD="$1"; NEW="$2"
  python -c "
import os, sys
old, new = sys.argv[1], sys.argv[2]
rel = os.path.relpath(new, os.path.dirname(old))
rel, _ = os.path.splitext(rel)
if rel.endswith('/index'): rel = rel[:-len('/index')]
if not rel.startswith('.'): rel = './' + rel
print(rel)
" "$OLD" "$NEW" 2>/dev/null || python3 -c "
import os, sys
old, new = sys.argv[1], sys.argv[2]
rel = os.path.relpath(new, os.path.dirname(old))
rel, _ = os.path.splitext(rel)
if rel.endswith('/index'): rel = rel[:-len('/index')]
if not rel.startswith('.'): rel = './' + rel
print(rel)
" "$OLD" "$NEW"
}

alias_target() {
  NEW="$1"
  stripped="${NEW#src/}"
  stripped="${stripped%.jsx}"; stripped="${stripped%.js}"; stripped="${stripped%.tsx}"; stripped="${stripped%.ts}"
  stripped="${stripped%/index}"
  case "$stripped" in
    modules/*) echo "@modules/${stripped#modules/}" ;;
    shared/*)  echo "@shared/${stripped#shared/}" ;;
    app/*)     echo "@app/${stripped#app/}" ;;
    firebase/*)echo "@firebase/${stripped#firebase/}" ;;
    *) echo "./${stripped}" ;;
  esac
}

shim_target() {
  if [ $USE_ALIAS -eq 1 ]; then alias_target "$2"; else relative_target "$1" "$2"; fi
}

infer_kind() {
  F="$1"
  case "$F" in
    *.css) echo "css" ;;
    *)
      if [ -f "$F" ] && grep -qE "export default" "$F" 2>/dev/null; then
        echo "default_named"
      else
        echo "named"
      fi
      ;;
  esac
}

shim_body() {
  OLD="$1"; NEW="$2"; KIND="$3"
  TGT="$(shim_target "$OLD" "$NEW")"
  case "$KIND" in
    named)
      printf "// Phase B-8 compat shim. Real file lives at %s.\nexport * from '%s';\n" "$TGT" "$TGT" ;;
    default)
      printf "// Phase B-8 compat shim. Real file lives at %s.\nexport { default } from '%s';\n" "$TGT" "$TGT" ;;
    default_named)
      printf "// Phase B-8 compat shim. Real file lives at %s.\nexport { default } from '%s';\nexport * from '%s';\n" "$TGT" "$TGT" "$TGT" ;;
    css)
      printf "/* Phase B-8 compat shim. Real file lives at %s.css */\n@import '%s.css';\n" "$TGT" "$TGT" ;;
  esac
}

run_build() {
  if [ $SKIP_BUILD -eq 1 ]; then echo "  (--skip-build set)"; return 0; fi
  echo "  Running: npm run build"
  npm run build --silent
}

want_module() {
  [ -z "$ONLY_MODULES" ] && return 0
  SLUG="$1"
  case " $ONLY_MODULES " in *" $SLUG "*) return 0 ;; *) return 1 ;; esac
}

# ---------- Per-module migrate ----------
migrate_module() {
  SLUG="$1"; NAME="$2"
  echo ""
  echo "============== Module: $SLUG ($NAME) =============="
  if ! want_module "$SLUG"; then
    echo "  (skipped — not in --module filter)"
    return 0
  fi

  PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  PAGE_NEW_ACTUAL="$(discover_page_new_existing "$NAME" "$SLUG")"
  # Use the OLD file's basename for the destination so BarcodeDesigner.jsx
  # doesn't get renamed to Barcode.jsx during the move.
  if [ -n "$PAGE_OLD" ]; then
    PAGE_BASENAME="$(basename "$PAGE_OLD")"
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${PAGE_BASENAME}"
  else
    PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"
  fi

  PLAN_FILE="/tmp/.b7_plan.$$"
  : > "$PLAN_FILE"
  BLOCKER_COUNT=0

  if [ -n "$PAGE_OLD" ]; then
    PAGE_NEW="${PAGE_NEW_ACTUAL:-$PAGE_NEW_CANON}"
    STATE="$(classify_file "$PAGE_OLD" "$PAGE_NEW")"
    printf "  page:  %-50s -> %-50s  %s\n" "$PAGE_OLD" "$PAGE_NEW" "$STATE"
    case "$STATE" in
      DONE|ABSENT) : ;;
      TODO_FRESH_MOVE|TODO_REPLACE_STUB)
        KIND="$(infer_kind "$PAGE_OLD")"
        echo "MOVE|$PAGE_OLD|$PAGE_NEW|$KIND" >> "$PLAN_FILE"
        ;;
      MOVED_NO_SHIM)
        KIND="$(infer_kind "$PAGE_NEW")"
        echo "SHIM|$PAGE_OLD|$PAGE_NEW|$KIND" >> "$PLAN_FILE"
        ;;
      *)
        echo "  ⚠ blocker on page: $STATE"
        BLOCKER_COUNT=$((BLOCKER_COUNT+1))
        ;;
    esac
  else
    echo "  page:  (none discovered for $NAME)"
  fi

  COMP_LIST="$(discover_component_files "$SLUG" "$NAME")"
  if [ -n "$COMP_LIST" ]; then
    while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/components/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/components/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      printf "  comp:  %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_FRESH_MOVE|TODO_REPLACE_STUB)
          KIND="$(infer_kind "$f")"
          echo "MOVE|$f|$NEW|$KIND" >> "$PLAN_FILE"
          ;;
        MOVED_NO_SHIM)
          KIND="$(infer_kind "$NEW")"
          echo "SHIM|$f|$NEW|$KIND" >> "$PLAN_FILE"
          ;;
        *)
          echo "  ⚠ blocker on comp: $STATE"
          BLOCKER_COUNT=$((BLOCKER_COUNT+1))
          ;;
      esac
    done <<<"$COMP_LIST"
  fi

  # B-5 addition: sub-pages folder files (multi-page modules)
  SUBPAGES_LIST="$(discover_subpages_folder_files "$SLUG" "$NAME" "$PAGE_OLD")"
  if [ -n "$SUBPAGES_LIST" ]; then
    while IFS= read f; do
      [ -z "$f" ] && continue
      rel="${f#src/pages/}"
      case "$rel" in ${SLUG}/*) rel="${rel#${SLUG}/}" ;; ${NAME}/*) rel="${rel#${NAME}/}" ;; esac
      NEW="src/modules/${SLUG}/pages/${rel}"
      STATE="$(classify_file "$f" "$NEW")"
      printf "  page+: %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_FRESH_MOVE|TODO_REPLACE_STUB)
          KIND="$(infer_kind "$f")"
          echo "MOVE|$f|$NEW|$KIND" >> "$PLAN_FILE"
          ;;
        MOVED_NO_SHIM)
          KIND="$(infer_kind "$NEW")"
          echo "SHIM|$f|$NEW|$KIND" >> "$PLAN_FILE"
          ;;
        *)
          echo "  ⚠ blocker on sub-page: $STATE"
          BLOCKER_COUNT=$((BLOCKER_COUNT+1))
          ;;
      esac
    done <<<"$SUBPAGES_LIST"
  fi

  # B-5 addition: per-module extras (lib files etc.)
  EXTRAS_LIST="$(extra_files_for_module "$SLUG")"
  if [ -n "$EXTRAS_LIST" ]; then
    while IFS='|' read OLD NEW; do
      [ -z "$OLD" ] && continue
      STATE="$(classify_file "$OLD" "$NEW")"
      printf "  extra: %-50s -> %-50s  %s\n" "$OLD" "$NEW" "$STATE"
      case "$STATE" in
        DONE|ABSENT) : ;;
        TODO_FRESH_MOVE|TODO_REPLACE_STUB)
          KIND="$(infer_kind "$OLD")"
          echo "MOVE|$OLD|$NEW|$KIND" >> "$PLAN_FILE"
          ;;
        MOVED_NO_SHIM)
          KIND="$(infer_kind "$NEW")"
          echo "SHIM|$OLD|$NEW|$KIND" >> "$PLAN_FILE"
          ;;
        *)
          echo "  ⚠ blocker on extra: $STATE"
          BLOCKER_COUNT=$((BLOCKER_COUNT+1))
          ;;
      esac
    done <<<"$EXTRAS_LIST"
  fi

  if [ $BLOCKER_COUNT -gt 0 ]; then
    echo "  → skipping module ($SLUG) — $BLOCKER_COUNT blocker(s)"
    rm -f "$PLAN_FILE"
    return 2
  fi

  STEP_COUNT=$(wc -l < "$PLAN_FILE" | tr -d ' ')
  if [ "$STEP_COUNT" -eq 0 ]; then
    echo "  ✓ Nothing to do (module already migrated)."
    rm -f "$PLAN_FILE"
    return 0
  fi

  if [ $DRY_RUN -eq 1 ]; then
    echo "  [dry-run] Would perform $STEP_COUNT step(s):"
    sed 's/^/    /' "$PLAN_FILE"
    rm -f "$PLAN_FILE"
    return 0
  fi

  SAVED_HEAD="$(git rev-parse HEAD)"
  CREATED_DIRS=""

  echo "  Applying $STEP_COUNT step(s)..."
  while IFS='|' read OP OLD NEW KIND; do
    [ -z "$OP" ] && continue
    mkdir -p "$(dirname "$NEW")"
    CREATED_DIRS="$CREATED_DIRS $(dirname "$NEW")"

    if [ "$OP" = "SHIM" ]; then
      mkdir -p "$(dirname "$OLD")"
      shim_body "$OLD" "$NEW" "$KIND" > "$OLD"
      git add "$OLD"
      echo "    shim only: $OLD -> $NEW"
      continue
    fi

    # MOVE
    if [ -f "$NEW" ] && is_stub_b1 "$NEW"; then
      git rm -f "$NEW" >/dev/null
      # git rm removes empty parent dirs — recreate
      mkdir -p "$(dirname "$NEW")"
    fi
    if ! git mv "$OLD" "$NEW"; then
      echo "  ✗ git mv failed: $OLD -> $NEW — rolling back module"
      git reset --hard "$SAVED_HEAD" --quiet
      for d in $CREATED_DIRS; do rmdir "$d" 2>/dev/null || true; done
      rm -f "$PLAN_FILE"
      return 1
    fi
    shim_body "$OLD" "$NEW" "$KIND" > "$OLD"
    git add "$OLD" "$NEW"
    echo "    moved:     $OLD -> $NEW   (shim KIND=$KIND)"
  done < "$PLAN_FILE"
  rm -f "$PLAN_FILE"

  if ! run_build; then
    echo "  ✗ Build failed for module $SLUG — rolling back."
    git reset --hard "$SAVED_HEAD" --quiet
    for d in $CREATED_DIRS; do rmdir "$d" 2>/dev/null || true; done
    if [ $STRICT -eq 1 ]; then
      echo "  --strict set; stopping."
      return 3
    fi
    return 1
  fi

  git commit -m "refactor(phase-b8): migrate $SLUG module with compat shims" --quiet
  echo "  ✓ committed: $SLUG ($(git rev-parse --short HEAD))"
  return 0
}

# ---------- Main loop ----------
if [ $USE_ALIAS -eq 1 ]; then SHIM_MODE="ALIAS"; else SHIM_MODE="RELATIVE"; fi
echo "Phase B-8 — $SHIM_MODE shims"
[ $DRY_RUN -eq 1 ] && echo "(dry-run)"
[ -n "$ONLY_MODULES" ] && echo "(filter:$ONLY_MODULES)"

ANY_DONE=0; ANY_FAIL=0; ANY_BLOCKER=0

while IFS='|' read SLUG NAME; do
  [ -z "$SLUG" ] && continue
  set +e
  migrate_module "$SLUG" "$NAME"
  RC=$?
  set -e
  case "$RC" in
    0) ANY_DONE=$((ANY_DONE+1)) ;;
    1) ANY_FAIL=$((ANY_FAIL+1)) ;;
    2) ANY_BLOCKER=$((ANY_BLOCKER+1)) ;;
    3) echo "Stopping due to --strict + build failure."; exit 3 ;;
  esac
done <<EOF
$MODULES
EOF

echo ""
echo "================ Result ================"
echo "modules processed OK   : $ANY_DONE"
echo "modules with blockers  : $ANY_BLOCKER"
echo "modules with build err : $ANY_FAIL"

if [ $ANY_BLOCKER -gt 0 ] || [ $ANY_FAIL -gt 0 ]; then exit 1; fi
exit 0
