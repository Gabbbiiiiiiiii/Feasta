import {readFileSync} from "node:fs";
import {join} from "node:path";

import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  CustomerChatMessage,
  CustomerChatMessagePage,
  CustomerChatRoom,
  CustomerChatRoomPage,
} from "@/lib/customer/messages/customer-chat-types";

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
  usePathname: () => "/customer/messages",
  useRouter: () => ({replace: mocks.replace}),
}));

vi.mock("@/app/customer/messages/actions", () => ({
  loadCustomerChatRoomsAction: mocks.loadRooms,
  loadCustomerChatRoomAction: mocks.loadRoom,
  loadCustomerChatMessagesAction: mocks.loadMessages,
}));

vi.mock("@/lib/customer/messages/customer-chat-client", () => ({
  CUSTOMER_CHAT_MESSAGE_MAX_LENGTH: 4_000,
  sendCustomerChatMessage: mocks.send,
  markCustomerChatRoomRead: mocks.markRead,
  subscribeToCustomerChatMessages: mocks.subscribe,
}));

import {CustomerMessagesClient} from "@/app/customer/messages/customer-messages-client";

function room(overrides: Partial<CustomerChatRoom> = {}): CustomerChatRoom {
  return {
    id: "provider_request_customer_123",
    context: {
      providerRequestId: "provider_request_customer_123",
      mainEventId: "main_event_customer_123",
      requestType: "catering",
      requestStatus: "confirmed",
      providerBusinessName: "Maria's Catering",
      eventType: "wedding_reception",
      eventDate: "2026-09-10T10:00:00.000Z",
      serviceSummary: "Premium Wedding Package",
    },
    lastMessage: "We can confirm the setup schedule.",
    lastMessageAt: "2026-08-22T04:00:00.000Z",
    lastMessageFrom: "provider",
    unreadCount: 2,
    isActive: true,
    canSendMessages: true,
    createdAt: "2026-08-20T04:00:00.000Z",
    updatedAt: "2026-08-22T04:00:00.000Z",
    ...overrides,
  };
}

function message(overrides: Partial<CustomerChatMessage> = {}): CustomerChatMessage {
  return {
    id: "provider-message",
    sender: "provider",
    text: "We can confirm the setup schedule.",
    createdAt: "2026-08-22T03:00:00.000Z",
    ...overrides,
  };
}

function roomPage(
  rooms: CustomerChatRoom[] = [room()],
  nextCursor: string | null = null,
): CustomerChatRoomPage {
  return {
    rooms,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount: 0,
  };
}

function messagePage(
  messages: CustomerChatMessage[] = [message()],
  nextCursor: string | null = null,
): CustomerChatMessagePage {
  return {
    chatRoomId: "provider_request_customer_123",
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
  rooms?: CustomerChatRoomPage;
  selectedRoom?: CustomerChatRoom | null;
  messages?: CustomerChatMessagePage | null;
  selectionError?: boolean;
} = {}) {
  render(
    <CustomerMessagesClient
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
    chatRoomId: "provider_request_customer_123",
  });
  mocks.markRead.mockResolvedValue({
    chatRoomId: "provider_request_customer_123",
    changed: true,
  });
  mocks.subscribe.mockResolvedValue(mocks.unsubscribe);
});

describe("customer messages route and security contract", () => {
  const root = process.cwd();
  const page = readFileSync(join(root, "src/app/customer/messages/page.tsx"), "utf8");
  const actions = readFileSync(join(root, "src/app/customer/messages/actions.ts"), "utf8");
  const service = readFileSync(
    join(root, "src/lib/customer/messages/customer-chat-service.ts"),
    "utf8",
  );
  const client = readFileSync(
    join(root, "src/lib/customer/messages/customer-chat-client.ts"),
    "utf8",
  );
  const indexes = readFileSync(
    join(root, "..", "..", "firebase/firestore.indexes.json"),
    "utf8",
  );

  it("uses trusted customer identity and canonical provider-request relationships", () => {
    expect(service).toContain("requireVerifiedEmail(await requireCustomer())");
    expect(service).toContain('.where("customerId", "==", customerId)');
    expect(service).toContain("providerRequestId !== snapshot.id");
    expect(service).toContain("(request.mainEventId ?? request.bookingId) !== mainEventId");
    expect(service).toContain("event.customerId !== customerId");
    expect(service).toContain("event.providerRequestIds.includes(providerRequestId)");
    expect(service).not.toContain('collection("bookings")');
    expect(actions.trimStart().startsWith('"use server";')).toBe(true);
    expect(actions).not.toMatch(/customerId|providerId|senderId|senderRole/u);
  });

  it("keeps route reads bounded, hides deep-link failures, and uses the customer index", () => {
    expect(page).toContain("pageSize: 10");
    expect(page).toContain("pageSize: 20");
    expect(page).toContain("getCustomerChatRoom(requestedRoom)");
    expect(page).toContain("initialSelectionError = true");
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain(".limit(pageSize + 1)");
    const indexConfig = JSON.parse(indexes) as {
      indexes: Array<{
        collectionGroup: string;
        fields: Array<{fieldPath: string; order?: string}>;
      }>;
    };
    expect(indexConfig.indexes.some((index) =>
      index.collectionGroup === "chatRooms" &&
      index.fields.map((field) => `${field.fieldPath}:${field.order}`).join("|") ===
        "customerId:ASCENDING|isActive:ASCENDING|lastMessageAt:DESCENDING|__name__:DESCENDING"
    )).toBe(true);
  });

  it("uses shared callable-only messaging without caller-selected identity", () => {
    expect(client).toContain("openProviderRequestChat(providerRequestId, customerOptions)");
    expect(client).toContain("sendChatMessage(chatRoomId, message, customerOptions)");
    expect(client).toContain("markChatRoomRead(chatRoomId, customerOptions)");
    expect(client).toContain('currentRole: "customer"');
    expect(client).not.toMatch(/senderId|senderRole|customerId|providerId/u);
  });
});

describe("customer messages workspace", () => {
  it("renders safe provider context, unread state, and no raw participant identities", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", {level: 1, name: "Messages"})).toBeVisible();
    expect(screen.getByText("Maria's Catering")).toBeVisible();
    expect(screen.getByText("Premium Wedding Package")).toBeVisible();
    expect(screen.getByLabelText("2 unread messages")).toBeVisible();
    expect(screen.getByText("Select a conversation")).toBeVisible();
    expect(document.body).not.toHaveTextContent("main_event_customer_123");
    expect(document.body).not.toHaveTextContent("provider_request_customer_123");
  });

  it("renders an honest empty inbox and paginates rooms with an opaque cursor", async () => {
    const user = userEvent.setup();
    const {unmount} = render(
      <CustomerMessagesClient
        initialFilters={{pageSize: 10, cursor: null}}
        initialPage={roomPage([])}
        initialRoom={null}
        initialMessages={null}
        initialSelectionError={false}
      />,
    );
    expect(screen.getByText("No conversations yet")).toBeVisible();
    unmount();

    mocks.loadRooms.mockResolvedValueOnce(roomPage());
    renderWorkspace({rooms: roomPage([room()], "opaque-room-page")});
    await user.click(screen.getByRole("button", {name: "Next"}));
    await waitFor(() => expect(mocks.loadRooms).toHaveBeenCalledWith({
      pageSize: 10,
      cursor: "opaque-room-page",
    }));
  });

  it("shows an honest empty-room preview before the first message", () => {
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
      name: /Open conversation with Maria's Catering/iu,
    });
    expect(within(conversation).getByText("No messages yet")).toBeVisible();
  });

  it("opens an authorized room, loads bounded history, updates the URL, and marks it read", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", {
      name: /Open conversation with Maria's Catering/iu,
    }));

    await waitFor(() => {
      expect(mocks.loadRoom).toHaveBeenCalledWith("provider_request_customer_123");
      expect(mocks.loadMessages).toHaveBeenCalledWith(
        "provider_request_customer_123",
        {pageSize: 20, cursor: null},
      );
      expect(mocks.markRead).toHaveBeenCalledWith("provider_request_customer_123");
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      "/customer/messages?room=provider_request_customer_123",
      {scroll: false},
    );
  });

  it("orders messages with customer-safe sender labels", () => {
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage([
        message({
          id: "customer-later",
          sender: "customer",
          text: "Thank you, that works.",
          createdAt: "2026-08-22T04:00:00.000Z",
        }),
        message(),
      ]),
    });

    const list = screen.getByRole("list", {name: "Conversation messages"});
    const items = within(list).getAllByRole("article");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAccessibleName("Message from Maria's Catering");
    expect(items[1]).toHaveAccessibleName("Message from You");
  });

  it("loads older history through a bounded cursor and deduplicates message IDs", async () => {
    const user = userEvent.setup();
    const existing = message({id: "existing"});
    mocks.loadMessages.mockResolvedValueOnce(messagePage([
      existing,
      message({
        id: "older-provider",
        text: "An older provider update",
        createdAt: "2026-08-21T03:00:00.000Z",
      }),
    ]));
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage([existing], "opaque-older-page"),
    });

    await user.click(screen.getByRole("button", {name: "Load older messages"}));
    await waitFor(() => expect(mocks.loadMessages).toHaveBeenCalledWith(
      "provider_request_customer_123",
      {pageSize: 20, cursor: "opaque-older-page"},
    ));
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getAllByText(existing.text)).toHaveLength(1);
    expect(screen.getByText("An older provider update")).toBeVisible();
    const conversation = screen.getByRole("button", {
      name: /Open conversation with Maria's Catering/iu,
    });
    expect(within(conversation).getByText("We can confirm the setup schedule."))
      .toBeVisible();
    expect(within(conversation).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T04:00:00.000Z");
  });

  it("updates an empty preview from successive successful customer sends", async () => {
    let publish: ((items: readonly CustomerChatMessage[]) => void) | null = null;
    mocks.subscribe.mockImplementation(async (
      _roomId: string,
      onMessages: (items: readonly CustomerChatMessage[]) => void,
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

    const composer = screen.getByRole("textbox", {name: "Message provider"});
    await userEvent.type(composer, "First customer message");
    await userEvent.click(screen.getByRole("button", {name: "Send message"}));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(
      "provider_request_customer_123",
      "First customer message",
    ));
    await waitFor(() => expect(composer).toHaveValue(""));
    act(() => publish?.([message({
      id: "sent-message",
      sender: "customer",
      text: "First customer message",
      createdAt: "2026-08-23T05:00:00.000Z",
    })]));

    let conversation = screen.getByRole("button", {
      name: /Open conversation with Maria's Catering/iu,
    });
    expect(await within(conversation).findByText("First customer message"))
      .toBeVisible();
    expect(within(conversation).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-23T05:00:00.000Z");
    expect(within(conversation).queryByText("No messages yet"))
      .not.toBeInTheDocument();

    await userEvent.type(composer, "Later customer message");
    await userEvent.click(screen.getByRole("button", {name: "Send message"}));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    act(() => publish?.([
      message({
        id: "sent-message",
        sender: "customer",
        text: "First customer message",
        createdAt: "2026-08-23T05:00:00.000Z",
      }),
      message({
        id: "sent-message-later",
        sender: "customer",
        text: "Later customer message",
        createdAt: "2026-08-24T06:00:00.000Z",
      }),
    ]));

    conversation = screen.getByRole("button", {
      name: /Open conversation with Maria's Catering/iu,
    });
    expect(await within(conversation).findByText("Later customer message"))
      .toBeVisible();
    expect(within(conversation).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-24T06:00:00.000Z");
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getAllByText("First customer message")).toHaveLength(1);
  });

  it("trims messages, prevents duplicate sends, and sends no caller-selected identity", async () => {
    const pending = deferred<void>();
    mocks.send.mockReturnValueOnce(pending.promise);
    renderWorkspace({
      selectedRoom: room({unreadCount: 0}),
      messages: messagePage(),
    });

    const composer = screen.getByRole("textbox", {name: "Message provider"});
    fireEvent.change(composer, {target: {value: "  Please confirm the menu.  "}});
    const send = screen.getByRole("button", {name: "Send message"});
    fireEvent.click(send);
    fireEvent.click(send);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(
      "provider_request_customer_123",
      "Please confirm the menu.",
    );
    await act(async () => pending.resolve());
    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(composer).toHaveValue("");
  });

  it("keeps terminal conversations readable and disables the composer", () => {
    renderWorkspace({
      selectedRoom: room({
        canSendMessages: false,
        context: {...room().context, requestStatus: "completed"},
      }),
      messages: messagePage(),
    });

    expect(screen.getAllByText("We can confirm the setup schedule.").length)
      .toBeGreaterThan(0);
    expect(screen.getByText(/conversation is read-only/iu)).toBeVisible();
    expect(screen.getByRole("textbox", {name: "Message provider"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Send message"})).toBeDisabled();
  });

  it("merges the bounded realtime window, marks new provider activity, and cleans up", async () => {
    let publish: ((items: readonly CustomerChatMessage[]) => void) | null = null;
    mocks.subscribe.mockImplementation(async (
      _roomId: string,
      onMessages: (items: readonly CustomerChatMessage[]) => void,
    ) => {
      publish = onMessages;
      return mocks.unsubscribe;
    });
    const otherRoom = room({
      id: "provider_request_customer_456",
      context: {
        ...room().context,
        providerRequestId: "provider_request_customer_456",
        providerBusinessName: "Second Provider",
      },
      lastMessage: "Second conversation preview",
      lastMessageAt: "2026-08-22T04:30:00.000Z",
      unreadCount: 1,
    });
    const {unmount} = render(
      <CustomerMessagesClient
        initialFilters={{pageSize: 10, cursor: null}}
        initialPage={roomPage([otherRoom, room({unreadCount: 0})])}
        initialRoom={room({unreadCount: 0})}
        initialMessages={messagePage([message()])}
        initialSelectionError={false}
      />,
    );
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledWith(
      "provider_request_customer_123",
      expect.any(Function),
      expect.any(Function),
    ));

    act(() => publish?.([message()]));
    act(() => publish?.([
      message(),
      message({
        id: "incoming-provider",
        text: "A new provider update",
        createdAt: "2026-08-22T05:00:00.000Z",
      }),
    ]));
    act(() => publish?.([
      message(),
      message({
        id: "incoming-provider",
        text: "A new provider update",
        createdAt: "2026-08-22T05:00:00.000Z",
      }),
    ]));

    expect(await screen.findAllByText("A new provider update")).toHaveLength(2);
    const conversations = screen.getByRole("list", {name: "Provider conversations"});
    const conversationButtons = within(conversations).getAllByRole("button");
    expect(conversationButtons).toHaveLength(2);
    expect(conversationButtons[0]).toHaveAccessibleName(
      "Open conversation with Maria's Catering",
    );
    expect(within(conversationButtons[0]).getByText("A new provider update"))
      .toBeVisible();
    expect(within(conversationButtons[0]).getByRole("time"))
      .toHaveAttribute("datetime", "2026-08-22T05:00:00.000Z");
    expect(within(conversationButtons[1]).getByText("Second conversation preview"))
      .toBeVisible();
    expect(within(screen.getByRole("list", {name: "Conversation messages"}))
      .getAllByText("We can confirm the setup schedule.")).toHaveLength(1);
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith(
      "provider_request_customer_123",
    ));
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    expect(within(conversationButtons[1]).getByLabelText("1 unread messages"))
      .toBeVisible();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("fails unauthorized or nonexistent deep links without leaking details", () => {
    renderWorkspace({selectionError: true});
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That conversation is unavailable or does not belong to your account.",
    );
    expect(document.body).not.toHaveTextContent(/customerId|providerId|Firestore/iu);
  });
});

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return {promise, resolve};
}
