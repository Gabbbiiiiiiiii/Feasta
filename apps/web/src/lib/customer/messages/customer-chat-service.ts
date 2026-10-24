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

import {
  requireCustomer,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {isChatLifecycleEligible} from "@/lib/messaging/chat-lifecycle";
import {normalizeChatMessage} from "@/lib/messaging/message-normalization";

import type {
  CustomerChatMessage,
  CustomerChatMessageFilters,
  CustomerChatMessagePage,
  CustomerChatRoom,
  CustomerChatRoomDetail,
  CustomerChatRoomFilters,
  CustomerChatRoomPage,
} from "./customer-chat-types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 30;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const PROVIDER_NAME_FALLBACK = "FEASTA provider";

type PageCursor = {
  scope: string;
  milliseconds: number;
  documentId: string;
};

type CanonicalRelationship = {
  providerRequestId: string;
  mainEventId: string;
  customerId: string;
  providerId: string;
  providerOwnerId: string;
  providerBusinessName: string;
  requestType: ProviderRequestType | null;
  requestStatus: ProviderRequestStatus | null;
  mainEventStatus: MainEventStatus | null;
  eventType: string | null;
  eventDate: string | null;
  serviceSummary: string;
};

type RelationshipDocuments = {
  requests: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  events: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  providers: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
};

export async function getCustomerChatRoomPage(
  input: Partial<CustomerChatRoomFilters> = {},
): Promise<CustomerChatRoomPage> {
  const customer = requireVerifiedEmail(await requireCustomer());
  const customerId = requireDocumentId(customer.uid);
  const pageSize = normalizePageSize(input.pageSize);
  const cursor = decodeCursor(input.cursor, "customer-rooms");
  let roomQuery = adminDb
    .collection("chatRooms")
    .where("customerId", "==", customerId)
    .where("isActive", "==", true)
    .orderBy("lastMessageAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (cursor) {
    roomQuery = roomQuery.startAfter(
      Timestamp.fromMillis(cursor.milliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await roomQuery.limit(pageSize + 1).get();
  const hasMore = snapshot.docs.length > pageSize;
  const documents = hasMore
    ? snapshot.docs.slice(0, pageSize)
    : snapshot.docs;
  const relationships = await loadRelationshipDocuments(documents);
  const rooms: CustomerChatRoom[] = [];
  let skippedMalformedCount = 0;

  for (const document of documents) {
    const room = mapCustomerRoom(document, customerId, relationships);
    if (room) rooms.push(room);
    else skippedMalformedCount += 1;
  }

  const lastDocument = documents.at(-1) ?? null;
  const nextCursor = hasMore && lastDocument
    ? encodeCursor(lastDocument, "lastMessageAt", "customer-rooms")
    : null;

  return {
    rooms,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount,
  };
}

export async function getCustomerChatRoom(
  chatRoomId: string,
): Promise<CustomerChatRoomDetail> {
  const customer = requireVerifiedEmail(await requireCustomer());
  const customerId = requireDocumentId(customer.uid);
  const roomId = requireDocumentId(chatRoomId);
  const snapshot = await adminDb.collection("chatRooms").doc(roomId).get();
  const relationships = await loadRelationshipDocuments([snapshot]);
  const room = mapCustomerRoom(snapshot, customerId, relationships);

  if (!room) throw unavailableRoom();
  return room;
}

export async function getCustomerChatMessages(
  chatRoomId: string,
  input: Partial<CustomerChatMessageFilters> = {},
): Promise<CustomerChatMessagePage> {
  const customer = requireVerifiedEmail(await requireCustomer());
  const customerId = requireDocumentId(customer.uid);
  const roomId = requireDocumentId(chatRoomId);
  const roomSnapshot = await adminDb.collection("chatRooms").doc(roomId).get();
  const documents = await loadRelationshipDocuments([roomSnapshot]);
  const relationship = resolveRelationship(roomSnapshot, customerId, documents);

  if (!relationship) throw unavailableRoom();

  const pageSize = normalizePageSize(input.pageSize);
  const cursor = decodeCursor(input.cursor, `messages:${roomId}`);
  let messageQuery = roomSnapshot.ref
    .collection("messages")
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (cursor) {
    messageQuery = messageQuery.startAfter(
      Timestamp.fromMillis(cursor.milliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await messageQuery.limit(pageSize + 1).get();
  const hasMore = snapshot.docs.length > pageSize;
  const messageDocuments = hasMore
    ? snapshot.docs.slice(0, pageSize)
    : snapshot.docs;
  const messages: CustomerChatMessage[] = [];
  let skippedMalformedCount = 0;

  for (const document of messageDocuments) {
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

  const lastDocument = messageDocuments.at(-1) ?? null;
  const nextCursor = hasMore && lastDocument
    ? encodeCursor(lastDocument, "createdAt", `messages:${roomId}`)
    : null;

  return {
    chatRoomId: roomId,
    messages,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount,
  };
}

async function loadRelationshipDocuments(
  rooms: readonly DocumentSnapshot<DocumentData>[],
): Promise<RelationshipDocuments> {
  const requestIds = new Set<string>();
  const eventIds = new Set<string>();
  const providerIds = new Set<string>();

  for (const room of rooms) {
    const data = room.data() ?? {};
    addDocumentId(requestIds, data.providerRequestId);
    addDocumentId(eventIds, data.mainEventId);
    addDocumentId(providerIds, data.providerId);
  }

  const [requests, events, providers] = await Promise.all([
    loadDocuments("providerRequests", requestIds),
    loadDocuments("mainEvents", eventIds),
    loadDocuments("providers", providerIds),
  ]);

  return {requests, events, providers};
}

async function loadDocuments(
  collection: string,
  ids: ReadonlySet<string>,
): Promise<ReadonlyMap<string, DocumentSnapshot<DocumentData>>> {
  if (ids.size === 0) return new Map();
  const snapshots = await adminDb.getAll(
    ...[...ids].map((id) => adminDb.collection(collection).doc(id)),
  );
  return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
}

function mapCustomerRoom(
  snapshot: DocumentSnapshot<DocumentData>,
  customerId: string,
  documents: RelationshipDocuments,
): CustomerChatRoom | null {
  const data = snapshot.data() ?? {};
  const relationship = resolveRelationship(snapshot, customerId, documents);
  const lastMessage = optionalText(data.lastMessage, 4_000);
  const lastMessageAt = timestampIso(data.lastMessageAt);
  const createdAt = timestampIso(data.createdAt);
  const updatedAt = nullableTimestampIso(data.updatedAt);
  const unreadCount = nonNegativeInteger(data.unreadCountCustomer);

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
      providerRequestId: relationship.providerRequestId,
      mainEventId: relationship.mainEventId,
      requestType: relationship.requestType,
      requestStatus: relationship.requestStatus,
      providerBusinessName: relationship.providerBusinessName,
      eventType: relationship.eventType,
      eventDate: relationship.eventDate,
      serviceSummary: relationship.serviceSummary,
    },
    lastMessage,
    lastMessageAt,
    lastMessageFrom: data.lastMessageSenderId === relationship.customerId
      ? "customer"
      : data.lastMessageSenderId === relationship.providerOwnerId
        ? "provider"
        : null,
    unreadCount,
    isActive: data.isActive,
    canSendMessages: data.isActive && isChatLifecycleEligible(
      relationship.requestStatus,
      relationship.mainEventStatus,
    ),
    createdAt,
    updatedAt,
  };
}

function resolveRelationship(
  snapshot: DocumentSnapshot<DocumentData>,
  expectedCustomerId: string,
  documents: RelationshipDocuments,
): CanonicalRelationship | null {
  if (!snapshot.exists) return null;
  const room = snapshot.data() ?? {};
  const customerId = optionalDocumentId(room.customerId);
  const providerId = optionalDocumentId(room.providerId);
  const providerOwnerId = optionalDocumentId(room.providerOwnerId);
  const providerRequestId = optionalDocumentId(room.providerRequestId);
  const mainEventId = optionalDocumentId(room.mainEventId);

  if (
    customerId !== expectedCustomerId ||
    !providerId ||
    !providerOwnerId ||
    !providerRequestId ||
    providerRequestId !== snapshot.id ||
    !mainEventId
  ) {
    return null;
  }

  const requestSnapshot = documents.requests.get(providerRequestId);
  const eventSnapshot = documents.events.get(mainEventId);
  const providerSnapshot = documents.providers.get(providerId);
  const request = requestSnapshot?.data() ?? {};
  const event = eventSnapshot?.data() ?? {};
  const provider = providerSnapshot?.data() ?? {};
  const storedRequestId = optionalDocumentId(request.providerRequestId);

  if (
    !requestSnapshot?.exists ||
    !eventSnapshot?.exists ||
    !providerSnapshot?.exists ||
    (storedRequestId !== null && storedRequestId !== providerRequestId) ||
    request.customerId !== customerId ||
    request.providerId !== providerId ||
    (request.mainEventId ?? request.bookingId) !== mainEventId ||
    event.customerId !== customerId ||
    !Array.isArray(event.providerRequestIds) ||
    !event.providerRequestIds.includes(providerRequestId) ||
    provider.ownerId !== providerOwnerId
  ) {
    return null;
  }

  return {
    providerRequestId,
    mainEventId,
    customerId,
    providerId,
    providerOwnerId,
    providerBusinessName:
      optionalText(provider.businessName, 160) ??
      optionalText(request.providerBusinessName, 160) ??
      PROVIDER_NAME_FALLBACK,
    requestType: requestType(request.type),
    requestStatus: requestStatus(request.status),
    mainEventStatus: mainEventStatus(event.status),
    eventType: optionalText(request.eventType ?? event.eventType, 120),
    eventDate: timestampIso(request.eventDate ?? event.eventDate),
    serviceSummary: serviceSummary(request),
  };
}

function serviceSummary(data: DocumentData): string {
  const packageName = optionalText(data.packageName, 160);
  if (packageName) return packageName;
  if (!Array.isArray(data.services)) return "Event service";
  const names = data.services.slice(0, 3).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const name = optionalText(
      (entry as Record<string, unknown>).name,
      100,
    );
    return name ? [name] : [];
  });
  return names.length > 0 ? names.join(", ") : "Event service";
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
  timestampField: string,
  scope: string,
): string | null {
  const date = dateValue(document.data()[timestampField]);
  if (!date) return null;
  return Buffer.from(JSON.stringify({
    scope,
    milliseconds: date.getTime(),
    documentId: document.id,
  } satisfies PageCursor), "utf8").toString("base64url");
}

function decodeCursor(value: unknown, scope: string): PageCursor | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PageCursor>;
    return parsed.scope === scope &&
      typeof parsed.milliseconds === "number" &&
      Number.isFinite(parsed.milliseconds) &&
      typeof parsed.documentId === "string" &&
      SAFE_DOCUMENT_ID.test(parsed.documentId)
      ? parsed as PageCursor
      : null;
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
  return SAFE_DOCUMENT_ID.test(normalized) ? normalized : null;
}

function addDocumentId(target: Set<string>, value: unknown): void {
  const id = optionalDocumentId(value);
  if (id) target.add(id);
}

function requestType(value: unknown): ProviderRequestType | null {
  return typeof value === "string" &&
    (PROVIDER_REQUEST_TYPES as readonly string[]).includes(value)
    ? value as ProviderRequestType
    : null;
}

function requestStatus(value: unknown): ProviderRequestStatus | null {
  const normalized = value === "waiting_payment"
    ? "waiting_for_down_payment"
    : value;
  return typeof normalized === "string" &&
    (PROVIDER_REQUEST_STATUSES as readonly string[]).includes(normalized)
    ? normalized as ProviderRequestStatus
    : null;
}

function mainEventStatus(value: unknown): MainEventStatus | null {
  return typeof value === "string" &&
    (MAIN_EVENT_STATUSES as readonly string[]).includes(value)
    ? value as MainEventStatus
    : null;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length <= maximumLength ? normalized : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function timestampIso(value: unknown): string | null {
  return dateValue(value)?.toISOString() ?? null;
}

function nullableTimestampIso(value: unknown): string | null | undefined {
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
  return new Error("The customer conversation is unavailable.");
}
