#!/usr/bin/env bash
# detect-auth-shape.sh — READ-ONLY. Parses the auth provider to report exactly what
# useAuth() exposes (user / currentUser / profile / session / shopId / uid / employeeId),
# and scans the repo for bare `auth.*` references that risk a runtime ReferenceError.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

python3 - <<'PY'
import os, re, glob, json
ROOT=os.getcwd(); SRC=os.path.join(ROOT,"src")
def read(p):
    try: return open(p,encoding="utf-8",errors="ignore").read()
    except: return ""
def rel(p): return os.path.relpath(p,ROOT)

# locate auth provider
auth_files=glob.glob(f"{SRC}/**/AuthProvider.*",recursive=True)+glob.glob(f"{SRC}/**/AuthContext.*",recursive=True)
auth_files=[f for f in auth_files if os.path.exists(f)]
exposed=set(); nesting={}
for f in auth_files:
    c=read(f)
    # provider value object: value={{ ... }}
    for m in re.finditer(r'value=\{\{([^}]*)\}\}', c):
        for k in re.findall(r'\b(\w+)\b\s*[:,}]', m.group(1)):
            exposed.add(k)
    # hook return object: return { ... }
    for m in re.finditer(r'useAuth[\s\S]{0,200}?return\s*\{([^}]*)\}', c):
        for k in re.findall(r'\b(\w+)\b', m.group(1)): exposed.add(k)
    # state shape hints
    for k in re.findall(r'\b(user|currentUser|profile|session|claims|shopId|uid|employeeId|employee|branchId|counterId|role)\b', c):
        exposed.add(k)

print("AUTH SHAPE DETECTION")
print("="*60)
print("provider files:", [rel(f) for f in auth_files] or "(none)")
print("keys/identifiers seen:", sorted(exposed))
likely = {
  "uid": [k for k in ["uid","currentUser","user","profile","session"] if k in exposed],
  "shopId": [k for k in ["shopId","profile","claims","session","user"] if k in exposed],
  "employeeId": [k for k in ["employeeId","employee","profile","user"] if k in exposed],
}
print("resolution sources (likely):", json.dumps(likely))
print()

# scan for bare auth.* ReferenceError risks
print("BARE `auth.` REFERENCE SCAN (runtime ReferenceError risk)")
print("="*60)
risks=[]
for ext in ("js","jsx","ts","tsx"):
    for f in glob.glob(f"{SRC}/**/*.{ext}",recursive=True):
        c=read(f)
        # has a bare `auth.` usage but no `auth` defined (no import auth, no const auth=, no param auth)
        if re.search(r'\bauth\.\w+', c):
            defined = bool(re.search(r'\b(const|let|var)\s+auth\b', c)) or \
                      bool(re.search(r'import\s+\{[^}]*\bauth\b[^}]*\}\s+from', c)) or \
                      bool(re.search(r'import\s+auth\s+from', c)) or \
                      bool(re.search(r'function\s+\w+\s*\([^)]*\bauth\b', c))
            if not defined:
                for i,line in enumerate(c.splitlines(),1):
                    if re.search(r'\bauth\.\w+', line):
                        qr = "QR-AUTO" in c
                        risks.append((rel(f), i, line.strip()[:90], qr))
if not risks:
    print("  none found.")
else:
    for (f,i,ln,qr) in risks:
        scope = "QR-owned (auto-fixable)" if qr else "your code (manual — will be reported only)"
        print(f"  {f}:{i}  [{scope}]")
        print(f"      {ln}")
print()
print("Next: ./patch-auth-runtime.sh  (hardens resolver, fixes QR-owned scope, reports the rest)")
PY
