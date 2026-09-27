import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseProviderMenu,
  publicMenuImages,
} from "@/lib/provider/provider-menu";

const legacyImage = {
  id: "beef-steak",
  title: "Beef Steak",
  url: "https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/beef-steak/image.png",
  isPublished: true,
};

const structuredImage = {
  ...legacyImage,
  description:
    "Tender beef steak with onions and house seasoning.",
  category: "Beef",
  servingOptions: [
    {
      id: "family-size",
      name: "Family Size",
      description:
        "Good for 15 pax",
      minimumGuests: 15, maximumGuests: 20,
      price: 1050,
    },
    {
      id: "party-size",
      name: "Party Size",
      description:
        "Good for 30 pax",
      minimumGuests: 30, maximumGuests: 30,
      price: 2100,
    },
  ],
};

describe(
  "structured provider catering menu",
  () => {
    it(
      "keeps historical browsing-only menu records backward compatible",
      () => {
        expect(
          parseProviderMenu(
            [legacyImage],
            "owner",
          ),
        ).toEqual([
          legacyImage,
        ]);
      },
    );

    it(
      "accepts trusted structured serving-size metadata",
      () => {
        expect(
          parseProviderMenu(
            [structuredImage],
            "owner",
          ),
        ).toEqual([
          structuredImage,
        ]);

        expect(
          publicMenuImages(
            [structuredImage],
            "owner",
          ),
        ).toEqual([
          structuredImage,
        ]);
      },
    );

    it(
      "rejects duplicate serving-size identifiers",
      () => {
        expect(
          () =>
            parseProviderMenu(
              [
                {
                  ...structuredImage,
                  servingOptions: [
                    structuredImage
                      .servingOptions[0],
                    {
                      ...structuredImage
                        .servingOptions[1],
                      id:
                        "family-size",
                    },
                  ],
                },
              ],
              "owner",
            ),
        ).toThrow(
          /identifier/i,
        );
      },
    );

    it.each([
      {
        guestCount: 0,
        price: 1050,
      },
      {
        guestCount: 15.5,
        price: 1050,
      },
      {
        guestCount: 15,
        price: 0,
      },
      {
        guestCount: 15,
        price: -1,
      },
    ])(
      "rejects invalid serving economics: %j",
      (
        invalid,
      ) => {
        expect(
          () =>
            parseProviderMenu(
              [
                {
                  ...structuredImage,
                  servingOptions: [
                    {
                      ...structuredImage
                        .servingOptions[0],
                      ...invalid,
                    },
                  ],
                },
              ],
              "owner",
            ),
        ).toThrow();
      },
    );

    it(
      "requires an item name once serving sizes are configured",
      () => {
        expect(
          () =>
            parseProviderMenu(
              [
                {
                  ...structuredImage,
                  title: "   ",
                },
              ],
              "owner",
            ),
        ).toThrow(
          /item name/i,
        );
      },
    );
  },
);