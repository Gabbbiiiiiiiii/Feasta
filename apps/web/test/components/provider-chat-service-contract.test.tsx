import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

const root = join(process.cwd(), "src/lib/provider/messages");
const service = readFileSync(
  join(root, "provider-chat-service.ts"),
  "utf8",
);
const types = readFileSync(
  join(root, "provider-chat-types.ts"),
  "utf8",
);
const indexes = readFileSync(
  join(process.cwd(), "../../firebase/firestore.indexes.json"),
  "utf8",
);
const navigation = readFileSync(
  join(process.cwd(), "src/components/layout/navigation.ts"),
  "utf8",
);

describe("provider messaging server-read contract", () => {
  it("uses approved-provider server authorization without a providerId input", () => {
    expect(service).toContain('import "server-only"');
    expect(service).toContain("requireApprovedProvider()");
    expect(service).toContain("account.providerId");
    const signature = service.slice(
      service.indexOf("export async function getProviderChatRoomPage"),
      service.indexOf("): Promise<ProviderChatRoomPage>"),
    );
    expect(signature).not.toContain("providerId");
  });

  it("reads only the canonical room and nested-message hierarchy", () => {
    expect(service).toContain('.collection("chatRooms")');
    expect(service).toContain('.collection("messages")');
    for (const duplicate of [
      "providerMessages",
      "providerChatRooms",
      "conversations",
      "messageThreads",
    ]) {
      expect(service).not.toContain(duplicate);
    }
  });

  it("provides bounded opaque cursor pagination", () => {
    expect(service).toContain("DEFAULT_PAGE_SIZE = 20");
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain("limit(pageSize + 1)");
    expect(service).toContain('toString("base64url")');
    expect(service).toContain('"provider-rooms"');
    expect(service).toContain("`messages:${roomId}`");
    expect(service).toContain("FieldPath.documentId()");
  });

  it("returns provider-safe customer and event context", () => {
    expect(types).toContain("customerDisplayName: string");
    expect(types).toContain("serviceSummary: string");
    expect(types).not.toMatch(/customerEmail|customerPhone|eventAddress/u);
    expect(types).not.toMatch(/customerId: string|providerId: string/u);
    expect(service).toContain('CUSTOMER_NAME_FALLBACK = "FEASTA customer"');
    expect(types).toContain("canSendMessages: boolean");
    expect(service).toContain("isChatLifecycleEligible(");
    expect(service).toContain("data.isActive &&");
  });

  it("validates ownership and multi-provider relationship fields", () => {
    expect(service).toContain("providerId !== expectedProviderId");
    expect(service).toContain("request.providerId !== providerId");
    expect(service).toContain("request.customerId !== customerId");
    expect(service).toContain("request.mainEventId ?? request.bookingId");
    expect(service).toContain("matches.length === 1");
  });

  it("declares only the implemented provider room-list index", () => {
    const parsed = JSON.parse(indexes) as {
      indexes: Array<{
        collectionGroup: string;
        fields: Array<{fieldPath: string; order?: string}>;
      }>;
    };
    const chatIndexes = parsed.indexes.filter(
      (index) => index.collectionGroup === "chatRooms",
    );
    expect(chatIndexes).toEqual([
      expect.objectContaining({
        fields: [
          {fieldPath: "providerId", order: "ASCENDING"},
          {fieldPath: "isActive", order: "ASCENDING"},
          {fieldPath: "lastMessageAt", order: "DESCENDING"},
          {fieldPath: "__name__", order: "DESCENDING"},
        ],
      }),
    ]);
  });

  it("enables the provider Messages navigation entry after the UI exists", () => {
    const messagesLabel = navigation.indexOf('label: "Messages"');
    const messagesEntry = navigation.slice(
      navigation.lastIndexOf("{", messagesLabel),
      navigation.indexOf('label: "Notifications"'),
    );
    expect(messagesEntry).toContain('kind: "link"');
    expect(messagesEntry).toContain('href: "/provider/messages"');
    expect(messagesEntry).not.toContain("Coming soon");
  });
});
