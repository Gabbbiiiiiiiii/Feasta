import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ChatParticipantRole,
} from "./messaging-types";

export type ExpectedChatSenderIds = Partial<
  Readonly<Record<ChatParticipantRole, string>>
>;

export function normalizeChatMessage(input: {
  id: unknown;
  chatRoomId: string;
  data: Readonly<Record<string, unknown>>;
  expectedSenderIds?: ExpectedChatSenderIds;
}): ChatMessage | null {
  const id = participantIdentifier(input.id);
  const senderId = participantIdentifier(input.data.senderId);
  const sender = participantRole(input.data.senderRole);
  const expectedSenderValue = sender
    ? input.expectedSenderIds?.[sender]
    : undefined;
  const expectedSenderId = expectedSenderValue === undefined
    ? null
    : participantIdentifier(expectedSenderValue);
  const text = typeof input.data.message === "string"
    ? input.data.message.trim()
    : "";
  const createdAt = timestampIso(input.data.createdAt);

  if (
    !id ||
    !senderId ||
    !sender ||
    (expectedSenderValue !== undefined &&
      (!expectedSenderId || senderId !== expectedSenderId)) ||
    input.data.chatRoomId !== input.chatRoomId ||
    (input.data.messageType ?? "text") !== "text" ||
    text.length === 0 ||
    text.length > CHAT_MESSAGE_MAX_LENGTH ||
    !createdAt
  ) {
    return null;
  }

  return {id, sender, text, createdAt};
}

function participantRole(value: unknown): ChatParticipantRole | null {
  return value === "customer" || value === "provider" ? value : null;
}

function participantIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();

  return normalized.length > 0 &&
    normalized.length <= 160 &&
    !normalized.includes("/")
    ? normalized
    : null;
}

function timestampIso(value: unknown): string | null {
  const date = dateValue(value);
  return date ? date.toISOString() : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date
      : null;
  }

  return null;
}
