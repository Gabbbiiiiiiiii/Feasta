import {readFileSync} from "node:fs";
import {join} from "node:path";

import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {AdminAgreementTemplate} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {PROVIDER_ONBOARDING_STEPS} from "@/lib/provider/onboarding";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn(), refresh: vi.fn(), replace: vi.fn()}),
}));
vi.mock("@/lib/auth/provider-client", () => ({
  saveProviderOnboardingDraft: mocks.save,
  registerProviderBusiness: mocks.register,
}));
vi.mock("@/lib/provider/provider-media-client", () => ({
  uploadProviderOnboardingImage: vi.fn(),
  deleteProviderOnboardingImage: vi.fn(),
}));

import {ProviderOnboardingStepForm} from "@/app/provider/onboarding/[step]/provider-onboarding-step-form";

const agreement: AdminAgreementTemplate = {
  code: "feasta_provider_agreement",
  categoryCode: "agreements",
  name: "FEASTA Provider Agreement",
  summary: "Provider responsibilities.",
  version: "2026-09-29",
  effectiveDate: "2026-09-29",
  sections: [
    {
      title: "1. About this agreement",
      paragraphs: ["Providers remain responsible for the services they offer."],
    },
  ],
  useForProviderOnboarding: true,
  status: "active",
  sortName: "feasta provider agreement",
};

function renderAgreement(snapshot = false) {
  return render(
    <ProviderOnboardingStepForm
      step={PROVIDER_ONBOARDING_STEPS[5]}
      agreement={agreement}
      draft={{
        ownerFirstName: " Ada ",
        ownerLastName: " Lovelace ",
        ownerPhone: "+639171234567",
        ownerEmail: "owner@example.test",
        businessName: "Ada's Kitchen",
        providerAgreementAccepted: false,
        providerAgreementVersion: "client-picked-version",
        providerAgreementSnapshot: snapshot
          ? {
              code: "feasta_provider_agreement",
              name: "FEASTA Provider Agreement",
              version: "2026-09-27",
              effectiveDate: "2026-09-27",
              sections: agreement.sections,
              acceptedAt: {seconds: 1},
            }
          : null,
        completedSteps: [1, 2, 3, 4, 5],
      }}
    />,
  );
}

function reachAgreementEnd() {
  const scroller = screen.getByLabelText("Scrollable FEASTA Provider Agreement");
  Object.defineProperty(scroller, "scrollHeight", {configurable: true, value: 400});
  Object.defineProperty(scroller, "clientHeight", {configurable: true, value: 200});
  Object.defineProperty(scroller, "scrollTop", {configurable: true, value: 200});
  fireEvent.scroll(scroller);
}

describe("provider agreement acceptance", () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue({completedSteps: [6], nextStep: 7});
    mocks.register.mockReset();
  });

  it("shows a read-only agreement populated from provider data and the active agreement", () => {
    renderAgreement();
    const acceptance = screen.getByRole("region", {name: "Electronic Acceptance"});

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(acceptance).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(within(acceptance).getByText("Ada's Kitchen")).toBeInTheDocument();
    expect(within(acceptance).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(acceptance).getByText("FEASTA Provider Agreement")).toBeInTheDocument();
    expect(within(acceptance).getByText("2026-09-29")).toBeInTheDocument();
    expect(within(acceptance).getByText("September 29, 2026")).toBeInTheDocument();
    expect(within(acceptance).getByText("Not yet accepted")).toBeInTheDocument();
    expect(within(acceptance).queryByText("client-picked-version")).not.toBeInTheDocument();
    expect(screen.getByText("Providers remain responsible for the services they offer.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", {
      name: "I have read and agree to the FEASTA Provider Agreement.",
    })).toBeDisabled();
    expect(screen.getByRole("link", {name: "Download PDF"})).toHaveAttribute(
      "href",
      "/api/provider/agreement/pdf",
    );
    expect(screen.getByRole("button", {name: "Accept Agreement & Continue"})).toBeInTheDocument();
  });

  it("requires the acceptance checkbox and submits the active agreement version", async () => {
    const user = userEvent.setup();
    renderAgreement();
    reachAgreementEnd();
    const checkbox = screen.getByRole("checkbox", {
      name: "I have read and agree to the FEASTA Provider Agreement.",
    });
    expect(checkbox).toBeEnabled();

    const form = screen.getByRole("button", {name: "Accept Agreement & Continue"}).closest("form");
    fireEvent.submit(form!);
    expect(await screen.findByText("Accept the FEASTA Provider Agreement to continue.")).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();

    await user.click(checkbox);
    fireEvent.submit(form!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(6, {
      providerAgreementAccepted: true,
      providerAgreementVersion: "2026-09-29",
    }));
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty("businessName");
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty("sections");
  });

  it("offers the accepted copy after a snapshot has been recorded", () => {
    renderAgreement(true);
    expect(screen.getByRole("link", {name: "Download Accepted Copy"})).toHaveAttribute(
      "href",
      "/api/provider/agreement/pdf?copy=accepted",
    );
  });

  it("keeps onboarding, the full agreement page, and the PDF loader on one agreement source", () => {
    const root = process.cwd();
    const page = readFileSync(join(root, "src/app/provider-agreement/page.tsx"), "utf8");
    const onboarding = readFileSync(
      join(root, "src/app/provider/onboarding/[step]/page.tsx"),
      "utf8",
    );
    const download = readFileSync(
      join(root, "src/lib/provider/provider-agreement-download.ts"),
      "utf8",
    );
    const route = readFileSync(
      join(root, "src/app/api/provider/agreement/pdf/route.ts"),
      "utf8",
    );

    expect(page).toContain("getProviderOnboardingAgreement");
    expect(onboarding).toContain("getProviderOnboardingAgreement");
    expect(download).toContain("getProviderOnboardingAgreement");
    expect(download).not.toContain("PROVIDER_AGREEMENT_SECTIONS");
    expect(route).not.toContain("PROVIDER_AGREEMENT_SECTIONS");
    expect(page).toContain("ProviderAgreementAcceptanceSection");
  });
});
