import type {
  DocumentReference,
  Transaction,
  WriteBatch,
} from "firebase-admin/firestore";

import {db} from "./firestore.js";
import {serverTimestamp} from "./timestamps.js";

export interface AuditLogInput {
  actorId: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  reason?: string;
  source?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

function buildAuditLogData(
  input: AuditLogInput,
): Record<string, unknown> {
  return {
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    targetCollection: input.targetCollection,
    targetId: input.targetId,
    reason: input.reason ?? null,
    source: input.source ?? "cloud_function",
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? {},
    createdAt: serverTimestamp(),
  };
}

export function createAuditLogReference(): DocumentReference {
  return db.collection("adminLogs").doc();
}

export async function writeAuditLog(
  input: AuditLogInput,
): Promise<string> {
  const reference = createAuditLogReference();

  await reference.set(
    buildAuditLogData(input),
  );

  return reference.id;
}

export function writeAuditLogInBatch(
  batch: WriteBatch,
  input: AuditLogInput,
): DocumentReference {
  const reference = createAuditLogReference();

  batch.set(
    reference,
    buildAuditLogData(input),
  );

  return reference;
}

export function writeAuditLogInTransaction(
  transaction: Transaction,
  input: AuditLogInput,
): DocumentReference {
  const reference = createAuditLogReference();

  transaction.set(
    reference,
    buildAuditLogData(input),
  );

  return reference;
}