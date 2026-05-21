#!/usr/bin/env bash
# Phase B-9 — Shim & consumer analyzer (READ-ONLY).
# Maps every "Phase B-N compat shim" file and every consumer that imports it,
# computing the @modules/@shared/@app/... alias each import should become.
#
# Mac bash 3.2 compatible (delegates parsing to python3). Always exits 0.
#
# Barcode Recovery Pass items are flagged SKIP and never counted as rewrite work.

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

python3 - <<'PY'
import os, re, glob

ROOT = os.getcwd()
SRC  = os.path.join(ROOT, "src")

# Barcode Recovery Pass — never rewrite/delete these shims in B-9
SKIP_SHIMS = {
    "src/lib/code128.js",
    "src/lib/qr.js",
    "src/lib/barcodeTemplate.js",
    "src/components/barcode/TagCanvas.jsx",
    "src/pages/BarcodeDesigner.jsx",
}

EXTS = ("", ".js", ".jsx", ".ts", ".tsx", "/index.jsx", "/index.jsxx", "/index.ts", "/index.tsx")

def rel(p): return os.path.relpath(p, ROOT)

def source_files():
    out = []
    for ext in ("js","jsx","ts","tsx"):
        out += glob.glob(f"{SRC}/**/*.{ext}", recursive=True)
    return out

def is_shim(path):
    try:
        c = open(path, encoding="utf-8", errors="ignore").read()
    except Exception:
        return False
    return ("compat shim" in c) and re.search(r"Phase B-\d+ compat shim", c) is not None

def shim_target_abs(shim):
    """Resolve the file the shim re-exports from."""
    c = open(shim, encoding="utf-8", errors="ignore").read()
    m = re.search(r"from\s+['\"]([^'\"]+)['\"]", c)
    if not m:
        m = re.search(r"@import\s+['\"]([^'\"]+)['\"]", c)  # css shim
    if not m:
        return None
    target = m.group(1)
    d = os.path.dirname(os.path.abspath(shim))
    for e in EXTS:
        cand = os.path.normpath(os.path.join(d, target + e))
        if os.path.exists(cand):
            return cand
    return os.path.normpath(os.path.join(d, target))

ALIAS_MAP = [
    ("src/modules/",  "@modules/"),
    ("src/shared/",   "@shared/"),
    ("src/app/",      "@app/"),
    ("src/firebase/", "@firebase/"),
    ("src/config/",   "@config/"),
    ("src/assets/",   "@assets/"),
]

def to_alias(abs_path):
    r = rel(abs_path)
    for pre, al in ALIAS_MAP:
        if r.startswith(pre):
            tail = r[len(pre):]
            tail = re.sub(r"\.(jsx|js|tsx|ts)$", "", tail)
            tail = re.sub(r"/index$", "", tail)
            return al + tail
    return None

# Build shim registry
shims = {}
for f in source_files():
    if is_shim(f):
        r = rel(f)
        tgt = shim_target_abs(f)
        alias = to_alias(tgt) if tgt else None
        shims[os.path.abspath(f)] = {"rel": r, "alias": alias, "skip": r in SKIP_SHIMS}

# Find consumers: any source file importing a path that resolves to a shim
consumers = {}  # consumer_rel -> list of (old_import, shim_rel, alias, skip)
for f in source_files():
    fa = os.path.abspath(f)
    if fa in shims:
        continue  # shims themselves handled separately
    try:
        c = open(f, encoding="utf-8", errors="ignore").read()
    except Exception:
        continue
    d = os.path.dirname(fa)
    for m in re.finditer(r"from\s+['\"]([^'\"]+)['\"]|import\s+['\"]([^'\"]+)['\"]", c):
        imp = m.group(1) or m.group(2)
        if not imp or imp.startswith("@") or not imp.startswith("."):
            continue
        for e in EXTS:
            resolved = os.path.normpath(os.path.join(d, imp + e))
            if resolved in shims:
                sh = shims[resolved]
                consumers.setdefault(rel(f), []).append((imp, sh["rel"], sh["alias"], sh["skip"]))
                break

# Report
print("Phase B-9 Shim & Consumer Analyzer")
print("Repo:", os.popen("git rev-parse --abbrev-ref HEAD").read().strip(), "@", os.popen("git rev-parse --short HEAD").read().strip())
print()
print("="*64)
print("  1. Shim inventory")
print("="*64)
active = [s for s in shims.values() if not s["skip"]]
skipped = [s for s in shims.values() if s["skip"]]
print(f"  total shims: {len(shims)}   rewritable: {len(active)}   barcode-SKIP: {len(skipped)}")
print()
for s in sorted(shims.values(), key=lambda x: x["rel"]):
    tag = "SKIP(barcode)" if s["skip"] else "->"
    print(f"  {s['rel']:<46} {tag} {s['alias'] or '(unresolved)'}")

print()
print("="*64)
print("  2. Consumers to rewrite")
print("="*64)
total_edits = 0
skip_edits = 0
for cf in sorted(consumers):
    rows = consumers[cf]
    print(f"\n  {cf}")
    for (imp, shrel, alias, skip) in rows:
        if skip:
            print(f"      SKIP  {imp:<40} (barcode shim {shrel})")
            skip_edits += 1
        elif alias is None:
            print(f"      WARN  {imp:<40} (could not resolve alias for {shrel})")
        else:
            print(f"      edit  {imp:<40} -> {alias}")
            total_edits += 1

print()
print("="*64)
print("  3. Summary")
print("="*64)
print(f"  consumer files to touch : {len([c for c in consumers if any(not r[3] and r[2] for r in consumers[c])])}")
print(f"  import edits (rewritable): {total_edits}")
print(f"  import edits (barcode-SKIP): {skip_edits}")
print(f"  shims to delete after rewrite: {len(active)}")
print()
print("  Next: ./migrate-b9.sh --dry-run, then ./migrate-b9.sh")
PY
