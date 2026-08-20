const admin = require("firebase-admin");
const path = require("path");

let firebaseApp = null;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  try {
    const serviceAccountPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "firebase-service-account.json");

    const serviceAccount = require(path.resolve(serviceAccountPath));

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("Firebase Admin SDK initialized successfully");
    return firebaseApp;
  } catch (err) {
    console.warn(
      "Firebase Admin SDK initialization failed:",
      err.message
    );
    console.warn("Push notifications will be disabled.");
    return null;
  }
}

function getMessaging() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  if (!firebaseApp) return null;
  return admin.messaging();
}

module.exports = { initializeFirebase, getMessaging };
