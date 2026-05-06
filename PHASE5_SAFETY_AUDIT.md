# Phase 5 — Safety Audit (P5-0)

Pre-flight check before adding the print template builder + voucher modules.

- ✅ Every page imports the React hooks it uses (useState/useEffect/useRef/useMemo/useCallback)
- ✅ No real TDZ patterns remaining. The single real TDZ in Customers.js
  was fixed in commit e3eecf6 by hoisting `const selectedId = selected?.id || null;`
- ✅ Bottom-of-file module-scope consts (Billing.js, Bullion.jsx, etc.) are
  evaluated at module load and safe to reference from the component body
- ✅ All `ref` identifiers are useRef objects, function-locals, or property keys
- ✅ assertShopId guard on every shop-scoped write
- ✅ ErrorBoundary wraps every route via safe(<Page/>) in App.js
- ✅ Vite production build clean
