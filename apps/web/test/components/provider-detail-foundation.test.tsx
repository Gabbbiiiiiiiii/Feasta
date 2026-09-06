import {readFileSync} from "node:fs";
import {join} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import PublicProviderDetailError from "@/app/customer/providers/[providerId]/error";
import PublicProviderDetailLoading from "@/app/customer/providers/[providerId]/loading";
import PublicProviderNotFound from "@/app/customer/providers/[providerId]/not-found";
import {ProviderProfile} from "@/components/customer/providers/provider-profile";
import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
import {
  isPublicProviderRecord,
  normalizePublicProvider,
} from "@/lib/customer/providers/provider-normalization";
import type {PublicProviderDetail} from "@/lib/customer/providers/provider-detail-types";

vi.mock("@/app/customer/favorites/actions", () => ({
  setProviderFavoriteAction: vi.fn(),
}));

const provider = {
  id: "provider-one",
  businessName: "Ana Events and Celebrations with a Very Long Business Name",
  description: "Event styling and coordination for real celebrations.",
  serviceType: "addon",
  primaryCategory: "event_coordinator",
  categories: ["event_coordinator", "decorator_event_stylist"],
  location: "A deliberately long listed business location in Ormoc City, Leyte",
  serviceAreas: ["Ormoc City", "Kananga"],
  eventTypes: ["wedding", "birthday"],
  operatingDays: ["monday", "saturday"],
  bookingLeadTimeDays: 7,
  minimumGuests: 50,
  maximumGuests: 200,
  logoUrl: null,
  coverImageUrl: null,
  approvalLabel: "Approved",
} as const;

const detail: PublicProviderDetail = {
  provider,
  packages: [{
    id: "package-one",
    providerId: "provider-one",
    providerName: provider.businessName,
    name: "Wedding Coordination",
    description: "A published coordination package.",
    eventType: "wedding",
    price: 25000,
    imageUrl: null,
    minimumGuests: 50,
    maximumGuests: 150,
    inclusions: ["Coordination team"],
  }],
};

describe("public provider profile presentation", () => {
  it("renders only real public provider and package information", () => {
    render(<ProviderProfile detail={detail} />);

    expect(screen.getByRole("heading", {
      level: 1,
      name: provider.businessName,
    })).toBeVisible();
    expect(screen.getByRole("link", {
      name: "Back to providers",
    })).toHaveAttribute("href", "/customer/providers");
    expect(screen.getByText("Approved provider")).toBeVisible();
    expect(screen.getAllByText(provider.description)[0]).toBeVisible();
    const packageCard = screen.getByRole("article", {
      name: "Wedding Coordination published package",
    });
    expect(within(packageCard).getByRole("heading", {
      level: 3,
      name: "Wedding Coordination",
    })).toBeVisible();
    expect(within(packageCard).getByText("For Wedding events")).toBeVisible();
    expect(within(packageCard).getByText(detail.packages[0]!.description!))
      .not.toHaveClass("line-clamp-4");
    expect(within(packageCard).getByLabelText(/25,000/u)).toBeVisible();
    expect(within(packageCard).queryByRole("link")).not.toBeInTheDocument();
    expect(within(packageCard).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {
      level: 2,
      name: "Review now, request later",
    })).toBeVisible();
    expect(screen.getByText(/Booking and provider-request functionality/iu)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/ownerId|private email|phone|verification remarks/iu))
      .not.toBeInTheDocument();
  });

  it("shows an explicit package empty state without fabricating offers", () => {
    render(<ProviderProfile detail={{provider, packages: []}} />);
    expect(screen.getByRole("heading", {
      level: 3,
      name: "No public packages currently listed",
    })).toBeVisible();
    expect(screen.queryByText(/\brating\b|\breviews\b|starting at|available today/iu))
      .not.toBeInTheDocument();
  });

  it("preserves a validated marketplace return link without adding fake actions", () => {
    const backHref =
      "/customer/providers?q=coordination&service=addon&cursor=safe_cursor-1";
    render(<ProviderProfile detail={detail} backHref={backHref} />);
    expect(screen.getByRole("link", {name: "Back to providers"}))
      .toHaveAttribute("href", backHref);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the canonical directory for an unsafe return link", () => {
    render(<ProviderProfile
      detail={detail}
      backHref="https://evil.test/customer/providers"
    />);
    expect(screen.getByRole("link", {name: "Back to providers"}))
      .toHaveAttribute("href", "/customer/providers");
  });

  it("keeps unusually long package content readable without truncation", () => {
    const packageName =
      "Destination Wedding Coordination and Celebration Management Package";
    const packageDescription =
      "Detailed planning coverage for ceremonies, receptions, suppliers, guest logistics, and the published event schedule.";
    render(<ProviderProfile detail={{
      provider,
      packages: [{
        ...detail.packages[0]!,
        name: packageName,
        description: packageDescription,
        eventType: "multi_day_destination_wedding_celebration",
      }],
    }} />);

    expect(screen.getByRole("heading", {level: 3, name: packageName}))
      .toHaveClass("break-words");
    expect(screen.getByText(packageDescription))
      .not.toHaveClass("line-clamp-4");
    expect(screen.getAllByText(
      "Multi Day Destination Wedding Celebration",
    )[0]).toHaveClass("break-words");
  });

  it("handles missing optional profile and package fields without fake data", () => {
    const optionalProvider = {
      ...provider,
      description: null,
      primaryCategory: null,
      categories: [],
      location: null,
      serviceAreas: [],
      eventTypes: [],
      operatingDays: [],
      bookingLeadTimeDays: null,
      minimumGuests: null,
      maximumGuests: null,
      logoUrl: null,
      coverImageUrl: null,
    };
    const optionalDetail: PublicProviderDetail = {
      provider: optionalProvider,
      packages: [{
        ...detail.packages[0]!,
        description: null,
        eventType: null,
        price: null,
      }],
    };
    render(<ProviderProfile detail={optionalDetail} />);

    expect(screen.getByText(
      "This provider has not added a public description yet.",
    )).toBeVisible();
    expect(screen.getByText(
      "No additional public service categories are listed.",
    )).toBeVisible();
    expect(screen.getByText(
      "This provider has not added public planning information yet.",
    )).toBeVisible();
    expect(screen.getByText(
      "No public package description is available.",
    )).toBeVisible();
    expect(screen.getByText("Price unavailable")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 guests|available now|starting at/iu))
      .not.toBeInTheDocument();
  });

  it("uses real cover/logo media and preserves long identity text", () => {
    const mediaDetail: PublicProviderDetail = {
      ...detail,
      provider: {
        ...provider,
        coverImageUrl: "https://res.cloudinary.com/feasta-test/image/upload/v1/feasta/providers/provider-owner/onboarding/cover.png",
        logoUrl: "https://res.cloudinary.com/feasta-test/image/upload/v1/feasta/providers/provider-owner/onboarding/logo.png",
      },
    };
    render(<ProviderProfile detail={mediaDetail} />);

    expect(screen.getByAltText(`${provider.businessName} cover image`))
      .toHaveClass("object-cover");
    expect(screen.getByAltText(`${provider.businessName} logo`))
      .toHaveClass("object-contain");
    expect(screen.getByRole("heading", {
      level: 1,
      name: provider.businessName,
    })).toHaveClass("break-words");
    expect(screen.getAllByText(provider.location)[0]).toHaveClass(
      "min-w-0",
      "break-words",
    );
  });

  it("provides reduced-motion loading and an accessible recoverable error", () => {
    const {rerender} = render(<PublicProviderDetailLoading />);
    expect(screen.getByLabelText("Loading provider profile")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByLabelText("Loading provider profile")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByLabelText("Loading provider profile").innerHTML)
      .toContain("motion-reduce:animate-none");
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Provider profile",
    })).toBeInTheDocument();

    rerender(<PublicProviderDetailError reset={() => undefined} />);
    expect(screen.getByRole("link", {name: "Back to providers"}))
      .toHaveAttribute("href", "/customer/providers");
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Provider profile unavailable",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {name: /try again/iu})).toBeVisible();

    rerender(<PublicProviderNotFound />);
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Provider profile not found",
    })).toBeVisible();
    expect(screen.getByRole("link", {name: "Browse public providers"}))
      .toHaveAttribute("href", "/customer/providers");
  });
});

describe("public provider detail security contracts", () => {
  const owner = {
    role: "provider",
    providerId: "provider-one",
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
  };
  const record = {
    ownerId: "provider-owner",
    businessName: "Ana Events",
    providerServiceType: "addon",
    providerCategory: "event_coordinator",
    verificationStatus: "approved",
    publiclyVisible: true,
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  };

  it("uses the canonical visibility policy for direct provider reads", () => {
    expect(isPublicProviderRecord("provider-one", record, owner)).toBe(true);
    for (const hidden of [
      {...record, verificationStatus: "pending"},
      {...record, publiclyVisible: false},
      {...record, isActive: false},
      {...record, isSuspended: true},
      {...record, isDeleted: true},
    ]) {
      expect(normalizePublicProvider("provider-one", hidden, owner)).toBeNull();
    }
    expect(normalizePublicProvider(
      "provider-one",
      record,
      {...owner, isBlocked: true},
    )).toBeNull();
  });

  it("normalizes only packages tied to an approved public provider", () => {
    const providerNames = new Map([["provider-one", "Ana Events"]]);
    const packageRecord = {
      providerId: "provider-one",
      name: "Wedding Coordination",
      description: "Published services",
      eventType: "wedding",
      price: 25000,
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      status: "published",
      isDeleted: false,
    };
    expect(normalizePublicPackage("package-one", packageRecord, providerNames))
      .toMatchObject({name: "Wedding Coordination", price: 25000});
    expect(normalizePublicPackage(
      "package-one",
      {...packageRecord, status: "draft"},
      providerNames,
    )).toBeNull();
    expect(normalizePublicPackage(
      "package-one",
      packageRecord,
      new Map(),
    )).toBeNull();
  });

  it("keeps direct reads server-only, ID-bounded, owner-validated, and package-bounded", () => {
    const root = process.cwd();
    const service = readFileSync(join(
      root,
      "src/lib/customer/providers/provider-detail-service.ts",
    ), "utf8");
    const page = readFileSync(join(
      root,
      "src/app/customer/providers/[providerId]/page.tsx",
    ), "utf8");

    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("if (!isPublicProviderId(providerId)) return null");
    expect(service).toContain("normalizePublicProvider");
    expect(service).toContain("ownerSnapshot.exists");
    expect(service).toContain("if (!provider) return null");
    expect(service).toContain('.where("providerId", "==", provider.id)');
    expect(service).toContain('.where("status", "==", "published")');
    expect(service).toContain('.where("providerPubliclyVisible", "==", true)');
    expect(service).toContain(".limit(PROVIDER_DETAIL_PACKAGE_LIMIT)");
    expect(service).toContain("PROVIDER_DETAIL_PACKAGE_LIMIT = 12");
    expect(page).toContain("if (!detail) notFound()");
    expect(page).toContain("parseMarketplaceReturnHref");
    expect(page).toContain("backHref={backHref}");
  });

  it("uses FEASTA breakpoints without viewport-breaking profile dimensions", () => {
    const root = process.cwd();
    const profile = readFileSync(join(
      root,
      "src/components/customer/providers/provider-profile.tsx",
    ), "utf8");
    const loading = readFileSync(join(
      root,
      "src/app/customer/providers/[providerId]/loading.tsx",
    ), "utf8");

    expect(profile).toContain("h-[clamp(11.5rem,28vw,20rem)]");
    expect(profile).toContain("sm:flex-row");
    expect(profile).toContain(
      "grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))]",
    );
    expect(profile).toContain(
      "md:grid-cols-[minmax(0,1fr)_18rem]",
    );
    expect(profile).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(profile).not.toContain("ShieldCheck");
    expect(profile).toContain("min-w-0");
    expect(profile).toContain("break-words");
    expect(profile).not.toMatch(/min-h-screen|w-screen|overflow-x-hidden/u);
    expect(profile).not.toMatch(/\brating\b|review count|response time|most popular/iu);
    expect(loading).toContain("motion-reduce:animate-none");
  });
});
