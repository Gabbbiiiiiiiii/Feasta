import type {Transaction} from "firebase-admin/firestore";

import {db} from "./firestore.js";
import {serverTimestamp} from "./timestamps.js";

export interface VerificationHistoryInput {
  verificationId: string;
  providerId: string;
  actorId: string;
  actorRole: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  remarks?: string | null;
  documentType?: string | null;
  documentStatus?: string | null;
  auditLogId: string;
  metadata?: Record<string, unknown>;
}

export function writeVerificationHistoryInTransaction(
  transaction: Transaction,
  input: VerificationHistoryInput,
): string {
  const reference = db
    .collection("providerVerifications")
    .doc(input.verificationId)
    .collection("history")
    .doc();
  transaction.create(reference, {
    providerId: input.providerId,
    verificationId: input.verificationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    remarks: input.remarks ?? null,
    documentType: input.documentType ?? null,
    documentStatus: input.documentStatus ?? null,
    auditLogId: input.auditLogId,
    metadata: input.metadata ?? {},
    createdAt: serverTimestamp(),
  });
  return reference.id;
}
