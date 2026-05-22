# QR Bundle 3 — Auth runtime hardening + diagnostics

Fixes `ReferenceError: auth is not defined` and makes QR auth resolution shape-agnostic.
Additive, idempotent, backup-first, build-verify-or-revert. Does not touch the barcode
module and never rewrites your Inventory page outside `QR-AUTO` markers.

## Scripts

| Script | Role | Writes? |
|--------|------|---------|
| `detect-auth-shape.sh`   | READ-ONLY. Parses your auth provider to report what `useAuth()` exposes, and scans the repo for bare `auth.*` ReferenceError risks (flagging QR-owned vs your code). | nothing |
| `patch-auth-runtime.sh`  | Regenerates the hardened resolver + diagnostics, fixes bare `auth.*` **only in QR-owned scope**, reports occurrences in your code, build-verify-or-revert. | regenerates adapter files; edits QR-AUTO blocks (backup first) |

## What the hardened resolver covers

`qrRuntime.js` now resolves `uid` / `shopId` / `employeeId` / `branchId` / `counterId`
from **any** of these shapes automatically (verified):

| Auth shape | uid | shopId |
|------------|-----|--------|
| `{ currentUser, profile }` | `currentUser.uid` | `profile.shopId` |
| `{ user: {...} }` | `user.uid` | `user.shopId` |
| `{ session: { user } }` | `session.user.uid` | `session.shopId` |
| `{ currentUser, claims }` | `currentUser.uid` | `claims.shopId` |

It never references a bare `auth` global — everything comes from your `useAuth()` hook.

## How the `auth.*` fix stays safe

- **QR-owned scope only**: our `integration/*` files (regenerated) and any `QR-AUTO`
  marked block. Inside a marked block, `auth.currentUser.uid` → `__qrAuth.uid`, etc., and
  a single marked `const __qrAuth = useQrRuntime();` is added at the component top (valid
  hook usage — never inside a callback).
- **Your code is never edited**: bare `auth.*` outside QR-AUTO is **reported with file:line**
  and a suggested 2-line fix, so you stay in control of your own files.
- **Barcode module excluded** entirely (`/modules/barcode/` skipped).

## Diagnostics added (`qrDebug.js`)

- `qrLog/qrWarn/qrErr` — verbose logs gated by `localStorage.setItem('QR_DEBUG','1')`
  (or `window.__QR_DEBUG = true`).
- `qrToast(msg, kind)` — minimal self-contained success/error toast (no dependency on your
  toast system). `createQrItem` shows `QR item created: SKKL-ITM-…` on success.
- `verifyItemWrite(itemId)` — reads the item back from Firestore after creation and logs
  a confirmation (or an error if the doc is missing). Called automatically in `createQrItem`.

## Usage

```bash
cp _qrlib.sh detect-auth-shape.sh patch-auth-runtime.sh /path/to/skkl-cld/
cd /path/to/skkl-cld
chmod +x detect-auth-shape.sh patch-auth-runtime.sh

./detect-auth-shape.sh           # see your auth shape + any bare auth.* risks
./patch-auth-runtime.sh --dry-run
./patch-auth-runtime.sh          # harden + fix QR scope + report your code (build-verified)
git diff                          # review
# fix any REPORTED non-QR occurrences manually (2-line suggestion provided)
npm start
# enable logs while testing:  localStorage.setItem('QR_DEBUG','1')
git commit -am "qr: harden auth runtime + diagnostics"
```

## Safety properties (verified in sandbox)

- Idempotent: re-running fixes nothing new and only regenerates our adapter files; marker
  count stable; zero bare `auth.*` left in QR scope.
- Backup-first (`.qrbak.<ts>`), build-verify-or-revert, dirty-tree guard
  (`QR_ALLOW_DIRTY=1`), `QR_SKIP_BUILD=1` to skip build.
- Barcode module untouched; Inventory page edited only inside `QR-AUTO` markers.

## Rollback

```bash
cp "$(ls -t src/modules/inventory/integration/qrRuntime.js.qrbak.* | head -1)" src/modules/inventory/integration/qrRuntime.js
cp "$(ls -t src/modules/inventory/pages/Inventory.jsx.qrbak.* | head -1)" src/modules/inventory/pages/Inventory.jsx
# or git revert the patch commit
```
