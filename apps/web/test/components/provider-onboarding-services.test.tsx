import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderOnboardingStepForm} from "@/app/provider/onboarding/[step]/provider-onboarding-step-form";
import {
  loadProviderOnboardingDraft,
  loadProviderOnboardingReview,
  type SessionUser,
} from "@/lib/auth/session";
import {PROVIDER_ONBOARDING_STEPS} from "@/lib/provider/onboarding";

const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  save: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: mocks.push, refresh: vi.fn()}),
  redirect: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {},
  adminDb: {
    collection: (collection: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: mocks.records.has(`${collection}/${id}`),
          data: () => mocks.records.get(`${collection}/${id}`),
        }),
      }),
      where: () => ({limit: () => ({get: async () => ({docs: []})})}),
    }),
  },
}));
vi.mock("@/lib/auth/provider-client", () => ({
  saveProviderOnboardingDraft: mocks.save,
  registerProviderBusiness: vi.fn(),
}));
vi.mock("@/lib/provider/provider-media-client", () => ({
  uploadProviderOnboardingImage: vi.fn(),
  deleteProviderOnboardingImage: vi.fn(),
}));

const account: SessionUser = {
  uid: "owner", email: "owner@example.test", emailVerified: true,
  role: "provider", accountStatus: "active", isActive: true,
  isBlocked: false, isPhoneVerified: true, phoneNumber: "+639171234567",
  providerId: null, provider: null,
};
const categories = [
  {code: "catering_service", name: "Catering category", serviceType: "catering", status: "active"},
  {code: "photographer", name: "Photography category", serviceType: "addon", status: "active"},
] as const;
const catering = () => screen.getByRole("checkbox", {name: /^Catering services/});
const additional = () => screen.getByRole("checkbox", {name: /^Additional event services/});
const submit = () => fireEvent.click(screen.getByRole("button", {name: "Save and continue"}));

beforeEach(() => {
  mocks.records.clear();
  mocks.push.mockReset();
  mocks.save.mockReset().mockImplementation(async (_step, data) => {
    mocks.records.set("providerOnboardingDrafts/owner", data);
  });
});

describe("onboarding service group selection", () => {
  it("starts empty and blocks continuing until a service group is chosen", async () => {
    render(<ProviderOnboardingStepForm step={PROVIDER_ONBOARDING_STEPS[2]}
      draft={await loadProviderOnboardingDraft(account)} serviceCategories={categories} />);
    expect(catering()).not.toBeChecked();
    expect(additional()).not.toBeChecked();
    submit();
    expect(screen.getByText("Choose at least one service offering.")).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "invalid", "catering", "addon", "both"])(
    "restores saved %s selections through both server loaders",
    async (providerServiceType) => {
      for (const existing of [false, true]) {
        const data = {ownerId: "owner", verificationStatus: "draft", providerServiceType};
        mocks.records.set("providerOnboardingDrafts/owner", data);
        mocks.records.set("providers/provider", data);
        const draft = existing
          ? await loadProviderOnboardingReview({...account, providerId: "provider"})
          : await loadProviderOnboardingDraft(account);
        const view = render(<ProviderOnboardingStepForm step={PROVIDER_ONBOARDING_STEPS[2]}
          draft={draft} serviceCategories={categories} editingExistingApplication={existing} />);
        expect(catering()).toHaveProperty("checked", providerServiceType === "catering" || providerServiceType === "both");
        expect(additional()).toHaveProperty("checked", providerServiceType === "addon" || providerServiceType === "both");
        expect(mocks.save).not.toHaveBeenCalled();
        expect(data.providerServiceType).toBe(providerServiceType);
        view.unmount();
      }
    },
  );

  it.each(["catering", "addon", "both"] as const)(
    "saves an explicit %s selection and restores it on revisit",
    async (providerServiceType) => {
      const view = render(<ProviderOnboardingStepForm step={PROVIDER_ONBOARDING_STEPS[2]}
        draft={await loadProviderOnboardingDraft(account)} serviceCategories={categories} />);
      if (providerServiceType !== "addon") {
        fireEvent.click(catering());
        fireEvent.click(screen.getByRole("checkbox", {name: "Catering category"}));
      }
      if (providerServiceType !== "catering") {
        fireEvent.click(additional());
        fireEvent.click(screen.getByRole("checkbox", {name: "Photography category"}));
      }
      fireEvent.click(screen.getByRole("checkbox", {name: "Wedding"}));
      submit();
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/provider/onboarding/location"));
      expect(mocks.save).toHaveBeenCalledWith(3, expect.objectContaining({providerServiceType}));
      view.unmount();
      render(<ProviderOnboardingStepForm step={PROVIDER_ONBOARDING_STEPS[2]}
        draft={await loadProviderOnboardingDraft(account)} serviceCategories={categories} />);
      expect(catering()).toHaveProperty("checked", providerServiceType !== "addon");
      expect(additional()).toHaveProperty("checked", providerServiceType !== "catering");

      if (providerServiceType !== "addon") fireEvent.click(catering());
      if (providerServiceType !== "catering") fireEvent.click(additional());
      mocks.save.mockClear();
      mocks.push.mockClear();
      submit();
      expect(screen.getByText("Choose at least one service offering.")).toBeInTheDocument();
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );
});
