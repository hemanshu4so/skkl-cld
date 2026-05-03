// functions/index.js — Cloud Functions for SKKL Jewellery CRM/ERP
//
// To deploy:
//   1. firebase init functions  (pick existing project, JS, Node 20)
//   2. cp functions/index.js to the generated functions/index.js
//   3. firebase deploy --only functions
//
// Required IAM roles on the project default service account:
//   - Cloud Datastore Import Export Admin   (roles/datastore.importExportAdmin)
//   - Storage Admin (or Object Admin)       (roles/storage.objectAdmin)
//
// Environment:
//   firebase functions:config:set backup.bucket="gs://your-project.appspot.com/backups"

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore = require("@google-cloud/firestore");
admin.initializeApp();

const client = new firestore.v1.FirestoreAdminClient();

// ───────── 1. Scheduled daily Firestore export ─────────
//
// Runs every day at 02:00 IST. Writes a full export to:
//   gs://<bucket>/backups/<YYYY-MM-DD>/
//
// Cost-conscious: full export every day is fine for most jewellery shops
// (the data set is small). Upgrade to incremental backups later if needed.

exports.scheduledFirestoreBackup = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const databaseName = client.databasePath(projectId, "(default)");
    const bucket = (functions.config().backup && functions.config().backup.bucket)
      || `gs://${projectId}.appspot.com/backups`;
    const date = new Date().toISOString().slice(0, 10);
    const outputUriPrefix = `${bucket}/${date}`;

    const [response] = await client.exportDocuments({
      name: databaseName,
      outputUriPrefix,
      collectionIds: [],   // empty = export ALL collections
    });
    console.log(`[backup] export started: ${response.name} → ${outputUriPrefix}`);
    return { ok: true, location: outputUriPrefix };
  });

// ───────── 2. On-demand backup ─────────
//
// Called from the app via httpsCallable("triggerBackup").
// Writes a timestamped folder under gs://<bucket>/backups-manual/.

exports.triggerBackup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  // Only superadmins should trigger this (cheap check via Firestore lookup).
  const superSnap = await admin.firestore()
    .doc(`superadmins/${context.auth.uid}`).get();
  if (!superSnap.exists) {
    throw new functions.https.HttpsError("permission-denied", "Superadmin only.");
  }

  const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  const databaseName = client.databasePath(projectId, "(default)");
  const bucket = (functions.config().backup && functions.config().backup.bucket)
    || `gs://${projectId}.appspot.com/backups-manual`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const [response] = await client.exportDocuments({
    name: databaseName,
    outputUriPrefix: `${bucket}/manual-${stamp}`,
    collectionIds: data?.collectionIds || [],
  });
  return { name: response.name, location: `${bucket}/manual-${stamp}` };
});
