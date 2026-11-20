/**
 * Trusted, short-lived, occasion/action/revision-scoped operator attestation.
 *
 * This is not a test runner, not an approval endpoint and not a substitute for
 * independent release verification. Only a privileged release operator may
 * create the corresponding Firestore document (default-denied to all clients).
 * A browser request can never provide or amend any of these values.
 *
 * The source, deployed artifacts, IAM and E2E claims MUST be checked by the
 * release team before the attestation is written. An inaccurate attestation is
 * an operational security incident, not evidence manufactured by the app.
 */
export const REQUIRED_LIFECYCLE_RELEASE_CHECKS = [
  "RELEASE_AUTHORIZATION_UNVERIFIED",
  "ELIGIBILITY_WRITER_COVERAGE_UNVERIFIED",
  "AFFECTED_INVENTORY_UNVERIFIED",
  "PUBLICATION_WITHDRAWAL_UNAVAILABLE",
  "BOOKING_COMPATIBILITY_UNVERIFIED",
  "CUSTOMER_WEB_COMPATIBILITY_UNVERIFIED",
  "FLUTTER_COMPATIBILITY_UNVERIFIED",
  "INDEX_QUERY_READINESS_UNVERIFIED",
  "GENERATION_COORDINATION_UNAVAILABLE",
  "DEPLOYMENT_SECURITY_GATES_UNVERIFIED",
] as const;

export type ReleaseCheckCode = typeof REQUIRED_LIFECYCLE_RELEASE_CHECKS[number];
export type ReleaseAction = "activate" | "deactivate";

export interface ReleaseEvidenceContext {
  projectId: string;
  deployedCommitSha: string;
  occasionId: string;
  action: ReleaseAction;
  catalogRevision: number;
  occasionRevision: number;
  nowMillis: number;
}

const HEX64 = /^[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;
const ID = /^[A-Za-z0-9_-]{3,128}$/u;
const MAX_TTL_MILLIS = 6 * 60 * 60 * 1000;

function object(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function strictKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}
function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value > 0 && value < Number.MAX_SAFE_INTEGER;
}
function millis(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Missing or malformed evidence returns false for all checks, never partial. */
export function verifiedLifecycleReleaseChecks(
  value: unknown, ctx: ReleaseEvidenceContext,
): Readonly<Record<ReleaseCheckCode, boolean>> {
  const denied = Object.fromEntries(REQUIRED_LIFECYCLE_RELEASE_CHECKS.map((k) => [k, false])) as
    Record<ReleaseCheckCode, boolean>;
  const evidence = object(value);
  if (!evidence || !strictKeys(evidence, ["schemaVersion", "projectId", "occasionId",
    "action", "catalogRevision", "occasionRevision", "sourceCommitSha",
    "deployedFunctionsSha256", "deployedRulesetName", "verifiedByUids",
    "issuedAtMillis", "expiresAtMillis", "checks"]) ||
    evidence.schemaVersion !== 1 ||
    !HEX40.test(ctx.deployedCommitSha) ||
    ctx.projectId !== "feasta-catering-system" ||
    evidence.projectId !== ctx.projectId ||
    evidence.occasionId !== ctx.occasionId ||
    evidence.action !== ctx.action ||
    !revision(ctx.catalogRevision) || !revision(ctx.occasionRevision) ||
    evidence.catalogRevision !== ctx.catalogRevision ||
    evidence.occasionRevision !== ctx.occasionRevision ||
    typeof evidence.sourceCommitSha !== "string" || !HEX40.test(evidence.sourceCommitSha) ||
    evidence.sourceCommitSha !== ctx.deployedCommitSha ||
    typeof evidence.deployedFunctionsSha256 !== "string" ||
    !HEX64.test(evidence.deployedFunctionsSha256) ||
    typeof evidence.deployedRulesetName !== "string" ||
    !evidence.deployedRulesetName.startsWith(`projects/${ctx.projectId}/rulesets/`) ||
    !Array.isArray(evidence.verifiedByUids) || evidence.verifiedByUids.length !== 2 ||
    !evidence.verifiedByUids.every((uid: unknown) => typeof uid === "string" && ID.test(uid)) ||
    new Set(evidence.verifiedByUids).size !== 2 ||
    !millis(ctx.nowMillis) || !millis(evidence.issuedAtMillis) ||
    !millis(evidence.expiresAtMillis) ||
    evidence.issuedAtMillis > ctx.nowMillis ||
    ctx.nowMillis >= evidence.expiresAtMillis ||
    evidence.expiresAtMillis - evidence.issuedAtMillis > MAX_TTL_MILLIS) return denied;

  const checks = object(evidence.checks);
  if (!checks || !strictKeys(checks, REQUIRED_LIFECYCLE_RELEASE_CHECKS)) return denied;
  for (const code of REQUIRED_LIFECYCLE_RELEASE_CHECKS) {
    const proof = object(checks[code]);
    if (!proof || !strictKeys(proof, ["status", "artifactSha256", "verifiedAtMillis"]) ||
      proof.status !== "VERIFIED" ||
      typeof proof.artifactSha256 !== "string" || !HEX64.test(proof.artifactSha256) ||
      !millis(proof.verifiedAtMillis) ||
      proof.verifiedAtMillis > ctx.nowMillis ||
      proof.verifiedAtMillis > evidence.expiresAtMillis ||
      proof.verifiedAtMillis < evidence.issuedAtMillis - MAX_TTL_MILLIS) return denied;
  }
  return Object.fromEntries(REQUIRED_LIFECYCLE_RELEASE_CHECKS.map((k) => [k, true])) as
    Record<ReleaseCheckCode, boolean>;
}
