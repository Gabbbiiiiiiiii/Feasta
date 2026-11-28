import {
  advance, decodeDocument, initializeMigration, invalid, type PlanningDocument,
} from "./contract";

/** Implement using a SINGLE Admin SDK transaction in Phase 2B. Reads must
 * precede writes. No callable/HTTP endpoint is registered in this phase.
 * Admin bypasses Rules: all write paths must use this boundary and restricted IAM.
 */
export interface PlanningTransaction {
  readUser(uid: string): Promise<unknown>;
  readList(uid: string): Promise<unknown | null>;
  createList(uid: string, document: PlanningDocument): void;
  replaceList(uid: string, document: PlanningDocument): void;
}
export type PlanningCommand =
  {type:"initialize"; local:unknown} |
  {type:"replace"; expectedRevision:number; document:unknown};
export async function applyPlanningCommand(
  authenticatedUid: string | null, uid: string, command: PlanningCommand, tx: PlanningTransaction,
): Promise<{document:PlanningDocument; migrationReviewRequired:boolean}> {
  if (!authenticatedUid || authenticatedUid !== uid || uid === "feasta_guest_device_v1") invalid();
  const user = await tx.readUser(uid) as Record<string, unknown> | null;
  if (!user || user.role !== "customer" || user.accountStatus !== "active" ||
      user.isActive !== true || user.isBlocked !== false) invalid();
  const cloud = await tx.readList(uid);
  if (command.type === "initialize") {
    // Validate local even when cloud wins, but do not persist or merge it.
    const local = decodeDocument(command.local,uid);
    if (local.revision !== 0) invalid();
    const document = initializeMigration(uid,cloud,local);
    if (cloud === null) tx.createList(uid,document);
    return {document,migrationReviewRequired:cloud !== null && local.entries.length > 0};
  }
  if (cloud === null) invalid();
  const document = advance(
    decodeDocument(cloud,uid),decodeDocument(command.document,uid),command.expectedRevision,
  );
  tx.replaceList(uid,document);
  return {document,migrationReviewRequired:false};
}
