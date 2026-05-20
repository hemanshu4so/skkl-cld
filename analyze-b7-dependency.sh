#!/usr/bin/env bash
# Phase B-7 — Inventory dependency analyzer.
# READ-ONLY. Surfaces inventory's blast radius BEFORE migration:
#   1. products collection — readers and writers across the codebase
#   2. Inventory module code consumers — who imports inventory components/utilities
#   3. Barcode / tag flow consumers — relevant because Barcode Recovery Pass is pending
#   4. Cross-module writes from inventory itself
#   5. Recommended pre-migration safety steps
#
# Mac bash 3.2 compatible. Always exits 0 — informational only.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

SRC_DIRS="src"
hr() { printf '%s\n' "----------------------------------------------------------------"; }

echo "Phase B-7 Inventory Dependency Analyzer"
echo "Date: $(date -u +%FT%TZ)"
echo "Repo: $(git rev-parse --abbrev-ref HEAD)@$(git rev-parse --short HEAD)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════"
echo "  1. products collection — readers and writers"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Pattern A — readers: query/getDoc/onSnapshot on 'products'"
hr
READERS=$(grep -rl --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  -E "(collection|doc|onSnapshot|query|getDocs|getDoc)\\([^)]*['\"]products['\"]" $SRC_DIRS 2>/dev/null | sort -u)
if [ -z "$READERS" ]; then
  echo "  (no readers found)"
else
  for f in $READERS; do
    MODULE_HINT=$(echo "$f" | sed -nE 's|.*src/modules/([^/]+)/.*|module:\1|p; s|.*src/pages/([^/.]+).*|page:\1|p; s|.*src/components/([^/]+)/.*|comp:\1|p')
    printf "  %-14s  %s\n" "${MODULE_HINT:-other}" "$f"
  done
fi

echo ""
hr
echo "Pattern B — writers: addDoc/setDoc/updateDoc/writeBatch on 'products'"
hr
WRITERS=$(grep -rl --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' "products" $SRC_DIRS 2>/dev/null | sort -u)
WRITER_HITS=""
for f in $WRITERS; do
  if grep -qE "(addDoc|setDoc|updateDoc|writeBatch|batch\.set|batch\.update|increment|runTransaction)" "$f" 2>/dev/null; then
    if grep -qE "['\"]products['\"]" "$f" 2>/dev/null; then
      WRITER_HITS="$WRITER_HITS $f"
    fi
  fi
done
if [ -z "$(echo $WRITER_HITS | tr -d ' ')" ]; then
  echo "  (no writers found)"
else
  for f in $WRITER_HITS; do
    MODULE_HINT=$(echo "$f" | sed -nE 's|.*src/modules/([^/]+)/.*|module:\1|p; s|.*src/pages/([^/.]+).*|page:\1|p; s|.*src/components/([^/]+)/.*|comp:\1|p')
    printf "  %-14s  %s\n" "${MODULE_HINT:-other}" "$f"
  done
fi

echo ""
echo "  Implication for B-7:"
echo "  - Inventory is the page that lists/manages products."
echo "  - Writers above (Billing/Purchases/Repairs/Orders) write directly to products"
echo "    via Firestore SDK — they do NOT import inventory module code to do so."
echo "  - Moving inventory does not change writer behavior. Verify each writer still"
echo "    decrements/increments correctly after the migration."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  2. Inventory module code consumers — who imports inventory code"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Files that import from pages/Inventory, components/inventory, or src/lib/inventory*"
hr
INV_CONSUMERS=$(grep -rl --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  -E "from ['\"][^'\"]*(pages/Inventory|components/inventory|lib/inventory|modules/inventory)['\"]?" $SRC_DIRS 2>/dev/null \
  | grep -v "src/pages/Inventory\|src/modules/inventory\|src/components/inventory" | sort -u)
if [ -z "$INV_CONSUMERS" ]; then
  echo "  (no external consumers of inventory code found)"
else
  for f in $INV_CONSUMERS; do
    MODULE_HINT=$(echo "$f" | sed -nE 's|.*src/modules/([^/]+)/.*|module:\1|p; s|.*src/pages/([^/.]+).*|page:\1|p; s|.*src/components/([^/]+)/.*|comp:\1|p')
    printf "  %-14s  %s\n" "${MODULE_HINT:-other}" "$f"
  done
fi

echo ""
echo "  Implication for B-7:"
echo "  - These consumers will need the compat shim at the OLD inventory paths to keep"
echo "    working after the move. The migrator writes the shims automatically."
echo "  - After the commit, re-run this analyzer and confirm the list is unchanged."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  3. Barcode / tag flow consumers  (Barcode Recovery Pass pending)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Files that import from modules/barcode or lib/code128/qr/barcodeTemplate"
echo "or from the (currently DISABLED) TagCanvas / inventory tag preview path."
hr
BARCODE_CONSUMERS=$(grep -rl --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  -E "from ['\"][^'\"]*(modules/barcode|lib/code128|lib/qr|lib/barcodeTemplate|TagCanvas)['\"]?" $SRC_DIRS 2>/dev/null \
  | grep -v "src/modules/barcode\|src/lib/code128\|src/lib/qr\|src/lib/barcodeTemplate" | sort -u)
if [ -z "$BARCODE_CONSUMERS" ]; then
  echo "  (no barcode consumers found — Recovery Pass may have removed them all)"
else
  for f in $BARCODE_CONSUMERS; do
    MODULE_HINT=$(echo "$f" | sed -nE 's|.*src/modules/([^/]+)/.*|module:\1|p; s|.*src/pages/([^/.]+).*|page:\1|p; s|.*src/components/([^/]+)/.*|comp:\1|p')
    printf "  %-14s  %s\n" "${MODULE_HINT:-other}" "$f"
  done
fi

echo ""
echo "  ⚠ Pending state note:"
echo "  - TagCanvas is temporarily disabled in your repo."
echo "  - Barcode Designer side preview is off."
echo "  - Inventory tag preview is temporarily bypassed."
echo "  - DO NOT re-enable any of these in B-7. They are tracked in the upcoming"
echo "    Barcode Recovery Pass."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  4. Inventory's own outgoing writes"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Collections that inventory page / components write to."
hr

INV_SRC_FILES=""
for cand in src/pages/Inventory.jsx src/pages/Inventory.js src/pages/InventoryV2.jsx; do
  [ -f "$cand" ] && INV_SRC_FILES="$INV_SRC_FILES $cand"
done
if [ -d src/components/inventory ]; then
  EXTRA=$(find src/components/inventory -type f \( -name '*.js' -o -name '*.jsx' \) 2>/dev/null)
  INV_SRC_FILES="$INV_SRC_FILES $EXTRA"
fi
if [ -d src/modules/inventory ]; then
  EXTRA=$(find src/modules/inventory -type f \( -name '*.js' -o -name '*.jsx' \) 2>/dev/null)
  INV_SRC_FILES="$INV_SRC_FILES $EXTRA"
fi

if [ -z "$(echo $INV_SRC_FILES | tr -d ' ')" ]; then
  echo "  (no inventory source files found — has it been migrated already?)"
else
  WRITE_COLLS=$(grep -hoE "collection\([A-Za-z_]+,\s*['\"][a-zA-Z_]+['\"]" $INV_SRC_FILES 2>/dev/null \
                | sed -E "s/.*['\"]([a-zA-Z_]+)['\"].*/\1/" | sort -u)
  if [ -z "$WRITE_COLLS" ]; then
    echo "  No collection() calls found."
  else
    OWNED="products inventory inventoryAdjustments"
    for c in $WRITE_COLLS; do
      case " $OWNED " in
        *" $c "*) printf "  %-22s  OWNED\n" "$c" ;;
        *)        printf "  %-22s  CROSS-MODULE WRITE  (verify shim)\n" "$c" ;;
      esac
    done
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  5. Risk assessment + pre-migration checklist"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Risk level:  HIGH"
echo "  Reason:      Inventory is a foundation module. Billing decrements stock,"
echo "               Purchases increments, Repairs holds, Orders holds for advance."
echo "               If a single import path breaks, the POS goes red."
echo ""
echo "  Pre-migration checklist:"
echo "    [ ] Working tree clean (git status -sb)"
echo "    [ ] Tag pushed:        phase-b6-complete"
echo "    [ ] Barcode Recovery Pass NOT touched in this PR"
echo "    [ ] Smoke-test plan agreed:"
echo "         1. Open Inventory page → list renders, search works."
echo "         2. Open a product → edit field → save → list refreshes."
echo "         3. Create a sale in Billing → confirm products.available decrements."
echo "         4. Create a purchase → confirm products.available increments."
echo "         5. Create a repair → confirm any stock-hold writes to inventoryAdjustments."
echo "         6. Create an order with advance → confirm stock hold writes."
echo "    [ ] If any smoke fails, revert: git reset --hard phase-b6-complete"
echo ""
echo "  Tag at end:  phase-b7-complete"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Analyzer complete. Run ./detect-b7-state.sh next, then ./migrate-b7.sh."
echo "════════════════════════════════════════════════════════════════"
