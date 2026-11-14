import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onCall, type CallableRequest} from "firebase-functions/v2/https";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {correlationIdFromCallable} from "../shared/security-events.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {authorizeProviderForPackageManagement} from "./package-domain.js";
import {parseOccasionReview, parseOccasionSuggestion} from "./occasion-suggestion-v2-validation.js";
import {normalizeSuggestionName, decideSuggestionSubmission} from
  "./provider-occasion-suggestion-v2-domain.js";
import {digest, fail, parseSuggestionPage, readSuggestionCursor, signSuggestionCursor,
  suggestionWritePolicy} from "./occasion-suggestion-v2-core.js";

type Tx = FirebaseFirestore.Transaction;
type Data = FirebaseFirestore.DocumentData;
const suggestions = db.collection("providerOccasionSuggestions");
const catalog = db.collection("occasionCatalog").doc("current");
const policy = db.collection("contractPolicies").doc("providerPackageV2");
const cursorSecret = defineSecret("FEASTA_OCCASION_SUGGESTION_CURSOR_HMAC_KEY");

async function actor(request: CallableRequest, admin: boolean, scope: string) {
  const {uid} = requireAuth(request);
  await requireRole(uid, [admin ? "admin" : "provider"]);
  await enforceCallableRateLimit(request, {scope, limit: 60, windowSeconds: 3600});
  return uid;
}
async function provider(tx: Tx, uid: string) {
  const user = (await tx.get(db.collection("users").doc(uid))).data();
  if (resolveBackendAccountState({authDisabled: false, profile: user,
    allowedRoles: ["provider"]}).kind !== "active") {
    fail("PROVIDER_NOT_APPROVED", "failed-precondition");
  }
  if (typeof user?.providerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(
    user.providerId)) fail("PROVIDER_NOT_APPROVED", "permission-denied");
  return authorizeProviderForPackageManagement({actorUid: uid,
    providerSnapshot: await tx.get(db.collection("providers").doc(user.providerId))});
}
async function adminInTransaction(tx: Tx, uid: string) {
  const user = (await tx.get(db.collection("users").doc(uid))).data();
  if (resolveBackendAccountState({authDisabled: false, profile: user,
    allowedRoles: ["admin"]}).kind !== "active") fail("ADMIN_REQUIRED", "permission-denied");
}
function revision(data: Data | undefined): number {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
    data.activationState !== "stable") fail("CONFIG_UNAVAILABLE");
  return data.revision;
}
function item(id: string, data: Data) {
  const utc = (value: unknown) => {
    if (!(value instanceof Timestamp)) fail("CONFIG_UNAVAILABLE");
    return value.toDate().toISOString();
  };
  return {suggestionId: id, providerId: data.providerId, submittedBy: data.submittedBy,
    name: data.name, normalizedName: data.normalizedName,
    ...(data.reason === undefined ? {} : {reason: data.reason}), status: data.status,
    resolvedOccasionId: data.resolvedOccasionId, reviewReason: data.reviewReason,
    reviewedBy: data.reviewedBy, reviewedAt: data.reviewedAt === null ? null : utc(data.reviewedAt),
    revision: data.revision, createdAt: utc(data.createdAt), updatedAt: utc(data.updatedAt)};
}
function operation(uid: string, name: string, key: string) {
  return db.collection("occasionSuggestionOperations").doc(digest([uid, name, key]));
}
function replay(data: Data | undefined, hash: string) {
  if (!data) return null;
  if (data.hash !== hash) fail("IDEMPOTENCY_CONFLICT", "already-exists");
  return data.result;
}

/** Atomic provider submission; authorization is rechecked inside the transaction. */
export const submitProviderOccasionSuggestion = onCall(appCheckCallableOptions, async (request) => {
  const uid = await actor(request, false, "occasionSuggestions.submit");
  const input = parseOccasionSuggestion(request.data);
  const hash = digest(input);
  const op = operation(uid, "submit", input.idempotencyKey);
  const newRef = suggestions.doc();
  return db.runTransaction(async (tx) => {
    const owner = await provider(tx, uid);
    const limits = suggestionWritePolicy((await tx.get(policy)).data());
    const original = replay((await tx.get(op)).data(), hash);
    if (original) return {outcome: "idempotent_replay", originalOutcome: original.outcome,
      result: original};
    // Every submission and moderation reads/writes this shared catalog generation.
    // The provider guard serializes all new submissions for this provider.
    const guard = db.collection("occasionSuggestionProviderGuards").doc(owner.providerId);
    const guardData = (await tx.get(guard)).data();
    if (guardData && (!Number.isSafeInteger(guardData.revision) ||
      guardData.revision < 1 || guardData.revision >= Number.MAX_SAFE_INTEGER)) {
      fail("CONFIG_UNAVAILABLE");
    }
    const catalogRevision = revision((await tx.get(catalog)).data());
    const canonical = (await tx.get(db.collection("occasions"))).docs;
    const own = (await tx.get(suggestions.where("providerId", "==", owner.providerId))).docs;
    const now = Timestamp.now();
    const normalizedName = normalizeSuggestionName(input.name);
    const decision = decideSuggestionSubmission({normalizedName,
      catalog: canonical.map((d) => ({...d.data(), id: d.id})) as unknown as
        Parameters<typeof decideSuggestionSubmission>[0]["catalog"],
      ownSuggestions: own.map((d) => ({...d.data(), suggestionId: d.id})) as unknown as
        Parameters<typeof decideSuggestionSubmission>[0]["ownSuggestions"],
      pendingCount: own.filter((d) => d.data().status === "pending").length,
      newSubmissionCount24h: own.filter((d) => {
        const date = d.data().createdAt;
        if (!(date instanceof Timestamp)) fail("CONFIG_UNAVAILABLE");
        return date.toMillis() > now.toMillis() - 86400000;
      }).length, maxPending: limits.pending, maxNewSubmissions24h: limits.daily});
    let result;
    if (decision.kind === "canonical_match") {
      const target = canonical.find((d) => d.id === decision.occasionId)!.data();
      result = {outcome: "canonical_match", match: {occasionId: decision.occasionId,
        label: target.label, active: target.active, revision: target.revision, catalogRevision}};
    } else if (decision.kind === "own_duplicate") {
      const existing = own.find((d) => d.id === decision.suggestionId)!;
      result = {outcome: "own_duplicate", suggestion: item(existing.id, existing.data())};
    } else {
      if (decision.kind !== "create") fail("RATE_LIMITED", "resource-exhausted");
      const data = {providerId: owner.providerId, submittedBy: uid, name: input.name,
        normalizedName, ...(input.reason ? {reason: input.reason} : {}), status: "pending",
        resolvedOccasionId: null, reviewReason: null, reviewedBy: null, reviewedAt: null,
        revision: 1, createdAt: now, updatedAt: now};
      tx.create(newRef, data);
      tx.set(guard, {revision: (guardData?.revision ?? 0) + 1,
        createdAt: guardData?.createdAt ?? now, updatedAt: now});
      result = {outcome: "created", suggestion: item(newRef.id, data)};
    }
    tx.create(op, {hash, result, actorUid: uid, revision: 1, createdAt: now, updatedAt: now,
      retainUntil: Timestamp.fromMillis(now.toMillis() + 30 * 86400000)});
    return result;
  });
});

function cursorKey() {
  const value = cursorSecret.value();
  const key = Buffer.from(value || "", "base64url");
  if (key.length < 32 || key.toString("base64url") !== value) fail("CONFIG_UNAVAILABLE");
  return key;
}
async function list(request: CallableRequest, admin: boolean) {
  const uid = await actor(request, admin,
    admin ? "occasionSuggestions.queue" : "occasionSuggestions.mine");
  const input = parseSuggestionPage(request.data, admin);
  const key = cursorKey();
  return db.runTransaction(async (tx) => {
    let providerId = "";
    if (admin) await adminInTransaction(tx, uid);
    else providerId = (await provider(tx, uid)).providerId;
    const direction = admin ? "asc" : "desc";
    const scope = JSON.stringify(
      [uid, providerId, input.status ?? null, direction, input.pageSize]);
    const position = readSuggestionCursor(scope, input.cursor, key);
    let query: FirebaseFirestore.Query = suggestions;
    if (!admin) query = query.where("providerId", "==", providerId);
    if (input.status) query = query.where("status", "==", input.status);
    query = query.orderBy("createdAt", direction)
      .orderBy(FieldPath.documentId(), direction);
    if (position) query = query.startAfter(
      new Timestamp(position.seconds, position.nanoseconds),
      position.id);
    const docs = (await tx.get(query.limit(input.pageSize + 1))).docs;
    const page = docs.slice(0, input.pageSize);
    const last = page.at(-1);
    const time = last?.data().createdAt as Timestamp;
    return {items: page.map((d) => item(d.id, d.data())),
      nextCursor: docs.length > input.pageSize && last ? signSuggestionCursor(scope,
        {seconds: time.seconds, nanoseconds: time.nanoseconds, id: last.id}, key) : null};
  });
}
export const listMyOccasionSuggestions = onCall(
  {...appCheckCallableOptions, secrets: [cursorSecret]}, (r) => list(r, false));
export const listOccasionSuggestionsForReview = onCall(
  {...appCheckCallableOptions, secrets: [cursorSecret]}, (r) => list(r, true));

export const reviewOccasionSuggestion = onCall(appCheckCallableOptions, async (request) => {
  const uid = await actor(request, true, "occasionSuggestions.review");
  const input = parseOccasionReview(request.data);
  const op = operation(uid, "review", input.idempotencyKey);
  const hash = digest(input);
  return db.runTransaction(async (tx) => {
    await adminInTransaction(tx, uid);
    suggestionWritePolicy((await tx.get(policy)).data());
    const original = replay((await tx.get(op)).data(), hash);
    if (original) return original;
    const ref = suggestions.doc(input.suggestionId);
    const before = (await tx.get(ref)).data();
    if (!before) fail("SUGGESTION_NOT_FOUND", "not-found");
    if (before.status !== "pending") fail("SUGGESTION_NOT_PENDING");
    const catalogBefore = revision((await tx.get(catalog)).data());
    if (before.revision !== input.expectedRevision ||
      catalogBefore !== input.expectedCatalogRevision) fail("REVISION_CONFLICT", "aborted");
    let targetId: string | null = null;
    let targetRevision: number | null = null;
    let targetActive: boolean | null = null;
    let catalogAfter = catalogBefore;
    let newTarget: Data | null = null;
    const now = Timestamp.now();
    if (input.decision === "approve_new") {
      const n = input.newOccasion;
      const names = [n.label, ...n.aliases].map(normalizeSuggestionName);

      const all = (await tx.get(db.collection("occasions"))).docs;
      if (all.some((d) => d.id === n.id || [d.data().label, ...(d.data().aliases ?? [])]
        .some((name) => names.includes(normalizeSuggestionName(name))))) {
        fail("CATALOG_NAME_CONFLICT", "already-exists");
      }
      // Reservations also serialize names against other catalog writers using this protocol.
      for (const name of names) {
        const reservation = db.collection("occasionNameReservations").doc(digest(name));
        if ((await tx.get(reservation)).exists) fail("CATALOG_NAME_CONFLICT", "already-exists");
      }
      for (const code of n.applicableServiceCategoryCodes) {
        const category = (await tx.get(db.collection("serviceCategories").doc(code))).data();
        if (!isServiceCategoryCode(code) || category?.code !== code ||
          category.status !== "active" ||
          !["catering", "addon"].includes(category.serviceType)) {
          fail("INVALID_SERVICE_CATEGORY", "invalid-argument");
        }
      }
      targetId = n.id; targetRevision = 1; targetActive = false;
      catalogAfter++;
      if (!Number.isSafeInteger(catalogAfter)) fail("CONFIG_UNAVAILABLE");
      newTarget = {...n, normalizedName: normalizeSuggestionName(n.label), active: false,
        moderationState: "approved", revision: 1, createdBy: uid, createdAt: now, updatedAt: now};
    } else if (input.decision !== "reject") {
      targetId = input.targetOccasionId;
      const target = (await tx.get(db.collection("occasions").doc(targetId))).data();
      if (!target) fail("OCCASION_NOT_FOUND", "not-found");
      if (target.revision !== input.targetExpectedRevision) fail("REVISION_CONFLICT", "aborted");
      targetRevision = target.revision;
      targetActive = target.active;
      if (target.id !== targetId || target.moderationState !== "approved" ||
        targetActive !== (input.decision === "map")) {
        fail("INVALID_REVIEW_TARGET", "invalid-argument");
      }
      if (input.decision === "approve_existing_inactive" &&
        ![target.label, ...target.aliases].some((name) =>
          normalizeSuggestionName(name) === before.normalizedName)) {
        fail("INVALID_REVIEW_TARGET", "invalid-argument");
      }
      if (input.decision === "map") {
        const snapshot = await tx.get(db.collection("providers").doc(before.providerId));
        const p = snapshot.data();
        if (!p) fail("INVALID_REVIEW_TARGET", "invalid-argument");
        authorizeProviderForPackageManagement({actorUid: p.ownerId, providerSnapshot: snapshot});
        const codes = p.serviceCategories;
        if (!Array.isArray(codes)) fail("INVALID_REVIEW_TARGET", "invalid-argument");
        let applicable = false;
        for (const code of codes) {
          const c = (await tx.get(db.collection("serviceCategories").doc(code))).data();
          if (c && c.code === code && c.status === "active" &&
            (p.providerServiceType === "both" || p.providerServiceType === c.serviceType) &&
            target.applicableServiceCategoryCodes.includes(code)) applicable = true;
        }
        if (!applicable) fail("INVALID_REVIEW_TARGET", "invalid-argument");
      }
    }
    const nextRevision = before.revision + 1;
    if (!Number.isSafeInteger(nextRevision)) fail("CONFIG_UNAVAILABLE");
    const status = input.decision === "reject" ? "rejected" :
      input.decision === "map" ? "mapped" : "approved";
    const result = {decision: input.decision, suggestionId: ref.id, status,
      resolvedOccasionId: targetId, revision: nextRevision, targetRevision,
      catalogRevision: catalogAfter, targetActive};
    if (newTarget && targetId) {
      tx.create(db.collection("occasions").doc(targetId), newTarget);
      for (const name of [newTarget.label, ...newTarget.aliases].map(normalizeSuggestionName)) {
        tx.create(db.collection("occasionNameReservations").doc(digest(name)),
          {occasionId: targetId, normalizedName: name, revision: 1,
            createdAt: now, updatedAt: now});
      }
      tx.update(catalog, {revision: catalogAfter, updatedAt: now});
    }
    tx.update(ref, {status, resolvedOccasionId: targetId, revision: nextRevision,
      reviewedBy: uid, reviewedAt: now, reviewReason: input.reason, updatedAt: now});
    const event = {actorUid: uid, correlationId: correlationIdFromCallable(request),
      reason: input.reason, decision: input.decision,
      suggestionId: ref.id, beforeRevision: before.revision, afterRevision: nextRevision,
      beforeStatus: before.status, afterStatus: status, resolvedOccasionId: targetId,
      beforeCatalogRevision: catalogBefore, afterCatalogRevision: catalogAfter,
      beforeTargetRevision: newTarget ? null : targetRevision, afterTargetRevision: targetRevision,
      createdAt: now};
    tx.create(db.collection("occasionSuggestionReviewAudits").doc(op.id), event);
    tx.create(db.collection("occasionSuggestionOutbox").doc(op.id), event);
    tx.create(op, {hash, result, actorUid: uid, revision: 1, createdAt: now, updatedAt: now,
      retainUntil: Timestamp.fromMillis(now.toMillis() + 30 * 86400000)});
    return result;
  });
});
