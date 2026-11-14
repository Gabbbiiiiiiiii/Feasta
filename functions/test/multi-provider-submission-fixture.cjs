"use strict";
const projectId = "demo-feasta-multi-provider-submission-test";
function makeEnvelope() {
  const event = {
    eventType: "wedding",
    eventDate: "2026-12-20",
    eventTime: "10:00",
    eventEndTime: "18:00",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "Ormoc City, Leyte",
    specialRequest: "",
  };

  return {
    schemaVersion: 1,
    clientRequestId: "feasta_v2_success_001",
    event,
    selections: [1, 2].map((index) => ({
      providerId: `provider_00${index}`,
      packageId: `package_00${index}`,
      configuration: {
        event: {...event},
        sharedContractVersion: 2,
        expectedPackageRevision: 3,
        serviceTier: "drop_off",
        packageThemeId: null,
        selectedFoods: [],
        selectedDecorations: [],
        selectedFurniture: [],
        foodChoiceSelections: [],
        selectedEventServices: [],
        selectedAddOns: [],
      },
    })),
  };
}

function makeRecords() {
  const records = Object.create(null);

  records["contractPolicies/providerPackageV2"] = {
    revision: 1,
    effectiveEnvironment: projectId,
    maxSpecificOccasions: 10,
    maxThemeImages: 4,
    featureGates: {
      packageDraftWrites: true,
      packagePublication: true,
      customerDiscovery: true,
      customerBooking: true,
    },
  };

  records["maintenanceControls/intake"] = {
    schemaVersion: 1,
    revision: 1,
    intake: false,
    publication: false,
  };

  records["appSettings/platform"] = {
    minimumDepositRateBps: 2000,
    maximumDepositRateBps: 8000,
  };

  records["occasionCatalog/current"] = {
    revision: 7,
    activationState: "stable",
  };

  records["serviceCategories/catering_service"] = {
    code: "catering_service",
    name: "Catering",
    serviceType: "catering",
    status: "active",
  };

  records["occasions/wedding"] = {
    id: "wedding",
    label: "Wedding",
    active: true,
    moderationState: "approved",
    sortOrder: 0,
    revision: 1,
    applicableServiceCategoryCodes: ["catering_service"],
  };

  for (const index of [1, 2]) {
    const suffix = `00${index}`;
    const providerId = `provider_${suffix}`;
    const ownerId = `owner_${suffix}`;
    const packageId = `package_${suffix}`;

    records[`providers/${providerId}`] = {
      ownerId,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
      isBlocked: false,
      publiclyVisible: true,
      businessName: `Provider ${index}`,
      description: "Professional catering for celebrations.",
      address: "Ormoc City",
      city: "Ormoc",
      province: "Leyte",
      providerServiceType: "catering",
      serviceCategories: ["catering_service"],
      operatingDays: [
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
      ],
      bookingLeadTimeDays: 0,
      minGuestsPerEvent: 1,
      maxGuestsPerEvent: 200,
      eventTypesSupported: ["wedding"],
    };

    records[`users/${ownerId}`] = {
      role: "provider",
      providerId,
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
    };

    records[`packages/${packageId}`] = {
      providerId,
      name: `Wedding Catering ${index}`,
      description: "A complete catering package for weddings.",
      serviceCategoryCode: "catering_service",
      eventType: "wedding",
      eventTypes: ["wedding"],
      sharedContractVersion: 2,
      occasionSchemaVersion: 2,
      offerSchemaVersion: 2,
      offerStructure: "fixed",
      packageStyle: "Wedding Catering",
      pricingModel: "per_bundle",
      occasionScope: "specific",
      occasionIds: ["wedding"],
      occasionMatchIds: ["wedding"],
      occasionCatalogRevision: 7,
      providerEligibilityRevision: 1,
      occasionEligibilityState: "valid",
      revision: 3,
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      isDeleted: false,
      publishedAt: "2026-11-01T08:00:00.000Z",
      price: 15000,
      serviceOptions: {
        drop_off: {
          price: 15000,
          includedServices: ["Delivery"],
          decorInclusions: [],
          furnitureInclusions: [],
          equipmentInclusions: [],
        },
      },
      themeOptions: [],
      foodChoiceGroups: [],
      foodInclusions: ["Rice"],
      serviceInclusions: [],
      decorInclusions: [],
      furnitureInclusions: [],
      equipmentInclusions: [],
      minimumGuests: 25,
      maximumGuests: 150,
      imageUrl: "",
      imageUrls: [],
      paymentTermsSchemaVersion: 2,
      paymentPolicy: "full_payment",
      depositPercentage: 100,
      downPaymentPercentage: 100,
      balanceDueDaysBeforeEvent: null,
      balanceDueHoursBeforeEvent: null,
    };
  }

  return records;
}


module.exports = {makeEnvelope, makeRecords};
