import {
  getProviderChatMessages,
  getProviderChatRoom,
  getProviderChatRoomPage,
} from "@/lib/provider/messages/provider-chat-service";
import type {
  ProviderChatMessagePage,
  ProviderChatRoomDetail,
} from "@/lib/provider/messages/provider-chat-types";

import {ProviderMessagesClient} from "./provider-messages-client";

type ProviderMessagesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProviderMessagesPage({
  searchParams,
}: ProviderMessagesPageProps) {
  const values = await searchParams;
  const requestedRoom = Array.isArray(values.room)
    ? values.room[0]
    : values.room;
  const initialFilters = {pageSize: 10, cursor: null} as const;
  const initialPage = await getProviderChatRoomPage(initialFilters);
  let initialRoom: ProviderChatRoomDetail | null = null;
  let initialMessages: ProviderChatMessagePage | null = null;
  let initialSelectionError = false;

  if (requestedRoom) {
    try {
      [initialRoom, initialMessages] = await Promise.all([
        getProviderChatRoom(requestedRoom),
        getProviderChatMessages(requestedRoom, {
          pageSize: 20,
          cursor: null,
        }),
      ]);
    } catch {
      initialSelectionError = true;
    }
  }

  return (
    <ProviderMessagesClient
      initialFilters={initialFilters}
      initialPage={initialPage}
      initialRoom={initialRoom}
      initialMessages={initialMessages}
      initialSelectionError={initialSelectionError}
    />
  );
}
