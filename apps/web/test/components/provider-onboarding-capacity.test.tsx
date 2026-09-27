import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const savedCapacity = {
  ownerId: "owner",
  verificationStatus: "draft",
  providerServiceType: "addon",
  serviceCategories: ["photographer"],
  minGuestsPerEvent: 1,
  maxGuestsPerEvent: 100,
  availableStaffCount: 1,
  availableEquipmentCount: 0,
  bookingLeadTimeDays: 3,
  operatingDays: ["monday"],
  acceptsMultipleEventsPerDay: false,
  maxEventsPerDay: 1,
};
const field = (name: string) => screen.getByRole("spinbutton", {name: new RegExp(`^${name}`)});
const submit = () => fireEvent.click(screen.getByRole("button", {name: "Save and continue"}));

async function renderCapacity(data: Record<string, unknown> = savedCapacity, existing = false) {
  mocks.records.set("providerOnboardingDrafts/owner", data);
  mocks.records.set("providers/provider", data);
  const draft = existing
    ? await loadProviderOnboardingReview({...account, providerId: "provider"})
    : await loadProviderOnboardingDraft(account);
  return render(<ProviderOnboardingStepForm step={PROVIDER_ONBOARDING_STEPS[4]}
    draft={draft} editingExistingApplication={existing} />);
}

beforeEach(() => {
  mocks.records.clear();
  mocks.push.mockReset();
  mocks.save.mockReset().mockResolvedValue(undefined);
});

describe("provider onboarding capacity", () => {
  it("keeps legacy staff and equipment values internal without showing their inputs", async () => {
    await renderCapacity();

    expect(
      screen.queryByRole("spinbutton", {
        name: /^People available per event/,
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("spinbutton", {
        name: /^Service equipment/,
      }),
    ).not.toBeInTheDocument();

    submit();

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledOnce()
    );

    expect(mocks.save).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        availableStaffCount: 1,
        availableEquipmentCount: 0,
      }),
    );
  });
  it.each([
    "Minimum guests per event", "Maximum guests per event",
    "Maximum events per day", "Minimum booking notice",
  ])("allows select-all, delete, and replacement in %s", async (label) => {
    const user = userEvent.setup();
    await renderCapacity({...savedCapacity, serviceCategories: ["catering_service"], acceptsMultipleEventsPerDay: true});
    const input = field(label);
    await user.click(input);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(input).toHaveValue(null);
    await user.tab();
    expect(input).toHaveValue(null);
    submit();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(mocks.save).not.toHaveBeenCalled();
    await user.type(input, "5");
    expect(input).toHaveValue(5);
    if (label === "Maximum guests per event") {
      fireEvent.change(field("Minimum guests per event"), {target: {value: "1"}});
    }
    submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  });

  it.each([false, true])("keeps missing notice blank through the loader (existing=%s)", async (existing) => {
    await renderCapacity({...savedCapacity, bookingLeadTimeDays: undefined}, existing);
    expect(field("Minimum booking notice")).toHaveValue(null);
    submit();
    expect(screen.getByText("Enter your minimum booking notice.")).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires notice after clearing, then accepts explicit zero for same-day bookings", async () => {
    await renderCapacity();
    fireEvent.change(field("Minimum booking notice"), {target: {value: ""}});
    submit();
    expect(screen.getByText("Enter your minimum booking notice.")).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(field("Minimum booking notice"), {target: {value: "0"}});
    submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(5, expect.objectContaining({bookingLeadTimeDays: 0})));
  });

  it.each([false, true])("preserves saved booking notice and explicit zero (existing=%s)", async (existing) => {
    for (const notice of [0, 3]) {
      const view = await renderCapacity({...savedCapacity, bookingLeadTimeDays: notice}, existing);
      expect(field("Minimum booking notice")).toHaveValue(notice);
      view.unmount();
    }
  });

  it.each([
    ["Minimum booking notice", "366"],
    ["Minimum guests per event", "100001"],
    ["Maximum guests per event", "100001"],
    ["Maximum events per day", "101"],
  ])("rejects invalid whole-number values in %s", async (label, tooLarge) => {
    await renderCapacity({...savedCapacity, serviceCategories: ["catering_service"], acceptsMultipleEventsPerDay: true});
    const input = field(label);
    for (const invalid of ["", "-1", "1.5", "abc", tooLarge]) {
      fireEvent.change(input, {target: {value: invalid}});
      submit();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(mocks.save).not.toHaveBeenCalled();
    }
  });

  it("retains guest ordering and the single-event limit", async () => {
    await renderCapacity({...savedCapacity, serviceCategories: ["catering_service"], acceptsMultipleEventsPerDay: true});
    fireEvent.change(field("Minimum guests per event"), {target: {value: "101"}});
    submit();
    expect(field("Minimum guests per event")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(field("Minimum guests per event"), {target: {value: "1"}});
    fireEvent.change(field("Maximum events per day"), {target: {value: ""}});
    fireEvent.click(screen.getByRole("checkbox", {name: /^Accept multiple events/}));
    submit();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(5, expect.objectContaining({
      acceptsMultipleEventsPerDay: false, maxEventsPerDay: 1,
    })));
  });
});
