import {Timestamp} from "firebase-admin/firestore";
import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {parseProviderAgreementSnapshot} from "@/lib/provider/provider-agreement-record";

const mocks = vi.hoisted(() => ({account: vi.fn(), load: vi.fn(), agreement: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({
  requireProvider: mocks.account,
  requireVerifiedEmail: (account: unknown) => account,
  loadProviderOnboardingDraft: mocks.load,
  loadProviderOnboardingReview: mocks.load,
}));
vi.mock("@/lib/documents/document-catalog-service", () => ({getProviderOnboardingAgreement: mocks.agreement}));
vi.mock("@/lib/service-categories/service-category-service", () => ({getActiveServiceCategoryOptions: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: vi.fn((path: string) => {throw new Error(`redirect:${path}`);}), useRouter: () => ({push: vi.fn(), refresh: vi.fn()})}));
vi.mock("@/lib/auth/provider-client", () => ({saveProviderOnboardingDraft: vi.fn(), registerProviderBusiness: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderOnboardingImage: vi.fn(), deleteProviderOnboardingImage: vi.fn()}));

import Page from "@/app/provider/onboarding/[step]/page";

function expectPlain(value: unknown) {
  if (value === null || typeof value !== "object") {
    expect(typeof value).not.toBe("function");
    return;
  }
  expect(Object.getPrototypeOf(value)).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
  for (const child of Object.values(value)) expectPlain(child);
}

describe("consent server-to-client props", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([null, "draft", "resubmission_required"])("renders serializable consent data for status=%s", async (status) => {
    const existing = status !== null;
    const stamp = new Timestamp(1790640000, 123456789);
    const agreement = {
      code: "feasta_provider_agreement", name: "FEASTA Provider Agreement",
      version: "2026-09-29", effectiveDate: "2026-09-29",
      sections: [{title: "Original terms", paragraphs: ["The actual published agreement content."]}],
    };
    const snapshot = parseProviderAgreementSnapshot({...agreement, version: "2026-09-27", acceptedAt: stamp})!;
    // The parser rebuilds sections but retains the Timestamp class instance.
    expect(snapshot.acceptedAt).toBe(stamp);
    expectPlain(snapshot.sections);
    mocks.account.mockResolvedValue({providerId: existing ? "provider" : null, provider: existing ? {verificationStatus: status} : null});
    mocks.agreement.mockResolvedValue({...agreement, versions: [{publishedAt: stamp}]});
    mocks.load.mockResolvedValue({
      completedSteps: [1, 2, 3, 4, 5, 6], ownerFirstName: "Ada", ownerLastName: "Lovelace",
      ownerEmail: "owner@example.test", ownerPhone: "+639171234567", businessName: "Ada's Kitchen",
      providerAgreementAccepted: true, providerAgreementVersion: snapshot.version,
      providerAgreementSnapshot: snapshot,
    });
    const page = await Page({params: Promise.resolve({step: "consent"})});
    const props = page.props.children.props;
    expect(props.step.number).toBe(6);
    expect(props.editingExistingApplication).toBe(existing || undefined);
    expectPlain(props);
    expect(JSON.parse(JSON.stringify(props))).toEqual(props);
    expect(props.draft.providerAgreementSnapshot.acceptedAt).toEqual({seconds: stamp.seconds, nanoseconds: stamp.nanoseconds});
    expect(props.draft.providerAgreementSnapshot.version).toBe(snapshot.version);
    expect(props.agreement).toEqual(agreement);
    expect(snapshot.acceptedAt).toBe(stamp);
    const view = render(page);
    expect(screen.getByText("The actual published agreement content.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", {name: "I have read and agree to the FEASTA Provider Agreement."})).toBeRequired();
    view.unmount();
  });

  it.each(["submitted", "under_review", "approved"])("does not reopen a locked %s application", async (status) => {
    mocks.account.mockResolvedValue({providerId: "provider", provider: {verificationStatus: status, isActive: true}});
    await expect(Page({params: Promise.resolve({step: "consent"})})).rejects.toThrow(
      `redirect:${status === "approved" ? "/provider" : "/provider/status"}`,
    );
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
