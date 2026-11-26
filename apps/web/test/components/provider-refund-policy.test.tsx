import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {ProviderRefundPolicyPageDto} from "@/lib/provider/refund-policy/provider-refund-policy-types";
import {
  formatBasisPoints,
  parsePercentToBasisPoints,
  validateRefundPolicy,
  validateUnifiedRefundPolicy,
} from "@/lib/provider/refund-policy/provider-refund-policy-validation";

const mutations = vi.hoisted(() => ({
  publish: vi.fn(),
  saveCancellation: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: mutations.refresh}),
}));

vi.mock("@/lib/provider/refund-policy/provider-refund-policy-client", () => ({
  publishProviderRefundPolicy: (...args: unknown[]) => mutations.publish(...args),
  saveProviderCancellationPolicy: (...args: unknown[]) => mutations.saveCancellation(...args),
}));

import {
  ProviderRefundPolicyClient,
  refundPolicyErrorMessage,
} from "@/app/provider/refund-policy/provider-refund-policy-client";

const existingData: ProviderRefundPolicyPageDto = {
  providerPolicy: {
    source: "provider_default",
    version: 3,
    effectiveAt: "2026-08-31T03:30:00.000Z",
    terms: "Cancellations must be submitted in writing.",
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 10_000},
      {stage: "preparation_started", refundBasisPoints: 0},
      {stage: "service_started", refundBasisPoints: 0},
    ],
  },
  adminDefaultCancellationPolicy: {
    policyVersion: 1,
    defaultCutoffHoursBeforeEvent: 72,
    minCutoffHoursBeforeEvent: 24,
    maxCutoffHoursBeforeEvent: 720,
    guidanceNote: null,
    updatedAt: null,
    isSeededFallback: true,
  },
  providerCancellationPolicy: {
    mode: "admin_default",
    cutoffHoursBeforeEvent: null,
    policyVersion: 1,
    effectiveAt: "2026-08-31T03:00:00.000Z",
  },
};

describe("Provider refund policy percentage conversion and unified validation", () => {
  it("converts whole and two-decimal percentages without floating-point math", () => {
    expect(parsePercentToBasisPoints("0")).toBe(0);
    expect(parsePercentToBasisPoints("100")).toBe(10_000);
    expect(parsePercentToBasisPoints("75.25")).toBe(7_525);
    expect(formatBasisPoints(5_025)).toBe("50.25");
  });

  it.each(["-1", "100.01", "1.234", "NaN", "1e2", "", ".5"])(
    "rejects malformed percentage %s",
    (value) => expect(parsePercentToBasisPoints(value)).toBeNull(),
  );

  it("maps unified cutoff refund rules cleanly for >= 24h and < 24h cutoffs", () => {
    const standard = validateUnifiedRefundPolicy({
      beforeCutoffPercent: "75.25",
      terms: "Written notice required.",
      effectiveCutoffHoursBeforeEvent: 72,
    });
    expect(standard.draft).toEqual({
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 7_525},
        {stage: "preparation_started", refundBasisPoints: 0},
        {stage: "service_started", refundBasisPoints: 0},
      ],
      terms: "Written notice required.",
    });

    const shortCutoff = validateUnifiedRefundPolicy({
      beforeCutoffPercent: "80",
      terms: "",
      effectiveCutoffHoursBeforeEvent: 12,
    });
    expect(shortCutoff.draft).toEqual({
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 8_000},
        {stage: "preparation_started", refundBasisPoints: 8_000},
        {stage: "service_started", refundBasisPoints: 0},
      ],
      terms: null,
    });
  });

  it("rejects non-monotonic percentages and terms longer than 4,000 characters", () => {
    const nonMonotonic = validateRefundPolicy({
      preparation_not_started: "20",
      preparation_started: "80",
      service_started: "0",
    }, "");
    expect(nonMonotonic.draft).toBeNull();
    expect(nonMonotonic.errors.preparation_started).toMatch(/cannot be higher/iu);

    const tooLong = validateUnifiedRefundPolicy({
      beforeCutoffPercent: "100",
      terms: "x".repeat(4_001),
      effectiveCutoffHoursBeforeEvent: 72,
    });
    expect(tooLong.draft).toBeNull();
    expect(tooLong.errors.terms).toMatch(/4,000/iu);
  });
});

describe("Provider refund policy management", () => {
  beforeEach(() => {
    mutations.publish.mockReset().mockResolvedValue({success: true, policyVersion: 4});
    mutations.saveCancellation.mockReset().mockResolvedValue({success: true});
    mutations.refresh.mockReset();
  });

  it("renders the unified refund policy empty state without package overrides", () => {
    render(<ProviderRefundPolicyClient data={{providerPolicy: null}} />);
    expect(screen.getByRole("heading", {name: "Cancellation & Refund Policy"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Refund Policy"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Create Policy"})).toBeEnabled();
    expect(screen.getByText(/required before refund-policy-backed bookings/iu))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "Package Refund Policies"}))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/Create Override/iu)).not.toBeInTheDocument();
  });

  it("renders an existing policy as Before and After Cancellation Cutoff without package overrides", () => {
    render(<ProviderRefundPolicyClient data={existingData} />);
    expect(screen.getByText("Before Cancellation Cutoff")).toBeInTheDocument();
    expect(screen.getByText("After Cancellation Cutoff")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("Cancellation closed")).toBeInTheDocument();
    expect(screen.getByText("Cancellations must be submitted in writing."))
      .toBeInTheDocument();
    expect(screen.getByText("Version 3")).toBeInTheDocument();
    expect(screen.queryByText("Preparation Started")).not.toBeInTheDocument();
    expect(screen.queryByText("Package Refund Policies")).not.toBeInTheDocument();
  });

  it("validates the unified refund percentage, confirms publishing, and sends the canonical 3-stage payload", async () => {
    const user = userEvent.setup();
    render(<ProviderRefundPolicyClient data={{providerPolicy: null}} />);
    await user.click(screen.getByRole("button", {name: "Create Policy"}));

    const beforeInput = screen.getByRole("textbox", {name: /before cancellation cutoff/iu});
    await user.clear(beforeInput);
    await user.type(beforeInput, "75.25");
    await user.type(screen.getByRole("textbox", {name: /additional notes/iu}), "Plain terms");

    await user.click(screen.getByRole("button", {name: "Publish Policy"}));
    expect(mutations.publish).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {name: "Publish refund policy?"});
    expect(within(dialog).getByText(/existing bookings keep their original agreed policy/iu))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", {name: "Publish Policy"}));

    await waitFor(() => expect(mutations.publish).toHaveBeenCalledTimes(1));
    const payload = mutations.publish.mock.calls[0][0];
    expect(payload).toEqual({
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 7_525},
        {stage: "preparation_started", refundBasisPoints: 0},
        {stage: "service_started", refundBasisPoints: 0},
      ],
      terms: "Plain terms",
    });
    expect(payload).not.toHaveProperty("providerId");
    expect(payload).not.toHaveProperty("policyVersion");
    expect(payload).not.toHaveProperty("effectiveAt");
    expect(await screen.findByText("Refund policy published.")).toBeInTheDocument();
    expect(mutations.refresh).toHaveBeenCalled();
  });

  it("shows malformed percent errors and does not open confirmation", async () => {
    const user = userEvent.setup();
    render(<ProviderRefundPolicyClient data={{providerPolicy: null}} />);
    await user.click(screen.getByRole("button", {name: "Create Policy"}));
    const input = screen.getByRole("textbox", {name: /before cancellation cutoff/iu});
    fireEvent.change(input, {target: {value: "1e2"}});
    await user.click(screen.getByRole("button", {name: "Publish Policy"}));
    expect(screen.getByText(/up to two decimal places/iu)).toBeInTheDocument();
    expect(screen.getByRole("dialog", {name: "Create Refund Policy"}))
      .toBeInTheDocument();
    expect(screen.queryByRole("dialog", {name: "Publish refund policy?"}))
      .not.toBeInTheDocument();
    expect(mutations.publish).not.toHaveBeenCalled();
  });

  it("opens refund editing as a modal and lets the provider cancel without publishing", async () => {
    const user = userEvent.setup();
    render(<ProviderRefundPolicyClient data={existingData} />);
    await user.click(screen.getByRole("button", {name: "Edit Policy"}));
    const editorDialog = screen.getByRole("dialog", {name: "Edit Refund Policy"});
    expect(within(editorDialog).getByRole("textbox", {name: /before cancellation cutoff/iu}))
      .toHaveValue("100");
    await user.click(within(editorDialog).getByRole("button", {name: "Cancel"}));
    expect(screen.queryByRole("dialog", {name: "Edit Refund Policy"}))
      .not.toBeInTheDocument();
    expect(mutations.publish).not.toHaveBeenCalled();
  });

  it("maps stable backend errors without exposing Firebase details", () => {
    expect(refundPolicyErrorMessage({code: "functions/invalid-argument"}))
      .toBe("Check the refund percentages and try again.");
    expect(refundPolicyErrorMessage({code: "functions/permission-denied"}, true))
      .toBe("This package is not available for your Provider account.");
    expect(refundPolicyErrorMessage({code: "functions/failed-precondition"}))
      .toBe("This refund policy can’t be updated right now.");
  });
});
