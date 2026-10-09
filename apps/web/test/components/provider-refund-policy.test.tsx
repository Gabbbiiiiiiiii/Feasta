import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {ProviderRefundPolicyPageDto} from "@/lib/provider/refund-policy/provider-refund-policy-types";
import {
  formatBasisPoints,
  parsePercentToBasisPoints,
  validateRefundPolicy,
} from "@/lib/provider/refund-policy/provider-refund-policy-validation";

const mutations = vi.hoisted(() => ({
  publish: vi.fn(),
  setOverride: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: mutations.refresh}),
}));

vi.mock("@/lib/provider/refund-policy/provider-refund-policy-client", () => ({
  publishProviderRefundPolicy: (...args: unknown[]) => mutations.publish(...args),
  setPackageRefundPolicyOverride: (...args: unknown[]) => mutations.setOverride(...args),
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
      {stage: "preparation_started", refundBasisPoints: 5_025},
      {stage: "service_started", refundBasisPoints: 0},
    ],
  },
  packages: [
    {
      packageId: "package_default",
      name: "Classic Celebration",
      status: "published",
      policySource: "provider_default",
      override: null,
    },
    {
      packageId: "package_override",
      name: "Premium Wedding",
      status: "draft",
      policySource: "package_override",
      override: {
        source: "package_override",
        version: 2,
        effectiveAt: "2026-08-30T02:00:00.000Z",
        terms: null,
        rules: [
          {stage: "preparation_not_started", refundBasisPoints: 7_500},
          {stage: "preparation_started", refundBasisPoints: 2_500},
          {stage: "service_started", refundBasisPoints: 0},
        ],
      },
    },
  ],
};

describe("Provider refund policy percentage conversion", () => {
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

  it("rejects terms longer than 4,000 characters", () => {
    const result = validateRefundPolicy({
      preparation_not_started: "100",
      preparation_started: "50",
      service_started: "0",
    }, "x".repeat(4_001));
    expect(result.draft).toBeNull();
    expect(result.errors.terms).toMatch(/4,000/iu);
  });
});

describe("Provider refund policy management", () => {
  beforeEach(() => {
    mutations.publish.mockReset().mockResolvedValue({success: true, policyVersion: 4});
    mutations.setOverride.mockReset().mockResolvedValue({success: true});
    mutations.refresh.mockReset();
  });

  it("renders the default-policy empty state and package empty state", () => {
    render(<ProviderRefundPolicyClient data={{providerPolicy: null, packages: []}} />);
    expect(screen.getByRole("heading", {name: "Refund Policy"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Create Policy"})).toBeEnabled();
    expect(screen.getByText(/required before refund-policy-backed bookings/iu))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "No packages to configure"}))
      .toBeInTheDocument();
  });

  it("renders an existing safe policy, all percentages, terms, version, and package sources", () => {
    render(<ProviderRefundPolicyClient data={existingData} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("50.25%")).toBeInTheDocument();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getByText("Cancellations must be submitted in writing."))
      .toBeInTheDocument();
    expect(screen.getByText("Version 3")).toBeInTheDocument();
    expect(screen.getByText("Uses Provider Default")).toBeInTheDocument();
    expect(screen.getByText("Package Override")).toBeInTheDocument();
  });

  it("validates labeled fields, confirms publishing, and sends only a complete draft", async () => {
    const user = userEvent.setup();
    render(<ProviderRefundPolicyClient data={{providerPolicy: null, packages: []}} />);
    await user.click(screen.getByRole("button", {name: "Create Policy"}));

    const notStarted = screen.getByRole("textbox", {name: /preparation not started/iu});
    const started = screen.getByRole("textbox", {name: /^preparation started/iu});
    const service = screen.getByRole("textbox", {name: /service started/iu});
    await user.clear(notStarted);
    await user.type(notStarted, "75.25");
    await user.clear(started);
    await user.type(started, "50");
    await user.clear(service);
    await user.type(service, "0");
    await user.type(screen.getByRole("textbox", {name: /additional policy terms/iu}), "Plain terms");

    await user.click(screen.getByRole("button", {name: "Publish Policy"}));
    expect(mutations.publish).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/existing bookings keep their original agreed policy/iu))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", {name: "Publish Policy"}));

    await waitFor(() => expect(mutations.publish).toHaveBeenCalledTimes(1));
    const payload = mutations.publish.mock.calls[0][0];
    expect(payload).toEqual({
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 7_525},
        {stage: "preparation_started", refundBasisPoints: 5_000},
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
    render(<ProviderRefundPolicyClient data={{providerPolicy: null, packages: []}} />);
    await user.click(screen.getByRole("button", {name: "Create Policy"}));
    const input = screen.getByRole("textbox", {name: /preparation not started/iu});
    fireEvent.change(input, {target: {value: "1e2"}});
    await user.click(screen.getByRole("button", {name: "Publish Policy"}));
    expect(screen.getByText(/up to two decimal places/iu)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mutations.publish).not.toHaveBeenCalled();
  });

  it("prefills a new full package override from the Provider default", async () => {
    const user = userEvent.setup();
    render(<ProviderRefundPolicyClient data={existingData} />);
    await user.click(screen.getByRole("button", {
      name: "Create refund policy override for Classic Celebration",
    }));
    expect(screen.getByText(/prefilled from your current Provider default/iu))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", {name: /preparation not started/iu}))
      .toHaveValue("100");
    expect(screen.getByRole("textbox", {name: /^preparation started/iu}))
      .toHaveValue("50.25");

    await user.click(screen.getByRole("button", {name: "Publish Override"}));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", {name: "Publish Override"}));
    await waitFor(() => expect(mutations.setOverride).toHaveBeenCalled());
    expect(mutations.setOverride.mock.calls[0][0]).toBe("package_default");
    expect(mutations.setOverride.mock.calls[0][1].rules).toHaveLength(3);
  });

  it("requires removal confirmation and sends the backend null contract", async () => {
    const user = userEvent.setup();
    render(<ProviderRefundPolicyClient data={existingData} />);
    await user.click(screen.getByRole("button", {
      name: "Remove refund policy override for Premium Wedding",
    }));
    expect(mutations.setOverride).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/existing bookings keep the policy/iu))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", {name: "Remove Override"}));
    await waitFor(() => expect(mutations.setOverride)
      .toHaveBeenCalledWith("package_override", null));
    expect(await screen.findByText(/now uses your Provider default policy/iu))
      .toBeInTheDocument();
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
