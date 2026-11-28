import {HttpsError} from "firebase-functions/v2/https";

/** Internal implementation policy fields; no public caller can select them. */
export interface OccasionCatalogReadPolicy {
  revision: number;
  effectiveEnvironment: string;
  maxSpecificOccasions: number;
  maxPendingSuggestionsPerProvider: number;
  maxThemeImages: number;
}

function configUnavailable(): HttpsError {
  return new HttpsError("failed-precondition", "V2 configuration is unavailable.",
    {reason: "CONFIG_UNAVAILABLE"});
}

function disabled(): HttpsError {
  return new HttpsError("failed-precondition", "V2 occasion catalog is disabled.",
    {reason: "FEATURE_DISABLED"});
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> : null;
}

function boundedInt(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= minimum && value <= maximum;
}

/** A missing/disabled V2 policy cannot enable or enlarge any legacy behavior. */
export function parseOccasionCatalogReadPolicy(
  value: unknown, currentEnvironment: string,
): OccasionCatalogReadPolicy {
  const data = record(value);
  if (!data) throw disabled();
  const featureGates = record(data.featureGates);
  // This feature-gate name is an implementation field proposed for Phase 2A.
  // It does not authorize any other V2 public write, gallery, or pricing gate.
  if (featureGates?.occasionCatalogReads !== true) throw disabled();
  if (!currentEnvironment || data.effectiveEnvironment !== currentEnvironment ||
    !boundedInt(data.revision, 1, Number.MAX_SAFE_INTEGER) ||
    !boundedInt(data.maxSpecificOccasions, 1, 100) ||
    !boundedInt(data.maxPendingSuggestionsPerProvider, 1, 100) ||
    !boundedInt(data.maxThemeImages, 1, 1000)) throw configUnavailable();
  return {
    revision: data.revision as number,
    effectiveEnvironment: currentEnvironment,
    maxSpecificOccasions: data.maxSpecificOccasions as number,
    maxPendingSuggestionsPerProvider: data.maxPendingSuggestionsPerProvider as number,
    maxThemeImages: data.maxThemeImages as number,
  };
}

function currentFirebaseProject(): string {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (project && /^[a-z][a-z0-9-]{5,62}$/u.test(project)) return project;
  throw configUnavailable();
}

/** Trusted server-side read only. No policy document is seeded or mutated. */
export async function loadOccasionCatalogReadPolicy(): Promise<OccasionCatalogReadPolicy> {
  const environment = currentFirebaseProject();
  const {db} = await import("../shared/firestore.js");
  const document = await db.collection("contractPolicies").doc("providerPackageV2").get();
  return parseOccasionCatalogReadPolicy(
    document.exists ? document.data() : null, environment);
}
