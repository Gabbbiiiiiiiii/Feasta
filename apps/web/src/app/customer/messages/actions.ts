"use server";

import {
  getCustomerChatMessages,
  getCustomerChatRoom,
  getCustomerChatRoomPage,
} from "@/lib/customer/messages/customer-chat-service";
import type {
  CustomerChatMessageFilters,
  CustomerChatMessagePage,
  CustomerChatRoomDetail,
  CustomerChatRoomFilters,
  CustomerChatRoomPage,
} from "@/lib/customer/messages/customer-chat-types";

export async function loadCustomerChatRoomsAction(
  filters: CustomerChatRoomFilters,
): Promise<CustomerChatRoomPage> {
  return getCustomerChatRoomPage(filters);
}

export async function loadCustomerChatRoomAction(
  chatRoomId: string,
): Promise<CustomerChatRoomDetail> {
  return getCustomerChatRoom(chatRoomId);
}

export async function loadCustomerChatMessagesAction(
  chatRoomId: string,
  filters: CustomerChatMessageFilters,
): Promise<CustomerChatMessagePage> {
  return getCustomerChatMessages(chatRoomId, filters);
}
