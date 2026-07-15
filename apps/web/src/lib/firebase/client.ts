import { getApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
} from "firebase/functions";
import {
  connectStorageEmulator,
  getStorage,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

for (const [key, value] of Object.entries(firebaseConfig)) {
  if (!value) {
    throw new Error(`Missing Firebase environment variable: ${key}`);
  }
}

export const firebaseApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const functions = getFunctions(
  firebaseApp,
  "asia-southeast1",
);
export const storage = getStorage(firebaseApp);

const useEmulators =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

type EmulatorGlobal = typeof globalThis & {
  __feastaFirebaseEmulatorsConnected?: boolean;
};


const emulatorGlobal = globalThis as EmulatorGlobal;

if (
  typeof window !== "undefined" &&
  useEmulators &&
  !emulatorGlobal.__feastaFirebaseEmulatorsConnected
) {
  connectAuthEmulator(
    auth,
    "http://127.0.0.1:9099",
    {
      disableWarnings: true,
    },
  );

  connectFirestoreEmulator(
    db,
    "127.0.0.1",
    8080,
  );

  connectFunctionsEmulator(
    functions,
    "127.0.0.1",
    5001,
  );

  connectStorageEmulator(
    storage,
    "127.0.0.1",
    9199,
  );

  emulatorGlobal.__feastaFirebaseEmulatorsConnected = true;

  console.info("FEASTA connected to Firebase emulators.");
}