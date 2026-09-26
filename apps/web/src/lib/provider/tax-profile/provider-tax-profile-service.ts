import "server-only";

import {
  parseTaxRegistrationStatus,
} from "@feasta/shared-types";

import {
  requireProviderCatalogAccess,
} from "@/lib/auth/session";
import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  ProviderTaxProfile,
  ProviderTaxProfileVerificationStatus,
} from "./provider-tax-profile-types";

export async function getProviderTaxProfile():
Promise<ProviderTaxProfile> {
  const account =
    await requireProviderCatalogAccess();

  const providerId =
    requireDocumentId(
      account.providerId,
    );

  const [
    providerSnapshot,
    taxProfileSnapshot,
  ] =
    await Promise.all([
      adminDb
        .collection("providers")
        .doc(providerId)
        .get(),

      adminDb
        .collection(
          "providerTaxProfiles",
        )
        .doc(providerId)
        .get(),
    ]);

  const provider =
    providerSnapshot.data() ?? {};

  if (
    !providerSnapshot.exists ||
    provider.ownerId !==
      account.uid ||
    provider.isDeleted === true
  ) {
    throw new Error(
      "The provider tax profile is unavailable.",
    );
  }

  const data =
    taxProfileSnapshot.exists
      ? taxProfileSnapshot.data() ?? {}
      : {};

  const verificationStatus =
    parseVerificationStatus(
      data.verificationStatus,
    );

  if (
    taxProfileSnapshot.exists &&
    !verificationStatus
  ) {
    throw new Error(
      "The provider tax profile has an invalid verification state.",
    );
  }

  const storedProviderId =
    taxProfileSnapshot.exists
      ? requireDocumentId(
          data.providerId,
        )
      : providerId;

  const storedOwnerId =
    taxProfileSnapshot.exists &&
    typeof data.ownerId ===
      "string"
      ? data.ownerId
      : account.uid;

  if (
    storedProviderId !==
      providerId ||
    storedOwnerId !==
      account.uid
  ) {
    throw new Error(
      "The provider tax profile ownership is invalid.",
    );
  }

  const businessName =
    requiredStoredText(
      provider.businessName,
      "Provider business name",
      2,
      160,
    );

  return {
    providerId,

    birRegisteredName:
      taxProfileSnapshot.exists
        ? requiredStoredText(
            data.birRegisteredName,
            "BIR registered name",
            2,
            160,
          )
        : businessName,

    tin:
      taxProfileSnapshot.exists
        ? requiredStoredTin(
            data.tin,
          )
        : "",

    taxType:
      taxProfileSnapshot.exists
        ? parseTaxRegistrationStatus(
            data.taxType,
          )
        : null,

    verificationStatus,

    submittedAt:
      timestampToIso(
        data.submittedAt,
      ),

    verifiedAt:
      timestampToIso(
        data.verifiedAt,
      ),

    rejectedAt:
      timestampToIso(
        data.rejectedAt,
      ),

    rejectionReason:
      optionalStoredText(
        data.rejectionReason,
        1000,
      ),

    updatedAt:
      timestampToIso(
        data.updatedAt,
      ),
  };
}

function parseVerificationStatus(
  value: unknown,
):
ProviderTaxProfileVerificationStatus | null {
  return (
    value === "pending" ||
    value === "verified" ||
    value === "rejected"
  )
    ? value
    : null;
}

function requiredStoredText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `${label} is unavailable.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length <
      minimum ||
    normalized.length >
      maximum
  ) {
    throw new Error(
      `${label} is unavailable.`,
    );
  }

  return normalized;
}

function optionalStoredText(
  value: unknown,
  maximum: number,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized.length > 0 &&
    normalized.length <= maximum
    ? normalized
    : null;
}

function requiredStoredTin(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{9,15}$/u.test(value)
  ) {
    throw new Error(
      "The provider TIN is unavailable.",
    );
  }

  return value;
}

function requireDocumentId(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      "The provider tax profile is unavailable.",
    );
  }

  const normalized =
    value.trim();

  if (
    !/^[A-Za-z0-9_-]{1,160}$/u
      .test(normalized)
  ) {
    throw new Error(
      "The provider tax profile is unavailable.",
    );
  }

  return normalized;
}

function timestampToIso(
  value: unknown,
): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate === "function"
  ) {
    const date =
      (
        value as {
          toDate:
            () => Date;
        }
      ).toDate();

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime(),
    )
      ? null
      : value.toISOString();
  }

  return null;
}
