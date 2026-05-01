import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export const checkShopAccess = async (shopId) => {
  const ref = doc(db, "shops", shopId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return { allowed: false };

  const shop = snap.data();
  const now = new Date();

  // 🔥 Trial check
  if (shop.trial?.isTrial) {
    const end = new Date(shop.trial.endDate.seconds * 1000);

    if (now > end) {
      await updateDoc(ref, { status: "blocked" });
      return { allowed: false };
    }
  }

  // 🔥 Subscription check
  if (shop.subscription?.isActive) {
    const end = new Date(shop.subscription.endDate.seconds * 1000);

    if (now > end) {
      await updateDoc(ref, { status: "blocked" });
      return { allowed: false };
    }
  }

  // 🔥 Manual block
  if (shop.status === "blocked") {
    return { allowed: false };
  }

  return { allowed: true, shop };
};