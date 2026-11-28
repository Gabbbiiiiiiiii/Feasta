"use client";

import type {Unsubscribe} from "firebase/firestore";

import {
  markChatRoomRead,
  sendChatMessage,
  subscribeToChatMessages,
} from "@/lib/messaging/messaging-client";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type MarkChatRoomReadResult,
  type SendChatMessageResult,
} from "@/lib/messaging/messaging-types";

import type {ProviderChatMessage} from "./provider-chat-types";

const PROVIDER_SESSION_EXPIRED_MESSAGE =
  "Your provider session has expired. Sign in again.";

export const PROVIDER_CHAT_MESSAGE_MAX_LENGTH = CHAT_MESSAGE_MAX_LENGTH;

export async function sendProviderChatMessage(
  chatRoomId: string,
  message: string,
): Promise<SendChatMessageResult> {
  return sendChatMessage(chatRoomId, message, {
    sessionExpiredMessage: PROVIDER_SESSION_EXPIRED_MESSAGE,
  });
}

export async function markProviderChatRoomRead(
  chatRoomId: string,
): Promise<MarkChatRoomReadResult> {
  return markChatRoomRead(chatRoomId, {
    sessionExpiredMessage: PROVIDER_SESSION_EXPIRED_MESSAGE,
  });
}

export async function subscribeToProviderChatMessages(
  chatRoomId: string,
  onMessages: (messages: readonly ProviderChatMessage[]) => void,
  onError: (message: string) => void,
): Promise<Unsubscribe> {
  return subscribeToChatMessages({
    chatRoomId,
    currentRole: "provider",
    onMessages,
    onError,
    options: {
      sessionExpiredMessage: PROVIDER_SESSION_EXPIRED_MESSAGE,
    },
  });
}
