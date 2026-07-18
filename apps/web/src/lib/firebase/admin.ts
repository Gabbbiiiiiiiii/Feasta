import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type AppOptions,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("FIREBASE_ADMIN_PROJECT_ID is required.");
}

const useEmulators =
  process.env.USE_FIREBASE_EMULATORS === "true";
const adminClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
const adminPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ?.replace(/\\n/g, "\n")
  .trim();

if (!useEmulators && Boolean(adminClientEmail) !== Boolean(adminPrivateKey)) {
  throw new Error(
    "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY must be configured together.",
  );
}

const options: AppOptions = {
  projectId,
  storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
  ...(useEmulators ? {} : {
    credential: adminClientEmail && adminPrivateKey ?
      cert({projectId, clientEmail: adminClientEmail, privateKey: adminPrivateKey}) :
      applicationDefault(),
  }),
};

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(options);

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);
