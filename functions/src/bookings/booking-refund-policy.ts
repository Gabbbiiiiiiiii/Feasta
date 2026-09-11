import {
  Timestamp,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {
  effectiveRefundPolicyKey,
  parseRefundPolicyDraft,
  resolveEffectiveRefundPolicy,
  requireSafeDocumentId,
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_SCHEMA_VERSION,
  type EffectiveRefundPolicy,
  type RefundEligibilityStage,
  type RefundPolicyRule,
} from "../refund-policies/refund-policy-domain.js";

type UnknownRecord = Record<string, unknown>;

export const REFUND_POLICY_ROLLOUT_DOCUMENT_ID =
  "refundPolicyBookingAgreement";
export const REFUND_POLICY_AGREEMENT_SCHEMA_VERSION = 1 as const;
export const REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION = 1 as const;
export const MAX_BOOKING_POLICY_RELATIONSHIPS = 21;

export const REFUND_POLICY_ERROR_REASONS = {
  required: "REFUND_POLICY_REQUIRED",
  acknowledgementRequired:
    "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED",
  changed: "REFUND_POLICY_CHANGED",
  invalid: "REFUND_POLICY_INVALID",
  acknowledgementInvalid:
    "REFUND_POLICY_ACKNOWLEDGEMENT_INVALID",
} as const;

export type RefundPolicyErrorReason =
  (typeof REFUND_POLICY_ERROR_REASONS)[
    keyof typeof REFUND_POLICY_ERROR_REASONS
  ];

export type BookingRefundPolicyRolloutMode =
  | "off"
  | "required";

export type RefundPolicyAcknowledgement = {
  providerId: string;
  effectivePolicyKey: string;
};

export type BookingRefundPolicyRelationship = {
  providerId: string;
  providerName: string;
  providerData: Readonly<UnknownRecord>;
  packageRecord?: {
    packageId: string;
    data: Readonly<UnknownRecord>;
  } | null;
};

export type ResolvedBookingRefundPolicy = {
  providerId: string;
  providerName: string;
  effective: EffectiveRefundPolicy;
};

export type EffectiveRefundPolicyDisclosure = {
  providerId: string;
  providerName: string;
  effectivePolicyKey: string;
  sourceKind:
    "provider_default" |
    "package_override";
  policyVersion: number;
  rules: readonly RefundPolicyRule[];
  terms: string | null;
};

export type RefundPolicySnapshot<
  TTimestamp = unknown,
> = {
  schemaVersion: typeof REFUND_POLICY_SCHEMA_VERSION;
  policyKey: string;
  source: EffectiveRefundPolicy["source"];
  rules: readonly RefundPolicyRule[];
  terms: string | null;
  capturedAt: TTimestamp;
};

export type CustomerRefundPolicyAgreement<
  TTimestamp = unknown,
> = {
  schemaVersion: typeof REFUND_POLICY_AGREEMENT_SCHEMA_VERSION;
  policyKey: string;
  agreedAt: TTimestamp;
  channel: "booking_submission";
};

export type RefundEligibilityState<
  TTimestamp = unknown,
> = {
  schemaVersion: typeof REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION;
  currentStage: RefundEligibilityStage;
  stageSequence: number;
  enteredAt: TTimestamp;
  activeCancellationRequestId: string | null;
};

export type ProviderRequestRefundPolicyEvidence<
  TTimestamp = unknown,
> = {
  refundPolicySnapshot:
    RefundPolicySnapshot<TTimestamp>;
  refundPolicyAgreement:
    CustomerRefundPolicyAgreement<TTimestamp>;
  refundEligibilityState:
    RefundEligibilityState<TTimestamp>;
};

export type ProviderRequestRefundPolicyClassification =
  | {status: "legacy"}
  | {status: "policy_backed"}
  | {status: "invalid"};

const ACKNOWLEDGEMENT_FIELDS = new Set([
  "providerId",
  "effectivePolicyKey",
]);

const CLIENT_POLICY_AUTHORITY_FIELDS = new Set([
  "refundPolicy",
  "refundPolicySnapshot",
  "refundPolicyAgreement",
  "refundEligibilityState",
  "refundPolicyRules",
  "rules",
  "terms",
  "refundBasisPoints",
  "refundPercentage",
  "refundAmount",
  "policyVersion",
  "policyKey",
  "sourceKind",
  "sourceId",
  "eligibilityStage",
  "currentStage",
  "stage",
]);

const SNAPSHOT_FIELDS = new Set([
  "schemaVersion",
  "policyKey",
  "source",
  "rules",
  "terms",
  "capturedAt",
]);

const SOURCE_FIELDS = new Set([
  "kind",
  "sourceId",
  "policyVersion",
]);

const AGREEMENT_FIELDS = new Set([
  "schemaVersion",
  "policyKey",
  "agreedAt",
  "channel",
]);

const ELIGIBILITY_FIELDS = new Set([
  "schemaVersion",
  "currentStage",
  "stageSequence",
  "enteredAt",
  "activeCancellationRequestId",
]);

export function parseBookingRefundPolicyRollout(
  input: {
    exists: boolean;
    data: Readonly<UnknownRecord> | undefined;
  },
): BookingRefundPolicyRolloutMode {
  if (!input.exists) {
    return "off";
  }

  if (
    !input.data ||
    input.data.schemaVersion !== 1 ||
    input.data.isPublic !== false ||
    (
      input.data.enforcementMode !== "off" &&
      input.data.enforcementMode !== "required"
    )
  ) {
    throw refundPolicyError(
      REFUND_POLICY_ERROR_REASONS.invalid,
      "Refund policy booking configuration is unavailable.",
    );
  }

  return input.data.enforcementMode;
}

export function rejectClientRefundPolicyAuthority(
  input: Readonly<UnknownRecord>,
): void {
  if (
    Object.keys(input).some(
      (field) =>
        CLIENT_POLICY_AUTHORITY_FIELDS.has(field),
    )
  ) {
    throw refundPolicyError(
      REFUND_POLICY_ERROR_REASONS
        .acknowledgementInvalid,
      "Refund policy acknowledgement is invalid.",
      "invalid-argument",
    );
  }
}

export function parseRefundPolicyAcknowledgements(
  value: unknown,
): readonly RefundPolicyAcknowledgement[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.length >
      MAX_BOOKING_POLICY_RELATIONSHIPS
  ) {
    throw acknowledgementInvalid();
  }

  const seen = new Set<string>();
  const acknowledgements = value.map(
    (candidate): RefundPolicyAcknowledgement => {
      const record = requireExactRecord(
        candidate,
        ACKNOWLEDGEMENT_FIELDS,
      );
      let providerId: string;

      try {
        providerId = requireSafeDocumentId(
          record.providerId,
          "Provider",
        );
      } catch {
        throw acknowledgementInvalid();
      }

      const effectivePolicyKey =
        boundedPolicyKey(
          record.effectivePolicyKey,
        );

      if (seen.has(providerId)) {
        throw acknowledgementInvalid();
      }

      seen.add(providerId);

      return {
        providerId,
        effectivePolicyKey,
      };
    },
  );

  return acknowledgements.sort(
    (left, right) =>
      left.providerId.localeCompare(
        right.providerId,
      ),
  );
}

export function resolveBookingRefundPolicies(
  relationships:
    readonly BookingRefundPolicyRelationship[],
): ReadonlyMap<string, ResolvedBookingRefundPolicy> {
  if (
    relationships.length < 1 ||
    relationships.length >
      MAX_BOOKING_POLICY_RELATIONSHIPS
  ) {
    throw refundPolicyError(
      REFUND_POLICY_ERROR_REASONS.invalid,
      "Refund policy relationships are invalid.",
    );
  }

  const resolved = new Map<
    string,
    ResolvedBookingRefundPolicy
  >();

  for (const relationship of relationships) {
    if (resolved.has(relationship.providerId)) {
      throw refundPolicyError(
        REFUND_POLICY_ERROR_REASONS.invalid,
        "Refund policy relationships are invalid.",
      );
    }

    const providerName = boundedProviderName(
      relationship.providerName,
    );

    let resolution;

    try {
      resolution = resolveEffectiveRefundPolicy({
        providerId: relationship.providerId,
        provider: relationship.providerData,
        packageRecord:
          relationship.packageRecord,
      });
    } catch {
      throw refundPolicyError(
        REFUND_POLICY_ERROR_REASONS.invalid,
        "A Provider refund policy is invalid.",
      );
    }

    if (resolution.status === "missing") {
      throw refundPolicyError(
        REFUND_POLICY_ERROR_REASONS.required,
        "A selected Provider has not published a refund policy.",
      );
    }

    resolved.set(
      relationship.providerId,
      {
        providerId:
          relationship.providerId,
        providerName,
        effective: resolution.effective,
      },
    );
  }

  return resolved;
}

export function refundPolicyDisclosures(
  policies:
    ReadonlyMap<string, ResolvedBookingRefundPolicy>,
): readonly EffectiveRefundPolicyDisclosure[] {
  return [...policies.values()]
    .sort(
      (left, right) =>
        left.providerId.localeCompare(
          right.providerId,
        ),
    )
    .map((resolved) => ({
      providerId: resolved.providerId,
      providerName: resolved.providerName,
      effectivePolicyKey:
        resolved.effective
          .effectivePolicyKey,
      sourceKind:
        resolved.effective.source.kind,
      policyVersion:
        resolved.effective.source
          .policyVersion,
      rules: resolved.effective.policy.rules.map(
        (rule) => ({...rule}),
      ),
      terms: resolved.effective.policy.terms,
    }));
}

export function assertRefundPolicyAcknowledgements(
  policies:
    ReadonlyMap<string, ResolvedBookingRefundPolicy>,
  acknowledgements:
    readonly RefundPolicyAcknowledgement[],
): void {
  if (
    policies.size !== acknowledgements.length
  ) {
    throw refundPolicyError(
      REFUND_POLICY_ERROR_REASONS
        .acknowledgementRequired,
      "Review and acknowledge every current Provider refund policy.",
    );
  }

  const acknowledgementByProvider =
    new Map(
      acknowledgements.map(
        (acknowledgement) => [
          acknowledgement.providerId,
          acknowledgement,
        ],
      ),
    );

  for (const policy of policies.values()) {
    const acknowledgement =
      acknowledgementByProvider.get(
        policy.providerId,
      );

    if (!acknowledgement) {
      throw refundPolicyError(
        REFUND_POLICY_ERROR_REASONS
          .acknowledgementRequired,
        "Review and acknowledge every current Provider refund policy.",
      );
    }

    if (
      acknowledgement.effectivePolicyKey !==
        policy.effective.effectivePolicyKey
    ) {
      throw refundPolicyError(
        REFUND_POLICY_ERROR_REASONS.changed,
        "A Provider refund policy changed. Review the current policy and try again.",
      );
    }
  }
}

export function buildProviderRequestRefundPolicyEvidence<
  TTimestamp,
>(
  policy: ResolvedBookingRefundPolicy,
  timestamp: TTimestamp,
): ProviderRequestRefundPolicyEvidence<TTimestamp> {
  const source = {
    ...policy.effective.source,
  };
  const rules =
    policy.effective.policy.rules.map(
      (rule) => ({...rule}),
    );
  const policyKey =
    policy.effective.effectivePolicyKey;

  return {
    refundPolicySnapshot: {
      schemaVersion:
        REFUND_POLICY_SCHEMA_VERSION,
      policyKey,
      source,
      rules,
      terms:
        policy.effective.policy.terms,
      capturedAt: timestamp,
    },
    refundPolicyAgreement: {
      schemaVersion:
        REFUND_POLICY_AGREEMENT_SCHEMA_VERSION,
      policyKey,
      agreedAt: timestamp,
      channel: "booking_submission",
    },
    refundEligibilityState: {
      schemaVersion:
        REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
      currentStage:
        "preparation_not_started",
      stageSequence: 0,
      enteredAt: timestamp,
      activeCancellationRequestId: null,
    },
  };
}

export function classifyProviderRequestRefundPolicyEvidence(
  request: Readonly<UnknownRecord>,
): ProviderRequestRefundPolicyClassification {
  const values = [
    request.refundPolicySnapshot,
    request.refundPolicyAgreement,
    request.refundEligibilityState,
  ];
  const presentCount = values.filter(
    (value) =>
      value !== undefined && value !== null,
  ).length;

  if (presentCount === 0) {
    return {status: "legacy"};
  }

  if (presentCount !== values.length) {
    return {status: "invalid"};
  }

  try {
    const snapshot = requireExactRecord(
      request.refundPolicySnapshot,
      SNAPSHOT_FIELDS,
    );
    const source = requireExactRecord(
      snapshot.source,
      SOURCE_FIELDS,
    );
    const agreement = requireExactRecord(
      request.refundPolicyAgreement,
      AGREEMENT_FIELDS,
    );
    const eligibility = requireExactRecord(
      request.refundEligibilityState,
      ELIGIBILITY_FIELDS,
    );
    const policyKey = boundedPolicyKey(
      snapshot.policyKey,
    );
    const policyDraft = parseRefundPolicyDraft({
      rules: snapshot.rules,
      terms: snapshot.terms,
    });

    if (
      snapshot.schemaVersion !==
        REFUND_POLICY_SCHEMA_VERSION ||
      policyDraft.rules.length !== 3 ||
      (
        source.kind !== "provider_default" &&
        source.kind !== "package_override"
      ) ||
      typeof source.sourceId !== "string" ||
      !Number.isSafeInteger(
        source.policyVersion,
      ) ||
      (source.policyVersion as number) < 1 ||
      effectiveRefundPolicyKey({
        kind: source.kind,
        sourceId: source.sourceId,
        policyVersion:
          source.policyVersion as number,
      }) !== policyKey ||
      !(snapshot.capturedAt instanceof Timestamp) ||
      agreement.schemaVersion !==
        REFUND_POLICY_AGREEMENT_SCHEMA_VERSION ||
      agreement.policyKey !== policyKey ||
      agreement.channel !==
        "booking_submission" ||
      !(agreement.agreedAt instanceof Timestamp) ||
      eligibility.schemaVersion !==
        REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION ||
      !REFUND_ELIGIBILITY_STAGES.includes(
        eligibility.currentStage as RefundEligibilityStage,
      ) ||
      !Number.isSafeInteger(
        eligibility.stageSequence,
      ) ||
      (eligibility.stageSequence as number) < 0 ||
      (
        eligibility.currentStage ===
          "preparation_not_started" &&
        eligibility.stageSequence !== 0
      ) ||
      (
        eligibility.currentStage ===
          "preparation_started" &&
        eligibility.stageSequence !== 1
      ) ||
      (
        eligibility.currentStage ===
          "service_started" &&
        eligibility.stageSequence !== 1 &&
        eligibility.stageSequence !== 2
      ) ||
      !(eligibility.enteredAt instanceof Timestamp) ||
      !validActiveCancellationRequestId(
        eligibility.activeCancellationRequestId,
      )
    ) {
      return {status: "invalid"};
    }

    return {status: "policy_backed"};
  } catch {
    return {status: "invalid"};
  }
}

export function requireRefundEligibilityState(
  request: Readonly<UnknownRecord>,
): RefundEligibilityState<Timestamp> {
  if (
    classifyProviderRequestRefundPolicyEvidence(request).status !==
      "policy_backed"
  ) {
    throw refundPolicyError(
      REFUND_POLICY_ERROR_REASONS.invalid,
      "Provider refund policy evidence is invalid.",
    );
  }

  const eligibility = request.refundEligibilityState as UnknownRecord;

  return {
    schemaVersion: REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
    currentStage:
      eligibility.currentStage as RefundEligibilityStage,
    stageSequence: eligibility.stageSequence as number,
    enteredAt: eligibility.enteredAt as Timestamp,
    activeCancellationRequestId:
      eligibility.activeCancellationRequestId as string | null,
  };
}

function requireExactRecord(
  value: unknown,
  fields: ReadonlySet<string>,
): UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw acknowledgementInvalid();
  }

  const record = value as UnknownRecord;

  if (
    Object.keys(record).length !== fields.size ||
    Object.keys(record).some(
      (field) => !fields.has(field),
    ) ||
    [...fields].some(
      (field) => !Object.hasOwn(record, field),
    )
  ) {
    throw acknowledgementInvalid();
  }

  return record;
}

function boundedPolicyKey(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 180 ||
    !/^[A-Za-z0-9_:-]+$/u.test(value)
  ) {
    throw acknowledgementInvalid();
  }

  return value;
}

function boundedProviderName(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > 160
  ) {
    throw refundPolicyError(
      REFUND_POLICY_ERROR_REASONS.invalid,
      "Provider refund policy presentation is unavailable.",
    );
  }

  return value.trim();
}

function validActiveCancellationRequestId(
  value: unknown,
): boolean {
  if (value === null) {
    return true;
  }

  try {
    requireSafeDocumentId(
      value,
      "Cancellation request",
    );
    return true;
  } catch {
    return false;
  }
}

function acknowledgementInvalid(): HttpsError {
  return refundPolicyError(
    REFUND_POLICY_ERROR_REASONS
      .acknowledgementInvalid,
    "Refund policy acknowledgement is invalid.",
    "invalid-argument",
  );
}

function refundPolicyError(
  reason: RefundPolicyErrorReason,
  message: string,
  code:
    "invalid-argument" |
    "failed-precondition" =
      "failed-precondition",
): HttpsError {
  return new HttpsError(
    code,
    message,
    {
      reason,
      refreshRefundPolicies:
        reason ===
          REFUND_POLICY_ERROR_REASONS.changed ||
        reason ===
          REFUND_POLICY_ERROR_REASONS.required ||
        reason ===
          REFUND_POLICY_ERROR_REASONS
            .acknowledgementRequired,
    },
  );
}
