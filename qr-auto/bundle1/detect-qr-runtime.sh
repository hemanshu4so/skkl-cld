#!/usr/bin/env bash
# detect-qr-runtime.sh — READ-ONLY. Discovers auth hook, firebase db export, and the
# Inventory save flow. Writes qr-integration.config.json + prints a report. Changes nothing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run inside a git repo." >&2; exit 2; }

python3 - <<'PY'
import os, re, glob, json
ROOT=os.getcwd(); SRC=os.path.join(ROOT,"src")
def rel(p): return os.path.relpath(p,ROOT)
def read(p):
    try: return open(p,encoding="utf-8",errors="ignore").read()
    except: return ""
def srcfiles(*exts):
    o=[]
    for e in (exts or ("js","jsx","ts","tsx")):
        o+=glob.glob(f"{SRC}/**/*.{e}",recursive=True)
    return o

def alias_for(path):
    r=rel(path)
    r=re.sub(r"\.(jsx|js|tsx|ts)$","",r)
    for pre,al in (("src/app/","@app/"),("src/shared/","@shared/"),
                   ("src/firebase/","@firebase/"),("src/config/","@config/"),
                   ("src/modules/","@modules/")):
        if r.startswith(pre): return al+r[len(pre):]
    return None

cfg={"auth":{},"firebase":{},"inventory":{},"notes":[]}

# ---- AUTH: find the hook that exposes shop/user ----
auth_file=None; auth_hook=None; auth_export="named"
cands=[]
for f in srcfiles():
    c=read(f)
    if re.search(r"export\s+(?:async\s+)?function\s+useAuth\b", c) or \
       re.search(r"export\s+const\s+useAuth\s*=", c) or \
       re.search(r"export\s*\{[^}]*\buseAuth\b", c):
        cands.append((f,"useAuth"))
# prefer canonical provider path
def score(t):
    f=t[0]; s=0
    if "providers/AuthProvider" in f: s+=5
    if "/app/" in f: s+=2
    if "context" in f.lower(): s+=1
    return s
cands.sort(key=score, reverse=True)
if cands:
    auth_file,auth_hook=cands[0]
    al=alias_for(auth_file)
    cfg["auth"]={"file":rel(auth_file),"hook":auth_hook,
                 "import": al or ("./"+rel(auth_file)),
                 "alias_available": bool(al)}
    # peek fields exposed
    c=read(auth_file)
    fields=set(re.findall(r"\b(shopId|user|uid|currentUser|employeeId|employee|shop|role)\b", c))
    cfg["auth"]["fields_seen"]=sorted(fields)
else:
    cfg["notes"].append("No useAuth hook found — adapter will resolve auth defensively at runtime; set auth.import manually if needed.")

# ---- FIREBASE: find db export ----
db_file=None
for f in srcfiles("js","jsx","ts","tsx"):
    c=read(f)
    if re.search(r"export\s+const\s+db\b", c) or re.search(r"export\s*\{[^}]*\bdb\b", c):
        # prefer firebase/client
        if "firebase/client" in f or f.endswith("/firebase.js") or "/firebase/" in f:
            db_file=f; break
        if db_file is None: db_file=f
if db_file:
    al=alias_for(db_file)
    cfg["firebase"]={"file":rel(db_file),"import": al or ("./"+rel(db_file)),"name":"db","alias_available":bool(al)}
else:
    cfg["notes"].append("No `export const db` found — set firebase.import manually.")

# ---- INVENTORY page + save flow ----
inv_files=[f for f in glob.glob(f"{SRC}/modules/inventory/pages/*.jsx")] + \
          [f for f in glob.glob(f"{SRC}/modules/inventory/pages/*.js")]
# also legacy
inv_files+= [f for f in glob.glob(f"{SRC}/pages/Inventory.*")]
inv_files=[f for f in inv_files if os.path.exists(f)]
chosen=None; best=None
for f in inv_files:
    c=read(f)
    # find addDoc/setDoc with a collection literal
    for m in re.finditer(r"(await\s+)?(addDoc|setDoc)\s*\(\s*(?:doc\(\s*)?collection\(\s*\w+\s*,\s*['\"]([a-zA-Z_]+)['\"]\s*\)[^\n]*", c):
        coll=m.group(3)
        if coll in ("products","inventory","items","stock"):
            # find enclosing function name
            start=m.start()
            head=c[:start]
            fn=re.findall(r"(?:async\s+)?function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>", head)
            handler=None
            if fn:
                last=fn[-1]; handler=last[0] or last[1]
            # payload var = 2nd arg of addDoc/setDoc
            arg=re.search(r"(?:addDoc|setDoc)\s*\(\s*(?:doc\(\s*)?collection\([^)]*\)\s*(?:\)\s*)?,\s*([A-Za-z_]\w*)", c[start:start+400])
            payload=arg.group(1) if arg else None
            line=c[start:].splitlines()[0].strip()
            cand={"pageFile":rel(f),"saveHandler":handler,"productCollection":coll,
                  "anchorLine":line,"payloadVar":payload}
            # prefer products/inventory over items
            rank = {"products":3,"inventory":3,"stock":2,"items":1}.get(coll,0)
            if best is None or rank>best:
                best=rank; chosen=cand
if chosen:
    cfg["inventory"]=chosen
else:
    cfg["notes"].append("Could not locate an Inventory save (addDoc/setDoc to products/inventory). Wiring will STOP and emit manual instructions.")

open("qr-integration.config.json","w").write(json.dumps(cfg,indent=2))

# ---- report ----
print("QR runtime detection")
print("="*60)
print(json.dumps(cfg,indent=2))
print("="*60)
ok = bool(cfg.get("auth")) and bool(cfg.get("firebase")) and bool(cfg.get("inventory"))
print("config written: qr-integration.config.json")
print("readiness:", "OK — run generate-qr-adapter.sh" if ok else "PARTIAL — review notes above")
PY
