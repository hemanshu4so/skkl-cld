# QR-First Inventory — Firestore Schema

## Core principle
QR encodes a **permanent identity string only** — e.g. `SKKL-ITM-000001`.
No jewellery data is ever stored in the QR. Scanning resolves the string to
`items/{itemId}` in Firebase. `qrId === itemId === docId`. Generated once, never
regenerated (not on repair, transfer, weight change, stone add, resale, exchange).

All history collections are **append-only**: `item_movements`, `item_repairs`,
`tag_history`, `audit_logs`, `inventory_events`. The `items` doc holds the *current
snapshot*; every mutation also writes an immutable history record with before/after.

Multi-tenant: every doc carries `shopId`. Existing `assertShopId` guard applies.

---

## Collections

### items/{itemId}   (itemId = "SKKL-ITM-000001")
Current snapshot of one physical piece. Mutable fields update in place; each change
is mirrored to `item_movements` / `inventory_events`.

```jsonc
{
  "itemId": "SKKL-ITM-000001",      // == docId, permanent
  "qrId": "SKKL-ITM-000001",        // == itemId, QR payload, set once
  "qrGenerated": true,
  "qrGeneratedAt": "<ts>",
  "shopId": "shop_abc",

  "sku": "RNG-22K-0007",
  "designCode": "D-1187",
  "category": "ring",               // ring|chain|necklace|bangle|earring|pendant|...
  "subCategory": "casting",
  "metal": "gold",                  // gold|silver|platinum
  "purity": "22K",                  // 22K|18K|916|999|...
  "hallmark": true,
  "huid": "AZ4K9P",                 // 6-char BIS HUID

  "grossWeight": 8.450,             // current snapshot (grams)
  "netWeight": 7.980,
  "stoneWeight": 0.470,
  "diamondWeight": 0.000,
  "stoneDetails": [
    { "type": "CZ", "pieces": 4, "carat": 0.0, "weightG": 0.47 }
  ],

  "makingChargeType": "per_gram",   // per_gram|flat|percent
  "makingChargeValue": 450,
  "wastagePct": 8.0,

  "vendorId": "vend_12",
  "branchId": "br_main",
  "counterId": "ctr_3",             // physical counter, nullable
  "location": "showcase_A2",

  "status": "in_stock",             // in_stock|assigned|sold|in_repair|transferred|exchanged|melted|lost
  "rateAtEntry": 7150,              // metal rate/g snapshot at entry
  "tagPrinted": false,
  "images": [],
  "tags": ["bridal","new-arrival"],

  "lastMovementId": "mv_...",
  "lastRepairId": null,

  "createdAt": "<ts>", "updatedAt": "<ts>",
  "createdBy": "uid_...", "createdByEmployeeId": "emp_7"
}
```

### item_movements/{movementId}   (APPEND-ONLY)
Every state/location/ownership change. Never updated or deleted.

```jsonc
{
  "movementId": "mv_9f2",
  "shopId": "shop_abc",
  "itemId": "SKKL-ITM-000001",
  "type": "created",   // created|assigned|transferred|sold|returned|repair_in|repair_out|
                       // weight_change|stone_added|stone_removed|exchanged|melted|lost|found
  "fromBranchId": null, "toBranchId": "br_main",
  "fromCounterId": null, "toCounterId": "ctr_3",
  "byEmployeeId": "emp_7", "byUid": "uid_..",
  "refType": "purchase",          // purchase|sale|repair|transfer|manual|exchange
  "refId": "pur_55",
  "snapshotBefore": null,
  "snapshotAfter": { "status": "in_stock", "grossWeight": 8.45, "branchId": "br_main" },
  "note": "Entered from vendor lot #LOT-22",
  "at": "<ts>"
}
```

### item_repairs/{repairId}   (APPEND-ONLY)
```jsonc
{
  "repairId": "rep_31",
  "shopId": "shop_abc",
  "itemId": "SKKL-ITM-000001",
  "status": "received",          // received|in_progress|ready|delivered|cancelled
  "karigarId": "kar_4",
  "issue": "Re-polish + tighten 1 stone",
  "weightBefore": 8.45, "weightAfter": 8.43,
  "stonesAddedWeightG": 0.0, "stonesRemovedWeightG": 0.02,
  "charges": 250, "currency": "INR",
  "receivedAt": "<ts>", "deliveredAt": null,
  "byEmployeeId": "emp_2", "at": "<ts>"
}
```

### tag_history/{tagEventId}   (APPEND-ONLY)
QR/tag print log. QR string itself never changes; this records each print.
```jsonc
{
  "tagEventId": "tag_77", "shopId": "shop_abc",
  "itemId": "SKKL-ITM-000001", "qrId": "SKKL-ITM-000001",
  "templateId": "tmpl_hang_81x12", "copies": 1,
  "branchId": "br_main", "byEmployeeId": "emp_7", "printedAt": "<ts>"
}
```

### audit_logs/{auditId}   (APPEND-ONLY)
```jsonc
{
  "auditId": "aud_5012", "shopId": "shop_abc",
  "entityType": "item",          // item|sale|repair|transfer|purchase|counter|branch
  "entityId": "SKKL-ITM-000001",
  "action": "item.weight_change",
  "before": { "grossWeight": 8.45 }, "after": { "grossWeight": 8.43 },
  "byEmployeeId": "emp_2", "byUid": "uid_..", "source": "repairs_module",
  "at": "<ts>"
}
```

### inventory_events/{eventId}   (APPEND-ONLY analytics stream)
Lightweight event bus for dashboards/reports (denormalized).
```jsonc
{
  "eventId": "evt_..", "shopId": "shop_abc",
  "kind": "item_created",        // item_created|tag_printed|assigned|transferred|sold|repaired
  "itemId": "SKKL-ITM-000001",
  "branchId": "br_main", "counterId": "ctr_3",
  "amount": null, "weightG": 8.45,
  "byEmployeeId": "emp_7", "at": "<ts>"
}
```

### branches/{branchId}
```jsonc
{ "branchId": "br_main", "shopId": "shop_abc", "name": "Main Showroom",
  "code": "MAIN", "address": "...", "active": true, "createdAt": "<ts>" }
```

### counters/{counterId}
Physical counters AND the item-id sequence allocator live here, distinguished by `type`.
```jsonc
// physical counter
{ "counterId": "ctr_3", "type": "counter", "shopId": "shop_abc",
  "branchId": "br_main", "name": "Gold Counter 3", "active": true }

// id sequence allocator (one per shop)
{ "counterId": "seq_items_shop_abc", "type": "sequence",
  "shopId": "shop_abc", "scope": "items", "value": 1247 }
```

### employees/{employeeId}
```jsonc
{ "employeeId": "emp_7", "shopId": "shop_abc", "uid": "uid_..",
  "name": "Ravi", "role": "sales", "branchId": "br_main", "active": true }
```

### Existing collections extended (no new shape, just references)
- `sales/{saleId}` — add `lineItems[].itemId` (QR id) + `soldItemIds: [..]`.
- `purchases/{purchaseId}` — add `generatedItemIds: [..]`.
- `transfers/{transferId}` — `{ shopId, itemIds:[..], fromBranchId, toBranchId, status, byEmployeeId, at }`.
- `vendors`, `customers` — unchanged.

---

## Relationships

```
purchases ──generates──> items (1..N)            items.vendorId ─> vendors
items ──1..N──> item_movements   (append-only)   items.branchId ─> branches
items ──0..N──> item_repairs     (append-only)   items.counterId ─> counters(type=counter)
items ──0..N──> tag_history       (append-only)   items.createdByEmployeeId ─> employees
items ──0..N──> audit_logs        (entityId)      transfers.itemIds[] ─> items
sales.lineItems[].itemId ─> items                 item-id seq: counters(type=sequence)
all writes ──> inventory_events  (append-only analytics)
```

`itemId == qrId == items docId` makes scan→fetch a single `getDoc(items/{scanned})`.

---

## Indexes (firestore.indexes.json — see firestore.indexes.additions.json)
- items: `shopId ==` + `status ==` + `createdAt` (client sorts; keep for status filters)
- items: `shopId ==` + `branchId ==` + `category ==`
- item_movements: `itemId ==` (+ client sort by `at`); `shopId ==` + `type ==`
- item_repairs: `itemId ==`; `shopId ==` + `status ==`
- tag_history: `itemId ==`; `shopId ==`
- audit_logs: `shopId ==` + `entityType ==` + `entityId ==`
- inventory_events: `shopId ==` + `kind ==`

Per BUG_HISTORY guidance: do NOT add `orderBy(createdAt)` composite for listings; sort
client-side with `sortByCreatedDesc` so pending serverTimestamp writes aren't hidden.
