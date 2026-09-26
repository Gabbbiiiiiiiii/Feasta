import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";

/*
 * Keep these values aligned with the shared
 * TaxRegistrationStatus contract used by web.
 *
 * TIN presence, provider registration type,
 * and business-verification status never infer
 * one of these values automatically.
 */
export const PROVIDER_TAX_TYPES = [
  "non_vat",
  "vat_registered",
] as const;

export type ProviderTaxType =
  (typeof PROVIDER_TAX_TYPES)[number];

export const PROVIDER_TAX_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;

export type ProviderTaxVerificationStatus =
  (typeof PROVIDER_TAX_VERIFICATION_STATUSES)[number];

export const PROVIDER_TAX_REVIEW_ACTIONS = [
  "verify",
  "reject",
] as const;

export type ProviderTaxReviewAction =
  (typeof PROVIDER_TAX_REVIEW_ACTIONS)[number];

export type ValidatedProviderTaxProfileSubmission = {
  birRegisteredName: string;
  tin: string;
  taxType: ProviderTaxType;
};

export type ValidatedProviderTaxProfileReview = {
  providerId: string;
  action: ProviderTaxReviewAction;
  reason: string;
};

export function validateProviderTaxProfileSubmission(
  value: unknown,
): ValidatedProviderTaxProfileSubmission {
  const input =
    requireObject(value);

  rejectUnknownFields(
    input,
    [
      "birRegisteredName",
      "tin",
      "taxType",
    ],
  );

  return {
    birRegisteredName:
      requireString(
        input.birRegisteredName,
        "birRegisteredName",
        {
          minLength: 2,
          maxLength: 160,
        },
      ),

    tin:
      normalizeProviderTin(
        input.tin,
      ),

    taxType:
      requireEnum(
        input.taxType,
        "taxType",
        PROVIDER_TAX_TYPES,
      ),
  };
}

export function validateProviderTaxProfileReview(
  value: unknown,
): ValidatedProviderTaxProfileReview {
  const input =
    requireObject(value);

  rejectUnknownFields(
    input,
    [
      "providerId",
      "action",
      "reason",
    ],
  );

  const providerId =
    requireString(
      input.providerId,
      "providerId",
      {
        minLength: 1,
        maxLength: 160,
      },
    );

  if (
    !/^[A-Za-z0-9_-]+$/u.test(
      providerId,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "providerId is invalid.",
    );
  }

  const action =
    requireEnum(
      input.action,
      "action",
      PROVIDER_TAX_REVIEW_ACTIONS,
    );

  const reason =
    typeof input.reason ===
      "string"
      ? input.reason.trim()
      : "";

  if (
    action === "reject" &&
    reason.length < 10
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Provide a rejection reason with at least 10 characters.",
    );
  }

  if (reason.length > 1000) {
    throw new HttpsError(
      "invalid-argument",
      "The review reason must not exceed 1000 characters.",
    );
  }

  return {
    providerId,
    action,
    reason,
  };
}

export function normalizeProviderTin(
  value: unknown,
): string {
  const source =
    requireString(
      value,
      "tin",
      {
        minLength: 9,
        maxLength: 24,
      },
    );

  if (
    !/^[0-9\s-]+$/u.test(
      source,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "TIN may contain only digits, spaces, and hyphens.",
    );
  }

  const digits =
    source.replace(
      /\D/gu,
      "",
    );

  /*
   * This is input-format validation only.
   * Administrative verification remains
   * authoritative for the tax identity.
   */
  if (
    digits.length < 9 ||
    digits.length > 15
  ) {
    throw new HttpsError(
      "invalid-argument",
      "TIN must contain between 9 and 15 digits.",
    );
  }

  return digits;
}

export function parseProviderTaxVerificationStatus(
  value: unknown,
): ProviderTaxVerificationStatus | null {
  return (
    PROVIDER_TAX_VERIFICATION_STATUSES as
      readonly unknown[]
  ).includes(value)
    ? value as ProviderTaxVerificationStatus
    : null;
}

function rejectUnknownFields(
  input: Readonly<
    Record<string, unknown>
  >,
  allowedFields:
    readonly string[],
): void {
  const allowed =
    new Set(allowedFields);

  const unknown =
    Object.keys(input).filter(
      (field) =>
        !allowed.has(field),
    );

  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported tax-profile fields: ${unknown.join(", ")}.`,
    );
  }
}
