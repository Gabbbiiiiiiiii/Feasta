import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {db} from "./firestore.js";

export async function runTransaction<T>(
  handler: (
    transaction: Transaction,
    firestore: Firestore,
  ) => Promise<T>,
): Promise<T> {
  return db.runTransaction((transaction) =>
    handler(transaction, db),
  );
}

export async function getRequiredDocument<T>(
  transaction: Transaction,
  reference: DocumentReference<T>,
  message = "Document not found.",
): Promise<T> {
  const snapshot = await transaction.get(reference);
  const data = snapshot.data();

  if (!snapshot.exists || data === undefined) {
    throw new HttpsError(
      "not-found",
      message,
    );
  }

  return data;
}