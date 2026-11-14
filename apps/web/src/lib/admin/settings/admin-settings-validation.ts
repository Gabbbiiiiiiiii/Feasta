import {
  BASIS_POINTS_SCALE,
  parseTaxRegistrationStatus,
} from "@feasta/shared-types";

import type {
  UpdateAdminCancellationRolloutInput,
  UpdateAdminFinancialPolicyInput,
  UpdateAdminPlatformSettingsInput,
} from "@/lib/admin/settings/admin-settings-types";

const allowedPlatformInputKeys =
  new Set([
    "platformName",
    "operatingCity",
    "supportEmail",
    "serviceAreaDescription",
    "internalReason",
  ]);

const allowedFinancialInputKeys =
  new Set([
    "platformCommissionRateBps",
    "platformTaxStatus",
    "platformVatRateBps",
    "minimumDepositRateBps",
    "maximumDepositRateBps",
    "minimumBalanceDueDaysBeforeEvent",
    "maximumBalanceDueDaysBeforeEvent",
    "internalReason",
  ]);

const allowedCancellationRolloutInputKeys =
  new Set([
    "bookingRefundPolicyCaptureMode",
    "customerCancellationMode",
    "automaticPolicyRefundApprovalMode",
    "internalReason",
  ]);

const emailPattern =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateAdminPlatformSettingsUpdate(
  value: unknown,
): UpdateAdminPlatformSettingsInput {
  const input =
    requiredObject(
      value,
      "Platform settings are required.",
    );

  rejectUnknownFields(
    input,
    allowedPlatformInputKeys,
  );

  const platformName =
    requiredText(
      input.platformName,
      "Platform name",
      2,
      80,
    );

  const operatingCity =
    requiredText(
      input.operatingCity,
      "Operating city",
      2,
      120,
    );

  const supportEmail =
    requiredText(
      input.supportEmail,
      "Support email",
      5,
      254,
    ).toLowerCase();

  if (
    !emailPattern.test(
      supportEmail,
    )
  ) {
    throw new Error(
      "Enter a valid support email address.",
    );
  }

  const serviceAreaDescription =
    requiredText(
      input.serviceAreaDescription,
      "Service-area description",
      10,
      500,
    );

  const internalReason =
    requiredText(
      input.internalReason,
      "Internal administrative reason",
      10,
      1000,
    );

  return {
    platformName,
    operatingCity,
    supportEmail,
    serviceAreaDescription,
    internalReason,
  };
}

export function validateAdminFinancialPolicyUpdate(
  value: unknown,
): UpdateAdminFinancialPolicyInput {
  const input =
    requiredObject(
      value,
      "Financial policy is required.",
    );

  rejectUnknownFields(
    input,
    allowedFinancialInputKeys,
  );

  const platformCommissionRateBps =
    requiredBasisPointRate(
      input.platformCommissionRateBps,
      "Platform commission rate",
    );

  const platformTaxStatus =
    parseTaxRegistrationStatus(
      input.platformTaxStatus,
    );

  if (!platformTaxStatus) {
    throw new Error(
      "Choose a valid FEASTA tax status.",
    );
  }

  const platformVatRateBps =
    requiredBasisPointRate(
      input.platformVatRateBps,
      "Platform VAT rate",
    );

  if (
    platformTaxStatus ===
      "vat_registered" &&
    platformVatRateBps === 0
  ) {
    throw new Error(
      "VAT rate must be greater than 0 when VAT Registered simulation is enabled.",
    );
  }

  const minimumDepositRateBps =
    requiredDepositPolicyRate(
      input.minimumDepositRateBps,
      "Minimum deposit rate",
    );

  const maximumDepositRateBps =
    requiredDepositPolicyRate(
      input.maximumDepositRateBps,
      "Maximum deposit rate",
    );

  if (
    minimumDepositRateBps >
    maximumDepositRateBps
  ) {
    throw new Error(
      "Minimum deposit rate cannot exceed the maximum deposit rate.",
    );
  }

  const minimumBalanceDueDaysBeforeEvent =
    requiredBalancePolicyDays(
      input.minimumBalanceDueDaysBeforeEvent,
      "Minimum balance deadline",
    );

  const maximumBalanceDueDaysBeforeEvent =
    requiredBalancePolicyDays(
      input.maximumBalanceDueDaysBeforeEvent,
      "Maximum balance deadline",
    );

  if (
    minimumBalanceDueDaysBeforeEvent >
    maximumBalanceDueDaysBeforeEvent
  ) {
    throw new Error(
      "Minimum balance deadline cannot exceed the maximum balance deadline.",
    );
  }

  const internalReason =
    requiredText(
      input.internalReason,
      "Internal administrative reason",
      10,
      1000,
    );

  return {
    platformCommissionRateBps,
    platformTaxStatus,
    platformVatRateBps,

    minimumDepositRateBps,
    maximumDepositRateBps,

    minimumBalanceDueDaysBeforeEvent,
    maximumBalanceDueDaysBeforeEvent,

    internalReason,
  };
}

export function validateAdminCancellationRolloutUpdate(
  value: unknown,
): UpdateAdminCancellationRolloutInput {
  const input =
    requiredObject(
      value,
      "Cancellation rollout settings are required.",
    );

  rejectUnknownFields(
    input,
    allowedCancellationRolloutInputKeys,
  );

  const bookingRefundPolicyCaptureMode = input.bookingRefundPolicyCaptureMode;
  if (bookingRefundPolicyCaptureMode !== "off" && bookingRefundPolicyCaptureMode !== "required") {
    throw new Error("Choose a valid booking refund-policy capture mode.");
  }

  const customerCancellationMode =
    input.customerCancellationMode;

  if (
    customerCancellationMode !== "off" &&
    customerCancellationMode !== "review_only" &&
    customerCancellationMode !== "enabled"
  ) {
    throw new Error(
      "Choose a valid customer cancellation mode.",
    );
  }

  const automaticPolicyRefundApprovalMode =
    input.automaticPolicyRefundApprovalMode;

  if (
    automaticPolicyRefundApprovalMode !== "off" &&
    automaticPolicyRefundApprovalMode !== "enabled"
  ) {
    throw new Error(
      "Choose a valid automatic cancellation mode.",
    );
  }

  if (
    automaticPolicyRefundApprovalMode === "enabled" &&
    customerCancellationMode !== "enabled"
  ) {
    throw new Error(
      "Automatic policy refund approval requires customer cancellation to be fully enabled.",
    );
  }

  if (bookingRefundPolicyCaptureMode !== "required" &&
    (customerCancellationMode !== "off" || automaticPolicyRefundApprovalMode !== "off")) {
    throw new Error("Booking refund-policy capture must be Required before customer cancellation or automatic policy refund approval can be enabled.");
  }

  const internalReason =
    requiredText(
      input.internalReason,
      "Internal administrative reason",
      10,
      1000,
    );

  return {
    bookingRefundPolicyCaptureMode,
    customerCancellationMode,
    automaticPolicyRefundApprovalMode,
    internalReason,
  };
}

function requiredObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(message);
  }

  return value as Record<
    string,
    unknown
  >;
}

function rejectUnknownFields(
  input: Readonly<
    Record<string, unknown>
  >,
  allowed: ReadonlySet<string>,
) {
  for (
    const key of
    Object.keys(input)
  ) {
    if (!allowed.has(key)) {
      throw new Error(
        `The platform setting "${key}" cannot be modified.`,
      );
    }
  }
}

function requiredBasisPointRate(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) >
      BASIS_POINTS_SCALE
  ) {
    throw new Error(
      `${label} must be between 0 and 100%.`,
    );
  }

  return value as number;
}

function requiredText(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
) {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `${label} is required.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length <
    minimumLength
  ) {
    throw new Error(
      `${label} must contain at least ${minimumLength} characters.`,
    );
  }

  if (
    normalized.length >
    maximumLength
  ) {
    throw new Error(
      `${label} must not exceed ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function requiredDepositPolicyRate(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0 ||
    (value as number) >=
      BASIS_POINTS_SCALE
  ) {
    throw new Error(
      `${label} must be greater than 0% and below 100%.`,
    );
  }

  return value as number;
}

function requiredBalancePolicyDays(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 365
  ) {
    throw new Error(
      `${label} must be a whole number between 1 and 365 days.`,
    );
  }

  return value as number;
}
