"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheckBig,
  Clock3,
  MapPin,
  PackageOpen,
  ReceiptText,
  Soup,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

import {useRouter} from "next/navigation";
import {useCustomizationDraft} from "@/lib/customer/bookings/use-customization-draft";
import {CustomerAuthLink} from "@/components/customer/layout/customer-auth-provider";
import {ThemeInspirationStep} from "@/components/customer/bookings/theme-inspiration-step";
import {
  emptyCustomerThemePreference,
  type CustomerThemePreferenceDraft,
} from "@/lib/customer/bookings/customer-theme-preference";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkCustomerProviderAvailability,
  type CustomerProviderAvailability,
  type CustomerProviderAvailabilityInput,
} from "@/lib/customer/bookings/customer-provider-availability-client";
import {
  bookingSubmissionRequiresRefundPolicyRefresh,
  submitCustomerBookingRequest,
  type SubmitPackageBookingRequestInput,
  type SubmitBookingRequestResult,
} from "@/lib/customer/bookings/customer-booking-submission-client";
import {
  buildRefundPolicyAcknowledgements,
  getCustomerBookingRefundPolicyDisclosures,
  normalizeDisclosureError,
  type RefundPolicyDisclosureError,
  type CustomerRefundPolicyDisclosure,
  type CustomerRefundPolicyDisclosureResult,
} from "@/lib/customer/bookings/customer-refund-policy-client";

import {
  addCustomerEventListItem,
  openCustomerEventList,
  readCustomerEventList,
  removeCustomerEventListItem,
} from "@/lib/customer/event-list/customer-event-list";

import {PriceDisplay} from "@/components/shared/price-display";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import type {
  PublicEventService,
  PublicPackageDetail,
} from "@/lib/customer/discovery/marketplace-types";
import {
  humanizeProviderValue,
} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import type {
  CustomerEventContext,
  CustomerPlanningContext,
} from "@/lib/customer/planning/event-planning-context";

type EventCustomizationExperienceProps = {
  draftOwner?: string;
  planningOnly?: boolean;
  eventListMode?: boolean;
  submitFromEventList?: boolean;
  detail: PublicPackageDetail;
  eventServices: readonly PublicEventService[];
  initialEventContext?: CustomerEventContext | null;
  initialPlanningContext?: CustomerPlanningContext | null;
};

type EventDetailsDraft = {
  eventDate: string;
  eventTime: string;
  eventEndTime: string;
  guestCount: string;
  eventLocation: string;
  eventAddress: string;
  specialRequest: string;
};

type EventDetailsErrors = Partial<
  Record<keyof EventDetailsDraft, string>
>;

type PackageCustomizationDraft = {
  selectedFoods: string[];
  selectedDecorations: string[];
  selectedFurniture: string[];
};

const CATERING_SERVICE_TIERS = [
  {
    id: "drop_off",
    label: "Drop-Off Catering",
    description: "Ready-made package delivery without buffet setup or on-site service staff.",
  },
  {
    id: "buffet_setup",
    label: "Buffet Setup",
    description: "Food with buffet equipment and setup for self-service events.",
  },
  {
    id: "full_service",
    label: "Full-Service Catering",
    description: "Complete catering with setup, staffing, and provider-defined event service.",
  },
] as const;

type CateringServiceTierId =
  (typeof CATERING_SERVICE_TIERS)[number]["id"];

function cateringServiceTierLabel(
  value: CateringServiceTierId,
): string {
  return CATERING_SERVICE_TIERS.find(
    (tier) => tier.id === value,
  )?.label ?? value;
}

type AvailabilityStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

type RefundPolicyStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

const STEPS = [
  {
    number: 1,
    label: "Event details",
  },
  {
    number: 2,
    label: "Package inclusions",
  },
  {
    number: 3,
    label: "Visual style",
  },
  {
    number: 4,
    label: "Customize service",
  },
  {
    number: 5,
    label: "Review",
  },
] as const;

export function EventCustomizationExperience({
  detail,
  eventServices,
  initialEventContext = null,
  initialPlanningContext = null,
  draftOwner = "guest",
  planningOnly = false,
  eventListMode = false,
  submitFromEventList = false,
}: EventCustomizationExperienceProps) {
  const {
    packageRecord,
    provider,
    customization,
  } = detail;

  const [step, setStep] =
    useState(() =>
      submitFromEventList
        ? 4
        : 1,
    );

  const router = useRouter();

  const [leaveDialogOpen, setLeaveDialogOpen] =
  useState(false);

  const [pendingLeaveHref, setPendingLeaveHref] =
    useState<string | null>(null);

  const [draft, setDraft] = useState<EventDetailsDraft>(() => {
    const guestCount =
      initialEventContext?.guestCount ??
      initialPlanningContext?.guestCount;

    return {
      eventDate:
        initialEventContext?.eventDate ??
        initialPlanningContext?.eventDate ??
        "",
      eventTime: initialEventContext?.eventTime ?? "",
      eventEndTime: initialEventContext?.eventEndTime ?? "",
      guestCount: guestCount === undefined ? "" : String(guestCount),
      eventLocation:
        initialPlanningContext?.eventVenue?.label ??
        provider.location ??
        "",
      eventAddress: initialPlanningContext?.eventVenue?.address ?? "",
      specialRequest: "",
    };
  });

  const [
    customizationDraft,
    setCustomizationDraft,
  ] = useState<PackageCustomizationDraft>({
    /*
     * foodInclusions, decorInclusions, and
     * furnitureInclusions are fixed parts of
     * the package price. They are not customer
     * choices.
     */
    selectedFoods: [
      ...customization.foods,
    ],
    selectedDecorations: [
      ...customization.decorations,
    ],
    selectedFurniture: [
      ...customization.furniture,
    ],
  });
  const [isSubmitting, setIsSubmitting] =
  useState(false);

const [
  submissionError,
  setSubmissionError,
] = useState<string | null>(null);

const [
  submissionResult,
  setSubmissionResult,
] =
  useState<SubmitBookingRequestResult | null>(
    null,
  );

const eventListRestoreRef =
  useRef(false);
const submissionIdentityRef =
  useRef<{
    draftKey: string;
    clientRequestId: string;
  } | null>(null);

  const [
    selectedEventServiceIds,
    setSelectedEventServiceIds,
  ] = useState<string[]>([]);

  const [willArrangeOwnAddOns, setWillArrangeOwnAddOns] = useState(false);
  const [customerArrangedAddOnsNote, setCustomerArrangedAddOnsNote] = useState("");

  const availableCateringServiceTiers =
    CATERING_SERVICE_TIERS.filter(
      ({id}) =>
        packageRecord.serviceOptions?.[id] !== undefined,
    );

  const [
    selectedCateringServiceTier,
    setSelectedCateringServiceTier,
  ] = useState<CateringServiceTierId | null>(
    () =>
      availableCateringServiceTiers.length === 0
        ? packageRecord.serviceTier ?? null
        : null,
  );

  const [
    selectedPackageThemeId,
    setSelectedPackageThemeId,
  ] = useState<string | null>(null);

  const [
    themePreference,
    setThemePreference,
  ] =
    useState<CustomerThemePreferenceDraft>(
      () =>
        emptyCustomerThemePreference(),
    );

  const savedDraft = useCustomizationDraft({
    owner: draftOwner, providerId: provider.id, packageId: packageRecord.id,
    context: JSON.stringify(initialEventContext ?? initialPlanningContext),
    value: {
      event: draft,
      customization: customizationDraft,
      addonIds: selectedEventServiceIds,
      ownAddons: willArrangeOwnAddOns,
      ownAddonsNote: customerArrangedAddOnsNote,
      serviceTier: selectedCateringServiceTier,
      packageThemeId: selectedPackageThemeId,
    },
    restore: (saved) => {
      setDraft(saved.event);
      setWillArrangeOwnAddOns(saved.ownAddons ?? false);
      setCustomerArrangedAddOnsNote(saved.ownAddonsNote ?? "");
      setSelectedCateringServiceTier(
        saved.serviceTier &&
        packageRecord.serviceOptions?.[saved.serviceTier]
          ? saved.serviceTier
          : availableCateringServiceTiers.length === 0
            ? packageRecord.serviceTier ?? null
            : null,
      );
      setSelectedPackageThemeId(
        saved.serviceTier !== "drop_off" &&
        saved.packageThemeId &&
        packageRecord.themeOptions?.some(
          (theme) =>
            theme.id === saved.packageThemeId,
        )
          ? saved.packageThemeId
          : null,
      );
      setCustomizationDraft({
        selectedFoods: [
          ...customization.foods,
        ],
        selectedDecorations: [
          ...customization.decorations,
        ],
        selectedFurniture: [
          ...customization.furniture,
        ],
      });
      setSelectedEventServiceIds(saved.addonIds.filter((id) => eventServices.some((service) => service.id === id)));
    },
  });

  const currentCustomizationSignature = JSON.stringify({
    event: draft,
    customization: customizationDraft,
    addonIds: selectedEventServiceIds,
    ownAddons: willArrangeOwnAddOns,
    ownAddonsNote: customerArrangedAddOnsNote,
    serviceTier: selectedCateringServiceTier,
    packageThemeId: selectedPackageThemeId,
  });

  const [initialCustomizationSignature] =
    useState(currentCustomizationSignature);

  const hasMeaningfulChanges =
    currentCustomizationSignature !==
    initialCustomizationSignature;

  const [refundPolicyStatus, setRefundPolicyStatus] =
    useState<RefundPolicyStatus>("idle");
  const [refundPolicyResult, setRefundPolicyResult] =
    useState<CustomerRefundPolicyDisclosureResult | null>(null);
  const [refundPolicyError, setRefundPolicyError] =
    useState<RefundPolicyDisclosureError | null>(null);
  const [refundPolicyNotice, setRefundPolicyNotice] =
    useState<string | null>(null);
  const [acknowledgedPolicyKeys, setAcknowledgedPolicyKeys] =
    useState<Record<string, string>>({});
  const refundPolicyGenerationRef = useRef(0);

  const loadRefundPolicyDisclosures = useCallback(async (
    notice: string | null = null,
  ) => {
    const generation = refundPolicyGenerationRef.current + 1;
    refundPolicyGenerationRef.current = generation;
    setRefundPolicyStatus("loading");
    setRefundPolicyResult(null);
    setRefundPolicyError(null);
    setRefundPolicyNotice(notice);
    setAcknowledgedPolicyKeys({});

    try {
      const result = await getCustomerBookingRefundPolicyDisclosures({
        providerId: provider.id,
        packageId: packageRecord.id,
        addonIds: selectedEventServiceIds,
      });
      if (refundPolicyGenerationRef.current !== generation) return;
      setRefundPolicyResult(result);
      setRefundPolicyStatus("ready");
    } catch (error) {
      if (refundPolicyGenerationRef.current !== generation) return;
      setRefundPolicyStatus("error");
      setRefundPolicyError(normalizeDisclosureError(error));
    }
  }, [packageRecord.id, provider.id, selectedEventServiceIds, setAcknowledgedPolicyKeys]);

  useEffect(() => {
    if (planningOnly || step !== 5) return undefined;
    const timeoutId = window.setTimeout(() => {
      void loadRefundPolicyDisclosures();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      refundPolicyGenerationRef.current += 1;
    };
  }, [loadRefundPolicyDisclosures, step, planningOnly]);


  const [errors, setErrors] =
    useState<EventDetailsErrors>({});

  /*
   * Review List restores the configuration that
   * was previously saved by Add to List.
   *
   * The restoration runs asynchronously so React
   * does not receive synchronous state updates
   * directly from the effect body.
   */
  useEffect(() => {
    if (
      !submitFromEventList ||
      eventListRestoreRef.current
    ) {
      return undefined;
    }

    const timeoutId =
      window.setTimeout(() => {
        /*
         * Mark this restored only when the callback
         * actually runs.
         *
         * This prevents React Strict Mode from
         * cancelling the first timeout and leaving
         * the restore ref permanently true.
         */
        if (eventListRestoreRef.current) {
          return;
        }

        eventListRestoreRef.current = true;

        const stored =
          readCustomerEventList().find(
            (item) =>
              item.type !== "custom_menu" && item.packageId ===
              packageRecord.id,
          );

        const configuration =
          (stored?.type !== "custom_menu" ? stored?.configuration : undefined);

        if (!configuration) {
          setSubmissionError(
            "This package is no longer available in your Event List. Customize it again before submitting.",
          );

          return;
        }

        setDraft({
          eventDate:
            configuration.event.eventDate,

          eventTime:
            configuration.event.eventTime,

          eventEndTime:
            configuration.event.eventEndTime,

          guestCount:
            String(
              configuration.event.guestCount,
            ),

          eventLocation:
            configuration.event.eventLocation,

          eventAddress:
            configuration.event.eventAddress,

          specialRequest:
            configuration.event.specialRequest,
        });

        setCustomizationDraft({
          selectedFoods: [
            ...customization.foods,
          ],
          selectedDecorations: [
            ...customization.decorations,
          ],
          selectedFurniture: [
            ...customization.furniture,
          ],
        });

        setSelectedEventServiceIds(
          configuration.selectedEventServices
            .map(
              (service) =>
                service.id,
            )
            .filter((id) =>
              eventServices.some(
                (service) =>
                  service.id === id,
              ),
            ),
        );

        setWillArrangeOwnAddOns(
          configuration
            .willArrangeOwnAddOns,
        );

        setCustomerArrangedAddOnsNote(
          configuration
            .customerArrangedAddOnsNote,
        );

        setErrors({});
        setSubmissionError(null);

        /*
         * Skip directly to the final Review List.
         */
        setStep(4);
      }, 0);

    return () => {
      window.clearTimeout(
        timeoutId,
      );
    };
  }, [
    customization.decorations,
    customization.foods,
    customization.furniture,
    eventServices,
    packageRecord.id,
    submitFromEventList,
  ]);

  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>("idle");
  const [availabilityResults, setAvailabilityResults] =
    useState<ReadonlyMap<string, CustomerProviderAvailability>>(
      new Map(),
    );
  const [availabilityError, setAvailabilityError] =
    useState<string | null>(null);
  const [availabilityCheckedKey, setAvailabilityCheckedKey] =
    useState<string | null>(null);
  const [selectionAvailabilityError, setSelectionAvailabilityError] =
    useState<string | null>(null);
  const [availabilityRetryNonce, setAvailabilityRetryNonce] =
    useState(0);
  const availabilityGenerationRef = useRef(0);

  const eventDateInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Refresh after commits, including when returning to the schedule step.
    if (eventDateInput.current) eventDateInput.current.min = tomorrowDateValue();
  });

  const availabilityAddonIds = useMemo(
    () =>
      step === 1
        ? []
        : eventServices.map(
            (service) => service.id,
          ),
    [eventServices, step],
  );

  const expectedAvailabilityProviderIds = useMemo(
    () => {
      if (step === 1) {
        return [provider.id];
      }

      return [
        provider.id,
        ...new Set(
          eventServices.map(
            (service) => service.providerId,
          ),
        ),
      ].filter((providerId, index, values) =>
        values.indexOf(providerId) === index
      );
    },
    [eventServices, provider.id, step],
  );

  const availabilityParameters = useMemo(
    () => availabilityInputForDraft({
      eventDate: draft.eventDate,
      eventTime: draft.eventTime,
      eventEndTime: draft.eventEndTime,
      guestCount: draft.guestCount,
      packageId: packageRecord.id,
      addonIds: availabilityAddonIds,
      minimumGuests: packageRecord.minimumGuests,
      maximumGuests: packageRecord.maximumGuests,
    }),
    [
      availabilityAddonIds,
      draft.eventDate,
      draft.eventEndTime,
      draft.eventTime,
      draft.guestCount,
      packageRecord.id,
      packageRecord.maximumGuests,
      packageRecord.minimumGuests,
    ],
  );
  const availabilityKey = availabilityParameters
    ? availabilityRequestKey(availabilityParameters)
    : null;

  useEffect(() => {
    const generation = availabilityGenerationRef.current + 1;
    availabilityGenerationRef.current = generation;

    if (planningOnly || !availabilityParameters || !availabilityKey) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (availabilityGenerationRef.current !== generation) return;

      setAvailabilityResults(new Map());
      setAvailabilityCheckedKey(null);
      setAvailabilityError(null);
      setSelectionAvailabilityError(null);
      setAvailabilityStatus("loading");

      void checkCustomerProviderAvailability(
        availabilityParameters,
        expectedAvailabilityProviderIds,
      ).then((results) => {
        if (availabilityGenerationRef.current !== generation) return;

        setAvailabilityResults(availabilityResultMap(results));
        setAvailabilityCheckedKey(availabilityKey);
        setAvailabilityStatus("ready");
      }).catch((error: unknown) => {
        if (availabilityGenerationRef.current !== generation) return;

        setAvailabilityStatus("error");
        setAvailabilityError(availabilityErrorMessage(error));
      });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      if (availabilityGenerationRef.current === generation) {
        availabilityGenerationRef.current += 1;
      }
    };
  }, [
    planningOnly,
    availabilityKey,
    availabilityParameters,
    availabilityRetryNonce,
    expectedAvailabilityProviderIds,
  ]);

  const guestGuidance =
    packageGuestGuidance(
      packageRecord.minimumGuests,
      packageRecord.maximumGuests,
    );

  const guestRangeNotice =
    packageGuestRangeNotice(
      packageRecord.minimumGuests,
      packageRecord.maximumGuests,
    );

  const guestRangeError =
    guestCountRangeError(
      draft.guestCount,
      packageRecord.minimumGuests,
      packageRecord.maximumGuests,
    );

  const guestCountError =
    errors.guestCount ??
    guestRangeError;

  const packageHref =
    `/customer/packages/${encodeURIComponent(
      packageRecord.id,
    )}`;

  const packageInclusionCount =
    customization.foods.length;
  const selectedEventServices =
    eventServices.filter((service) =>
      selectedEventServiceIds.includes(
        service.id,
      ),
    );

  const availabilityIsCurrent =
    availabilityStatus === "ready" &&
    availabilityKey !== null &&
    availabilityCheckedKey === availabilityKey;
  const primaryProviderAvailability =
    availabilityIsCurrent
      ? availabilityResults.get(provider.id) ?? null
      : null;
  const unavailableSelectedServices =
    availabilityIsCurrent
      ? selectedEventServices.filter((service) =>
          availabilityResults.get(service.providerId)?.available === false
        )
      : [];

  const selectedEventServicesSubtotal =
    selectedEventServices.reduce(
      (total, service) =>
        total + (service.price ?? 0),
      0,
    );

  const selectedCateringServiceOption =
    selectedCateringServiceTier
      ? packageRecord.serviceOptions?.[
          selectedCateringServiceTier
        ] ?? null
      : null;

  const effectivePackagePrice =
    selectedCateringServiceOption?.price ??
    packageRecord.price;

  const packageThemeOptions =
    packageRecord.themeOptions ?? [];

  const packageThemeSelectionRequired =
    (selectedCateringServiceTier === "buffet_setup" ||
      selectedCateringServiceTier === "full_service") &&
    packageThemeOptions.length > 0;

  const selectedPackageTheme =
    selectedPackageThemeId
      ? packageThemeOptions.find(
          (theme) =>
            theme.id === selectedPackageThemeId,
        ) ?? null
      : null;

  const cateringProviderServices =
    eventServices.filter(
      (service) =>
        service.source ===
        "catering_provider",
    );

  const marketplaceServices =
    eventServices.filter(
      (service) =>
        service.source ===
        "feasta_addon_provider",
    );

  function updateDraft(
    field: keyof EventDetailsDraft,
    value: string,
  ) {
    if (
      field === "eventDate" ||
      field === "eventTime" ||
      field === "eventEndTime" ||
      field === "guestCount"
    ) {
      availabilityGenerationRef.current += 1;
      setAvailabilityStatus("idle");
      setAvailabilityResults(new Map());
      setAvailabilityCheckedKey(null);
      setAvailabilityError(null);
      setSelectionAvailabilityError(null);
    }

    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = {...current};
      delete next[field];

      return next;
    });
  }

function toggleEventService(
  serviceId: string,
) {
  const service = eventServices.find((candidate) => candidate.id === serviceId);

  if (!service) return;

  if (
    !planningOnly && !selectedEventServiceIds.includes(serviceId) &&
    (
      !availabilityIsCurrent ||
      availabilityResults.get(service.providerId)?.available !== true
    )
  ) {
    setSelectionAvailabilityError(
      `${service.providerName} is not available for the current event details.`,
    );
    return;
  }

  setSelectionAvailabilityError(null);

  setSelectedEventServiceIds(
    (current) => {
      if (
        current.includes(serviceId)
      ) {
        return current.filter(
          (id) => id !== serviceId,
        );
      }

      if (current.length >= 20) {
        return current;
      }

      return [
        ...current,
        serviceId,
      ];
    },
  );
}

function continueFromEventServices() {
  if (planningOnly) { setStep(5); return; }
  if (!availabilityIsCurrent) {
    setSelectionAvailabilityError(
      "Provider availability must be checked again before you continue.",
    );
    return;
  }

  if (unavailableSelectedServices.length > 0) {
    setSelectionAvailabilityError(
      "One or more selected providers are no longer available. Remove those services or change your event details.",
    );
    return;
  }

  setSelectionAvailabilityError(null);
  setStep(5);
}

function buildSubmissionInput(
  clientRequestId: string,
  policyAcknowledgements: SubmitPackageBookingRequestInput["policyAcknowledgements"],
): SubmitPackageBookingRequestInput {
  const eventType =
    packageRecord.eventType?.trim();

  if (!eventType) {
    throw new Error(
      "This package does not have a valid event type. Return to the package and choose another option.",
    );
  }

  const guestCount =
    Number(draft.guestCount);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10_000
  ) {
    throw new Error(
      "Enter a valid guest count before submitting.",
    );
  }

  const specialRequest =
    draft.specialRequest.trim();

  const ownAddOnsNote =
    customerArrangedAddOnsNote.trim();

  if (
    availableCateringServiceTiers.length > 0 &&
    !selectedCateringServiceTier
  ) {
    throw new Error(
      "Choose a catering service option before submitting.",
    );
  }

  if (
    packageThemeSelectionRequired &&
    !selectedPackageThemeId
  ) {
    throw new Error(
      "Choose an included package theme before submitting.",
    );
  }

  return {
    clientRequestId,

    providerId: provider.id,
    packageId: packageRecord.id,

    ...(selectedCateringServiceTier
      ? {
          serviceTier:
            selectedCateringServiceTier,
        }
      : {}),

    ...(selectedPackageThemeId
      ? {
          packageThemeId:
            selectedPackageThemeId,
        }
      : {}),

    eventType,
    eventDate: draft.eventDate,
    eventTime: draft.eventTime,
    eventEndTime: draft.eventEndTime,

    eventLocation:
      draft.eventLocation.trim(),

    eventAddress:
      draft.eventAddress.trim(),

    guestCount,

    selectedFoods:
      customizationDraft.selectedFoods,

    selectedDecorations:
      customizationDraft.selectedDecorations,

    selectedFurniture:
      customizationDraft.selectedFurniture,

    addonIds:
      selectedEventServiceIds,

    policyAcknowledgements,

    ...(specialRequest
      ? {
          specialRequest,
        }
      : {}),

    willArrangeOwnAddOns,

    ...(willArrangeOwnAddOns &&
    ownAddOnsNote
      ? {
          customerArrangedAddOnsNote:
            ownAddOnsNote,
        }
      : {}),
  };
}

function currentSubmissionDraftKey(): string {
  return JSON.stringify({
    providerId: provider.id,
    packageId: packageRecord.id,

    serviceTier:
      selectedCateringServiceTier,

    packageThemeId:
      selectedPackageThemeId,

    eventType:
      packageRecord.eventType ?? "",

    eventDate: draft.eventDate,
    eventTime: draft.eventTime,
    eventEndTime:
      draft.eventEndTime,

    eventLocation:
      draft.eventLocation.trim(),

    eventAddress:
      draft.eventAddress.trim(),

    guestCount:
      draft.guestCount,

    selectedFoods:
      customizationDraft.selectedFoods,

    selectedDecorations:
      customizationDraft
        .selectedDecorations,

    selectedFurniture:
      customizationDraft
        .selectedFurniture,

    addonIds:
      selectedEventServiceIds,

    specialRequest:
      draft.specialRequest.trim(),

    willArrangeOwnAddOns,

    customerArrangedAddOnsNote:
      willArrangeOwnAddOns
        ? customerArrangedAddOnsNote.trim()
        : "",
  });
}

function getSubmissionClientRequestId(
  draftKey: string,
): string {
  const existing =
    submissionIdentityRef.current;

  if (
    existing &&
    existing.draftKey === draftKey
  ) {
    return existing.clientRequestId;
  }

  const randomId =
    globalThis.crypto?.randomUUID?.();

  if (!randomId) {
    throw new Error(
      "Secure booking initialization is unavailable. Refresh the page and try again.",
    );
  }

  const clientRequestId =
    `booking-${randomId}`;

  submissionIdentityRef.current = {
    draftKey,
    clientRequestId,
  };

  return clientRequestId;
}

function navigateToSubmittedBooking(
  result: SubmitBookingRequestResult,
) {
  const parameters = new URLSearchParams({
    submitted: result.bookingId,
  });

  router.replace(
    `/customer/bookings?${parameters.toString()}`,
  );
}

async function handleAddConfiguredToEventList() {
  if (isSubmitting) {
    return;
  }

  setSubmissionError(null);

  const validationErrors =
    validateEventDetails(
      draft,
      packageRecord.minimumGuests,
      packageRecord.maximumGuests,
    );

  if (
    Object.keys(
      validationErrors,
    ).length > 0
  ) {
    setErrors(validationErrors);
    setStep(1);

    setSubmissionError(
      "Review the event details before adding this package to your Event List.",
    );

    return;
  }

  const eventType =
    packageRecord.eventType?.trim();

  if (!eventType) {
    setSubmissionError(
      "This package does not have a valid event type.",
    );

    return;
  }

  const guestCount =
    Number(draft.guestCount);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10_000
  ) {
    setSubmissionError(
      "Enter a valid guest count before adding this package to your Event List.",
    );

    setStep(1);
    return;
  }

  const primaryImage =
    packageRecord.imageUrls?.[0] ??
    packageRecord.imageUrl ??
    null;

  const configuredEstimatedTotal =
    packageRecord.price === null
      ? null
      : packageRecord.price +
        selectedEventServicesSubtotal;

  const configuredPackageHref =
    `${window.location.pathname}${window.location.search}`;

  try {
    setIsSubmitting(true);

    addCustomerEventListItem({
      packageId:
        packageRecord.id,

      providerId:
        provider.id,

      packageName:
        packageRecord.name,

      providerName:
        provider.businessName,

      price:
        packageRecord.price,

      imageUrl:
        primaryImage,

      packageHref:
        configuredPackageHref,

      configuration: {
        event: {
          eventType,

          eventDate:
            draft.eventDate,

          eventTime:
            draft.eventTime,

          eventEndTime:
            draft.eventEndTime,

          guestCount,

          eventLocation:
            draft.eventLocation.trim(),

          eventAddress:
            draft.eventAddress.trim(),

          specialRequest:
            draft.specialRequest.trim(),
        },

        /*
         * These arrays now contain every fixed
         * package inclusion automatically.
         */
        selectedFoods: [
          ...customizationDraft
            .selectedFoods,
        ],

        selectedDecorations: [
          ...customizationDraft
            .selectedDecorations,
        ],

        selectedFurniture: [
          ...customizationDraft
            .selectedFurniture,
        ],

        selectedEventServices:
          selectedEventServices.map(
            (service) => ({
              id:
                service.id,

              providerId:
                service.providerId,

              providerName:
                service.providerName,

              name:
                service.name,

              category:
                service.category ??
                null,

              price:
                service.price,
            }),
          ),

        willArrangeOwnAddOns,

        customerArrangedAddOnsNote:
          willArrangeOwnAddOns
            ? customerArrangedAddOnsNote.trim()
            : "",

        estimatedTotal:
          configuredEstimatedTotal,
      },
    });

    const stored =
      readCustomerEventList().find(
        (item) =>
          item.type !== "custom_menu" && item.packageId ===
          packageRecord.id,
      );

    if (!(stored?.type !== "custom_menu" ? stored?.configuration : undefined)) {
      throw new Error(
        "FEASTA could not save this configured package to your Event List.",
      );
    }

    savedDraft.clear();

    setIsSubmitting(false);

    /*
     * Food-delivery / kiosk behavior:
     * show the Event List immediately.
     */
    /*
     * Food-delivery style continuation:
     *
     * Keep the persistent Event List open, then return the
     * customer to Packages so they can continue browsing.
     */
    openCustomerEventList();
    router.push(
      `${providerProfileHref(provider.id)}#provider-packages`,
    );
  }
  catch (error) {
    setIsSubmitting(false);

    setSubmissionError(
      error instanceof Error &&
        error.message.trim()
        ? error.message
        : "FEASTA could not add this configured package to your Event List.",
    );
  }
}
async function handleSubmitBooking() {
  if (planningOnly) return;
  if (
    isSubmitting ||
    submissionResult
  ) {
    return;
  }

  setSubmissionError(null);

  const validationErrors =
    validateEventDetails(
      draft,
      packageRecord.minimumGuests,
      packageRecord.maximumGuests,
    );

  if (
    Object.keys(
      validationErrors,
    ).length > 0
  ) {
    setErrors(validationErrors);
    setStep(1);

    setSubmissionError(
      "Review the event details before submitting your booking request.",
    );

    return;
  }

  if (
    availableCateringServiceTiers.length > 0 &&
    !selectedCateringServiceTier
  ) {
    setStep(2);
    setSubmissionError(
      "Choose a catering service option before submitting.",
    );
    return;
  }

  if (
    packageThemeSelectionRequired &&
    !selectedPackageThemeId
  ) {
    setStep(3);
    setSubmissionError(
      "Choose an included package theme before submitting.",
    );
    return;
  }

  if (
    refundPolicyStatus !== "ready" ||
    !refundPolicyResult
  ) {
    setSubmissionError(
      "Wait for the current refund policies to load before submitting.",
    );
    return;
  }

  const everyPolicyAcknowledged =
    refundPolicyResult.policies.every(
      (policy) =>
        acknowledgedPolicyKeys[policy.providerId] ===
          policy.effectivePolicyKey,
    );

  if (!everyPolicyAcknowledged) {
    setSubmissionError(
      "Review and acknowledge every Provider refund policy before submitting.",
    );
    return;
  }

  try {
    setIsSubmitting(true);

    const draftKey =
      currentSubmissionDraftKey();

    const clientRequestId =
      await savedDraft.submissionId(draftKey, () => getSubmissionClientRequestId(draftKey));

    const input =
      buildSubmissionInput(
        clientRequestId,
        buildRefundPolicyAcknowledgements(
          refundPolicyResult.policies,
        ),
      );

    const selectedProviderIds = [
      provider.id,
      ...new Set(selectedEventServices.map((service) => service.providerId)),
    ].filter((providerId, index, values) =>
      values.indexOf(providerId) === index
    );
    const freshAvailability =
      await checkCustomerProviderAvailability(
        {
          packageId: input.packageId,
          addonIds: input.addonIds,
          eventDate: input.eventDate,
          eventTime: input.eventTime,
          eventEndTime: input.eventEndTime,
          guestCount: input.guestCount,
        },
        selectedProviderIds,
      );

    const unavailableProviders = freshAvailability.filter(
      (result) => !result.available,
    );

    if (unavailableProviders.length > 0) {
      const primaryUnavailable = unavailableProviders.some(
        (result) => result.providerId === provider.id,
      );
      const message = unavailableProviders[0]?.message ??
        "A selected provider is no longer available.";

      setSubmissionError(
        `Provider availability changed: ${message}`,
      );
      setStep(primaryUnavailable ? 1 : 4);
      return;
    }

    const result =
      await submitCustomerBookingRequest(
        input,
      );

    setSubmissionResult(result);
    savedDraft.clear();

    removeCustomerEventListItem(
      packageRecord.id,
    );

    navigateToSubmittedBooking(result);
  } catch (error) {
    if (
      bookingSubmissionRequiresRefundPolicyRefresh(
        error,
      )
    ) {
      const message =
        "A Provider refund policy changed. Review the refreshed policy and acknowledge it again before submitting.";
      await loadRefundPolicyDisclosures(message);
      return;
    }

    setSubmissionError(
      error instanceof Error &&
        error.message.trim()
        ? error.message
        : "We could not submit your booking request. Please try again.",
    );
  } finally {
    setIsSubmitting(false);
  }
}

  function continueFromEventDetails() {
    const nextErrors =
      validateEventDetails(
        draft,
        packageRecord.minimumGuests,
        packageRecord.maximumGuests,
      );

    setErrors(nextErrors);

    if (
      Object.keys(nextErrors).length > 0
    ) {
      return;
    }

    if (!planningOnly && !availabilityIsCurrent) {
      setAvailabilityError(
        availabilityStatus === "loading"
          ? "Wait for the provider availability check to finish."
          : "Provider availability must be checked before you continue.",
      );
      return;
    }

    if (!planningOnly && primaryProviderAvailability?.available !== true) {
      setAvailabilityError(
        primaryProviderAvailability?.message ??
          "The selected package provider is unavailable for this event.",
      );
      return;
    }

    setStep(2);
  }


  function continueFromCustomization() {
    if (
      availableCateringServiceTiers.length > 0 &&
      !selectedCateringServiceTier
    ) {
      return;
    }

    setStep(3);
  }

  function continueFromTheme() {
    if (
      packageThemeSelectionRequired &&
      !selectedPackageThemeId
    ) {
      setSubmissionError(
        "Choose an included package theme to continue.",
      );
      return;
    }

    setSubmissionError(null);
    setStep(4);
  }
  function requestLeave(href: string) {
  if (
    isSubmitting ||
    submissionResult
  ) {
    router.push(href);
    return;
  }

  /*
   * State C:
   * nothing meaningful changed from the
   * original customization state.
   */
  if (
    !savedDraft.isReady ||
    !hasMeaningfulChanges
  ) {
    router.push(href);
    return;
  }

  /*
   * State A or B:
   * meaningful customization exists.
   */
  if (leaveDialogOpen) {
    return;
  }

  setPendingLeaveHref(href);
  setLeaveDialogOpen(true);
}

function cancelLeave() {
  setLeaveDialogOpen(false);
  setPendingLeaveHref(null);
}

function leaveWithSavedDraft() {
  const href = pendingLeaveHref;

  if (!href) {
    cancelLeave();
    return;
  }

  /*
   * If the newest edits have not yet reached
   * the 400 ms autosave, persist them now.
   */
  if (
    savedDraft.isDirty &&
    !savedDraft.saveNow()
  ) {
    return;
  }

  setLeaveDialogOpen(false);
  setPendingLeaveHref(null);

  router.push(href);
}

function discardAndLeave() {
  const href = pendingLeaveHref;

  if (!href) {
    cancelLeave();
    return;
  }

  if (!savedDraft.discard()) {
    return;
  }

  setLeaveDialogOpen(false);
  setPendingLeaveHref(null);

  router.push(href);
}

  return (
    <div className="mx-auto grid w-full max-w-[1240px] min-w-0 gap-6">
      <div
        role="status"
        aria-live="polite"
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3.5 py-2 text-sm font-semibold text-primary-strong"
      >
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-primary"
        />

        {savedDraft.status}
      </div>
      {savedDraft.choices.length ? <div className="flex flex-wrap gap-2" aria-label="Saved event plans">
        {savedDraft.choices.map((choice) => <Button key={choice.key} variant="secondary" onClick={() => savedDraft.resume(choice)}>
          Continue draft{choice.value.event.eventDate ? ` for ${choice.value.event.eventDate}` : " without a date"}
        </Button>)}
      </div> : null}
      {planningOnly ? <p className="text-sm text-muted-foreground">Plan your event here. Sign in to check availability, review refund policies, and submit a booking. Nothing is reserved yet.</p> : null}
      {/* ============================================================
          BACK
         ============================================================ */}

      <button
        type="button"
        onClick={() =>
          requestLeave(packageHref)
        }
        className={[
          "group inline-flex min-h-11 w-fit items-center gap-2",
          "rounded-full px-1 text-sm font-bold",
          "text-primary-strong transition-colors",
          "hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary focus-visible:ring-offset-2",
        ].join(" ")}
      >
        <ArrowLeft
          aria-hidden="true"
          className="size-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none"
        />

        Back to package
      </button>

      {/* ============================================================
          PAGE INTRO
         ============================================================ */}

      <section className="relative overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white p-5 shadow-[0_10px_34px_rgb(43_33_29/0.045)] sm:p-7 lg:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-32 size-72 rounded-full bg-primary/[0.055] blur-3xl"
        />

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Build your celebration
            </p>

            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-4xl lg:text-[46px] lg:leading-[1.04]">
              Customize your event.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-feasta-text-secondary sm:text-base">
              Tell FEASTA when and where
              your celebration will happen,
              then personalize the package
              using the options published by
              the provider.
            </p>
          </div>

          <div className="rounded-[18px] border border-feasta-border-soft bg-feasta-canvas px-4 py-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
              Selected package
            </p>

            <p className="mt-1 max-w-[15rem] break-words text-sm font-extrabold text-foreground">
              {packageRecord.name}
            </p>

            <p className="mt-1 text-xs text-feasta-text-secondary">
              {provider.businessName}
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          PROGRESS
         ============================================================ */}

      <nav
        aria-label="Booking progress"
        className="rounded-[22px] border border-feasta-border-soft bg-white p-4 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:p-5"
      >
        <ol className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((item) => {
            const active =
              item.number === step;

            const completed =
              item.number < step;

            return (
              <li
                key={item.number}
                aria-current={
                  active
                    ? "step"
                    : undefined
                }
                className={[
                  "flex min-w-0 items-center gap-3 rounded-[14px] px-3 py-3",
                  active
                    ? "bg-secondary"
                    : "bg-feasta-canvas",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    "text-xs font-extrabold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : completed
                        ? "bg-success text-success-foreground"
                        : "bg-white text-feasta-text-tertiary",
                  ].join(" ")}
                >
                  {completed ? (
                    <Check
                      aria-hidden="true"
                      className="size-4"
                    />
                  ) : (
                    item.number
                  )}
                </span>

                <span
                  className={[
                    "min-w-0 text-xs font-bold",
                    active
                      ? "text-primary-strong"
                      : "text-feasta-text-secondary",
                  ].join(" ")}
                >
                  {item.label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ============================================================
          MAIN LAYOUT
         ============================================================ */}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <main className="min-w-0">
          {/* ========================================================
              STEP 1 Ã¢â‚¬â€ EVENT DETAILS
             ======================================================== */}

          {step === 1 ? (
            <section
              aria-labelledby="event-details-title"
              className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                Step 1 of 5
              </p>

              <h2
                id="event-details-title"
                className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
              >
                Event details
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-feasta-text-secondary">
                Add the schedule, guest
                count, and venue information
                for your celebration.
              </p>

              <div className="mt-7 grid gap-5">
                <ReadOnlyField
                  icon={
                    <CalendarDays
                      aria-hidden="true"
                    />
                  }
                  label="Event type"
                  value={
                    packageRecord.eventType
                      ? humanizeProviderValue(
                          packageRecord.eventType,
                        )
                      : "Package event"
                  }
                  description="Based on the selected package."
                />

                <Field
                  label="Event date"
                  error={errors.eventDate}
                >
                  <Input
                    type="date"
                    ref={eventDateInput}
                    value={draft.eventDate}
                    onChange={(event) =>
                      updateDraft(
                        "eventDate",
                        event.currentTarget
                          .value,
                      )
                    }
                    aria-invalid={Boolean(
                      errors.eventDate,
                    )}
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Start time"
                    error={errors.eventTime}
                  >
                    <Input
                      type="time"
                      value={draft.eventTime}
                      onChange={(event) =>
                        updateDraft(
                          "eventTime",
                          event.currentTarget
                            .value,
                        )
                      }
                      aria-invalid={Boolean(
                        errors.eventTime,
                      )}
                    />
                  </Field>

                  <Field
                    label="End time"
                    error={
                      errors.eventEndTime
                    }
                  >
                    <Input
                      type="time"
                      value={
                        draft.eventEndTime
                      }
                      onChange={(event) =>
                        updateDraft(
                          "eventEndTime",
                          event.currentTarget
                            .value,
                        )
                      }
                      aria-invalid={Boolean(
                        errors.eventEndTime,
                      )}
                    />
                  </Field>
                </div>

                <Field
                  label="Number of guests"
                  hint={guestGuidance}
                  helper={guestRangeNotice}
                  error={guestCountError}
                >
                  <Input
                    type="number"
                    min={
                      packageRecord
                        .minimumGuests ?? 1
                    }
                    max={
                      packageRecord
                        .maximumGuests ??
                      10_000
                    }
                    inputMode="numeric"
                    placeholder="Enter guest count"
                    value={draft.guestCount}
                    onChange={(event) =>
                      updateDraft(
                        "guestCount",
                        event.currentTarget
                          .value,
                      )
                    }
                    aria-invalid={Boolean(
                      guestCountError,
                    )}
                  />
                </Field>

                <ProviderAvailabilityPanel
                  providerName={provider.businessName}
                  status={availabilityStatus}
                  result={primaryProviderAvailability}
                  error={availabilityError}
                  onRetry={() =>
                    setAvailabilityRetryNonce((current) => current + 1)
                  }
                />

                <Field
                  label="Event location"
                  hint="City, municipality, venue, or general location."
                  error={
                    errors.eventLocation
                  }
                >
                  <Input
                    maxLength={180}
                    placeholder="e.g. Ormoc City"
                    value={
                      draft.eventLocation
                    }
                    onChange={(event) =>
                      updateDraft(
                        "eventLocation",
                        event.currentTarget
                          .value,
                      )
                    }
                    aria-invalid={Boolean(
                      errors.eventLocation,
                    )}
                  />
                </Field>

                <Field
                  label="Complete event address"
                  hint={`${draft.eventAddress.length}/500 characters`}
                  error={
                    errors.eventAddress
                  }
                >
                  <Textarea
                    maxLength={500}
                    rows={4}
                    placeholder="Street, barangay, landmark, venue details..."
                    value={
                      draft.eventAddress
                    }
                    onChange={(event) =>
                      updateDraft(
                        "eventAddress",
                        event.currentTarget
                          .value,
                      )
                    }
                    aria-invalid={Boolean(
                      errors.eventAddress,
                    )}
                  />
                </Field>

                <Field
                  label="Special requests"
                  optional
                  hint={`${draft.specialRequest.length}/1000 characters`}
                  error={
                    errors.specialRequest
                  }
                >
                  <Textarea
                    maxLength={1000}
                    rows={5}
                    placeholder="Dietary notes, timing concerns, setup requests, or other event details..."
                    value={
                      draft.specialRequest
                    }
                    onChange={(event) =>
                      updateDraft(
                        "specialRequest",
                        event.currentTarget
                          .value,
                      )
                    }
                  />
                </Field>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-feasta-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-xs leading-5 text-feasta-text-secondary">
                  Nothing is submitted at this
                  stage. You&apos;ll review your
                  selections before sending a
                  provider request.
                </p>

                <Button
                  type="button"
                  onClick={
                    continueFromEventDetails
                  }
                  className="min-h-12 rounded-full px-5"
                >
                  Continue

                  <ArrowRight
                    aria-hidden="true"
                    className="size-4"
                  />
                </Button>
              </div>
            </section>
          ) : null}

          {/* ========================================================
              STEP 2 Ã¢â‚¬â€ PACKAGE INCLUSIONS
             ======================================================== */}

          {step === 2 ? (
            <section
              aria-labelledby="package-inclusions-title"
              className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                    Step 2 of 5
                  </p>

                  <h2
                    id="package-inclusions-title"
                    className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
                  >
                    Package inclusions
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
                    Review everything already
                    included with{" "}
                    <span className="font-bold text-foreground">
                      {packageRecord.name}
                    </span>
                    . These inclusions are
                    published by{" "}
                    {provider.businessName} and
                    are already part of the
                    package price.
                  </p>
                </div>

                <div className="shrink-0 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-feasta-text-secondary">
                    <span className="font-extrabold text-foreground">
                      {packageInclusionCount}
                    </span>{" "}
                    {packageInclusionCount === 1
                      ? "inclusion"
                      : "inclusions"}
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-6">
                <PackageInclusionGroup
                  title="Food"
                  description="Food already included in this package."
                  icon={
                    <Soup
                      aria-hidden="true"
                    />
                  }
                  items={customization.foods}
                  emptyMessage="No food inclusions are listed for this package."
                />
{availableCateringServiceTiers.length > 0 ? (
                  <section className="rounded-[20px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5">
                    <div className="max-w-2xl">
                      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-primary-strong">
                        Catering service option
                      </p>

                      <h3 className="mt-2 text-lg font-extrabold text-foreground">
                        Choose the level of catering service
                      </h3>

                      <p className="mt-2 text-xs leading-5 text-feasta-text-secondary">
                        Choose one option published with this package. The selected option determines the catering package price used for this booking.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      {availableCateringServiceTiers.map(
                        ({id, label, description}) => {
                          const option =
                            packageRecord.serviceOptions?.[id];

                          if (!option) {
                            return null;
                          }

                          const selected =
                            selectedCateringServiceTier === id;

                          return (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => {
                                setSelectedCateringServiceTier(id);
                                if (id === "drop_off") {
                                  setSelectedPackageThemeId(null);
                                }
                                setSubmissionError(null);
                              }}
                              className={[
                                "min-w-0 rounded-[18px] border p-4 text-left transition",
                                selected
                                  ? "border-primary bg-secondary ring-2 ring-primary/10"
                                  : "border-feasta-border-soft bg-white hover:border-primary/30",
                              ].join(" ")}
                            >
                              <span className="flex items-start justify-between gap-3">
                                <span className="min-w-0">
                                  <span className="block font-extrabold text-foreground">
                                    {label}
                                  </span>

                                  <span className="mt-1 block text-xs leading-5 text-feasta-text-secondary">
                                    {description}
                                  </span>
                                </span>

                                {selected ? (
                                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                                    <Check
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                  </span>
                                ) : null}
                              </span>

                              <span className="mt-4 block border-t border-feasta-divider pt-3">
                                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                                  Price
                                </span>

                                <PriceDisplay
                                  amount={option.price}
                                  className="mt-1"
                                />
                              </span>

                              {option.includedServices.length > 0 ? (
                                <span className="mt-4 block border-t border-feasta-divider pt-3">
                                  <span className="block text-xs font-extrabold text-foreground">
                                    Included with this service
                                  </span>

                                  <span className="mt-2 grid gap-1.5">
                                    {option.includedServices.map(
                                      (service) => (
                                        <span
                                          key={service}
                                          className="flex items-start gap-2 text-xs leading-5 text-feasta-text-secondary"
                                        >
                                          <Check
                                            aria-hidden="true"
                                            className="mt-0.5 size-3.5 shrink-0 text-primary"
                                          />

                                          <span>
                                            {service}
                                          </span>
                                        </span>
                                      ),
                                    )}
                                  </span>
                                </span>
                              ) : null}
                            </button>
                          );
                        },
                      )}
                    </div>

                    {selectedCateringServiceTier === null ? (
                      <p className="mt-4 text-xs font-semibold text-warning">
                        Choose one catering service option to continue.
                      </p>
                    ) : null}
                  </section>
                ) : null}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-feasta-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setStep(1)
                  }
                  className="min-h-12 rounded-full px-5"
                >
                  <ArrowLeft
                    aria-hidden="true"
                    className="size-4"
                  />

                  Back
                </Button>

                <div className="flex flex-col gap-3 sm:items-end">
                  <p className="max-w-md text-xs leading-5 text-feasta-text-secondary sm:text-right">
                    These items are fixed
                    package inclusions. They
                    cannot be removed or
                    unchecked here.
                  </p>

                  <Button
                    type="button"
                    onClick={
                      continueFromCustomization
                    }
                    disabled={
                      availableCateringServiceTiers.length > 0 &&
                      selectedCateringServiceTier === null
                    }
                    className="min-h-12 rounded-full px-5"
                  >
                    Continue to Theme & Inspiration

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Button>
                </div>
              </div>
            </section>
          ) : null}
          {/* ========================================================
              STEP 3 Ã¢â‚¬â€ THEME & INSPIRATION
            ======================================================== */}

          {step === 3 ? (
            <ThemeInspirationStep
themes={packageThemeOptions}
              serviceTier={
                selectedCateringServiceTier
              }
              selectedThemeId={
                selectedPackageThemeId
              }
              onThemeChange={
                setSelectedPackageThemeId
              }
              value={
                themePreference
              }
              onChange={
                setThemePreference
              }
              onBack={() =>
                setStep(2)
              }
              onContinue={
                continueFromTheme
              }
            />
          ) : null}

          {/* ========================================================
              STEP 4 Ã¢â‚¬â€ CUSTOMIZE YOUR SERVICE
            ======================================================== */}

          {step === 4 ? (
            <section
              aria-labelledby="event-services-title"
              className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                    Step 4 of 5
                  </p>

                  <h2
                    id="event-services-title"
                    className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
                  >
                    Customize your service
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
                    Add optional services to your
                    celebration. You can choose services
                    from {provider.businessName} or from
                    other eligible FEASTA providers.
                  </p>
                </div>

                <div className="shrink-0 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-feasta-text-secondary">
                    <span className="font-extrabold text-foreground">
                      {
                        selectedEventServiceIds.length
                      }
                    </span>{" "}
                    {selectedEventServiceIds.length ===
                    1
                      ? "service"
                      : "services"}{" "}
                    selected
                  </p>
                </div>
              </div>

              {selectionAvailabilityError || unavailableSelectedServices.length > 0 ? (
                <div
                  className="mt-5 rounded-[16px] border border-warning/25 bg-warning-subtle px-4 py-3"
                  role="alert"
                >
                  <p className="text-sm font-extrabold text-warning">
                    Review provider availability
                  </p>
                  <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                    {selectionAvailabilityError ??
                      `${unavailableSelectedServices[0]?.providerName ?? "A selected provider"} is no longer available for your updated event details. Remove the affected service or change the event details.`}
                  </p>
                </div>
              ) : null}

              {eventServices.length > 0 ? (
                <div className="mt-7 grid gap-6">
                  <EventServiceGroup
                    title={`From ${provider.businessName}`}
                    description="Additional services offered by your selected catering provider."
                    services={
                      cateringProviderServices
                    }
                    selectedIds={
                      selectedEventServiceIds
                    }
                    availabilityByProvider={availabilityResults}
                    availabilityCurrent={availabilityIsCurrent}
                    onToggle={
                      toggleEventService
                    }
                    emptyMessage="This caterer does not currently have additional selectable services."
                  />

                  <EventServiceGroup
                    title="Other FEASTA event services"
                    description="Add optional services from other eligible FEASTA providers."
                    services={
                      marketplaceServices
                    }
                    selectedIds={
                      selectedEventServiceIds
                    }
                    availabilityByProvider={availabilityResults}
                    availabilityCurrent={availabilityIsCurrent}
                    onToggle={
                      toggleEventService
                    }
                    emptyMessage="No additional marketplace event services are currently available."
                  />

                  <div className="rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
                          Selected services
                        </p>

                        <p className="mt-1 text-sm font-bold text-foreground">
                          {
                            selectedEventServiceIds.length
                          }{" "}
                          {selectedEventServiceIds.length ===
                          1
                            ? "optional service"
                            : "optional services"}
                        </p>

                        <p className="mt-1 max-w-lg text-xs leading-5 text-feasta-text-secondary">
                          Displayed prices are for
                          planning only. FEASTA
                          revalidates availability and
                          pricing when your booking is
                          submitted.
                        </p>
                      </div>

                      <div className="sm:text-right">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
                          Displayed add-ons subtotal
                        </p>

                        <PriceDisplay
                          amount={
                            selectedEventServicesSubtotal
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-7 rounded-[18px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5">
                  <Sparkles
                    aria-hidden="true"
                    className="size-5 text-primary-strong"
                  />

                  <h3 className="mt-3 text-base font-extrabold text-foreground">
                    No additional services available
                  </h3>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-feasta-text-secondary">
                    You can continue with your selected
                    package without adding another event
                    service.
                  </p>
                </div>
              )}

              <section className="mt-6 overflow-hidden rounded-[20px] border border-feasta-border-soft">
                <div className="bg-feasta-canvas p-4 sm:p-5">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={willArrangeOwnAddOns}
                      onChange={(event) => {
                        const checked =
                          event.currentTarget.checked;

                        setWillArrangeOwnAddOns(
                          checked,
                        );

                        if (!checked) {
                          setCustomerArrangedAddOnsNote(
                            "",
                          );
                        }
                      }}
                      className="peer sr-only"
                    />

                    <span
                      aria-hidden="true"
                      className={[
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border",
                        "transition-[border-color,background-color,color]",
                        willArrangeOwnAddOns
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-feasta-border-strong bg-white text-transparent",
                        "peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                        "peer-focus-visible:ring-offset-2",
                      ].join(" ")}
                    >
                      <Check className="size-3.5" />
                    </span>

                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-foreground">
                        I&apos;ll arrange some event
                        services myself
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-feasta-text-secondary">
                        Use this when you plan to hire or
                        arrange services outside FEASTA in
                        addition to, or instead of, the
                        marketplace services above.
                      </span>
                    </span>
                  </label>
                </div>

                {willArrangeOwnAddOns ? (
                  <div className="border-t border-feasta-divider bg-white p-4 sm:p-5">
                    <Field
                      label="Services you'll arrange yourself"
                      optional
                      hint={`${customerArrangedAddOnsNote.length}/500 characters`}
                    >
                      <Textarea
                        rows={4}
                        maxLength={500}
                        value={
                          customerArrangedAddOnsNote
                        }
                        placeholder="e.g. Photographer from another supplier, family-provided decorations, personal sound system..."
                        onChange={(event) =>
                          setCustomerArrangedAddOnsNote(
                            event.currentTarget.value,
                          )
                        }
                      />
                    </Field>

                    <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
                      Services arranged outside FEASTA are
                      recorded only as part of your event
                      request. Their availability, price,
                      payment, and fulfillment are not
                      calculated from the FEASTA event-service
                      listings shown above.
                    </p>
                  </div>
                ) : null}
              </section>

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-feasta-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setStep(3)
                  }
                  className="min-h-12 rounded-full px-5"
                >
                  <ArrowLeft
                    aria-hidden="true"
                    className="size-4"
                  />

                  Back
                </Button>

                <div className="flex flex-col gap-3 sm:items-end">
                  <p className="max-w-md text-xs leading-5 text-feasta-text-secondary sm:text-right">
                    Event services are optional. You
                    can continue without selecting any.
                  </p>

                  <Button
                    type="button"
                    disabled={
                      (!planningOnly && !availabilityIsCurrent) ||
                      unavailableSelectedServices.length > 0
                    }
                    onClick={
                      continueFromEventServices
                    }
                    className="min-h-12 rounded-full px-5"
                  >
                    Review booking

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {submissionError ? (
            <div
              role="alert"
              className="mt-6 rounded-[16px] border border-destructive/20 bg-destructive/[0.05] px-4 py-3"
            >
              <p className="text-sm font-bold text-destructive">
                Booking request not submitted
              </p>

              <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                {submissionError}
              </p>
            </div>
          ) : null}

          {submissionResult ? (
            <div
              role="status"
              className="mt-6 rounded-[16px] border border-success/20 bg-success/[0.06] px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
                  <Check
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <div>
                  <p className="text-sm font-extrabold text-foreground">
                    Booking request submitted
                  </p>

                  <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                    FEASTA created booking{" "}
                    <span className="font-bold text-foreground">
                      {
                        submissionResult.bookingId
                      }
                    </span>
                    . The provider request is
                    now ready for the next
                    booking stage.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* ========================================================
              STEP 5 Ã¢â‚¬â€ REVIEW PLACEHOLDER
            ======================================================== */}

          {step === 5 && planningOnly ? (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-xl font-bold">Continue your saved plan</h2>
              <p className="my-3 text-muted-foreground">Sign in and complete account verification to review current availability and each provider&apos;s refund policy. Your selections will be restored.</p>
              <CustomerAuthLink href={`${packageHref}/book${initialEventContext ? `?${new URLSearchParams(Object.entries(initialEventContext).map(([key, value]) => [key, String(value)]))}` : ""}`}
                returnTo={`${packageHref}/plan${initialEventContext ? `?${new URLSearchParams(Object.entries(initialEventContext).map(([key, value]) => [key, String(value)]))}` : ""}`} className="font-semibold text-primary underline">Sign in to continue</CustomerAuthLink>
            </div>
          ) : null}
          {step === 5 && !planningOnly ? (
            eventListMode ? (
              <EventListConfigurationReview
                packageRecord={packageRecord}
                providerName={provider.businessName}
                eventDraft={draft}
                customizationDraft={customizationDraft}
                selectedCateringServiceTier={
                  selectedCateringServiceTier
                }
                selectedPackageTheme={
                  selectedPackageTheme
                }
                selectedEventServices={selectedEventServices}
                selectedEventServicesSubtotal={selectedEventServicesSubtotal}
                willArrangeOwnAddOns={willArrangeOwnAddOns}
                customerArrangedAddOnsNote={customerArrangedAddOnsNote}
                isAdding={isSubmitting}
                error={submissionError}
                onBack={() =>
                  setStep(4)
                }
                onAddToList={
                  handleAddConfiguredToEventList
                }
              />
            ) : (              <BookingReview
                packageRecord={{
                  ...packageRecord,
                  price: effectivePackagePrice,
                }}
                providerName={provider.businessName}
                eventDraft={draft}
                customizationDraft={customizationDraft}
                includedServices={customization.services}
                selectedCateringServiceTier={
                  selectedCateringServiceTier
                }
                selectedPackageTheme={
                  selectedPackageTheme
                }
                selectedEventServices={selectedEventServices}
                selectedEventServicesSubtotal={
                  selectedEventServicesSubtotal
                }
                willArrangeOwnAddOns={
                  willArrangeOwnAddOns
                }
                customerArrangedAddOnsNote={
                  customerArrangedAddOnsNote
                }
                isSubmitting={
                  isSubmitting
                }
                submissionError={
                  submissionError
                }
                submissionResult={
                  submissionResult
                }
                refundPolicyStatus={refundPolicyStatus}
                refundPolicyResult={refundPolicyResult}
                refundPolicyError={refundPolicyError}
                refundPolicyNotice={refundPolicyNotice}
                acknowledgedPolicyKeys={acknowledgedPolicyKeys}
                onRefundPolicyAcknowledgementChange={(policy, checked) => {
                  setAcknowledgedPolicyKeys((current) => {
                    if (checked) {
                      return {
                        ...current,
                        [policy.providerId]: policy.effectivePolicyKey,
                      };
                    }
                    const next = {...current};
                    delete next[policy.providerId];
                    return next;
                  });
                  setSubmissionError(null);
                }}
                onRetryRefundPolicies={() => {
                  void loadRefundPolicyDisclosures();
                }}
                onEditEventDetails={() => {
                  setSubmissionError(null);
                  setStep(1);
                }}
                onEditEventServices={() => {
                  setSubmissionError(null);
                  setStep(4);
                }}
                onBack={() =>
                  setStep(4)
                }
                onSubmit={
                  handleSubmitBooking
                }
              />
            )
          ) : null}
        </main>

        {/* ============================================================
            STICKY SUMMARY
           ============================================================ */}

        <aside className="min-w-0 lg:sticky lg:top-24">
          <section className="overflow-hidden rounded-[22px] border border-feasta-border-soft bg-white shadow-[0_8px_26px_rgb(43_33_29/0.04)]">
            {packageRecord.imageUrl ? (
              // Public package image URL is normalized server-side.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  packageRecord.imageUrl
                }
                alt=""
                aria-hidden="true"
                className="aspect-[16/9] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[16/9] place-items-center bg-feasta-surface-muted">
                <PackageOpen
                  aria-hidden="true"
                  className="size-7 text-feasta-text-tertiary"
                />
              </div>
            )}

            <div className="p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-primary-strong">
                Your package
              </p>

              <h2 className="mt-1.5 break-words text-lg font-extrabold tracking-[-0.025em] text-foreground">
                {packageRecord.name}
              </h2>

              <p className="mt-1 text-sm text-feasta-text-secondary">
                {provider.businessName}
              </p>

              <div className="mt-5 border-t border-feasta-divider pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                  Package price
                </p>

                <PriceDisplay
                  amount={
                    packageRecord.price
                  }
                  className="mt-1"
                />
              </div>

              <div className="mt-4 grid gap-3 border-t border-feasta-divider pt-4">
                {draft.eventDate ? (
                  <SummaryLine
                    icon={
                      <CalendarDays
                        aria-hidden="true"
                      />
                    }
                    label="Date"
                    value={draft.eventDate}
                  />
                ) : null}

                {draft.eventTime ? (
                  <SummaryLine
                    icon={
                      <Clock3
                        aria-hidden="true"
                      />
                    }
                    label="Time"
                    value={
                      draft.eventEndTime
                        ? `${draft.eventTime}–${draft.eventEndTime}`
                        : draft.eventTime
                    }
                  />
                ) : null}

                {draft.guestCount ? (
                  <SummaryLine
                    icon={
                      <UsersRound
                        aria-hidden="true"
                      />
                    }
                    label="Guests"
                    value={
                      draft.guestCount
                    }
                  />
                ) : null}

                {draft.eventLocation ? (
                  <SummaryLine
                    icon={
                      <MapPin
                        aria-hidden="true"
                      />
                    }
                    label="Location"
                    value={
                      draft.eventLocation
                    }
                  />
                ) : null}
              </div>

              {packageInclusionCount >
              0 ? (
                <div className="mt-4 border-t border-feasta-divider pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                    Package inclusions
                  </p>

                  <div className="mt-3 grid gap-2">
                    {customizationDraft
                      .selectedFoods.length >
                    0 ? (
                      <SelectionSummary
                        label="Food"
                        count={
                          customizationDraft
                            .selectedFoods
                            .length
                        }
                      />
                    ) : null}

                    {customizationDraft
                      .selectedDecorations
                      .length > 0 ? (
                      <SelectionSummary
                        label="Decor"
                        count={
                          customizationDraft
                            .selectedDecorations
                            .length
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
              {selectedEventServiceIds.length > 0 ? (
                <div className="mt-4 border-t border-feasta-divider pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                    Event services
                  </p>

                  <div className="mt-3 grid gap-2">
                    <SelectionSummary
                      label="Selected"
                      count={selectedEventServiceIds.length}
                    />

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-feasta-text-secondary">
                        Displayed subtotal
                      </span>

                      <span className="font-extrabold text-foreground">
                        {formatCurrency(
                          selectedEventServicesSubtotal,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {willArrangeOwnAddOns ? (
              <div className="mt-4 border-t border-feasta-divider pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                  Own arrangements
                </p>

                <div className="mt-2 flex items-start gap-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                    <Check
                      aria-hidden="true"
                      className="size-3"
                    />
                  </span>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      Customer-arranged services
                    </p>

                    {customerArrangedAddOnsNote ? (
                      <p className="mt-1 line-clamp-3 break-words text-xs leading-5 text-feasta-text-secondary">
                        {
                          customerArrangedAddOnsNote
                        }
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </section>
                </aside>
      </div>

      {leaveDialogOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              cancelLeave();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-customization-title"
            aria-describedby="leave-customization-description"
            className="w-full max-w-md rounded-[24px] border border-feasta-border-soft bg-white p-6 shadow-2xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelLeave();
              }
            }}
          >
            <h2
              id="leave-customization-title"
              className="text-xl font-extrabold tracking-[-0.03em] text-foreground"
            >
              {savedDraft.isDirty
                ? "Save your event plan before leaving?"
                : "Leave this customization?"}
            </h2>

            <p
              id="leave-customization-description"
              className="mt-3 text-sm leading-6 text-feasta-text-secondary"
            >
              {savedDraft.isDirty
                ? "YouÃ¢â‚¬â„¢ve made changes to this customization. Save them as a draft so you can continue planning later without starting over."
                : "Your latest changes have been saved as a draft. You can continue where you left off when you return."}
            </p>

            <div className="mt-6 grid gap-3">
              {savedDraft.isDirty ? (
                <>
                  <Button
                    type="button"
                    className="min-h-11 rounded-full"
                    onClick={leaveWithSavedDraft}
                  >
                    Save draft & leave
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 rounded-full"
                    onClick={discardAndLeave}
                  >
                    Discard changes
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    className="min-h-11 rounded-full"
                    onClick={leaveWithSavedDraft}
                  >
                    Leave customization
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 rounded-full"
                    onClick={discardAndLeave}
                  >
                    Discard saved draft
                  </Button>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-full"
                onClick={cancelLeave}
              >
                Continue editing
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

/* ==================================================================
   CUSTOMIZATION COMPONENTS
   ================================================================== */

function PackageInclusionGroup({
  title,
  description,
  icon,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  items: readonly string[];
  emptyMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-feasta-border-soft">
      <div className="flex items-start gap-3 border-b border-feasta-divider bg-feasta-canvas p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-strong shadow-sm [&_svg]:size-[18px]">
          {icon}
        </span>

        <div className="min-w-0">
          <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
            {title}
          </h3>

          <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
            {description}
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
          {items.map((item) => (
            <li
              key={item}
              className={[
                "flex min-w-0 items-start gap-3",
                "rounded-[14px]",
                "bg-feasta-canvas p-3.5",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={[
                  "mt-0.5 grid size-5",
                  "shrink-0 place-items-center",
                  "rounded-full",
                  "bg-secondary",
                  "text-primary-strong",
                ].join(" ")}
              >
                <Check className="size-3.5" />
              </span>

              <span className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                {item}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-4 sm:p-5">
          <p className="rounded-[14px] border border-dashed border-feasta-border-strong bg-feasta-canvas px-4 py-3 text-sm leading-6 text-feasta-text-secondary">
            {emptyMessage}
          </p>
        </div>
      )}
    </section>
  );
}
function EventServiceGroup({
  title,
  description,
  services,
  selectedIds,
  availabilityByProvider,
  availabilityCurrent,
  onToggle,
  emptyMessage,
}: {
  title: string;
  description: string;
  services: readonly PublicEventService[];
  selectedIds: readonly string[];
  availabilityByProvider: ReadonlyMap<string, CustomerProviderAvailability>;
  availabilityCurrent: boolean;
  onToggle: (serviceId: string) => void;
  emptyMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-feasta-border-soft">
      <div className="border-b border-feasta-divider bg-feasta-canvas p-4 sm:p-5">
        <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          {description}
        </p>
      </div>

      {services.length > 0 ? (
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          {services.map((service) => (
            <EventServiceCard
              key={service.id}
              service={service}
              selected={selectedIds.includes(
                service.id,
              )}
              selectionLimitReached={
                selectedIds.length >= 20 &&
                !selectedIds.includes(
                  service.id,
                )
              }
              availability={
                availabilityCurrent
                  ? availabilityByProvider.get(service.providerId) ?? null
                  : null
              }
              onToggle={() =>
                onToggle(service.id)
              }
            />
          ))}
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <p className="rounded-[14px] border border-dashed border-feasta-border-strong bg-feasta-canvas px-4 py-3 text-sm leading-6 text-feasta-text-secondary">
            {emptyMessage}
          </p>
        </div>
      )}
    </section>
  );
}

function EventServiceCard({
  service,
  selected,
  selectionLimitReached,
  availability,
  onToggle,
}: {
  service: PublicEventService;
  selected: boolean;
  selectionLimitReached: boolean;
  availability: CustomerProviderAvailability | null;
  onToggle: () => void;
}) {
  const unavailable = availability?.available === false;
  const disabled = selectionLimitReached || (unavailable && !selected);

  return (
    <label
      className={[
        "group relative grid min-w-0 overflow-hidden rounded-[16px] border",
        "transition-[border-color,background-color,box-shadow,transform]",
        selected
          ? "border-primary/35 bg-secondary shadow-brand-subtle"
          : "border-feasta-border-soft bg-white hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_7px_20px_rgb(43_33_29/0.05)]",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer",
        "motion-reduce:transform-none",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={
          disabled
        }
        onChange={onToggle}
        className="peer sr-only"
      />

      {service.imageUrl ? (
        // Public service image URLs are normalized server-side.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={service.imageUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="aspect-[16/8] w-full object-cover"
        />
      ) : (
        <div className="grid aspect-[16/8] place-items-center bg-feasta-canvas">
          <Sparkles
            aria-hidden="true"
            className="size-7 text-primary-strong"
          />
        </div>
      )}

      <div className="grid gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={[
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border",
              "transition-[border-color,background-color,color]",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-feasta-border-strong bg-white text-transparent",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
              "peer-focus-visible:ring-offset-2",
            ].join(" ")}
          >
            <Check className="size-3.5" />
          </span>

          <div className="min-w-0">
            <h4 className="break-words text-sm font-extrabold leading-5 text-foreground">
              {service.name}
            </h4>

            <p className="mt-1 break-words text-xs font-semibold text-feasta-text-secondary">
              {service.providerName}
            </p>

            {availability ? (
              <p
                className={[
                  "mt-2 flex items-start gap-1.5 text-xs font-bold leading-5",
                  availability.available ? "text-success" : "text-warning",
                ].join(" ")}
                role="status"
              >
                {availability.available ? (
                  <CircleCheckBig aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                )}
                <span>
                  {selected && unavailable
                    ? `Selected, but no longer available. ${availability.message}`
                    : availability.message}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {service.description ? (
          <p className="line-clamp-3 text-xs leading-5 text-feasta-text-secondary">
            {service.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-feasta-divider pt-3">
          <div>
            {service.category ? (
              <span className="inline-flex rounded-full bg-feasta-canvas px-2.5 py-1 text-[10px] font-bold text-feasta-text-secondary">
                {humanizeProviderValue(
                  service.category,
                )}
              </span>
            ) : null}
          </div>

          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
              Price
            </p>

            {service.price !== null ? (
              <PriceDisplay
                amount={service.price}
                className="mt-0.5"
              />
            ) : (
              <p className="mt-0.5 text-xs font-semibold text-feasta-text-secondary">
                Not listed
              </p>
            )}
          </div>
        </div>
      </div>
    </label>
  );
}

function BookingReview({
  packageRecord,
  providerName,
  eventDraft,
  customizationDraft,
  includedServices,
  selectedCateringServiceTier,
  selectedPackageTheme,
  selectedEventServices,
  selectedEventServicesSubtotal,
  willArrangeOwnAddOns,
  customerArrangedAddOnsNote,
  isSubmitting,
  submissionError,
  submissionResult,
  refundPolicyStatus,
  refundPolicyResult,
  refundPolicyError,
  refundPolicyNotice,
  acknowledgedPolicyKeys,
  onRefundPolicyAcknowledgementChange,
  onRetryRefundPolicies,
  onEditEventDetails,
  onEditEventServices,
  onBack,
  onSubmit,
}: {
  packageRecord:
    PublicPackageDetail["packageRecord"];

  providerName: string;

  eventDraft:
    EventDetailsDraft;

  customizationDraft:
    PackageCustomizationDraft;

  includedServices:
    readonly string[];

  selectedCateringServiceTier:
    CateringServiceTierId | null;

  selectedPackageTheme:
    {
      id: string;
      name: string;
      description: string;
    } | null;

  selectedEventServices:
    readonly PublicEventService[];

  selectedEventServicesSubtotal:
    number;

  willArrangeOwnAddOns:
    boolean;

  customerArrangedAddOnsNote:
    string;

  isSubmitting:
    boolean;

  submissionError:
    string | null;

  submissionResult:
    SubmitBookingRequestResult | null;

  refundPolicyStatus: RefundPolicyStatus;

  refundPolicyResult: CustomerRefundPolicyDisclosureResult | null;

  refundPolicyError: RefundPolicyDisclosureError | null;

  refundPolicyNotice: string | null;

  acknowledgedPolicyKeys: Readonly<Record<string, string>>;

  onRefundPolicyAcknowledgementChange: (
    policy: CustomerRefundPolicyDisclosure,
    checked: boolean,
  ) => void;

  onRetryRefundPolicies:
    () => void;

  onEditEventDetails:
    () => void;

  onEditEventServices:
    () => void;

  onBack:
    () => void;

  onSubmit:
    () => Promise<void>;
}) {
  const estimatedTotal =
    packageRecord.price !== null
      ? packageRecord.price +
        selectedEventServicesSubtotal
      : null;

  const everyPolicyAcknowledged =
    refundPolicyStatus === "ready" &&
    refundPolicyResult !== null &&
    refundPolicyResult.policies.every(
      (policy) =>
        acknowledgedPolicyKeys[policy.providerId] ===
          policy.effectivePolicyKey,
    );

  return (
    <section
      aria-labelledby="booking-review-title"
      className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Step 5 of 5
        </p>

        <h2
          id="booking-review-title"
          className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl"
        >
          Review your booking
        </h2>

        <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
          Check your event, package
          customization, and selected services
          before sending the request to the
          provider.
        </p>
      </div>

      <div className="mt-7 grid gap-6">
        {/* ==========================================================
            EVENT
           ========================================================== */}

        <ReviewSection
          title="Event details"
          description="When and where your celebration will take place."
          onEdit={onEditEventDetails}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ReviewValue
              label="Event date"
              value={formatEventDate(
                eventDraft.eventDate,
              )}
            />

            <ReviewValue
              label="Event time"
              value={`${formatEventTime(
                eventDraft.eventTime,
              )}  ${formatEventTime(
                eventDraft.eventEndTime,
              )}`}
            />

            <ReviewValue
              label="Guest count"
              value={`${Number(
                eventDraft.guestCount,
              ).toLocaleString(
                "en-PH",
              )} guests`}
            />

            <ReviewValue
              label="Event location"
              value={
                eventDraft.eventLocation
              }
            />
          </div>

          <div className="mt-4">
            <ReviewValue
              label="Complete address"
              value={
                eventDraft.eventAddress
              }
            />
          </div>

          {eventDraft.specialRequest ? (
            <div className="mt-4">
              <ReviewValue
                label="Special requests"
                value={
                  eventDraft.specialRequest
                }
              />
            </div>
          ) : null}
        </ReviewSection>

        {/* ==========================================================
            PACKAGE
           ========================================================== */}

        <ReviewSection
          title="Selected package"
          description="The catering package attached to this booking request."
        >
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="break-words text-lg font-extrabold tracking-[-0.025em] text-foreground">
                {packageRecord.name}
              </p>

              <p className="mt-1 text-sm text-feasta-text-secondary">
                {providerName}
              </p>

              {packageRecord.eventType ? (
                <p className="mt-2 text-xs font-semibold text-feasta-text-secondary">
                  {humanizeProviderValue(
                    packageRecord.eventType,
                  )}
                </p>
              ) : null}
            </div>

            <div className="sm:text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                Package price
              </p>

              <PriceDisplay
                amount={
                  packageRecord.price
                }
                className="mt-1"
              />
            </div>
          </div>
        </ReviewSection>

        {selectedCateringServiceTier ? (
          <ReviewSection
            title="Catering service"
            description="The service level selected from this catering package."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ReviewValue
                label="Service option"
                value={cateringServiceTierLabel(
                  selectedCateringServiceTier,
                )}
              />

              <ReviewValue
                label="Service option price"
                value={
                  packageRecord.price !== null
                    ? formatCurrency(
                        packageRecord.price,
                      )
                    : "Not listed"
                }
              />
            </div>

            {packageRecord.serviceOptions?.[
              selectedCateringServiceTier
            ]?.includedServices.length ? (
              <div className="mt-4">
                <ReviewSelectionList
                  title="Included with this service"
                  values={
                    packageRecord.serviceOptions[
                      selectedCateringServiceTier
                    ]?.includedServices ?? []
                  }
                  emptyText="No additional service inclusions are listed."
                  fixed
                />
              </div>
            ) : null}
          </ReviewSection>
        ) : null}

        {selectedPackageTheme ? (
          <ReviewSection
            title="Package theme"
            description="The included visual theme selected for setup-based catering."
          >
            <div className="rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-foreground">
                    {selectedPackageTheme.name}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                    {selectedPackageTheme.description ||
                      "Visual theme option from this provider."}
                  </p>
                </div>

                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.07em] text-primary-strong">
                  Included
                </span>
              </div>
            </div>
          </ReviewSection>
        ) : null}

        {/* ==========================================================
            CUSTOMIZATION
           ========================================================== */}

        <ReviewSection
          title="Package inclusions"
          description="These items are already included in the published package price."
        >
          <div className="grid gap-5">
            <ReviewSelectionList
              title="Food"
              values={
                customizationDraft.selectedFoods
              }
              emptyText="No food inclusions are listed."
            /><ReviewSelectionList
              title="Included package services"
              values={includedServices}
              emptyText="No additional included services are listed."
              fixed
            />
          </div>
        </ReviewSection>

        {/* ==========================================================
            EVENT SERVICES
           ========================================================== */}

        <ReviewSection
          title="Event services"
          description="Optional FEASTA services selected in addition to the package."
          onEdit={onEditEventServices}
        >
          {selectedEventServices.length >
          0 ? (
            <div className="grid gap-3">
              {selectedEventServices.map(
                (service) => (
                  <div
                    key={service.id}
                    className="grid min-w-0 gap-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-extrabold text-foreground">
                        {service.name}
                      </p>

                      <p className="mt-1 break-words text-xs text-feasta-text-secondary">
                        {
                          service.providerName
                        }
                      </p>

                      {service.category ? (
                        <p className="mt-1 text-[11px] font-semibold text-feasta-text-tertiary">
                          {humanizeProviderValue(
                            service.category,
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="sm:text-right">
                      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                        Displayed price
                      </p>

                      {service.price !==
                      null ? (
                        <PriceDisplay
                          amount={
                            service.price
                          }
                          className="mt-0.5"
                        />
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-feasta-text-secondary">
                          Not listed
                        </p>
                      )}
                    </div>
                  </div>
                ),
              )}

              <div className="flex flex-col gap-2 border-t border-feasta-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-foreground">
                  Displayed add-ons subtotal
                </p>

                <PriceDisplay
                  amount={
                    selectedEventServicesSubtotal
                  }
                />
              </div>
            </div>
          ) : (
            <ReviewEmptyState>
              No FEASTA event services
              selected.
            </ReviewEmptyState>
          )}
        </ReviewSection>

        {/* ==========================================================
            OWN ARRANGEMENTS
           ========================================================== */}

        <ReviewSection
          title="Customer-arranged services"
          description="Services you plan to arrange outside the FEASTA marketplace."
          onEdit={onEditEventServices}
        >
          {willArrangeOwnAddOns ? (
            <div className="rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                  <Check
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-foreground">
                    Customer will arrange
                    additional services
                  </p>

                  {customerArrangedAddOnsNote ? (
                    <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-feasta-text-secondary">
                      {
                        customerArrangedAddOnsNote
                      }
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                      No additional note was
                      provided.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <ReviewEmptyState>
              No customer-arranged services
              indicated.
            </ReviewEmptyState>
          )}
        </ReviewSection>

        <RefundPolicyReview
          status={refundPolicyStatus}
          result={refundPolicyResult}
          error={refundPolicyError}
          notice={refundPolicyNotice}
          acknowledgedPolicyKeys={acknowledgedPolicyKeys}
          onAcknowledgementChange={onRefundPolicyAcknowledgementChange}
          onRetry={onRetryRefundPolicies}
        />

        {/* ==========================================================
            ESTIMATE
           ========================================================== */}

        <section className="overflow-hidden rounded-[22px] border border-primary/15 bg-secondary">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Booking estimate
            </p>

            <h3 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-foreground">
              Review the displayed cost
              before submission.
            </h3>

            <div className="mt-5 grid gap-3">
              <EstimateRow
                label="Package"
                value={
                  packageRecord.price
                }
              />

              <EstimateRow
                label="Selected FEASTA services"
                value={
                  selectedEventServicesSubtotal
                }
              />

              <div className="my-1 border-t border-primary/10" />

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-extrabold text-foreground">
                    Displayed estimated total
                  </p>

                  <p className="mt-1 max-w-lg text-xs leading-5 text-feasta-text-secondary">
                    Final pricing,
                    availability, provider
                    ownership, and payment
                    requirements are validated
                    by FEASTA when the request
                    is submitted.
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {estimatedTotal !==
                  null ? (
                    <PriceDisplay
                      amount={
                        estimatedTotal
                      }
                    />
                  ) : (
                    <span className="text-sm font-bold text-feasta-text-secondary">
                      Not available
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {submissionError ? (
        <div
          role="alert"
          className="mt-6 rounded-[16px] border border-destructive/20 bg-destructive/[0.05] px-4 py-3"
        >
          <p className="text-sm font-bold text-destructive">
            Booking request not submitted
          </p>

          <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
            {submissionError}
          </p>
        </div>
      ) : null}

      {submissionResult ? (
        <div
          role="status"
          className="mt-6 rounded-[16px] border border-success/20 bg-success/[0.06] px-4 py-4"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
              <Check
                aria-hidden="true"
                className="size-4"
              />
            </span>

            <div>
              <p className="text-sm font-extrabold text-foreground">
                Booking request submitted
              </p>

              <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                FEASTA created booking{" "}
                <span className="font-bold text-foreground">
                  {submissionResult.bookingId}
                </span>
                . The provider request is now ready
                for the next booking stage.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============================================================
          ACTIONS
         ============================================================ */}

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-feasta-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          className="min-h-12 rounded-full px-5"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-4"
          />

          Back
        </Button>

        <div className="flex max-w-md flex-col gap-2 sm:items-end">
          <p
            id="booking-refund-policy-submit-requirement"
            className="text-xs leading-5 text-feasta-text-secondary sm:text-right"
          >
            {refundPolicyStatus !== "ready"
              ? "Please wait while FEASTA loads the current Provider refund policies."
              : !everyPolicyAcknowledged
                ? "Before you can submit, review and check every Provider refund policy acknowledgement above."
                : "Submitting sends the configured event to each selected Provider for booking review."}
          </p>

          <Button
            type="button"
            disabled={
              isSubmitting ||
              submissionResult !== null ||
              !everyPolicyAcknowledged
            }
            aria-describedby="booking-refund-policy-submit-requirement"
            aria-busy={
              isSubmitting
            }
            onClick={() => {
              void onSubmit();
            }}
            className="min-h-12 rounded-full px-5"
          >
            {isSubmitting
              ? "Submitting..."
              : submissionResult
                ? "Booking submitted"
                : "Submit for Booking"}

            {!isSubmitting &&
            !submissionResult ? (
              <ArrowRight
                aria-hidden="true"
                className="size-4"
              />
            ) : null}
          </Button>
        </div>
      </div>
    </section>
  );
}

function EventListConfigurationReview({
  packageRecord,
  providerName,
  eventDraft,
  customizationDraft,
  selectedCateringServiceTier,
  selectedPackageTheme,
  selectedEventServices,
  selectedEventServicesSubtotal,
  willArrangeOwnAddOns,
  customerArrangedAddOnsNote,
  isAdding,
  error,
  onBack,
  onAddToList,
}: {
  packageRecord:
    PublicPackageDetail["packageRecord"];

  providerName: string;

  eventDraft:
    EventDetailsDraft;

  customizationDraft:
    PackageCustomizationDraft;

  selectedCateringServiceTier:
    CateringServiceTierId | null;

  selectedPackageTheme:
    {
      id: string;
      name: string;
      description: string;
    } | null;

  selectedEventServices:
    readonly PublicEventService[];

  selectedEventServicesSubtotal:
    number;

  willArrangeOwnAddOns:
    boolean;

  customerArrangedAddOnsNote:
    string;

  isAdding:
    boolean;

  error:
    string | null;

  onBack:
    () => void;

  onAddToList:
    () => void | Promise<void>;
}) {
  const estimatedTotal =
    packageRecord.price === null
      ? null
      : packageRecord.price +
        selectedEventServicesSubtotal;

  return (
    <section
      aria-labelledby="event-list-review-title"
      className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
    >
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Step 5 of 5
        </p>

        <h2
          id="event-list-review-title"
          className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl"
        >
          Review before adding to your Event List
        </h2>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-feasta-text-secondary">
          Check the event details, package
          customization, and optional services.
          Nothing is sent to a Provider yet.
        </p>
      </div>

      <div className="mt-7 grid gap-6">
        <ReviewSection
          title="Event details"
          description="The schedule and venue saved with this Event List item."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ReviewValue
              label="Event date"
              value={
                formatEventDate(
                  eventDraft.eventDate,
                )
              }
            />

            <ReviewValue
              label="Event time"
              value={`${formatEventTime(
                eventDraft.eventTime,
              )} - ${formatEventTime(
                eventDraft.eventEndTime,
              )}`}
            />

            <ReviewValue
              label="Guests"
              value={`${Number(
                eventDraft.guestCount,
              ).toLocaleString(
                "en-PH",
              )} guests`}
            />

            <ReviewValue
              label="Venue"
              value={
                eventDraft
                  .eventLocation
              }
            />
          </div>

          <p className="mt-3 break-words text-xs leading-5 text-feasta-text-secondary">
            {eventDraft.eventAddress}
          </p>

          {eventDraft.specialRequest.trim() ? (
            <div className="mt-4 rounded-[14px] bg-feasta-canvas p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                Notes
              </p>

              <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-feasta-text-secondary">
                {eventDraft.specialRequest}
              </p>
            </div>
          ) : null}
        </ReviewSection>

        <ReviewSection
          title="Selected package"
          description="This configured package will be saved to your Event List."
        >
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="break-words text-lg font-extrabold tracking-[-0.025em] text-foreground">
                {packageRecord.name}
              </p>

              <p className="mt-1 text-sm text-feasta-text-secondary">
                {providerName}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                Package price
              </p>

              <PriceDisplay
                amount={
                  packageRecord.price
                }
                className="mt-1"
              />
            </div>
          </div>
        </ReviewSection>

        <ReviewSection
          title="Package inclusions"
          description="These items are already included in the published package price."
        >
          <div className="grid gap-5">
            <ReviewSelectionList
              title="Food"
              values={
                customizationDraft
                  .selectedFoods
              }
              emptyText="No food inclusions are listed."
            />

            <ReviewSelectionList
              title="Catering service level"
              values={
                selectedCateringServiceTier
                  ? [
                      cateringServiceTierLabel(
                        selectedCateringServiceTier,
                      ),
                    ]
                  : []
              }
              emptyText="No catering service level selected."
              fixed
            />

            {selectedPackageTheme ? (
              <ReviewSelectionList
                title="Setup look"
                values={[selectedPackageTheme.name]}
                emptyText="No setup look selected."
                fixed
              />
            ) : null}
          </div>
        </ReviewSection>

        <ReviewSection
          title="Optional FEASTA services"
          description="Services selected in addition to the package."
        >
          {selectedEventServices.length > 0 ? (
            <div className="grid gap-3">
              {selectedEventServices.map(
                (service) => (
                  <div
                    key={service.id}
                    className="grid min-w-0 gap-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-extrabold text-foreground">
                        {service.name}
                      </p>

                      <p className="mt-1 break-words text-xs text-feasta-text-secondary">
                        {
                          service.providerName
                        }
                      </p>

                      {service.category ? (
                        <p className="mt-1 text-[11px] font-semibold text-feasta-text-tertiary">
                          {humanizeProviderValue(
                            service.category,
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="sm:text-right">
                      {service.price !==
                      null ? (
                        <PriceDisplay
                          amount={
                            service.price
                          }
                        />
                      ) : (
                        <span className="text-xs font-semibold text-feasta-text-secondary">
                          Price not listed
                        </span>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <ReviewEmptyState>
              No additional FEASTA
              services selected.
            </ReviewEmptyState>
          )}
        </ReviewSection>

        {willArrangeOwnAddOns ? (
          <ReviewSection
            title="Customer-arranged services"
            description="Services you plan to arrange outside FEASTA."
          >
            <p className="whitespace-pre-line break-words text-sm leading-6 text-feasta-text-secondary">
              {customerArrangedAddOnsNote.trim() ||
                "Customer will arrange additional services independently."}
            </p>
          </ReviewSection>
        ) : null}

        <section className="overflow-hidden rounded-[22px] border border-primary/15 bg-secondary">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Event List estimate
            </p>

            <h3 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-foreground">
              Estimated cost of this
              configured selection
            </h3>

            <div className="mt-5 grid gap-3">
              <EstimateRow
                label="Package"
                value={
                  packageRecord.price
                }
              />

              <EstimateRow
                label="Selected FEASTA services"
                value={
                  selectedEventServicesSubtotal
                }
              />

              <div className="my-1 border-t border-primary/10" />

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-extrabold text-foreground">
                    Estimated total
                  </p>

                  <p className="mt-1 max-w-lg text-xs leading-5 text-feasta-text-secondary">
                    This is for planning only.
                    Pricing and availability
                    are verified again before
                    the final requests are sent.
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {estimatedTotal !==
                  null ? (
                    <PriceDisplay
                      amount={
                        estimatedTotal
                      }
                    />
                  ) : (
                    <span className="text-sm font-bold text-feasta-text-secondary">
                      Not available
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-[16px] border border-destructive/20 bg-destructive/[0.05] px-4 py-3"
        >
          <p className="text-sm font-bold text-destructive">
            Could not add to Event List
          </p>

          <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
            {error}
          </p>
        </div>
      ) : null}

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-feasta-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          disabled={isAdding}
          onClick={onBack}
          className="min-h-12 rounded-full px-5"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-4"
          />

          Back
        </Button>

        <div className="grid gap-2 sm:justify-items-end">
          <p className="max-w-md text-xs leading-5 text-feasta-text-secondary sm:text-right">
            Adding this configuration only
            saves it to your Event List.
            No Provider request is sent yet.
          </p>

          <Button
            type="button"
            disabled={isAdding}
            aria-busy={isAdding}
            onClick={() => {
              void onAddToList();
            }}
            className="min-h-12 rounded-full px-6"
          >
            {isAdding
              ? "Adding..."
              : "Add to List"}

            {!isAdding ? (
              <ArrowRight
                aria-hidden="true"
                className="size-4"
              />
            ) : null}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReviewSection({
  title,
  description,
  onEdit,
  children,
}: {
  title: string;
  description: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-feasta-border-soft">
      <div className="border-b border-feasta-divider bg-feasta-canvas px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
              {title}
            </h3>

            <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
              {description}
            </p>
          </div>

          {onEdit ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onEdit}
              aria-label={`Edit ${title}`}
              className="min-h-9 shrink-0 self-start rounded-full px-3 text-xs font-bold text-primary-strong"
            >
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {children}
      </div>
    </section>
  );
}
function ReviewValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[14px] bg-feasta-canvas p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-bold leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}

function ReviewSelectionList({
  title,
  values,
  emptyText,
  fixed = false,
}: {
  title: string;
  values: readonly string[];
  emptyText: string;
  fixed?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-extrabold text-foreground">
          {title}
        </h4>

        {fixed ? (
          <span className="rounded-full bg-feasta-canvas px-2 py-0.5 text-[10px] font-bold text-feasta-text-tertiary">
            Included
          </span>
        ) : null}
      </div>

      {values.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {values.map((value) => (
            <li
              key={value}
              className="flex min-w-0 items-start gap-2.5 rounded-[13px] bg-feasta-canvas px-3 py-3"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                <Check
                  aria-hidden="true"
                  className="size-3"
                />
              </span>

              <span className="min-w-0 break-words text-xs font-semibold leading-5 text-feasta-text-secondary">
                {value}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-feasta-text-tertiary">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function ReviewEmptyState({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-feasta-border-strong bg-feasta-canvas px-4 py-3">
      <p className="text-sm leading-6 text-feasta-text-secondary">
        {children}
      </p>
    </div>
  );
}

function RefundPolicyReview({
  status,
  result,
  error,
  notice,
  acknowledgedPolicyKeys,
  onAcknowledgementChange,
  onRetry,
}: {
  status: RefundPolicyStatus;
  result: CustomerRefundPolicyDisclosureResult | null;
  error: RefundPolicyDisclosureError | null;
  notice: string | null;
  acknowledgedPolicyKeys: Readonly<Record<string, string>>;
  onAcknowledgementChange: (
    policy: CustomerRefundPolicyDisclosure,
    checked: boolean,
  ) => void;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="booking-refund-policy-title"
      aria-busy={status === "loading" || undefined}
      className="overflow-hidden rounded-[20px] border border-primary/20 bg-white"
    >
      <div className="border-b border-primary/10 bg-secondary px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <ReceiptText aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h3 id="booking-refund-policy-title" className="text-base font-extrabold tracking-[-0.02em] text-foreground">
              Refund Policy
            </h3>
            <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
              Review and acknowledge the effective policy for every Provider before submitting. No refund amount is estimated here.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        {notice ? (
          <div role="alert" className="rounded-[14px] border border-warning/30 bg-warning-subtle p-3 text-sm font-semibold text-warning">
            {notice}
          </div>
        ) : null}

        {status === "loading" || status === "idle" ? (
          <div role="status" className="grid gap-3">
            <p className="text-sm font-semibold text-feasta-text-secondary">
              Loading current Provider refund policiesÃ¢â‚¬Â¦
            </p>
            <div className="h-36 animate-pulse rounded-[16px] bg-feasta-surface-muted motion-reduce:animate-none" />
          </div>
        ) : null}

        {status === "error" ? (
          <div role="alert" className="rounded-[16px] border border-destructive/20 bg-destructive-subtle p-4">
            <p className="font-bold text-destructive">{error?.title ?? "Refund policies are temporarily unavailable."}</p>
            <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
              {error?.message ?? "Refund policy details could not be loaded."}
            </p>
            {error?.retryable !== false ? <Button type="button" variant="secondary" size="compact" className="mt-3" onClick={onRetry}>
              Try again
            </Button> : null}
          </div>
        ) : null}

        {status === "ready" && result ? (
          <div className="grid gap-4">
            {result.policies.map((policy) => {
              const checked = acknowledgedPolicyKeys[policy.providerId] ===
                policy.effectivePolicyKey;
              return (
                <article key={policy.providerId} className="min-w-0 rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="break-words text-lg font-extrabold text-foreground">
                        {policy.providerName}
                      </h4>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-primary-strong">
                        {policy.sourceKind === "package_override"
                          ? "Package-specific policy"
                          : "Provider default policy"}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-3">
                    {policy.rules.map((rule) => (
                      <div key={rule.stage} className="rounded-[14px] border border-feasta-border-soft bg-white p-3">
                        <dt className="text-xs font-bold text-feasta-text-secondary">
                          {refundStageTitle(rule.stage)}
                        </dt>
                        <dd className="mt-1 text-xl font-extrabold text-foreground">
                          {formatRefundBasisPoints(rule.refundBasisPoints)}%
                        </dd>
                        <dd className="mt-1 text-xs leading-5 text-feasta-text-tertiary">
                          {refundStageDescription(rule.stage)}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {policy.terms ? (
                    <div className="mt-4 rounded-[14px] border border-feasta-border-soft bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                        Additional policy terms
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-feasta-text-secondary">
                        {policy.terms}
                      </p>
                    </div>
                  ) : null}

                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[14px] border border-primary/20 bg-white p-4 text-sm leading-6 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onAcknowledgementChange(
                        policy,
                        event.currentTarget.checked,
                      )}
                      className="mt-1 size-5 shrink-0 accent-primary"
                    />
                    <span>
                      I have reviewed {policy.providerName}&apos;s refund policy. I understand that the policy attached to this booking is the version I agree to now, and later Provider policy changes will not alter this existing booking.
                    </span>
                  </label>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function refundStageTitle(stage: CustomerRefundPolicyDisclosure["rules"][number]["stage"]): string {
  if (stage === "preparation_not_started") return "Preparation Not Started";
  if (stage === "preparation_started") return "Preparation Started";
  return "Service Started";
}

function refundStageDescription(stage: CustomerRefundPolicyDisclosure["rules"][number]["stage"]): string {
  if (stage === "preparation_not_started") {
    return "Before the Provider starts preparing for the event.";
  }
  if (stage === "preparation_started") {
    return "After preparation, procurement, or event setup has started.";
  }
  return "Once the actual event service has begun.";
}

function formatRefundBasisPoints(value: number): string {
  const whole = Math.floor(value / 100);
  const decimal = String(value % 100).padStart(2, "0").replace(/0+$/u, "");
  return decimal ? `${whole}.${decimal}` : String(whole);
}

function ProviderAvailabilityPanel({
  providerName,
  status,
  result,
  error,
  onRetry,
}: {
  providerName: string;
  status: AvailabilityStatus;
  result: CustomerProviderAvailability | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "idle") {
    return (
      <div className="rounded-[16px] border border-feasta-border-soft bg-feasta-canvas px-4 py-3">
        <p className="text-sm font-extrabold text-foreground">
          Provider availability
        </p>
        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          Choose a valid date, time range, and guest count to check {providerName}.
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div
        className="rounded-[16px] border border-info/20 bg-info-subtle px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-extrabold text-info">
          Checking provider availabilityÃ¢â‚¬Â¦
        </p>
        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          FEASTA is checking the selected schedule with each provider.
        </p>
      </div>
    );
  }

  if (status === "ready" && result) {
    return (
      <div
        className={[
          "rounded-[16px] border px-4 py-3",
          result.available
            ? "border-success/20 bg-success-subtle"
            : "border-warning/25 bg-warning-subtle",
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        <p className={[
          "flex items-center gap-2 text-sm font-extrabold",
          result.available ? "text-success" : "text-warning",
        ].join(" ")}>
          {result.available ? (
            <CircleCheckBig aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          )}
          {result.available
            ? `${providerName} is available`
            : `${providerName} is unavailable`}
        </p>
        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          {result.message}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[16px] border border-destructive/20 bg-destructive/[0.05] px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-extrabold text-destructive">
        Availability could not be checked
      </p>
      <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
        {error ?? "Provider availability could not be checked. Please try again."}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="compact"
        className="mt-3"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

function EstimateRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-semibold text-feasta-text-secondary">
        {label}
      </span>

      {value !== null ? (
        <PriceDisplay
          amount={value}
        />
      ) : (
        <span className="text-xs font-semibold text-feasta-text-tertiary">
          Not listed
        </span>
      )}
    </div>
  );
}

/* ==================================================================
   SHARED FORM COMPONENTS
   ================================================================== */

function Field({
  label,
  hint,
  helper,
  error,
  optional = false,
  children,
}: {
  label: string;
  hint?: string;
  helper?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-foreground">
        <span>
          {label}

          {optional ? (
            <span className="ml-1 font-medium text-feasta-text-tertiary">
              (optional)
            </span>
          ) : null}
        </span>

        {hint ? (
          <span className="text-xs font-medium text-feasta-text-tertiary">
            {hint}
          </span>
        ) : null}
      </span>

      {children}

      {error ? (
        <span
          role="alert"
          aria-live="polite"
          className="text-xs font-semibold text-destructive"
        >
          {error}
        </span>
      ) : helper ? (
        <span className="text-xs leading-5 text-feasta-text-secondary">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

function ReadOnlyField({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-strong shadow-sm [&_svg]:size-[18px]">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-extrabold text-foreground">
          {value}
        </p>

        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          {description}
        </p>
      </div>
    </div>
  );
}

function SummaryLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 text-primary [&_svg]:size-4">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
          {label}
        </p>

        <p className="mt-0.5 break-words text-xs font-semibold text-feasta-text-secondary">
          {value}
        </p>
      </div>
    </div>
  );
}

function SelectionSummary({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-feasta-text-secondary">
        {label}
      </span>

      <span className="rounded-full bg-secondary px-2 py-0.5 font-extrabold text-primary-strong">
        {count}
      </span>
    </div>
  );
}
/* ==================================================================
   VALIDATION / FORMAT HELPERS
   ================================================================== */

function availabilityInputForDraft(input: {
  eventDate: string;
  eventTime: string;
  eventEndTime: string;
  guestCount: string;
  packageId: string;
  addonIds: readonly string[];
  minimumGuests: number | null;
  maximumGuests: number | null;
}): CustomerProviderAvailabilityInput | null {
  const guestCount = Number(input.guestCount);

  if (
    !isCanonicalDateValue(input.eventDate) ||
    input.eventDate < tomorrowDateValue() ||
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(input.eventTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(input.eventEndTime) ||
    input.eventEndTime <= input.eventTime ||
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10_000 ||
    (
      input.minimumGuests !== null &&
      guestCount < input.minimumGuests
    ) ||
    (
      input.maximumGuests !== null &&
      guestCount > input.maximumGuests
    )
  ) {
    return null;
  }

  return {
    packageId: input.packageId,
    addonIds: input.addonIds,
    eventDate: input.eventDate,
    eventTime: input.eventTime,
    eventEndTime: input.eventEndTime,
    guestCount,
  };
}

function availabilityRequestKey(
  input: CustomerProviderAvailabilityInput,
): string {
  return JSON.stringify(input);
}

function availabilityResultMap(
  results: readonly CustomerProviderAvailability[],
): ReadonlyMap<string, CustomerProviderAvailability> {
  return new Map(results.map((result) => [result.providerId, result]));
}

function availabilityErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Provider availability could not be checked. Please try again.";
}

function validateEventDetails(
  draft: EventDetailsDraft,
  minimumGuests: number | null,
  maximumGuests: number | null,
): EventDetailsErrors {
  const errors: EventDetailsErrors = {};

  if (!draft.eventDate) {
    errors.eventDate =
      "Choose your event date.";
  } else {
    if (
      !isCanonicalDateValue(draft.eventDate) ||
      draft.eventDate < tomorrowDateValue()
    ) {
      errors.eventDate =
        "Choose a future event date.";
    }
  }

  if (!draft.eventTime) {
    errors.eventTime =
      "Enter the event start time.";
  }

  if (!draft.eventEndTime) {
    errors.eventEndTime =
      "Enter the event end time.";
  }

  if (
    draft.eventTime &&
    draft.eventEndTime &&
    draft.eventEndTime <=
      draft.eventTime
  ) {
    errors.eventEndTime =
      "End time must be later than the start time.";
  }

  const guestCount =
    Number(draft.guestCount);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10_000
  ) {
    errors.guestCount =
      "Enter a valid guest count.";
  } else {
    const rangeError =
      guestCountRangeError(
        draft.guestCount,
        minimumGuests,
        maximumGuests,
      );

    if (rangeError) {
      errors.guestCount =
        rangeError;
    }
  }

  if (
    draft.eventLocation.trim()
      .length < 1
  ) {
    errors.eventLocation =
      "Enter the event location.";
  } else if (
    draft.eventLocation.trim()
      .length > 180
  ) {
    errors.eventLocation =
      "Event location must be 180 characters or fewer.";
  }

  if (
    draft.eventAddress.trim()
      .length < 1
  ) {
    errors.eventAddress =
      "Enter the complete event address.";
  } else if (
    draft.eventAddress.trim()
      .length > 500
  ) {
    errors.eventAddress =
      "Event address must be 500 characters or fewer.";
  }

  if (
    draft.specialRequest.trim()
      .length > 1000
  ) {
    errors.specialRequest =
      "Special requests must be 1,000 characters or fewer.";
  }

  return errors;
}

function packageGuestRangeNotice(
  minimumGuests: number | null,
  maximumGuests: number | null,
): string | undefined {
  if (
    minimumGuests !== null &&
    maximumGuests !== null
  ) {
    if (
      minimumGuests ===
      maximumGuests
    ) {
      return `This package is available for exactly ${minimumGuests.toLocaleString("en-PH")} guests.`;
    }

    return `This package is available for ${minimumGuests.toLocaleString("en-PH")} to ${maximumGuests.toLocaleString("en-PH")} guests.`;
  }

  if (minimumGuests !== null) {
    return `This package requires at least ${minimumGuests.toLocaleString("en-PH")} guests.`;
  }

  if (maximumGuests !== null) {
    return `This package supports up to ${maximumGuests.toLocaleString("en-PH")} guests.`;
  }

  return undefined;
}

function guestCountRangeError(
  value: string,
  minimumGuests: number | null,
  maximumGuests: number | null,
): string | undefined {
  /*
   * Do not show an error before the customer
   * has entered a value. The normal required
   * validation still runs when Continue is
   * pressed.
   */
  if (!value.trim()) {
    return undefined;
  }

  const guestCount =
    Number(value);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10_000
  ) {
    return "Enter a valid whole-number guest count.";
  }

  if (
    minimumGuests !== null &&
    maximumGuests !== null
  ) {
    if (
      minimumGuests ===
        maximumGuests &&
      guestCount !== minimumGuests
    ) {
      return `Enter exactly ${minimumGuests.toLocaleString("en-PH")} guests to continue.`;
    }

    if (
      guestCount < minimumGuests ||
      guestCount > maximumGuests
    ) {
      return `Enter a guest count between ${minimumGuests.toLocaleString("en-PH")} and ${maximumGuests.toLocaleString("en-PH")} to continue.`;
    }

    return undefined;
  }

  if (
    minimumGuests !== null &&
    guestCount < minimumGuests
  ) {
    return `Enter at least ${minimumGuests.toLocaleString("en-PH")} guests to continue.`;
  }

  if (
    maximumGuests !== null &&
    guestCount > maximumGuests
  ) {
    return `Enter no more than ${maximumGuests.toLocaleString("en-PH")} guests to continue.`;
  }

  return undefined;
}
function packageGuestGuidance(
  minimumGuests: number | null,
  maximumGuests: number | null,
): string | undefined {
  if (
    minimumGuests !== null &&
    maximumGuests !== null
  ) {
    return minimumGuests ===
      maximumGuests
      ? `${minimumGuests.toLocaleString("en-PH")} guests`
      : `${minimumGuests.toLocaleString("en-PH")}Ã¢â‚¬â€œ${maximumGuests.toLocaleString("en-PH")} guests`;
  }

  if (minimumGuests !== null) {
    return `Minimum ${minimumGuests.toLocaleString("en-PH")}`;
  }

  if (maximumGuests !== null) {
    return `Maximum ${maximumGuests.toLocaleString("en-PH")}`;
  }

  return undefined;
}

function formatEventDate(
  value: string,
): string {
  const parts =
    value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return value;
  }

  const date = new Date(
    year,
    month - 1,
    day,
  );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(date);
}

function formatEventTime(
  value: string,
): string {
  const match =
    /^(\d{2}):(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    return value;
  }

  const hours =
    Number(match[1]);

  const minutes =
    Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return value;
  }

  const date =
    new Date(2000, 0, 1);

  date.setHours(
    hours,
    minutes,
    0,
    0,
  );

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function formatCurrency(
  amount: number,
): string {
  return new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    },
  ).format(amount);
}

function tomorrowDateValue(): string {
  const today = manilaDateParts(new Date());
  const tomorrow = new Date(Date.UTC(
    today.year,
    today.month - 1,
    today.day + 1,
  ));
  const year = tomorrow.getUTCFullYear();
  const month = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isCanonicalDateValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function manilaDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}
