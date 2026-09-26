import "server-only";

import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  PROVIDER_REQUEST_STATUSES,
  PROVIDER_REQUEST_TYPES,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "@feasta/shared-types";

import {
  requireApprovedProvider,
} from "@/lib/auth/session";
import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  ProviderRequestListItem,
  ProviderRequestListResult,
  ProviderRequestService,
  ProviderRequestSummary,
} from "./provider-request-types";

const COLLECTIONS = {
  providerRequests: "providerRequests",
} as const;

const MAX_REQUESTS = 100;

export async function getProviderRequests():
Promise<ProviderRequestListResult> {
  const account =
    await requireApprovedProvider();

  const providerId =
    validDocumentId(
      account.providerId,
    );

  if (!providerId) {
    throw new Error(
      "The provider account is unavailable.",
    );
  }

  const snapshot =
    await adminDb
      .collection(
        COLLECTIONS.providerRequests,
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .orderBy(
        "createdAt",
        "desc",
      )
      .limit(MAX_REQUESTS)
      .get();

  const requests =
    snapshot.docs.map(
      (document) =>
        mapProviderRequest(
          document,
          providerId,
        ),
    );

  return {
    requests,
    summary:
      calculateSummary(
        requests,
      ),
  };
}

function mapProviderRequest(
  document:
    QueryDocumentSnapshot<DocumentData>,
  expectedProviderId: string,
): ProviderRequestListItem {
  const data =
    document.data();

  const providerId =
    requiredDocumentId(
      data.providerId,
      "providerId",
    );

  if (
    providerId !==
    expectedProviderId
  ) {
    throw invalidProviderRequest();
  }

  const mainEventId =
    requiredDocumentId(
      data.mainEventId ??
        data.bookingId,
      "mainEventId",
    );

  const type =
    providerRequestType(
      data.type,
    );

  const status =
    providerRequestStatus(
      data.status,
    );

  const customerFirstName =
    optionalText(
      data.customerFirstName,
      120,
    );

  const customerLastName =
    optionalText(
      data.customerLastName,
      120,
    );

  const customerName =
    [
      customerFirstName,
      customerLastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "FEASTA customer";

  const packageId =
    optionalDocumentId(
      data.packageId,
    );

  const packageName =
    optionalText(
      data.packageName,
      160,
    );

  return {
    id: document.id,

    mainEventId,

    providerId,

    type,

    status,

    customer: {
      id:
        requiredDocumentId(
          data.customerId,
          "customerId",
        ),

      name:
        customerName,

      email:
        optionalEmail(
          data.customerEmail,
        ),

      phoneNumber:
        optionalText(
          data.customerPhoneNumber,
          40,
        ),
    },

    package:
      packageId ||
      packageName
        ? {
            id: packageId,
            name: packageName,
          }
        : null,

    services:
      normalizeServices(
        data.services,
      ),

    event: {
      eventType:
        optionalText(
          data.eventType,
          100,
        ) ?? "Event",

      eventDate:
        timestampIso(
          data.eventDate,
        ),

      eventTime:
        optionalText(
          data.eventTime,
          40,
        ),

      guestCount:
        optionalInteger(
          data.guestCount,
          0,
          1_000_000,
        ),

      venueAddress:
        optionalText(
          data.eventAddress,
          500,
        ),

      city:
        optionalText(
          data.eventLocation,
          200,
        ),

      notes:
        optionalText(
          data.specialRequest ??
            data.notes,
          2_000,
        ),
    },

    amount:
      nonNegativeMoney(
        data.amount,
      ),

    downPaymentAmount:
      nonNegativeMoney(
        data.downPaymentAmount,
      ),

    downPaymentPercentage:
      optionalNumber(
        data.downPaymentPercentage,
        0,
        100,
      ),

    rejectionReason:
      optionalText(
        data.rejectionReason,
        500,
      ),

    createdAt:
      timestampIso(
        data.createdAt,
      ),

    updatedAt:
      timestampIso(
        data.updatedAt,
      ),

    respondedAt:
      timestampIso(
        data.respondedAt,
      ),
  };
}

function calculateSummary(
  requests:
    readonly ProviderRequestListItem[],
): ProviderRequestSummary {
  let pending = 0;
  let awaitingPayment = 0;
  let confirmed = 0;
  let completed = 0;

  for (const request of requests) {
    switch (request.status) {
      case "pending":
        pending += 1;
        break;

      case "waiting_for_down_payment":
      case "payment_processing":
        awaitingPayment += 1;
        break;

      case "accepted":
      case "confirmed":
      case "in_progress":
        confirmed += 1;
        break;

      case "completed":
        completed += 1;
        break;

      default:
        break;
    }
  }

  return {
    pending,
    awaitingPayment,
    confirmed,
    completed,
    total: requests.length,
  };
}

function normalizeServices(
  value: unknown,
): ProviderRequestService[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      (entry, index) =>
        normalizeService(
          entry,
          index,
        ),
    )
    .filter(
      (
        entry,
      ): entry is ProviderRequestService =>
        entry !== null,
    );
}

function normalizeService(
  value: unknown,
  index: number,
): ProviderRequestService | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const data =
    value as Record<
      string,
      unknown
    >;

  const name =
    optionalText(
      data.name,
      160,
    );

  if (!name) {
    return null;
  }

  const quantity =
    optionalInteger(
      data.quantity,
      1,
      100_000,
    ) ?? 1;

  const unitPrice =
    nonNegativeMoney(
      data.unitPrice ??
        data.price,
    );

  const explicitTotal =
    optionalNumber(
      data.totalPrice ??
        data.total,
      0,
      100_000_000,
    );

  return {
    id:
      optionalDocumentId(
        data.id,
      ) ??
      `service-${index + 1}`,

    name,

    quantity,

    unitPrice,

    totalPrice:
      explicitTotal ??
      roundCurrency(
        unitPrice *
          quantity,
      ),
  };
}

function providerRequestStatus(
  value: unknown,
): ProviderRequestStatus {
  if (
    typeof value === "string" &&
    (
      PROVIDER_REQUEST_STATUSES as
        readonly string[]
    ).includes(value)
  ) {
    return value as
      ProviderRequestStatus;
  }

  throw invalidProviderRequest();
}

function providerRequestType(
  value: unknown,
): ProviderRequestType {
  if (
    typeof value === "string" &&
    (
      PROVIDER_REQUEST_TYPES as
        readonly string[]
    ).includes(value)
  ) {
    return value as
      ProviderRequestType;
  }

  throw invalidProviderRequest();
}

function validDocumentId(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 160 ||
    normalized.includes("/")
  ) {
    return null;
  }

  return normalized;
}

function requiredDocumentId(
  value: unknown,
  field: string,
): string {
  const normalized =
    validDocumentId(value);

  if (!normalized) {
    throw new Error(
      `The provider request ${field} is invalid.`,
    );
  }

  return normalized;
}

function optionalDocumentId(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return validDocumentId(
    value,
  );
}

function optionalText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(
        /\s+/gu,
        " ",
      )
      .slice(
        0,
        maximumLength,
      );

  return normalized || null;
}

function optionalEmail(
  value: unknown,
): string | null {
  const normalized =
    optionalText(
      value,
      254,
    );

  if (
    !normalized ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function optionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
    ? value
    : null;
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  )
    ? value
    : null;
}

function nonNegativeMoney(
  value: unknown,
): number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100_000_000
  )
    ? roundCurrency(value)
    : 0;
}

function timestampIso(
  value: unknown,
): string | null {
  if (
    value instanceof Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime(),
    )
  ) {
    return value.toISOString();
  }

  return null;
}

function roundCurrency(
  value: number,
): number {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

function invalidProviderRequest():
Error {
  return new Error(
    "A provider request contains invalid data.",
  );
}