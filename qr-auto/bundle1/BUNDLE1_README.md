# QR Auto-Integration — Bundle 1 (Add Product → permanent itemId + QR)

Safe, idempotent, backup-first wiring of QR item creation into your **existing** Inventory
save flow. No restructuring, no renames, no overwriting your inventory logic. Additive only.

## Scripts (run in order)

| Script | What it does | Writes? |
|--------|--------------|---------|
| `detect-qr-runtime.sh`  | READ-ONLY. Detects your auth hook + import, the `db` export, and the Inventory save flow (page, handler, product collection, payload var). Writes `qr-integration.config.json`. | config json only |
| `generate-qr-adapter.sh`| Creates `src/modules/inventory/integration/qrRuntime.js` + `createQrItem.js` from the config. **New files only** — never edits existing files. Defensive auth resolution (works regardless of your auth shape). | new adapter files |
| `wire-add-product.sh`   | Injects a **marked, backed-up, additive** import + hook + QR call into the Inventory page, right after your product `addDoc`. Build-verify-or-revert. Idempotent. STOPS with manual instructions if confidence is low. | edits inventory page (backup first) |

## Usage

```bash
cp _qrlib.sh detect-qr-runtime.sh generate-qr-adapter.sh wire-add-product.sh /path/to/skkl-cld/
cd /path/to/skkl-cld
chmod +x detect-qr-runtime.sh generate-qr-adapter.sh wire-add-product.sh

./detect-qr-runtime.sh           # review qr-integration.config.json + report
./generate-qr-adapter.sh         # creates the adapter (new files)
git add -A && git commit -m "qr: detect config + adapter"   # commit the additive files

./wire-add-product.sh --dry-run  # preview the injection
./wire-add-product.sh            # inject (backup + build-verify-or-revert)
git diff                          # review the 3 marked inserts
npm start                         # verify Add Product still works AND creates a QR item
git commit -am "qr: wire Add Product → permanent itemId + QR (additive)"
```

## Safety properties (all verified in sandbox)

- **Backup-first**: every edited file is copied to `<file>.qrbak.<timestamp>` before editing.
- **Idempotent**: re-running the wirer detects `QR-AUTO` markers and no-ops. Re-running the
  generator only rewrites the adapter (our files), never the page.
- **Anchored INSERT only**: never replaces or deletes existing lines/JSX. Inserts 3 marked
  fragments (import, hook call, post-save QR call).
- **Build-verify-or-revert**: if `npm run build` fails after the edit, the page is restored
  from its backup and the script exits non-zero. Set `QR_SKIP_BUILD=1` to skip.
- **Confidence gate**: if the payload variable or save anchor can't be identified, it
  refuses to edit and prints the exact manual one-liner instead.
- **Dirty-tree guard**: refuses to run on a dirty tree unless `QR_ALLOW_DIRTY=1`.

## What gets injected (example)

```jsx
import { useCreateQrItem } from '@modules/inventory/integration/createQrItem';  /* QR-AUTO */
// ...
const { createQrItem } = useCreateQrItem(); /* QR-AUTO */
// ...
const ref = await addDoc(collection(db, 'products'), payload);
  /* QR-AUTO:BEGIN add-product → QR item (additive, non-blocking) */
  try { await createQrItem(payload, { productId: ref.id, productCollection: 'products' }); }
  catch (e) { console.error('[QR] item create failed (non-blocking):', e); }
  /* QR-AUTO:END */
```

Your product write is untouched. The QR item (`items/SKKL-ITM-000001`) is created in
addition, with a permanent identity (write-once), and the product doc is linked back with
`itemId`/`qrId` (best-effort, non-blocking).

## Rollback

```bash
# restore the page from the newest backup:
cp src/modules/inventory/pages/Inventory.jsx.qrbak.* /tmp/ 2>/dev/null
ls -t src/modules/inventory/pages/Inventory.jsx.qrbak.* | head -1   # newest
cp "$(ls -t src/modules/inventory/pages/Inventory.jsx.qrbak.* | head -1)" src/modules/inventory/pages/Inventory.jsx
# or, if committed:
git revert <wire commit>
```

## Tunables

- Field mapping product→item lives in `createQrItem.js` (`mapProductToItemInput`). If your
  form uses different field names, tweak that one function — it's a generated adapter,
  isolated from your inventory logic.
- The defensive auth resolution in `qrRuntime.js` already handles `shopId`,
  `user.uid`/`currentUser.uid`/`uid`, `employeeId`, `branchId`, `counterId`. If your auth
  exposes something exotic, add it there.
