"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  PackageOpen,
  Palette,
  Soup,
  Sparkles,
  UsersRound,
  Armchair,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  submitCustomerBookingRequest,
  type SubmitBookingRequestInput,
  type SubmitBookingRequestResult,
} from "@/lib/customer/bookings/customer-booking-submission-client";

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

type EventCustomizationExperienceProps = {
  detail: PublicPackageDetail;
  eventServices: readonly PublicEventService[];
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

const STEPS = [
  {
    number: 1,
    label: "Event details",
  },
  {
    number: 2,
    label: "Customize package",
  },
  {
    number: 3,
    label: "Event services",
  },
  {
    number: 4,
    label: "Review",
  },
] as const;

export function EventCustomizationExperience({
  detail,
  eventServices,
}: EventCustomizationExperienceProps) {
  const {
    packageRecord,
    provider,
    customization,
  } = detail;

  const [step, setStep] = useState(1);

  const router = useRouter();

  const [draft, setDraft] =
    useState<EventDetailsDraft>({
      eventDate: "",
      eventTime: "",
      eventEndTime: "",
      guestCount: "",
      eventLocation:
        provider.location ?? "",
      eventAddress: "",
      specialRequest: "",
    });

  const [
    customizationDraft,
    setCustomizationDraft,
  ] = useState<PackageCustomizationDraft>({
    selectedFoods: [],
    selectedDecorations: [],
    selectedFurniture: [],
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

const submissionIdentityRef =
  useRef<{
    draftKey: string;
    clientRequestId: string;
  } | null>(null);

  const [
    selectedEventServiceIds,
    setSelectedEventServiceIds,
  ] = useState<string[]>([]);

  const [
    willArrangeOwnAddOns,
    setWillArrangeOwnAddOns,
  ] = useState(false);

  const [
    customerArrangedAddOnsNote,
    setCustomerArrangedAddOnsNote,
  ] = useState("");

  const [errors, setErrors] =
    useState<EventDetailsErrors>({});

  const minimumDate = useMemo(
    () => tomorrowDateValue(),
    [],
  );

  const guestGuidance =
    packageGuestGuidance(
      packageRecord.minimumGuests,
      packageRecord.maximumGuests,
    );

  const packageHref =
    `/customer/packages/${encodeURIComponent(
      packageRecord.id,
    )}`;

  const selectedCustomizationCount =
    customizationDraft.selectedFoods.length +
    customizationDraft.selectedDecorations.length +
    customizationDraft.selectedFurniture.length;

  const selectedEventServices =
    eventServices.filter((service) =>
      selectedEventServiceIds.includes(
        service.id,
      ),
    );

  const selectedEventServicesSubtotal =
    selectedEventServices.reduce(
      (total, service) =>
        total + (service.price ?? 0),
      0,
    );

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

  function toggleCustomization(
    field: keyof PackageCustomizationDraft,
    value: string,
  ) {
    setCustomizationDraft((current) => {
      const selected =
        current[field];

      const nextValues =
        selected.includes(value)
          ? selected.filter(
              (item) => item !== value,
            )
          : [...selected, value];

      return {
        ...current,
        [field]: nextValues,
      };
    });
  }

  function toggleEventService(
  serviceId: string,
) {
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
  setStep(4);
}

function buildSubmissionInput(
  clientRequestId: string,
): SubmitBookingRequestInput {
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

  return {
    clientRequestId,

    providerId: provider.id,
    packageId: packageRecord.id,

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

async function handleSubmitBooking() {
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

  try {
    setIsSubmitting(true);

    const draftKey =
      currentSubmissionDraftKey();

    const clientRequestId =
      getSubmissionClientRequestId(
        draftKey,
      );

    const input =
      buildSubmissionInput(
        clientRequestId,
      );

    const result =
      await submitCustomerBookingRequest(
        input,
      );

    setSubmissionResult(result);

    navigateToSubmittedBooking(result);
  } catch (error) {
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

    setStep(2);
  }

  function continueFromCustomization() {
    /*
     * There is intentionally no minimum
     * selection requirement here because
     * submitBookingRequest currently permits
     * empty customization arrays.
     *
     * The Cloud Function independently checks
     * that every submitted value belongs to
     * the selected package.
     */
    setStep(3);
  }

  return (
    <div className="mx-auto grid w-full max-w-[1240px] min-w-0 gap-6">
      {/* ============================================================
          BACK
         ============================================================ */}

      <Link
        href={packageHref}
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
      </Link>

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
                      ? "bg-primary text-white"
                      : completed
                        ? "bg-success text-white"
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
              STEP 1 — EVENT DETAILS
             ======================================================== */}

          {step === 1 ? (
            <section
              aria-labelledby="event-details-title"
              className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                Step 1 of 4
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
                    min={minimumDate}
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
                  error={errors.guestCount}
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
                      errors.guestCount,
                    )}
                  />
                </Field>

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
              STEP 2 — PACKAGE CUSTOMIZATION
             ======================================================== */}

          {step === 2 ? (
            <section
              aria-labelledby="package-customization-title"
              className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                    Step 2 of 4
                  </p>

                  <h2
                    id="package-customization-title"
                    className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
                  >
                    Customize your package
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
                    Choose from the package
                    options published by{" "}
                    {provider.businessName}.
                    Your selections will be
                    verified again when the
                    booking request is
                    submitted.
                  </p>
                </div>

                <div className="shrink-0 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-feasta-text-secondary">
                    <span className="font-extrabold text-foreground">
                      {
                        selectedCustomizationCount
                      }
                    </span>{" "}
                    {selectedCustomizationCount ===
                    1
                      ? "selection"
                      : "selections"}
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-6">
                <CustomizationGroup
                  title="Food selections"
                  description="Choose from the food options published with this package."
                  icon={
                    <Soup
                      aria-hidden="true"
                    />
                  }
                  options={
                    customization.foods
                  }
                  selected={
                    customizationDraft
                      .selectedFoods
                  }
                  onToggle={(value) =>
                    toggleCustomization(
                      "selectedFoods",
                      value,
                    )
                  }
                  emptyMessage="No selectable food options are currently listed for this package."
                />

                <CustomizationGroup
                  title="Decorations"
                  description="Choose any published decoration options you want included."
                  icon={
                    <Palette
                      aria-hidden="true"
                    />
                  }
                  options={
                    customization.decorations
                  }
                  selected={
                    customizationDraft
                      .selectedDecorations
                  }
                  onToggle={(value) =>
                    toggleCustomization(
                      "selectedDecorations",
                      value,
                    )
                  }
                  emptyMessage="No selectable decoration options are currently listed for this package."
                />

                <CustomizationGroup
                  title="Furniture"
                  description="Choose from the furniture options included in the provider's package configuration."
                  icon={
                    <Armchair
                      aria-hidden="true"
                    />
                  }
                  options={
                    customization.furniture
                  }
                  selected={
                    customizationDraft
                      .selectedFurniture
                  }
                  onToggle={(value) =>
                    toggleCustomization(
                      "selectedFurniture",
                      value,
                    )
                  }
                  emptyMessage="No selectable furniture options are currently listed for this package."
                />

                <IncludedServices
                  services={
                    customization.services
                  }
                />
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
                    Package customization is
                    optional unless the provider
                    requires specific choices
                    outside this current public
                    configuration.
                  </p>

                  <Button
                    type="button"
                    onClick={
                      continueFromCustomization
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
              </div>
            </section>
          ) : null}

          {/* ========================================================
              STEP 3 — EVENT SERVICES
            ======================================================== */}

          {step === 3 ? (
            <section
              aria-labelledby="event-services-title"
              className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                    Step 3 of 4
                  </p>

                  <h2
                    id="event-services-title"
                    className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
                  >
                    Add event services
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
                          ? "border-primary bg-primary text-white"
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
                    setStep(2)
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
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success text-white">
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
              STEP 4 — REVIEW PLACEHOLDER
            ======================================================== */}

          {step === 4 ? (
            <BookingReview
              packageRecord={packageRecord}
              providerName={provider.businessName}
              eventDraft={draft}
              customizationDraft={customizationDraft}
              includedServices={customization.services}
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
              onBack={() =>
                setStep(3)
              }
              onSubmit={
                handleSubmitBooking
              }
            />
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
                        ? `${draft.eventTime} – ${draft.eventEndTime}`
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

              {selectedCustomizationCount >
              0 ? (
                <div className="mt-4 border-t border-feasta-divider pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                    Customization
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

                    {customizationDraft
                      .selectedFurniture
                      .length > 0 ? (
                      <SelectionSummary
                        label="Furniture"
                        count={
                          customizationDraft
                            .selectedFurniture
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
    </div>
  );
}

/* ==================================================================
   CUSTOMIZATION COMPONENTS
   ================================================================== */

function CustomizationGroup({
  title,
  description,
  icon,
  options,
  selected,
  onToggle,
  emptyMessage,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
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

      {options.length > 0 ? (
        <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
          {options.map((option) => {
            const checked =
              selected.includes(option);

            return (
              <label
                key={option}
                className={[
                  "group relative flex min-w-0 cursor-pointer items-start gap-3",
                  "rounded-[14px] border p-3.5",
                  "transition-[border-color,background-color,box-shadow]",
                  checked
                    ? "border-primary/35 bg-secondary shadow-[0_3px_12px_rgb(255_99_51/0.06)]"
                    : "border-feasta-border-soft bg-white hover:border-primary/20 hover:bg-feasta-canvas",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onToggle(option)
                  }
                  className="peer sr-only"
                />

                <span
                  aria-hidden="true"
                  className={[
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border",
                    "transition-[border-color,background-color,color]",
                    checked
                      ? "border-primary bg-primary text-white"
                      : "border-feasta-border-strong bg-white text-transparent",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                    "peer-focus-visible:ring-offset-2",
                  ].join(" ")}
                >
                  <Check className="size-3.5" />
                </span>

                <span
                  className={[
                    "min-w-0 break-words text-sm leading-5",
                    checked
                      ? "font-bold text-foreground"
                      : "font-semibold text-feasta-text-secondary",
                  ].join(" ")}
                >
                  {option}
                </span>
              </label>
            );
          })}
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

function IncludedServices({
  services,
}: {
  services: readonly string[];
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-feasta-border-soft">
      <div className="flex items-start gap-3 border-b border-feasta-divider bg-feasta-canvas p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-strong shadow-sm">
          <Sparkles
            aria-hidden="true"
            className="size-[18px]"
          />
        </span>

        <div className="min-w-0">
          <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
            Included services
          </h3>

          <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
            These are published package
            inclusions and are not separate
            marketplace add-ons.
          </p>
        </div>
      </div>

      {services.length > 0 ? (
        <ul className="grid gap-2 p-4 sm:grid-cols-2">
          {services.map((service) => (
            <li
              key={service}
              className="flex min-w-0 items-start gap-3 rounded-[14px] bg-feasta-canvas px-3.5 py-3"
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                <Check
                  aria-hidden="true"
                  className="size-3.5"
                />
              </span>

              <span className="min-w-0 break-words text-sm font-semibold leading-5 text-feasta-text-secondary">
                {service}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-4 sm:p-5">
          <p className="rounded-[14px] border border-dashed border-feasta-border-strong bg-feasta-canvas px-4 py-3 text-sm leading-6 text-feasta-text-secondary">
            No additional included services
            are currently listed for this
            package.
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
  onToggle,
  emptyMessage,
}: {
  title: string;
  description: string;
  services: readonly PublicEventService[];
  selectedIds: readonly string[];
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
  onToggle,
}: {
  service: PublicEventService;
  selected: boolean;
  selectionLimitReached: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={[
        "group relative grid min-w-0 overflow-hidden rounded-[16px] border",
        "transition-[border-color,background-color,box-shadow,transform]",
        selected
          ? "border-primary/35 bg-secondary shadow-[0_5px_18px_rgb(255_99_51/0.07)]"
          : "border-feasta-border-soft bg-white hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_7px_20px_rgb(43_33_29/0.05)]",
        selectionLimitReached
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer",
        "motion-reduce:transform-none",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={
          selectionLimitReached
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
                ? "border-primary bg-primary text-white"
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
  selectedEventServices,
  selectedEventServicesSubtotal,
  willArrangeOwnAddOns,
  customerArrangedAddOnsNote,
  isSubmitting,
  submissionError,
  submissionResult,
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

  return (
    <section
      aria-labelledby="booking-review-title"
      className="rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Step 4 of 4
        </p>

        <h2
          id="booking-review-title"
          className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl"
        >
          Review your booking request
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
              )} – ${formatEventTime(
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

        {/* ==========================================================
            CUSTOMIZATION
           ========================================================== */}

        <ReviewSection
          title="Package customization"
          description="Your selections from the package options published by the provider."
        >
          <div className="grid gap-5">
            <ReviewSelectionList
              title="Food selections"
              values={
                customizationDraft.selectedFoods
              }
              emptyText="No food options selected."
            />

            <ReviewSelectionList
              title="Decorations"
              values={
                customizationDraft
                  .selectedDecorations
              }
              emptyText="No decoration options selected."
            />

            <ReviewSelectionList
              title="Furniture"
              values={
                customizationDraft
                  .selectedFurniture
              }
              emptyText="No furniture options selected."
            />

            <ReviewSelectionList
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
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success text-white">
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
          <p className="text-xs leading-5 text-feasta-text-secondary sm:text-right">
            Sending this request asks the
            selected provider and any
            additional FEASTA service
            providers to review your event.
          </p>

          <Button
            type="button"
            disabled={
              isSubmitting ||
              submissionResult !== null
            }
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
                : "Submit booking request"}

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

function ReviewSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-feasta-border-soft">
      <div className="border-b border-feasta-divider bg-feasta-canvas px-4 py-4 sm:px-5">
        <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          {description}
        </p>
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
  error,
  optional = false,
  children,
}: {
  label: string;
  hint?: string;
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
          className="text-xs font-semibold text-destructive"
        >
          {error}
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
    const selected = new Date(
      `${draft.eventDate}T00:00:00`,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (
      !Number.isFinite(
        selected.getTime(),
      ) ||
      selected <= today
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
  } else if (
    minimumGuests !== null &&
    guestCount < minimumGuests
  ) {
    errors.guestCount =
      `This package starts at ${minimumGuests.toLocaleString("en-PH")} guests.`;
  } else if (
    maximumGuests !== null &&
    guestCount > maximumGuests
  ) {
    errors.guestCount =
      `This package supports up to ${maximumGuests.toLocaleString("en-PH")} guests.`;
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
      : `${minimumGuests.toLocaleString("en-PH")}–${maximumGuests.toLocaleString("en-PH")} guests`;
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
  const date = new Date();

  date.setDate(
    date.getDate() + 1,
  );

  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}