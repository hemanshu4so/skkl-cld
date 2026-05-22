// src/modules/inventory/integration/qrRuntime.js  (GENERATED — safe to regenerate)
// Defensive adapter: resolves shopId / uid / employeeId from the repo's REAL auth hook,
// tolerating multiple shapes so the QR layer never hard-codes your auth structure.
import { useAuth } from '@app/providers/AuthProvider';

export function useQrRuntime() {
  const auth = (useAuth() || {});
  const shopId =
    auth.shopId || (auth.shop && auth.shop.id) ||
    (auth.user && auth.user.shopId) || null;
  const uid =
    (auth.user && auth.user.uid) || (auth.currentUser && auth.currentUser.uid) ||
    auth.uid || null;
  const employeeId =
    auth.employeeId || (auth.employee && auth.employee.id) ||
    (auth.user && auth.user.employeeId) || null;
  const branchId =
    auth.branchId || (auth.branch && auth.branch.id) ||
    (auth.user && auth.user.branchId) || null;
  const counterId =
    auth.counterId || (auth.counter && auth.counter.id) || null;
  return { shopId, uid, employeeId, branchId, counterId, ready: !!shopId };
}
