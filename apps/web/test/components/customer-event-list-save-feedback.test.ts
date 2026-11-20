import {describe, expect, it} from "vitest";
import {cloudEventListSaveFeedback} from "@/lib/customer/event-list/customer-event-list-save-feedback";
import {fromWebList} from "@/lib/customer/event-list/customer-event-list-cloud-contract";
import type {CloudListState} from "@/lib/customer/event-list/customer-event-list-cloud-controller";
import type {RecoverySnapshot} from "@/lib/customer/event-list/customer-event-list-cloud-recovery";

describe("booking page reactive cloud save feedback", () => {
  const outcome = {requestId: "request-one", revision: 3, status: "awaiting_snapshot" as const};
  const state: CloudListState = {status: "ready", document: {...fromWebList("customer_A", [], null), revision: 3}, error: null, pendingRevision: null};
  const recovery: RecoverySnapshot = {status: "confirmed", requestId: "request-one", acceptedRevision: 3, error: null};
  it("replaces the accepted/waiting message after the matching server confirmation", () => {
    expect(cloudEventListSaveFeedback(outcome, {...state, status: "pending"}, {...recovery, status: "awaiting_snapshot"}).success).toBe(false);
    const updated = cloudEventListSaveFeedback(outcome, state, recovery);
    expect(updated.success).toBe(true);
    expect(updated.message).toContain("Cloud Event List confirmed");
    expect(updated.message).not.toContain("Waiting");
  });
  it("does not accept another request, uncertain operation, or missing account state as proof", () => {
    expect(cloudEventListSaveFeedback(outcome, state, {...recovery, requestId: "different"}).success).toBe(false);
    expect(cloudEventListSaveFeedback(outcome, state, {...recovery, status: "uncertain"}).success).toBe(false);
    expect(cloudEventListSaveFeedback(outcome, {...state, document: null}, recovery).success).toBe(false);
    expect(cloudEventListSaveFeedback(outcome, {...state, document: {...state.document!, revision: 2}}, recovery).success).toBe(false);
  });
  it("reports a failed listener instead of indefinite successful acceptance", () => {
    expect(cloudEventListSaveFeedback(outcome, {...state, status: "error", error: "Reconnect to recover"}, recovery))
      .toEqual({success: false, message: "Reconnect to recover"});
  });
});
