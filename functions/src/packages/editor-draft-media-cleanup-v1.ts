/** Internal-only bounded cleanup coordinator. Never export as a public worker. */
import {createHash, randomUUID} from "node:crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {
  lookupEditorDraftCleanupResourceV1, deleteEditorDraftCleanupResourceV1,
} from "../shared/cloudinary.js";
import {editorDraftUploadPlanV1} from "./editor-draft-upload-plan-v1.js";
import {validatePackageEditorProgress} from "./package-editor-progress-v2.js";
import {assertRegistrationAccess} from "./provider-editor-draft-media-registration-v1.js";

type Data = FirebaseFirestore.DocumentData;
type Tx = FirebaseFirestore.Transaction;
export const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 120000;
const PAGE = 4;
const DRAFTS = "providerPackageEditorDrafts";
const JOBS = "providerPackageEditorMediaCleanup";
const OPS = "providerPackageEditorOperations";
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const validId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
export function mediaLifecycleFailure(reason = "EDITOR_DRAFT_MEDIA_CLEANUP_REQUIRED"): never {
  throw new HttpsError("failed-precondition", reason, {reason});
}
export const mediaOperationHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const jobId = (draft: string, asset: string) => mediaOperationHash([draft, asset]);

export async function requireMediaLifecyclePolicyV1(tx: Tx, gate: string) {
  const policy = (await tx.get(db.doc("contractPolicies/providerPackageV2"))).data();
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!project || policy?.effectiveEnvironment !== project ||
      !Number.isSafeInteger(policy.revision) || policy.revision < 1 ||
      policy.featureGates?.[gate] !== true) mediaLifecycleFailure();
}

export function assertMediaLifecycleDraftV1(draft: Data | undefined) {
  if (!draft || draft.mediaLifecycleVersion !== 1 ||
      draft.editorSchemaVersion !== 2 || draft.packageId !== null ||
      draft.basePackageRevision !== null || draft.completedPackageId != null ||
      !["incomplete", "discarding", "discarded"].includes(draft.state) ||
      draft.mediaPromotionOperationId) mediaLifecycleFailure();
}

function scopeOf(reservation: Data, draftId: string, assetId: string) {
  const scope = {
    ownerUid: reservation.ownerUid as string, providerId: reservation.providerId as string,
    editorDraftId: draftId, assetId, kind: reservation.kind as "package" | "theme",
    themeId: reservation.themeId as string | null,
  };
  let publicId;
  try { publicId = editorDraftUploadPlanV1(scope, 1).public_id; } catch {
    return mediaLifecycleFailure();
  }
  if (reservation.editorDraftId !== draftId || reservation.assetId !== assetId ||
      reservation.cloudinaryPublicId !== publicId ||
      !Number.isSafeInteger(reservation.issuedAtMs) || reservation.issuedAtMs < 1 ||
      !Number.isSafeInteger(reservation.expiresAtMs) ||
      reservation.expiresAtMs <= reservation.issuedAtMs) mediaLifecycleFailure();
  return {...scope, cloudinaryPublicId: publicId};
}

function progressIds(draft: Data): string[] {
  let progress;
  try { progress = validatePackageEditorProgress(draft.progress,
    {maxSpecificOccasions: 100, maxThemeImages: 4}); } catch {
    return mediaLifecycleFailure();
  }
  return [...(progress.marketingAssetIds as string[] ?? []),
    ...((progress.themes ?? []) as {assetIds: string[]}[]).flatMap((t) => t.assetIds)];
}

/** The marker is created with the upload reservation, never inferred from URLs.
 * Existing writers cannot admit draft URLs. New promotion must pin this same
 * reservation transactionally before external work. Legacy markers are NOT backfilled.
 * Bounded canonical inventory is a second, independent fail-closed safety check.
 */
export async function assertCanonicalMediaUnusedV1(tx: Tx, reservation: Data) {
  const protection = reservation.canonicalProtection;
  if (protection?.version !== 1 || protection.state !== "draft_only" ||
      protection.packageId !== null || protection.operationId !== null) mediaLifecycleFailure();
  const packages = await tx.get(db.collection("packages")
    .where("providerId", "==", reservation.providerId).limit(101));
  if (packages.size > 100) mediaLifecycleFailure("MEDIA_REFERENCE_RECONCILIATION_REQUIRED");
  for (const doc of packages.docs) {
    const pkg = doc.data();
    if (pkg.providerId !== reservation.providerId || pkg.editorMediaReferences != null ||
        Object.keys(pkg).some((key) => /media|image|cloudinary|asset/iu.test(key) &&
          !["imageUrl", "imageUrls"].includes(key))) {
      mediaLifecycleFailure();
    }
    const urls: string[] = [];
    const collect = (values: unknown, max: number) => {
      if (values === undefined) return;
      if (!Array.isArray(values) || values.length > max ||
          values.some((url) => typeof url !== "string")) mediaLifecycleFailure();
      urls.push(...values);
    };
    if (pkg.imageUrl !== undefined && typeof pkg.imageUrl !== "string") mediaLifecycleFailure();
    if (pkg.imageUrl) urls.push(pkg.imageUrl);
    collect(pkg.imageUrls, 8);
    if (pkg.themeOptions !== undefined) {
      if (!Array.isArray(pkg.themeOptions) || pkg.themeOptions.length > 12) mediaLifecycleFailure();
      for (const theme of pkg.themeOptions) {
        if (!theme || typeof theme !== "object" || Object.keys(theme).some((key) =>
          !["id", "name", "description", "imageUrls"].includes(key))) mediaLifecycleFailure();
        collect(theme.imageUrls, 4);
      }
    }
    for (const url of urls) {
      if (!url) continue;
      try {
        if (decodeURIComponent(new URL(url).pathname)
          .includes("/" + reservation.cloudinaryPublicId)) mediaLifecycleFailure();
      } catch { mediaLifecycleFailure(); }
    }
  }
}

async function cleanupEvidence(tx: Tx, draftId: string, assetId: string) {
  const draftRef = db.collection(DRAFTS).doc(draftId);
  const reservationRef = draftRef.collection("mediaUploadReservations").doc(assetId);
  const assetRef = draftRef.collection("mediaAssets").doc(assetId);
  const draft = (await tx.get(draftRef)).data();
  const reservation = (await tx.get(reservationRef)).data();
  const asset = (await tx.get(assetRef)).data();
  assertMediaLifecycleDraftV1(draft);
  if (!reservation) mediaLifecycleFailure();
  const scope = scopeOf(reservation, draftId, assetId);
  if (draft!.ownerUid !== scope.ownerUid || draft!.providerId !== scope.providerId ||
      (draft!.state === "incomplete" && progressIds(draft!).includes(assetId))) {
    mediaLifecycleFailure("EDITOR_DRAFT_MEDIA_IN_USE");
  }
  if (asset && (asset.assetId !== assetId || asset.ownerUid !== scope.ownerUid ||
      asset.providerId !== scope.providerId || asset.editorDraftId !== draftId ||
      asset.kind !== scope.kind || asset.themeId !== scope.themeId ||
      asset.cloudinaryPublicId !== scope.cloudinaryPublicId ||
      !["verified", "cleanup_pending", "retired"].includes(asset.state) ||
      typeof asset.cloudinaryAssetId !== "string" || !ID.test(asset.cloudinaryAssetId) ||
      !Number.isSafeInteger(asset.cloudinaryVersion) || asset.cloudinaryVersion < 1 ||
      asset.cloudinaryAssetId !== reservation.cloudinaryAssetId ||
      asset.cloudinaryVersion !== reservation.cloudinaryVersion)) mediaLifecycleFailure();
  if (reservation.state === "registered" && !asset) mediaLifecycleFailure();
  await assertCanonicalMediaUnusedV1(tx, reservation);
  return {draftRef, reservationRef, assetRef, draft: draft!, reservation, asset, scope};
}

async function scheduleInTransaction(tx: Tx, draftId: string, assetId: string,
  discard = false) {
  await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
  const evidence = await cleanupEvidence(tx, draftId, assetId);
  const {draft, reservation, scope} = evidence;
  if (!discard && draft.state !== "incomplete") mediaLifecycleFailure();
  if (discard && draft.state !== "discarding") mediaLifecycleFailure();
  const ref = db.collection(JOBS).doc(jobId(draftId, assetId));
  const prior = (await tx.get(ref)).data();
  if (prior) {
    if (prior.ownerUid !== scope.ownerUid || prior.providerId !== scope.providerId ||
        prior.editorDraftId !== draftId || prior.assetId !== assetId ||
        prior.cloudinaryPublicId !== scope.cloudinaryPublicId) mediaLifecycleFailure();
    return ref.id;
  }
  if (!["reserved", "registered", "revoked"].includes(reservation.state) ||
      (!discard && reservation.state === "reserved" && reservation.expiresAtMs > Date.now())) {
    mediaLifecycleFailure();
  }
  const count = draft.mediaCleanupPendingCount ?? 0;
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(count + 1)) {
    mediaLifecycleFailure();
  }
  tx.create(ref, {...scope, state: "pending", counted: true, attempts: 0,
    notBeforeMs: reservation.expiresAtMs + CLEANUP_GRACE_MS,
    nextRunAtMs: reservation.expiresAtMs + CLEANUP_GRACE_MS,
    cloudinaryAssetId: evidence.asset?.cloudinaryAssetId ?? null,
    cloudinaryVersion: evidence.asset?.cloudinaryVersion ?? null,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now()});
  tx.update(evidence.reservationRef, {state: "cleanup_pending", cleanupJobId: ref.id});
  if (evidence.asset) tx.update(evidence.assetRef, {state: "cleanup_pending"});
  tx.update(evidence.draftRef, {mediaCleanupPendingCount: count + 1});
  return ref.id;
}

/** Authenticated boundary must supply actorUid. No client proof or URLs accepted. */
export async function scheduleEditorDraftMediaCleanupV1(input: {
  actorUid: string; editorDraftId: string; expectedRevision: number; assetId: string;
}) {
  if (!validId(input.actorUid) || !validId(input.editorDraftId) || !validId(input.assetId) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    mediaLifecycleFailure();
  }
  return db.runTransaction(async (tx) => {
    const provider = await assertRegistrationAccess(tx, {...input, kind: "package", themeId: null});
    const reservation = (await tx.get(db.collection(DRAFTS).doc(input.editorDraftId)
      .collection("mediaUploadReservations").doc(input.assetId))).data();
    if (reservation?.ownerUid !== input.actorUid || reservation.providerId !== provider) {
      mediaLifecycleFailure();
    }
    return {jobId: await scheduleInTransaction(tx, input.editorDraftId, input.assetId)};
  });
}

/** One job and one immutable resource per invocation. No collection scan. */
export async function runEditorDraftMediaCleanupV1(
  input: {editorDraftId: string; assetId: string},
) {
  if (!validId(input.editorDraftId) || !validId(input.assetId)) mediaLifecycleFailure();
  const ref = db.collection(JOBS).doc(jobId(input.editorDraftId, input.assetId));
  const token = randomUUID();
  const claim = await db.runTransaction(async (tx) => {
    await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
    const job = (await tx.get(ref)).data();
    if (!job || job.editorDraftId !== input.editorDraftId || job.assetId !== input.assetId) {
      mediaLifecycleFailure();
    }
    const evidence = await cleanupEvidence(tx, input.editorDraftId, input.assetId);
    if (job.ownerUid !== evidence.scope.ownerUid || job.providerId !== evidence.scope.providerId ||
        job.cloudinaryPublicId !== evidence.scope.cloudinaryPublicId ||
        evidence.reservation.cleanupJobId !== ref.id ||
        !["cleanup_pending", "retired"].includes(evidence.reservation.state) ||
        job.notBeforeMs !== evidence.reservation.expiresAtMs + CLEANUP_GRACE_MS ||
        !Number.isSafeInteger(job.attempts) || job.attempts < 0 ||
        typeof job.counted !== "boolean" ||
        (evidence.asset && (job.cloudinaryAssetId !== evidence.asset.cloudinaryAssetId ||
          job.cloudinaryVersion !== evidence.asset.cloudinaryVersion))) mediaLifecycleFailure();
    if (job.notBeforeMs > Date.now()) return {status: "waiting" as const};
    if (job.state === "reconciled" && job.nextReconcileAtMs > Date.now()) {
      return {status: "reconciled" as const};
    }
    if (job.state === "deleting" && job.leaseUntilMs > Date.now()) return {status: "busy" as const};
    if (!["pending", "retry", "deleting", "reconciled"].includes(job.state)) {
      mediaLifecycleFailure();
    }
    if (!job.counted) {
      const count = evidence.draft.mediaCleanupPendingCount ?? 0;
      if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(count + 1)) {
        mediaLifecycleFailure();
      }
      tx.update(evidence.draftRef, {mediaCleanupPendingCount: count + 1});
    }
    tx.update(ref, {state: "deleting", counted: true,
      leaseToken: token, leaseUntilMs: Date.now() + LEASE_MS,
      nextRunAtMs: Date.now() + LEASE_MS,
      attempts: job.attempts + 1, updatedAt: Timestamp.now()});
    return {status: "claimed" as const, job};
  });
  if (claim.status !== "claimed") return {state: claim.status};
  try {
    // These network operations are deliberately outside every transaction.
    const resource = await lookupEditorDraftCleanupResourceV1(claim.job.cloudinaryPublicId);
    if (resource) {
      if (resource.publicId !== claim.job.cloudinaryPublicId || !ID.test(resource.assetId) ||
          !Number.isSafeInteger(resource.version) || resource.version < 1 ||
          (claim.job.cloudinaryAssetId !== null &&
            (claim.job.cloudinaryAssetId !== resource.assetId ||
              claim.job.cloudinaryVersion !== resource.version))) mediaLifecycleFailure();
      await db.runTransaction(async (tx) => {
        await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
        const job = (await tx.get(ref)).data();
        await cleanupEvidence(tx, input.editorDraftId, input.assetId);
        if (job?.leaseToken !== token || job.state !== "deleting") mediaLifecycleFailure();
        if (job.cloudinaryAssetId !== null &&
            (job.cloudinaryAssetId !== resource.assetId ||
              job.cloudinaryVersion !== resource.version)) {
          mediaLifecycleFailure();
        }
        tx.update(ref, {cloudinaryAssetId: resource.assetId, cloudinaryVersion: resource.version});
      });
      await deleteEditorDraftCleanupResourceV1(resource.assetId, resource.publicId);
    }
    await db.runTransaction(async (tx) => {
      const job = (await tx.get(ref)).data();
      const e = await cleanupEvidence(tx, input.editorDraftId, input.assetId);
      if (job?.leaseToken !== token || job.state !== "deleting") mediaLifecycleFailure();
      const count = e.draft.mediaCleanupPendingCount;
      if (job.counted && (!Number.isSafeInteger(count) || count < 1)) mediaLifecycleFailure();
      tx.update(ref, {state: "reconciled", counted: false, leaseUntilMs: 0,
        outcome: resource ? "deleted" : "missing", nextReconcileAtMs: Date.now() + CLEANUP_GRACE_MS,
        nextRunAtMs: Date.now() + CLEANUP_GRACE_MS,
        updatedAt: Timestamp.now()});
      tx.update(e.reservationRef, {state: "retired", reconciledAt: Timestamp.now()});
      if (e.asset) tx.update(e.assetRef, {state: "retired"});
      if (job.counted) tx.update(e.draftRef, {mediaCleanupPendingCount: count - 1});
    });
    return {state: "reconciled"};
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const job = (await tx.get(ref)).data();
      if (job?.leaseToken === token && job.state === "deleting") {
        tx.update(ref, {state: "retry", leaseUntilMs: 0,
          nextRunAtMs: Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(job.attempts, 12)),
          lastFailure: "CLEANUP_NOT_CONFIRMED", updatedAt: Timestamp.now()});
      }
    });
    throw error;
  }
}

/** Trusted worker entry: discover at most four expired, unregistered uploads. */
export async function reconcileExpiredEditorDraftMediaV1() {
  const rows = await db.runTransaction(async (tx) => {
    await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
    const cursorRef = db.collection("providerPackageEditorMediaCleanupControl").doc("expired");
    const cursor = (await tx.get(cursorRef)).data();
    let query = db.collectionGroup("mediaUploadReservations")
      .where("state", "==", "reserved")
      .where("expiresAtMs", "<=", Date.now() - CLEANUP_GRACE_MS)
      .orderBy("expiresAtMs").orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor?.path && Number.isSafeInteger(cursor.expiresAtMs)) {
      query = query.startAfter(cursor.expiresAtMs, db.doc(cursor.path));
    }
    const page = await tx.get(query);
    const last = page.docs.at(-1);
    // Wrap after a complete pass, so quarantined legacy records cannot starve
    // later candidates and newly discovered older records are eventually visited.
    tx.set(cursorRef, {path: page.size === PAGE ? last!.ref.path : null,
      expiresAtMs: page.size === PAGE ? last!.data().expiresAtMs : null,
      updatedAt: Timestamp.now()});
    return page;
  });
  const results = [];
  for (const doc of rows.docs) {
    const value = doc.data();
    try {
      const scope = scopeOf(value, value.editorDraftId, doc.id);
      if (doc.ref.path !== `${DRAFTS}/${scope.editorDraftId}/mediaUploadReservations/${doc.id}`) {
        mediaLifecycleFailure();
      }
      await db.runTransaction(async (tx) => {
        const draft = (await tx.get(db.collection(DRAFTS).doc(scope.editorDraftId))).data();
        return scheduleInTransaction(tx, scope.editorDraftId, doc.id,
          draft?.state === "discarding");
      });
      results.push({assetId: doc.id, state: "queued"});
    } catch {
      // Fail closed per item, without starving the other items in this bounded batch.
      results.push({assetId: doc.id, state: "review_required"});
    }
  }
  return results;
}

/** No public trigger: an IAM-protected scheduler must eventually call this. */
export async function drainEditorDraftMediaCleanupV1() {
  const rows = await db.runTransaction(async (tx) => {
    await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
    return tx.get(db.collection(JOBS).where("nextRunAtMs", "<=", Date.now()).limit(PAGE));
  });
  const results = [];
  for (const doc of rows.docs) {
    const job = doc.data();
    try {
      if (jobId(job.editorDraftId, job.assetId) !== doc.id) mediaLifecycleFailure();
      results.push(await runEditorDraftMediaCleanupV1(
        {editorDraftId: job.editorDraftId, assetId: job.assetId}));
    } catch {
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(doc.ref)).data();
        if (current && current.nextRunAtMs <= Date.now() &&
            !(current.state === "deleting" && current.leaseUntilMs > Date.now())) {
          tx.update(doc.ref, {nextRunAtMs: Date.now() + 3600000,
            lastFailure: "EVIDENCE_REVIEW_REQUIRED"});
        }
      });
      results.push({state: "retry_or_review_required"});
    }
  }
  await drainEditorDraftMediaDiscardAuditsV1();
  return results;
}

/** Queue/audit-only progress never performs additional Cloudinary operations. */
export async function drainEditorDraftMediaDiscardAuditsV1() {
  const rows = await db.runTransaction(async (tx) => {
    await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
    return tx.get(db.collection(DRAFTS).where("state", "==", "discarding")
      .where("discardNextAuditAtMs", "<=", Date.now()).limit(PAGE));
  });
  for (const doc of rows.docs) {
    try {
      const op = (await db.runTransaction((tx) => tx.get(db.collection(OPS)
        .doc(doc.data().discardOperationId)))).data();
      if (!op) mediaLifecycleFailure();
      await reconcileEditorDraftMediaDiscardV1({actorUid: op.actorUid, editorDraftId: doc.id,
        expectedRevision: op.expectedRevision, idempotencyKey: op.idempotencyKey}, true);
    } catch {
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(doc.ref)).data();
        if (current?.state === "discarding") {
          tx.update(doc.ref, {discardNextAuditAtMs: Date.now() + 3600000,
            discardLastFailure: "EVIDENCE_REVIEW_REQUIRED"});
        }
      });
    }
  }
}

/** Called only after the existing discard transaction authorizes owner/revision/quota. */
export async function beginEditorDraftMediaDiscardV1(tx: Tx,
  draftRef: FirebaseFirestore.DocumentReference, draft: Data,
  opRef: FirebaseFirestore.DocumentReference, operation: Data) {
  await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
  assertMediaLifecycleDraftV1(draft);
  if (draft.state !== "incomplete") mediaLifecycleFailure();
  tx.update(draftRef, {state: "discarding", discardOperationId: opRef.id,
    discardNextAuditAtMs: Date.now(),
    updatedAt: Timestamp.now()});
  tx.create(opRef, {...operation, state: "pending_cleanup", createdAt: Timestamp.now()});
  return {discarded: false, cleanupPending: true, editorDraftId: draftRef.id};
}

/** Bounded continuation; provider retries use the same discard operation key. */
export async function reconcileEditorDraftMediaDiscardV1(input: {
  actorUid: string; editorDraftId: string; expectedRevision: number; idempotencyKey: string;
}, auditOnly = false) {
  const draftRef = db.collection(DRAFTS).doc(input.editorDraftId);
  const opId = mediaOperationHash([input.actorUid, "discardProviderPackageEditorDraft",
    input.idempotencyKey]);
  const opRef = db.collection(OPS).doc(opId);
  const jobs = await db.runTransaction(async (tx) => {
    await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaCleanupWrites");
    const draft = (await tx.get(draftRef)).data();
    const op = (await tx.get(opRef)).data();
    if (op?.actorUid !== input.actorUid || op.editorDraftId !== input.editorDraftId ||
        draft?.discardOperationId !== opId || draft.ownerUid !== input.actorUid ||
        draft.providerId !== op.providerId || draft.revision !== input.expectedRevision) {
      mediaLifecycleFailure();
    }
    assertMediaLifecycleDraftV1(draft);
    if (draft.state === "discarded" && op.state === "completed") return [];
    if (draft.state !== "discarding" || op.state !== "pending_cleanup") mediaLifecycleFailure();
    const rows = await tx.get(draftRef.collection("mediaUploadReservations")
      .where("state", "in", ["reserved", "registered", "revoked", "cleanup_pending"]).limit(PAGE));
    return rows.docs.map((doc) => doc.id);
  });
  for (const assetId of jobs) {
    await db.runTransaction((tx) => scheduleInTransaction(tx, input.editorDraftId, assetId, true));
    if (!auditOnly) {
      await runEditorDraftMediaCleanupV1({editorDraftId: input.editorDraftId, assetId});
    }
  }
  return db.runTransaction(async (tx) => {
    const draft = (await tx.get(draftRef)).data();
    const op = (await tx.get(opRef)).data();
    if (draft?.discardOperationId !== opId || op?.actorUid !== input.actorUid ||
        draft.ownerUid !== input.actorUid || draft.providerId !== op.providerId) {
      mediaLifecycleFailure();
    }
    if (draft.state === "discarded" && op.state === "completed") {
      return {discarded: true, editorDraftId: input.editorDraftId};
    }
    assertMediaLifecycleDraftV1(draft);
    const reservations = await tx.get(draftRef.collection("mediaUploadReservations")
      .where("state", "!=", "retired").limit(1));
    const assets = await tx.get(draftRef.collection("mediaAssets")
      .where("state", "!=", "retired").limit(1));
    const quotaRef = db.collection("providerPackageEditorQuotas").doc(draft.providerId);
    const quota = (await tx.get(quotaRef)).data();
    if (!reservations.empty || !assets.empty || (draft.mediaCleanupPendingCount ?? 0) !== 0) {
      tx.update(draftRef, {discardNextAuditAtMs: Date.now() + 60000});
      return {discarded: false, cleanupPending: true, editorDraftId: input.editorDraftId};
    }
    // Audit every document over bounded, resumable pages. An inequality query
    // excludes missing state fields and cannot by itself prove complete coverage.
    const cursors: Record<string, unknown> = {};
    let audited = true;
    for (const collection of ["mediaUploadReservations", "mediaAssets"]) {
      const field = collection + "Cursor";
      const done = collection + "Audited";
      if (op[done] === true) continue;
      let query = draftRef.collection(collection).orderBy(FieldPath.documentId()).limit(PAGE + 1);
      if (op[field]) query = query.startAfter(op[field]);
      const page = await tx.get(query);
      for (const doc of page.docs.slice(0, PAGE)) {
        const value = doc.data();
        if (value.state !== "retired" || value.ownerUid !== draft.ownerUid ||
            value.providerId !== draft.providerId || value.editorDraftId !== input.editorDraftId ||
            value.assetId !== doc.id) mediaLifecycleFailure();
        if (collection === "mediaUploadReservations") {
          scopeOf(value, input.editorDraftId, doc.id);
          if (value.canonicalProtection?.version !== 1 ||
              value.canonicalProtection.state !== "draft_only") mediaLifecycleFailure();
        }
        const reservation = collection === "mediaUploadReservations" ? value :
          (await tx.get(draftRef.collection("mediaUploadReservations").doc(doc.id))).data();
        const jobRef = db.collection(JOBS).doc(jobId(input.editorDraftId, doc.id));
        const job = (await tx.get(jobRef)).data();
        if (!reservation || reservation.state !== "retired" ||
            reservation.cleanupJobId !== jobRef.id || job?.state !== "reconciled" ||
            job.counted !== false || job.ownerUid !== draft.ownerUid ||
            job.providerId !== draft.providerId || job.editorDraftId !== input.editorDraftId ||
            job.assetId !== doc.id || job.cloudinaryPublicId !== reservation.cloudinaryPublicId) {
          mediaLifecycleFailure();
        }
        await assertCanonicalMediaUnusedV1(tx, reservation);
      }
      if (page.size > PAGE) {
        cursors[field] = page.docs[PAGE - 1].id;
        audited = false;
      } else cursors[done] = true;
    }
    if (!audited) {
      tx.update(opRef, cursors);
      tx.update(draftRef, {discardNextAuditAtMs: Date.now() + 1000});
      return {discarded: false, cleanupPending: true, editorDraftId: input.editorDraftId};
    }
    if (draft.state !== "discarding" || op.state !== "pending_cleanup" ||
        !Number.isSafeInteger(quota?.count) || quota!.count < 1 || quota!.count > 20) {
      mediaLifecycleFailure();
    }
    // Keep a parent tombstone and scoped audit subcollections: no orphaned
    // subcollections, no ID reuse, and delayed upload reconciliation stays possible.
    tx.update(draftRef, {state: "discarded", progress: {}, updatedAt: Timestamp.now()});
    tx.update(quotaRef, {count: quota!.count - 1, updatedAt: Timestamp.now()});
    tx.update(opRef, {state: "completed", completedAt: Timestamp.now()});
    return {discarded: true, editorDraftId: input.editorDraftId};
  });
}
