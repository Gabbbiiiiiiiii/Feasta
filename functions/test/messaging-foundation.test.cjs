const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");

const {
  CHAT_ELIGIBLE_MAIN_EVENT_STATUSES,
  CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_NOTIFICATION_TYPE,
  canonicalChatRoomId,
  isChatLifecycleEligible,
  validateMarkChatReadInput,
  validateOpenChatInput,
  validateSendChatMessageInput,
} = require("../lib/messaging/chat-domain.js");

const callable = readFileSync(
  join(__dirname, "../src/messaging/provider-request-chat.ts"),
  "utf8",
);

test("canonical rooms use the provider request ID without client identities", () => {
  assert.equal(
    canonicalChatRoomId("provider_request_123"),
    "provider_request_123",
  );
  assert.deepEqual(
    validateOpenChatInput({providerRequestId: "provider_request_123"}),
    {providerRequestId: "provider_request_123"},
  );
  for (const field of ["providerId", "customerId", "providerOwnerId"]) {
    assert.throws(
      () => validateOpenChatInput({
        providerRequestId: "provider_request_123",
        [field]: "attacker",
      }),
      (error) => error.code === "invalid-argument",
    );
  }
});

test("chat lifecycle is available only from pending through in-progress", () => {
  assert.deepEqual(CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES, [
    "pending",
    "accepted",
    "waiting_for_down_payment",
    "payment_processing",
    "confirmed",
    "in_progress",
  ]);
  assert.deepEqual(CHAT_ELIGIBLE_MAIN_EVENT_STATUSES, [
    "pending_provider_approval",
    "needs_provider_replacement",
    "waiting_for_down_payment",
    "confirmed",
    "in_progress",
  ]);

  for (const status of CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES) {
    assert.equal(isChatLifecycleEligible(status, "in_progress"), true, status);
  }
  for (const status of ["rejected", "completed", "cancelled", "expired"]) {
    assert.equal(isChatLifecycleEligible(status, "in_progress"), false, status);
  }
  for (const status of ["draft", "completed", "cancelled", "expired"]) {
    assert.equal(isChatLifecycleEligible("pending", status), false, status);
  }
});

test("send validation is text-only, trimmed, bounded, and strict", () => {
  assert.equal(CHAT_MESSAGE_MAX_LENGTH, 4000);
  assert.deepEqual(validateSendChatMessageInput({
    chatRoomId: "provider_request_123",
    message: "  Hello  ",
  }), {
    chatRoomId: "provider_request_123",
    message: "Hello",
  });
  assert.equal(
    validateSendChatMessageInput({
      chatRoomId: "provider_request_123",
      message: "a".repeat(4000),
    }).message.length,
    4000,
  );
  for (const payload of [
    {chatRoomId: "provider_request_123", message: ""},
    {chatRoomId: "provider_request_123", message: "   "},
    {chatRoomId: "provider_request_123", message: "a".repeat(4001)},
    {chatRoomId: "provider_request_123", message: "hello", messageType: "image"},
    {chatRoomId: "provider_request_123", message: "hello", attachmentUrl: "https://example.test/file"},
    {chatRoomId: "provider_request_123", message: "hello", senderId: "attacker"},
  ]) {
    assert.throws(
      () => validateSendChatMessageInput(payload),
      (error) => error.code === "invalid-argument",
    );
  }
});

test("mark-read input never accepts a caller-selected role", () => {
  assert.deepEqual(
    validateMarkChatReadInput({chatRoomId: "provider_request_123"}),
    {chatRoomId: "provider_request_123"},
  );
  assert.throws(
    () => validateMarkChatReadInput({
      chatRoomId: "provider_request_123",
      currentRole: "customer",
    }),
    (error) => error.code === "invalid-argument",
  );
});

test("callables derive participants and commit message side effects atomically", () => {
  for (const control of [
    "requireAuth(request)",
    "requireRole(",
    "isApprovedProviderForOperations",
    "assertChatLifecycleEligible",
    "transaction.create(messageReference",
    "transaction.update(roomReference",
    "FieldValue.increment(1)",
    "createNotificationInTransaction",
    "recipientCounter(actor.role)",
    "callerCounter(actor.role)",
  ]) {
    assert.ok(callable.includes(control), control);
  }
  assert.equal(CHAT_NOTIFICATION_TYPE, "new_message");
  assert.doesNotMatch(
    callable,
    /request\.data\.(?:providerId|customerId|providerOwnerId)/u,
  );
  assert.doesNotMatch(callable, /attachmentUrl/u);
  assert.doesNotMatch(callable, /messageType:\s*"image"/u);
});

test("legacy compatibility is read-through only and never rewrites room history", () => {
  assert.match(callable, /openExistingLegacyRoom/u);
  assert.match(callable, /legacyRoomMatches/u);
  assert.match(callable, /collection\("bookings"\)/u);
  assert.doesNotMatch(callable, /transaction\.update\(legacyRoomReference/u);
  assert.doesNotMatch(callable, /transaction\.set\(legacyRoomReference/u);
});
