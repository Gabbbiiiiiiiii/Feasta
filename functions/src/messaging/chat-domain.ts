import {HttpsError} from "firebase-functions/v2/https";

import {
  type MainEventStatus,
  type ProviderRequestStatus,
} from "../shared/constants.js";

export const CHAT_MESSAGE_MAX_LENGTH = 4_000;

export const CHAT_NOTIFICATION_TYPE =
  "new_message" as const;

export const CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
] as const satisfies readonly ProviderRequestStatus[];

export const CHAT_ELIGIBLE_MAIN_EVENT_STATUSES = [
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
] as const satisfies readonly MainEventStatus[];

const SAFE_DOCUMENT_ID =
  /^[A-Za-z0-9_-]{1,160}$/u;

export function canonicalChatRoomId(
  providerRequestId: string,
): string {
  return requireChatDocumentId(
    providerRequestId,
    "providerRequestId",
  );
}

export function requireChatDocumentId(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw invalidField(fieldName);
  }

  const normalized = value.trim();

  if (!SAFE_DOCUMENT_ID.test(normalized)) {
    throw invalidField(fieldName);
  }

  return normalized;
}

export function validateOpenChatInput(
  value: unknown,
): {providerRequestId: string} {
  const input = requireStrictObject(
    value,
    ["providerRequestId"],
  );

  return {
    providerRequestId:
      requireChatDocumentId(
        input.providerRequestId,
        "providerRequestId",
      ),
  };
}

export function validateSendChatMessageInput(
  value: unknown,
): {chatRoomId: string; message: string} {
  const input = requireStrictObject(
    value,
    ["chatRoomId", "message"],
  );

  if (typeof input.message !== "string") {
    throw invalidField("message");
  }

  const message = input.message.trim();

  if (
    message.length === 0 ||
    message.length > CHAT_MESSAGE_MAX_LENGTH
  ) {
    throw invalidField("message");
  }

  return {
    chatRoomId: requireChatDocumentId(
      input.chatRoomId,
      "chatRoomId",
    ),
    message,
  };
}

export function validateMarkChatReadInput(
  value: unknown,
): {chatRoomId: string} {
  const input = requireStrictObject(
    value,
    ["chatRoomId"],
  );

  return {
    chatRoomId: requireChatDocumentId(
      input.chatRoomId,
      "chatRoomId",
    ),
  };
}

export function isChatLifecycleEligible(
  providerRequestStatus: ProviderRequestStatus,
  mainEventStatus: MainEventStatus,
): boolean {
  return (
    CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES as
      readonly ProviderRequestStatus[]
  ).includes(providerRequestStatus) &&
    (
      CHAT_ELIGIBLE_MAIN_EVENT_STATUSES as
        readonly MainEventStatus[]
    ).includes(mainEventStatus);
}

export function assertChatLifecycleEligible(
  providerRequestStatus: ProviderRequestStatus,
  mainEventStatus: MainEventStatus,
): void {
  if (
    !isChatLifecycleEligible(
      providerRequestStatus,
      mainEventStatus,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Messaging is unavailable for this provider request.",
    );
  }
}

function requireStrictObject(
  value: unknown,
  allowedFields: readonly string[],
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The messaging request is invalid.",
    );
  }

  const input = value as Record<string, unknown>;
  const unexpected = Object.keys(input).filter(
    (field) => !allowedFields.includes(field),
  );

  if (unexpected.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      "The messaging request contains unsupported fields.",
    );
  }

  return input;
}

function invalidField(fieldName: string): HttpsError {
  return new HttpsError(
    "invalid-argument",
    `${fieldName} is invalid.`,
  );
}
