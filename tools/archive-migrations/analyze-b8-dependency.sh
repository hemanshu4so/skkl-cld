#!/usr/bin/env bash
# Phase B-8 — Billing dependency analyzer (FINAL BOSS).
# READ-ONLY. Surfaces billing's complete blast radius before migration.
#
# Seven sections:
#   1. Transactional write integrity (runTransaction + writeBatch)
#   2. products.available atomic updates
#   3. Held-bill state machine
#   4. Scheme redemption flow
#   5. Sale write trace (sales + customerTransactions + dayBookEntries)
#   6. Print integration (PrintRenderer + bill template)
#   7. Risk assessment + pre-migration checklist
#
# Mac bash 3.2 compatible. Always exits 0 — informational only.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

SRC_DIRS="src"
hr() { printf '%s\n' "----------------------------------------------------------------"; }

echo "Phase B-8 Billing Dependency Analyzer (FINAL BOSS)"
echo "Date: $(date -u +%FT%TZ)"
echo "Repo: $(git rev-parse --abbrev-ref HEAD)@$(git rev-parse --short HEAD)"
echo ""

# Find candidate billing source files in pre- AND post-migration shape
BILLING_FILES=""
for cand in src/pages/Billing.jsx src/pages/Billing.js src/pages/POS.jsx; do
  [ -f "$cand" ] && BILLING_FILES="$BILLING_FILES $cand"
done
if [ -d src/components/billing ]; then
  EXTRA=$(find src/components/billing -type f \( -name '*.js' -o -name '*.jsx' \) 2>/dev/null)
  BILLING_FILES="$BILLING_FILES $EXTRA"
fi
if [ -d src/modules/billing ]; then
  EXTRA=$(find src/modules/billing -type f \( -name '*.js' -o -name '*.jsx' \) 2>/dev/null)
  BILLING_FILES="$BILLING_FILES $EXTRA"
fi
# Also pick up shared billing libs if present at top-level
for cand in src/lib/billingMath.js src/lib/heldBills.js src/lib/saleEngine.js src/lib/cart.js; do
  [ -f "$cand" ] && BILLING_FILES="$BILLING_FILES $cand"
done

# ─────────────────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════"
echo "  1. Transactional writes  (runTransaction / writeBatch)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Billing files that wrap multi-doc writes in a transaction or batch."
hr
TX_FILES=""
for f in $BILLING_FILES; do
  [ ! -f "$f" ] && continue
  if grep -qE "runTransaction|writeBatch" "$f" 2>/dev/null; then
    TX_FILES="$TX_FILES $f"
  fi
done

if [ -z "$(echo $TX_FILES | tr -d ' ')" ]; then
  echo "  (no transactional writes found in billing files — investigate)"
else
  for f in $TX_FILES; do
    echo ""
    echo "  $f"
    # Pull lines mentioning the verb + 5 lines of context (helps see which docs are touched)
    grep -nE "runTransaction|writeBatch|tx\.(set|update|delete)|batch\.(set|update|delete)|collection\([^)]*['\"]" "$f" 2>/dev/null \
      | sed 's/^/    /' | head -30
  done
fi

echo ""
echo "  Implication for B-8:"
echo "  - Atomicity matters: a sale must decrement stock, append a sale doc, append"
echo "    a customer ledger row, AND a day-book row — all-or-nothing."
echo "  - Migration only moves files. Verify after the commit by creating a fresh"
echo "    sale and confirming all four writes landed (or NONE did, on a forced fail)."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  2. products.available atomic updates"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Where billing touches products.available (the critical decrement)"
hr
AVAIL_HITS=""
for f in $BILLING_FILES; do
  [ ! -f "$f" ] && continue
  HITS=$(grep -nE "available|stock|increment\(-|FieldValue\.increment" "$f" 2>/dev/null | grep -vE "^\s*//" | head -10)
  if [ -n "$HITS" ]; then
    echo ""
    echo "  $f"
    echo "$HITS" | sed 's/^/    /'
  fi
done

echo ""
echo "  Implication for B-8:"
echo "  - Use transaction reads BEFORE writes to avoid lost-update races."
echo "  - After migration, run the canonical 'oversell test': try to buy more than"
echo "    available in two browser tabs simultaneously — second sale must reject."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  3. Held-bill state machine"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Operations on the heldBills collection: park, resume, discard, finalize"
hr
HELD_HITS=$(grep -rnE "heldBills" --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' $SRC_DIRS 2>/dev/null \
  | grep -vE "^\s*\*|^\s*//")
if [ -z "$HELD_HITS" ]; then
  echo "  (no heldBills references found)"
else
  echo "$HELD_HITS" | sed 's/^/  /' | head -25
fi

echo ""
echo "  Implication for B-8:"
echo "  - A parked bill writes a heldBills doc; resuming reads + deletes it; finalize"
echo "    converts to a sale doc. Verify the state machine still completes after move:"
echo "    park → list → resume → checkout → finalize → heldBills doc deleted."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  4. Scheme redemption flow"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Where billing reads schemes / writes schemeRedemptions"
hr
SCH_HITS=""
for f in $BILLING_FILES; do
  [ ! -f "$f" ] && continue
  HITS=$(grep -nE "scheme|redemption|schemeRedemption" "$f" 2>/dev/null | grep -vE "^\s*//" | head -10)
  if [ -n "$HITS" ]; then
    echo ""
    echo "  $f"
    echo "$HITS" | sed 's/^/    /'
  fi
done

if [ -z "$SCH_HITS" ]; then
  # Try whole src as fallback
  echo "  Falling back to repo-wide search for scheme redemption code paths:"
  grep -rnE "schemeRedemption|redeemScheme|onSchemeRedeem" $SRC_DIRS 2>/dev/null \
    | head -10 | sed 's/^/  /'
fi

echo ""
echo "  Implication for B-8:"
echo "  - When a customer redeems an 11+1 scheme at the POS, the sale includes the"
echo "    redemption credit. Three writes land in one transaction:"
echo "      schemeRedemptions/{id}     (the redemption record)"
echo "      customerTransactions/{id}  (the customer ledger leg)"
echo "      sales/{id}                 (the sale with reduced net)"
echo "  - Verify after move by redeeming a test scheme."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  5. Sale write trace  (sales + customerTransactions + dayBookEntries)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "All collection() targets in billing files."
hr
ALL_COLLS=""
for f in $BILLING_FILES; do
  [ ! -f "$f" ] && continue
  COLLS=$(grep -hoE "collection\([A-Za-z_]+,\s*['\"][a-zA-Z_]+['\"]" "$f" 2>/dev/null \
          | sed -E "s/.*['\"]([a-zA-Z_]+)['\"].*/\1/")
  if [ -n "$COLLS" ]; then
    ALL_COLLS="$ALL_COLLS $COLLS"
  fi
done

UNIQ_COLLS=$(echo "$ALL_COLLS" | tr ' ' '\n' | sort -u | grep -v '^$')

if [ -z "$UNIQ_COLLS" ]; then
  echo "  (no collection() calls found)"
else
  OWNED="sales heldBills"
  echo "  Owned by billing:"
  for c in $UNIQ_COLLS; do
    case " $OWNED " in *" $c "*) printf "    %s  (OWNED)\n" "$c" ;; esac
  done
  echo ""
  echo "  Cross-module writes (verify each shim still resolves):"
  for c in $UNIQ_COLLS; do
    case " $OWNED " in *" $c "*) ;; *) printf "    %s\n" "$c" ;; esac
  done
fi

echo ""
echo "  Implication for B-8:"
echo "  - The canonical sale write touches: products (decrement), sales (insert),"
echo "    customerTransactions (insert), dayBookEntries (insert)."
echo "  - Optional: schemeRedemptions (if scheme used), activityLogs (audit)."
echo "  - Migration does not change which collection is touched; verify by creating"
echo "    one sale and tailing each of those four collections."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  6. Print integration  (PrintRenderer via B-6 shim)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Where billing imports the print system."
hr
PRINT_HITS=""
for f in $BILLING_FILES; do
  [ ! -f "$f" ] && continue
  HITS=$(grep -nE "PrintRenderer|printTemplate|DEFAULT_BILL_TEMPLATE" "$f" 2>/dev/null | grep -vE "^\s*//")
  if [ -n "$HITS" ]; then
    echo ""
    echo "  $f"
    echo "$HITS" | sed 's/^/    /'
  fi
done
if [ -z "$PRINT_HITS" ]; then
  echo "  (no obvious PrintRenderer imports found in billing files)"
fi

echo ""
echo "  Implication for B-8:"
echo "  - PrintRenderer was moved in B-6 to src/modules/printing/. Billing currently"
echo "    imports it via the B-6 shim at src/components/PrintRenderer.jsx."
echo "  - After B-8, billing's import remains unchanged — it continues to resolve"
echo "    via the same shim. Don't switch billing to the new alias path in this"
echo "    phase (that's the B-9 shim-removal pass)."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  7. Risk assessment + pre-migration checklist"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Risk level:  HIGHEST"
echo "  Reason:      Billing is the POS. A single broken import = no sales today."
echo "               Every smoke test below MUST pass before push."
echo ""
echo "  Pre-migration checklist:"
echo "    [ ] Working tree clean (git status -sb)"
echo "    [ ] Tag pushed:           phase-b7-complete"
echo "    [ ] Barcode Recovery Pass NOT touched in this PR"
echo "    [ ] Inventory module DONE (B-7) — billing depends on inventory shim chain"
echo "    [ ] Print module DONE   (B-6) — billing prints via PrintRenderer shim"
echo "    [ ] Smoke-test plan agreed:"
echo "         1. Open Billing page → cart loads, customer search works, rate shows."
echo "         2. Add 3 SKUs → totals compute correctly → discount → final total OK."
echo "         3. Click Save → confirm new docs in: sales, customerTransactions,"
echo "            dayBookEntries; confirm products.available decremented for each SKU."
echo "         4. Print the bill → PrintRenderer renders via B-6 shim → bill identical"
echo "            to pre-migration."
echo "         5. Park a held bill → see it in held drawer → resume → finalize."
echo "         6. Redeem a scheme → confirm schemeRedemptions + customerTransactions"
echo "            + sales all updated atomically."
echo "         7. (Optional but recommended) Force a failed transaction (network kill)"
echo "            → confirm none of the docs partially wrote."
echo "    [ ] If any smoke fails: git reset --hard phase-b7-complete"
echo ""
echo "  Tag at end:  phase-b8-complete"
echo ""
echo "  Phase B-9 (after this, separate PR):"
echo "    - Rewrite consumers to import directly from @modules/* paths."
echo "    - Delete all 'Phase B-N compat shim' files."
echo "    - Add lint rule import/no-restricted-paths."
echo "    - Final tag: phase-b9-complete (module restructure done)."
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Analyzer complete. Run ./detect-b8-state.sh next, then ./migrate-b8.sh."
echo "════════════════════════════════════════════════════════════════"
