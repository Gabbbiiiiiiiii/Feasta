import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {normalizeProviderBusinessProfile} from "@/lib/provider/business-profile/provider-business-profile-normalization";

function provider(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: "owner-one",
    businessName: "Feasta Creative Studio",
    businessEmail: "studio@example.test",
    businessPhone: "+639171234567",
    description: "Photo, video, and creative event coverage for celebrations.",
    address: "123 Bonifacio Street",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "addon",
    providerCategory: "photographer",
    serviceCategories: ["photographer", "videographer"],
    serviceAreas: ["Ormoc City", "Leyte"],
    eventTypesSupported: ["birthday", "wedding"],
    maxServiceDistanceKm: 75,
    logoUrl: null,
    logoPublicId: null,
    coverImageUrl: null,
    coverPublicId: null,
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    ownerEmail: "private-owner@example.test",
    adminRemarks: "Internal review notes must never leave the server model.",
    verificationDocuments: [{storagePath: "private/document.pdf"}],
    securityMetadata: {risk: "internal"},
    updatedAt: new Date("2026-08-22T01:00:00.000Z"),
    ...overrides,
  };
}

describe("provider business profile normalization", () => {
  it("normalizes the canonical provider document for dynamic event services", () => {
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider(),
    })).toEqual({
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
      serviceAreas: ["Ormoc City", "Leyte"],
      eventTypesSupported: ["birthday", "wedding"],
      maxServiceDistanceKm: 75,
      logo: null,
      coverImage: null,
      updatedAt: "2026-08-22T01:00:00.000Z",
    });
  });

  it("supports catering, add-on, and combined capabilities without category branches", () => {
    const cases = [
      {
        providerServiceType: "catering",
        providerCategory: "catering_service",
        serviceCategories: ["catering_service"],
      },
      {
        providerServiceType: "addon",
        providerCategory: "florist",
        serviceCategories: ["florist"],
      },
      {
        providerServiceType: "both",
        providerCategory: "catering_service",
        serviceCategories: ["catering_service", "event_host_emcee"],
      },
    ];

    for (const item of cases) {
      expect(normalizeProviderBusinessProfile({
        providerId: "provider-one",
        trustedOwnerId: "owner-one",
        data: provider(item),
      })?.serviceCategories).toEqual(item.serviceCategories);
    }
  });

  it("fails closed on ownership, approval, and capability inconsistencies", () => {
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-other",
      data: provider(),
    })).toBeNull();
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider({verificationStatus: "under_review", isActive: false}),
    })).toBeNull();
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider({
        providerServiceType: "addon",
        serviceCategories: ["catering_service"],
      }),
    })).toBeNull();
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider({businessPhone: "invalid"}),
    })).toBeNull();
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider({eventTypesSupported: ["not_canonical"]}),
    })).toBeNull();
  });

  it("accepts only owner-bound canonical Cloudinary media", () => {
    const publicId = "feasta/providers/owner-one/onboarding/logo";
    const url = `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.jpg`;
    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider({logoUrl: url, logoPublicId: publicId}),
    })?.logo).toEqual({url, publicId});

    expect(normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider({
        logoUrl: url,
        logoPublicId: "feasta/providers/owner-other/onboarding/logo",
      }),
    })).toBeNull();
  });

  it("does not expose verification, owner-authentication, admin, or security data", () => {
    const profile = normalizeProviderBusinessProfile({
      providerId: "provider-one",
      trustedOwnerId: "owner-one",
      data: provider(),
    });

    expect(profile).not.toBeNull();
    expect(profile).not.toHaveProperty("ownerId");
    expect(profile).not.toHaveProperty("ownerEmail");
    expect(profile).not.toHaveProperty("adminRemarks");
    expect(profile).not.toHaveProperty("verificationDocuments");
    expect(profile).not.toHaveProperty("securityMetadata");
  });
});

describe("provider business profile service contract", () => {
  const root = process.cwd();
  const service = readFileSync(join(
    root,
    "src/lib/provider/business-profile/provider-business-profile-service.ts",
  ), "utf8");
  const client = readFileSync(join(
    root,
    "src/lib/provider/business-profile/provider-business-profile-client.ts",
  ), "utf8");
  const types = readFileSync(join(
    root,
    "src/lib/provider/business-profile/provider-business-profile-types.ts",
  ), "utf8");
  const page = readFileSync(join(
    root,
    "src/app/provider/business-profile/page.tsx",
  ), "utf8");
  const workspace = readFileSync(join(
    root,
    "src/app/provider/business-profile/provider-business-profile-client.tsx",
  ), "utf8");

  it("reads only the trusted approved provider's canonical document", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("await requireApprovedProvider()");
    expect(service).toContain('.collection("providers")');
    expect(service).toContain("trustedOwnerId: account.uid");
    expect(service).not.toContain("businessProfiles");
  });

  it("does not accept provider identity or sensitive fields in the update contract", () => {
    expect(client).toContain('"updateProviderBusinessProfile"');
    expect(types).not.toMatch(/ownerId|verificationStatus|isActive|isSuspended/u);
    expect(types).not.toMatch(/admin|document|remark|security/iu);
    expect(types).not.toMatch(/providerId\?:/u);
  });

  it("protects the route with the Phase 1 server read and uses its sole mutation wrapper", () => {
    expect(page).toContain("await getProviderBusinessProfile()");
    expect(page).not.toMatch(/firebase|collection\(|getDoc\(/u);
    expect(workspace).toContain("updateProviderBusinessProfile(input)");
    expect(workspace).not.toMatch(/setDoc\(|updateDoc\(|addDoc\(/u);
    expect(workspace).not.toContain("businessProfiles");
  });
});
