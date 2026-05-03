// src/services/notifications.js
//
// Persisted notifications.
//
// Document shape /notifications/{id}:
//   { shopId, uid?, title, body, kind, link?, read, createdAt }
//
//   uid:  if set, notification is for that user only
//         if unset, notification is broadcast to all shop users
//   kind: 'info' | 'warn' | 'success' | 'system'
//
// FCM (browser push) is opt-in. We register a token for the user when the
// browser allows it; you'll need to wire a Cloud Function later that watches
// /notifications and posts via the FCM HTTP API. The on-device toast/panel
// works regardless of whether push is set up.

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { db } from "../firebase";

export async function pushNotification({ shopId, uid = null, title, body, kind = "info", link = null }) {
  if (!shopId || !title) return;
  return await addDoc(collection(db, "notifications"), {
    shopId, uid, title, body: body || "", kind, link,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markRead(id, value = true) {
  if (!id) return;
  return updateDoc(doc(db, "notifications", id), { read: value });
}

// ───────── FCM (browser push, optional) ─────────
let _messaging = null;

export async function getMessagingInstance() {
  try {
    if (_messaging) return _messaging;
    if (!(await isSupported())) return null;
    _messaging = getMessaging();
    return _messaging;
  } catch {
    return null;
  }
}

/**
 * Request browser permission, retrieve an FCM token, and store it under
 * /users/{uid}.fcmTokens. Returns the token or null.
 *
 * The vapidKey must be set as REACT_APP_FIREBASE_VAPID_KEY (Project Settings
 * → Cloud Messaging → Web Push certificates → Generate key pair).
 */
export async function registerForPush(uid) {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;
    const vapid = process.env.REACT_APP_FIREBASE_VAPID_KEY;
    if (!vapid) {
      console.warn("[notifications] REACT_APP_FIREBASE_VAPID_KEY missing — skipping FCM registration");
      return null;
    }
    if (Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return null;
    }
    const token = await getToken(messaging, { vapidKey: vapid });
    if (!token || !uid) return null;
    // Append to /users/{uid}.fcmTokens (Firestore arrayUnion equivalent done with two reads is heavier;
    // we just write a single field with the latest token for simplicity).
    await updateDoc(doc(db, "users", uid), { lastFcmToken: token, lastFcmAt: serverTimestamp() });
    return token;
  } catch (err) {
    console.warn("[notifications] FCM registration failed:", err.message);
    return null;
  }
}

/**
 * Subscribe to foreground messages — fires only when the app is open in the
 * tab. Background messages are handled by firebase-messaging-sw.js.
 */
export async function onForegroundMessage(handler) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
