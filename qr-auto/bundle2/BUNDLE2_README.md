# QR Auto-Integration — Bundle 2 (scan → fetch · tag print · movement · repair)

Additive, idempotent wiring of the QR read/print/history flows. Prefers a **new route**
(zero risk to existing render trees) plus a backup-first injection for repairs. Requires
the QR-inventory files + Bundle 1 adapter (`qrRuntime.js`) already installed.

## Scripts (run in order)

| Script | What it does | Writes? |
|--------|--------------|---------|
| `generate-qr-panel.sh` | Creates `QrInventoryPanel.jsx` (scan→tag→movement→repair→audit composite), `QrItemView.jsx` (route target), `recordItemRepair.js` (repairs adapter hook). **New files only.** | new files |
| `wire-qr-route.sh`     | Registers `/inventory/qr → QrItemView` in your routes file. Handles array-style and JSX `<Routes>` styles. Backup, marked, idempotent, build-verify-or-revert. | edits routes (backup first) |
| `wire-repairs-qr.sh`   | Additive, non-blocking `recordRepair(...)` after your repairs save. Same safety pattern. Optional. | edits repairs page (backup first) |

## Usage

```bash
cp _qrlib.sh generate-qr-panel.sh wire-qr-route.sh wire-repairs-qr.sh /path/to/skkl-cld/
cd /path/to/skkl-cld
chmod +x generate-qr-panel.sh wire-qr-route.sh wire-repairs-qr.sh

./generate-qr-panel.sh
git add -A && git commit -m "qr: composite panel + view + repair adapter"

./wire-qr-route.sh         # adds /inventory/qr
git commit -am "qr: route → QrItemView"

./wire-repairs-qr.sh       # optional: log repairs against QR items
git commit -am "qr: repairs → item_repairs (additive)"

npm start                  # visit /inventory/qr → scan → tag/print/movement/repair/audit
```

## What you get at /inventory/qr

`QrInventoryPanel`:
- **Scan / type** a `SKKL-ITM-…` id → resolves the full item from Firebase (QR holds only the id).
- **Tag preview + print** via the restored `TagCanvas`; each print logs to `tag_history`.
- **Movement timeline** (append-only `item_movements`, client-sorted).
- **Repair history** (append-only `item_repairs`).
- **Audit trail** (immutable `audit_logs`).

This is a **new route** — your existing Inventory page render tree is never touched. If you
also want a "QR" button on the existing Inventory page, mount `<QrInventoryPanel/>` yourself
where you want it (one line); the script deliberately won't inject into your render tree.

## Safety properties (verified in sandbox)

- New composite/view/adapter files only; generator never edits existing files.
- Route wiring works for both array-style routes and JSX `<Routes><Route/></Routes>`.
- Backup-first, `QR-AUTO` markers, idempotent (re-run = no-op), build-verify-or-revert.
- Confidence gate: if a routes file or repairs save anchor isn't found, it STOPS and prints
  the exact manual one-liner instead of guessing.

## Rollback

```bash
# newest backup of any edited file:
cp "$(ls -t src/modules/inventory/routes.jsx.qrbak.* | head -1)" src/modules/inventory/routes.jsx
cp "$(ls -t src/modules/repairs/pages/Repairs.jsx.qrbak.* | head -1)" src/modules/repairs/pages/Repairs.jsx
# or revert the relevant commits.
```

## Notes

- `recordItemRepair.js` writes append-only `item_repairs`; the `onRepairWrite` Cloud Function
  flips item status (in_repair / in_stock) and appends a movement — QR identity never changes.
- The composite reuses the QR components you already installed; it adds no barcode logic and
  does not touch the barcode recovery.
