// src/firebase.js
//
// Firebase SDK initialization that works under BOTH Vite and Create React
// App, regardless of whether the user named their env vars VITE_FIREBASE_*
// or REACT_APP_FIREBASE_*.
//
// Resolution order for each key:
//   1. import.meta.env.VITE_FIREBASE_<KEY>     (Vite native)
//   2. import.meta.env.REACT_APP_FIREBASE_<KEY> (Vite + legacy prefix via vite.config shim)
//   3. process.env.REACT_APP_FIREBASE_<KEY>    (CRA / webpack)
//   4. process.env.VITE_FIREBASE_<KEY>         (defensive)

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// import.meta is a parse-time syntax form; under any modern bundler (webpack 5
// in CRA, Vite, esbuild) it parses fine and resolves at runtime. Under Vite,
// import.meta.env is populated. Under CRA, it's undefined — we silently fall
// through to process.env.
const VITE_ENV = (() => {
  try {
    // Some test environments / SSR contexts can throw on bare import.meta.
    return (typeof import.meta !== "undefined" && import.meta && import.meta.env) || {};
  } catch {
    return {};
  }
})();

// process.env access guarded for browser bundles where webpack/Vite injects
// process.env as an object but it might not exist in some test contexts.
const PROC_ENV = (() => {
  try {
    return (typeof process !== "undefined" && process.env) || {};
  } catch {
    return {};
  }
})();

function readEnv(key) {
  return (
    VITE_ENV[`VITE_FIREBASE_${key}`] ||
    VITE_ENV[`REACT_APP_FIREBASE_${key}`] ||
    PROC_ENV[`REACT_APP_FIREBASE_${key}`] ||
    PROC_ENV[`VITE_FIREBASE_${key}`] ||
    ""
  );
}

const firebaseConfig = {
  apiKey:            readEnv("API_KEY"),
  authDomain:        readEnv("AUTH_DOMAIN"),
  projectId:         readEnv("PROJECT_ID"),
  storageBucket:     readEnv("STORAGE_BUCKET"),
  messagingSenderId: readEnv("MESSAGING_SENDER_ID"),
  appId:             readEnv("APP_ID"),
  measurementId:     readEnv("MEASUREMENT_ID"),
};

// Loud, helpful diagnostic if anything required is missing.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const REQUIRED = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"];
  const missing = REQUIRED.filter((k) => !readEnv(k));
  // eslint-disable-next-line no-console
  console.error(
    "[firebase] Missing required env values: " + missing.join(", ") + ".\n" +
    "Expected either VITE_FIREBASE_<KEY> or REACT_APP_FIREBASE_<KEY> in your .env file.\n" +
    "Example .env:\n" +
    "  VITE_FIREBASE_API_KEY=AIza...\n" +
    "  VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com\n" +
    "  VITE_FIREBASE_PROJECT_ID=your-project\n" +
    "  VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com\n" +
    "  VITE_FIREBASE_MESSAGING_SENDER_ID=...\n" +
    "  VITE_FIREBASE_APP_ID=...\n" +
    "After editing .env, restart the dev server (npm start)."
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
