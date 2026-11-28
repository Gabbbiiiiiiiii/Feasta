import {BALANCE_DUE_HOURS_BEFORE_EVENT} from "../payments/canonical-balance-timing.js";
import {createHash} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

type UnknownRecord =
  Record<string, unknown>;

const BASIS_POINTS_SCALE =
  10_000;

const MAX_POLICY_HOURS =
  24 * 365;

const SAFE_SERVICE_CATEGORY_CODE =
  /^[a-z0-9_]{2,80}$/u;

const SAFE_SOURCE_ID =
  /^[A-Za-z0-9_-]{2,160}$/u;

export const SERVICE_BOOKING_POLICY_SCHEMA_VERSION =
  1 as const;

export type ServiceBookingPolicy = {
  payment: {
    onlineOnly: true;

    depositAllowed: boolean;

    depositRateBps: number;

    depositMinimumNoticeHours:
      number;

    balanceDueHoursBeforeEvent:
      number;
  };

  preparation: {
    enabled: boolean;

    leadTimeHours: number;

    requiresFullPayment:
      boolean;

    providerStartsManually:
      boolean;
  };

  sameDay: {
    allowed: boolean;

    requiresManualApproval:
      boolean;
  };

  cancellation: {
    beforePreparationRefundRateBps:
      number;

    duringPreparationRefundRateBps:
      number;

    noRefundHoursBeforeEvent:
      number;
  };

  lifecycle: {
    autoStartAtScheduledTime:
      boolean;

    providerConfirmsCompletion:
      boolean;
  };
};

export type ServiceBookingPolicyOverride = {
  payment?: Partial<
    ServiceBookingPolicy["payment"]
  >;

  preparation?: Partial<
    ServiceBookingPolicy["preparation"]
  >;

  sameDay?: Partial<
    ServiceBookingPolicy["sameDay"]
  >;

  cancellation?: Partial<
    ServiceBookingPolicy["cancellation"]
  >;

  lifecycle?: Partial<
    ServiceBookingPolicy["lifecycle"]
  >;
};

export type ResolvedServiceBookingPolicy = {
  schemaVersion:
    typeof SERVICE_BOOKING_POLICY_SCHEMA_VERSION;

  effectivePolicyKey: string;

  source: {
    platformPolicyVersion:
      number;

    serviceCategoryCode:
      string;

    serviceCategoryPolicyVersion:
      number | null;

    packageId:
      string | null;

    packagePolicyVersion:
      number | null;
  };

  policy:
    ServiceBookingPolicy;
};

/*
 * Bootstrap defaults only.
 *
 * Runtime Firestore policy can override configurable defaults
 * through appSettings/platform and the selected
 * service-category/package records. The balance deadline remains
 * a FEASTA invariant regardless of stored overrides.
 *
 * Business logic must consume the resolved
 * effective policy instead of importing these
 * constants directly.
 */
const BOOTSTRAP_SERVICE_BOOKING_POLICY:
ServiceBookingPolicy = {
  payment: {
    onlineOnly: true,

    depositAllowed: true,

    depositRateBps:
      5_000,

    depositMinimumNoticeHours:
      72,

    balanceDueHoursBeforeEvent:
      BALANCE_DUE_HOURS_BEFORE_EVENT,
  },

  preparation: {
    enabled: true,

    leadTimeHours:
      24,

    requiresFullPayment:
      true,

    providerStartsManually:
      false,
  },

  sameDay: {
    allowed: false,

    requiresManualApproval:
      true,
  },

  cancellation: {
    beforePreparationRefundRateBps:
      10_000,

    duringPreparationRefundRateBps:
      5_000,

    noRefundHoursBeforeEvent:
      24,
  },

  lifecycle: {
    autoStartAtScheduledTime:
      true,

    providerConfirmsCompletion:
      true,
  },
};

export function resolveServiceBookingPolicy(
  input: {
    platformSettings:
      Readonly<UnknownRecord> | null;

    serviceCategoryCode:
      string;

    serviceCategory:
      Readonly<UnknownRecord>;

    packageId?: string | null;

    packageData?:
      Readonly<UnknownRecord> | null;
  },
): ResolvedServiceBookingPolicy {
  const serviceCategoryCode =
    requireServiceCategoryCode(
      input.serviceCategoryCode,
    );

  const platformSettings =
    input.platformSettings ?? {};

  const platformOverride =
    parsePolicyOverride(
      platformSettings
        .serviceBookingPolicyDefaults,
      "Platform booking policy",
    );

  let policy =
    mergePolicy(
      clonePolicy(
        BOOTSTRAP_SERVICE_BOOKING_POLICY,
      ),
      platformOverride,
    );

  const categoryOverrideValue =
    input.serviceCategory
      .bookingPolicy;

  const categoryOverride =
    parsePolicyOverride(
      categoryOverrideValue,
      "Service-category booking policy",
    );

  policy =
    mergePolicy(
      policy,
      categoryOverride,
    );

  const packageData =
    input.packageData ?? {};

  const packageOverrideValue =
    packageData
      .bookingPolicyOverride;

  const packageOverride =
    parsePolicyOverride(
      packageOverrideValue,
      "Package booking-policy override",
    );

  policy =
    mergePolicy(
      policy,
      packageOverride,
    );

  // Normalize before validation and hashing; stored overrides have no authority.
  policy.payment.balanceDueHoursBeforeEvent = BALANCE_DUE_HOURS_BEFORE_EVENT;

  validatePolicy(policy);

  const platformPolicyVersion =
    policyVersion(
      platformSettings
        .serviceBookingPolicyVersion,
      1,
      "Platform booking-policy version",
    );

  const serviceCategoryPolicyVersion =
    categoryOverrideValue ===
      undefined ||
    categoryOverrideValue ===
      null
      ? null
      : policyVersion(
          input.serviceCategory
            .bookingPolicyVersion,
          1,
          "Service-category booking-policy version",
        );

  const packageId =
    optionalSourceId(
      input.packageId,
      "Package",
    );

  const packagePolicyVersion =
    packageOverrideValue === undefined ||
    packageOverrideValue === null
      ? null
      : policyVersion(
          packageData
            .bookingPolicyVersion,
          1,
          "Package booking-policy version",
        );

  const source = {
    platformPolicyVersion,
    serviceCategoryCode,
    serviceCategoryPolicyVersion,
    packageId,
    packagePolicyVersion,
  };

  const effectivePolicyKey =
    createHash("sha256")
      .update(
        JSON.stringify({
          schemaVersion:
            SERVICE_BOOKING_POLICY_SCHEMA_VERSION,

          source,

          policy,
        }),
      )
      .digest("hex");

  return {
    schemaVersion:
      SERVICE_BOOKING_POLICY_SCHEMA_VERSION,

    effectivePolicyKey,

    source,

    policy,
  };
}

function clonePolicy(
  policy:
    ServiceBookingPolicy,
): ServiceBookingPolicy {
  return {
    payment: {
      ...policy.payment,
    },

    preparation: {
      ...policy.preparation,
    },

    sameDay: {
      ...policy.sameDay,
    },

    cancellation: {
      ...policy.cancellation,
    },

    lifecycle: {
      ...policy.lifecycle,
    },
  };
}

function mergePolicy(
  current:
    ServiceBookingPolicy,

  override:
    ServiceBookingPolicyOverride,
): ServiceBookingPolicy {
  return {
    payment: {
      ...current.payment,
      ...override.payment,
    },

    preparation: {
      ...current.preparation,
      ...override.preparation,
    },

    sameDay: {
      ...current.sameDay,
      ...override.sameDay,
    },

    cancellation: {
      ...current.cancellation,
      ...override.cancellation,
    },

    lifecycle: {
      ...current.lifecycle,
      ...override.lifecycle,
    },
  };
}

function parsePolicyOverride(
  value: unknown,
  label: string,
): ServiceBookingPolicyOverride {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  const record =
    requireRecord(
      value,
      label,
    );

  assertOnlyFields(
    record,
    new Set([
      "payment",
      "preparation",
      "sameDay",
      "cancellation",
      "lifecycle",
    ]),
    label,
  );

  const result:
    ServiceBookingPolicyOverride = {};

  if (
    record.payment !==
      undefined
  ) {
    result.payment =
      parsePaymentOverride(
        record.payment,
        label,
      );
  }

  if (
    record.preparation !==
      undefined
  ) {
    result.preparation =
      parsePreparationOverride(
        record.preparation,
        label,
      );
  }

  if (
    record.sameDay !==
      undefined
  ) {
    result.sameDay =
      parseSameDayOverride(
        record.sameDay,
        label,
      );
  }

  if (
    record.cancellation !==
      undefined
  ) {
    result.cancellation =
      parseCancellationOverride(
        record.cancellation,
        label,
      );
  }

  if (
    record.lifecycle !==
      undefined
  ) {
    result.lifecycle =
      parseLifecycleOverride(
        record.lifecycle,
        label,
      );
  }

  return result;
}

function parsePaymentOverride(
  value: unknown,
  parentLabel: string,
): Partial<
  ServiceBookingPolicy["payment"]
> {
  const label =
    `${parentLabel} payment`;

  const record =
    requireRecord(
      value,
      label,
    );

  assertOnlyFields(
    record,
    new Set([
      "onlineOnly",
      "depositAllowed",
      "depositRateBps",
      "depositMinimumNoticeHours",
      "balanceDueHoursBeforeEvent",
    ]),
    label,
  );

  const result:
    Partial<
      ServiceBookingPolicy["payment"]
    > = {};

  if (
    record.onlineOnly !==
      undefined
  ) {
    const onlineOnly =
      requiredBoolean(
        record.onlineOnly,
        `${label} online-only setting`,
      );

    if (!onlineOnly) {
      throw invalidPolicy(
        "FEASTA payment policy must remain online-only.",
      );
    }

    result.onlineOnly =
      true;
  }

  if (
    record.depositAllowed !==
      undefined
  ) {
    result.depositAllowed =
      requiredBoolean(
        record.depositAllowed,
        `${label} deposit setting`,
      );
  }

  if (
    record.depositRateBps !==
      undefined
  ) {
    result.depositRateBps =
      boundedInteger(
        record.depositRateBps,
        1,
        BASIS_POINTS_SCALE - 1,
        `${label} deposit rate`,
      );
  }

  if (
    record.depositMinimumNoticeHours !==
      undefined
  ) {
    result
      .depositMinimumNoticeHours =
      boundedInteger(
        record
          .depositMinimumNoticeHours,
        1,
        MAX_POLICY_HOURS,
        `${label} deposit notice`,
      );
  }

  // Tolerate the obsolete stored field, but never copy it into an override.
  // FEASTA owns the exact T-24 deadline for every resolved policy.

  return result;
}

function parsePreparationOverride(
  value: unknown,
  parentLabel: string,
): Partial<
  ServiceBookingPolicy["preparation"]
> {
  const label =
    `${parentLabel} preparation`;

  const record =
    requireRecord(
      value,
      label,
    );

  assertOnlyFields(
    record,
    new Set([
      "enabled",
      "leadTimeHours",
      "requiresFullPayment",
      "providerStartsManually",
    ]),
    label,
  );

  const result:
    Partial<
      ServiceBookingPolicy["preparation"]
    > = {};

  if (
    record.enabled !== undefined
  ) {
    result.enabled =
      requiredBoolean(
        record.enabled,
        `${label} enabled setting`,
      );
  }

  if (
    record.leadTimeHours !==
      undefined
  ) {
    result.leadTimeHours =
      boundedInteger(
        record.leadTimeHours,
        0,
        MAX_POLICY_HOURS,
        `${label} lead time`,
      );
  }

  if (
    record.requiresFullPayment !==
      undefined
  ) {
    result.requiresFullPayment =
      requiredBoolean(
        record.requiresFullPayment,
        `${label} full-payment requirement`,
      );
  }

  if (
    record.providerStartsManually !==
      undefined
  ) {
    result.providerStartsManually =
      requiredBoolean(
        record.providerStartsManually,
        `${label} provider-start setting`,
      );
  }

  return result;
}

function parseSameDayOverride(
  value: unknown,
  parentLabel: string,
): Partial<
  ServiceBookingPolicy["sameDay"]
> {
  const label =
    `${parentLabel} same-day`;

  const record =
    requireRecord(
      value,
      label,
    );

  assertOnlyFields(
    record,
    new Set([
      "allowed",
      "requiresManualApproval",
    ]),
    label,
  );

  const result:
    Partial<
      ServiceBookingPolicy["sameDay"]
    > = {};

  if (
    record.allowed !== undefined
  ) {
    result.allowed =
      requiredBoolean(
        record.allowed,
        `${label} availability`,
      );
  }

  if (
    record.requiresManualApproval !==
      undefined
  ) {
    result.requiresManualApproval =
      requiredBoolean(
        record
          .requiresManualApproval,
        `${label} manual approval`,
      );
  }

  return result;
}

function parseCancellationOverride(
  value: unknown,
  parentLabel: string,
): Partial<
  ServiceBookingPolicy["cancellation"]
> {
  const label =
    `${parentLabel} cancellation`;

  const record =
    requireRecord(
      value,
      label,
    );

  assertOnlyFields(
    record,
    new Set([
      "beforePreparationRefundRateBps",
      "duringPreparationRefundRateBps",
      "noRefundHoursBeforeEvent",
    ]),
    label,
  );

  const result:
    Partial<
      ServiceBookingPolicy["cancellation"]
    > = {};

  if (
    record
      .beforePreparationRefundRateBps !==
      undefined
  ) {
    result
      .beforePreparationRefundRateBps =
      boundedInteger(
        record
          .beforePreparationRefundRateBps,
        0,
        BASIS_POINTS_SCALE,
        `${label} pre-preparation refund rate`,
      );
  }

  if (
    record
      .duringPreparationRefundRateBps !==
      undefined
  ) {
    result
      .duringPreparationRefundRateBps =
      boundedInteger(
        record
          .duringPreparationRefundRateBps,
        0,
        BASIS_POINTS_SCALE,
        `${label} preparation refund rate`,
      );
  }

  if (
    record.noRefundHoursBeforeEvent !==
      undefined
  ) {
    result
      .noRefundHoursBeforeEvent =
      boundedInteger(
        record
          .noRefundHoursBeforeEvent,
        0,
        MAX_POLICY_HOURS,
        `${label} no-refund window`,
      );
  }

  return result;
}

function parseLifecycleOverride(
  value: unknown,
  parentLabel: string,
): Partial<
  ServiceBookingPolicy["lifecycle"]
> {
  const label =
    `${parentLabel} lifecycle`;

  const record =
    requireRecord(
      value,
      label,
    );

  assertOnlyFields(
    record,
    new Set([
      "autoStartAtScheduledTime",
      "providerConfirmsCompletion",
    ]),
    label,
  );

  const result:
    Partial<
      ServiceBookingPolicy["lifecycle"]
    > = {};

  if (
    record.autoStartAtScheduledTime !==
      undefined
  ) {
    result.autoStartAtScheduledTime =
      requiredBoolean(
        record
          .autoStartAtScheduledTime,
        `${label} automatic-start setting`,
      );
  }

  if (
    record.providerConfirmsCompletion !==
      undefined
  ) {
    result.providerConfirmsCompletion =
      requiredBoolean(
        record
          .providerConfirmsCompletion,
        `${label} completion setting`,
      );
  }

  return result;
}

function validatePolicy(
  policy:
    ServiceBookingPolicy,
): void {
  if (!policy.payment.onlineOnly) {
    throw invalidPolicy(
      "FEASTA payment policy must remain online-only.",
    );
  }

  boundedInteger(
    policy.payment.depositRateBps,
    1,
    BASIS_POINTS_SCALE - 1,
    "Deposit rate",
  );

  boundedInteger(
    policy.payment
      .depositMinimumNoticeHours,
    1,
    MAX_POLICY_HOURS,
    "Deposit minimum notice",
  );

  boundedInteger(
    policy.payment
      .balanceDueHoursBeforeEvent,
    0,
    MAX_POLICY_HOURS,
    "Remaining-balance deadline",
  );

  if (
    policy.payment.depositAllowed &&
    policy.payment
      .balanceDueHoursBeforeEvent >=
      policy.payment
        .depositMinimumNoticeHours
  ) {
    throw invalidPolicy(
      "The remaining-balance deadline must occur after the minimum notice required for a deposit booking.",
    );
  }

  boundedInteger(
    policy.preparation.leadTimeHours,
    0,
    MAX_POLICY_HOURS,
    "Preparation lead time",
  );

  boundedInteger(
    policy.cancellation
      .beforePreparationRefundRateBps,
    0,
    BASIS_POINTS_SCALE,
    "Pre-preparation refund rate",
  );

  boundedInteger(
    policy.cancellation
      .duringPreparationRefundRateBps,
    0,
    BASIS_POINTS_SCALE,
    "Preparation refund rate",
  );

  if (
    policy.cancellation
      .duringPreparationRefundRateBps >
    policy.cancellation
      .beforePreparationRefundRateBps
  ) {
    throw invalidPolicy(
      "Preparation cannot increase the Customer refund percentage.",
    );
  }

  boundedInteger(
    policy.cancellation
      .noRefundHoursBeforeEvent,
    0,
    MAX_POLICY_HOURS,
    "No-refund event window",
  );
}

function requireRecord(
  value: unknown,
  label: string,
): UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidPolicy(
      `${label} is invalid.`,
    );
  }

  return value as UnknownRecord;
}

function assertOnlyFields(
  record:
    Readonly<UnknownRecord>,

  allowed:
    ReadonlySet<string>,

  label: string,
): void {
  const invalidField =
    Object.keys(record).find(
      (field) =>
        !allowed.has(field),
    );

  if (invalidField) {
    throw invalidPolicy(
      `${label} contains an unsupported field.`,
    );
  }
}

function requiredBoolean(
  value: unknown,
  label: string,
): boolean {
  if (typeof value !== "boolean") {
    throw invalidPolicy(
      `${label} is invalid.`,
    );
  }

  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw invalidPolicy(
      `${label} is invalid.`,
    );
  }

  return value as number;
}

function policyVersion(
  value: unknown,
  fallback: number,
  label: string,
): number {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return boundedInteger(
    value,
    1,
    Number.MAX_SAFE_INTEGER,
    label,
  );
}

function requireServiceCategoryCode(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !SAFE_SERVICE_CATEGORY_CODE
      .test(value)
  ) {
    throw invalidPolicy(
      "Service category is invalid.",
    );
  }

  return value;
}

function optionalSourceId(
  value: unknown,
  label: string,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !SAFE_SOURCE_ID.test(value)
  ) {
    throw invalidPolicy(
      `${label} identifier is invalid.`,
    );
  }

  return value;
}

function invalidPolicy(
  message: string,
): HttpsError {
  return new HttpsError(
    "failed-precondition",
    message,
    {
      reason:
        "service_booking_policy_invalid",
    },
  );
}
