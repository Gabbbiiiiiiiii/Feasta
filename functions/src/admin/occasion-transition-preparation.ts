import {Timestamp} from "firebase-admin/firestore";
import type {CallableRequest} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {correlationIdFromCallable} from "../shared/security-events.js";
import {digest, fail} from "../packages/occasion-suggestion-v2-core.js";
import {occasionId} from "../packages/occasion-v2-validation.js";
import {documentId, exact, mutationKey, plainText, positiveRevision}
  from "../packages/v2-validation.js";
import {readOccasionReadiness, requireOccasionLifecycleActor, requireOccasionLifecycleAdmin,
  type OccasionLifecycleAction} from "./occasion-activation-readiness.js";

function blockedResult(record: FirebaseFirestore.DocumentData, operationId: string) {
  const result = record.result;
  if (record.operationId !== operationId || record.state !== "blocked" ||
    result?.state !== "blocked" || result.operationId !== operationId ||
    !["activate", "deactivate"].includes(result.action) || record.action !== result.action ||
    result.revalidationJobId !== operationId ||
    result.failureReason !== "OCCASION_LIFECYCLE_UNAVAILABLE") fail("TRANSITION_RECOVERY_REQUIRED");
  return {operationId, occasionId: occasionId(result.occasionId),
    action: result.action as OccasionLifecycleAction, state: "blocked" as const,
    occasionRevision: positiveRevision(result.occasionRevision, "CONFIG_UNAVAILABLE"),
    catalogRevision: positiveRevision(result.catalogRevision, "CONFIG_UNAVAILABLE"),
    revalidationJobId: operationId, failureReason: "OCCASION_LIFECYCLE_UNAVAILABLE"};
}

function parseTransition(value: unknown) {
  const input = exact(value, ["occasionId", "expectedRevision", "expectedCatalogRevision",
    "releaseApprovalId", "reason", "idempotencyKey"], [], "INVALID_REVIEW_TARGET");
  return {occasionId: occasionId(input.occasionId),
    expectedRevision: positiveRevision(input.expectedRevision, "INVALID_REVIEW_TARGET"),
    expectedCatalogRevision:
      positiveRevision(input.expectedCatalogRevision, "INVALID_REVIEW_TARGET"),
    releaseApprovalId: documentId(input.releaseApprovalId, "INVALID_REVIEW_TARGET"),
    reason: plainText(input.reason, 10, 500, "INVALID_REVIEW_REASON"),
    idempotencyKey: mutationKey(input.idempotencyKey, "INVALID_REVIEW_TARGET")};
}

export async function prepareBlockedOccasionTransition(
  request: CallableRequest, action: OccasionLifecycleAction,
) {
  if (action !== "activate" && action !== "deactivate") {
    fail("INVALID_REVIEW_TARGET", "invalid-argument");
  }
  const uid = await requireOccasionLifecycleActor(request, `adminOccasions.${action}.prepare`);
  const input = parseTransition(request.data);
  const operationId = digest([uid, action, input.idempotencyKey]);
  const hash = digest({action, input});
  const ref = db.collection("occasionTransitions").doc(operationId);
  return db.runTransaction(async (tx) => {
    await requireOccasionLifecycleAdmin(tx, uid);
    const prior = (await tx.get(ref)).data();
    if (prior) {
      if (prior.hash !== hash || prior.actorUid !== uid || prior.action !== action) {
        fail("IDEMPOTENCY_CONFLICT", "already-exists");
      }
      return blockedResult(prior, operationId);
    }
    const readiness = await readOccasionReadiness(tx, {occasionId: input.occasionId,
      expectedOccasionRevision: input.expectedRevision,
      expectedCatalogRevision: input.expectedCatalogRevision}, action);
    if (readiness.blockers.some((code) =>
      ["CATALOG_REVISION", "OCCASION_REVISION"].includes(code))) {
      fail("REVISION_CONFLICT", "aborted");
    }
    if (readiness.blockers.includes("APPROVED_OCCASION")) fail("OCCASION_NOT_APPROVED");
    if (readiness.blockers.includes("OCCASION_STATE")) fail("OCCASION_STATE_CONFLICT");
    if (readiness.blockers.includes("STABLE_CATALOG")) fail("CONFIG_UNAVAILABLE");
    const now = Timestamp.now();
    const result = {operationId, occasionId: input.occasionId, action, state: "blocked" as const,
      occasionRevision: readiness.occasionRevision, catalogRevision: readiness.catalogRevision,
      revalidationJobId: operationId, failureReason: "OCCASION_LIFECYCLE_UNAVAILABLE"};
    tx.create(ref, {operationId, actorUid: uid, action, hash, result, state: "blocked",
      revision: 1, reason: input.reason, requestedReleaseApprovalId: input.releaseApprovalId,
      releaseAuthorizationVerified: false, blockers: readiness.blockers,
      checkpoint: {stage: "readiness_checked", withdrawalVerified: false,
        catalogCommitted: false, restorationVerified: false},
      createdAt: now, updatedAt: now});
    tx.create(db.collection("occasionTransitionAudits").doc(`${operationId}_blocked`), {
      operationId, actorUid: uid, action, reason: input.reason, state: "blocked",
      correlationId: correlationIdFromCallable(request),
      occasionId: input.occasionId, beforeOccasionRevision: readiness.occasionRevision,
      afterOccasionRevision: readiness.occasionRevision,
      beforeCatalogRevision: readiness.catalogRevision,
      afterCatalogRevision: readiness.catalogRevision,
      blockers: readiness.blockers, createdAt: now});
    return result;
  });
}

export async function getOccasionTransition(request: CallableRequest) {
  const uid = await requireOccasionLifecycleActor(request, "adminOccasions.transition.read");
  const input = exact(request.data, ["operationId"], [], "INVALID_REVIEW_TARGET");
  const id = documentId(input.operationId, "INVALID_REVIEW_TARGET");
  return db.runTransaction(async (tx) => {
    await requireOccasionLifecycleAdmin(tx, uid);
    const record = (await tx.get(db.collection("occasionTransitions").doc(id))).data();
    if (!record) fail("TRANSITION_NOT_FOUND", "not-found");
    return blockedResult(record, id);
  });
}
