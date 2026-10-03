import {
  getApps,
  initializeApp,
} from "firebase-admin/app";

export const firebaseAdminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp();