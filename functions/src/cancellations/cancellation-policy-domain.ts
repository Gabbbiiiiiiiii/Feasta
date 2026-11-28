import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

export const CANCELLATION_POLICY_SCHEMA_VERSION = 1 as const;
export const CANCELLATION_POLICY_SETTINGS_DOC_ID = "cancellationPolicy" as const;

export const CANCELLATION_CUTOFF_HOURS_MIN_HARD = 1;
export const CANCELLATION_CUTOFF_HOURS_MAX_HARD = 24 * 365;

export const DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS = 72;
export const DEFAULT_ADMIN_CANCELLATION_MIN_HOURS = 24;
export const DEFAULT_ADMIN_CANCELLATION_MAX_HOURS = 720;

export const CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH = 1_000;

export type ProviderCancellationPolicyMode =
  | "admin_default"
  | "provider_custom";

export type EffectiveCancellationPolicySourceKind =
  | "admin_default"
  | "provider_custom";

export type AdminDefaultCancellationPolicyDraft = {
  defaultCutoffHoursBeforeEvent: number;
  minCutoffHoursBeforeEvent: number;
  maxCutoffHoursBeforeEvent: number;
  guidanceNote: string | null;
};

export type AdminDefaultCancellationPolicy<TTimestamp = unknown> =
  AdminDefaultCancellationPolicyDraft & {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    policyVersion: number;
    updatedAt: TTimestamp | null;
    updatedBy: string | null;
  };

export type ProviderCancellationPolicyDraft =
  | {mode: "admin_default"}
  | {mode: "provider_custom"; cutoffHoursBeforeEvent: number};

export type ProviderCancellationPolicy<TTimestamp = unknown> =
  | {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    mode: "admin_default";
    policyVersion: number;
    effectiveAt: TTimestamp;
  }
  | {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    mode: "provider_custom";
    cutoffHoursBeforeEvent: number;
    policyVersion: number;
    effectiveAt: TTimestamp;
  };

export type EffectiveCancellationPolicy = {
  sourceKind: EffectiveCancellationPolicySourceKind;
  cutoffHoursBeforeEvent: number;
  adminPolicyVersion: number;
  providerPolicyVersion: number | null;
  guidanceNote: string | null;
};

export type CancellationPolicySnapshot<TTimestamp = unknown> = {
  schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
  sourceKind: EffectiveCancellationPolicySourceKind;
  cutoffHoursBeforeEvent: number;
  eventStartAt: TTimestamp;
  cancellationCutoffAt: TTimestamp;
  submittedPastCutoff: boolean;
  adminPolicyVersion: number;
  providerPolicyVersion: number | null;
  capturedAt: TTimestamp;
};

const ADMIN_DRAFT_FIELDS = new Set([
  "defaultCutoffHoursBeforeEvent",
  "minCutoffHoursBeforeEvent",
  "maxCutoffHoursBeforeEvent",
  "guidanceNote",
]);

const PROVIDER_DRAFT_FIELDS = new Set([
  "mode",
  "cutoffHoursBeforeEvent",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireHoursInteger(
  value: unknown,
  label: string,
  min = CANCELLATION_CUTOFF_HOURS_MIN_HARD,
  max = CANCELLATION_CUTOFF_HOURS_MAX_HARD,
  code: "invalid-argument" | "failed-precondition" = "invalid-argument",
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new HttpsError(code, `${label} must be a whole number of hours.`);
  }
  if (value < min || value > max) {
    throw new HttpsError(
      code,
      `${label} must be between ${min} and ${max} hours before the event.`,
    );
  }
  return value;
}

function parseOptionalGuidance(
  value: unknown,
  code: "invalid-argument" | "failed-precondition" = "invalid-argument",
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpsError(code, "Cancellation guidance note must be text.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH) {
    throw new HttpsError(
      code,
      `Cancellation guidance note must be at most ${CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export function seededAdminCancellationPolicy(): AdminDefaultCancellationPolicy<Timestamp> {
  return {
    schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
    policyVersion: 1,
    defaultCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
    minCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_MIN_HOURS,
    maxCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_MAX_HOURS,
    guidanceNote: null,
    updatedAt: null,
    updatedBy: null,
  };
}

export function parseAdminCancellationPolicyDraft(
  value: unknown,
): AdminDefaultCancellationPolicyDraft {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "Cancellation policy details are required.");
  }
  for (const key of Object.keys(value)) {
    if (!ADMIN_DRAFT_FIELDS.has(key)) {
      throw new HttpsError("invalid-argument", `Unsupported cancellation policy field: ${key}.`);
    }
  }

  const minCutoffHoursBeforeEvent = requireHoursInteger(
    value.minCutoffHoursBeforeEvent,
    "Minimum cancellation cutoff",
  );
  const maxCutoffHoursBeforeEvent = requireHoursInteger(
    value.maxCutoffHoursBeforeEvent,
    "Maximum cancellation cutoff",
  );
  if (minCutoffHoursBeforeEvent > maxCutoffHoursBeforeEvent) {
    throw new HttpsError(
      "invalid-argument",
      "Minimum cancellation cutoff cannot exceed maximum cancellation cutoff.",
    );
  }

  const defaultCutoffHoursBeforeEvent = requireHoursInteger(
    value.defaultCutoffHoursBeforeEvent,
    "Suggested default cancellation cutoff",
    minCutoffHoursBeforeEvent,
    maxCutoffHoursBeforeEvent,
  );

  return {
    defaultCutoffHoursBeforeEvent,
    minCutoffHoursBeforeEvent,
    maxCutoffHoursBeforeEvent,
    guidanceNote: parseOptionalGuidance(value.guidanceNote),
  };
}

export function parseStoredAdminCancellationPolicy(
  value: unknown,
): AdminDefaultCancellationPolicy<Timestamp> {
  if (value === undefined || value === null) {
    return seededAdminCancellationPolicy();
  }
  if (!isRecord(value) || value.schemaVersion !== CANCELLATION_POLICY_SCHEMA_VERSION) {
    throw new HttpsError(
      "failed-precondition",
      "Stored platform cancellation policy is invalid.",
    );
  }
  if (!Number.isSafeInteger(value.policyVersion) || (value.policyVersion as number) < 1) {
    throw new HttpsError(
      "failed-precondition",
      "Stored platform cancellation policy version is invalid.",
    );
  }

  const minCutoffHoursBeforeEvent = requireHoursInteger(
    value.minCutoffHoursBeforeEvent,
    "Stored minimum cancellation cutoff",
    CANCELLATION_CUTOFF_HOURS_MIN_HARD,
    CANCELLATION_CUTOFF_HOURS_MAX_HARD,
    "failed-precondition",
  );
  const maxCutoffHoursBeforeEvent = requireHoursInteger(
    value.maxCutoffHoursBeforeEvent,
    "Stored maximum cancellation cutoff",
    CANCELLATION_CUTOFF_HOURS_MIN_HARD,
    CANCELLATION_CUTOFF_HOURS_MAX_HARD,
    "failed-precondition",
  );
  if (minCutoffHoursBeforeEvent > maxCutoffHoursBeforeEvent) {
    throw new HttpsError(
      "failed-precondition",
      "Stored platform cancellation policy bounds are invalid.",
    );
  }
  const defaultCutoffHoursBeforeEvent = requireHoursInteger(
    value.defaultCutoffHoursBeforeEvent,
    "Stored default cancellation cutoff",
    minCutoffHoursBeforeEvent,
    maxCutoffHoursBeforeEvent,
    "failed-precondition",
  );

  const updatedAt = value.updatedAt instanceof Timestamp ? value.updatedAt : null;
  const updatedBy = typeof value.updatedBy === "string" && value.updatedBy.trim()
    ? value.updatedBy.trim()
    : null;

  return {
    schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
    policyVersion: value.policyVersion as number,
    defaultCutoffHoursBeforeEvent,
    minCutoffHoursBeforeEvent,
    maxCutoffHoursBeforeEvent,
    guidanceNote: parseOptionalGuidance(value.guidanceNote, "failed-precondition"),
    updatedAt,
    updatedBy,
  };
}

export function parseProviderCancellationPolicyDraft(
  value: unknown,
  adminPolicy: AdminDefaultCancellationPolicy<unknown>,
): ProviderCancellationPolicyDraft {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "Provider cancellation policy is required.");
  }
  for (const key of Object.keys(value)) {
    if (!PROVIDER_DRAFT_FIELDS.has(key)) {
      throw new HttpsError("invalid-argument", `Unsupported cancellation policy field: ${key}.`);
    }
  }

  if (value.mode === "admin_default") {
    if (value.cutoffHoursBeforeEvent !== undefined && value.cutoffHoursBeforeEvent !== null) {
      throw new HttpsError(
        "invalid-argument",
        "Custom cancellation hours must not be provided when applying the Admin default.",
      );
    }
    return {mode: "admin_default"};
  }

  if (value.mode === "provider_custom") {
    const cutoffHoursBeforeEvent = requireHoursInteger(
      value.cutoffHoursBeforeEvent,
      "Custom cancellation cutoff",
      adminPolicy.minCutoffHoursBeforeEvent,
      adminPolicy.maxCutoffHoursBeforeEvent,
    );
    return {
      mode: "provider_custom",
      cutoffHoursBeforeEvent,
    };
  }

  throw new HttpsError(
    "invalid-argument",
    "Cancellation policy mode must be admin_default or provider_custom.",
  );
}

export function parseStoredProviderCancellationPolicy(
  value: unknown,
): ProviderCancellationPolicy<Timestamp> | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.schemaVersion !== CANCELLATION_POLICY_SCHEMA_VERSION) {
    throw new HttpsError(
      "failed-precondition",
      "Stored Provider cancellation policy is invalid.",
    );
  }
  if (!Number.isSafeInteger(value.policyVersion) || (value.policyVersion as number) < 1) {
    throw new HttpsError(
      "failed-precondition",
      "Stored Provider cancellation policy version is invalid.",
    );
  }
  if (!(value.effectiveAt instanceof Timestamp)) {
    throw new HttpsError(
      "failed-precondition",
      "Stored Provider cancellation policy timestamp is invalid.",
    );
  }

  if (value.mode === "admin_default") {
    return {
      schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
      mode: "admin_default",
      policyVersion: value.policyVersion as number,
      effectiveAt: value.effectiveAt,
    };
  }

  if (value.mode === "provider_custom") {
    const cutoffHoursBeforeEvent = requireHoursInteger(
      value.cutoffHoursBeforeEvent,
      "Stored Provider cancellation cutoff",
      CANCELLATION_CUTOFF_HOURS_MIN_HARD,
      CANCELLATION_CUTOFF_HOURS_MAX_HARD,
      "failed-precondition",
    );
    return {
      schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
      mode: "provider_custom",
      cutoffHoursBeforeEvent,
      policyVersion: value.policyVersion as number,
      effectiveAt: value.effectiveAt,
    };
  }

  throw new HttpsError(
    "failed-precondition",
    "Stored Provider cancellation policy mode is invalid.",
  );
}

export function resolveEffectiveCancellationPolicy(
  providerPolicy: ProviderCancellationPolicy<unknown> | null,
  adminPolicy: AdminDefaultCancellationPolicy<unknown>,
): EffectiveCancellationPolicy {
  if (providerPolicy?.mode === "provider_custom") {
    return {
      sourceKind: "provider_custom",
      cutoffHoursBeforeEvent: providerPolicy.cutoffHoursBeforeEvent,
      adminPolicyVersion: adminPolicy.policyVersion,
      providerPolicyVersion: providerPolicy.policyVersion,
      guidanceNote: adminPolicy.guidanceNote,
    };
  }

  return {
    sourceKind: "admin_default",
    cutoffHoursBeforeEvent: adminPolicy.defaultCutoffHoursBeforeEvent,
    adminPolicyVersion: adminPolicy.policyVersion,
    providerPolicyVersion: providerPolicy?.policyVersion ?? null,
    guidanceNote: adminPolicy.guidanceNote,
  };
}

export function buildCancellationPolicySnapshot(input: {
  effective: EffectiveCancellationPolicy;
  eventStartAt: Date | Timestamp;
  submittedAt: Date | Timestamp;
  capturedAt: Timestamp;
}): CancellationPolicySnapshot<Timestamp> {
  const eventStartTs = input.eventStartAt instanceof Timestamp
    ? input.eventStartAt
    : Timestamp.fromDate(input.eventStartAt);
  const submittedMs = input.submittedAt instanceof Timestamp
    ? input.submittedAt.toMillis()
    : input.submittedAt.getTime();

  const cutoffMs =
    eventStartTs.toMillis() - input.effective.cutoffHoursBeforeEvent * 3_600_000;
  const cancellationCutoffAt = Timestamp.fromMillis(cutoffMs);

  return {
    schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
    sourceKind: input.effective.sourceKind,
    cutoffHoursBeforeEvent: input.effective.cutoffHoursBeforeEvent,
    eventStartAt: eventStartTs,
    cancellationCutoffAt,
    submittedPastCutoff: submittedMs >= cutoffMs,
    adminPolicyVersion: input.effective.adminPolicyVersion,
    providerPolicyVersion: input.effective.providerPolicyVersion,
    capturedAt: input.capturedAt,
  };
}

export function parseStoredCancellationPolicySnapshot(
  value: unknown,
): CancellationPolicySnapshot<Timestamp> | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.schemaVersion !== CANCELLATION_POLICY_SCHEMA_VERSION) {
    throw new HttpsError(
      "failed-precondition",
      "Stored booking cancellation cutoff snapshot is invalid.",
    );
  }
  const sourceKind = value.sourceKind;
  if (sourceKind !== "admin_default" && sourceKind !== "provider_custom") {
    throw new HttpsError(
      "failed-precondition",
      "Stored booking cancellation cutoff source is invalid.",
    );
  }
  const cutoffHoursBeforeEvent = requireHoursInteger(
    value.cutoffHoursBeforeEvent,
    "Stored booking cancellation cutoff",
    CANCELLATION_CUTOFF_HOURS_MIN_HARD,
    CANCELLATION_CUTOFF_HOURS_MAX_HARD,
    "failed-precondition",
  );
  if (
    !(value.eventStartAt instanceof Timestamp) ||
    !(value.cancellationCutoffAt instanceof Timestamp) ||
    !(value.capturedAt instanceof Timestamp) ||
    typeof value.submittedPastCutoff !== "boolean" ||
    !Number.isSafeInteger(value.adminPolicyVersion) ||
    (value.adminPolicyVersion as number) < 1
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Stored booking cancellation cutoff timestamps are invalid.",
    );
  }
  const providerPolicyVersion =
    value.providerPolicyVersion === null
      ? null
      : Number.isSafeInteger(value.providerPolicyVersion) &&
          (value.providerPolicyVersion as number) >= 1
        ? (value.providerPolicyVersion as number)
        : null;

  return {
    schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
    sourceKind,
    cutoffHoursBeforeEvent,
    eventStartAt: value.eventStartAt,
    cancellationCutoffAt: value.cancellationCutoffAt,
    submittedPastCutoff: value.submittedPastCutoff,
    adminPolicyVersion: value.adminPolicyVersion as number,
    providerPolicyVersion,
    capturedAt: value.capturedAt,
  };
}
