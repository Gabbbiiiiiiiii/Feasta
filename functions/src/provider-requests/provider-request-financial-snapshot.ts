import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  parsePackagePaymentTermsSnapshot,
  type PackagePaymentTermsSnapshot,
} from "../payments/package-payment-terms.js";

const BASIS_POINTS_SCALE =
  10_000;

const DEFAULT_PLATFORM_COMMISSION_RATE_BPS =
  1_000;

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

  grossAmountInCentavos: number;

  requiredUpfrontAmountInCentavos:
    number;

  remainingBalanceInCentavos:
    number;

  requiredUpfrontRateBps:
    number;

  platformCommissionRateBps:
    number;

  platformTaxStatus:
    PlatformTaxStatus;

  platformVatRateBps:
    number;

  financialPolicyVersion:
    number;

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

  const platformCommissionRateBps =
    basisPointRate(
      platformSettings
        .platformCommissionRateBps,
      DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
    );

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

    grossAmountInCentavos,

    requiredUpfrontAmountInCentavos,

    remainingBalanceInCentavos,

    requiredUpfrontRateBps,

    platformCommissionRateBps,

    platformTaxStatus,

    platformVatRateBps,

    financialPolicyVersion,

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
