import {onCall, type CallableRequest} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {occasionId} from "../packages/occasion-v2-validation.js";
import {fail} from "../packages/occasion-suggestion-v2-core.js";
import {exact, positiveRevision} from "../packages/v2-validation.js";
import {verifiedLifecycleReleaseChecks} from "./occasion-lifecycle-release-evidence.js";

export type OccasionLifecycleAction = "activate" | "deactivate";
export interface OccasionReadinessInput {
  occasionId: string;
  expectedOccasionRevision: number;
  expectedCatalogRevision: number;
}
export interface OccasionReadinessCheck {
  code: string;
  status: "SATISFIED" | "BLOCKED";
  message: string;
}

const missingSafeguards = [
  ["RELEASE_AUTHORIZATION_UNVERIFIED",
    "Release approval and trusted evidence cannot yet be verified. " +
    "An approval ID alone is insufficient."],
  ["ELIGIBILITY_WRITER_COVERAGE_UNVERIFIED",
    "Provider approval and gallery changes need complete, verified eligibility revision coverage."],
  ["AFFECTED_INVENTORY_UNVERIFIED",
    "A complete package and provider inventory is required, " +
    "including every All Occasions package. Impact preview is not proof."],
  ["PUBLICATION_WITHDRAWAL_UNAVAILABLE",
    "Safe withdrawal and restoration must be verified across every supported customer view."],
  ["BOOKING_COMPATIBILITY_UNVERIFIED",
    "New booking validation and preservation of existing booking agreements " +
    "need compatibility verification."],
  ["CUSTOMER_WEB_COMPATIBILITY_UNVERIFIED",
    "Customer Web still uses legacy occasion matching; compatibility has not been verified."],
  ["FLUTTER_COMPATIBILITY_UNVERIFIED",
    "Flutter Mobile and older supported apps need verified compatibility " +
    "and withdrawal protection."],
  ["INDEX_QUERY_READINESS_UNVERIFIED",
    "Required deployed indexes and authorized discovery queries have not been verified."],
  ["GENERATION_COORDINATION_UNAVAILABLE",
    "Catalog, provider and package changes need coordinated generations " +
    "and exclusion of stale discovery results."],
  ["DEPLOYMENT_SECURITY_GATES_UNVERIFIED",
    "Deployment, security checks and recovery procedures " +
    "require independent release verification."],
] as const;

export function parseOccasionReadinessInput(value: unknown): OccasionReadinessInput {
  const input = exact(value, ["occasionId", "expectedOccasionRevision",
    "expectedCatalogRevision"], [], "INVALID_REVIEW_TARGET");
  return {occasionId: occasionId(input.occasionId),
    expectedOccasionRevision:
      positiveRevision(input.expectedOccasionRevision, "INVALID_REVIEW_TARGET"),
    expectedCatalogRevision:
      positiveRevision(input.expectedCatalogRevision, "INVALID_REVIEW_TARGET")};
}

export async function requireOccasionLifecycleActor(request: CallableRequest, scope: string) {
  const {uid} = requireAuth(request);
  if (!request.app) fail("APP_CHECK_REQUIRED", "unauthenticated");
  await requireRole(uid, ["admin"]);
  await enforceCallableRateLimit(request, {scope, limit: 60, windowSeconds: 3600});
  return uid;
}

export async function requireOccasionLifecycleAdmin(
  tx: FirebaseFirestore.Transaction, uid: string,
) {
  const profile = (await tx.get(db.collection("users").doc(uid))).data();
  if (resolveBackendAccountState({authDisabled: false, profile,
    allowedRoles: ["admin"]}).kind !== "active") fail("ADMIN_REQUIRED", "permission-denied");
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 &&
    value < Number.MAX_SAFE_INTEGER;
}

export async function readOccasionReadiness(tx: FirebaseFirestore.Transaction,
  input: OccasionReadinessInput, action: OccasionLifecycleAction = "activate") {
  const catalog = (await tx.get(db.collection("occasionCatalog").doc("current"))).data();
  const occasion = (await tx.get(db.collection("occasions").doc(input.occasionId))).data();
  const checks: OccasionReadinessCheck[] = [];
  const check = (code: string, satisfied: boolean, message: string) => {
    checks.push({code, status: satisfied ? "SATISFIED" : "BLOCKED", message});
  };
  check("ADMIN_APP_CHECK", true, "Active administrator and browser verification passed.");
  check("APPROVED_OCCASION", occasion?.id === input.occasionId &&
    occasion?.moderationState === "approved",
    "The occasion must exist with an approved permanent identity.");
  check("OCCASION_STATE", occasion?.active === (action === "deactivate"),
    action === "activate" ? "Activation requires an inactive occasion." :
      "Deactivation requires an active occasion.");
  check("STABLE_CATALOG", catalog?.activationState === "stable" && validRevision(catalog?.revision),
    "The catalog must have a stable, valid generation with room for the next revision.");
  check("CATALOG_REVISION", validRevision(catalog?.revision) &&
    catalog?.revision === input.expectedCatalogRevision,
    "The catalog revision must match this request.");
  check("OCCASION_REVISION", validRevision(occasion?.revision) &&
    occasion?.revision === input.expectedOccasionRevision,
    "The occasion revision must match this request.");
  const codes: unknown = occasion?.applicableServiceCategoryCodes;
  let mappingsValid = Array.isArray(codes) && codes.length > 0 && codes.length <= 100 &&
    codes.every(isServiceCategoryCode) && new Set(codes).size === codes.length;
  if (mappingsValid) {
    for (const code of codes as string[]) {
      const category = (await tx.get(db.collection("serviceCategories").doc(code))).data();
      if (category?.code !== code || category?.status !== "active" ||
        !["catering", "addon"].includes(category?.serviceType)) mappingsValid = false;
    }
  }
  check("ACTIVE_CATEGORY_MAPPINGS", mappingsValid,
    "Every applicable service must have a valid, active category mapping.");
  // Only a privileged, server-owned Firestore attestation can satisfy release
  // safeguards. It is scoped to this occasion/action and the CURRENT revisions;
  // changed generations and expired approvals fail closed on every transaction
  // retry. Clients cannot write this collection under the default-deny rules.
  const releaseSnap = await tx.get(db.collection("occasionLifecycleReleaseEvidence")
    .doc(`${input.occasionId}_${action}`));
  const releaseChecks = verifiedLifecycleReleaseChecks(releaseSnap.data(), {
    projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "",
    deployedCommitSha: process.env.FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA ?? "",
    occasionId: input.occasionId, action,
    catalogRevision: catalog?.revision, occasionRevision: occasion?.revision,
    nowMillis: Date.now(),
  });
  for (const [code, message] of missingSafeguards) check(code, releaseChecks[code], message);
  const blockers = checks.filter((item) => item.status === "BLOCKED")
    .map((item) => item.code);
  return {occasionId: input.occasionId, action,
    status: blockers.length ? "BLOCKED" as const : "ELIGIBLE_FOR_TRANSACTION" as const,
    lifecycleAvailable: blockers.length === 0,
    occasionRevision: validRevision(occasion?.revision) ? occasion.revision as number : null,
    catalogRevision: validRevision(catalog?.revision) ? catalog.revision as number : null,
    checks, blockers};
}

export const checkAdminOccasionActivationReadiness = onCall(
  appCheckCallableOptions, async (request) => {
  const uid = await requireOccasionLifecycleActor(request, "adminOccasions.readiness");
  const input = parseOccasionReadinessInput(request.data);
  return db.runTransaction(async (tx) => {
    await requireOccasionLifecycleAdmin(tx, uid);
    return readOccasionReadiness(tx, input);
  });
});

export const checkAdminOccasionDeactivationReadiness = onCall(
  appCheckCallableOptions, async (request) => {
  const uid = await requireOccasionLifecycleActor(request, "adminOccasions.deactivation.readiness");
  const input = parseOccasionReadinessInput(request.data);
  return db.runTransaction(async (tx) => {
    await requireOccasionLifecycleAdmin(tx, uid);
    return readOccasionReadiness(tx, input, "deactivate");
  });
});
