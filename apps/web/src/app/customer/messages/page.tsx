import type {Metadata} from "next";

import {
  getCustomerChatMessages,
  getCustomerChatRoom,
  getCustomerChatRoomPage,
} from "@/lib/customer/messages/customer-chat-service";
import type {
  CustomerChatMessagePage,
  CustomerChatRoomDetail,
} from "@/lib/customer/messages/customer-chat-types";

import {CustomerMessagesClient} from "./customer-messages-client";

export const metadata: Metadata = {
  title: "Messages",
  description: "Message providers connected to your FEASTA events.",
};

export default async function CustomerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const requestedRoom = Array.isArray(values.room)
    ? values.room[0]
    : values.room;
  const initialFilters = {pageSize: 10, cursor: null} as const;
  const initialPage = await getCustomerChatRoomPage(initialFilters);
  let initialRoom: CustomerChatRoomDetail | null = null;
  let initialMessages: CustomerChatMessagePage | null = null;
  let initialSelectionError = false;

  if (requestedRoom) {
    try {
      [initialRoom, initialMessages] = await Promise.all([
        getCustomerChatRoom(requestedRoom),
        getCustomerChatMessages(requestedRoom, {
          pageSize: 20,
          cursor: null,
        }),
      ]);
    } catch {
      initialSelectionError = true;
    }
  }

  return (
    <CustomerMessagesClient
      initialFilters={initialFilters}
      initialPage={initialPage}
      initialRoom={initialRoom}
      initialMessages={initialMessages}
      initialSelectionError={initialSelectionError}
    />
  );
}
