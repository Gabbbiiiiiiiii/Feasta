"use client";

import {FirebaseError} from "firebase/app";
import {
  collection,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {
  auth,
  db,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

import {normalizeChatMessage} from "./message-normalization";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_REALTIME_MESSAGE_LIMIT,
  type ChatMessage,
  type ChatParticipantRole,
  type MarkChatRoomReadResult,
  type OpenProviderRequestChatResult,
  type SendChatMessageResult,
} from "./messaging-types";

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const DEFAULT_SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Sign in again.";

type MessagingClientOptions = {
  sessionExpiredMessage?: string;
};

export async function openProviderRequestChat(
  providerRequestId: string,
  options: MessagingClientOptions = {},
): Promise<OpenProviderRequestChatResult> {
  const requestId = requireDocumentId(providerRequestId);
  await requireFirebaseUser(options);
  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {providerRequestId: string},
    OpenProviderRequestChatResult
  >(functions, "openProviderRequestChat", {timeout: 30_000});

  try {
    const response = await callable({providerRequestId: requestId});
    return normalizeOpenResult(response.data);
  } catch (error) {
    throw normalizeMessagingError(
      error,
      "The conversation could not be opened. Please try again.",
      options,
    );
  }
}

export async function sendChatMessage(
  chatRoomId: string,
  message: string,
  options: MessagingClientOptions = {},
): Promise<SendChatMessageResult> {
  const roomId = requireDocumentId(chatRoomId);
  const normalizedMessage = message.trim();

  if (
    normalizedMessage.length === 0 ||
    normalizedMessage.length > CHAT_MESSAGE_MAX_LENGTH
  ) {
    throw new Error("Enter a message up to 4,000 characters.");
  }

  await requireFirebaseUser(options);
  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {chatRoomId: string; message: string},
    SendChatMessageResult
  >(functions, "sendChatMessage", {timeout: 30_000});

  try {
    const response = await callable({
      chatRoomId: roomId,
      message: normalizedMessage,
    });
    const result = response.data;
    const responseRoomId = requireDocumentId(result?.chatRoomId);
    const messageId = requireDocumentId(result?.messageId);

    if (responseRoomId !== roomId) {
      throw new Error("The messaging response is invalid.");
    }

    return {
      chatRoomId: roomId,
      messageId,
    };
  } catch (error) {
    throw normalizeMessagingError(
      error,
      "The message could not be sent. Please try again.",
      options,
    );
  }
}

export async function markChatRoomRead(
  chatRoomId: string,
  options: MessagingClientOptions = {},
): Promise<MarkChatRoomReadResult> {
  const roomId = requireDocumentId(chatRoomId);
  await requireFirebaseUser(options);
  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {chatRoomId: string},
    MarkChatRoomReadResult
  >(functions, "markChatRoomRead", {timeout: 30_000});

  try {
    const response = await callable({chatRoomId: roomId});
    const result = response.data;
    const responseRoomId = requireDocumentId(result?.chatRoomId);

    if (
      responseRoomId !== roomId ||
      typeof result.changed !== "boolean"
    ) {
      throw new Error("The messaging response is invalid.");
    }

    return {chatRoomId: roomId, changed: result.changed};
  } catch (error) {
    throw normalizeMessagingError(
      error,
      "The conversation could not be marked as read.",
      options,
    );
  }
}

export async function subscribeToChatMessages(input: {
  chatRoomId: string;
  currentRole: ChatParticipantRole;
  onMessages: (messages: readonly ChatMessage[]) => void;
  onError: (message: string) => void;
  options?: MessagingClientOptions;
}): Promise<Unsubscribe> {
  const roomId = requireDocumentId(input.chatRoomId);
  const user = await requireFirebaseUser(input.options ?? {});
  const newestMessages = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    orderBy(documentId(), "desc"),
    limit(CHAT_REALTIME_MESSAGE_LIMIT),
  );

  return onSnapshot(
    newestMessages,
    (snapshot) => {
      input.onMessages(
        snapshot.docs.flatMap((document) => {
          const message = normalizeChatMessage({
            id: document.id,
            chatRoomId: roomId,
            data: document.data(),
            expectedSenderIds: {[input.currentRole]: user.uid},
          });

          return message ? [message] : [];
        }),
      );
    },
    () => {
      input.onError(
        "Live message updates are unavailable. Use Refresh messages to check again.",
      );
    },
  );
}

async function requireFirebaseUser(
  options: MessagingClientOptions,
) {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      sessionExpiredMessage(options),
      "session_expired",
    );
  }

  return auth.currentUser;
}

function normalizeOpenResult(
  value: OpenProviderRequestChatResult,
): OpenProviderRequestChatResult {
  const chatRoomId = requireDocumentId(value?.chatRoomId);
  const mainEventId = requireDocumentId(value?.mainEventId);
  const providerRequestId = value?.providerRequestId === null
    ? null
    : requireDocumentId(value?.providerRequestId);

  if (
    typeof value?.created !== "boolean" ||
    typeof value?.isLegacy !== "boolean" ||
    typeof value?.isActive !== "boolean"
  ) {
    throw new Error("The messaging response is invalid.");
  }

  return {
    chatRoomId,
    providerRequestId,
    mainEventId,
    created: value.created,
    isLegacy: value.isLegacy,
    isActive: value.isActive,
  };
}

function requireDocumentId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("This conversation is unavailable.");
  }

  const normalized = value.trim();
  if (!SAFE_DOCUMENT_ID.test(normalized)) {
    throw new Error("This conversation is unavailable.");
  }

  return normalized;
}

function normalizeMessagingError(
  error: unknown,
  fallback: string,
  options: MessagingClientOptions,
): Error {
  if (error instanceof WebAuthenticationError) return error;
  if (!(error instanceof FirebaseError)) return new Error(fallback);

  switch (error.code) {
    case "functions/unauthenticated":
      return new WebAuthenticationError(
        sessionExpiredMessage(options),
        "session_expired",
      );
    case "functions/permission-denied":
    case "functions/not-found":
      return new Error("This conversation is unavailable.");
    case "functions/failed-precondition":
      return new Error("Messaging is unavailable for this event.");
    case "functions/invalid-argument":
      return new Error("Check the message and try again.");
    case "functions/resource-exhausted":
      return new Error(
        "Too many messaging requests were made. Please wait and try again.",
      );
    case "functions/deadline-exceeded":
    case "functions/unavailable":
      return new Error(
        "Messaging is temporarily unavailable. Please try again.",
      );
    default:
      return new Error(fallback);
  }
}

function sessionExpiredMessage(options: MessagingClientOptions): string {
  return options.sessionExpiredMessage?.trim() ||
    DEFAULT_SESSION_EXPIRED_MESSAGE;
}
