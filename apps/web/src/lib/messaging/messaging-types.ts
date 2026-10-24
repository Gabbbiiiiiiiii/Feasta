export const CHAT_MESSAGE_MAX_LENGTH = 4_000;
export const CHAT_REALTIME_MESSAGE_LIMIT = 20;

export type ChatParticipantRole = "customer" | "provider";

export type ChatMessage = {
  id: string;
  sender: ChatParticipantRole;
  text: string;
  createdAt: string;
};

export type ChatMessageFilters = {
  pageSize: number;
  cursor?: string | null;
};

export type ChatMessagePage = {
  chatRoomId: string;
  messages: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedCount: number;
};

export type OpenProviderRequestChatResult = {
  chatRoomId: string;
  providerRequestId: string | null;
  mainEventId: string;
  created: boolean;
  isLegacy: boolean;
  isActive: boolean;
};

export type SendChatMessageResult = {
  messageId: string;
  chatRoomId: string;
};

export type MarkChatRoomReadResult = {
  chatRoomId: string;
  changed: boolean;
};
