#!/usr/bin/env bash
# Phase B-9 — Final cleanup: rewrite consumers, delete shims, add eslint, update docs.
# Mac bash 3.2 compatible (heavy lifting delegated to python3).
#
# Stages (run in this order by default):
#   1. rewrite  — rewrite each consumer's shim imports to @alias paths. One commit per file.
#   2. delete   — git rm all rewritable shims (NOT barcode-SKIP shims). One commit.
#   3. eslint   — add import/no-restricted-paths rule. One commit.
#   4. docs     — refresh docs/ai-memory/MASTER_PROJECT_ARCHITECTURE.md. One commit.
#
# Build is run after every commit. On build failure the step is reverted (git reset --hard
# to the pre-step HEAD) and the script stops.
#
# Barcode Recovery Pass: shims under barcode are NEVER touched (TagCanvas/code128/qr/
# barcodeTemplate/BarcodeDesigner). They're carried untouched into the Recovery Pass.
#
# Flags:
#   --stage rewrite|delete|eslint|docs|all   (default: all)
#   --dry-run        show plan, change nothing
#   --skip-build     skip 'npm run build' between commits
#   --allow-dirty    proceed with uncommitted changes
#   --strict         stop on first build failure (delete/eslint/docs always stop)

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

STAGE="all"; DRY_RUN=0; SKIP_BUILD=0; ALLOW_DIRTY=0; STRICT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --stage) STAGE="$2"; shift ;;
    --dry-run) DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --strict) STRICT=1 ;;
    -h|--help) sed -n '1,30p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ $ALLOW_DIRTY -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree not clean. Commit/stash, or pass --allow-dirty." >&2
  git status --short; exit 1
fi

run_build() {
  if [ $SKIP_BUILD -eq 1 ]; then echo "  (--skip-build set)"; return 0; fi
  echo "  Running: npm run build"
  npm run build --silent
}

# Emit the rewrite plan as TSV lines: consumer_rel \t json_edits
# Each edit: old_import -> alias. Barcode-SKIP imports excluded.
emit_plan() {
python3 - <<'PY'
import os, re, glob, json
ROOT=os.getcwd(); SRC=os.path.join(ROOT,"src")
SKIP_SHIMS={"src/lib/code128.js","src/lib/qr.js","src/lib/barcodeTemplate.js",
            "src/components/barcode/TagCanvas.jsx","src/pages/BarcodeDesigner.jsx"}
EXTS=("",".js",".jsx",".ts",".tsx","/index.js","/index.jsx","/index.ts","/index.tsx")
def rel(p): return os.path.relpath(p,ROOT)
def srcfiles():
    o=[]
    for e in ("js","jsx","ts","tsx"): o+=glob.glob(f"{SRC}/**/*.{e}",recursive=True)
    return o
def is_shim(p):
    try: c=open(p,encoding="utf-8",errors="ignore").read()
    except: return False
    return "compat shim" in c and re.search(r"Phase B-\d+ compat shim",c)
def tgt(shim):
    c=open(shim,encoding="utf-8",errors="ignore").read()
    m=re.search(r"from\s+['\"]([^'\"]+)['\"]",c) or re.search(r"@import\s+['\"]([^'\"]+)['\"]",c)
    if not m: return None
    d=os.path.dirname(os.path.abspath(shim))
    for e in EXTS:
        cand=os.path.normpath(os.path.join(d,m.group(1)+e))
        if os.path.exists(cand): return cand
    return None
AM=[("src/modules/","@modules/"),("src/shared/","@shared/"),("src/app/","@app/"),
    ("src/firebase/","@firebase/"),("src/config/","@config/"),("src/assets/","@assets/")]
def alias(ap):
    if not ap: return None
    r=rel(ap)
    for pre,al in AM:
        if r.startswith(pre):
            t=re.sub(r"\.(jsx|js|tsx|ts)$","",r[len(pre):]); t=re.sub(r"/index$","",t); return al+t
    return None
shims={}
for f in srcfiles():
    if is_shim(f):
        shims[os.path.abspath(f)]={"rel":rel(f),"alias":alias(tgt(f)),"skip":rel(f) in SKIP_SHIMS}
plan={}
for f in srcfiles():
    fa=os.path.abspath(f)
    if fa in shims: continue
    try: c=open(f,encoding="utf-8",errors="ignore").read()
    except: continue
    d=os.path.dirname(fa); edits=[]
    for m in re.finditer(r"from\s+['\"]([^'\"]+)['\"]|import\s+['\"]([^'\"]+)['\"]",c):
        imp=m.group(1) or m.group(2)
        if not imp or imp.startswith("@") or not imp.startswith("."): continue
        for e in EXTS:
            res=os.path.normpath(os.path.join(d,imp+e))
            if res in shims:
                sh=shims[res]
                if not sh["skip"] and sh["alias"]:
                    edits.append([imp,sh["alias"]])
                break
    if edits:
        plan[rel(f)]=edits
for cf in sorted(plan):
    print(cf+"\t"+json.dumps(plan[cf]))
PY
}

# Rewrite a single file's imports given JSON edits
rewrite_file() {
  CF="$1"; EDITS_JSON="$2"
  CF="$CF" EDITS="$EDITS_JSON" python3 - <<'PY'
import os, json, re
cf=os.environ["CF"]; edits=json.loads(os.environ["EDITS"])
c=open(cf,encoding="utf-8").read()
for old,alias in edits:
    # Replace the exact quoted import string, both ' and "
    c=re.sub(r"(['\"])"+re.escape(old)+r"\1", lambda m: m.group(1)+alias+m.group(1), c)
open(cf,"w",encoding="utf-8").write(c)
PY
}

# ---------------- Stage 1: rewrite ----------------
stage_rewrite() {
  echo ""
  echo "========== Stage 1: rewrite consumers =========="
  PLAN="$(emit_plan)"
  if [ -z "$PLAN" ]; then
    echo "  No consumers to rewrite. (All imports already point at aliases.)"
    return 0
  fi

  COUNT=$(printf '%s\n' "$PLAN" | wc -l | tr -d ' ')
  echo "  $COUNT consumer file(s) to rewrite."

  if [ $DRY_RUN -eq 1 ]; then
    printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read CF EDITS; do
      [ -z "$CF" ] && continue
      echo "  [dry-run] $CF"
      echo "$EDITS" | python3 -c "import sys,json; [print('      '+a+'  ->  '+b) for a,b in json.load(sys.stdin)]"
    done
    return 0
  fi

  printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read CF EDITS; do
    [ -z "$CF" ] && continue
    SAVED="$(git rev-parse HEAD)"
    rewrite_file "$CF" "$EDITS"
    git add "$CF"
    if ! run_build; then
      echo "  ✗ build failed after rewriting $CF — reverting"
      git reset --hard "$SAVED" --quiet
      [ $STRICT -eq 1 ] && { echo "  --strict: stopping"; exit 3; }
      # continue to next file (it stays un-rewritten)
      continue
    fi
    git commit -m "refactor(phase-b9): rewrite shim imports in $CF" --quiet
    echo "  ✓ $CF ($(git rev-parse --short HEAD))"
  done
}

# ---------------- Stage 2: delete shims ----------------
stage_delete() {
  echo ""
  echo "========== Stage 2: delete shims =========="
  # Verify no consumer still imports a shim before deleting
  REMAIN="$(emit_plan)"
  if [ -n "$REMAIN" ]; then
    echo "  ⚠ Consumers still import shims — run stage 'rewrite' first:"
    printf '%s\n' "$REMAIN" | cut -f1 | sed 's/^/    /'
    return 2
  fi

  SHIMS="$(python3 - <<'PY'
import os,re,glob
ROOT=os.getcwd(); SRC=os.path.join(ROOT,"src")
SKIP={"src/lib/code128.js","src/lib/qr.js","src/lib/barcodeTemplate.js",
      "src/components/barcode/TagCanvas.jsx","src/pages/BarcodeDesigner.jsx"}
def is_shim(p):
    try: c=open(p,encoding="utf-8",errors="ignore").read()
    except: return False
    return "compat shim" in c and re.search(r"Phase B-\d+ compat shim",c)
out=[]
for e in ("js","jsx","ts","tsx","css"):
    for f in glob.glob(f"{SRC}/**/*.{e}",recursive=True):
        r=os.path.relpath(f,ROOT)
        if is_shim(f) and r not in SKIP: out.append(r)
print("\n".join(sorted(out)))
PY
)"
  if [ -z "$SHIMS" ]; then echo "  No rewritable shims found (already deleted?)."; return 0; fi

  N=$(printf '%s\n' "$SHIMS" | wc -l | tr -d ' ')
  echo "  $N shim file(s) to delete (barcode shims excluded):"
  printf '%s\n' "$SHIMS" | sed 's/^/    /'
  [ $DRY_RUN -eq 1 ] && { echo "  [dry-run] not deleting"; return 0; }

  SAVED="$(git rev-parse HEAD)"
  printf '%s\n' "$SHIMS" | while read s; do [ -n "$s" ] && git rm -q "$s"; done
  if ! run_build; then
    echo "  ✗ build failed after deleting shims — reverting"
    git reset --hard "$SAVED" --quiet
    return 3
  fi
  git commit -m "refactor(phase-b9): remove Phase B-* compat shims (barcode shims retained)" --quiet
  echo "  ✓ shims removed ($(git rev-parse --short HEAD))"
}

# ---------------- Stage 3: eslint ----------------
stage_eslint() {
  echo ""
  echo "========== Stage 3: eslint import boundaries =========="
  [ $DRY_RUN -eq 1 ] && { echo "  [dry-run] would write .eslintrc.module-boundaries.json + reference it"; return 0; }
  SAVED="$(git rev-parse HEAD)"

  # Idempotency: if the config already exists and is committed unchanged, skip.
  if [ -f .eslintrc.module-boundaries.json ] && git ls-files --error-unmatch .eslintrc.module-boundaries.json >/dev/null 2>&1; then
    echo "  eslint config already present and tracked — nothing to do."
    return 0
  fi

  cat > .eslintrc.module-boundaries.json <<'EOF'
{
  "plugins": ["import"],
  "rules": {
    "import/no-restricted-paths": ["error", {
      "zones": [
        { "target": "./src/modules", "from": "./src/modules",
          "except": ["./index.js", "./index.jsx", "./routes.jsx"],
          "message": "Cross-module imports must go through the module's index.js, or via @shared/@firebase/@config." },
        { "target": "./src/shared",   "from": "./src/modules",
          "message": "shared/ must not depend on modules/." },
        { "target": "./src/firebase", "from": "./src/modules",
          "message": "firebase/ must not depend on modules/." },
        { "target": "./src/config",   "from": "./src/modules",
          "message": "config/ must not depend on modules/." }
      ]
    }]
  }
}
EOF
  git add .eslintrc.module-boundaries.json

  # If a root eslint config exists, leave a note for the dev to `extends` it.
  if [ -f .eslintrc.json ]; then
    echo "  NOTE: add \"./.eslintrc.module-boundaries.json\" to the 'extends' array in .eslintrc.json"
  elif [ -f .eslintrc.js ]; then
    echo "  NOTE: spread the rules from .eslintrc.module-boundaries.json into .eslintrc.js"
  fi

  if ! run_build; then
    echo "  ✗ build failed after eslint stage — reverting"
    git reset --hard "$SAVED" --quiet
    return 3
  fi
  git commit -m "feat(phase-b9): add import/no-restricted-paths module boundary rule" --quiet
  echo "  ✓ eslint rule added ($(git rev-parse --short HEAD))"
}

# ---------------- Stage 4: docs ----------------
stage_docs() {
  echo ""
  echo "========== Stage 4: update architecture doc =========="
  [ $DRY_RUN -eq 1 ] && { echo "  [dry-run] would refresh docs/ai-memory/MASTER_PROJECT_ARCHITECTURE.md"; return 0; }
  DOC="docs/ai-memory/MASTER_PROJECT_ARCHITECTURE.md"
  mkdir -p "$(dirname "$DOC")"
  SAVED="$(git rev-parse HEAD)"

  BEGIN="<!-- BEGIN phase-b9-layout -->"
  END="<!-- END phase-b9-layout -->"
  {
    echo "$BEGIN"
    echo "## Final module layout (Phase B-9 complete)"
    echo ""
    echo "Generated $(date -u +%FT%TZ)."
    echo ""
    echo '```'
    if command -v tree >/dev/null 2>&1; then
      tree -d -L 3 src/modules src/shared src/app src/firebase src/config 2>/dev/null
    else
      find src/modules -maxdepth 2 -type d 2>/dev/null | sort
      echo "..."
      find src/shared src/app src/firebase src/config -maxdepth 1 -type d 2>/dev/null | sort
    fi
    echo '```'
    echo ""
    echo "All compat shims removed (except Barcode Recovery Pass items). Imports use"
    echo "the @modules / @shared / @app / @firebase / @config aliases. Module boundaries"
    echo "enforced by eslint import/no-restricted-paths."
    echo "$END"
  } > /tmp/.b9_arch_section.$$

  if [ -f "$DOC" ] && grep -q "$BEGIN" "$DOC"; then
    # Replace the existing delimited section in place (idempotent) with awk splice
    SECTION_FILE="/tmp/.b9_arch_section.$$"
    awk -v b="$BEGIN" -v e="$END" -v f="$SECTION_FILE" '
      $0==b {inblk=1; while((getline line < f)>0) print line; next}
      $0==e {inblk=0; next}
      !inblk {print}
    ' "$DOC" > "$DOC.tmp" && mv "$DOC.tmp" "$DOC"
  elif [ -f "$DOC" ]; then
    printf '\n\n' >> "$DOC"
    cat /tmp/.b9_arch_section.$$ >> "$DOC"
  else
    cp /tmp/.b9_arch_section.$$ "$DOC"
  fi
  rm -f /tmp/.b9_arch_section.$$

  git add "$DOC"
  if git diff --cached --quiet -- "$DOC"; then
    echo "  architecture doc already up to date — nothing to commit."
    return 0
  fi
  git commit -m "docs(phase-b9): record final module layout after restructure" --quiet
  echo "  ✓ architecture doc updated ($(git rev-parse --short HEAD))"
}

echo "Phase B-9 — stage=$STAGE  $( [ $DRY_RUN -eq 1 ] && echo '(dry-run)')"
RC=0
case "$STAGE" in
  rewrite) stage_rewrite || RC=$? ;;
  delete)  stage_delete  || RC=$? ;;
  eslint)  stage_eslint  || RC=$? ;;
  docs)    stage_docs    || RC=$? ;;
  all)
    stage_rewrite || RC=$?
    [ $RC -eq 0 ] && { stage_delete || RC=$?; }
    [ $RC -eq 0 ] && { stage_eslint || RC=$?; }
    [ $RC -eq 0 ] && { stage_docs   || RC=$?; }
    ;;
  *) echo "Unknown stage: $STAGE" >&2; exit 2 ;;
esac

echo ""
echo "========== Phase B-9 result =========="
git log --oneline -n 12 | sed 's/^/  /'
exit $RC
