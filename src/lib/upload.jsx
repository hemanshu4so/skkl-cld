// src/lib/upload.js
//
// Wraps Firebase Storage upload + URL retrieval for product/customer/repair
// photos. Returns { url, path } so we can store both (URL for <img>, path
// for future deletion / orphan cleanup).

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@fb/client";

const slugify = (s) => String(s || "").replace(/[^\w.-]+/g, "_").slice(0, 80);

/**
 * Upload a File/Blob under /shops/{shopId}/{kind}/{entityId}/{ts}_{name}
 */
export async function uploadShopFile({ shopId, kind, entityId, file }) {
  if (!shopId || !file) throw new Error("shopId and file are required");
  const ts = Date.now();
  const path = `shops/${shopId}/${kind}/${entityId || "_unsorted"}/${ts}_${slugify(file.name || "file")}`;
  const sref = ref(storage, path);
  const snap = await uploadBytes(sref, file, {
    contentType: file.type || "application/octet-stream",
  });
  const url = await getDownloadURL(snap.ref);
  return { url, path, contentType: snap.metadata.contentType };
}

export async function deleteShopFile(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    // 404 is fine (already gone)
    if (err?.code !== "storage/object-not-found") throw err;
  }
}
