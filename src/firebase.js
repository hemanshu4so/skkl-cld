// src/firebase.js
// Firebase SDK initialization. All config values come from .env (REACT_APP_*).
// See .env.example for the required keys. Never commit real keys to git.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Fail fast in dev if env is missing — saves an hour of "why is auth blank?"
if (process.env.NODE_ENV !== "production" && !firebaseConfig.apiKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[firebase] Missing REACT_APP_FIREBASE_* env vars. " +
    "Copy .env.example to .env and fill in your project keys, then restart `npm start`."
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
