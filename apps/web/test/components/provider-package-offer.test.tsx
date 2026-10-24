import {describe, expect, it} from "vitest";

import {
  createProviderPackageOfferDraft,
  serializeProviderPackageOfferDraft,
} from "@/app/provider/packages/provider-package-offer-builder";
import {
  normalizePackageServiceOptions,
  normalizePackageThemeOptions,
  packageStartingPrice,
} from "@/lib/catering/package-offer-configuration";

describe("provider package offer configuration", () => {
  it("serializes valid service tiers and derives the starting price", () => {
    const draft = createProviderPackageOfferDraft({
      serviceOptions: {
        drop_off: {price: 10000, includedServices: ["Packed meals"]},
        full_service: {price: 15000.5, includedServices: ["Staff"]},
      },
    });
    const serialized = serializeProviderPackageOfferDraft(draft);
    expect(serialized.error).toBeNull();
    expect(serialized.startingPrice).toBe(10000);
    expect(serialized.serviceOptions).toEqual({
      drop_off: {price: 10000, includedServices: ["Packed meals"]},
      full_service: {price: 15000.5, includedServices: ["Staff"]},
    });
  });

  it("rejects empty offers, invalid precision, and drop-off-only themes", () => {
    expect(serializeProviderPackageOfferDraft(
      createProviderPackageOfferDraft(),
    ).error).toMatch(/at least one catering service tier/iu);

    const invalidPrice = createProviderPackageOfferDraft({
      serviceOptions: {
        drop_off: {price: 10.123, includedServices: []},
      },
    });
    expect(serializeProviderPackageOfferDraft(invalidPrice).error)
      .toMatch(/two decimal places/iu);

    const dropOffThemes = createProviderPackageOfferDraft({
      serviceOptions: {
        drop_off: {price: 10000, includedServices: []},
      },
      themeOptions: [{
        id: "garden",
        name: "Garden",
        description: "",
        imageUrls: [],
      }],
    });
    expect(serializeProviderPackageOfferDraft(dropOffThemes).error)
      .toMatch(/Buffet Setup or Full-Service Catering/iu);
  });

  it("rejects duplicate theme IDs and theme or image bounds", () => {
    const duplicate = createProviderPackageOfferDraft({
      serviceOptions: {
        buffet_setup: {price: 12000, includedServices: []},
      },
      themeOptions: [
        {id: "garden", name: "Garden", description: "", imageUrls: []},
        {id: "garden", name: "Second", description: "", imageUrls: []},
      ],
    });
    expect(serializeProviderPackageOfferDraft(duplicate).error)
      .toMatch(/unique/iu);

    const tooManyThemes = createProviderPackageOfferDraft({
      serviceOptions: {
        buffet_setup: {price: 12000, includedServices: []},
      },
      themeOptions: Array.from({length: 13}, (_, index) => ({
        id: `theme_${index}`,
        name: `Theme ${index}`,
        description: "",
        imageUrls: [],
      })),
    });
    expect(serializeProviderPackageOfferDraft(tooManyThemes).error)
      .toMatch(/at most 12/iu);

    const tooManyImages = createProviderPackageOfferDraft({
      serviceOptions: {
        full_service: {price: 15000, includedServices: []},
      },
      themeOptions: [{
        id: "garden",
        name: "Garden",
        description: "",
        imageUrls: [
          "https://res.cloudinary.com/feasta/image/upload/v1/a.png",
          "https://res.cloudinary.com/feasta/image/upload/v1/b.png",
          "https://res.cloudinary.com/feasta/image/upload/v1/c.png",
          "https://res.cloudinary.com/feasta/image/upload/v1/d.png",
          "https://res.cloudinary.com/feasta/image/upload/v1/e.png",
        ],
      }],
    });
    expect(serializeProviderPackageOfferDraft(tooManyImages).error)
      .toMatch(/at most 4/iu);
  });

  it("normalizes public offer fields and ignores unsupported values", () => {
    expect(normalizePackageServiceOptions({
      drop_off: {price: 10000.1, includedServices: ["  Packed meals  ", "Packed meals"]},
      delivery: {price: 1, includedServices: ["Ignored"]},
      buffet_setup: {price: -1, includedServices: ["Invalid"]},
    })).toEqual({
      drop_off: {price: 10000.1, includedServices: ["Packed meals"]},
    });
    expect(packageStartingPrice({
      drop_off: {price: 10000, includedServices: []},
      full_service: {price: 14000, includedServices: []},
    })).toBe(10000);
    expect(packageStartingPrice({})).toBeNull();
    expect(normalizePackageThemeOptions([
      {
        id: "garden",
        name: "Garden",
        description: "Outdoor",
        imageUrls: ["https://images.example.test/garden.webp", "javascript:bad"],
      },
      {id: "bad id", name: "Bad", description: "", imageUrls: []},
    ])).toEqual([{
      id: "garden",
      name: "Garden",
      description: "Outdoor",
      imageUrls: ["https://images.example.test/garden.webp"],
    }]);
  });
});
