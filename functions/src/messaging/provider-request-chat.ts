import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  isApprovedProviderForOperations,
  parseMainEventStatus,
  parseProviderRequestStatus,
  type MainEventStatus,
  type ProviderRequestStatus,
  type UserRole,
  USER_ROLES,
} from "../shared/constants.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  db,
} from "../shared/firestore.js";
import {
  createNotificationInTransaction,
} from "../shared/notifications.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  logSecurityEvent,
} from "../shared/security-events.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  assertChatLifecycleEligible,
  canonicalChatRoomId,
  CHAT_NOTIFICATION_TYPE,
  validateMarkChatReadInput,
  validateOpenChatInput,
  validateSendChatMessageInput,
} from "./chat-domain.js";

type ChatActor = {
  uid: string;
  role: Extract<UserRole, "customer" | "provider">;
};

type ChatContext = {
  providerRequestId: string | null;
  mainEventId: string;
  customerId: string;
  providerId: string;
  providerOwnerId: string;
  customerDisplayName: string;
  providerBusinessName: string;
  providerRequestStatus: ProviderRequestStatus;
  mainEventStatus: MainEventStatus;
  isLegacy: boolean;
};

type OpenChatResult = {
  chatRoomId: string;
  providerRequestId: string | null;
  mainEventId: string;
  created: boolean;
  isLegacy: boolean;
  isActive: boolean;
};

type SendChatMessageResult = {
  messageId: string;
  chatRoomId: string;
};

const callableOptions = {
  ...appCheckCallableOptions,
  timeoutSeconds: 30,
} as const;

export const openProviderRequestChat = onCall(
  callableOptions,
  async (request): Promise<OpenChatResult> => {
    const authenticated = requireAuth(request);
    const role = await requireRole(
      authenticated.uid,
      [USER_ROLES.customer, USER_ROLES.provider],
    );
    const actor: ChatActor = {
      uid: authenticated.uid,
      role: requireChatRole(role),
    };

    await enforceCallableRateLimit(request, {
      scope: "chat.open",
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const {providerRequestId} =
      validateOpenChatInput(request.data);

    const result = await db.runTransaction(
      async (transaction) => {
        const providerRequestReference = db
          .collection("providerRequests")
          .doc(providerRequestId);
        const providerRequestSnapshot =
          await transaction.get(
            providerRequestReference,
          );

        if (!providerRequestSnapshot.exists) {
          return openExistingLegacyRoom(
            transaction,
            providerRequestId,
            actor,
          );
        }

        const context = await loadCanonicalContext(
          transaction,
          providerRequestSnapshot,
          actor,
        );

        assertChatLifecycleEligible(
          context.providerRequestStatus,
          context.mainEventStatus,
        );

        const canonicalRoomReference = db
          .collection("chatRooms")
          .doc(
            canonicalChatRoomId(
              providerRequestId,
            ),
          );
        const canonicalRoomSnapshot =
          await transaction.get(
            canonicalRoomReference,
          );

        if (canonicalRoomSnapshot.exists) {
          validateRoom(
            canonicalRoomSnapshot,
            context,
            false,
          );
          return roomResult(
            canonicalRoomSnapshot,
            context,
            false,
          );
        }

        const legacyRoomReference = db
          .collection("chatRooms")
          .doc(context.mainEventId);
        const legacyRoomSnapshot =
          await transaction.get(
            legacyRoomReference,
          );

        if (
          legacyRoomSnapshot.exists &&
          legacyRoomMatches(
            legacyRoomSnapshot,
            context,
          )
        ) {
          return roomResult(
            legacyRoomSnapshot,
            {...context, isLegacy: true},
            false,
          );
        }

        transaction.create(
          canonicalRoomReference,
          canonicalRoomData(context),
        );

        return {
          chatRoomId: canonicalRoomReference.id,
          providerRequestId,
          mainEventId: context.mainEventId,
          created: true,
          isLegacy: false,
          isActive: true,
        };
      },
    );

    logSecurityEvent({
      action: "chat_access",
      outcome: "succeeded",
      actorUid: actor.uid,
      targetId: result.chatRoomId,
      metadata: {
        operation: "open",
        created: result.created,
        legacy: result.isLegacy,
      },
    });

    return result;
  },
);

export const sendChatMessage = onCall(
  callableOptions,
  async (request): Promise<SendChatMessageResult> => {
    const authenticated = requireAuth(request);
    const role = await requireRole(
      authenticated.uid,
      [USER_ROLES.customer, USER_ROLES.provider],
    );
    const actor: ChatActor = {
      uid: authenticated.uid,
      role: requireChatRole(role),
    };

    await enforceCallableRateLimit(request, {
      scope: "chat.send",
      limit: 60,
      windowSeconds: 60,
    });

    const {chatRoomId, message} =
      validateSendChatMessageInput(
        request.data,
      );
    const roomReference = db
      .collection("chatRooms")
      .doc(chatRoomId);
    const messageReference = roomReference
      .collection("messages")
      .doc();

    const result = await db.runTransaction(
      async (transaction) => {
        const roomSnapshot = await transaction.get(
          roomReference,
        );

        if (!roomSnapshot.exists) {
          throw unavailableRoom();
        }

        const context = await loadRoomContext(
          transaction,
          roomSnapshot,
          actor,
        );

        assertChatLifecycleEligible(
          context.providerRequestStatus,
          context.mainEventStatus,
        );

        if (roomSnapshot.data()?.isActive !== true) {
          throw new HttpsError(
            "failed-precondition",
            "This conversation is not active.",
          );
        }

        transaction.create(messageReference, {
          chatRoomId,
          senderId: actor.uid,
          senderRole: actor.role,
          message,
          messageType: "text",
          createdAt: serverTimestamp(),
        });

        transaction.update(roomReference, {
          lastMessage: message,
          lastMessageAt: serverTimestamp(),
          lastMessageSenderId: actor.uid,
          updatedAt: serverTimestamp(),
          [recipientCounter(actor.role)]:
            FieldValue.increment(1),
        });

        const recipientId =
          actor.role === USER_ROLES.customer
            ? context.providerOwnerId
            : context.customerId;

        createNotificationInTransaction(
          transaction,
          {
            userId: recipientId,
            title: "New Message",
            message:
              actor.role === USER_ROLES.customer
                ? `${context.customerDisplayName} sent you a message.`
                : `New message from ${context.providerBusinessName}.`,
            type: CHAT_NOTIFICATION_TYPE,
            relatedId: chatRoomId,
            relatedCollection: "chatRooms",
            metadata: {
              providerRequestId:
                context.providerRequestId,
              mainEventId:
                context.mainEventId,
            },
          },
        );

        return {
          messageId: messageReference.id,
          chatRoomId,
        };
      },
    );

    logSecurityEvent({
      action: "chat_access",
      outcome: "succeeded",
      actorUid: actor.uid,
      targetId: chatRoomId,
      metadata: {operation: "send"},
    });

    return result;
  },
);

export const markChatRoomRead = onCall(
  callableOptions,
  async (request) => {
    const authenticated = requireAuth(request);
    const role = await requireRole(
      authenticated.uid,
      [USER_ROLES.customer, USER_ROLES.provider],
    );
    const actor: ChatActor = {
      uid: authenticated.uid,
      role: requireChatRole(role),
    };

    await enforceCallableRateLimit(request, {
      scope: "chat.markRead",
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const {chatRoomId} =
      validateMarkChatReadInput(request.data);
    const roomReference = db
      .collection("chatRooms")
      .doc(chatRoomId);

    const changed = await db.runTransaction(
      async (transaction) => {
        const roomSnapshot = await transaction.get(
          roomReference,
        );

        if (!roomSnapshot.exists) {
          throw unavailableRoom();
        }

        await loadRoomContext(
          transaction,
          roomSnapshot,
          actor,
        );

        const counter = callerCounter(actor.role);
        const current = roomSnapshot.data()?.[counter];

        if (current === 0) return false;

        transaction.update(roomReference, {
          [counter]: 0,
          updatedAt: serverTimestamp(),
        });

        return true;
      },
    );

    return {chatRoomId, changed};
  },
);

async function openExistingLegacyRoom(
  transaction: Transaction,
  legacyRoomId: string,
  actor: ChatActor,
): Promise<OpenChatResult> {
  const roomSnapshot = await transaction.get(
    db.collection("chatRooms").doc(legacyRoomId),
  );

  if (!roomSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "The provider request was not found.",
    );
  }

  const context = await loadRoomContext(
    transaction,
    roomSnapshot,
    actor,
  );

  if (!context.isLegacy) {
    throw new HttpsError(
      "failed-precondition",
      "The chat room relationship is invalid.",
    );
  }

  assertChatLifecycleEligible(
    context.providerRequestStatus,
    context.mainEventStatus,
  );

  return roomResult(
    roomSnapshot,
    context,
    false,
  );
}

async function loadRoomContext(
  transaction: Transaction,
  roomSnapshot: DocumentSnapshot<DocumentData>,
  actor: ChatActor,
): Promise<ChatContext> {
  const room = roomSnapshot.data() ?? {};
  const providerRequestId = stringValue(
    room.providerRequestId,
  );

  if (providerRequestId) {
    const requestSnapshot = await transaction.get(
      db
        .collection("providerRequests")
        .doc(providerRequestId),
    );
    const context = await loadCanonicalContext(
      transaction,
      requestSnapshot,
      actor,
    );
    validateRoom(roomSnapshot, context, false);
    return context;
  }

  return loadLegacyContext(
    transaction,
    roomSnapshot,
    actor,
  );
}

async function loadCanonicalContext(
  transaction: Transaction,
  requestSnapshot: DocumentSnapshot<DocumentData>,
  actor: ChatActor,
): Promise<ChatContext> {
  if (!requestSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The chat room provider request is unavailable.",
    );
  }

  const requestData = requestSnapshot.data() ?? {};
  const providerRequestId = requestSnapshot.id;
  const storedRequestId = stringValue(
    requestData.providerRequestId,
  );
  const mainEventId = stringValue(
    requestData.mainEventId ??
      requestData.bookingId,
  );
  const customerId = stringValue(
    requestData.customerId,
  );
  const providerId = stringValue(
    requestData.providerId,
  );
  const providerRequestStatus =
    parseProviderRequestStatus(
      requestData.status,
    );

  if (
    (storedRequestId &&
      storedRequestId !== providerRequestId) ||
    !mainEventId ||
    !customerId ||
    !providerId ||
    !providerRequestStatus
  ) {
    throw invalidRelationship();
  }

  const providerReference = db
    .collection("providers")
    .doc(providerId);
  const mainEventReference = db
    .collection("mainEvents")
    .doc(mainEventId);
  const [providerSnapshot, mainEventSnapshot] =
    await Promise.all([
      transaction.get(providerReference),
      transaction.get(mainEventReference),
    ]);

  if (
    !providerSnapshot.exists ||
    !mainEventSnapshot.exists
  ) {
    throw invalidRelationship();
  }

  const providerData =
    providerSnapshot.data() ?? {};
  const mainEventData =
    mainEventSnapshot.data() ?? {};
  const providerOwnerId = stringValue(
    providerData.ownerId,
  );
  const mainEventStatus = parseMainEventStatus(
    mainEventData.status,
  );
  const providerRequestIds =
    stringArray(mainEventData.providerRequestIds);

  if (
    !providerOwnerId ||
    !isApprovedProviderForOperations(
      providerData,
    ) ||
    mainEventData.customerId !== customerId ||
    !providerRequestIds.includes(
      providerRequestId,
    ) ||
    !mainEventStatus
  ) {
    throw invalidRelationship();
  }

  authorizeActor(actor, {
    customerId,
    providerOwnerId,
  });

  return {
    providerRequestId,
    mainEventId,
    customerId,
    providerId,
    providerOwnerId,
    customerDisplayName:
      displayName(
        requestData.customerFirstName,
        requestData.customerLastName,
        "FEASTA customer",
      ),
    providerBusinessName:
      safeText(
        requestData.providerBusinessName ??
          providerData.businessName,
        160,
      ) ?? "FEASTA provider",
    providerRequestStatus,
    mainEventStatus,
    isLegacy: false,
  };
}

async function loadLegacyContext(
  transaction: Transaction,
  roomSnapshot: DocumentSnapshot<DocumentData>,
  actor: ChatActor,
): Promise<ChatContext> {
  const room = roomSnapshot.data() ?? {};
  const mainEventId = stringValue(
    room.mainEventId ?? room.bookingId,
  );
  const customerId = stringValue(room.customerId);
  const providerId = stringValue(room.providerId);

  if (!mainEventId || !customerId || !providerId) {
    throw invalidRelationship();
  }

  const providerSnapshot = await transaction.get(
    db.collection("providers").doc(providerId),
  );
  const providerData = providerSnapshot.data() ?? {};
  const providerOwnerId = stringValue(
    providerData.ownerId,
  );

  if (
    !providerSnapshot.exists ||
    !providerOwnerId ||
    !isApprovedProviderForOperations(providerData)
  ) {
    throw invalidRelationship();
  }

  authorizeActor(actor, {
    customerId,
    providerOwnerId,
  });

  const mainEventSnapshot = await transaction.get(
    db.collection("mainEvents").doc(mainEventId),
  );

  if (mainEventSnapshot.exists) {
    const mainEvent = mainEventSnapshot.data() ?? {};

    if (mainEvent.customerId !== customerId) {
      throw invalidRelationship();
    }

    const matchingRequest =
      await findMatchingProviderRequest(
        transaction,
        mainEvent,
        mainEventId,
        customerId,
        providerId,
      );

    if (matchingRequest) {
      const context = await loadCanonicalContext(
        transaction,
        matchingRequest,
        actor,
      );
      validateRoom(
        roomSnapshot,
        {...context, isLegacy: true},
        true,
      );
      return {...context, isLegacy: true};
    }

    const legacyStatuses = legacyLifecycle(
      mainEvent.status,
    );

    if (
      !legacyStatuses ||
      mainEvent.providerId !== providerId
    ) {
      throw invalidRelationship();
    }

    return legacyContext({
      room,
      providerData,
      mainEventId,
      customerId,
      providerId,
      providerOwnerId,
      ...legacyStatuses,
    });
  }

  const bookingSnapshot = await transaction.get(
    db.collection("bookings").doc(mainEventId),
  );
  const booking = bookingSnapshot.data() ?? {};
  const statuses = legacyLifecycle(booking.status);

  if (
    !bookingSnapshot.exists ||
    booking.customerId !== customerId ||
    booking.providerId !== providerId ||
    !statuses
  ) {
    throw invalidRelationship();
  }

  return legacyContext({
    room,
    providerData,
    mainEventId,
    customerId,
    providerId,
    providerOwnerId,
    ...statuses,
  });
}

async function findMatchingProviderRequest(
  transaction: Transaction,
  mainEvent: DocumentData,
  mainEventId: string,
  customerId: string,
  providerId: string,
): Promise<DocumentSnapshot<DocumentData> | null> {
  const requestIds = stringArray(
    mainEvent.providerRequestIds,
  ).slice(0, 30);
  let match: DocumentSnapshot<DocumentData> | null = null;

  for (const requestId of requestIds) {
    const snapshot = await transaction.get(
      db
        .collection("providerRequests")
        .doc(requestId),
    );
    const data = snapshot.data() ?? {};

    if (
      snapshot.exists &&
      data.customerId === customerId &&
      data.providerId === providerId &&
      (data.mainEventId ?? data.bookingId) ===
        mainEventId
    ) {
      if (match) {
        throw invalidRelationship();
      }
      match = snapshot;
    }
  }

  return match;
}

function canonicalRoomData(
  context: ChatContext,
): Record<string, unknown> {
  return {
    providerRequestId:
      context.providerRequestId,
    mainEventId: context.mainEventId,
    bookingId: context.mainEventId,
    customerId: context.customerId,
    providerId: context.providerId,
    providerOwnerId:
      context.providerOwnerId,
    customerDisplayName:
      context.customerDisplayName,
    providerBusinessName:
      context.providerBusinessName,
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: null,
    unreadCountCustomer: 0,
    unreadCountProvider: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function validateRoom(
  snapshot: DocumentSnapshot<DocumentData>,
  context: ChatContext,
  legacy: boolean,
): void {
  const room = snapshot.data() ?? {};
  const roomMainEventId = stringValue(
    room.mainEventId ?? room.bookingId,
  );

  if (
    room.customerId !== context.customerId ||
    room.providerId !== context.providerId ||
    roomMainEventId !== context.mainEventId ||
    (!legacy &&
      (
        snapshot.id !== context.providerRequestId ||
        room.providerRequestId !==
          context.providerRequestId
      )) ||
    (room.providerOwnerId !== undefined &&
      room.providerOwnerId !==
        context.providerOwnerId) ||
    typeof room.isActive !== "boolean"
  ) {
    throw invalidRelationship();
  }
}

function legacyRoomMatches(
  snapshot: DocumentSnapshot<DocumentData>,
  context: ChatContext,
): boolean {
  try {
    validateRoom(
      snapshot,
      {...context, isLegacy: true},
      true,
    );
    return snapshot.id === context.mainEventId;
  } catch {
    return false;
  }
}

function roomResult(
  snapshot: DocumentSnapshot<DocumentData>,
  context: ChatContext,
  created: boolean,
): OpenChatResult {
  return {
    chatRoomId: snapshot.id,
    providerRequestId:
      context.providerRequestId,
    mainEventId: context.mainEventId,
    created,
    isLegacy: context.isLegacy,
    isActive: snapshot.data()?.isActive === true,
  };
}

function legacyContext(input: {
  room: DocumentData;
  providerData: DocumentData;
  mainEventId: string;
  customerId: string;
  providerId: string;
  providerOwnerId: string;
  providerRequestStatus: ProviderRequestStatus;
  mainEventStatus: MainEventStatus;
}): ChatContext {
  return {
    providerRequestId: null,
    mainEventId: input.mainEventId,
    customerId: input.customerId,
    providerId: input.providerId,
    providerOwnerId: input.providerOwnerId,
    customerDisplayName:
      safeText(
        input.room.customerDisplayName,
        160,
      ) ?? displayName(
        input.room.customerFirstName,
        input.room.customerLastName,
        "FEASTA customer",
      ),
    providerBusinessName:
      safeText(
        input.room.providerBusinessName ??
          input.providerData.businessName,
        160,
      ) ?? "FEASTA provider",
    providerRequestStatus:
      input.providerRequestStatus,
    mainEventStatus: input.mainEventStatus,
    isLegacy: true,
  };
}

function legacyLifecycle(
  value: unknown,
): {
  providerRequestStatus: ProviderRequestStatus;
  mainEventStatus: MainEventStatus;
} | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");

  switch (normalized) {
  case "pending":
  case "pending_provider_approval":
    return {
      providerRequestStatus: "pending",
      mainEventStatus:
        "pending_provider_approval",
    };
  case "accepted":
    return {
      providerRequestStatus: "accepted",
      mainEventStatus:
        "pending_provider_approval",
    };
  case "waiting_payment":
  case "waiting_for_down_payment":
    return {
      providerRequestStatus:
        "waiting_for_down_payment",
      mainEventStatus:
        "waiting_for_down_payment",
    };
  case "payment_processing":
    return {
      providerRequestStatus:
        "payment_processing",
      mainEventStatus:
        "waiting_for_down_payment",
    };
  case "confirmed":
    return {
      providerRequestStatus: "confirmed",
      mainEventStatus: "confirmed",
    };
  case "in_progress":
    return {
      providerRequestStatus: "in_progress",
      mainEventStatus: "in_progress",
    };
  case "completed":
    return {
      providerRequestStatus: "completed",
      mainEventStatus: "completed",
    };
  case "rejected":
    return {
      providerRequestStatus: "rejected",
      mainEventStatus:
        "needs_provider_replacement",
    };
  case "cancelled":
    return {
      providerRequestStatus: "cancelled",
      mainEventStatus: "cancelled",
    };
  case "expired":
    return {
      providerRequestStatus: "expired",
      mainEventStatus: "expired",
    };
  default:
    return null;
  }
}

function authorizeActor(
  actor: ChatActor,
  participants: {
    customerId: string;
    providerOwnerId: string;
  },
): void {
  const authorized =
    actor.role === USER_ROLES.customer
      ? actor.uid === participants.customerId
      : actor.uid ===
        participants.providerOwnerId;

  if (!authorized) {
    throw new HttpsError(
      "permission-denied",
      "You cannot access this conversation.",
    );
  }
}

function requireChatRole(
  role: UserRole,
): ChatActor["role"] {
  if (
    role !== USER_ROLES.customer &&
    role !== USER_ROLES.provider
  ) {
    throw new HttpsError(
      "permission-denied",
      "This account cannot use messaging.",
    );
  }
  return role;
}

function callerCounter(
  role: ChatActor["role"],
): "unreadCountCustomer" | "unreadCountProvider" {
  return role === USER_ROLES.customer
    ? "unreadCountCustomer"
    : "unreadCountProvider";
}

function recipientCounter(
  role: ChatActor["role"],
): "unreadCountCustomer" | "unreadCountProvider" {
  return role === USER_ROLES.customer
    ? "unreadCountProvider"
    : "unreadCountCustomer";
}

function displayName(
  first: unknown,
  last: unknown,
  fallback: string,
): string {
  const name = [
    safeText(first, 80),
    safeText(last, 80),
  ].filter(Boolean).join(" ");
  return name || fallback;
}

function safeText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/\s+/gu, " ");
  return normalized &&
    normalized.length <= maximumLength
    ? normalized
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const normalized = stringValue(entry);
    return normalized ? [normalized] : [];
  });
}

function invalidRelationship(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The chat room relationship is invalid.",
  );
}

function unavailableRoom(): HttpsError {
  return new HttpsError(
    "not-found",
    "The conversation was not found.",
  );
}
