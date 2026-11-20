import {
  Timestamp,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

export const REFUND_POLICY_SCHEMA_VERSION = 1 as const;

export const REFUND_ELIGIBILITY_STAGES = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
] as const;

export type RefundEligibilityStage =
  (typeof REFUND_ELIGIBILITY_STAGES)[number];

export const REFUND_BASIS_POINTS_MIN = 0;
export const REFUND_BASIS_POINTS_MAX = 10_000;
export const REFUND_POLICY_TERMS_MAX_LENGTH = 4_000;

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_EFFECTIVE_POLICY_KEY_LENGTH = 180;

const DRAFT_FIELDS = new Set([
  "rules",
  "terms",
]);

const RULE_FIELDS = new Set([
  "stage",
  "refundBasisPoints",
]);

const STORED_POLICY_FIELDS = new Set([
  "schemaVersion",
  "policyVersion",
  "rules",
  "terms",
  "effectiveAt",
]);

export type RefundPolicyRule = {
  stage: RefundEligibilityStage;
  refundBasisPoints: number;
};

export type RefundPolicyDraft = {
  rules: readonly RefundPolicyRule[];
  terms: string | null;
};

export type RefundPolicy<
  TTimestamp = unknown,
> = {
  schemaVersion: typeof REFUND_POLICY_SCHEMA_VERSION;
  policyVersion: number;
  rules: readonly RefundPolicyRule[];
  terms: string | null;
  effectiveAt: TTimestamp;
};

export type EffectiveRefundPolicy = {
  effectivePolicyKey: string;
  source: {
    kind: "provider_default" | "package_override";
    sourceId: string;
    policyVersion: number;
  };
  policy: RefundPolicy<Timestamp>;
};

export type EffectiveRefundPolicyResolution =
  | {
    status: "resolved";
    effective: EffectiveRefundPolicy;
  }
  | {
    status: "missing";
    reason: "provider_default_missing";
  };

export function parseRefundPolicyDraft(
  value: unknown,
): RefundPolicyDraft {
  const input = requireRecord(
    value,
    "Refund policy",
    "invalid-argument",
  );

  rejectUnknownFields(
    input,
    DRAFT_FIELDS,
    "Refund policy",
    "invalid-argument",
  );

  if (!Object.hasOwn(input, "rules")) {
    throw invalidPolicy(
      "Refund policy rules are required.",
    );
  }

  if (!Array.isArray(input.rules)) {
    throw invalidPolicy(
      "Refund policy rules are invalid.",
    );
  }

  if (
    input.rules.length !==
      REFUND_ELIGIBILITY_STAGES.length
  ) {
    throw invalidPolicy(
      "Refund policy must contain exactly one rule for every stage.",
    );
  }

  const byStage = new Map<
    RefundEligibilityStage,
    RefundPolicyRule
  >();

  for (const candidate of input.rules) {
    const rule = parseRule(
      candidate,
      "invalid-argument",
    );

    if (byStage.has(rule.stage)) {
      throw invalidPolicy(
        "Refund policy stages must not be duplicated.",
      );
    }

    byStage.set(rule.stage, rule);
  }

  const rules = REFUND_ELIGIBILITY_STAGES.map(
    (stage) => {
      const rule = byStage.get(stage);

      if (!rule) {
        throw invalidPolicy(
          "Refund policy is missing a required stage.",
        );
      }

      return rule;
    },
  );

  return {
    rules,
    terms: parseTerms(input.terms),
  };
}

export function parseStoredRefundPolicy(
  value: unknown,
  fieldName = "Refund policy",
): RefundPolicy<Timestamp> | null {
  if (value === undefined || value === null) {
    return null;
  }

  const input = requireRecord(
    value,
    fieldName,
    "failed-precondition",
  );

  rejectUnknownFields(
    input,
    STORED_POLICY_FIELDS,
    fieldName,
    "failed-precondition",
  );

  for (const field of STORED_POLICY_FIELDS) {
    if (!Object.hasOwn(input, field)) {
      throw storedPolicyInvalid(fieldName);
    }
  }

  if (
    input.schemaVersion !==
      REFUND_POLICY_SCHEMA_VERSION ||
    !isPositiveSafeInteger(
      input.policyVersion,
    ) ||
    !(input.effectiveAt instanceof Timestamp)
  ) {
    throw storedPolicyInvalid(fieldName);
  }

  let draft: RefundPolicyDraft;

  try {
    draft = parseRefundPolicyDraft({
      rules: input.rules,
      terms: input.terms,
    });
  } catch {
    throw storedPolicyInvalid(fieldName);
  }

  return {
    schemaVersion:
      REFUND_POLICY_SCHEMA_VERSION,
    policyVersion:
      input.policyVersion as number,
    rules: draft.rules,
    terms: draft.terms,
    effectiveAt: input.effectiveAt,
  };
}

export function buildNextRefundPolicy<
  TTimestamp,
>(input: {
  currentPolicyVersion: number | null;
  draft: RefundPolicyDraft;
  effectiveAt: TTimestamp;
}): RefundPolicy<TTimestamp> {
  const currentVersion =
    input.currentPolicyVersion ?? 0;

  return {
    schemaVersion:
      REFUND_POLICY_SCHEMA_VERSION,
    policyVersion:
      nextRefundPolicyVersion(
        currentVersion,
      ),
    rules: input.draft.rules,
    terms: input.draft.terms,
    effectiveAt: input.effectiveAt,
  };
}

export function nextRefundPolicyVersion(
  currentVersion: unknown,
): number {
  if (
    !Number.isSafeInteger(currentVersion) ||
    (currentVersion as number) < 0 ||
    (currentVersion as number) >=
      Number.MAX_SAFE_INTEGER
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The refund policy version is invalid.",
    );
  }

  return (currentVersion as number) + 1;
}

export function effectiveRefundPolicyKey(
  input: {
    kind: "provider_default" | "package_override";
    sourceId: string;
    policyVersion: number;
  },
): string {
  if (
    !SAFE_DOCUMENT_ID.test(input.sourceId) ||
    !isPositiveSafeInteger(
      input.policyVersion,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The refund policy source is invalid.",
    );
  }

  const key =
    `${input.kind}:${input.sourceId}:v${input.policyVersion}`;

  if (
    key.length >
      MAX_EFFECTIVE_POLICY_KEY_LENGTH
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The refund policy key is invalid.",
    );
  }

  return key;
}

export function resolveEffectiveRefundPolicy(
  input: {
    providerId: string;
    provider:
      Readonly<Record<string, unknown>>;
    packageRecord?: {
      packageId: string;
      data:
        Readonly<Record<string, unknown>>;
    } | null;
  },
): EffectiveRefundPolicyResolution {
  requireSafeDocumentId(
    input.providerId,
    "Provider",
  );

  if (input.packageRecord) {
    requireSafeDocumentId(
      input.packageRecord.packageId,
      "Package",
    );

    if (
      input.packageRecord.data.providerId !==
        input.providerId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The package does not belong to the provider.",
      );
    }

    const override =
      parseStoredRefundPolicy(
        input.packageRecord.data
          .refundPolicyOverride,
        "Package refund policy override",
      );

    if (override) {
      return resolvedPolicy({
        kind: "package_override",
        sourceId:
          input.packageRecord.packageId,
        policy: override,
      });
    }
  }

  const providerPolicy =
    parseStoredRefundPolicy(
      input.provider.refundPolicy,
      "Provider refund policy",
    );

  if (!providerPolicy) {
    return {
      status: "missing",
      reason:
        "provider_default_missing",
    };
  }

  return resolvedPolicy({
    kind: "provider_default",
    sourceId: input.providerId,
    policy: providerPolicy,
  });
}

export function requireSafeDocumentId(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !SAFE_DOCUMENT_ID.test(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} identifier is invalid.`,
    );
  }

  return value;
}

function resolvedPolicy(
  input: {
    kind:
      "provider_default" |
      "package_override";
    sourceId: string;
    policy: RefundPolicy<Timestamp>;
  },
): EffectiveRefundPolicyResolution {
  const source = {
    kind: input.kind,
    sourceId: input.sourceId,
    policyVersion:
      input.policy.policyVersion,
  } as const;

  return {
    status: "resolved",
    effective: {
      effectivePolicyKey:
        effectiveRefundPolicyKey(
          source,
        ),
      source,
      policy: input.policy,
    },
  };
}

function parseRule(
  value: unknown,
  code:
    "invalid-argument" |
    "failed-precondition",
): RefundPolicyRule {
  const input = requireRecord(
    value,
    "Refund policy rule",
    code,
  );

  rejectUnknownFields(
    input,
    RULE_FIELDS,
    "Refund policy rule",
    code,
  );

  if (
    !Object.hasOwn(input, "stage") ||
    !Object.hasOwn(
      input,
      "refundBasisPoints",
    ) ||
    !REFUND_ELIGIBILITY_STAGES.includes(
      input.stage as RefundEligibilityStage,
    ) ||
    !Number.isSafeInteger(
      input.refundBasisPoints,
    ) ||
    (input.refundBasisPoints as number) <
      REFUND_BASIS_POINTS_MIN ||
    (input.refundBasisPoints as number) >
      REFUND_BASIS_POINTS_MAX
  ) {
    throw new HttpsError(
      code,
      "Refund policy rule is invalid.",
    );
  }

  return {
    stage:
      input.stage as RefundEligibilityStage,
    refundBasisPoints:
      input.refundBasisPoints as number,
  };
}

function parseTerms(
  value: unknown,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidPolicy(
      "Refund policy terms are invalid.",
    );
  }

  if (
    value.length >
      REFUND_POLICY_TERMS_MAX_LENGTH
  ) {
    throw invalidPolicy(
      "Refund policy terms are too long.",
    );
  }

  const normalized = value.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

function requireRecord(
  value: unknown,
  label: string,
  code:
    "invalid-argument" |
    "failed-precondition",
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      code,
      `${label} is invalid.`,
    );
  }

  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Readonly<
    Record<string, unknown>
  >,
  allowed: ReadonlySet<string>,
  label: string,
  code:
    "invalid-argument" |
    "failed-precondition",
): void {
  if (
    Object.keys(value).some(
      (field) => !allowed.has(field),
    )
  ) {
    throw new HttpsError(
      code,
      `${label} contains unsupported fields.`,
    );
  }
}

function isPositiveSafeInteger(
  value: unknown,
): boolean {
  return Number.isSafeInteger(value) &&
    (value as number) > 0;
}

function invalidPolicy(
  message: string,
): HttpsError {
  return new HttpsError(
    "invalid-argument",
    message,
  );
}

function storedPolicyInvalid(
  fieldName: string,
): HttpsError {
  return new HttpsError(
    "failed-precondition",
    `${fieldName} is invalid.`,
  );
}
