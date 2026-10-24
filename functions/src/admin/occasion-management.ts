import {Timestamp} from "firebase-admin/firestore";
import {onCall, type CallableRequest} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {correlationIdFromCallable} from "../shared/security-events.js";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {parseOccasionReview} from "../packages/occasion-suggestion-v2-validation.js";
import {occasionId} from "../packages/occasion-v2-validation.js";
import {normalizeSuggestionName} from "../packages/provider-occasion-suggestion-v2-domain.js";
import {digest, fail} from "../packages/occasion-suggestion-v2-core.js";
import {exact, mutationKey, plainText, positiveRevision} from "../packages/v2-validation.js";

type Tx = FirebaseFirestore.Transaction;
type Data = FirebaseFirestore.DocumentData;
const occasions = db.collection("occasions");
const catalog = db.collection("occasionCatalog").doc("current");
const limit = 500;

async function actor(request: CallableRequest, scope: string) {
  const {uid} = requireAuth(request);
  await requireRole(uid, ["admin"]);
  await enforceCallableRateLimit(request, {scope, limit: 60, windowSeconds: 3600});
  return uid;
}
async function admin(tx: Tx, uid: string) {
  const profile = (await tx.get(db.collection("users").doc(uid))).data();
  if (resolveBackendAccountState({authDisabled: false, profile,
    allowedRoles: ["admin"]}).kind !== "active") fail("ADMIN_REQUIRED", "permission-denied");
}
function generation(data: Data | undefined) {
  if (data?.activationState !== "stable") fail("CONFIG_UNAVAILABLE");
  return positiveRevision(data.revision, "CONFIG_UNAVAILABLE");
}
function project(id: string, data: Data) {
  if (data.id !== id || data.moderationState !== "approved" ||
    typeof data.active !== "boolean" || typeof data.label !== "string" ||
    !Array.isArray(data.aliases) || !data.aliases.every((v: unknown) => typeof v === "string") ||
    !Array.isArray(data.applicableServiceCategoryCodes) ||
    !data.applicableServiceCategoryCodes.every((v: unknown) => typeof v === "string") ||
    !Number.isSafeInteger(data.sortOrder)) fail("CONFIG_UNAVAILABLE");
  return {id, label: data.label as string, aliases: data.aliases as string[],
    active: data.active as boolean, moderationState: "approved" as const,
    normalizedName: normalizeSuggestionName(data.label),
    applicableServiceCategoryCodes: data.applicableServiceCategoryCodes as string[],
    sortOrder: data.sortOrder as number,
    revision: positiveRevision(data.revision, "CONFIG_UNAVAILABLE")};
}
async function records(tx: Tx) {
  const docs = (await tx.get(occasions.limit(limit + 1))).docs;
  if (docs.length > limit) fail("CATALOG_CAPACITY_EXCEEDED");
  return docs.map((d) => project(d.id, d.data()));
}

export const listAdminOccasions = onCall(appCheckCallableOptions, async (request) => {
  const uid = await actor(request, "adminOccasions.list");
  exact(request.data, [], [], "INVALID_NAME");
  return db.runTransaction(async (tx) => {
    await admin(tx, uid);
    const revision = generation((await tx.get(catalog)).data());
    const items = await records(tx);
    return {revision, items: items.sort((a, b) => a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id)), lifecycleAvailable: false};
  });
});

export function parseAdminOccasionMutation(value: unknown, create: boolean) {
  const v = exact(value, ["occasion", "expectedCatalogRevision", "reason", "idempotencyKey",
    ...(create ? [] : ["expectedOccasionRevision"])], [], "INVALID_REVIEW_TARGET");
  // Reuse the frozen canonical creation validator without introducing a second schema.
  const parsed = parseOccasionReview({suggestionId: "admin", expectedRevision: 1,
    expectedCatalogRevision: v.expectedCatalogRevision, reason: v.reason,
    idempotencyKey: v.idempotencyKey, decision: "approve_new", newOccasion: v.occasion});
  if (parsed.decision !== "approve_new") fail("INVALID_REVIEW_TARGET", "invalid-argument");
  return {occasion: parsed.newOccasion,
    expectedCatalogRevision: parsed.expectedCatalogRevision,
    expectedOccasionRevision: create ? null :
      positiveRevision(v.expectedOccasionRevision, "INVALID_REVIEW_TARGET"),
    reason: plainText(v.reason, 10, 500, "INVALID_REVIEW_REASON"),
    idempotencyKey: mutationKey(v.idempotencyKey, "INVALID_REVIEW_TARGET")};
}

async function mutate(request: CallableRequest, create: boolean) {
  const uid = await actor(request, create ? "adminOccasions.create" : "adminOccasions.edit");
  const input = parseAdminOccasionMutation(request.data, create);
  const n = input.occasion;
  const op = db.collection("occasionMaintenanceOperations")
    .doc(digest([uid, create ? "create" : "edit", input.idempotencyKey]));
  const hash = digest(input);
  return db.runTransaction(async (tx) => {
    await admin(tx, uid);
    const saved = (await tx.get(op)).data();
    if (saved) {
      if (saved.hash !== hash) fail("IDEMPOTENCY_CONFLICT", "already-exists");
      return saved.result;
    }
    const revision = generation((await tx.get(catalog)).data());
    const all = await records(tx);
    const before = all.find((o) => o.id === n.id);
    if (create && before) fail("OCCASION_ID_EXISTS", "already-exists");
    if (!create && !before) fail("OCCASION_NOT_FOUND", "not-found");
    if (revision !== input.expectedCatalogRevision ||
      (!create && before?.revision !== input.expectedOccasionRevision)) {
      fail("REVISION_CONFLICT", "aborted");
    }
    if (revision === Number.MAX_SAFE_INTEGER || before?.revision === Number.MAX_SAFE_INTEGER ||
      (create && all.length >= limit)) fail("CONFIG_UNAVAILABLE");
    // Applicability changes require withdrawal/eligibility and customer compatibility barriers.
    // No local flag, unused-reference scan, or inactive state can substitute for them.
    if (before && JSON.stringify([...before.applicableServiceCategoryCodes].sort()) !==
      JSON.stringify([...n.applicableServiceCategoryCodes].sort())) {
      fail("OCCASION_LIFECYCLE_UNAVAILABLE");
    }
    for (const code of n.applicableServiceCategoryCodes) {
      const c = (await tx.get(db.collection("serviceCategories").doc(code))).data();
      if (!isServiceCategoryCode(code) || c?.code !== code || c.status !== "active" ||
        !["catering", "addon"].includes(c.serviceType)) {
        fail("INVALID_SERVICE_CATEGORY", "invalid-argument");
      }
    }
    const names = [n.label, ...n.aliases].map(normalizeSuggestionName);
    if (all.some((o) => o.id !== n.id && [o.label, ...o.aliases]
      .some((name) => names.includes(normalizeSuggestionName(name))))) {
      fail("CATALOG_NAME_CONFLICT", "already-exists");
    }
    const reservations = [];
    for (const name of names) {
      const ref = db.collection("occasionNameReservations").doc(digest(name));
      const data = (await tx.get(ref)).data();
      if (data && data.occasionId !== n.id) fail("CATALOG_NAME_CONFLICT", "already-exists");
      if (!data) reservations.push({ref, name});
    }
    const now = Timestamp.now();
    const after = {...n, normalizedName: normalizeSuggestionName(n.label),
      revision: (before?.revision ?? 0) + 1, updatedAt: now};
    const result = {occasionId: n.id, occasionRevision: after.revision,
      catalogRevision: revision + 1, operationId: op.id};
    if (create) tx.create(occasions.doc(n.id), {...after, active: false,
      moderationState: "approved", createdBy: uid, createdAt: now});
    else tx.update(occasions.doc(n.id), after); // Preserve server compatibility fields.
    tx.update(catalog, {revision: result.catalogRevision, updatedAt: now});
    for (const {ref, name} of reservations) tx.create(ref,
      {occasionId: n.id, normalizedName: name, revision: 1, createdAt: now, updatedAt: now});
    // Old reservations deliberately remain reserved; names cannot silently be reassigned.
    tx.create(db.collection("occasionMaintenanceAudits").doc(op.id), {
      actorUid: uid, correlationId: correlationIdFromCallable(request), reason: input.reason,
      action: create ? "create_inactive" : "edit_metadata", before: before ?? null,
      after: {...after, active: before?.active ?? false, moderationState: "approved"},
      beforeCatalogRevision: revision, afterCatalogRevision: revision + 1, createdAt: now,
    });
    tx.create(op, {hash, result, actorUid: uid, createdAt: now});
    return result;
  });
}
export const createAdminOccasion = onCall(appCheckCallableOptions, (r) => mutate(r, true));
export const updateAdminOccasion = onCall(appCheckCallableOptions, (r) => mutate(r, false));

/** Potential references only; this is never eligibility or release evidence. */
function references(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((v) => references(v, id));
  return !!value && typeof value === "object" && Object.values(value)
    .some((v) => references(v, id));
}
export const previewAdminOccasionImpact = onCall(appCheckCallableOptions, async (request) => {
  const uid = await actor(request, "adminOccasions.preview");
  const v = exact(request.data, ["occasionId", "expectedOccasionRevision",
    "expectedCatalogRevision", "operation"], ["applicableServiceCategoryCodes"],
  "INVALID_REVIEW_TARGET");
  const id = occasionId(v.occasionId);
  if (!["activate", "deactivate", "applicability"].includes(v.operation as string)) {
    fail("INVALID_REVIEW_TARGET", "invalid-argument");
  }
  if (v.operation === "applicability") {
    if (!Array.isArray(v.applicableServiceCategoryCodes) ||
      !v.applicableServiceCategoryCodes.length ||
      !v.applicableServiceCategoryCodes.every(isServiceCategoryCode) ||
      new Set(v.applicableServiceCategoryCodes).size !== v.applicableServiceCategoryCodes.length) {
      fail("INVALID_SERVICE_CATEGORY", "invalid-argument");
    }
  } else if (v.applicableServiceCategoryCodes !== undefined) {
    fail("INVALID_REVIEW_TARGET", "invalid-argument");
  }
  positiveRevision(v.expectedOccasionRevision, "INVALID_REVIEW_TARGET");
  positiveRevision(v.expectedCatalogRevision, "INVALID_REVIEW_TARGET");
  return db.runTransaction(async (tx) => {
    await admin(tx, uid);
    const revision = generation((await tx.get(catalog)).data());
    const raw = (await tx.get(occasions.doc(id))).data();
    if (!raw) fail("OCCASION_NOT_FOUND", "not-found");
    const item = project(id, raw);
    if (revision !== v.expectedCatalogRevision || item.revision !== v.expectedOccasionRevision) {
      fail("REVISION_CONFLICT", "aborted");
    }
    const mappings = [];
    for (const code of (v.applicableServiceCategoryCodes ?? []) as string[]) {
      const c = (await tx.get(db.collection("serviceCategories").doc(code))).data();
      mappings.push({code, valid: c?.code === code && c.status === "active" &&
        ["catering", "addon"].includes(c.serviceType)});
    }
    const usage = [];
    const collections = ["packages", "providers", "providerEligibilityAuthorities", "bookings"];
    for (const collection of collections) {
      const docs = (await tx.get(db.collection(collection).limit(limit + 1))).docs;
      usage.push({collection, scanned: Math.min(docs.length, limit),
        potentialReferences: docs.slice(0, limit).filter((d) => references(d.data(), id) ||
          (collection === "packages" && d.data().occasionScope === "all")).length,
        truncated: docs.length > limit});
    }
    return {occasionId: id, occasionRevision: item.revision, catalogRevision: revision,
      operation: v.operation, allowed: false, mappings, usage,
      blockers: ["Withdrawal and catalog-generation barriers are not verified.",
        "Provider eligibility revalidation and Web/Mobile compatibility are not verified."],
      disclaimer: "Bounded potential references only; nested collections and unknown schemas " +
        "require an offline inventory. This preview cannot authorize a lifecycle change."};
  });
});
