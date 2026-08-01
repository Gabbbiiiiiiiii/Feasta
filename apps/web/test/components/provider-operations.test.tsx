import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderOnboardingStepForm} from "@/app/provider/onboarding/[step]/provider-onboarding-step-form";
import {
  PROVIDER_ONBOARDING_STEPS,
  type ProviderOnboardingDraft,
} from "@/lib/provider/onboarding";

const saveDraft = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/auth/provider-client", () => ({
  saveProviderOnboardingDraft: (...args: unknown[]) => saveDraft(...args),
  registerProviderBusiness: vi.fn(),
}));

vi.mock("@/lib/provider/provider-media-client", () => ({
  uploadProviderOnboardingImage: vi.fn(),
  deleteProviderOnboardingImage: vi.fn(),
}));

const draft: ProviderOnboardingDraft = {
  ownerFirstName: "Ana",
  ownerLastName: "Reyes",
  ownerPhone: "+639171234567",
  ownerEmail: "ana@example.test",
  businessName: "Ana Events",
  businessEmail: "business@example.test",
  businessPhone: "+639181234567",
  description: "Full service catering for events.",
  providerServiceType: "catering",
  providerCategory: "catering_service",
  serviceCategories: ["catering_service"],
  address: "123 Main Street",
  city: "Ormoc City",
  province: "Leyte",
  locationCoordinates: null,
  serviceAreas: ["Ormoc City"],
  maxServiceDistanceKm: 80,
  eventTypesSupported: ["wedding"],
  minGuestsPerEvent: 20,
  maxGuestsPerEvent: 500,
  acceptsMultipleEventsPerDay: false,
  maxEventsPerDay: 1,
  availableStaffCount: 10,
  availableEquipmentCount: 50,
  operatingDays: ["monday"],
  bookingLeadTimeDays: 7,
  unavailableDates: [],
  logoUrl: null,
  logoPublicId: null,
  coverImageUrl: null,
  coverPublicId: null,
  acceptedTerms: false,
  acceptedPrivacy: false,
  termsPolicyVersion: "unversioned",
  privacyPolicyVersion: "unversioned",
  completedSteps: [1, 2, 3, 4],
};

describe("provider operations onboarding", () => {
  beforeEach(() => {
    saveDraft.mockReset();
    saveDraft.mockResolvedValue({completedSteps: [1, 2, 3, 4, 5], nextStep: 6});
    push.mockReset();
  });

  it("renders accessible responsive capacity and scheduling controls", () => {
    const {container} = render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[4]}
        draft={draft}
      />,
    );

    expect(screen.getByRole("spinbutton", {
      name: /minimum guests per event/iu,
    })).toHaveAttribute("min", "1");
    expect(screen.getByRole("group", {
      name: /operating days/iu,
    })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", {
      name: "Monday",
    })).toBeChecked();
    expect(screen.getByText(/verified separately/iu)).toBeInTheDocument();
    expect(container.querySelector("form")).toHaveClass("min-w-0");
  });

  it("persists canonical operations values through the trusted draft call", async () => {
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[4]}
        draft={draft}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", {
      name: /maximum guests per event/iu,
    }), {target: {value: "600"}});
    fireEvent.click(screen.getByRole("checkbox", {name: "Tuesday"}));
    fireEvent.click(screen.getByRole("button", {name: /save and continue/iu}));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        minGuestsPerEvent: 20,
        maxGuestsPerEvent: 600,
        operatingDays: ["monday", "tuesday"],
        bookingLeadTimeDays: 7,
      }),
    ));
  });

  it("shows field errors instead of sending impossible capacity", async () => {
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[4]}
        draft={draft}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton", {
      name: /minimum guests per event/iu,
    }), {target: {value: "900"}});
    fireEvent.click(screen.getByRole("button", {name: /save and continue/iu}));

    expect(await screen.findByText(/not exceed the maximum/iu))
      .toBeInTheDocument();
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
