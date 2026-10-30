/**
 * Phase 1C, stage A: private, incomplete, unbound editor progress.
 * Intentionally NOT exported from functions/src/index.ts. Publication and
 * canonical package creation/completion remain separate, gated operations.
 * Stage D completion preserves completed records for owner recovery reads.
 */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {
  recordMaintenanceAdmission, requireMaintenanceOpen,
} from "../shared/maintenance.js";
import {authorizeProviderForPackageManagement} from "./package-domain.js";
import {
  EditorProgressError, assertNoUnverifiedEditorAssets, parseGetEditorProgress,
  parseSaveEditorProgress,
  parseDiscardEditorProgress, parseListEditorProgress,
  type SaveEditorProgressInput, type EditorProgressLimits,
} from "./package-editor-progress-v2.js";

const DRAFTS = "providerPackageEditorDrafts";
const OPERATIONS = "providerPackageEditorOperations";
const QUOTAS = "providerPackageEditorQuotas";
const POLICY_PATH = "contractPolicies/providerPackageV2";
const MAX_PRIVATE_DRAFTS = 20;

function fail(reason: string, code: ConstructorParameters<typeof HttpsError>[0] =
  "failed-precondition"): never {
  throw new HttpsError(code, reason, {reason});
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function enforceAppCheck(app: unknown): void {
  if (process.env.FUNCTIONS_EMULATOR !== "true" && !app) {
    fail("APP_CHECK_REQUIRED", "unauthenticated");
  }
}

function readLimits(policy: FirebaseFirestore.DocumentData | undefined): EditorProgressLimits {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!project || !policy || policy.effectiveEnvironment !== project ||
      !Number.isSafeInteger(policy.revision) || policy.revision < 1 ||
      !Number.isSafeInteger(policy.maxSpecificOccasions) ||
      policy.maxSpecificOccasions < 1 || policy.maxSpecificOccasions > 100 ||
      !Number.isSafeInteger(policy.maxThemeImages) ||
      policy.maxThemeImages < 1 || policy.maxThemeImages > 1000) {
    fail("CONFIG_UNAVAILABLE");
  }
  // Unlike occasionCatalogReads, this independent flag is absent/false by
  // default; adding the callable cannot silently enable unfinished editing.
  if (policy.featureGates?.packageEditorProgressWrites !== true) {
    fail("FEATURE_DISABLED");
  }
  return {
    maxSpecificOccasions: policy.maxSpecificOccasions,
    maxThemeImages: Math.min(4, policy.maxThemeImages),
  };
}

function mapInputFailure(error: unknown): never {
  if (error instanceof EditorProgressError) {
    throw new HttpsError(error.reason === "CLIENT_UPGRADE_REQUIRED" ?
      "failed-precondition" : "invalid-argument", error.reason,
    {reason: error.reason});
  }
  throw error;
}

function timestampIso(value: unknown): string {
  if (!(value instanceof Timestamp)) fail("CONFIG_UNAVAILABLE");
  return value.toDate().toISOString();
}

function apiDraft(id: string, raw: FirebaseFirestore.DocumentData) {
  return {
    editorSchemaVersion: 2 as const,
    editorDraftId: id,
    providerId: raw.providerId as string,
    packageId: null,
    basePackageRevision: null,
    state: raw.state as "incomplete" | "completed",
    progress: raw.progress,
    currentStep: raw.currentStep,
    completedPackageId: raw.completedPackageId,
    completedPackageRevision: raw.completedPackageRevision,
    revision: raw.revision as number,
    createdAt: timestampIso(raw.createdAt),
    updatedAt: timestampIso(raw.updatedAt),
  };
}

async function authorizedProvider(tx: FirebaseFirestore.Transaction, uid: string):
  Promise<string> {
  const profile = (await tx.get(db.collection("users").doc(uid))).data();
  if (profile?.role !== USER_ROLES.provider || typeof profile.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/u.test(profile.providerId)) {
    fail("PROVIDER_NOT_APPROVED");
  }
  const providerRef = db.collection("providers").doc(profile.providerId);
  return authorizeProviderForPackageManagement({
    actorUid: uid, providerSnapshot: await tx.get(providerRef),
  }).providerId;
}

function requireOwnPrivateDraft(raw: FirebaseFirestore.DocumentData | undefined,
  actorUid: string, providerId: string, allowCompleted = false,
): asserts raw is FirebaseFirestore.DocumentData {
  // No information about another provider's private draft is disclosed.
  if (!raw || raw.ownerUid !== actorUid || raw.providerId !== providerId ||
      raw.editorSchemaVersion !== 2 || raw.packageId !== null ||
      raw.basePackageRevision !== null) fail("RESOURCE_NOT_FOUND", "not-found");
  if (raw.state !== "incomplete" && !(allowCompleted && raw.state === "completed")) {
    fail("EDITOR_DRAFT_COMPLETED");
  }
}

/**
 * Only unbound editor progress is supported. No canonical package write,
 * catalog authorization, media attachment or publication occurs.
 */
export const saveProviderPackageEditorDraft = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 60}, async (request) => {
    const actor = requireAuth(request);
    enforceAppCheck(request.app);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "packages.saveProviderPackageEditorDraft", limit: 60, windowSeconds: 3600,
    });

    const newReference = db.collection(DRAFTS).doc();
    // Structural validation is rerun inside the transaction against the
    // authoritative, current server policy limits.
    return db.runTransaction(async (tx) => {
      const providerId = await authorizedProvider(tx, actor.uid);
      const policy = (await tx.get(db.doc(POLICY_PATH))).data();
      const limits = readLimits(policy);
      let input: SaveEditorProgressInput;
      try {
        input = parseSaveEditorProgress(request.data, limits);
        assertNoUnverifiedEditorAssets(input.progress);
      } catch (error) { return mapInputFailure(error); }
      await requireMaintenanceOpen(tx, db, "publication");

      const operationId = digest([actor.uid, "saveProviderPackageEditorDraft",
        input.idempotencyKey]);
      const opReference = db.collection(OPERATIONS).doc(operationId);
      const prior = (await tx.get(opReference)).data();
      const requestHash = digest(input);
      if (prior) {
        if (prior.actorUid !== actor.uid || prior.providerId !== providerId ||
            prior.requestHash !== requestHash) fail("IDEMPOTENCY_CONFLICT", "already-exists");
        return {draft: prior.result};
      }

      const draftRef = db.collection(DRAFTS).doc(input.editorDraftId ?? newReference.id);
      const current = (await tx.get(draftRef)).data();
      if (input.editorDraftId === null && current) fail("REVISION_CONFLICT", "aborted");
      if (input.editorDraftId !== null) {
        requireOwnPrivateDraft(current, actor.uid, providerId);
        if (current.revision !== input.expectedRevision) fail("REVISION_CONFLICT", "aborted");
      }
      const quotaRef = db.collection(QUOTAS).doc(providerId);
      const quota = input.editorDraftId === null ? (await tx.get(quotaRef)).data() : undefined;
      if (input.editorDraftId === null && quota !== undefined &&
          (!Number.isSafeInteger(quota.count) || quota.count < 0 ||
           quota.count >= MAX_PRIVATE_DRAFTS)) fail("EDITOR_DRAFT_QUOTA_REACHED");
      const now = Timestamp.now();
      const revision = input.editorDraftId === null ? 1 : input.expectedRevision + 1;
      if (!Number.isSafeInteger(revision)) fail("REVISION_CONFLICT", "aborted");
      const stored = {
        editorSchemaVersion: 2, ownerUid: actor.uid, providerId,
        packageId: null, basePackageRevision: null,
        state: "incomplete", progress: input.progress, currentStep: input.currentStep,
        completedPackageId: null, completedPackageRevision: null,
        revision, createdAt: current?.createdAt ?? now, updatedAt: now,
      };
      const response = apiDraft(draftRef.id, stored);
      if (input.editorDraftId === null) {
        tx.create(draftRef, stored);
        tx.set(quotaRef, {count: (quota?.count ?? 0) + 1, updatedAt: now}, {merge: true});
      } else {
        tx.update(draftRef, {progress: stored.progress, currentStep: stored.currentStep,
          revision, updatedAt: now});
      }
      tx.create(opReference, {actorUid: actor.uid, providerId, requestHash,
        result: response, editorDraftId: draftRef.id, createdAt: now});
      recordMaintenanceAdmission(tx, db);
      return {draft: response};
    });
  },
);

export const getProviderPackageEditorDraft = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 60}, async (request) => {
    const actor = requireAuth(request);
    enforceAppCheck(request.app);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "packages.getProviderPackageEditorDraft", limit: 120, windowSeconds: 3600,
    });
    let id: string;
    try { id = parseGetEditorProgress(request.data); } catch (error) {
      return mapInputFailure(error);
    }
    // Existing private progress remains readable even during maintenance;
    // this transaction never creates/updates canonical package state.
    return db.runTransaction(async (tx) => {
      const providerId = await authorizedProvider(tx, actor.uid);
      const current = (await tx.get(db.collection(DRAFTS).doc(id))).data();
      requireOwnPrivateDraft(current, actor.uid, providerId, true);
      return {draft: apiDraft(id, current)};
    });
  },
);


/** Read only the signed-in provider's unbound private drafts; never list other owners. */
export const listProviderPackageEditorDrafts = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 60}, async (request) => {
    const actor = requireAuth(request);
    enforceAppCheck(request.app);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "packages.listProviderPackageEditorDrafts", limit: 60, windowSeconds: 3600,
    });
    try { parseListEditorProgress(request.data); } catch (error) {
      return mapInputFailure(error);
    }
    return db.runTransaction(async (tx) => {
      const providerId = await authorizedProvider(tx, actor.uid);
      const snapshots = await tx.get(db.collection(DRAFTS)
        .where("ownerUid", "==", actor.uid).where("state", "==", "incomplete")
        .limit(MAX_PRIVATE_DRAFTS + 1));
      if (snapshots.size > MAX_PRIVATE_DRAFTS) fail("DRAFT_QUOTA_RECONCILIATION_REQUIRED");
      const drafts = snapshots.docs.filter((doc) =>
        doc.data().providerId === providerId &&
        doc.data().editorSchemaVersion === 2 &&
        doc.data().packageId === null &&
        doc.data().basePackageRevision === null &&
        doc.data().state === "incomplete")
        .map((doc) => apiDraft(doc.id, doc.data()));
      drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return {drafts};
    });
  },
);

/** Permanent owner-requested cleanup; allowed during maintenance to recover quota. */
export const discardProviderPackageEditorDraft = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 60}, async (request) => {
    const actor = requireAuth(request);
    enforceAppCheck(request.app);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "packages.discardProviderPackageEditorDraft", limit: 60, windowSeconds: 3600,
    });
    let input: ReturnType<typeof parseDiscardEditorProgress>;
    try { input = parseDiscardEditorProgress(request.data); } catch (error) {
      return mapInputFailure(error);
    }
    return db.runTransaction(async (tx) => {
      const providerId = await authorizedProvider(tx, actor.uid);
      const requestHash = digest(input);
      const opId = digest([actor.uid, "discardProviderPackageEditorDraft", input.idempotencyKey]);
      const opRef = db.collection(OPERATIONS).doc(opId);
      const prior = (await tx.get(opRef)).data();
      if (prior) {
        if (prior.actorUid !== actor.uid || prior.providerId !== providerId ||
            prior.requestHash !== requestHash) fail("IDEMPOTENCY_CONFLICT", "already-exists");
        return {discarded: true, editorDraftId: input.editorDraftId};
      }
      const draftRef = db.collection(DRAFTS).doc(input.editorDraftId);
      const quotaRef = db.collection(QUOTAS).doc(providerId);
      const draft = (await tx.get(draftRef)).data();
      requireOwnPrivateDraft(draft, actor.uid, providerId);
      if (draft.revision !== input.expectedRevision) fail("REVISION_CONFLICT", "aborted");
      const quota = (await tx.get(quotaRef)).data();
      if (!quota || !Number.isSafeInteger(quota.count) ||
          quota.count < 1 || quota.count > MAX_PRIVATE_DRAFTS) {
        fail("DRAFT_QUOTA_RECONCILIATION_REQUIRED");
      }
      const now = Timestamp.now();
      tx.delete(draftRef);
      tx.update(quotaRef, {count: quota.count - 1, updatedAt: now});
      tx.create(opRef, {actorUid: actor.uid, providerId, requestHash,
        result: {discarded: true, editorDraftId: input.editorDraftId},
        editorDraftId: input.editorDraftId, createdAt: now});
      return {discarded: true, editorDraftId: input.editorDraftId};
    });
  },
);
