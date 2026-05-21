#!/usr/bin/env bash
# Barcode Recovery — READ-ONLY diagnostic. Changes nothing.
# Surfaces the current barcode state so you can plan the recovery safely:
#   1. Module files present/intact (code128, qr, barcodeTemplate, TagCanvas, BarcodeDesigner)
#   2. Retained barcode shims (the 5 from B-9 SKIP list)
#   3. "Disabled" markers (TagCanvas stubbed, side preview off, inventory tag preview bypassed)
#   4. Who imports the barcode pieces, and whether each import resolves
#   5. Broken / dangling imports
#
# Mac bash 3.2 compatible (parsing via python3). Always exits 0.

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

python3 - <<'PY'
import os, re, glob
ROOT=os.getcwd(); SRC=os.path.join(ROOT,"src")
def rel(p): return os.path.relpath(p,ROOT)
EXTS=("",".js",".jsx",".ts",".tsx","/index.js","/index.jsx")

def srcfiles():
    o=[]
    for e in ("js","jsx","ts","tsx"): o+=glob.glob(f"{SRC}/**/*.{e}",recursive=True)
    return o

def read(p):
    try: return open(p,encoding="utf-8",errors="ignore").read()
    except: return ""

# Canonical module locations (post-B9)
MOD = {
  "code128":        "src/modules/barcode/lib/code128.js",
  "qr":             "src/modules/barcode/lib/qr.js",
  "barcodeTemplate":"src/modules/barcode/lib/barcodeTemplate.js",
  "TagCanvas":      "src/modules/barcode/components/TagCanvas.jsx",
  "BarcodeDesigner":"src/modules/barcode/pages/BarcodeDesigner.jsx",
}
# Retained shims (B-9 SKIP list — old paths)
SHIMS = [
  "src/lib/code128.js",
  "src/lib/qr.js",
  "src/lib/barcodeTemplate.js",
  "src/components/barcode/TagCanvas.jsx",
  "src/pages/BarcodeDesigner.jsx",
]

print("Barcode Recovery — Diagnostic (READ-ONLY)")
print("Repo:", os.popen("git rev-parse --abbrev-ref HEAD").read().strip(),
      "@", os.popen("git rev-parse --short HEAD").read().strip())
print()

# ── 1. Module files ───────────────────────────────────────────────
print("="*64); print("  1. Canonical module files"); print("="*64)
for name, path in MOD.items():
    p = os.path.join(ROOT, path)
    if os.path.exists(p):
        c = read(p)
        size = len(c.splitlines())
        # Detect stubs/disabled markers
        flags = []
        if re.search(r"return null\s*;?\s*//?.*(disabled|stub|temporar)", c, re.I): flags.append("STUB?")
        if re.search(r"DISABLED|TEMP(ORARILY)?|TODO.*restore|RECOVERY", c, re.I): flags.append("MARKER")
        if name=="TagCanvas" and re.search(r"export default function\s+\w+\s*\([^)]*\)\s*\{\s*return null", c): flags.append("RETURNS-NULL")
        tag = ("  ["+", ".join(flags)+"]") if flags else ""
        print(f"  ✓ {path}  ({size} lines){tag}")
    else:
        print(f"  ✗ MISSING: {path}")

# ── 2. Retained shims ─────────────────────────────────────────────
print(); print("="*64); print("  2. Retained barcode shims (B-9 SKIP list)"); print("="*64)
for s in SHIMS:
    p=os.path.join(ROOT,s)
    if os.path.exists(p):
        c=read(p)
        m=re.search(r"from\s+['\"]([^'\"]+)['\"]", c) or re.search(r"@import\s+['\"]([^'\"]+)['\"]", c)
        tgt=m.group(1) if m else "(no re-export found)"
        isshim = "compat shim" in c
        print(f"  {'shim' if isshim else 'FILE'}: {s}  ->  {tgt}")
    else:
        print(f"  (absent): {s}")

# ── 3. Disabled markers across the codebase ───────────────────────
print(); print("="*64); print("  3. Disable / bypass markers"); print("="*64)
pat = re.compile(r"(TagCanvas|tag\s*preview|side\s*preview|barcode preview|ENABLE_TAG|SHOW_PREVIEW|PREVIEW_DISABLED|disabled)", re.I)
hits=0
for f in srcfiles():
    c=read(f)
    for i,line in enumerate(c.splitlines(),1):
        if pat.search(line) and re.search(r"disabled|temporar|bypass|TODO|FIXME|preview", line, re.I):
            print(f"  {rel(f)}:{i}: {line.strip()[:100]}")
            hits+=1
if hits==0:
    print("  (no obvious disable markers found — preview may be removed rather than flagged)")

# ── 4. Importers of each barcode piece + resolution ───────────────
print(); print("="*64); print("  4. Importers of barcode pieces (and resolution)"); print("="*64)
aliases = {
  "@modules/barcode/lib/code128":        MOD["code128"],
  "@modules/barcode/lib/qr":             MOD["qr"],
  "@modules/barcode/lib/barcodeTemplate":MOD["barcodeTemplate"],
  "@modules/barcode/components/TagCanvas":MOD["TagCanvas"],
  "@modules/barcode/pages/BarcodeDesigner":MOD["BarcodeDesigner"],
}
def resolves(importer, imp):
    # alias?
    for a in aliases:
        if imp==a or imp.startswith(a):
            return os.path.exists(os.path.join(ROOT, aliases[a]))
    # relative?
    if imp.startswith("."):
        d=os.path.dirname(os.path.abspath(importer))
        for e in EXTS:
            if os.path.exists(os.path.normpath(os.path.join(d,imp+e))):
                return True
        return False
    return True  # bare package import — assume resolvable

barcode_kw = re.compile(r"barcode|code128|TagCanvas|BarcodeDesigner|barcodeTemplate|/qr['\"]")
for f in srcfiles():
    c=read(f)
    for m in re.finditer(r"(?:from|import)\s+['\"]([^'\"]+)['\"]", c):
        imp=m.group(1)
        if barcode_kw.search(imp):
            ok = resolves(f, imp)
            mark = "OK " if ok else "BROKEN"
            print(f"  [{mark}] {rel(f)}  imports  {imp}")

# ── 5. Summary ────────────────────────────────────────────────────
print(); print("="*64); print("  5. Recovery readiness"); print("="*64)
missing=[p for p in MOD.values() if not os.path.exists(os.path.join(ROOT,p))]
shims_present=[s for s in SHIMS if os.path.exists(os.path.join(ROOT,s))]
print(f"  missing module files : {len(missing)}")
for m in missing: print(f"      - {m}")
print(f"  retained shims       : {len(shims_present)}")
print()
print("  → Read BARCODE_RECOVERY_PLAN.md and follow steps in order.")
print("  → Do NOT delete any shim until its consumers import the module path AND build is green.")
PY
