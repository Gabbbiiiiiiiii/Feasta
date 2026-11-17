import {describe, expect, it, vi} from "vitest";
import type {User} from "firebase/auth";
import {
  CustomerEventListCloudController,
  type CloudListTransport,
} from "@/lib/customer/event-list/customer-event-list-cloud-controller";
import type {
  CustomerEventListCloudEvent,
  CustomerEventListMutationInput,
  CustomerEventListMutationResult,
} from "@/lib/customer/event-list/customer-event-list-cloud-transport";
import type {PlanningDocument} from
  "../../../../functions/src/customer-event-lists/contract";

const user = {uid: "customer-A"} as User;

function document(revision: number): PlanningDocument {
  return {
    version: 1,
    ownerUid: "customer-A",
    revision,
    currency: "PHP",
    entries: [],
    schedule: null,
    migration: {version: 1, completed: true},
  };
}

const clearInput: CustomerEventListMutationInput = {
  version: 1,
  action: "clear",
  expectedRevision: 2,
  requestId: "test-request-00003",
};

function harness() {
  let emit: ((event: CustomerEventListCloudEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const send = vi.fn<
    (
      user: User,
      input: CustomerEventListMutationInput,
      current: () => boolean,
    ) => Promise<CustomerEventListMutationResult>
  >();

  const transport: CloudListTransport = {
    subscribe: (_user, _current, onEvent) => {
      emit = onEvent;
      return unsubscribe;
    },
    send,
  };

  const notify = vi.fn();
  const controller = new CustomerEventListCloudController(
    transport,
    notify,
  );

  return {
    controller,
    notify,
    send,
    unsubscribe,
    emit: (event: CustomerEventListCloudEvent) => {
      if (!emit) throw new Error("Not subscribed.");
      emit(event);
    },
  };
}

describe("Customer Event List cloud controller", () => {
  it("accepts confirmed snapshots without local writes", () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.emit({status: "ready", document: document(2)});
    expect(h.controller.snapshot.status).toBe("ready");
    expect(h.controller.snapshot.document?.revision).toBe(2);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("rejects stale revisions before transport calls", async () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.emit({status: "ready", document: document(3)});
    await expect(h.controller.mutate(clearInput)).rejects.toThrow(
      /revision/i,
    );
    expect(h.send).not.toHaveBeenCalled();
  });

  it("waits for a confirmed snapshot after mutation", async () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.emit({status: "ready", document: document(2)});
    h.send.mockResolvedValue({
      version: 1,
      revision: 3,
      changed: true,
      migrationReviewRequired: false,
      removedIdentities: [],
      preservedIdentities: [],
      replayed: false,
    });

    await h.controller.mutate(clearInput);
    expect(h.controller.snapshot.status).toBe("pending");
    expect(h.controller.snapshot.pendingRevision).toBe(3);

    h.emit({status: "ready", document: document(3)});
    expect(h.controller.snapshot.status).toBe("ready");
    expect(h.controller.snapshot.pendingRevision).toBeNull();
  });

  it("preserves the confirmed document on failure", async () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.emit({status: "ready", document: document(2)});
    h.send.mockRejectedValue(new Error("network-unavailable"));

    await expect(h.controller.mutate(clearInput)).rejects.toThrow(
      "network-unavailable",
    );
    expect(h.controller.snapshot.status).toBe("error");
    expect(h.controller.snapshot.document?.revision).toBe(2);
  });

  it("rejects a second mutation while the first is unresolved", async () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.emit({status: "ready", document: document(2)});

    let finish!: (value: CustomerEventListMutationResult) => void;
    h.send.mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );

    const first = h.controller.mutate(clearInput);
    await expect(h.controller.mutate(clearInput)).rejects.toThrow(
      /pending/i,
    );

    finish({
      version: 1,
      revision: 3,
      changed: true,
      migrationReviewRequired: false,
      removedIdentities: [],
      preservedIdentities: [],
      replayed: false,
    });
    await first;
  });

  it("discards callbacks from a stopped customer session", () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.controller.stop();

    h.emit({status: "ready", document: document(5)});
    expect(h.controller.snapshot.status).toBe("idle");
    expect(h.controller.snapshot.document).toBeNull();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not import over an existing cloud document", async () => {
    const h = harness();
    h.controller.start(user, () => true);
    h.emit({status: "ready", document: document(2)});

    await expect(h.controller.mutate({
      version: 1,
      requestId: "test-request-00004",
      action: "import",
      expectedRevision: null,
      local: document(0),
    })).rejects.toThrow(/import/i);

    expect(h.send).not.toHaveBeenCalled();
  });
});