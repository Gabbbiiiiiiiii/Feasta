import {readFileSync} from "node:fs";
import {join} from "node:path";

import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  ProviderChatMessage,
  ProviderChatMessagePage,
  ProviderChatRoom,
  ProviderChatRoomPage,
} from "@/lib/provider/messages/provider-chat-types";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  loadRooms: vi.fn(),
  loadRoom: vi.fn(),
  loadMessages: vi.fn(),
  send: vi.fn(),
  markRead: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/provider/messages",
  useRouter: () => ({replace: mocks.replace}),
}));

vi.mock("@/app/provider/messages/actions", () => ({
  loadProviderChatRoomsAction: mocks.loadRooms,
  loadProviderChatRoomAction: mocks.loadRoom,
  loadProviderChatMessagesAction: mocks.loadMessages,
}));

vi.mock("@/lib/provider/messages/provider-chat-client", () => ({
  PROVIDER_CHAT_MESSAGE_MAX_LENGTH: 4_000,
  sendProviderChatMessage: mocks.send,
  markProviderChatRoomRead: mocks.markRead,
  subscribeToProviderChatMessages: mocks.subscribe,
}));

import {ProviderMessagesClient} from "@/app/provider/messages/provider-messages-client";

function room(overrides: Partial<ProviderChatRoom> = {}): ProviderChatRoom {
  return {
    id: "provider_request_123",
    context: {
      providerRequestId: "provider_request_123",
      mainEventId: "main_event_123",
      requestType: "catering",
      requestStatus: "confirmed",
      customerDisplayName: "Ana Reyes",
      eventType: "birthday_party",
      eventDate: "2026-08-30T04:00:00.000Z",
      serviceSummary: "Celebration Package",
    },
    lastMessage: "Can we confirm the setup time?",
    lastMessageAt: "2026-08-22T04:00:00.000Z",
    lastMessageFrom: "customer",
    unreadCount: 2,
    isActive: true,
    canSendMessages: true,
    isLegacy: false,
    createdAt: "2026-08-20T04:00:00.000Z",
    updatedAt: "2026-08-22T04:00:00.000Z",
    ...overrides,
  };
}

function message(overrides: Partial<ProviderChatMessage> = {}): ProviderChatMessage {
  return {
    id: "message-customer",
    sender: "customer",
    text: "Can we confirm the setup time?",
    createdAt: "2026-08-22T03:00:00.000Z",
    ...overrides,
  };
}

function roomPage(
  rooms: ProviderChatRoom[] = [room()],
  nextCursor: string | null = null,
): ProviderChatRoomPage {
  return {
    rooms,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount: 0,
  };
}

function messagePage(
  messages: ProviderChatMessage[] = [message()],
  nextCursor: string | null = null,
  chatRoomId = "provider_request_123",
): ProviderChatMessagePage {
  return {
    chatRoomId,
    messages,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount: 0,
  };
}

function renderWorkspace({
  rooms = roomPage(),
  selectedRoom = null,
  messages = null,
  selectionError = false,
}: {
  rooms?: ProviderChatRoomPage;
  selectedRoom?: ProviderChatRoom | null;
  messages?: ProviderChatMessagePage | null;
  selectionError?: boolean;
} = {}) {
  render(
    <ProviderMessagesClient
      initialFilters={{pageSize: 10, cursor: null}}
      initialPage={rooms}
      initialRoom={selectedRoom}
      initialMessages={messages}
      initialSelectionError={selectionError}
    />,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.loadRooms.mockResolvedValue(roomPage());
  mocks.loadRoom.mockResolvedValue(room());
  mocks.loadMessages.mockResolvedValue(messagePage());
  mocks.send.mockResolvedValue({
    messageId: "sent-message",
    chatRoomId: "provider_request_123",
  });
  mocks.markRead.mockResolvedValue({
    chatRoomId: "provider_request_123",
    changed: true,
  });
  mocks.subscribe.mockResolvedValue(mocks.unsubscribe);
});

describe("provider messages route and security contract", () => {
  const root = process.cwd();
  const page = readFileSync(join(root, "src/app/provider/messages/page.tsx"), "utf8");
  const actions = readFileSync(join(root, "src/app/provider/messages/actions.ts"), "utf8");
  const client = readFileSync(
    join(root, "src/lib/provider/messages/provider-chat-client.ts"),
    "utf8",
  );
  const sharedClient = readFileSync(
    join(root, "src/lib/messaging/messaging-client.ts"),
    "utf8",
  );
  const workspace = readFileSync(
    join(root, "src/app/provider/messages/provider-messages-client.tsx"),
    "utf8",
  );

  it("protects the route through provider server reads and fails deep links safely", () => {
    expect(page).toContain("getProviderChatRoomPage(initialFilters)");
    expect(page).toContain("getProviderChatRoom(requestedRoom)");
    expect(page).toContain("getProviderChatMessages(requestedRoom");
    expect(page).toContain("initialSelectionError = true");
    expect(actions.trimStart().startsWith('"use server";')).toBe(true);
    expect(actions).not.toContain("providerId");
    expect(actions).not.toMatch(/export function/u);
  });

  it("keeps realtime reads bounded and all mutations callable-only", () => {
    expect(client).toContain("subscribeToChatMessages");
    expect(client).toContain('currentRole: "provider"');
    expect(sharedClient).toContain('collection(db, "chatRooms", roomId, "messages")');
    expect(sharedClient).toContain('orderBy("createdAt", "desc")');
    expect(sharedClient).toContain("orderBy(documentId(), \"desc\")");
    expect(sharedClient).toContain("limit(CHAT_REALTIME_MESSAGE_LIMIT)");
    expect(sharedClient).toContain('functions, "sendChatMessage"');
    expect(sharedClient).toContain('functions, "markChatRoomRead"');
    expect(sharedClient).toContain("callable({\n      chatRoomId: roomId,\n      message: normalizedMessage,");
    expect(sharedClient).toContain("callable({chatRoomId: roomId})");
    expect(sharedClient).not.toMatch(/callable\(\{[^}]*providerId|callable\(\{[^}]*senderId|callable\(\{[^}]*senderRole/u);
    expect(sharedClient).not.toMatch(/addDoc|setDoc|updateDoc|deleteDoc|writeBatch/u);
  });

  it("uses responsive list-to-conversation presentation without attachment controls", () => {
    expect(workspace).toContain("lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]");
    expect(workspace).toContain('aria-label="Back to conversations"');
    expect(workspace).toContain("overflow-y-auto");
    expect(workspace).toContain("min-w-0");
    expect(workspace).not.toMatch(/attachmentUrl|Upload attachment|Attach file/u);
  });
});

describe("provider messages workspace", () => {
  it("renders one heading, safe context, preview, timestamp, unread count, and empty states", () => {
    renderWorkspace();
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: "Messages"})).toBeVisible();
    expect(screen.getByText("Ana Reyes")).toBeVisible();
    expect(screen.getByText(/Birthday Party/iu)).toBeVisible();
    expect(screen.getByText("Celebration Package")).toBeVisible();
    expect(screen.getByText("Can we confirm the setup time?")).toBeVisible();
    expect(screen.getByLabelText("2 unread messages")).toBeVisible();
    expect(screen.getByText("Select a conversation")).toBeVisible();

    renderWorkspace({rooms: roomPage([])});
    expect(screen.getByText("No conversations yet")).toBeVisible();
    expect(screen.getByText(/eligible FEASTA event requests/iu)).toBeVisible();
  });

  it("keeps an honest empty-room preview before the first message", () => {
    renderWorkspace({
      rooms: roomPage([room({
        lastMessage: "",
        lastMessageAt: "2026-08-20T04:00:00.000Z",
        lastMessageFrom: null,
        unreadCount: 0,
        updatedAt: null,
      })]),
    });

    const conversation = screen.getByRole("button", {
      name: /Open conversation with Ana Reyes/iu,
    });
    expect(within(conversation).getByText("No messages yet")).toBeVisible();
    expect(within(conversation).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-20T04:00:00.000Z");
  });

  it("opens an authorized room, loads bounded history, updates the URL, and marks only its room read", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("button", {name: /Open conversation with Ana Reyes/iu}));

    await waitFor(() => {
      expect(mocks.loadRoom).toHaveBeenCalledWith("provider_request_123");
      expect(mocks.loadMessages).toHaveBeenCalledWith(
        "provider_request_123",
        {pageSize: 20, cursor: null},
      );
      expect(mocks.markRead).toHaveBeenCalledWith("provider_request_123");
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/messages?room=provider_request_123",
      {scroll: false},
    );
    expect(mocks.markRead.mock.calls.flat()).not.toContain("provider");
  });

  it("displays messages chronologically with textual sender identity and no unsupported actions", () => {
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage([
        message({
          id: "new-provider",
          sender: "provider",
          text: "Yes, setup starts at 2 PM.",
          createdAt: "2026-08-22T04:00:00.000Z",
        }),
        message({id: "old-customer"}),
      ]),
    });

    const history = screen.getByRole("list", {name: "Conversation messages"});
    const items = within(history).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ana Reyes");
    expect(items[1]).toHaveTextContent("You");
    expect(screen.queryByRole("button", {name: /edit|delete|attachment/iu}))
      .not.toBeInTheDocument();
  });

  it("loads older history with an opaque cursor and deduplicates message IDs", async () => {
    const user = userEvent.setup();
    const existing = message({id: "existing"});
    mocks.loadMessages.mockResolvedValueOnce(messagePage([
      existing,
      message({
        id: "older",
        text: "Older event detail",
        createdAt: "2026-08-21T03:00:00.000Z",
      }),
    ]));
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage([existing], "opaque-older-page"),
    });

    await user.click(screen.getByRole("button", {name: "Load older messages"}));
    await waitFor(() => expect(mocks.loadMessages).toHaveBeenCalledWith(
      "provider_request_123",
      {pageSize: 20, cursor: "opaque-older-page"},
    ));
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getAllByText(existing.text)).toHaveLength(1);
    expect(screen.getByText("Older event detail")).toBeVisible();
    const conversation = screen.getByRole("button", {
      name: /Open conversation with Ana Reyes/iu,
    });
    expect(within(conversation).getByText("Can we confirm the setup time?"))
      .toBeVisible();
    expect(within(conversation).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T04:00:00.000Z");
  });

  it("trims sends, disables invalid input, clears only on success, and preserves failures", async () => {
    const user = userEvent.setup();
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage([]),
    });
    const composer = screen.getByLabelText("Message customer");
    const send = screen.getByRole("button", {name: "Send message"});
    expect(send).toBeDisabled();

    await user.type(composer, "   Confirmed for 2 PM.   ");
    await user.click(send);
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(
      "provider_request_123",
      "Confirmed for 2 PM.",
    ));
    expect(composer).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Message sent");

    mocks.send.mockRejectedValueOnce(new Error("The message could not be sent."));
    await user.type(composer, "Please keep this draft");
    await user.click(send);
    expect(await screen.findByText("The message could not be sent.")).toBeVisible();
    expect(composer).toHaveValue("Please keep this draft");
  });

  it("communicates the 4,000-character limit and prevents duplicate pending sends", async () => {
    let resolveSend: (() => void) | null = null;
    mocks.send.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSend = () => resolve({
        messageId: "sent-message",
        chatRoomId: "provider_request_123",
      });
    }));
    const user = userEvent.setup();
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage([]),
    });
    const composer = screen.getByLabelText("Message customer");
    const send = screen.getByRole("button", {name: "Send message"});
    expect(composer).toHaveAttribute("maxlength", "4000");

    fireEvent.change(composer, {target: {value: " ".repeat(20)}});
    expect(send).toBeDisabled();
    fireEvent.change(composer, {target: {value: "a".repeat(4_000)}});
    expect(send).toBeEnabled();
    await user.click(send);
    expect(send).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Sending message");
    expect(mocks.send).toHaveBeenCalledTimes(1);

    act(() => resolveSend?.());
    await waitFor(() => expect(composer).toHaveValue(""));
  });

  it("keeps terminal conversations readable while disabling the composer", () => {
    renderWorkspace({
      selectedRoom: room({
        unreadCount: 0,
        canSendMessages: false,
        context: {...room().context, requestStatus: "completed"},
      }),
      messages: messagePage([message()]),
    });
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getByText("Can we confirm the setup time?")).toBeVisible();
    expect(screen.getByLabelText("Message customer")).toBeDisabled();
    expect(screen.getByText(/conversation is read-only/iu)).toBeVisible();
  });

  it("supports bounded room pagination and opaque legacy room IDs", async () => {
    const user = userEvent.setup();
    const legacy = room({
      id: "legacy_main_event_1",
      isLegacy: true,
      context: {...room().context, providerRequestId: null},
    });
    mocks.loadRooms.mockResolvedValueOnce(roomPage([legacy]));
    renderWorkspace({rooms: roomPage([legacy], "opaque-room-page")});
    await user.click(screen.getByRole("button", {name: "Next"}));
    await waitFor(() => expect(mocks.loadRooms).toHaveBeenCalledWith({
      pageSize: 10,
      cursor: "opaque-room-page",
    }));
    await user.click(screen.getByRole("button", {name: /Open conversation with Ana Reyes/iu}));
    await waitFor(() => expect(mocks.loadRoom).toHaveBeenCalledWith(
      "legacy_main_event_1",
    ));
  });

  it("updates the preview for the provider's own sent message without creating unread", async () => {
    let publish: ((items: readonly ProviderChatMessage[]) => void) | null = null;
    mocks.subscribe.mockImplementation(async (
      _roomId: string,
      onMessages: (items: readonly ProviderChatMessage[]) => void,
    ) => {
      publish = onMessages;
      return mocks.unsubscribe;
    });
    const emptyRoom = room({
      lastMessage: "",
      lastMessageAt: "2026-08-20T04:00:00.000Z",
      lastMessageFrom: null,
      unreadCount: 0,
      updatedAt: null,
    });
    renderWorkspace({
      rooms: roomPage([emptyRoom]),
      selectedRoom: emptyRoom,
      messages: messagePage([]),
    });
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());

    const composer = screen.getByRole("textbox", {name: "Message customer"});
    await userEvent.type(composer, "Provider confirmed the schedule");
    await userEvent.click(screen.getByRole("button", {name: "Send message"}));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(
      "provider_request_123",
      "Provider confirmed the schedule",
    ));
    act(() => publish?.([message({
      id: "sent-provider",
      sender: "provider",
      text: "Provider confirmed the schedule",
      createdAt: "2026-08-23T05:00:00.000Z",
    })]));

    const conversation = screen.getByRole("button", {
      name: /Open conversation with Ana Reyes/iu,
    });
    expect(await within(conversation).findByText("Provider confirmed the schedule"))
      .toBeVisible();
    expect(within(conversation).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-23T05:00:00.000Z");
    expect(within(conversation).queryByText("No messages yet"))
      .not.toBeInTheDocument();
    expect(within(conversation).queryByLabelText(/unread messages/iu))
      .not.toBeInTheDocument();
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("canonically syncs incoming previews, ordering, unread state, duplicates, and cleanup", async () => {
    let publish: ((items: readonly ProviderChatMessage[]) => void) | null = null;
    mocks.subscribe.mockImplementation(async (
      _roomId: string,
      onMessages: (items: readonly ProviderChatMessage[]) => void,
    ) => {
      publish = onMessages;
      return mocks.unsubscribe;
    });
    const otherRoom = room({
      id: "provider_request_999",
      context: {
        ...room().context,
        providerRequestId: "provider_request_999",
        customerDisplayName: "Bea Santos",
      },
      lastMessage: "Other conversation preview",
      lastMessageAt: "2026-08-22T05:00:00.000Z",
      unreadCount: 1,
    });
    const {unmount} = render(
      <ProviderMessagesClient
        initialFilters={{pageSize: 10, cursor: null}}
        initialPage={roomPage([otherRoom, room({unreadCount: 0})])}
        initialRoom={room({unreadCount: 0})}
        initialMessages={messagePage([message()])}
        initialSelectionError={false}
      />,
    );
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledWith(
      "provider_request_123",
      expect.any(Function),
      expect.any(Function),
    ));

    act(() => publish?.([message()]));
    act(() => publish?.([
      message(),
      message({
        id: "incoming-customer-a",
        text: "Earlier equal-time customer update",
        createdAt: "2026-08-22T05:00:00.000Z",
      }),
      message({
        id: "incoming-customer-z",
        text: "Canonical equal-time customer update",
        createdAt: "2026-08-22T05:00:00.000Z",
      }),
    ]));

    let conversations = screen.getByRole("list", {name: "Customer conversations"});
    let conversationButtons = within(conversations).getAllByRole("button");
    expect(conversationButtons).toHaveLength(2);
    expect(conversationButtons[0]).toHaveAccessibleName(
      "Open conversation with Bea Santos, 1 unread messages",
    );
    expect(conversationButtons[1]).toHaveAccessibleName(
      "Open conversation with Ana Reyes",
    );
    expect(await within(conversationButtons[1]).findByText(
      "Canonical equal-time customer update",
    )).toBeVisible();
    expect(within(conversationButtons[1]).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T05:00:00.000Z");

    const latestCustomerMessage = message({
      id: "incoming-customer-latest",
      text: "A new customer update",
      createdAt: "2026-08-22T06:00:00.000Z",
    });
    act(() => publish?.([latestCustomerMessage]));

    conversations = screen.getByRole("list", {name: "Customer conversations"});
    conversationButtons = within(conversations).getAllByRole("button");
    expect(conversationButtons).toHaveLength(2);
    expect(conversationButtons[0]).toHaveAccessibleName(
      "Open conversation with Ana Reyes",
    );
    expect(await within(conversationButtons[0]).findByText("A new customer update"))
      .toBeVisible();
    expect(within(conversationButtons[0]).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T06:00:00.000Z");
    expect(within(conversationButtons[1]).getByText("Other conversation preview"))
      .toBeVisible();
    expect(within(conversationButtons[1]).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T05:00:00.000Z");
    expect(within(conversationButtons[1]).getByLabelText("1 unread messages"))
      .toBeVisible();

    act(() => publish?.([latestCustomerMessage]));
    act(() => publish?.([message()]));

    conversations = screen.getByRole("list", {name: "Customer conversations"});
    conversationButtons = within(conversations).getAllByRole("button");
    expect(conversationButtons).toHaveLength(2);
    expect(within(conversationButtons[0]).getByText("A new customer update"))
      .toBeVisible();
    expect(within(conversationButtons[0]).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T06:00:00.000Z");
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getAllByText("Can we confirm the setup time?")).toHaveLength(1);
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getAllByText("A new customer update")).toHaveLength(1);
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith(
      "provider_request_123",
    ));
    expect(mocks.markRead).toHaveBeenCalledTimes(2);
    expect(within(conversationButtons[0]).queryByLabelText(/unread messages/iu))
      .not.toBeInTheDocument();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("shows a privacy-safe error for invalid or cross-provider deep links", () => {
    renderWorkspace({selectionError: true});
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That conversation is unavailable or no longer belongs to your business.",
    );
    expect(screen.queryByText(/providerId|customerId|Firestore/iu))
      .not.toBeInTheDocument();
  });
});
