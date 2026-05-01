// src/utils/pin.js
// PIN hashing using Web Crypto SubtleCrypto.
//
// User/superadmin doc shape:
//   pin:      <legacy plaintext PIN, present until first successful unlock>
//   pinHash:  "<hex sha-256(pin || ':' || salt)>"
//   pinSalt:  "<hex 16-byte random salt>"
//
// Verification:
//   1. If pinHash + pinSalt exist, sha-256(input + ':' + salt) must match.
//   2. Else if legacy plaintext `pin` matches, accept AND migrate the doc to
//      hashed form (deleteField('pin')).

import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "../firebase";

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSalt(byteLength = 16) {
  const buf = new Uint8Array(byteLength);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  return bytesToHex(buf);
}

export async function hashPin(pin, saltHex) {
  const enc = new TextEncoder();
  const data = enc.encode(`${pin}:${saltHex}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a PIN against a user/superadmin doc.
 * Side-effect: if doc still has plaintext pin, migrate to {pinHash, pinSalt}
 * and delete the plaintext field on success.
 */
export async function verifyPin({ collection, uid, pin, docData }) {
  const inputPin = String(pin || "").trim();
  if (!inputPin) return false;

  if (docData?.pinHash && docData?.pinSalt) {
    const candidate = await hashPin(inputPin, docData.pinSalt);
    return safeEqualHex(candidate, docData.pinHash);
  }

  if (docData?.pin != null && String(docData.pin) === inputPin) {
    try {
      const salt = generateSalt();
      const hash = await hashPin(inputPin, salt);
      await updateDoc(doc(db, collection, uid), {
        pinHash: hash,
        pinSalt: salt,
        pin: deleteField(),
      });
    } catch {
      console.warn("[pin] migration failed; will retry next unlock");
    }
    return true;
  }

  return false;
}

export async function setPin({ collection, uid, pin }) {
  const cleaned = String(pin || "").trim();
  if (cleaned.length < 4) throw new Error("PIN must be at least 4 digits");
  const salt = generateSalt();
  const hash = await hashPin(cleaned, salt);
  await updateDoc(doc(db, collection, uid), {
    pinHash: hash,
    pinSalt: salt,
    pin: deleteField(),
  });
}
