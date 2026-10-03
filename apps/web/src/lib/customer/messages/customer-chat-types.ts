import type {
  ProviderRequestStatus,
  ProviderRequestType,
} from "@feasta/shared-types";

import type {
  ChatMessage,
  ChatMessageFilters,
  ChatMessagePage,
} from "@/lib/messaging/messaging-types";

export type CustomerChatRoomFilters = {
  pageSize: number;
  cursor?: string | null;
};

export type CustomerChatContext = {
  providerRequestId: string;
  mainEventId: string;
  requestType: ProviderRequestType | null;
  requestStatus: ProviderRequestStatus | null;
  providerBusinessName: string;
  eventType: string | null;
  eventDate: string | null;
  serviceSummary: string;
};

export type CustomerChatRoom = {
  id: string;
  context: CustomerChatContext;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageFrom: "customer" | "provider" | null;
  unreadCount: number;
  isActive: boolean;
  canSendMessages: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type CustomerChatRoomPage = {
  rooms: CustomerChatRoom[];
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedCount: number;
};

export type CustomerChatMessage = ChatMessage;
export type CustomerChatMessageFilters = ChatMessageFilters;
export type CustomerChatMessagePage = ChatMessagePage;
export type CustomerChatRoomDetail = CustomerChatRoom;
