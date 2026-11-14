import type {
  DocumentData,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  isApprovedProviderForOperations,
  parseProviderRequestStatus,
  parseProviderRequestType,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "../shared/constants.js";

export type AuthorizedProviderRequest = {
  providerRequestId: string;
  mainEventId: string;
  customerId: string;
  providerId: string;
  providerOwnerId: string;

  type: ProviderRequestType;
  status: ProviderRequestStatus;

  requestData: DocumentData;
  providerData: DocumentData;
};

export function authorizeProviderRequest(
  input: {
    actorUid: string;

    providerRequestSnapshot:
      DocumentSnapshot<DocumentData>;

    providerSnapshot:
      DocumentSnapshot<DocumentData>;

    validationMode?:
      "operational" | "core";
  },
): AuthorizedProviderRequest {
  const {
    actorUid,
    providerRequestSnapshot,
    providerSnapshot,
    validationMode = "operational",
  } = input;

  if (!providerRequestSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "The provider request was not found.",
    );
  }

  const requestData =
    providerRequestSnapshot.data() ?? {};

  const providerRequestId =
    providerRequestSnapshot.id;

  const mainEventId = stringValue(
    requestData.mainEventId,
  );

  const customerId = stringValue(
    requestData.customerId,
  );

  const providerId = stringValue(
    requestData.providerId,
  );

  const type = parseProviderRequestType(
    requestData.type,
  );

  const status =
    parseProviderRequestStatus(
      requestData.status,
    );

  if (
    !mainEventId ||
    !customerId ||
    !providerId ||
    !type ||
    !status
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider request record is invalid.",
    );
  }

  if (!providerSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The provider account was not found.",
    );
  }

  if (
    providerSnapshot.id !== providerId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider request linkage is invalid.",
    );
  }

  const providerData =
    providerSnapshot.data() ?? {};

  const providerOwnerId = stringValue(
    providerData.ownerId,
  );

  if (
    !providerOwnerId ||
    providerOwnerId !== actorUid
  ) {
    throw new HttpsError(
      "permission-denied",
      "You do not own this provider request.",
    );
  }

  if (
    !isApprovedProviderForOperations(
      providerData,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider account is not available for operations.",
    );
  }

  const storedRequestId = stringValue(
    requestData.providerRequestId,
  );

  if (
    !storedRequestId ||
    storedRequestId !== providerRequestId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider request identifier is invalid.",
    );
  }

  if (validationMode === "operational") {
    nonNegativeNumber(
      requestData.amount,
      "Provider-request amount",
    );
    nonNegativeNumber(
      requestData.downPaymentAmount,
      "Provider-request down payment",
    );
    nonNegativeInteger(
      requestData.guestCount,
      "Provider-request guest count",
    );
  }

  return {
    providerRequestId,
    mainEventId,
    customerId,
    providerId,
    providerOwnerId,

    type,
    status,

    requestData,
    providerData,
  };
}

export function requirePendingProviderRequest(
  request:
    AuthorizedProviderRequest,
): void {
  if (request.status !== "pending") {
    throw new HttpsError(
      "failed-precondition",
      "Only a pending provider request can be reviewed.",
    );
  }
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function nonNegativeNumber(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return value;
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return value as number;
}
