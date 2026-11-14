import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {FavoriteProviderList} from "@/components/customer/favorites/favorite-provider-list";
import {ProviderFavoriteControl} from "@/components/customer/favorites/provider-favorite-control";
import {ProviderCard} from "@/components/customer/providers/provider-card";
import {ProviderProfile} from "@/components/customer/providers/provider-profile";
import type {PublicProviderDetail} from "@/lib/customer/providers/provider-detail-types";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  setFavorite: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: mocks.refresh}),
}));

vi.mock("@/app/customer/favorites/actions", () => ({
  setProviderFavoriteAction: mocks.setFavorite,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {
    success: mocks.success,
    error: mocks.error,
  },
}));

const provider: PublicProvider = {
  id: "provider-one",
  businessName: "Ana Events",
  description: "Event styling and coordination.",
  serviceType: "addon",
  primaryCategory: "event_coordinator",
  categories: ["event_coordinator"],
  location: "Ormoc City, Leyte",
  serviceAreas: ["Ormoc City"],
  eventTypes: ["wedding"],
  operatingDays: ["monday"],
  bookingLeadTimeDays: 7,
  minimumGuests: 20,
  maximumGuests: 150,
  logoUrl: null,
  coverImageUrl: null,
  approvalLabel: "Approved",
};

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.setFavorite.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe("customer provider favorites", () => {
  it("renders the protected Favorites empty state with a real marketplace CTA", () => {
    render(<FavoriteProviderList providers={[]} />);

    expect(screen.getByRole("heading", {
      name: "No favorite providers yet",
    })).toBeVisible();
    expect(screen.getByRole("link", {name: "Explore providers"}))
      .toHaveAttribute("href", "/customer/providers");
  });

  it("reuses provider cards and keeps the heart outside provider navigation", () => {
    render(<FavoriteProviderList providers={[provider]} />);

    const remove = screen.getByRole("button", {
      name: `Remove ${provider.businessName} from favorites`,
    });
    expect(remove).toHaveAttribute("aria-pressed", "true");
    expect(remove.closest("a")).toBeNull();
    expect(screen.getByRole("link", {
      name: `View ${provider.businessName} public provider profile`,
    })).toHaveAttribute("href", "/customer/providers/provider-one");
  });

  it("sends guests through login with a safe provider-profile return path", () => {
    render(
      <ProviderCard
        provider={provider}
        marketplaceHref="/customer/providers?q=events"
        favoriteState={{authenticated: false, favorited: false}}
      />,
    );

    expect(screen.getByRole("link", {
      name: `Add ${provider.businessName} to favorites. Log in required.`,
    })).toHaveAttribute(
      "href",
      "/login?next=%2Fcustomer%2Fproviders%2Fprovider-one%3FreturnTo%3D%252Fcustomer%252Fproviders%253Fq%253Devents",
    );
  });

  it("optimistically adds a favorite and refreshes authoritative server state", async () => {
    const user = userEvent.setup();
    mocks.setFavorite.mockResolvedValueOnce({favorited: true});
    render(
      <ProviderFavoriteControl
        providerId={provider.id}
        providerName={provider.businessName}
        initialFavorited={false}
        authenticated
        loginReturnTo="/customer/providers/provider-one"
      />,
    );

    await user.click(screen.getByRole("button", {
      name: `Add ${provider.businessName} to favorites`,
    }));

    await waitFor(() => expect(mocks.setFavorite).toHaveBeenCalledWith({
      providerId: provider.id,
      favorite: true,
    }));
    expect(await screen.findByRole("button", {
      name: `Remove ${provider.businessName} from favorites`,
    })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("rolls back optimistic state and reports a safe mutation error", async () => {
    const user = userEvent.setup();
    mocks.setFavorite.mockRejectedValueOnce(new Error("private backend detail"));
    render(
      <ProviderFavoriteControl
        providerId={provider.id}
        providerName={provider.businessName}
        initialFavorited
        authenticated
        loginReturnTo="/customer/providers/provider-one"
      />,
    );

    await user.click(screen.getByRole("button", {
      name: `Remove ${provider.businessName} from favorites`,
    }));

    expect(await screen.findByRole("button", {
      name: `Remove ${provider.businessName} from favorites`,
    })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.error).toHaveBeenCalledWith(
      "Your favorites could not be updated. Please try again.",
    );
  });

  it("exposes the same real favorite action from the provider profile", () => {
    const detail: PublicProviderDetail = {provider, packages: []};
    render(
      <ProviderProfile
        detail={detail}
        favoriteState={{
          authenticated: true,
          favorited: false,
          loginReturnTo: "/customer/providers/provider-one",
        }}
      />,
    );

    expect(screen.getByRole("button", {
      name: `Add ${provider.businessName} to favorites`,
    })).toHaveTextContent("Save provider");
  });
});
