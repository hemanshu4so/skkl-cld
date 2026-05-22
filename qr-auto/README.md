# QR Auto-Integration Bundles (SKKL ERP)

Two safe, idempotent, backup-first bundles that wire the QR-first inventory into your
EXISTING repo. No restructuring, no renames, no overwriting inventory logic, no barcode
regeneration. Every edit is anchored, marked (`QR-AUTO`), backed up, and build-verified
(auto-revert on failure). Re-running any script is a no-op once applied.

## Bundle 1 — Add Product → permanent itemId + QR  (`bundle1/`)
1. `detect-qr-runtime.sh`  — detect auth/firebase/inventory save flow (read-only)
2. `generate-qr-adapter.sh`— defensive runtime adapter + createQrItem (new files)
3. `wire-add-product.sh`   — inject additive QR creation after your product save

## Bundle 2 — scan/fetch · tag print · movement · repair  (`bundle2/`)
1. `generate-qr-panel.sh`  — composite panel + /inventory/qr view + repair adapter (new files)
2. `wire-qr-route.sh`      — register the QR route (array or JSX styles)
3. `wire-repairs-qr.sh`    — additive repair logging (optional)

## Order
Run Bundle 1 fully (detect → generate → wire → commit), verify Add Product creates a QR
item, then run Bundle 2.

## Global safety env
- `QR_ALLOW_DIRTY=1`  proceed on a dirty tree
- `QR_SKIP_BUILD=1`   skip the build gate (faster; you take the risk)

See `bundle1/BUNDLE1_README.md` and `bundle2/BUNDLE2_README.md` for full details.
