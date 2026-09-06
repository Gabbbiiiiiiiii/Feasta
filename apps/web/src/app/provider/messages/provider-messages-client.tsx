"use client";

import {
  ArrowLeft,
  MessageSquareText,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import {usePathname, useRouter} from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {CursorPagination} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {
  chronologicalChatMessages,
  mergeChatMessages,
} from "@/lib/messaging/message-collection";
import {
  markProviderChatRoomRead,
  PROVIDER_CHAT_MESSAGE_MAX_LENGTH,
  sendProviderChatMessage,
  subscribeToProviderChatMessages,
} from "@/lib/provider/messages/provider-chat-client";
import type {
  ProviderChatMessage,
  ProviderChatMessagePage,
  ProviderChatRoom,
  ProviderChatRoomDetail,
  ProviderChatRoomFilters,
  ProviderChatRoomPage,
} from "@/lib/provider/messages/provider-chat-types";
import {cn} from "@/lib/utils";

import {
  loadProviderChatMessagesAction,
  loadProviderChatRoomAction,
  loadProviderChatRoomsAction,
} from "./actions";

type ProviderMessagesClientProps = {
  initialFilters: ProviderChatRoomFilters;
  initialPage: ProviderChatRoomPage;
  initialRoom: ProviderChatRoomDetail | null;
  initialMessages: ProviderChatMessagePage | null;
  initialSelectionError: boolean;
};

const FIRST_PAGE_CURSOR = "__first_provider_chat_page__";

export function ProviderMessagesClient({
  initialFilters,
  initialPage,
  initialRoom,
  initialMessages,
  initialSelectionError,
}: ProviderMessagesClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const initialMessageItems = chronologicalChatMessages(
    initialMessages?.messages ?? [],
  );
  const [roomPage, setRoomPage] = useState(initialPage);
  const [roomFilters, setRoomFilters] = useState(initialFilters);
  const [roomCursorHistory, setRoomCursorHistory] = useState<string[]>([]);
  const [roomPageNumber, setRoomPageNumber] = useState(1);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState(initialRoom);
  const [messagePage, setMessagePage] = useState<ProviderChatMessagePage | null>(
    initialMessages,
  );
  const [messages, setMessages] = useState(initialMessageItems);
  const messagesRef = useRef(initialMessageItems);
  const messageIdsRef = useRef(new Set(initialMessageItems.map((item) => item.id)));
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(
    initialSelectionError
      ? "That conversation is unavailable or no longer belongs to your business."
      : null,
  );
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(
    initialRoom !== null,
  );
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const readInFlight = useRef(new Set<string>());
  const readQueued = useRef(new Set<string>());
  const unreadOnSubscription = useRef(initialRoom?.unreadCount ?? 0);
  const lastMarkedIncomingMessage = useRef<string | null>(null);
  const messageViewport = useRef<HTMLDivElement | null>(null);
  const shouldScrollToNewest = useRef(initialRoom !== null);

  const replaceMessages = useCallback((next: readonly ProviderChatMessage[]) => {
    const normalized = chronologicalChatMessages(next);
    messagesRef.current = normalized;
    messageIdsRef.current = new Set(normalized.map((item) => item.id));
    setMessages(normalized);
  }, []);

  const mergeIntoMessages = useCallback((incoming: readonly ProviderChatMessage[]) => {
    const merged = mergeChatMessages(messagesRef.current, incoming);
    replaceMessages(merged);
    return merged;
  }, [replaceMessages]);

  const updateRoomPreview = useCallback((
    roomId: string,
    canonicalMessages: readonly ProviderChatMessage[],
  ) => {
    const newestMessage = canonicalMessages.at(-1);
    if (!newestMessage) return;

    const mergePreview = <Room extends ProviderChatRoom>(room: Room): Room => {
      if (
        room.id !== roomId ||
        Date.parse(newestMessage.createdAt) < Date.parse(room.lastMessageAt)
      ) {
        return room;
      }

      if (
        room.lastMessage === newestMessage.text &&
        room.lastMessageAt === newestMessage.createdAt &&
        room.lastMessageFrom === newestMessage.sender
      ) {
        return room;
      }

      return {
        ...room,
        lastMessage: newestMessage.text,
        lastMessageAt: newestMessage.createdAt,
        lastMessageFrom: newestMessage.sender,
      };
    };

    setRoomPage((current) => {
      const matchingRoom = current.rooms.find((room) => room.id === roomId);
      if (!matchingRoom) return current;

      const updatedRoom = mergePreview(matchingRoom);
      if (updatedRoom === matchingRoom) return current;

      return {
        ...current,
        rooms: current.rooms
          .map((room) => room.id === roomId ? updatedRoom : room)
          .sort(compareProviderChatRooms),
      };
    });
    setSelectedRoom((current) => current ? mergePreview(current) : current);
  }, []);

  const updateUnread = useCallback((roomId: string, unreadCount: number) => {
    unreadOnSubscription.current = unreadCount;
    setRoomPage((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === roomId ? {...room, unreadCount} : room,
      ),
    }));
    setSelectedRoom((current) =>
      current?.id === roomId ? {...current, unreadCount} : current,
    );
  }, []);

  const markRoomRead = useCallback(async function markRead(roomId: string) {
    if (readInFlight.current.has(roomId)) {
      readQueued.current.add(roomId);
      return;
    }
    readInFlight.current.add(roomId);
    try {
      await markProviderChatRoomRead(roomId);
      updateUnread(roomId, 0);
    } catch {
      // Reading history remains available if the non-critical counter reset fails.
    } finally {
      readInFlight.current.delete(roomId);
      if (readQueued.current.delete(roomId)) {
        void markRead(roomId);
      }
    }
  }, [updateUnread]);

  useEffect(() => {
    const roomId = selectedRoom?.id;
    if (!roomId) return;

    let active = true;
    let initialized = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeToProviderChatMessages(
      roomId,
      (newestWindow) => {
        if (!active) return;
        const incomingCustomerMessage = initialized
          ? newestWindow.find(
              (message) =>
                message.sender === "customer" &&
                !messageIdsRef.current.has(message.id),
            )
          : null;

        const canonicalMessages = mergeIntoMessages(newestWindow);
        updateRoomPreview(roomId, canonicalMessages);
        shouldScrollToNewest.current = true;
        initialized = true;

        if (
          incomingCustomerMessage &&
          lastMarkedIncomingMessage.current !== incomingCustomerMessage.id
        ) {
          lastMarkedIncomingMessage.current = incomingCustomerMessage.id;
          void markRoomRead(roomId);
        }
      },
      (message) => {
        if (active) setRealtimeError(message);
      },
    )
      .then((stop) => {
        if (active) {
          unsubscribe = stop;
          if (unreadOnSubscription.current > 0) {
            unreadOnSubscription.current = 0;
            void markRoomRead(roomId);
          }
        } else stop();
      })
      .catch(() => {
        if (active) {
          setRealtimeError(
            "Live message updates are unavailable. Use Refresh messages to check again.",
          );
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [markRoomRead, mergeIntoMessages, selectedRoom?.id, updateRoomPreview]);

  useEffect(() => {
    if (!shouldScrollToNewest.current) return;
    shouldScrollToNewest.current = false;
    messageViewport.current?.scrollTo?.({
      top: messageViewport.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const loadRoomPage = async (
    filters: ProviderChatRoomFilters,
    history: string[],
    pageNumber: number,
  ) => {
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const page = await loadProviderChatRoomsAction(filters);
      setRoomPage(page);
      setRoomFilters(filters);
      setRoomCursorHistory(history);
      setRoomPageNumber(pageNumber);
    } catch {
      setRoomsError("Conversations could not be loaded. Please try again.");
    } finally {
      setRoomsLoading(false);
    }
  };

  const openConversation = async (chatRoomId: string) => {
    if (selectionLoading) return;
    setSelectionLoading(true);
    setSelectionError(null);
    setMessagesError(null);
    setRealtimeError(null);
    setSendError(null);
    setSendStatus(null);

    try {
      const [room, page] = await Promise.all([
        loadProviderChatRoomAction(chatRoomId),
        loadProviderChatMessagesAction(chatRoomId, {
          pageSize: 20,
          cursor: null,
        }),
      ]);
      setSelectedRoom(room);
      unreadOnSubscription.current = room.unreadCount;
      setMessagePage(page);
      replaceMessages(page.messages);
      setMobileConversationOpen(true);
      shouldScrollToNewest.current = true;
      router.replace(`${pathname}?room=${encodeURIComponent(room.id)}`, {
        scroll: false,
      });
    } catch {
      setSelectionError(
        "That conversation is unavailable or no longer belongs to your business.",
      );
    } finally {
      setSelectionLoading(false);
    }
  };

  const refreshMessages = async () => {
    if (!selectedRoom) return;
    setMessagesError(null);
    try {
      const page = await loadProviderChatMessagesAction(selectedRoom.id, {
        pageSize: 20,
        cursor: null,
      });
      mergeIntoMessages(page.messages);
      setRealtimeError(null);
      shouldScrollToNewest.current = true;
    } catch {
      setMessagesError("Messages could not be refreshed. Please try again.");
    }
  };

  const loadOlderMessages = async () => {
    if (!selectedRoom || !messagePage?.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setMessagesError(null);
    try {
      const page = await loadProviderChatMessagesAction(selectedRoom.id, {
        pageSize: 20,
        cursor: messagePage.nextCursor,
      });
      mergeIntoMessages(page.messages);
      setMessagePage(page);
    } catch {
      setMessagesError("Older messages could not be loaded. Please try again.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRoom?.canSendMessages || sending) return;
    const normalized = composer.trim();
    if (
      normalized.length === 0 ||
      normalized.length > PROVIDER_CHAT_MESSAGE_MAX_LENGTH
    ) return;

    setSending(true);
    setSendError(null);
    setSendStatus(null);
    try {
      await sendProviderChatMessage(selectedRoom.id, normalized);
      setComposer("");
      setSendStatus("Message sent.");
      shouldScrollToNewest.current = true;
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "The message could not be sent. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const previousRoomCursor = roomCursorHistory.at(-1) ?? null;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Communication"
        title="Messages"
        description="Communicate with customers about your active FEASTA event requests."
      />

      {selectionError ? (
        <p
          className="rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-sm font-medium"
          role="alert"
        >
          {selectionError}
        </p>
      ) : null}

      <section
        className="grid min-h-[36rem] min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card lg:h-[calc(100dvh-13rem)] lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]"
        aria-label="Provider messaging workspace"
      >
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col border-border lg:flex lg:border-r",
            mobileConversationOpen ? "hidden" : "flex",
          )}
        >
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 className="font-black">Conversations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Customer discussions connected to your event requests.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={roomsLoading}>
            {roomsError ? (
              <div className="grid justify-items-center gap-3 px-5 py-12 text-center" role="alert">
                <p className="text-sm font-semibold text-destructive">{roomsError}</p>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => void loadRoomPage(roomFilters, roomCursorHistory, roomPageNumber)}
                >
                  Try again
                </Button>
              </div>
            ) : roomPage.rooms.length === 0 ? (
              <EmptyConversations />
            ) : (
              <ul aria-label="Customer conversations" className="divide-y divide-border">
                {roomPage.rooms.map((room) => (
                  <li key={room.id}>
                    <ConversationButton
                      room={room}
                      selected={selectedRoom?.id === room.id}
                      loading={selectionLoading}
                      onSelect={() => void openConversation(room.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {roomPage.rooms.length > 0 ? (
            <div className="border-t border-border p-4">
              <CursorPagination
                previousCursor={previousRoomCursor}
                nextCursor={roomPage.nextCursor}
                loading={roomsLoading}
                pageLabel={`Conversation page ${roomPageNumber}`}
                onPrevious={(cursor) => {
                  const history = roomCursorHistory.slice(0, -1);
                  void loadRoomPage(
                    {
                      ...roomFilters,
                      cursor: cursor === FIRST_PAGE_CURSOR ? null : cursor,
                    },
                    history,
                    Math.max(1, roomPageNumber - 1),
                  );
                }}
                onNext={(cursor) => {
                  void loadRoomPage(
                    {...roomFilters, cursor},
                    [
                      ...roomCursorHistory,
                      roomFilters.cursor ?? FIRST_PAGE_CURSOR,
                    ],
                    roomPageNumber + 1,
                  );
                }}
              />
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-col",
            mobileConversationOpen ? "flex" : "hidden lg:flex",
          )}
        >
          {selectedRoom ? (
            <>
              <ConversationHeader
                room={selectedRoom}
                onBack={() => {
                  setMobileConversationOpen(false);
                  router.replace(pathname, {scroll: false});
                }}
              />

              <div
                ref={messageViewport}
                className="min-h-0 flex-1 overflow-y-auto bg-muted/25 px-4 py-5 sm:px-6"
                aria-label={`Messages with ${selectedRoom.context.customerDisplayName}`}
              >
                <div className="mx-auto grid max-w-3xl gap-4">
                  {messagePage?.nextCursor ? (
                    <Button
                      variant="secondary"
                      size="compact"
                      className="mx-auto"
                      disabled={loadingOlder}
                      onClick={() => void loadOlderMessages()}
                    >
                      {loadingOlder ? "Loading older messages" : "Load older messages"}
                    </Button>
                  ) : null}

                  {messagesError ? (
                    <p role="alert" className="text-center text-sm font-semibold text-destructive">
                      {messagesError}
                    </p>
                  ) : null}

                  {messages.length === 0 ? (
                    <div className="grid justify-items-center gap-2 py-16 text-center">
                      <MessageSquareText aria-hidden="true" className="size-8 text-muted-foreground" />
                      <h3 className="font-black">No messages yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Start the conversation when you need to clarify event details.
                      </p>
                    </div>
                  ) : (
                    <ol className="grid gap-4" aria-label="Conversation messages">
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          customerName={selectedRoom.context.customerDisplayName}
                        />
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              <div className="border-t border-border bg-card p-4 sm:p-5">
                {realtimeError ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm" role="status">
                    <span>{realtimeError}</span>
                    <Button
                      variant="ghost"
                      size="compact"
                      onClick={() => void refreshMessages()}
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                      Refresh messages
                    </Button>
                  </div>
                ) : null}
                <MessageComposer
                  room={selectedRoom}
                  value={composer}
                  sending={sending}
                  sendStatus={sendStatus}
                  sendError={sendError}
                  onChange={(value) => {
                    setComposer(value);
                    setSendError(null);
                    setSendStatus(null);
                  }}
                  onSubmit={sendMessage}
                />
              </div>
            </>
          ) : (
            <div className="hidden min-h-full place-content-center justify-items-center gap-3 p-8 text-center lg:grid">
              <span className="inline-flex size-16 items-center justify-center rounded-full bg-secondary">
                <MessageSquareText aria-hidden="true" className="size-8 text-primary" />
              </span>
              <h2 className="text-xl font-black">Select a conversation</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Choose a customer conversation to review messages and event context.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ConversationButton({
  room,
  selected,
  loading,
  onSelect,
}: {
  room: ProviderChatRoom;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid w-full min-w-0 gap-3 px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5",
        selected ? "bg-primary/10" : "hover:bg-secondary/70",
      )}
      aria-current={selected ? "true" : undefined}
      aria-label={`Open conversation with ${room.context.customerDisplayName}${room.unreadCount > 0 ? `, ${room.unreadCount} unread messages` : ""}`}
      disabled={loading}
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-bold">
            {room.context.customerDisplayName}
          </span>
          <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">
            {eventSummary(room)}
          </span>
        </span>
        {room.unreadCount > 0 ? (
          <span
            className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-2 py-1 text-xs font-black text-primary-foreground"
            aria-label={`${room.unreadCount} unread messages`}
          >
            {room.unreadCount > 99 ? "99+" : room.unreadCount}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-end justify-between gap-3">
        <span className={cn(
          "min-w-0 flex-1 truncate text-sm",
          room.unreadCount > 0 ? "font-bold text-foreground" : "text-muted-foreground",
        )}>
          {room.lastMessage || "No messages yet"}
        </span>
        <time
          dateTime={room.lastMessageAt}
          className="shrink-0 text-xs font-medium text-muted-foreground"
        >
          {formatConversationTime(room.lastMessageAt)}
        </time>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <Badge tone={room.canSendMessages ? "success" : "neutral"} className="max-w-44 text-xs">
          {formatStatus(room.context.requestStatus)}
        </Badge>
        <span className="truncate text-xs text-muted-foreground">
          {room.context.serviceSummary}
        </span>
      </span>
    </button>
  );
}

function ConversationHeader({
  room,
  onBack,
}: {
  room: ProviderChatRoomDetail;
  onBack: () => void;
}) {
  return (
    <header className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        aria-label="Back to conversations"
        onClick={onBack}
      >
        <ArrowLeft aria-hidden="true" />
      </Button>
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
        <UserRound aria-hidden="true" className="size-5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-black">{room.context.customerDisplayName}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{eventSummary(room)}</span>
          <span>{room.context.serviceSummary}</span>
        </p>
      </div>
      <Badge tone={room.canSendMessages ? "success" : "neutral"} className="hidden shrink-0 sm:inline-flex">
        {room.canSendMessages ? "Messaging available" : "Read only"}
      </Badge>
    </header>
  );
}

function MessageBubble({
  message,
  customerName,
}: {
  message: ProviderChatMessage;
  customerName: string;
}) {
  const providerMessage = message.sender === "provider";
  const senderLabel = providerMessage ? "You" : customerName;
  return (
    <li className={cn("flex", providerMessage ? "justify-end" : "justify-start")}>
      <article
        className={cn(
          "max-w-[88%] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[75%]",
          providerMessage
            ? "border-primary/25 bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground",
        )}
        aria-label={`Message from ${senderLabel}`}
      >
        <p className={cn(
          "text-xs font-bold",
          providerMessage ? "text-primary-foreground/85" : "text-muted-foreground",
        )}>
          {senderLabel}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
          {message.text}
        </p>
        <time
          dateTime={message.createdAt}
          className={cn(
            "mt-2 block text-right text-[0.6875rem]",
            providerMessage ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {formatMessageTime(message.createdAt)}
        </time>
      </article>
    </li>
  );
}

function MessageComposer({
  room,
  value,
  sending,
  sendStatus,
  sendError,
  onChange,
  onSubmit,
}: {
  room: ProviderChatRoomDetail;
  value: string;
  sending: boolean;
  sendStatus: string | null;
  sendError: string | null;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const normalizedLength = value.trim().length;
  const disabled = !room.canSendMessages;
  return (
    <form className="grid gap-2" onSubmit={onSubmit}>
      <label htmlFor="provider-chat-message" className="font-bold">
        Message customer
      </label>
      {disabled ? (
        <p id="provider-chat-lifecycle-message" className="text-sm text-muted-foreground">
          This conversation is read-only because messaging is no longer available for this event.
        </p>
      ) : null}
      <div className="flex min-w-0 items-end gap-2">
        <Textarea
          id="provider-chat-message"
          value={value}
          maxLength={PROVIDER_CHAT_MESSAGE_MAX_LENGTH}
          rows={2}
          className="min-h-20 resize-none"
          placeholder="Write a message about the event…"
          disabled={disabled || sending}
          aria-describedby={disabled ? "provider-chat-lifecycle-message provider-chat-character-count" : "provider-chat-character-count"}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          className="mb-1 shrink-0"
          aria-label="Send message"
          disabled={
            disabled ||
            sending ||
            normalizedLength === 0 ||
            normalizedLength > PROVIDER_CHAT_MESSAGE_MAX_LENGTH
          }
        >
          <Send aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p id="provider-chat-character-count" className="text-muted-foreground">
          {value.length.toLocaleString("en-PH")} / {PROVIDER_CHAT_MESSAGE_MAX_LENGTH.toLocaleString("en-PH")} characters
        </p>
        <p aria-live="polite" role="status" className={sendError ? "font-semibold text-destructive" : "text-muted-foreground"}>
          {sending ? "Sending message…" : sendError ?? sendStatus ?? ""}
        </p>
      </div>
    </form>
  );
}

function EmptyConversations() {
  return (
    <div className="grid justify-items-center gap-3 px-5 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary">
        <MessageSquareText aria-hidden="true" className="size-7 text-muted-foreground" />
      </span>
      <h3 className="font-black">No conversations yet</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Customer conversations for eligible FEASTA event requests will appear here.
      </p>
    </div>
  );
}

function eventSummary(room: ProviderChatRoom): string {
  const eventType = room.context.eventType
    ? formatStatus(room.context.eventType)
    : "FEASTA event";
  return room.context.eventDate
    ? `${eventType} · ${formatEventDate(room.context.eventDate)}`
    : eventType;
}

function formatStatus(value: string | null): string {
  if (!value) return "Status unavailable";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatEventDate(value: string): string {
  return formatDate(value, {dateStyle: "medium"});
}

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return formatDate(value, sameDay
    ? {hour: "numeric", minute: "2-digit"}
    : {month: "short", day: "numeric"});
}

function formatMessageTime(value: string): string {
  return formatDate(value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function compareProviderChatRooms(
  left: ProviderChatRoom,
  right: ProviderChatRoom,
): number {
  const time = Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt);
  if (time !== 0) return time;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "Asia/Manila",
  }).format(date);
}
