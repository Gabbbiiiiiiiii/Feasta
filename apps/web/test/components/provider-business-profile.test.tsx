import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  ProviderBusinessProfile,
  UpdateProviderBusinessProfileInput,
} from "@/lib/provider/business-profile/provider-business-profile-types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: mocks.refresh}),
}));

vi.mock("@/lib/provider/business-profile/provider-business-profile-client", () => ({
  updateProviderBusinessProfile: mocks.update,
}));

vi.mock("@/lib/provider/provider-media-client", () => ({
  uploadProviderOnboardingImage: mocks.upload,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

import {
  ProviderBusinessProfileClient,
} from "@/app/provider/business-profile/provider-business-profile-client";
import ProviderBusinessProfileLoading from "@/app/provider/business-profile/loading";

function profile(
  overrides: Partial<ProviderBusinessProfile> = {},
): ProviderBusinessProfile {
  return {
    providerId: "provider-one",
    businessName: "Feasta Creative Studio",
    businessEmail: "studio@example.test",
    businessPhone: "+639171234567",
    description: "Photo, video, and creative event coverage for celebrations.",
    address: "123 Bonifacio Street",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "addon",
    primaryServiceCategory: "photographer",
    serviceCategories: ["photographer", "videographer"],
    serviceAreas: ["Ormoc City"],
    eventTypesSupported: ["wedding"],
    maxServiceDistanceKm: 75,
    logo: {
      url: "https://res.cloudinary.com/demo/image/upload/v1/feasta/providers/owner-one/onboarding/logo.jpg",
      publicId: "feasta/providers/owner-one/onboarding/logo",
    },
    coverImage: {
      url: "https://res.cloudinary.com/demo/image/upload/v1/feasta/providers/owner-one/onboarding/cover.jpg",
      publicId: "feasta/providers/owner-one/onboarding/cover",
    },
    updatedAt: "2026-08-22T01:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:business-profile-preview");
  URL.revokeObjectURL = vi.fn();
  mocks.update.mockResolvedValue({
    providerId: "provider-one",
    updated: true,
    updatedFields: [],
  });
  mocks.upload.mockImplementation(async (mediaType: "logo" | "cover") => ({
    url: `https://res.cloudinary.com/demo/image/upload/v2/feasta/providers/owner-one/onboarding/${mediaType}.webp`,
    publicId: `feasta/providers/owner-one/onboarding/${mediaType}`,
  }));
});

describe("provider Business Profile workspace", () => {
  it("announces the protected server route loading state", () => {
    render(<ProviderBusinessProfileLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading business profile");
    expect(screen.getByRole("heading", {level: 1, name: "Business Profile"}))
      .toBeVisible();
  });

  it("renders canonical public context, editable fields, and verified values as read-only", () => {
    const {container} = render(
      <ProviderBusinessProfileClient initialProfile={profile()} />,
    );

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: "Business Profile"}))
      .toBeVisible();
    expect(screen.getByRole("heading", {name: "Verified business information"}))
      .toBeVisible();
    expect(screen.getAllByText("Feasta Creative Studio").length).toBeGreaterThan(0);
    expect(screen.getByText("studio@example.test")).toBeVisible();
    expect(screen.getAllByText("Event services").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Photographer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Videographer").length).toBeGreaterThan(0);

    for (const name of [
      "Description",
      "Business phone",
      "Address",
      "City",
      "Province",
      "Business logo",
      "Cover photo",
    ]) {
      expect(screen.getByLabelText(new RegExp(`^${name}`, "i"))).toBeVisible();
    }

    expect(screen.queryByRole("textbox", {name: "Business name"}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", {name: "Business email"}))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Provider service type"))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", {name: "Service categories"}))
      .not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("min-w-0");
    expect(screen.getByText(/read-only here/i)).toBeVisible();
  });

  it("keeps save disabled until dirty and sends only normalized allowed changes", async () => {
    const user = userEvent.setup();
    render(<ProviderBusinessProfileClient initialProfile={profile()} />);
    const save = screen.getByRole("button", {name: "Save Business Profile"});
    expect(save).toBeDisabled();

    const city = screen.getByLabelText(/^City/i);
    await user.clear(city);
    await user.type(city, "  Tacloban City  ");
    expect(save).toBeEnabled();
    expect(screen.getByText("You have unsaved changes.")).toBeVisible();
    await user.click(save);

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      city: "Tacloban City",
    } satisfies UpdateProviderBusinessProfileInput));
    const payload = mocks.update.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["city"]);
    expect(payload).not.toHaveProperty("providerId");
    expect(payload).not.toHaveProperty("businessName");
    expect(payload).not.toHaveProperty("businessEmail");
    expect(payload).not.toHaveProperty("providerServiceType");
    expect(payload).not.toHaveProperty("serviceCategories");
    expect(await screen.findByText("Business profile saved.")).toBeVisible();
    expect(save).toBeDisabled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("preserves user input and announces a normalized failure", async () => {
    mocks.update.mockRejectedValueOnce(new Error(
      "The business profile could not be updated. Please try again.",
    ));
    const user = userEvent.setup();
    render(<ProviderBusinessProfileClient initialProfile={profile()} />);
    const description = screen.getByLabelText(/^Description/i);
    await user.clear(description);
    await user.type(description, "A newly written public business description.");
    await user.click(screen.getByRole("button", {name: "Save Business Profile"}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The business profile could not be updated. Please try again.",
    );
    expect(description).toHaveValue("A newly written public business description.");
    expect(screen.getByRole("button", {name: "Save Business Profile"}))
      .toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("uploads and replaces logo and cover through the existing secured media client", async () => {
    const user = userEvent.setup();
    render(<ProviderBusinessProfileClient initialProfile={profile()} />);
    expect(screen.getByAltText("Feasta Creative Studio logo"))
      .toHaveAttribute("src", expect.stringContaining("/v1/"));
    expect(screen.getByAltText("Feasta Creative Studio cover"))
      .toHaveAttribute("src", expect.stringContaining("/v1/"));

    const logoFile = new File(["logo"], "logo.webp", {type: "image/webp"});
    const coverFile = new File(["cover"], "cover.jpg", {type: "image/jpeg"});
    await user.upload(screen.getByLabelText("Business logo"), logoFile);
    await user.upload(screen.getByLabelText("Cover photo"), coverFile);
    expect(screen.getByAltText("Business logo preview"))
      .toHaveAttribute("src", "blob:business-profile-preview");
    expect(screen.getByAltText("Cover photo preview"))
      .toHaveAttribute("src", "blob:business-profile-preview");
    await user.click(screen.getByRole("button", {name: "Save Business Profile"}));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenNthCalledWith(1, "logo", logoFile);
    expect(mocks.upload).toHaveBeenNthCalledWith(2, "cover", coverFile);
    expect(mocks.update).toHaveBeenCalledWith({
      logo: expect.objectContaining({publicId: expect.stringContaining("/logo")}),
      coverImage: expect.objectContaining({publicId: expect.stringContaining("/cover")}),
    });
  });

  it("removes logo and cover only after an explicit save", async () => {
    const user = userEvent.setup();
    render(<ProviderBusinessProfileClient initialProfile={profile()} />);
    await user.click(screen.getByRole("button", {name: "Remove business logo"}));
    await user.click(screen.getByRole("button", {name: "Remove cover photo"}));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Business logo preview unavailable")).toBeVisible();
    expect(screen.getByLabelText("Cover photo preview unavailable")).toBeVisible();

    await user.click(screen.getByRole("button", {name: "Save Business Profile"}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      logo: null,
      coverImage: null,
    }));
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("validates media before upload and supports discard recovery", async () => {
    const user = userEvent.setup();
    render(<ProviderBusinessProfileClient initialProfile={profile()} />);
    const invalid = new File(["bad"], "logo.gif", {type: "image/gif"});
    fireEvent.change(screen.getByLabelText("Business logo"), {
      target: {files: [invalid]},
    });
    expect(await screen.findByText("Choose a JPEG, PNG, or WebP image."))
      .toBeVisible();
    expect(mocks.upload).not.toHaveBeenCalled();

    const phone = screen.getByLabelText(/^Business phone/i);
    await user.clear(phone);
    await user.type(phone, "09181234567");
    await user.click(screen.getByRole("button", {name: "Discard changes"}));
    expect(phone).toHaveValue("+639171234567");
    expect(screen.getByRole("button", {name: "Save Business Profile"}))
      .toBeDisabled();
  });

  it.each([
    ["catering", ["catering_service"], "Catering", "Catering Service"],
    ["addon", ["florist"], "Event services", "Florist"],
    ["both", ["catering_service", "event_host_emcee"], "Catering and event services", "Event Host Emcee"],
  ] as const)(
    "renders %s capability data without category-specific UI branches",
    (providerServiceType, serviceCategories, typeLabel, categoryLabel) => {
      render(<ProviderBusinessProfileClient initialProfile={profile({
        providerServiceType,
        primaryServiceCategory: serviceCategories[0],
        serviceCategories,
      })} />);
      expect(screen.getAllByText(typeLabel).length).toBeGreaterThan(0);
      expect(screen.getAllByText(categoryLabel).length).toBeGreaterThan(0);
      expect(screen.getByRole("form", {name: "Business profile"})).toBeDefined();
    },
  );
});
