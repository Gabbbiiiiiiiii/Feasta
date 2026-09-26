import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

import {
  firstIncompleteSetupStep,
  onboardingStepBySlug,
  onboardingStepState,
  providerOnboardingPath,
  PROVIDER_ONBOARDING_STEPS,
} from "../src/lib/provider/onboarding.ts";
import {providerStatusPresentation} from "../src/lib/provider/status.ts";

describe("provider onboarding routing policy", () => {
  it("uses the canonical eight-step sequence", () => {
    assert.deepEqual(PROVIDER_ONBOARDING_STEPS.map((step) => step.slug), [
      "owner",
      "business",
      "services",
      "location",
      "capacity",
      "consent",
      "documents",
      "review",
    ]);
  });

  it("resumes at the first incomplete setup step", () => {
    assert.equal(firstIncompleteSetupStep([1, 2, 4]).slug, "services");
    assert.equal(firstIncompleteSetupStep([1, 2, 3, 4, 5, 6]).slug,
      "consent",
    );
  });

  it("retries the final setup transaction when registration was interrupted", () => {
    assert.equal(
      firstIncompleteSetupStep([1, 2, 3, 4, 5, 6]).number,
      6,
    );
    assert.equal(
      providerOnboardingPath(
        firstIncompleteSetupStep([1, 2, 3, 4, 5, 6]),
      ),
      "/provider/onboarding/consent",
    );
  });

  it("fails closed for unknown slugs and maps document routes explicitly", () => {
    assert.equal(onboardingStepBySlug("admin"), null);
    assert.equal(providerOnboardingPath(PROVIDER_ONBOARDING_STEPS[6]),
      "/provider/verification?stage=documents",
    );
    assert.equal(providerOnboardingPath(PROVIDER_ONBOARDING_STEPS[7]),
      "/provider/verification?stage=review",
    );
  });

  it("exposes completed, current and incomplete progress text", () => {
    assert.equal(onboardingStepState(
      PROVIDER_ONBOARDING_STEPS[0],
      PROVIDER_ONBOARDING_STEPS[1],
      [1],
    ), "completed");
    assert.equal(onboardingStepState(
      PROVIDER_ONBOARDING_STEPS[1],
      PROVIDER_ONBOARDING_STEPS[1],
      [1],
    ), "current");
    assert.equal(onboardingStepState(
      PROVIDER_ONBOARDING_STEPS[2],
      PROVIDER_ONBOARDING_STEPS[1],
      [1],
    ), "incomplete");
  });

  it("keeps role, status, and URL-skipping checks on the server route", () => {
    const route = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/page.tsx",
    ), "utf8");
    assert.match(route, /requireProvider\(\)/u);
    assert.match(route, /requireVerifiedEmail/u);
    assert.match(
      route,
      /providerAccessDestination\(\s*account,?\s*\)/u,
    );
    assert.match(route, /requestedStep\.number > firstIncomplete\.number/u);
    assert.match(route, /redirect\(providerOnboardingPath\(firstIncomplete\)\)/u);
  });
});

describe("provider onboarding Services and event capabilities", () => {
  it("uses grouped service capabilities and preserves the canonical service type contract", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    assert.match(
      form,
      /Services your business provides \*/,
    );
    assert.match(form, /Catering services/u);
    assert.match(form, /Additional event services/u);
    assert.match(form, /\+ Add event services/u);
    assert.match(form, /\+ Also provide catering/u);
    assert.match(
      form,
      /useState<"catering" \| "addon" \| "both" \| "none">/u,
    );
    assert.match(
      form,
      /setServiceOfferingSelection\("none"\)/u,
    );
    assert.match(
      form,
      /onServiceOfferingEmptyChange\(true\)/u,
    );
    assert.match(
      form,
      /Choose at least one service offering\./u,
    );

    assert.match(
      form,
      /nextCatering && nextAddon[\s\S]*\? "both"[\s\S]*\? "catering"[\s\S]*: "addon"/u,
    );

    assert.match(
      form,
      /category\.serviceType === "catering"/u,
    );
    assert.match(
      form,
      /category\.serviceType === "addon"/u,
    );

    assert.doesNotMatch(
      form,
      /<option value="both">Catering and add-ons<\/option>/u,
    );
  });

  it("supports Select all without automatically selecting Other", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    assert.match(
      form,
      /PROVIDER_EVENT_TYPES\.filter\([\s\S]*eventType !== "other"/u,
    );
    assert.match(form, /Select all/u);
    assert.match(form, /Clear all/u);
    assert.match(
      form,
      /values\.eventTypesSupported\.includes\("other"\)/u,
    );
  });

  it("includes Debut in both canonical provider event-type definitions", () => {
    const sharedTypes = readFileSync(path.resolve(
      process.cwd(),
      "../../packages/shared-types/src/provider.ts",
    ), "utf8");

    const functionConstants = readFileSync(path.resolve(
      process.cwd(),
      "../../functions/src/shared/constants.ts",
    ), "utf8");

    for (const source of [sharedTypes, functionConstants]) {
      assert.match(
        source,
        /PROVIDER_EVENT_TYPES = \[[\s\S]*"wedding",[\s\S]*"debut",[\s\S]*"anniversary"/u,
      );
    }
  });

  it("rejects unknown or service-type-incompatible Step 3 selections", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    assert.match(
      form,
      /hasUnknownServiceCategory/u,
    );
    assert.match(
      form,
      /hasIncompatibleServiceCategory/u,
    );
    assert.match(
      form,
      /Choose service categories that match the services your business provides\./u,
    );
    assert.match(
      form,
      /Choose only supported event types\./u,
    );
  });
});

describe("provider onboarding Business Information", () => {
  it("provides complete Business Information validation and account-phone reuse", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    assert.match(
      form,
      /Business name must contain at least 2 characters\./u,
    );
    assert.match(
      form,
      /Business name must not exceed 120 characters\./u,
    );
    assert.match(
      form,
      /Enter a valid business email address\./u,
    );
    assert.match(
      form,
      /Business email must not exceed 160 characters\./u,
    );
    assert.match(
      form,
      /valid Philippine mobile or landline number/u,
    );
    assert.match(
      form,
      /Business description must contain at least 20 characters\./u,
    );
    assert.match(
      form,
      /Business description must not exceed 2,000 characters\./u,
    );
    assert.match(
      form,
      /Use my account phone number/u,
    );
    assert.match(
      form,
      /normalizePhilippinePhone\(values\.ownerPhone\)/u,
    );
    assert.match(form, /maxLength=\{120\}/u);
    assert.match(form, /maxLength=\{160\}/u);
    assert.match(form, /maxLength=\{2000\}/u);
  });
});

describe("provider status experience", () => {
  it("provides a safe next action for every canonical status", () => {
    const statuses = [
      "draft",
      "submitted",
      "under_review",
      "resubmission_required",
      "rejected",
      "suspended",
      "approved",
    ] as const;
    for (const status of statuses) {
      const presentation = providerStatusPresentation(status);
      assert.ok(presentation.title.length > 0);
      assert.ok(presentation.description.length > 0);
      assert.ok(presentation.next.length > 0);
    }
    assert.equal(
      providerStatusPresentation("draft").actionHref,
      "/provider/verification",
    );
    assert.equal(
      providerStatusPresentation("resubmission_required").visibleReason,
      "resubmissionReason",
    );
    assert.equal(
      providerStatusPresentation("rejected").visibleReason,
      "rejectionReason",
    );
    assert.equal(
      providerStatusPresentation("suspended").visibleReason,
      "suspensionReason",
    );
    assert.equal(
      providerStatusPresentation("approved").actionHref,
      "/provider",
    );
  });

  it("keeps the status route server-protected without status bypass redirects", () => {
    const route = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/status/page.tsx",
    ), "utf8");
    assert.match(route, /await requireProvider\(\)/u);
    assert.match(route, /providerStatusPresentation\(status\)/u);
    assert.doesNotMatch(
      route,
      /status === "draft"[\s\S]*redirect\("\/provider\/verification"\)/u,
    );
    assert.doesNotMatch(
      route,
      /status === "approved"[\s\S]*redirect\("\/provider"\)/u,
    );
  });
});

describe("provider onboarding Capacity and schedule", () => {
  it("matches canonical capacity limits and uses provider-friendly scheduling controls", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    assert.match(form, /maximum=\{100000\}/u);
    assert.match(form, /maximum=\{100\}/u);
    assert.match(form, /maximum=\{365\}/u);
    assert.match(
      form,
      /Accept multiple events on the same day/u,
    );
    assert.match(
      form,
      /values\.acceptsMultipleEventsPerDay \? \(/u,
    );
    assert.match(
      form,
      /type="date"/u,
    );
    assert.match(
      form,
      /No unavailable dates added\./u,
    );
    assert.match(
      form,
      /Available staff must be from 0 to 100,000\./u,
    );
    assert.match(
      form,
      /Available equipment must be from 0 to 100,000\./u,
    );
    assert.match(
      form,
      /Maximum events per day must be from 1 to 100\./u,
    );
  });

  it("derives Step 5 capacity fields from service-category metadata with legacy fallback", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    assert.match(
      form,
      /function resolveStepFiveCapacityCapabilities\(/u,
    );
    assert.match(
      form,
      /categoriesByCode\.get\(code\)\?\.capacityCapabilities/u,
    );
    assert.match(
      form,
      /explicit \?\? providerCapacityCapabilities\(\[code\]\)/u,
    );
    assert.match(
      form,
      /resolved\.requiresGuestCapacity \|\|/u,
    );
    assert.match(
      form,
      /resolved\.usesStaffCapacity \|\|/u,
    );
    assert.match(
      form,
      /resolved\.usesEquipmentCapacity \|\|/u,
    );
    assert.equal(
      (form.match(/resolveStepFiveCapacityCapabilities\(/gu) ?? []).length,
      3,
    );
    assert.equal(
      (form.match(/providerCapacityCapabilities\(/gu) ?? []).length,
      1,
    );

    const page = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/page.tsx",
    ), "utf8");

    assert.match(
      page,
      /requestedStep\?\.number === 3 \|\|/u,
    );
    assert.match(
      page,
      /requestedStep\?\.number === 5/u,
    );
    assert.match(
      page,
      /const serviceCategories\s*=\s*needsServiceCategories/u,
    );
  });
});

describe("provider onboarding Location and coverage", () => {
  it("uses provider-friendly location and coverage controls", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    const locationField = readFileSync(path.resolve(
      process.cwd(),
      "src/components/provider/provider-business-location-field.tsx",
    ), "utf8");

    const locationMap = readFileSync(path.resolve(
      process.cwd(),
      "src/components/provider/provider-business-location-map.tsx",
    ), "utf8");

    assert.match(
      form,
      /ProviderBusinessLocationField/u,
    );
    assert.doesNotMatch(
      form,
      /label="Latitude"/u,
    );
    assert.doesNotMatch(
      form,
      /label="Longitude"/u,
    );
    assert.match(
      form,
      /Choose your business location from the address suggestions or set it on the map\./u,
    );
    assert.match(
      form,
      /Add at least one city, municipality, or province you serve\./u,
    );

    assert.match(
      locationField,
      /searchEventVenues/u,
    );
    assert.match(
      locationField,
      /getEventVenueDetails/u,
    );
    assert.match(
      locationField,
      /Location confirmed/u,
    );
    assert.match(
      locationField,
      /Can&apos;t find your exact address\?/u,
    );
    assert.match(
      locationField,
      /Adjust location on map/u,
    );
    assert.match(
      locationField,
      /ProviderBusinessLocationMap/u,
    );
    assert.match(
      locationMap,
      /navigator\.geolocation\.getCurrentPosition/u,
    );
    assert.match(
      locationMap,
      /Locate me/u,
    );
    assert.match(
      locationMap,
      /Location permission was denied/u,
    );
    assert.match(
      locationMap,
      /enableHighAccuracy: true/u,
    );
    assert.match(
      locationMap,
      /gestureHandling: "greedy"/u,
    );
    assert.match(
      locationMap,
      /zoomControl: true/u,
    );
    assert.match(
      locationMap,
      /MapTypeId\.SATELLITE/u,
    );
    assert.match(
      locationMap,
      /Your current location/u,
    );
    assert.match(
      locationMap,
      /Business location/u,
    );
    assert.match(
      locationMap,
      /map\.addListener\([\s\S]*"click"/u,
    );
    assert.match(
      locationMap,
      /businessLocationMarkerRef/u,
    );
    assert.match(
      locationMap,
      /setPosition/u,
    );
    assert.doesNotMatch(
      locationMap,
      /map\.addListener\("idle"/u,
    );
    assert.doesNotMatch(
      locationMap,
      /map\.getCenter\(\)/u,
    );
    assert.match(
      locationMap,
      /Click the map to place the red pin/u,
    );
    assert.match(
      locationField,
      /Areas you serve/u,
    );
    assert.match(
      locationField,
      /Add a city, municipality, or province/u,
    );
    assert.match(
      locationField,
      /Example: Ormoc City, Kananga, or Leyte/u,
    );
    assert.match(
      locationField,
      /Add area/u,
    );
    assert.match(
      locationField,
      /No specific distance limit/u,
    );
    assert.match(
      locationField,
      /Set a maximum travel distance/u,
    );
    assert.doesNotMatch(
      locationField,
      />Latitude</u,
    );
    assert.doesNotMatch(
      locationField,
      />Longitude</u,
    );
  });
});
describe("provider onboarding scrolling UX", () => {
  it("keeps the provider header sticky and lets agreement scrolling continue into the page", () => {
    const form = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ), "utf8");

    const shell = readFileSync(path.resolve(
      process.cwd(),
      "src/components/layout/application-shell.tsx",
    ), "utf8");

    const header = readFileSync(path.resolve(
      process.cwd(),
      "src/components/layout/application-header.tsx",
    ), "utf8");

    assert.match(
      form,
      /overflow-y-auto overscroll-auto scroll-smooth/u,
    );

    assert.doesNotMatch(
      form,
      /overscroll-contain/u,
    );

    assert.match(
      shell,
      /className="contents print:hidden"[\s\S]*?<ApplicationHeader/u,
    );

    assert.match(
      header,
      /sticky top-0 z-30/u,
    );
  });
});
