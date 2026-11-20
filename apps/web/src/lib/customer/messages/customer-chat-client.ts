"use client";

import type {Unsubscribe} from "firebase/firestore";

import {
  markChatRoomRead,
  openProviderRequestChat,
  sendChatMessage,
  subscribeToChatMessages,
} from "@/lib/messaging/messaging-client";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type MarkChatRoomReadResult,
  type OpenProviderRequestChatResult,
  type SendChatMessageResult,
} from "@/lib/messaging/messaging-types";

import type {CustomerChatMessage} from "./customer-chat-types";

const CUSTOMER_SESSION_EXPIRED_MESSAGE =
  "Your customer session has expired. Sign in again.";

const customerOptions = {
  sessionExpiredMessage: CUSTOMER_SESSION_EXPIRED_MESSAGE,
} as const;

export const CUSTOMER_CHAT_MESSAGE_MAX_LENGTH = CHAT_MESSAGE_MAX_LENGTH;

export function openCustomerProviderRequestChat(
  providerRequestId: string,
): Promise<OpenProviderRequestChatResult> {
  return openProviderRequestChat(providerRequestId, customerOptions);
}

export function sendCustomerChatMessage(
  chatRoomId: string,
  message: string,
): Promise<SendChatMessageResult> {
  return sendChatMessage(chatRoomId, message, customerOptions);
}

export function markCustomerChatRoomRead(
  chatRoomId: string,
): Promise<MarkChatRoomReadResult> {
  return markChatRoomRead(chatRoomId, customerOptions);
}

export function subscribeToCustomerChatMessages(
  chatRoomId: string,
  onMessages: (messages: readonly CustomerChatMessage[]) => void,
  onError: (message: string) => void,
): Promise<Unsubscribe> {
  return subscribeToChatMessages({
    chatRoomId,
    currentRole: "customer",
    onMessages,
    onError,
    options: customerOptions,
  });
}
