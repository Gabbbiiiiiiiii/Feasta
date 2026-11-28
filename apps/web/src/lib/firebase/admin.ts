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
  throw new Error(
    "FIREBASE_ADMIN_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID is required.",
  );
}

const useEmulators =
  process.env.USE_FIREBASE_EMULATORS === "true" ||
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

if (useEmulators) {
  if (
    process.env.NODE_ENV === "production" ||
    !projectId.startsWith("demo-") ||
    projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ) {
    throw new Error(
      "Firebase Admin emulator mode requires the same demo project on client and server.",
    );
  }

  const emulatorHosts = {
    FIREBASE_AUTH_EMULATOR_HOST:
      process.env.FIREBASE_AUTH_EMULATOR_HOST,
    FIRESTORE_EMULATOR_HOST:
      process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_STORAGE_EMULATOR_HOST:
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  };

  for (const [name, host] of Object.entries(emulatorHosts)) {
    const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(host ?? "");
    const port = match ? Number(match[1]) : NaN;

    if (
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535
    ) {
      throw new Error(
        `${name} must point to a local Firebase emulator.`,
      );
    }
  }
} else if (
  projectId.startsWith("demo-") ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
) {
  throw new Error(
    "Demo Firebase or emulator host configuration requires emulator mode.",
  );
}

const adminClientEmail =
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();

const adminPrivateKey =
  process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    .trim();

if (
  !useEmulators &&
  Boolean(adminClientEmail) !== Boolean(adminPrivateKey)
) {
  throw new Error(
    "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY must be configured together.",
  );
}

const options: AppOptions = {
  projectId,
  storageBucket:
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

if (!useEmulators) {
  options.credential =
    adminClientEmail && adminPrivateKey
      ? cert({
          projectId,
          clientEmail: adminClientEmail,
          privateKey: adminPrivateKey,
        })
      : applicationDefault();
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(options);

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);