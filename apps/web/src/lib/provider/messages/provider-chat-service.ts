import "server-only";

import {
  FieldPath,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  MAIN_EVENT_STATUSES,
  PROVIDER_REQUEST_STATUSES,
  PROVIDER_REQUEST_TYPES,
  type MainEventStatus,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "@feasta/shared-types";

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {normalizeChatMessage} from "@/lib/messaging/message-normalization";

import type {
  ProviderChatMessage,
  ProviderChatMessageFilters,
  ProviderChatMessagePage,
  ProviderChatRoom,
  ProviderChatRoomDetail,
  ProviderChatRoomFilters,
  ProviderChatRoomPage,
} from "./provider-chat-types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 30;
const MAX_RELATION_REQUESTS = 30;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const CUSTOMER_NAME_FALLBACK = "FEASTA customer";
const CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES = new Set<ProviderRequestStatus>([
  "pending",
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
]);
const CHAT_ELIGIBLE_MAIN_EVENT_STATUSES = new Set<MainEventStatus>([
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
]);

type PageCursor = {
  scope: string;
  milliseconds: number;
  documentId: string;
};

type RoomRelationship = {
  providerRequestId: string | null;
  mainEventId: string;
  customerId: string;
  providerOwnerId: string;
  requestType: ProviderRequestType | null;
  requestStatus: ProviderRequestStatus | null;
  mainEventStatus: MainEventStatus | null;
  customerDisplayName: string;
  eventType: string | null;
  eventDate: string | null;
  serviceSummary: string;
  isLegacy: boolean;
};

export async function getProviderChatRoomPage(
  input: Partial<ProviderChatRoomFilters> = {},
): Promise<ProviderChatRoomPage> {
  const account = await requireApprovedProvider();
  const providerId = requireDocumentId(account.providerId);
  const pageSize = normalizePageSize(input.pageSize);
  const cursor = decodeCursor(input.cursor, "provider-rooms");
  let query = adminDb
    .collection("chatRooms")
    .where("providerId", "==", providerId)
    .where("isActive", "==", true)
    .orderBy("lastMessageAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.milliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const hasMore = snapshot.docs.length > pageSize;
  const documents = hasMore
    ? snapshot.docs.slice(0, pageSize)
    : snapshot.docs;
  const rooms: ProviderChatRoom[] = [];
  let skippedMalformedCount = 0;

  for (const document of documents) {
    const room = await mapProviderRoom(
      document,
      providerId,
      account.uid,
    );

    if (room) rooms.push(room);
    else skippedMalformedCount += 1;
  }

  const lastDocument = documents.at(-1) ?? null;
  const nextCursor = hasMore && lastDocument
    ? encodeCursor(
        lastDocument,
        "lastMessageAt",
        "provider-rooms",
      )
    : null;

  return {
    rooms,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount,
  };
}

export async function getProviderChatRoom(
  chatRoomId: string,
): Promise<ProviderChatRoomDetail> {
  const account = await requireApprovedProvider();
  const providerId = requireDocumentId(account.providerId);
  const roomId = requireDocumentId(chatRoomId);
  const snapshot = await adminDb
    .collection("chatRooms")
    .doc(roomId)
    .get();
  const room = await mapProviderRoom(
    snapshot,
    providerId,
    account.uid,
  );

  if (!room) throw unavailableRoom();
  return room;
}

export async function getProviderChatMessages(
  chatRoomId: string,
  input: Partial<ProviderChatMessageFilters> = {},
): Promise<ProviderChatMessagePage> {
  const account = await requireApprovedProvider();
  const providerId = requireDocumentId(account.providerId);
  const roomId = requireDocumentId(chatRoomId);
  const roomSnapshot = await adminDb
    .collection("chatRooms")
    .doc(roomId)
    .get();
  const relationship = await resolveRoomRelationship(
    roomSnapshot,
    providerId,
    account.uid,
  );

  if (!relationship) throw unavailableRoom();

  const pageSize = normalizePageSize(input.pageSize);
  const cursor = decodeCursor(
    input.cursor,
    `messages:${roomId}`,
  );
  let query = roomSnapshot.ref
    .collection("messages")
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.milliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const hasMore = snapshot.docs.length > pageSize;
  const documents = hasMore
    ? snapshot.docs.slice(0, pageSize)
    : snapshot.docs;
  const messages: ProviderChatMessage[] = [];
  let skippedMalformedCount = 0;

  for (const document of documents) {
    const message = normalizeChatMessage({
      id: document.id,
      chatRoomId: roomId,
      data: document.data(),
      expectedSenderIds: {
        customer: relationship.customerId,
        provider: relationship.providerOwnerId,
      },
    });
    if (message) messages.push(message);
    else skippedMalformedCount += 1;
  }

  const lastDocument = documents.at(-1) ?? null;
  const nextCursor = hasMore && lastDocument
    ? encodeCursor(
        lastDocument,
        "createdAt",
        `messages:${roomId}`,
      )
    : null;

  return {
    chatRoomId: roomId,
    messages,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount,
  };
}

async function mapProviderRoom(
  snapshot: DocumentSnapshot<DocumentData>,
  expectedProviderId: string,
  providerOwnerId: string,
): Promise<ProviderChatRoom | null> {
  const data = snapshot.data() ?? {};
  const relationship = await resolveRoomRelationship(
    snapshot,
    expectedProviderId,
    providerOwnerId,
  );
  const lastMessage = optionalText(data.lastMessage, 4_000);
  const lastMessageAt = timestampIso(data.lastMessageAt);
  const createdAt = timestampIso(data.createdAt);
  const updatedAt = nullableTimestampIso(data.updatedAt);
  const unreadCount = nonNegativeInteger(
    data.unreadCountProvider,
  );

  if (
    !relationship ||
    lastMessage === null ||
    !lastMessageAt ||
    !createdAt ||
    updatedAt === undefined ||
    unreadCount === null ||
    typeof data.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    context: {
      providerRequestId:
        relationship.providerRequestId,
      mainEventId: relationship.mainEventId,
      requestType: relationship.requestType,
      requestStatus: relationship.requestStatus,
      customerDisplayName:
        relationship.customerDisplayName,
      eventType: relationship.eventType,
      eventDate: relationship.eventDate,
      serviceSummary:
        relationship.serviceSummary,
    },
    lastMessage,
    lastMessageAt,
    lastMessageFrom:
      data.lastMessageSenderId ===
        relationship.customerId
        ? "customer"
        : data.lastMessageSenderId ===
            relationship.providerOwnerId
          ? "provider"
          : null,
    unreadCount,
    isActive: data.isActive,
    canSendMessages:
      data.isActive &&
      isChatLifecycleEligible(
        relationship.requestStatus,
        relationship.mainEventStatus,
      ),
    isLegacy: relationship.isLegacy,
    createdAt,
    updatedAt,
  };
}

async function resolveRoomRelationship(
  snapshot: DocumentSnapshot<DocumentData>,
  expectedProviderId: string,
  expectedProviderOwnerId: string,
): Promise<RoomRelationship | null> {
  if (!snapshot.exists) return null;
  const room = snapshot.data() ?? {};
  const providerId = optionalDocumentId(room.providerId);
  const customerId = optionalDocumentId(room.customerId);
  const mainEventId = optionalDocumentId(
    room.mainEventId ?? room.bookingId,
  );
  const providerRequestId = optionalDocumentId(
    room.providerRequestId,
  );

  if (
    providerId !== expectedProviderId ||
    !customerId ||
    !mainEventId ||
    (room.providerOwnerId !== undefined &&
      room.providerOwnerId !==
        expectedProviderOwnerId)
  ) {
    return null;
  }

  const mainEventSnapshot = await adminDb
    .collection("mainEvents")
    .doc(mainEventId)
    .get();
  const mainEvent = mainEventSnapshot.data() ?? {};

  if (
    !mainEventSnapshot.exists ||
    mainEvent.customerId !== customerId
  ) {
    return resolveLegacyBookingRelationship(
      room,
      mainEventId,
      customerId,
      providerId,
      expectedProviderOwnerId,
    );
  }

  const requestSnapshot = providerRequestId
    ? await adminDb
        .collection("providerRequests")
        .doc(providerRequestId)
        .get()
    : await matchingLegacyRequest(
        mainEvent,
        mainEventId,
        customerId,
        providerId,
      );
  const request = requestSnapshot?.data() ?? null;

  if (requestSnapshot?.exists && request) {
    if (
      request.customerId !== customerId ||
      request.providerId !== providerId ||
      (request.mainEventId ?? request.bookingId) !==
        mainEventId ||
      (providerRequestId &&
        snapshot.id !== providerRequestId)
    ) {
      return null;
    }

    return {
      providerRequestId: requestSnapshot.id,
      mainEventId,
      customerId,
      providerOwnerId: expectedProviderOwnerId,
      requestType: requestType(request.type),
      requestStatus:
        requestStatus(request.status),
      mainEventStatus:
        mainEventStatus(mainEvent.status),
      customerDisplayName:
        personName(request) ??
        personName(room) ??
        CUSTOMER_NAME_FALLBACK,
      eventType:
        optionalText(
          request.eventType ?? mainEvent.eventType,
          120,
        ),
      eventDate:
        timestampIso(
          request.eventDate ?? mainEvent.eventDate,
        ),
      serviceSummary:
        serviceSummary(request),
      isLegacy: !providerRequestId,
    };
  }

  if (
    providerRequestId ||
    mainEvent.providerId !== providerId
  ) {
    return null;
  }

  const lifecycle = legacyLifecycle(mainEvent.status);

  return {
    providerRequestId: null,
    mainEventId,
    customerId,
    providerOwnerId: expectedProviderOwnerId,
    requestType: null,
    requestStatus: lifecycle.requestStatus,
    mainEventStatus: lifecycle.mainEventStatus,
    customerDisplayName:
      personName(room) ??
      personName(mainEvent) ??
      CUSTOMER_NAME_FALLBACK,
    eventType: optionalText(mainEvent.eventType, 120),
    eventDate: timestampIso(mainEvent.eventDate),
    serviceSummary:
      optionalText(mainEvent.packageName, 160) ??
      "Event service",
    isLegacy: true,
  };
}

async function matchingLegacyRequest(
  mainEvent: DocumentData,
  mainEventId: string,
  customerId: string,
  providerId: string,
): Promise<DocumentSnapshot<DocumentData> | null> {
  const ids = documentIdArray(
    mainEvent.providerRequestIds,
  ).slice(0, MAX_RELATION_REQUESTS);

  if (ids.length === 0) return null;
  const snapshots = await adminDb.getAll(
    ...ids.map((id) =>
      adminDb.collection("providerRequests").doc(id),
    ),
  );
  const matches = snapshots.filter((snapshot) => {
    const data = snapshot.data() ?? {};
    return snapshot.exists &&
      data.customerId === customerId &&
      data.providerId === providerId &&
      (data.mainEventId ?? data.bookingId) ===
        mainEventId;
  });

  return matches.length === 1
    ? matches[0]
    : null;
}

async function resolveLegacyBookingRelationship(
  room: DocumentData,
  bookingId: string,
  customerId: string,
  providerId: string,
  providerOwnerId: string,
): Promise<RoomRelationship | null> {
  if (room.providerRequestId !== undefined) return null;
  const snapshot = await adminDb
    .collection("bookings")
    .doc(bookingId)
    .get();
  const booking = snapshot.data() ?? {};

  if (
    !snapshot.exists ||
    booking.customerId !== customerId ||
    booking.providerId !== providerId
  ) {
    return null;
  }

  const lifecycle = legacyLifecycle(booking.status);

  return {
    providerRequestId: null,
    mainEventId: bookingId,
    customerId,
    providerOwnerId,
    requestType: null,
    requestStatus: lifecycle.requestStatus,
    mainEventStatus: lifecycle.mainEventStatus,
    customerDisplayName:
      personName(room) ??
      personName(booking) ??
      CUSTOMER_NAME_FALLBACK,
    eventType: optionalText(booking.eventType, 120),
    eventDate: timestampIso(booking.eventDate),
    serviceSummary:
      optionalText(booking.packageName, 160) ??
      "Event service",
    isLegacy: true,
  };
}

function serviceSummary(data: DocumentData): string {
  const packageName = optionalText(data.packageName, 160);
  if (packageName) return packageName;
  if (!Array.isArray(data.services)) return "Event service";
  const names = data.services.slice(0, 3).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const name = optionalText(
      (entry as Record<string, unknown>).name,
      100,
    );
    return name ? [name] : [];
  });
  return names.length > 0
    ? names.join(", ")
    : "Event service";
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
  timestampField: string,
  scope: string,
): string | null {
  const date = dateValue(document.data()[timestampField]);
  if (!date) return null;
  const payload: PageCursor = {
    scope,
    milliseconds: date.getTime(),
    documentId: document.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url");
}

function decodeCursor(
  value: unknown,
  scope: string,
): PageCursor | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PageCursor>;
    if (
      parsed.scope !== scope ||
      typeof parsed.milliseconds !== "number" ||
      !Number.isFinite(parsed.milliseconds) ||
      typeof parsed.documentId !== "string" ||
      !SAFE_DOCUMENT_ID.test(parsed.documentId)
    ) {
      return null;
    }
    return parsed as PageCursor;
  } catch {
    return null;
  }
}

function normalizePageSize(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? Math.min(value, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

function requireDocumentId(value: unknown): string {
  const id = optionalDocumentId(value);
  if (!id) throw unavailableRoom();
  return id;
}

function optionalDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_DOCUMENT_ID.test(normalized)
    ? normalized
    : null;
}

function documentIdArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const id = optionalDocumentId(entry);
        return id ? [id] : [];
      })
    : [];
}

function personName(data: DocumentData): string | null {
  const name = [
    optionalText(
      data.customerFirstName ?? data.firstName,
      80,
    ),
    optionalText(
      data.customerLastName ?? data.lastName,
      80,
    ),
  ].filter(Boolean).join(" ");
  return name ||
    optionalText(data.customerDisplayName, 160);
}

function requestType(value: unknown): ProviderRequestType | null {
  return typeof value === "string" &&
    (PROVIDER_REQUEST_TYPES as readonly string[]).includes(value)
    ? value as ProviderRequestType
    : null;
}

function requestStatus(value: unknown): ProviderRequestStatus | null {
  if (value === "waiting_payment") {
    return "waiting_for_down_payment";
  }
  return typeof value === "string" &&
    (PROVIDER_REQUEST_STATUSES as readonly string[]).includes(value)
    ? value as ProviderRequestStatus
    : null;
}

function mainEventStatus(value: unknown): MainEventStatus | null {
  return typeof value === "string" &&
    (MAIN_EVENT_STATUSES as readonly string[]).includes(value)
    ? value as MainEventStatus
    : null;
}

function legacyLifecycle(value: unknown): {
  requestStatus: ProviderRequestStatus | null;
  mainEventStatus: MainEventStatus | null;
} {
  if (typeof value !== "string") {
    return {requestStatus: null, mainEventStatus: null};
  }

  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  const mapping: Partial<Record<string, {
    requestStatus: ProviderRequestStatus;
    mainEventStatus: MainEventStatus;
  }>> = {
    pending: {
      requestStatus: "pending",
      mainEventStatus: "pending_provider_approval",
    },
    pending_provider_approval: {
      requestStatus: "pending",
      mainEventStatus: "pending_provider_approval",
    },
    accepted: {
      requestStatus: "accepted",
      mainEventStatus: "pending_provider_approval",
    },
    waiting_payment: {
      requestStatus: "waiting_for_down_payment",
      mainEventStatus: "waiting_for_down_payment",
    },
    waiting_for_down_payment: {
      requestStatus: "waiting_for_down_payment",
      mainEventStatus: "waiting_for_down_payment",
    },
    payment_processing: {
      requestStatus: "payment_processing",
      mainEventStatus: "waiting_for_down_payment",
    },
    confirmed: {
      requestStatus: "confirmed",
      mainEventStatus: "confirmed",
    },
    in_progress: {
      requestStatus: "in_progress",
      mainEventStatus: "in_progress",
    },
    completed: {
      requestStatus: "completed",
      mainEventStatus: "completed",
    },
    rejected: {
      requestStatus: "rejected",
      mainEventStatus: "needs_provider_replacement",
    },
    cancelled: {
      requestStatus: "cancelled",
      mainEventStatus: "cancelled",
    },
    expired: {
      requestStatus: "expired",
      mainEventStatus: "expired",
    },
  };

  return mapping[normalized] ?? {
    requestStatus: null,
    mainEventStatus: null,
  };
}

function isChatLifecycleEligible(
  providerRequestStatus: ProviderRequestStatus | null,
  eventStatus: MainEventStatus | null,
): boolean {
  return providerRequestStatus !== null &&
    eventStatus !== null &&
    CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES.has(providerRequestStatus) &&
    CHAT_ELIGIBLE_MAIN_EVENT_STATUSES.has(eventStatus);
}

function optionalText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length <= maximumLength
    ? normalized
    : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date &&
      Number.isFinite(result.getTime())
      ? result
      : null;
  }
  return null;
}

function timestampIso(value: unknown): string | null {
  return dateValue(value)?.toISOString() ?? null;
}

function nullableTimestampIso(
  value: unknown,
): string | null | undefined {
  if (value === null || value === undefined) return null;
  return timestampIso(value) ?? undefined;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function unavailableRoom(): Error {
  return new Error("The provider conversation is unavailable.");
}
