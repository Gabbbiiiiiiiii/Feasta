/** Local authority primitives only. No callable, environment override or activation path. */
export const SETUP_GALLERY_POLICY_PATH = "contractPolicies/setupGalleryV2";
// Proposed sidecar collection: existing provider admin rules are a denylist and
// would not protect a newly added field. Default-denied sidecars avoid that flaw.
// No document is initialized by this module.
export const PROVIDER_ELIGIBILITY_AUTHORITY_COLLECTION = "providerEligibilityAuthorities";
// A policy document cannot attest that privileged writers have been audited.
export const SETUP_GALLERY_WRITER_COVERAGE_VERIFIED: boolean = false;

function unavailable(): never {
  throw new Error("SETUP_GALLERY_AUTHORITY_UNAVAILABLE");
}

export function authorityRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) unavailable();
  return value;
}

/** Use only inside a transaction reading the provider; missing is initialization,
 * never evidence of current eligibility. Approval must be established separately.
 * Not wired to legacy writers until the complete writer protocol is approved.
 */
export function nextEligibilityRevision(value: unknown): number {
  if (value === undefined) return 1;
  const revision = authorityRevision(value);
  if (revision === Number.MAX_SAFE_INTEGER) unavailable();
  return revision + 1;
}

export interface SetupGalleryPolicy {
  revision: number;
  effectiveEnvironment: string;
  validFromMillis: number;
  validUntilMillis: number;
  privateWrites: boolean;
  publicReads: boolean;
  maxSpecificOccasions: number;
  maxApplicableOccasions: number;
  maxCatalogRecords: number;
  pageSize: number;
  maxPages: number;
  requireCurrentRevisions: true;
  requireValidEligibility: true;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) unavailable();
  return value as Record<string, unknown>;
}
function bounded(value: unknown, max: number): number {
  const n = authorityRevision(value);
  if (n > max) unavailable();
  return n;
}

/** Input must be a protected Admin SDK snapshot, never request data. Environment
 * and clock come from the server. This parser confers no configuration authority.
 */
export function parseSetupGalleryPolicy(
  value: unknown, environment: string, nowMillis: number,
): SetupGalleryPolicy {
  const p = record(value);
  const keys = ["revision", "effectiveEnvironment", "validFromMillis", "validUntilMillis",
    "privateWrites", "publicReads", "maxSpecificOccasions", "maxApplicableOccasions",
    "maxCatalogRecords", "pageSize", "maxPages", "requireCurrentRevisions",
    "requireValidEligibility"];
  if (Object.keys(p).some((k) => !keys.includes(k)) ||
    !environment || p.effectiveEnvironment !== environment ||
    !Number.isSafeInteger(nowMillis) ||
    typeof p.privateWrites !== "boolean" || typeof p.publicReads !== "boolean" ||
    p.requireCurrentRevisions !== true || p.requireValidEligibility !== true) unavailable();
  const validFromMillis = authorityRevision(p.validFromMillis);
  const validUntilMillis = authorityRevision(p.validUntilMillis);
  if (nowMillis < validFromMillis || nowMillis >= validUntilMillis) unavailable();
  const result: SetupGalleryPolicy = {
    revision: authorityRevision(p.revision), effectiveEnvironment: environment,
    validFromMillis, validUntilMillis, privateWrites: p.privateWrites, publicReads: p.publicReads,
    maxSpecificOccasions: bounded(p.maxSpecificOccasions, 10),
    maxApplicableOccasions: bounded(p.maxApplicableOccasions, 1000),
    maxCatalogRecords: bounded(p.maxCatalogRecords, 2000),
    pageSize: bounded(p.pageSize, 100), maxPages: bounded(p.maxPages, 100),
    requireCurrentRevisions: true, requireValidEligibility: true,
  };
  if (result.maxSpecificOccasions > result.maxApplicableOccasions ||
    result.maxApplicableOccasions > result.maxCatalogRecords) unavailable();
  return result;
}

/** Fail closed independently for each gate, including incomplete writer coverage. */
export function setupGalleryGate(
  value: unknown, environment: string, nowMillis: number, gate: "privateWrites" | "publicReads",
): boolean {
  try {
    const policy = parseSetupGalleryPolicy(value, environment, nowMillis);
    return SETUP_GALLERY_WRITER_COVERAGE_VERIFIED && policy[gate];
  } catch {
    return false;
  }
}

/** Internal revision comparison; transaction read-set conflicts must additionally
 * be enforced by Firestore. This function alone does not fence any write.
 */
export function assertAuthorityRevisions(
  expected: readonly unknown[], current: readonly unknown[],
): void {
  if (!expected.length || expected.length !== current.length) unavailable();
  expected.forEach((v, i) => {
    if (authorityRevision(v) !== authorityRevision(current[i])) {
      throw new Error("SETUP_GALLERY_AUTHORITY_CONFLICT");
    }
  });
}

/** Adapter building block: page callbacks must use the SAME transaction and an
 * ordered document-ID cursor. Empty terminal page proves exhaustion; budgets
 * count all scanned documents, including inactive/inapplicable records.
 */
export async function enumerateSetupGalleryCatalog<T extends {id: string}>(
  policy: SetupGalleryPolicy,
  readPage: (afterId: string | null, limit: number) => Promise<readonly T[]>,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < policy.maxPages; page++) {
    const rows = await readPage(after, policy.pageSize);
    if (rows.length > policy.pageSize) unavailable();
    if (!rows.length) return all;
    for (const row of rows) {
      if (typeof row.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/u.test(row.id) ||
        (after !== null && row.id <= after)) unavailable();
      after = row.id;
      all.push(row);
      if (all.length > policy.maxCatalogRecords) unavailable();
    }
  }
  unavailable();
}
