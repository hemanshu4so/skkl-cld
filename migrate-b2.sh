#!/usr/bin/env bash
# Phase B-2 migration: move app shell + shared with compat shims.
# Run from the repo root. Requires a clean working tree.
# Each move = one commit. Build verified after each.

set -euo pipefail

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree not clean. Commit or stash first." >&2
  exit 1
fi

# Ensure scaffold from Phase B-1 is in place
for d in src/app src/shared src/firebase src/config; do
  [[ -d "$d" ]] || { echo "ERROR: Phase B-1 scaffold missing ($d). Apply scaffold first." >&2; exit 1; }
done

# git mv + shim + build + commit
move_with_shim() {
  local OLD="$1"
  local NEW="$2"
  local SHIM_BODY="$3"
  local LABEL="$4"

  [[ -f "$OLD" ]] || { echo "WARN: $OLD does not exist, skipping $LABEL"; return 0; }

  mkdir -p "$(dirname "$NEW")"

  # If a Phase B-1 stub exists at NEW, remove it first (it's a placeholder)
  if [[ -f "$NEW" ]]; then
    if grep -q "TODO Phase B-2" "$NEW" 2>/dev/null; then
      git rm -f "$NEW"
    else
      echo "ERROR: $NEW already exists and is not a B-1 stub. Aborting $LABEL." >&2
      exit 1
    fi
  fi

  git mv "$OLD" "$NEW"
  echo "$SHIM_BODY" > "$OLD"
  git add "$OLD" "$NEW"

  npm run build --silent
  git commit -m "refactor(phase-b2): move $LABEL with compat shim"
  echo "✓ $LABEL"
}

# 1. safe.js
move_with_shim \
  "src/lib/safe.js" \
  "src/shared/safe/index.js" \
  "// Phase B-2 compat shim. Real file lives at @shared/safe.
export * from '@shared/safe';" \
  "shared/safe (safe.js)"

# 2. SafePage
move_with_shim \
  "src/components/SafePage.jsx" \
  "src/shared/safe/SafePage.jsx" \
  "// Phase B-2 compat shim. Real file lives at @shared/safe/SafePage.
export { default } from '@shared/safe/SafePage';
export * from '@shared/safe/SafePage';" \
  "shared/safe/SafePage"

# 3. useSafeSnapshot
move_with_shim \
  "src/hooks/useSafeSnapshot.js" \
  "src/shared/safe/useSafeSnapshot.js" \
  "// Phase B-2 compat shim. Real file lives at @shared/safe/useSafeSnapshot.
export { default } from '@shared/safe/useSafeSnapshot';
export * from '@shared/safe/useSafeSnapshot';" \
  "shared/safe/useSafeSnapshot"

# 4. pin.js
move_with_shim \
  "src/utils/pin.js" \
  "src/shared/pin/index.js" \
  "// Phase B-2 compat shim. Real file lives at @shared/pin.
export * from '@shared/pin';" \
  "shared/pin"

# 5. firebase.js
move_with_shim \
  "src/firebase.js" \
  "src/firebase/client.js" \
  "// Phase B-2 compat shim. Real file lives at @firebase/client.
export * from '@firebase/client';" \
  "firebase/client"

# 6. AuthContext -> AuthProvider
move_with_shim \
  "src/context/AuthContext.jsx" \
  "src/app/providers/AuthProvider.jsx" \
  "// Phase B-2 compat shim. Real file lives at @app/providers/AuthProvider.
// Old name 'AuthContext' is preserved as a named re-export for legacy imports.
export * from '@app/providers/AuthProvider';" \
  "app/providers/AuthProvider"

# 7. Sidebar
move_with_shim \
  "src/components/Sidebar.jsx" \
  "src/app/layout/Sidebar.jsx" \
  "// Phase B-2 compat shim. Real file lives at @app/layout/Sidebar.
export { default } from '@app/layout/Sidebar';
export * from '@app/layout/Sidebar';" \
  "app/layout/Sidebar"

# 8. Topbar
move_with_shim \
  "src/components/Topbar.jsx" \
  "src/app/layout/Topbar.jsx" \
  "// Phase B-2 compat shim. Real file lives at @app/layout/Topbar.
export { default } from '@app/layout/Topbar';
export * from '@app/layout/Topbar';" \
  "app/layout/Topbar"

# 9. App.js -> app/App.jsx (rename + extension change)
if [[ -f "src/App.js" ]]; then
  if [[ -f "src/app/App.jsx" ]] && grep -q "TODO Phase B-2" "src/app/App.jsx" 2>/dev/null; then
    git rm -f "src/app/App.jsx"
  fi
  mkdir -p src/app
  git mv "src/App.js" "src/app/App.jsx"
  cat > "src/App.js" <<'SHIM'
// Phase B-2 compat shim. Real file lives at @app/App.
// Kept so legacy `import App from './App'` in src/index.js continues working.
export { default } from '@app/App';
SHIM
  git add "src/App.js" "src/app/App.jsx"
  npm run build --silent
  git commit -m "refactor(phase-b2): move App.js with compat shim"
  echo "✓ app/App"
fi

echo ""
echo "Phase B-2 migration complete. 9 commits on current branch."
git log --oneline -n 9
