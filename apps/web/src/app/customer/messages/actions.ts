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

export function loadCustomerChatRoomsAction(
  filters: CustomerChatRoomFilters,
): Promise<CustomerChatRoomPage> {
  return getCustomerChatRoomPage(filters);
}

export function loadCustomerChatRoomAction(
  chatRoomId: string,
): Promise<CustomerChatRoomDetail> {
  return getCustomerChatRoom(chatRoomId);
}

export function loadCustomerChatMessagesAction(
  chatRoomId: string,
  filters: CustomerChatMessageFilters,
): Promise<CustomerChatMessagePage> {
  return getCustomerChatMessages(chatRoomId, filters);
}
