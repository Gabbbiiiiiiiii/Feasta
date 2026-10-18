import {fireEvent, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderBusinessAgreementCard} from "@/components/provider/provider-business-agreement-card";
import {loadBusinessAgreementView} from "@/lib/provider/business-profile/provider-business-agreement-service";
import type {ProviderAgreementSnapshot} from "@/lib/provider/provider-agreement-record";

const mocks = vi.hoisted(() => ({acceptance: vi.fn(), published: vi.fn()}));
vi.mock("@/lib/provider/provider-agreement-download", () => ({loadProviderAgreementAcceptanceSummary: mocks.acceptance}));
vi.mock("@/lib/documents/document-catalog-service", () => ({getPublishedProviderAgreement: mocks.published}));

const historical: ProviderAgreementSnapshot = {
  code: "provider_agreement", name: "FEASTA Provider Agreement", version: "1.0",
  effectiveDate: "2025-01-01", sections: [{title: "Historical terms", paragraphs: ["Exact historical content.", "Final historical paragraph."]}],
  acceptedAt: {seconds: 1735689600, nanoseconds: 0},
};
const input = {uid: "owner-one", providerId: "provider-one"};
const summary = {
  businessName: "Test business", representativeName: "Test Owner", accepted: true,
  acceptedVersion: "1.0", acceptedAtLabel: "January 1, 2025, 08:00", snapshot: historical,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acceptance.mockResolvedValue(summary);
  mocks.published.mockResolvedValue({...historical, version: "2.0", sections: [{title: "Current terms", paragraphs: ["Current content."]}]});
});

describe("Business Profile read-only Provider Agreement", () => {
  it("adds no extra status restriction for an authenticated provider permitted to view the profile", async () => {
    const view = await loadBusinessAgreementView(input);
    render(<ProviderBusinessAgreementCard view={view} />);
    expect(screen.getByRole("heading", {name: "Provider Agreement"})).toBeVisible();
    expect(screen.getByRole("button", {name: "View Agreement"})).toBeEnabled();
    expect(mocks.acceptance).toHaveBeenCalledWith(input);
  });

  it("shows the accepted version/date and complete exact historical text without loading the current contract", async () => {
    const view = await loadBusinessAgreementView(input);
    render(<ProviderBusinessAgreementCard view={view} />);
    expect(screen.getByText("Accepted")).toBeVisible();
    expect(screen.getByText("1.0")).toBeVisible();
    expect(screen.getByText(/January 1, 2025/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", {name: "View Agreement"}));
    const dialog = screen.getByRole("dialog", {name: historical.name});
    expect(within(dialog).getByText("Exact historical content.")).toBeVisible();
    expect(within(dialog).getByText("Final historical paragraph.")).toBeVisible();
    expect(screen.queryByText("Current content.")).not.toBeInTheDocument();
    expect(mocks.published).not.toHaveBeenCalled();
  });

  it.each([null, {...historical, version: "0.9"}])("explains missing or mismatched historical content without substituting the current agreement", async (snapshot) => {
    mocks.acceptance.mockResolvedValue({...summary, snapshot});
    render(<ProviderBusinessAgreementCard view={await loadBusinessAgreementView(input)} />);
    expect(screen.getByText("1.0")).toBeVisible();
    await userEvent.click(screen.getByRole("button", {name: "View Agreement"}));
    expect(screen.getByRole("status")).toHaveTextContent("historical content for your accepted agreement is unavailable");
    expect(within(screen.getByRole("dialog")).getByRole("button", {name: "Download Agreement (PDF)"})).toBeDisabled();
    expect(screen.queryByRole("link", {name: "Download Agreement (PDF)"})).not.toBeInTheDocument();
    expect(mocks.published).not.toHaveBeenCalled();
  });

  it("uses the canonical published contract only when no acceptance is recorded", async () => {
    mocks.acceptance.mockResolvedValue({...summary, accepted: false, acceptedVersion: "", acceptedAtLabel: null, snapshot: null});
    render(<ProviderBusinessAgreementCard view={await loadBusinessAgreementView(input)} />);
    expect(screen.getByText("No acceptance recorded")).toBeVisible();
    await userEvent.click(screen.getByRole("button", {name: "View Agreement"}));
    expect(screen.getByText("Current content.")).toBeVisible();
    expect(screen.getByText(/Current agreement · Version 2.0/)).toBeVisible();
  });

  it("reports read failures without claiming no acceptance", async () => {
    mocks.acceptance.mockRejectedValue(new Error("offline"));
    render(<ProviderBusinessAgreementCard view={await loadBusinessAgreementView(input)} />);
    expect(screen.getByText("Unavailable")).toBeVisible();
    await userEvent.click(screen.getByRole("button", {name: "View Agreement"}));
    expect(screen.getByRole("status")).toHaveTextContent("could not be loaded");
  });

  it("opening, closing and reopening is read-only and restores focus", async () => {
    const view = await loadBusinessAgreementView(input);
    const before = JSON.stringify(view);
    render(<ProviderBusinessAgreementCard view={view} />);
    const trigger = screen.getByRole("button", {name: "View Agreement"});
    await userEvent.click(trigger);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /accept|save|submit/i})).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveClass("max-h-[calc(100dvh-2rem)]");
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    expect(JSON.stringify(view)).toBe(before);
    expect(mocks.acceptance).toHaveBeenCalledTimes(1);
    expect(mocks.published).not.toHaveBeenCalled();
  });

  it.each([{width: 390, height: 844}, {width: 1440, height: 900}])("keeps header and footer outside the single scrolling body at $width x $height", async ({width, height}) => {
    const oldWidth = window.innerWidth;
    const oldHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {configurable: true, value: width});
    Object.defineProperty(window, "innerHeight", {configurable: true, value: height});
    try {
      render(<ProviderBusinessAgreementCard view={await loadBusinessAgreementView(input)} />);
      await userEvent.click(screen.getByRole("button", {name: "View Agreement"}));
      const dialog = screen.getByRole("dialog", {name: "FEASTA Provider Agreement"});
      const body = within(dialog).getByRole("region", {name: "Agreement content"});
      const title = within(dialog).getByRole("heading", {name: "FEASTA Provider Agreement"});
      const x = within(dialog).getByRole("button", {name: "Close agreement"});
      const close = within(dialog).getByRole("button", {name: "Close"});
      const download = within(dialog).getByRole("link", {name: "Download Agreement (PDF)"});
      expect(dialog).toHaveClass("flex", "flex-col", "overflow-hidden", "max-h-[calc(100dvh-2rem)]");
      expect(dialog).not.toHaveClass("overflow-y-auto");
      expect(body).toHaveClass("min-h-0", "flex-1", "overflow-y-auto", "overscroll-contain");
      expect(title.closest("header")).toHaveClass("shrink-0");
      expect(close.parentElement).toHaveClass("shrink-0");
      expect(body).not.toContainElement(title);
      expect(body).not.toContainElement(x);
      expect(body).not.toContainElement(download);
      expect(body).not.toContainElement(close);
      expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
      fireEvent.scroll(body, {target: {scrollTop: 1000}});
      expect(title).toBeVisible();
      expect(x).toBeVisible();
      expect(download).toBeVisible();
      expect(close).toBeVisible();
      expect(document.body).toHaveAttribute("data-scroll-locked");
      await userEvent.click(x);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", {name: "View Agreement"})).toHaveFocus();
    } finally {
      Object.defineProperty(window, "innerWidth", {configurable: true, value: oldWidth});
      Object.defineProperty(window, "innerHeight", {configurable: true, value: oldHeight});
    }
  });

  it("offers only accepted-copy downloads on the card and footer without mutating consent", async () => {
    const view = await loadBusinessAgreementView(input);
    const before = JSON.stringify(view);
    render(<ProviderBusinessAgreementCard view={view} />);
    const cardDownload = screen.getByRole("link", {name: "Download Agreement (PDF)"});
    expect(cardDownload).toHaveAttribute("href", "/api/provider/agreement/pdf?copy=accepted");
    await userEvent.click(screen.getByRole("button", {name: "View Agreement"}));
    const dialog = screen.getByRole("dialog");
    const download = within(dialog).getByRole("link", {name: "Download Agreement (PDF)"});
    expect(download).toHaveAttribute("href", "/api/provider/agreement/pdf?copy=accepted");
    expect(download).toHaveAttribute("download");
    download.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(download);
    await userEvent.click(within(dialog).getByRole("button", {name: "Close"}));
    expect(JSON.stringify(view)).toBe(before);
    expect(mocks.acceptance).toHaveBeenCalledTimes(1);
    expect(mocks.published).not.toHaveBeenCalled();
  });
});
