import {
  HttpsError,
} from "firebase-functions/v2/https";

const BASIS_POINTS_SCALE =
  10_000;

const MIN_DEPOSIT_RATE_BPS =
  2_000;

const MAX_DEPOSIT_RATE_BPS =
  8_000;

const MIN_BALANCE_DUE_DAYS =
  1;

const MAX_BALANCE_DUE_DAYS =
  30;

export const PACKAGE_PAYMENT_POLICIES = [
  "full_payment",
  "deposit_then_balance",
] as const;

export type PackagePaymentPolicy =
  (typeof PACKAGE_PAYMENT_POLICIES)[number];

export type PackagePaymentTermsSnapshot = {
  schemaVersion: 1;

  source:
    | "canonical_package"
    | "legacy_package";

  paymentPolicy:
    PackagePaymentPolicy | null;

  depositRateBps: number;

  balanceDueDaysBeforeEvent:
    number | null;

  usesLegacyPaymentTerms:
    boolean;
};

export function buildPackagePaymentTermsSnapshot(
  packageData:
    Readonly<
      Record<string, unknown>
    >,
): PackagePaymentTermsSnapshot {
  const paymentPolicy =
    packagePaymentPolicy(
      packageData.paymentPolicy,
    );

  if (paymentPolicy) {
    const depositRateBps =
      percentageToBasisPoints(
        packageData.depositPercentage,
        "Package deposit percentage",
      );

    const compatibilityRateBps =
      percentageToBasisPoints(
        packageData
          .downPaymentPercentage,
        "Package down-payment percentage",
      );

    if (
      depositRateBps !==
        compatibilityRateBps
    ) {
      throw invalidTerms();
    }

    if (
      paymentPolicy ===
        "full_payment"
    ) {
      if (
        depositRateBps !==
          BASIS_POINTS_SCALE ||
        (
          packageData
            .balanceDueDaysBeforeEvent !==
            null &&
          packageData
            .balanceDueDaysBeforeEvent !==
            undefined
        )
      ) {
        throw invalidTerms();
      }

      return {
        schemaVersion: 1,

        source:
          "canonical_package",

        paymentPolicy,

        depositRateBps,

        balanceDueDaysBeforeEvent:
          null,

        usesLegacyPaymentTerms:
          false,
      };
    }

    if (
      depositRateBps <
        MIN_DEPOSIT_RATE_BPS ||
      depositRateBps >
        MAX_DEPOSIT_RATE_BPS
    ) {
      throw invalidTerms();
    }

    const balanceDueDaysBeforeEvent =
      requiredInteger(
        packageData
          .balanceDueDaysBeforeEvent,
        MIN_BALANCE_DUE_DAYS,
        MAX_BALANCE_DUE_DAYS,
      );

    return {
      schemaVersion: 1,

      source:
        "canonical_package",

      paymentPolicy,

      depositRateBps,

      balanceDueDaysBeforeEvent,

      usesLegacyPaymentTerms:
        false,
    };
  }

  if (
    packageData.paymentPolicy !==
      null &&
    packageData.paymentPolicy !==
      undefined
  ) {
    throw invalidTerms();
  }

  const legacyRateBps =
    percentageToBasisPoints(
      packageData
        .downPaymentPercentage,
      "Package down-payment percentage",
    );

  return {
    schemaVersion: 1,

    source:
      "legacy_package",

    paymentPolicy: null,

    depositRateBps:
      legacyRateBps,

    balanceDueDaysBeforeEvent:
      null,

    usesLegacyPaymentTerms:
      true,
  };
}

export function parsePackagePaymentTermsSnapshot(
  value: unknown,
): PackagePaymentTermsSnapshot | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidSnapshot();
  }

  const data =
    value as
      Record<string, unknown>;

  if (
    data.schemaVersion !== 1
  ) {
    throw invalidSnapshot();
  }

  const source =
    data.source ===
      "canonical_package" ||
    data.source ===
      "legacy_package"
      ? data.source
      : null;

  if (!source) {
    throw invalidSnapshot();
  }

  const depositRateBps =
    basisPointRate(
      data.depositRateBps,
    );

  if (
    depositRateBps === null
  ) {
    throw invalidSnapshot();
  }

  if (
    source ===
      "legacy_package"
  ) {
    if (
      data.paymentPolicy !==
        null ||
      data
        .balanceDueDaysBeforeEvent !==
        null ||
      data
        .usesLegacyPaymentTerms !==
        true
    ) {
      throw invalidSnapshot();
    }

    return {
      schemaVersion: 1,

      source,

      paymentPolicy: null,

      depositRateBps,

      balanceDueDaysBeforeEvent:
        null,

      usesLegacyPaymentTerms:
        true,
    };
  }

  const paymentPolicy =
    packagePaymentPolicy(
      data.paymentPolicy,
    );

  if (
    !paymentPolicy ||
    data
      .usesLegacyPaymentTerms !==
      false
  ) {
    throw invalidSnapshot();
  }

  if (
    paymentPolicy ===
      "full_payment"
  ) {
    if (
      depositRateBps !==
        BASIS_POINTS_SCALE ||
      data
        .balanceDueDaysBeforeEvent !==
        null
    ) {
      throw invalidSnapshot();
    }

    return {
      schemaVersion: 1,

      source,

      paymentPolicy,

      depositRateBps,

      balanceDueDaysBeforeEvent:
        null,

      usesLegacyPaymentTerms:
        false,
    };
  }

  if (
    depositRateBps <
      MIN_DEPOSIT_RATE_BPS ||
    depositRateBps >
      MAX_DEPOSIT_RATE_BPS
  ) {
    throw invalidSnapshot();
  }

  const balanceDueDaysBeforeEvent =
    requiredInteger(
      data
        .balanceDueDaysBeforeEvent,
      MIN_BALANCE_DUE_DAYS,
      MAX_BALANCE_DUE_DAYS,
    );

  return {
    schemaVersion: 1,

    source,

    paymentPolicy,

    depositRateBps,

    balanceDueDaysBeforeEvent,

    usesLegacyPaymentTerms:
      false,
  };
}

function packagePaymentPolicy(
  value: unknown,
): PackagePaymentPolicy | null {
  return (
    PACKAGE_PAYMENT_POLICIES as
      readonly unknown[]
  ).includes(value)
    ? value as PackagePaymentPolicy
    : null;
}

function percentageToBasisPoints(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
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
    result >
      BASIS_POINTS_SCALE
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
): number | null {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <=
      BASIS_POINTS_SCALE
  )
    ? value as number
    : null;
}

function requiredInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <
      minimum ||
    (value as number) >
      maximum
  ) {
    throw invalidTerms();
  }

  return value as number;
}

function invalidTerms(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The package payment terms are invalid.",
  );
}

function invalidSnapshot(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The package payment-terms snapshot is invalid.",
  );
}
