import type {
  DocumentReference,
  Transaction,
  WriteBatch,
} from "firebase-admin/firestore";

import {db} from "./firestore.js";
import {serverTimestamp} from "./timestamps.js";

export interface NotificationInput {
  userId: string;
  title: string;
  message: string;
  type: string;
  relatedId?: string;
  relatedCollection?: string;
  metadata?: Record<string, unknown>;
}

function buildNotificationData(
  input: NotificationInput,
): Record<string, unknown> {
  return {
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type,
    relatedId: input.relatedId ?? null,
    relatedCollection:
        input.relatedCollection ?? null,
    metadata: input.metadata ?? {},
    isRead: false,
    readAt: null,
    deliveryStatus: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function createNotificationReference():
    DocumentReference {
  return db.collection("notifications").doc();
}

export async function createNotification(
  input: NotificationInput,
): Promise<string> {
  const reference =
      createNotificationReference();

  await reference.set(
    buildNotificationData(input),
  );

  return reference.id;
}

export function createNotificationInBatch(
  batch: WriteBatch,
  input: NotificationInput,
): DocumentReference {
  const reference =
      createNotificationReference();

  batch.set(
    reference,
    buildNotificationData(input),
  );

  return reference;
}

export function createNotificationInTransaction(
  transaction: Transaction,
  input: NotificationInput,
): DocumentReference {
  const reference =
      createNotificationReference();

  transaction.set(
    reference,
    buildNotificationData(input),
  );

  return reference;
}