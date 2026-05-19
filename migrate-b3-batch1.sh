#!/usr/bin/env bash
# Phase B-3 Batch 1 migrator — detect-first, one commit per module.
# Batch 1 modules: dashboard, customers, notifications, activity-log, settings, backup, user-admin.
# (Billing/POS/Printing are deliberately NOT touched in this batch.)
#
# Per-module flow:
#   1. Discover the module's files (page + components) in the working tree.
#   2. Classify each file: DONE / TODO_* / SPLIT_BRAIN / etc.
#   3. If any blocker, skip the module (or stop with --strict).
#   4. Save HEAD ref. Apply all moves + shims. Run build.
#   5. On success: ONE commit named "refactor(phase-b3): migrate <module> with compat shims".
#   6. On build failure: `git reset --hard <saved-ref>` + `git clean -fd src/modules/<m>/` -> module is untouched,
#      proceed to next module unless --strict.
#
# Idempotent: re-running after success exits 0 with "Nothing to do."
# Resumable: re-running after a partial run resumes at the first non-DONE module.
# Default shims use RELATIVE paths (safer if aliases caused issues earlier).
# Use --use-alias to opt into @-alias shims.
#
# Flags:
#   --dry-run         : show plan, change nothing
#   --skip-build      : do not run 'npm run build' between commits
#   --allow-dirty     : proceed despite uncommitted changes
#   --module SLUG     : process only this module (repeatable)
#   --use-alias       : shim re-exports via '@modules/...' alias (default: relative path)
#   --strict          : stop on first build failure instead of continuing

set -uo pipefail

DRY_RUN=0
SKIP_BUILD=0
ALLOW_DIRTY=0
USE_ALIAS=0
STRICT=0
ONLY_MODULES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --use-alias)   USE_ALIAS=1 ;;
    --strict)      STRICT=1 ;;
    --module)      ONLY_MODULES+=("$2"); shift ;;
    -h|--help)
      sed -n '1,30p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

if [[ "$ALLOW_DIRTY" -eq 0 && -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree not clean. Commit/stash, or pass --allow-dirty." >&2
  git status --short
  exit 1
fi

# Module table
MODULES=(
  "dashboard|Dashboard"
  "customers|Customers"
  "notifications|Notifications"
  "activity-log|ActivityLog"
  "settings|Settings"
  "backup|Backup"
  "user-admin|UserAdmin"
)

# Helpers (mirror the detector) ------------------------------------------------
is_shim_b3() { [[ -f "$1" ]] && grep -q "Phase B-3 compat shim" "$1" 2>/dev/null; }
is_stub_b1() { [[ -f "$1" ]] && grep -q "TODO Phase B-" "$1" 2>/dev/null; }

discover_page_old() {
  local NAME="$1" SLUG="$2"
  local cands=(
    "src/pages/${NAME}.jsx" "src/pages/${NAME}.js" "src/pages/${NAME}.tsx" "src/pages/${NAME}.ts"
    "src/pages/${SLUG}.jsx" "src/pages/${SLUG}.js"
    "src/pages/${SLUG}/index.jsx" "src/pages/${SLUG}/index.js"
    "src/pages/${NAME}/index.jsx" "src/pages/${NAME}/index.js"
  )
  for c in "${cands[@]}"; do [[ -f "$c" ]] && { echo "$c"; return; }; done
  echo ""
}

discover_page_new_existing() {
  local NAME="$1" SLUG="$2"
  local cands=(
    "src/modules/${SLUG}/pages/${NAME}.jsx" "src/modules/${SLUG}/pages/${NAME}.js"
    "src/modules/${SLUG}/pages/index.jsx" "src/modules/${SLUG}/pages/index.js"
  )
  for c in "${cands[@]}"; do [[ -f "$c" ]] && { echo "$c"; return; }; done
  echo ""
}

discover_component_files() {
  local SLUG="$1" NAME="$2"
  for d in "src/components/${SLUG}" "src/components/${NAME}"; do
    [[ -d "$d" ]] && find "$d" -type f \( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) 2>/dev/null
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

# Relative path from OLD's dir to NEW (without extension)
relative_target() {
  local OLD="$1" NEW="$2"
  python3 - "$OLD" "$NEW" <<'PY'
import os, sys
old, new = sys.argv[1], sys.argv[2]
rel = os.path.relpath(new, os.path.dirname(old))
# strip extension
rel, _ = os.path.splitext(rel)
# strip trailing /index
if rel.endswith('/index'): rel = rel[:-len('/index')]
# ensure relative-style starts with ./ or ../
if not rel.startswith('.'): rel = './' + rel
print(rel)
PY
}

alias_target() {
  # NEW like src/modules/customers/pages/Customers.jsx -> @modules/customers/pages/Customers
  local NEW="$1"
  local stripped="${NEW#src/}"
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
  if [[ "$USE_ALIAS" -eq 1 ]]; then alias_target "$2"; else relative_target "$1" "$2"; fi
}

# Decide shim KIND from file extension and contents (best-effort)
# Default: default_named (pages/components usually have a default export)
# .css files: no JS shim — handled separately
infer_kind() {
  local F="$1"
  case "$F" in
    *.css) echo "css" ;;
    *)
      # peek into the file to see if it has a default export
      if grep -qE "export default" "$F" 2>/dev/null; then echo "default_named"; else echo "named"; fi
      ;;
  esac
}

shim_body() {
  local OLD="$1" NEW="$2" KIND="$3"
  local TGT; TGT="$(shim_target "$OLD" "$NEW")"
  case "$KIND" in
    named)
      printf "// Phase B-3 compat shim. Real file lives at %s.\nexport * from '%s';\n" "$TGT" "$TGT" ;;
    default)
      printf "// Phase B-3 compat shim. Real file lives at %s.\nexport { default } from '%s';\n" "$TGT" "$TGT" ;;
    default_named)
      printf "// Phase B-3 compat shim. Real file lives at %s.\nexport { default } from '%s';\nexport * from '%s';\n" "$TGT" "$TGT" "$TGT" ;;
    css)
      # CSS re-import shim (the original consumers usually 'import "./X.css"')
      printf "/* Phase B-3 compat shim. Real file lives at %s.css */\n@import '%s.css';\n" "$TGT" "$TGT" ;;
  esac
}

run_build() {
  if [[ "$SKIP_BUILD" -eq 1 ]]; then echo "  (--skip-build set)"; return 0; fi
  echo "  Running: npm run build"
  npm run build --silent
}

want_module() {
  [[ ${#ONLY_MODULES[@]} -eq 0 ]] && return 0
  local SLUG="$1"
  for m in "${ONLY_MODULES[@]}"; do [[ "$m" == "$SLUG" ]] && return 0; done
  return 1
}

# Per-module migrate ----------------------------------------------------------
migrate_module() {
  local SLUG="$1" NAME="$2"
  echo ""
  echo "============== Module: $SLUG ($NAME) =============="
  want_module "$SLUG" || { echo "  (skipped — not in --module filter)"; return 0; }

  # Discover files
  local PAGE_OLD; PAGE_OLD="$(discover_page_old "$NAME" "$SLUG")"
  local PAGE_NEW_ACTUAL; PAGE_NEW_ACTUAL="$(discover_page_new_existing "$NAME" "$SLUG")"
  local PAGE_NEW_CANON="src/modules/${SLUG}/pages/${NAME}.jsx"

  local -a PLAN=()         # entries: "OLD|NEW|KIND"
  local -a BLOCKERS=()

  # Page step
  if [[ -n "$PAGE_OLD" ]]; then
    local PAGE_NEW="${PAGE_NEW_ACTUAL:-$PAGE_NEW_CANON}"
    local STATE; STATE="$(classify_file "$PAGE_OLD" "$PAGE_NEW")"
    printf "  page:  %-50s -> %-50s  %s\n" "$PAGE_OLD" "$PAGE_NEW" "$STATE"
    case "$STATE" in
      DONE|ABSENT) ;;
      TODO_FRESH_MOVE|TODO_REPLACE_STUB)
        local KIND; KIND="$(infer_kind "$PAGE_OLD")"
        PLAN+=("$PAGE_OLD|$PAGE_NEW|$KIND") ;;
      MOVED_NO_SHIM)
        local KIND; KIND="$(infer_kind "$PAGE_NEW")"
        PLAN+=("$PAGE_OLD|$PAGE_NEW|$KIND|SHIM_ONLY") ;;
      *) BLOCKERS+=("page:$PAGE_OLD($STATE)") ;;
    esac
  else
    echo "  page:  (none discovered for $NAME)"
  fi

  # Component files
  mapfile -t COMPS < <(discover_component_files "$SLUG" "$NAME")
  for f in "${COMPS[@]}"; do
    [[ -z "$f" ]] && continue
    local rel="${f#src/components/}"
    rel="${rel#${SLUG}/}"; rel="${rel#${NAME}/}"
    local NEW="src/modules/${SLUG}/components/${rel}"
    local STATE; STATE="$(classify_file "$f" "$NEW")"
    printf "  comp:  %-50s -> %-50s  %s\n" "$f" "$NEW" "$STATE"
    case "$STATE" in
      DONE|ABSENT) ;;
      TODO_FRESH_MOVE|TODO_REPLACE_STUB)
        local KIND; KIND="$(infer_kind "$f")"
        PLAN+=("$f|$NEW|$KIND") ;;
      MOVED_NO_SHIM)
        local KIND; KIND="$(infer_kind "$NEW")"
        PLAN+=("$f|$NEW|$KIND|SHIM_ONLY") ;;
      *) BLOCKERS+=("comp:$f($STATE)") ;;
    esac
  done

  # Blocker handling
  if [[ ${#BLOCKERS[@]} -gt 0 ]]; then
    echo "  ⚠ BLOCKERS:"
    printf '    %s\n' "${BLOCKERS[@]}"
    echo "  → skipping module ($SLUG) until blockers are resolved."
    return 2  # 2 = blocker
  fi

  if [[ ${#PLAN[@]} -eq 0 ]]; then
    echo "  ✓ Nothing to do (module already migrated)."
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [dry-run] Would perform ${#PLAN[@]} step(s):"
    for s in "${PLAN[@]}"; do echo "    $s"; done
    return 0
  fi

  # Save HEAD for rollback
  local SAVED_HEAD; SAVED_HEAD="$(git rev-parse HEAD)"
  local CREATED_DIRS=()

  echo "  Applying ${#PLAN[@]} step(s)..."
  local step
  for step in "${PLAN[@]}"; do
    IFS='|' read -r OLD NEW KIND MODE <<<"$step"
    mkdir -p "$(dirname "$NEW")"
    CREATED_DIRS+=("$(dirname "$NEW")")

    if [[ "${MODE:-}" == "SHIM_ONLY" ]]; then
      # OLD doesn't exist on disk; build shim there
      mkdir -p "$(dirname "$OLD")"
      shim_body "$OLD" "$NEW" "$KIND" > "$OLD"
      git add "$OLD"
      echo "    shim only: $OLD -> $NEW"
      continue
    fi

    # If NEW is a B-1 stub, remove it before moving real file in
    if [[ -f "$NEW" ]] && is_stub_b1 "$NEW"; then
      git rm -f "$NEW" >/dev/null
      # git rm removes the file AND any now-empty parent dirs — recreate the parent
      mkdir -p "$(dirname "$NEW")"
    fi
    # Hard-fail on git mv error so we don't end up with a half-migrated module
    if ! git mv "$OLD" "$NEW"; then
      echo "  ✗ git mv failed: $OLD -> $NEW — rolling back module"
      git reset --hard "$SAVED_HEAD" --quiet
      for d in "${CREATED_DIRS[@]}"; do rmdir "$d" 2>/dev/null || true; done
      return 1
    fi
    shim_body "$OLD" "$NEW" "$KIND" > "$OLD"
    git add "$OLD" "$NEW"
    echo "    moved:     $OLD -> $NEW   (shim KIND=$KIND)"
  done

  # Build
  if ! run_build; then
    echo "  ✗ Build failed for module $SLUG — rolling back."
    git reset --hard "$SAVED_HEAD" --quiet
    # Clean up dirs we created if now empty
    for d in "${CREATED_DIRS[@]}"; do rmdir "$d" 2>/dev/null || true; done
    if [[ "$STRICT" -eq 1 ]]; then
      echo "  --strict set; stopping."
      return 3
    fi
    return 1
  fi

  git commit -m "refactor(phase-b3): migrate $SLUG module with compat shims" --quiet
  echo "  ✓ committed: $SLUG ($(git rev-parse --short HEAD))"
  return 0
}

# Main loop -------------------------------------------------------------------
echo "Phase B-3 Batch 1 migration — $(if [[ $USE_ALIAS -eq 1 ]]; then echo 'ALIAS'; else echo 'RELATIVE'; fi) shims"
[[ "$DRY_RUN" -eq 1 ]] && echo "(dry-run)"
[[ ${#ONLY_MODULES[@]} -gt 0 ]] && echo "(filter: ${ONLY_MODULES[*]})"

ANY_BLOCKER=0
ANY_FAIL=0
ANY_DONE=0
for entry in "${MODULES[@]}"; do
  SLUG="${entry%%|*}"; NAME="${entry#*|}"
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
done

echo ""
echo "================ Result ================"
echo "modules processed OK   : $ANY_DONE"
echo "modules with blockers  : $ANY_BLOCKER"
echo "modules with build err : $ANY_FAIL"

if [[ $ANY_BLOCKER -gt 0 || $ANY_FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
