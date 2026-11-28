import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  parsePackagePaymentTermsSnapshot,
  type PackagePaymentTermsSnapshot,
} from "../payments/package-payment-terms.js";

import {
  DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
  PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1,
  PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1,
  PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1,
  computeTieredCappedCommissionInCentavos,
  isCustomerPaidCommissionModel,
  parsePlatformCommissionModel,
  type PaymentSettlementRoutingMode,
  type PlatformCommissionModel,
} from "../payments/platform-commission-policy.js";

import {
  PROVIDER_DISBURSEMENT_POLICY_VERSION,
} from "../provider-finance/provider-disbursement-policy.js";

const BASIS_POINTS_SCALE =
  10_000;

const DEFAULT_PLATFORM_VAT_RATE_BPS =
  1_200;

type PlatformTaxStatus =
  | "non_vat"
  | "vat_registered";

type ProviderTaxVerificationStatus =
  | "pending"
  | "verified"
  | "rejected";

type ProviderRequestFinancialSnapshot = {
  schemaVersion: 1;
  currency: "PHP";

  packagePaymentTerms:
    PackagePaymentTermsSnapshot | null;

  serviceSubtotalInCentavos?: number;

  grossAmountInCentavos: number;

  requiredUpfrontAmountInCentavos:
    number;

  remainingBalanceInCentavos:
    number;

  requiredUpfrontRateBps:
    number;

  platformCommissionRateBps:
    number;

  platformCommissionModel:
    PlatformCommissionModel;

  settlementRoutingMode?:
    PaymentSettlementRoutingMode;

  platformCommissionTotalInCentavos:
    number;

  platformTaxStatus:
    PlatformTaxStatus;

  platformVatRateBps:
    number;

  financialPolicyVersion:
    number;

  providerDisbursementPolicyVersion:
    1;

  providerTaxType:
    PlatformTaxStatus | null;

  providerTaxVerificationStatus:
    ProviderTaxVerificationStatus | null;
};

export function buildProviderRequestFinancialSnapshot(
  input: {
    providerId: string;
    providerOwnerId: string;

    providerRequest:
      Readonly<
        Record<string, unknown>
      >;

    platformSettings:
      Readonly<
        Record<string, unknown>
      > | null;

    providerTaxProfile:
      Readonly<
        Record<string, unknown>
      > | null;
  },
): ProviderRequestFinancialSnapshot {
  const packagePaymentTerms =
    parsePackagePaymentTermsSnapshot(
      input.providerRequest
        .packagePaymentTerms,
    );

  const grossAmountInCentavos =
    moneyInCentavos(
      input.providerRequest.amount,
      "Provider-request amount",
      false,
    );

  const requiredUpfrontAmountInCentavos =
    moneyInCentavos(
      input.providerRequest
        .downPaymentAmount,
      "Provider-request required upfront amount",
      true,
    );

  const remainingBalanceInCentavos =
    moneyInCentavos(
      input.providerRequest
        .remainingBalance,
      "Provider-request remaining balance",
      true,
    );

  if (
    requiredUpfrontAmountInCentavos >
      grossAmountInCentavos ||
    remainingBalanceInCentavos >
      grossAmountInCentavos ||
    requiredUpfrontAmountInCentavos +
      remainingBalanceInCentavos !==
      grossAmountInCentavos
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider-request financial amounts are inconsistent.",
    );
  }

  const requiredUpfrontRateBps =
    Math.round(
      (
        requiredUpfrontAmountInCentavos /
        grossAmountInCentavos
      ) *
        BASIS_POINTS_SCALE,
    );

  const platformSettings =
    input.platformSettings ?? {};

  const requestCommissionModel =
    parsePlatformCommissionModel(
      input.providerRequest.platformCommissionModel,
    );

  let platformCommissionModel: PlatformCommissionModel;
  let settlementRoutingMode: PaymentSettlementRoutingMode | undefined;
  let platformCommissionRateBps: number;
  let platformCommissionTotalInCentavos: number;
  let serviceSubtotalInCentavos: number | undefined;

  if (isCustomerPaidCommissionModel(requestCommissionModel)) {
    const subtotal = input.providerRequest.serviceSubtotalInCentavos;
    const fee = input.providerRequest.platformFeeInCentavos;
    const frozenRateBps = input.providerRequest.platformCommissionRateBps;

    if (
      typeof subtotal !== "number" ||
      !Number.isSafeInteger(subtotal) ||
      subtotal <= 0 ||
      typeof fee !== "number" ||
      !Number.isSafeInteger(fee) ||
      fee < 0 ||
      subtotal + fee !== grossAmountInCentavos ||
      typeof frozenRateBps !== "number" ||
      !Number.isSafeInteger(frozenRateBps) ||
      frozenRateBps <= 0 ||
      frozenRateBps > BASIS_POINTS_SCALE
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The provider-request customer-paid fee breakdown is invalid.",
      );
    }

    platformCommissionModel =
      PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1;
    settlementRoutingMode =
      PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1;
    platformCommissionRateBps = frozenRateBps;
    platformCommissionTotalInCentavos = fee;
    serviceSubtotalInCentavos = subtotal;
  } else {
    /*
     * Legacy provider-deducted requests submitted before
     * customer_paid_flat_v1 do not carry a submission-time fee
     * breakdown. Preserve their agreed gross total without adding
     * an unexpected customer surcharge on acceptance.
     */
    platformCommissionModel =
      PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1;

    const configuredCommissionRateBps =
      basisPointRate(
        platformSettings
          .platformCommissionRateBps,
        DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
      );

    platformCommissionRateBps =
      configuredCommissionRateBps > 0 &&
      configuredCommissionRateBps <=
        BASIS_POINTS_SCALE
        ? configuredCommissionRateBps
        : DEFAULT_PLATFORM_COMMISSION_RATE_BPS;

    platformCommissionTotalInCentavos =
      computeTieredCappedCommissionInCentavos(
        grossAmountInCentavos,
        platformCommissionRateBps,
      );
  }

  const platformTaxStatus =
    taxStatus(
      platformSettings
        .platformTaxStatus,
    ) ??
    "non_vat";

  const platformVatRateBps =
    basisPointRate(
      platformSettings
        .platformVatRateBps,
      DEFAULT_PLATFORM_VAT_RATE_BPS,
    );

  const financialPolicyVersion =
    positiveInteger(
      platformSettings
        .financialPolicyVersion,
      1,
    );

  const providerTax =
    providerTaxSnapshot({
      providerId:
        input.providerId,

      providerOwnerId:
        input.providerOwnerId,

      profile:
        input.providerTaxProfile,
    });

  return {
    schemaVersion: 1,
    currency: "PHP",

    packagePaymentTerms,

    ...(serviceSubtotalInCentavos !== undefined
      ? {serviceSubtotalInCentavos}
      : {}),

    grossAmountInCentavos,

    requiredUpfrontAmountInCentavos,

    remainingBalanceInCentavos,

    requiredUpfrontRateBps,

    platformCommissionRateBps,

    platformCommissionModel,

    ...(settlementRoutingMode !== undefined
      ? {settlementRoutingMode}
      : {}),

    platformCommissionTotalInCentavos,

    platformTaxStatus,

    platformVatRateBps,

    financialPolicyVersion,

    providerDisbursementPolicyVersion:
      PROVIDER_DISBURSEMENT_POLICY_VERSION,

    providerTaxType:
      providerTax.taxType,

    providerTaxVerificationStatus:
      providerTax.verificationStatus,
  };
}

function providerTaxSnapshot(
  input: {
    providerId: string;

    providerOwnerId: string;

    profile:
      Readonly<
        Record<string, unknown>
      > | null;
  },
): {
  taxType:
    PlatformTaxStatus | null;

  verificationStatus:
    ProviderTaxVerificationStatus | null;
} {
  if (!input.profile) {
    return {
      taxType: null,

      verificationStatus: null,
    };
  }

  const storedProviderId =
    stringValue(
      input.profile.providerId,
    );

  const storedOwnerId =
    stringValue(
      input.profile.ownerId,
    );

  if (
    storedProviderId !==
      input.providerId ||
    storedOwnerId !==
      input.providerOwnerId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider tax-profile linkage is invalid.",
    );
  }

  const verificationStatus =
    providerTaxVerificationStatus(
      input.profile
        .verificationStatus,
    );

  if (!verificationStatus) {
    throw new HttpsError(
      "failed-precondition",
      "The provider tax-profile verification state is invalid.",
    );
  }

  const storedTaxType =
    taxStatus(
      input.profile.taxType,
    );

  if (!storedTaxType) {
    throw new HttpsError(
      "failed-precondition",
      "The provider tax classification is invalid.",
    );
  }

  return {
    /*
     * A provider declaration only becomes
     * authoritative after separate Admin
     * tax-profile verification.
     */
    taxType:
      verificationStatus ===
        "verified"
        ? storedTaxType
        : null,

    verificationStatus,
  };
}

function moneyInCentavos(
  value: unknown,
  label: string,
  allowZero: boolean,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (
      !allowZero &&
      value === 0
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  const result =
    Math.round(
      value * 100,
    );

  if (
    !Number.isSafeInteger(
      result,
    ) ||
    result < 0 ||
    (
      !allowZero &&
      result === 0
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return result;
}

function basisPointRate(
  value: unknown,
  fallback: number,
): number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <=
      BASIS_POINTS_SCALE
  )
    ? value as number
    : fallback;
}

function positiveInteger(
  value: unknown,
  fallback: number,
): number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 1
  )
    ? value as number
    : fallback;
}

function taxStatus(
  value: unknown,
): PlatformTaxStatus | null {
  return value === "non_vat" ||
    value === "vat_registered"
    ? value
    : null;
}

function providerTaxVerificationStatus(
  value: unknown,
):
ProviderTaxVerificationStatus | null {
  return value === "pending" ||
    value === "verified" ||
    value === "rejected"
    ? value
    : null;
}

function stringValue(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

export type {
  ProviderRequestFinancialSnapshot,
};
