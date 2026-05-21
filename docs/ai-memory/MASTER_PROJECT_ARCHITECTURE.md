<!-- BEGIN phase-b9-layout -->
## Final module layout (Phase B-9 complete)

Generated 2026-05-21T07:05:58Z.

```
src/modules
src/modules/accounting
src/modules/accounting/pages
src/modules/activity-log
src/modules/activity-log/pages
src/modules/barcode
src/modules/barcode/lib
src/modules/barcode/pages
src/modules/billing
src/modules/billing/pages
src/modules/bullion
src/modules/bullion/pages
src/modules/customers
src/modules/customers/pages
src/modules/dashboard
src/modules/dashboard/pages
src/modules/inventory
src/modules/inventory/pages
src/modules/karigar
src/modules/karigar/pages
src/modules/orders
src/modules/orders/pages
src/modules/printing
src/modules/printing/components
src/modules/printing/lib
src/modules/printing/pages
src/modules/purchases
src/modules/purchases/pages
src/modules/repairs
src/modules/repairs/pages
src/modules/reports
src/modules/reports/pages
src/modules/schemes
src/modules/schemes/pages
src/modules/vouchers
src/modules/vouchers/pages
...
src/app
src/app/boot
src/app/layout
src/app/providers
src/app/routes
src/app/styles
src/config
src/firebase
src/shared
src/shared/pin
src/shared/safe
```

All compat shims removed (except Barcode Recovery Pass items). Imports use
the @modules / @shared / @app / @firebase / @config aliases. Module boundaries
enforced by eslint import/no-restricted-paths.
<!-- END phase-b9-layout -->
