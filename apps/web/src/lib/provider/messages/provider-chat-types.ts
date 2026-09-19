import type {
  ProviderRequestStatus,
  ProviderRequestType,
} from "@feasta/shared-types";

import type {
  ChatMessage,
  ChatMessageFilters,
  ChatMessagePage,
} from "@/lib/messaging/messaging-types";

export type ProviderChatRoomFilters = {
  pageSize: number;
  cursor?: string | null;
};

export type ProviderChatContext = {
  providerRequestId: string | null;
  mainEventId: string;
  requestType: ProviderRequestType | null;
  requestStatus: ProviderRequestStatus | null;
  customerDisplayName: string;
  eventType: string | null;
  eventDate: string | null;
  serviceSummary: string;
};

export type ProviderChatRoom = {
  id: string;
  context: ProviderChatContext;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageFrom: "customer" | "provider" | null;
  unreadCount: number;
  isActive: boolean;
  canSendMessages: boolean;
  isLegacy: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type ProviderChatRoomPage = {
  rooms: ProviderChatRoom[];
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedCount: number;
};

export type ProviderChatMessage = ChatMessage;

export type ProviderChatMessageFilters = ChatMessageFilters;

export type ProviderChatMessagePage = ChatMessagePage;

export type ProviderChatRoomDetail = ProviderChatRoom;
