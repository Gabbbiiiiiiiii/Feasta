"use server";

import {
  getProviderChatMessages,
  getProviderChatRoom,
  getProviderChatRoomPage,
} from "@/lib/provider/messages/provider-chat-service";
import type {
  ProviderChatMessageFilters,
  ProviderChatMessagePage,
  ProviderChatRoomDetail,
  ProviderChatRoomFilters,
  ProviderChatRoomPage,
} from "@/lib/provider/messages/provider-chat-types";

export async function loadProviderChatRoomsAction(
  filters: ProviderChatRoomFilters,
): Promise<ProviderChatRoomPage> {
  return await getProviderChatRoomPage(filters);
}

export async function loadProviderChatRoomAction(
  chatRoomId: string,
): Promise<ProviderChatRoomDetail> {
  return await getProviderChatRoom(chatRoomId);
}

export async function loadProviderChatMessagesAction(
  chatRoomId: string,
  filters: ProviderChatMessageFilters,
): Promise<ProviderChatMessagePage> {
  return await getProviderChatMessages(chatRoomId, filters);
}
