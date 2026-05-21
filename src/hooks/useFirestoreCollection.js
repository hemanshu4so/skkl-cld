// src/hooks/useFirestoreCollection.js
import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot, orderBy, limit as fbLimit
} from "firebase/firestore";
import { db } from "@fb/client";

/**
 * Real-time collection hook with shopId scoping.
 *
 * @param {string} collectionName - e.g. "products", "customers", "sales"
 * @param {string|null} shopId
 * @param {object} options - { orderField, orderDir, limit, extraFilters: [[field, op, val]] }
 */
export default function useFirestoreCollection(collectionName, shopId, options = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    orderField,
    orderDir = "desc",
    limit,
    extraFilters = [],
    skipShopFilter = false,
  } = options;

  useEffect(() => {
    if (!skipShopFilter && !shopId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const constraints = [];
    if (!skipShopFilter) constraints.push(where("shopId", "==", shopId));
    extraFilters.forEach(([f, op, v]) => constraints.push(where(f, op, v)));
    if (orderField) constraints.push(orderBy(orderField, orderDir));
    if (limit) constraints.push(fbLimit(limit));

    const q = query(collection(db, collectionName), ...constraints);

    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Error loading ${collectionName}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, shopId, orderField, orderDir, limit, JSON.stringify(extraFilters)]);

  return { data, loading, error };
}
