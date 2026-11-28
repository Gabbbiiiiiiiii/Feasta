import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {
  chronologicalChatMessages,
  mergeChatMessages,
} from "@/lib/messaging/message-collection";
import {normalizeChatMessage} from "@/lib/messaging/message-normalization";
import type {ChatMessage} from "@/lib/messaging/messaging-types";

const timestamp = (value = "2026-08-28T04:00:00.000Z") => ({
  toDate: () => new Date(value),
});

function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    chatRoomId: "provider_request_123",
    senderId: "customer_uid",
    senderRole: "customer",
    message: "  Event details confirmed.  ",
    messageType: "text",
    createdAt: timestamp(),
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-a",
    sender: "customer",
    text: "Event details confirmed.",
    createdAt: "2026-08-28T04:00:00.000Z",
    ...overrides,
  };
}

describe("shared messaging normalization", () => {
  it("returns a safe DTO only for a canonical participant sender", () => {
    const result = normalizeChatMessage({
      id: "message-a",
      chatRoomId: "provider_request_123",
      data: rawMessage(),
      expectedSenderIds: {
        customer: "customer_uid",
        provider: "provider_owner_uid",
      },
    });

    expect(result).toEqual(message());
    expect(result).not.toHaveProperty("senderId");
  });

  it.each<[string, Record<string, unknown>]>([
    ["unsupported role", {senderRole: "admin"}],
    ["missing sender ID", {senderId: "   "}],
    ["wrong room", {chatRoomId: "another_room"}],
    ["unsupported message type", {messageType: "image"}],
    ["missing timestamp", {createdAt: null}],
    ["oversized text", {message: "a".repeat(4_001)}],
  ])("rejects %s", (_label, overrides) => {
    expect(normalizeChatMessage({
      id: "message-a",
      chatRoomId: "provider_request_123",
      data: rawMessage(overrides),
    })).toBeNull();
  });

  it("rejects a canonical role paired with the wrong expected identity", () => {
    expect(normalizeChatMessage({
      id: "message-a",
      chatRoomId: "provider_request_123",
      data: rawMessage({
        senderId: "provider_owner_uid",
        senderRole: "customer",
      }),
      expectedSenderIds: {
        customer: "customer_uid",
        provider: "provider_owner_uid",
      },
    })).toBeNull();
  });

  it("fails closed when a supplied participant identity is malformed", () => {
    expect(normalizeChatMessage({
      id: "message-a",
      chatRoomId: "provider_request_123",
      data: rawMessage(),
      expectedSenderIds: {customer: "   "},
    })).toBeNull();
  });
});

describe("shared messaging collection helpers", () => {
  it("merges by message ID and preserves chronological order", () => {
    const old = message({id: "old", createdAt: "2026-08-28T03:00:00.000Z"});
    const replacement = message({id: "same", text: "Updated canonical copy"});
    const original = message({id: "same", text: "Original copy"});
    const newest = message({
      id: "new",
      sender: "provider",
      createdAt: "2026-08-28T05:00:00.000Z",
    });

    expect(mergeChatMessages([original, old], [newest, replacement])).toEqual([
      old,
      replacement,
      newest,
    ]);
    expect(chronologicalChatMessages([newest, old])).toEqual([old, newest]);
  });
});

describe("shared messaging client contract", () => {
  const root = join(process.cwd(), "src/lib/messaging");
  const client = readFileSync(join(root, "messaging-client.ts"), "utf8");
  const types = readFileSync(join(root, "messaging-types.ts"), "utf8");

  it("reuses the canonical callables without caller-selected participants", () => {
    expect(client).toContain('functions, "openProviderRequestChat"');
    expect(client).toContain('functions, "sendChatMessage"');
    expect(client).toContain('functions, "markChatRoomRead"');
    expect(client).not.toMatch(/customerId|providerId|providerOwnerId|recipientId/u);
    expect(types).not.toContain("recipientId");
  });

  it("keeps one bounded nested-message listener", () => {
    expect(client).toContain('collection(db, "chatRooms", roomId, "messages")');
    expect(client).toContain('orderBy("createdAt", "desc")');
    expect(client).toContain('orderBy(documentId(), "desc")');
    expect(client).toContain("limit(CHAT_REALTIME_MESSAGE_LIMIT)");
    expect(client).toContain("expectedSenderIds: {[input.currentRole]: user.uid}");
  });
});
