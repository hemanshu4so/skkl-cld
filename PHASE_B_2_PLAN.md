# Phase B-2 — Move app shell + shared (compat re-export shims)

**Hard rules — never violated:**
1. Files move using `git mv` (preserves blame).
2. The OLD path becomes a thin **re-export shim** that re-exports everything from the NEW path.
3. Existing imports in the codebase continue to resolve without any edit.
4. `npm run build` must pass after every step.
5. **One commit per migration step.** If a step has subfiles, each subfile is its own commit.
6. Shims live for the duration of Phase B-3 and are deleted in Phase B-4 once all consumers point to the new path.

## Files moved in B-2 (9 steps, 9 commits)

| # | Old path                             | New path                                 |
|---|--------------------------------------|------------------------------------------|
| 1 | `src/lib/safe.js`                    | `src/shared/safe/index.js`               |
| 2 | `src/components/SafePage.jsx`        | `src/shared/safe/SafePage.jsx`           |
| 3 | `src/hooks/useSafeSnapshot.js`       | `src/shared/safe/useSafeSnapshot.js`     |
| 4 | `src/utils/pin.js`                   | `src/shared/pin/index.js`                |
| 5 | `src/firebase.js`                    | `src/firebase/client.js`                 |
| 6 | `src/context/AuthContext.jsx`        | `src/app/providers/AuthProvider.jsx`     |
| 7 | `src/components/Sidebar.jsx`         | `src/app/layout/Sidebar.jsx`             |
| 8 | `src/components/Topbar.jsx`          | `src/app/layout/Topbar.jsx`              |
| 9 | `src/App.js`                         | `src/app/App.jsx`                        |

**Ordering rationale.** `shared/safe` first (no internal deps), then `pin`, then `firebase/client`, then `AuthProvider` (uses firebase + safe), then layout, then `App` last (uses everything).

## Step pattern (executed in `migrate-b2.sh`)

For each step:
```
git mv <OLD> <NEW>
# write thin shim back at <OLD>:
cat > <OLD> <<S
export * from '<NEW-via-alias>';
export { default } from '<NEW-via-alias>';      # only if file had a default export
S
git add <OLD> <NEW>
npm run build                                    # MUST PASS
git commit -m "refactor(phase-b2): move <name> with compat shim"
```

## Shim cheatsheet

Named-only export:
```
// src/lib/safe.js  (shim)
export * from '@shared/safe';
```

Default + named exports:
```
// src/components/SafePage.jsx  (shim)
export { default } from '@shared/safe/SafePage';
export * from '@shared/safe/SafePage';
```

Default-only:
```
// src/App.js  (shim)
export { default } from '@app/App';
```

## Acceptance criteria for Phase B-2

- 9 commits on branch `phase-b/move-app-shell`, one per step.
- After each commit: `npm run build` succeeds, `npm run dev` boots, login works, dashboard renders.
- No file in the codebase changed its import paths in this phase — only the moves + shims.
- `git log --follow src/app/App.jsx` shows the original `src/App.js` history.
- Phase B-3 (per-module moves) can begin.

## Rollback

Each commit is reversible: `git revert <hash>` restores the file at its old path (the shim disappears, the file moves back). Because every step is independent, you can revert the latest step without disturbing earlier ones.
