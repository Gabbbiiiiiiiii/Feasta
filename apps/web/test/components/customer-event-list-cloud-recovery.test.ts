import {describe, expect, it, vi} from "vitest";
import {
  CustomerEventListCloudRecovery,
} from "@/lib/customer/event-list/customer-event-list-cloud-recovery";
import type {
  CustomerEventListMutationInput,
  CustomerEventListMutationResult,
} from "@/lib/customer/event-list/customer-event-list-cloud-transport";

const input: CustomerEventListMutationInput = {
  version: 1,
  requestId: "recovery-request-0001",
  expectedRevision: 4,
  action: "clear",
};

function accepted(replayed = false): CustomerEventListMutationResult {
  return {
    version: 1,
    revision: 5,
    changed: true,
    migrationReviewRequired: false,
    removedIdentities: [],
    preservedIdentities: [],
    replayed,
  };
}

function createHarness() {
  let active = true;
  const send = vi.fn<
    (
      value: CustomerEventListMutationInput,
    ) => Promise<CustomerEventListMutationResult>
  >();

  const notify = vi.fn();

  const recovery = new CustomerEventListCloudRecovery(
    () => active,
    send,
    notify,
  );

  return {
    recovery,
    send,
    notify,
    expire: () => { active = false; },
  };
}

describe("Customer Event List cloud safe retry", () => {
  it("clears the retry marker when Firestore confirms before the callable responds", async () => {
    const clear = vi.fn();
    let finish!: (value: CustomerEventListMutationResult) => void;
    const recovery = new CustomerEventListCloudRecovery(() => true,
      () => new Promise(resolve => { finish = resolve; }), vi.fn(), {save: vi.fn(), clear});
    const pending = recovery.begin(input);
    recovery.observeServerRevision(5);
    finish(accepted());
    await pending;
    expect(recovery.snapshot.status).toBe("confirmed");
    expect(clear).toHaveBeenCalledExactlyOnceWith(input.requestId);
    expect(recovery.hasUnresolvedOperation).toBe(false);
  });
  it("releases a server-rejected revision instead of replaying it forever", async () => {
    const clear = vi.fn();
    const send = vi.fn().mockRejectedValueOnce(Object.assign(new Error("stale"), {code: "functions/aborted"}))
      .mockResolvedValueOnce(accepted());
    const recovery = new CustomerEventListCloudRecovery(() => true, send, vi.fn(),
      {save: vi.fn(), clear});
    await expect(recovery.begin(input)).rejects.toThrow("stale");
    expect(clear).toHaveBeenCalledWith(input.requestId);
    expect(recovery.hasUnresolvedOperation).toBe(false);
    await recovery.begin({...input, requestId: "recovery-request-0002", expectedRevision: 5});
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("preserves recovery when authorization fails after an uncertain write", async () => {
    const h = createHarness();
    h.send.mockRejectedValueOnce(new Error("response lost"))
      .mockRejectedValueOnce(Object.assign(new Error("expired"), {code: "functions/permission-denied"}));
    await expect(h.recovery.begin(input)).rejects.toThrow();
    await expect(h.recovery.retry()).rejects.toThrow("expired");
    expect(h.recovery.snapshot.requestId).toBe(input.requestId);
    expect(h.recovery.hasUnresolvedOperation).toBe(true);
  });

  it("keeps a committed mutation awaiting a confirmed snapshot", async () => {
    const h = createHarness();
    h.send.mockResolvedValue(accepted());

    await h.recovery.begin(input);

    expect(h.recovery.snapshot.status).toBe("awaiting_snapshot");
    expect(h.recovery.hasUnresolvedOperation).toBe(true);

    h.recovery.observeServerRevision(5);

    expect(h.recovery.snapshot.status).toBe("confirmed");
    expect(h.recovery.hasUnresolvedOperation).toBe(false);
  });

  it("preserves the request ID after a lost response", async () => {
    const h = createHarness();
    h.send.mockRejectedValueOnce(new Error("network timeout"));
    h.send.mockResolvedValueOnce(accepted(true));

    await expect(h.recovery.begin(input)).rejects.toThrow("network timeout");

    expect(h.recovery.snapshot.status).toBe("uncertain");
    expect(h.recovery.snapshot.requestId).toBe(input.requestId);

    await h.recovery.retry();

    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[0]?.[0]).toEqual(h.send.mock.calls[1]?.[0]);
    expect(h.send.mock.calls[1]?.[0].requestId).toBe(input.requestId);
  });

  it("does not treat a newer snapshot as proof of an uncertain write", async () => {
    const h = createHarness();
    h.send.mockRejectedValue(new Error("response lost"));

    await expect(h.recovery.begin(input)).rejects.toThrow();

    h.recovery.observeServerRevision(99);

    expect(h.recovery.snapshot.status).toBe("uncertain");
    expect(h.recovery.hasUnresolvedOperation).toBe(true);
  });

  it("blocks unrelated mutations until the original is resolved", async () => {
    const h = createHarness();
    h.send.mockRejectedValue(new Error("timeout"));

    await expect(h.recovery.begin(input)).rejects.toThrow();

    await expect(h.recovery.begin({
      ...input,
      requestId: "different-request-0002",
    })).rejects.toThrow(/previous/i);

    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("prevents simultaneous sends", async () => {
    const h = createHarness();

    let finish!: (value: CustomerEventListMutationResult) => void;
    h.send.mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );

    const first = h.recovery.begin(input);

    await expect(h.recovery.begin(input)).rejects.toThrow(/previous/i);
    await expect(h.recovery.retry()).rejects.toThrow(/uncertain/i);

    expect(h.send).toHaveBeenCalledTimes(1);

    finish(accepted());
    await first;
  });

  it("does not mutate the caller's original payload", async () => {
    const h = createHarness();
    h.send.mockRejectedValue(new Error("timeout"));

    const command = {...input};
    await expect(h.recovery.begin(command)).rejects.toThrow();

    command.requestId = "modified-request-0002";

    expect(h.recovery.snapshot.requestId).toBe("recovery-request-0001");
    expect(h.send.mock.calls[0]?.[0].requestId).toBe("recovery-request-0001");
  });

  it("invalidates recovery after a session change", async () => {
    const h = createHarness();
    h.send.mockRejectedValue(new Error("timeout"));

    await expect(h.recovery.begin(input)).rejects.toThrow();

    h.expire();

    await expect(h.recovery.retry()).rejects.toThrow(/session/i);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("discards callbacks and retry capability when stopped", async () => {
    const h = createHarness();
    h.send.mockResolvedValue(accepted());

    await h.recovery.begin(input);
    const calls = h.notify.mock.calls.length;

    h.recovery.stop();
    h.recovery.observeServerRevision(5);

    expect(h.notify).toHaveBeenCalledTimes(calls);
    expect(h.recovery.snapshot.status).toBe("idle");
    expect(h.recovery.snapshot.requestId).toBeNull();

    await expect(h.recovery.retry()).rejects.toThrow(/session/i);
  });
});
