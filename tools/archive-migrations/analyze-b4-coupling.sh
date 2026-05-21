#!/usr/bin/env bash
# Phase B-4 pre-migration coupling analyzer.
# Read-only. Surfaces cross-module writes, dayBook coupling, scheme timers,
# and report query dependencies BEFORE you start migrating. Run this first.
#
# Mac bash 3.2 compatible.
# Exit 0 always (informational); review the output before deciding to migrate.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

# Source roots to scan — covers both pre- and post-migration layouts
SRC_DIRS="src"

hr() { printf '%s\n' "----------------------------------------------------------------"; }

count_lines() { wc -l 2>/dev/null | tr -d ' '; }

# ─────────────────────────────────────────────────────────────────────────────
echo "Phase B-4 Coupling Analyzer"
echo "Date: $(date -u +%FT%TZ)"
echo "Repo: $(git rev-parse --abbrev-ref HEAD)@$(git rev-parse --short HEAD)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════"
echo "  1. dayBookEntries writers  (who writes to accounting's book)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Pattern: addDoc/setDoc/updateDoc/writeBatch touching 'dayBookEntries'"
hr

# Strategy: find files that mention 'dayBookEntries' AND a write verb
DAYBOOK_FILES=$(grep -rl --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' "dayBookEntries" $SRC_DIRS 2>/dev/null | sort -u)
if [ -z "$DAYBOOK_FILES" ]; then
  echo "  (no references to dayBookEntries found)"
else
  for f in $DAYBOOK_FILES; do
    if grep -qE "(addDoc|setDoc|updateDoc|writeBatch|batch\.set|batch\.update|batch\.add)" "$f"; then
      MODULE_HINT=$(echo "$f" | sed -nE 's|.*src/modules/([^/]+)/.*|module:\1|p; s|.*src/pages/([^/.]+).*|page:\1|p; s|.*src/components/([^/]+)/.*|comp:\1|p')
      printf "  %-12s  %s\n" "${MODULE_HINT:-other}" "$f"
    fi
  done
fi

echo ""
echo "  Implication for B-4:"
echo "  - Accounting is the READER. Modules above are WRITERS."
echo "  - Moving accounting does not change writers' behavior; they call addDoc directly."
echo "  - After accounting moves, verify the day-book listing still subscribes."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  2. Reports — collection queries (read dependencies)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Files scanned: src/pages/Reports.{js,jsx}, src/modules/reports/**"
hr

REPORT_FILES=""
for cand in src/pages/Reports.jsx src/pages/Reports.js src/pages/reports/index.jsx src/pages/reports/index.js; do
  [ -f "$cand" ] && REPORT_FILES="$REPORT_FILES $cand"
done
if [ -d "src/modules/reports" ]; then
  EXTRA=$(find src/modules/reports -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)
  REPORT_FILES="$REPORT_FILES $EXTRA"
fi

if [ -z "$(echo $REPORT_FILES | tr -d ' ')" ]; then
  echo "  (no reports file discovered at any candidate location)"
else
  echo "$REPORT_FILES" | tr ' ' '\n' | while read f; do
    [ -z "$f" ] && continue
    [ ! -f "$f" ] && continue
    # Extract collection names from collection(db, 'X') and similar patterns
    COLLS=$(grep -hoE "collection\([A-Za-z_]+,\s*['\"][a-zA-Z_]+['\"]" "$f" 2>/dev/null \
            | sed -E "s/.*['\"]([a-zA-Z_]+)['\"].*/\1/" | sort -u)
    if [ -n "$COLLS" ]; then
      echo "  $f"
      echo "$COLLS" | sed 's/^/    → /'
    fi
  done
fi

echo ""
echo "  Implication for B-4:"
echo "  - Reports is read-only across many collections. Moving it does not change"
echo "    the underlying data. The risk is import-path drift inside the reports"
echo "    file itself — the @shared and @firebase shims from B-2 cover those."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  3. Scheme timers / cron logic"
echo "════════════════════════════════════════════════════════════════"
hr
echo "Looking for: setInterval, setTimeout, scheduledFunction, monthly-tick handlers"
echo "  Client (src/) AND Cloud Functions (functions/) if present"
hr

# Client-side timers in scheme files
CLIENT_HITS=""
SCHEME_FILES=""
for cand in src/pages/Schemes.jsx src/pages/Schemes.js; do
  [ -f "$cand" ] && SCHEME_FILES="$SCHEME_FILES $cand"
done
if [ -d "src/modules/schemes" ]; then
  EXTRA=$(find src/modules/schemes -type f \( -name '*.js' -o -name '*.jsx' \) 2>/dev/null)
  SCHEME_FILES="$SCHEME_FILES $EXTRA"
fi

if [ -n "$(echo $SCHEME_FILES | tr -d ' ')" ]; then
  echo "  Client-side timer references:"
  for f in $SCHEME_FILES; do
    [ ! -f "$f" ] && continue
    HITS=$(grep -nE "setInterval|setTimeout|new Date\(\)|monthlyTick|crontab" "$f" 2>/dev/null)
    if [ -n "$HITS" ]; then
      echo "  $f"
      echo "$HITS" | sed 's/^/    /'
    fi
  done
else
  echo "  (no scheme file discovered)"
fi

# Cloud Functions
echo ""
if [ -d "functions" ]; then
  echo "  Cloud Functions referencing schemes:"
  FN_HITS=$(grep -rnE "scheme|monthlyTick|schemeRedemption" functions/ 2>/dev/null | head -20)
  if [ -n "$FN_HITS" ]; then
    echo "$FN_HITS" | sed 's/^/    /'
  else
    echo "    (no scheme/cron references in functions/)"
  fi
else
  echo "  (no functions/ directory present)"
fi

echo ""
echo "  Implication for B-4:"
echo "  - Cron logic lives in functions/, NOT in src/. Migrating src/pages/Schemes.jsx"
echo "    does not touch the cron."
echo "  - But verify any 'admin force-tick' button on the page still wires to the"
echo "    same Cloud Function callable after the move."

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  4. Cross-module writes  (each B-4 module's write targets)"
echo "════════════════════════════════════════════════════════════════"
hr
echo "For each B-4 module, list non-owned collections it writes to."
echo "If a module writes to a collection owned by another module, that's"
echo "a cross-module write — verify the shim/import chain still resolves."
hr

# Ownership map (heuristic — refine as needed)
# accounting → accounts, dayBookEntries, expenses
# schemes    → schemes, schemeRedemptions
# reports    → (read-only; should write nothing)

analyze_module() {
  SLUG="$1"
  OWNED="$2"     # space-separated owned collection names
  shift; shift
  echo ""
  echo "  Module: $SLUG"
  echo "    Owned collections: $OWNED"

  FILES=""
  for cand in src/pages/$(echo $SLUG | awk '{ s=toupper(substr($1,1,1)) tolower(substr($1,2)); gsub(/-([a-z])/, "U&\\1", s); gsub(/-/,"",s); print s }').jsx \
              src/pages/$(echo $SLUG).jsx; do
    [ -f "$cand" ] && FILES="$FILES $cand"
  done
  if [ -d "src/modules/$SLUG" ]; then
    EXTRA=$(find "src/modules/$SLUG" -type f \( -name '*.js' -o -name '*.jsx' \) 2>/dev/null)
    FILES="$FILES $EXTRA"
  fi

  if [ -z "$(echo $FILES | tr -d ' ')" ]; then
    echo "    (no source files found yet — likely not migrated)"
    return
  fi

  # Find collection names appearing near write verbs
  WRITE_COLLS=$(grep -hoE "collection\([A-Za-z_]+,\s*['\"][a-zA-Z_]+['\"]" $FILES 2>/dev/null \
                | sed -E "s/.*['\"]([a-zA-Z_]+)['\"].*/\1/" | sort -u)
  if [ -z "$WRITE_COLLS" ]; then
    echo "    No collection() calls found."
    return
  fi
  for c in $WRITE_COLLS; do
    case " $OWNED " in
      *" $c "*) printf "    %-22s  OWNED\n" "$c" ;;
      *)        printf "    %-22s  CROSS-MODULE WRITE  (verify shim)\n" "$c" ;;
    esac
  done
}

analyze_module "accounting" "accounts dayBookEntries expenses"
analyze_module "schemes"    "schemes schemeRedemptions"
analyze_module "reports"    ""   # read-only

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  5. Recommended migration order"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  1. reports     (read-only, no writes; smallest blast radius)"
echo "  2. accounting  (read-heavy from its own POV; manual journal posts are isolated)"
echo "  3. schemes     (most complex: cron + money flow + customer ledger writes)"
echo ""
echo "  This is the order baked into migrate-b4.sh's MODULES table."
echo ""
echo "  Run pattern:"
echo "    ./detect-b4-state.sh"
echo "    ./migrate-b4.sh --dry-run"
echo "    ./migrate-b4.sh --module reports"
echo "    # smoke test reports page, then:"
echo "    ./migrate-b4.sh --module accounting"
echo "    # smoke test day book + manual journal post, then:"
echo "    ./migrate-b4.sh --module schemes"
echo "    # smoke test scheme create/deposit/redemption"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Analyzer complete. Review findings above before running migrate-b4.sh."
echo "════════════════════════════════════════════════════════════════"
