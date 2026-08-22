"use client";

import {FirebaseError} from "firebase/app";
import {
  collection,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
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

import type {ProviderChatMessage} from "./provider-chat-types";

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const REALTIME_MESSAGE_LIMIT = 20;
export const PROVIDER_CHAT_MESSAGE_MAX_LENGTH = 4_000;

type SendChatMessageResult = {
  messageId: string;
  chatRoomId: string;
  recipientId: string;
};

type MarkChatRoomReadResult = {
  chatRoomId: string;
  changed: boolean;
};

export async function sendProviderChatMessage(
  chatRoomId: string,
  message: string,
): Promise<SendChatMessageResult> {
  const roomId = requireChatRoomId(chatRoomId);
  const normalizedMessage = message.trim();

  if (
    normalizedMessage.length === 0 ||
    normalizedMessage.length > PROVIDER_CHAT_MESSAGE_MAX_LENGTH
  ) {
    throw new Error("Enter a message up to 4,000 characters.");
  }

  await requireProviderFirebaseUser();
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
    return response.data;
  } catch (error) {
    throw normalizeChatError(
      error,
      "The message could not be sent. Please try again.",
    );
  }
}

export async function markProviderChatRoomRead(
  chatRoomId: string,
): Promise<MarkChatRoomReadResult> {
  const roomId = requireChatRoomId(chatRoomId);
  await requireProviderFirebaseUser();
  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {chatRoomId: string},
    MarkChatRoomReadResult
  >(functions, "markChatRoomRead", {timeout: 30_000});

  try {
    const response = await callable({chatRoomId: roomId});
    return response.data;
  } catch (error) {
    throw normalizeChatError(
      error,
      "The conversation could not be marked as read.",
    );
  }
}

export async function subscribeToProviderChatMessages(
  chatRoomId: string,
  onMessages: (messages: readonly ProviderChatMessage[]) => void,
  onError: (message: string) => void,
): Promise<Unsubscribe> {
  const roomId = requireChatRoomId(chatRoomId);
  await requireProviderFirebaseUser();

  const newestMessages = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    orderBy(documentId(), "desc"),
    limit(REALTIME_MESSAGE_LIMIT),
  );

  return onSnapshot(
    newestMessages,
    (snapshot) => {
      onMessages(
        snapshot.docs.flatMap((document) => {
          const message = mapRealtimeMessage(document, roomId);
          return message ? [message] : [];
        }),
      );
    },
    () => {
      onError(
        "Live message updates are unavailable. Use Refresh messages to check again.",
      );
    },
  );
}

function mapRealtimeMessage(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  chatRoomId: string,
): ProviderChatMessage | null {
  const data = snapshot.data();
  const text = typeof data.message === "string"
    ? data.message.trim()
    : "";
  const createdAt = timestampIso(data.createdAt);
  const sender = data.senderRole === "customer"
    ? "customer"
    : data.senderRole === "provider"
      ? "provider"
      : null;

  if (
    data.chatRoomId !== chatRoomId ||
    (data.messageType ?? "text") !== "text" ||
    text.length === 0 ||
    text.length > PROVIDER_CHAT_MESSAGE_MAX_LENGTH ||
    !createdAt ||
    !sender
  ) {
    return null;
  }

  return {id: snapshot.id, sender, text, createdAt};
}

async function requireProviderFirebaseUser(): Promise<void> {
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session has expired. Sign in again.",
      "session_expired",
    );
  }
}

function requireChatRoomId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("This conversation is unavailable.");
  }
  const normalized = value.trim();
  if (!SAFE_DOCUMENT_ID.test(normalized)) {
    throw new Error("This conversation is unavailable.");
  }
  return normalized;
}

function timestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toISOString()
      : null;
  }
  return null;
}

function normalizeChatError(
  error: unknown,
  fallback: string,
): Error {
  if (error instanceof WebAuthenticationError) return error;
  if (!(error instanceof FirebaseError)) return new Error(fallback);

  switch (error.code) {
    case "functions/unauthenticated":
      return new WebAuthenticationError(
        "Your provider session has expired. Sign in again.",
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
