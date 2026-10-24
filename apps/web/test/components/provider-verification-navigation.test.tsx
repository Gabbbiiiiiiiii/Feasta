import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {BusinessProfileBackLink} from "@/components/provider/business-profile-back-link";
import ProviderVerificationPage from "@/app/provider/verification/page";
import ProviderStatusPage from "@/app/provider/status/page";

const mocks = vi.hoisted(() => ({account: vi.fn(), verification: vi.fn(), redirect: vi.fn(), review: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({
  requireProvider: mocks.account,
  requireVerifiedProviderIdentity: (account: unknown) => account,
  loadOwnedProviderVerification: mocks.verification,
  loadProviderOnboardingReview: mocks.review,
}));
vi.mock("next/navigation", () => ({redirect: mocks.redirect}));
vi.mock("@/lib/service-categories/service-category-service", () => ({getActiveServiceCategoryOptions: async () => []}));
vi.mock("@/lib/provider/onboarding-readiness", () => ({providerProfileCompletedSteps: () => []}));
vi.mock("@/app/provider/verification/provider-verification-actions", () => ({ProviderVerificationActions: () => <div>Verification actions</div>}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((path) => {throw new Error(`redirect:${path}`);});
  mocks.account.mockResolvedValue({provider: {id: "provider-one", verificationStatus: "draft"}});
  mocks.verification.mockResolvedValue({
    id: "verification-one", consent: {termsAccepted: false, privacyAccepted: false},
    requiredDocumentsReady: false, editable: true, documents: [], history: [],
    policy: {requiredAll: [], requiredOneOf: []}, documentCatalog: [],
  });
  mocks.review.mockResolvedValue({});
});

function assertBackLink() {
  const link = screen.getByRole("link", {name: "Back to Business Profile"});
  expect(link).toHaveAttribute("href", "/provider/business-profile");
  expect(link).toBeVisible();
  expect(link).toHaveClass("hover:bg-accent", "focus-visible:ring-2", "min-h-12");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByRole("link", {name: "Back to Business Profile"})).toHaveLength(1);
  const heading = screen.getByRole("heading", {level: 1});
  expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("Business Verification return navigation", () => {
  it("places one accessible back arrow above the verification title", async () => {
    render(await ProviderVerificationPage({searchParams: Promise.resolve({})}));
    assertBackLink();
    expect(screen.getByText("Verification actions")).toBeInTheDocument();
  });

  it("keeps the existing approved-provider redirect and shows the link on its destination", async () => {
    mocks.account.mockResolvedValue({provider: {id: "provider-one", verificationStatus: "approved"}});
    await expect(ProviderVerificationPage({searchParams: Promise.resolve({})})).rejects.toThrow("redirect:/provider/status");
    expect(mocks.review).not.toHaveBeenCalled();
    render(await ProviderStatusPage());
    assertBackLink();
  });

  it("keeps the arrow visible without breakpoint hiding classes", () => {
    render(<BusinessProfileBackLink />);
    const link = screen.getByRole("link", {name: "Back to Business Profile"});
    expect(link).toBeVisible();
    expect(link.className).not.toMatch(/(?:^|\s)(?:\w+:)?hidden(?:\s|$)/);
    expect(link).toHaveClass("justify-self-start");
  });
});
