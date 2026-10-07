"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  PackageOpen,
  PartyPopper,
  Pencil,
  Store,
  Trash2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  loadCustomerMenuItemForEditAction,
} from "@/app/customer/providers/menu-item-actions";
import {
  bookingSubmissionRequiresRefundPolicyRefresh,
  submitCustomerBookingRequest,
  type SubmitCustomMenuBookingRequestInput,
} from "@/lib/customer/bookings/customer-booking-submission-client";
import {
  buildRefundPolicyAcknowledgements,
  getCustomerBookingRefundPolicyDisclosures,
  normalizeDisclosureError,
  type CustomerRefundPolicyDisclosure,
  type CustomerRefundPolicyDisclosureResult,
  type RefundPolicyDisclosureError,
} from "@/lib/customer/bookings/customer-refund-policy-client";
import {
  addCustomerEventListItem,
  customerEventListItemKey,
  removeCustomerEventListItem,
  type CustomerCustomMenuEventListItem,
  type CustomerEventListItem,
  type CustomerEventListSchedule,
  type CustomerPackageEventListItem,
  useCustomerEventList,
  useCustomerEventListSchedule,
  writeCustomerEventListSchedule,
} from "@/lib/customer/event-list/customer-event-list";
import {
  CUSTOMER_PLANNING_EVENT_TYPES,
  formatCustomerEventDate,
  formatCustomerEventTime,
  manilaDateValue,
  type CustomerPlanningEventType,
} from "@/lib/customer/planning/event-planning-context";
import {
  menuServingGuestLabel,
  type ProviderMenuImage,
} from "@/lib/provider/provider-menu";

const money =
  new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );

const EVENT_TYPE_LABELS = {
  birthday: "Birthday",
  wedding: "Wedding",
  debut: "Debut",
  corporate: "Corporate",
  anniversary: "Anniversary",
  other: "Other",
} satisfies Record<
  CustomerPlanningEventType,
  string
>;

type ProviderGroup = {
  providerId: string;
  providerName: string;
  items: CustomerEventListItem[];
};

type EventDetailsDraft = {
  eventType: CustomerPlanningEventType | "";
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventAddress: string;
  specialRequest: string;
};

type EventDetailsErrors =
  Partial<
    Record<
      keyof EventDetailsDraft,
      string
    >
  >;

type CompleteEventSchedule =
  CustomerEventListSchedule & {
    eventType: CustomerPlanningEventType;
    eventLocation: string;
    eventAddress: string;
  };

type RefundPolicyStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export function CustomerEventListReview() {
  const router =
    useRouter();

  const {
    items,
    clearItems,
  } =
    useCustomerEventList();

  const schedule =
    useCustomerEventListSchedule();

  const [
    eventDialogOpen,
    setEventDialogOpen,
  ] =
    useState(false);

  const [
    eventDraft,
    setEventDraft,
  ] =
    useState<EventDetailsDraft>(
      emptyEventDraft(),
    );

  const [
    eventErrors,
    setEventErrors,
  ] =
    useState<EventDetailsErrors>(
      {},
    );

  const [
    refundPolicyStatus,
    setRefundPolicyStatus,
  ] =
    useState<RefundPolicyStatus>(
      "idle",
    );

  const [
    refundPolicyResult,
    setRefundPolicyResult,
  ] =
    useState<CustomerRefundPolicyDisclosureResult | null>(
      null,
    );

  const [
    refundPolicyError,
    setRefundPolicyError,
  ] =
    useState<RefundPolicyDisclosureError | null>(
      null,
    );

  const [
    refundPolicyNotice,
    setRefundPolicyNotice,
  ] =
    useState<string | null>(
      null,
    );

  const [
    refundRetryNonce,
    setRefundRetryNonce,
  ] =
    useState(0);

  const [
    acknowledgedPolicyKeys,
    setAcknowledgedPolicyKeys,
  ] =
    useState<
      Record<string, string>
    >({});

  const [
    isSubmitting,
    setIsSubmitting,
  ] =
    useState(false);

  const [
    submissionError,
    setSubmissionError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    menuEditOpen,
    setMenuEditOpen,
  ] =
    useState(false);

  const [
    menuEditSourceItem,
    setMenuEditSourceItem,
  ] =
    useState<CustomerCustomMenuEventListItem | null>(
      null,
    );

  const [
    menuEditRecord,
    setMenuEditRecord,
  ] =
    useState<ProviderMenuImage | null>(
      null,
    );

  const [
    menuEditSelectedId,
    setMenuEditSelectedId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    menuEditLoading,
    setMenuEditLoading,
  ] =
    useState(false);

  const [
    menuEditError,
    setMenuEditError,
  ] =
    useState<string | null>(
      null,
    );
  const submissionIdentityRef =
    useRef<{
      draftKey: string;
      clientRequestId: string;
    } | null>(null);

  const providerGroups =
    useMemo(() => {
      const groups =
        new Map<
          string,
          ProviderGroup
        >();

      for (const item of items) {
        const current =
          groups.get(
            item.providerId,
          );

        if (current) {
          current.items.push(
            item,
          );
          continue;
        }

        groups.set(
          item.providerId,
          {
            providerId:
              item.providerId,

            providerName:
              item.providerName,

            items: [
              item,
            ],
          },
        );
      }

      return [
        ...groups.values(),
      ];
    }, [items]);

  const {
    estimatedTotal,
    allPricesKnown,
  } =
    useMemo(() => {
      let total = 0;
      let known = true;

      for (const item of items) {
        if (
          item.price === null
        ) {
          known = false;
        }
        else {
          total +=
            item.price;
        }

        if (
          item.type ===
          "custom_menu"
        ) {
          continue;
        }

        for (
          const service of
          item.configuration
            ?.selectedEventServices ??
          []
        ) {
          if (
            service.price ===
            null
          ) {
            known = false;
          }
          else {
            total +=
              service.price;
          }
        }
      }

      return {
        estimatedTotal:
          total,

        allPricesKnown:
          known,
      };
    }, [items]);

  const customMenuItems =
    useMemo(
      () =>
        items.filter(
          (
            item,
          ): item is CustomerCustomMenuEventListItem =>
            item.type ===
            "custom_menu",
        ),
      [items],
    );

  const packageItems =
    useMemo(
      () =>
        items.filter(
          (
            item,
          ): item is CustomerPackageEventListItem =>
            item.type !==
            "custom_menu",
        ),
      [items],
    );

  const customMenuProviderIds =
    useMemo(
      () =>
        [
          ...new Set(
            customMenuItems.map(
              (item) =>
                item.providerId,
            ),
          ),
        ],
      [customMenuItems],
    );

  const hasCustomMenuItems =
    customMenuItems.length > 0;

  const hasPackageItems =
    packageItems.length > 0;

  const customMenuEligible =
    hasCustomMenuItems &&
    !hasPackageItems &&
    customMenuProviderIds.length === 1;

  const customMenuProviderId =
    customMenuEligible
      ? customMenuProviderIds[0] ??
        null
      : null;


  const eventDetailsComplete =
    isCompleteEventSchedule(
      schedule,
    );

  const configuredPackage =
    items.find(
      (
        item,
      ): item is CustomerPackageEventListItem =>
        item.type !==
          "custom_menu" &&
        item.configuration !==
          null &&
        item.configuration !==
          undefined,
    ) ?? null;

  const existingPackageSubmitHref =
    !hasCustomMenuItems &&
    configuredPackage
      ? packageReviewHref(
          configuredPackage
            .packageHref,
        )
      : null;

  useEffect(() => {
    if (
      !customMenuEligible ||
      !customMenuProviderId
    ) {
      return undefined;
    }

    let cancelled =
      false;

    const timer =
      window.setTimeout(
        () => {
          void (
            async () => {
              setRefundPolicyStatus(
                "loading",
              );

              setRefundPolicyError(
                null,
              );

              try {
                const result =
                  await getCustomerBookingRefundPolicyDisclosures(
                    {
                      cateringSelectionType:
                        "custom_menu",

                      providerId:
                        customMenuProviderId,

                      addonIds: [],
                    },
                  );

                if (cancelled) {
                  return;
                }

                setRefundPolicyResult(
                  result,
                );

                setRefundPolicyStatus(
                  "ready",
                );

                setAcknowledgedPolicyKeys(
                  {},
                );
              }
              catch (error) {
                if (cancelled) {
                  return;
                }

                setRefundPolicyResult(
                  null,
                );

                setRefundPolicyError(
                  normalizeDisclosureError(
                    error,
                  ),
                );

                setRefundPolicyStatus(
                  "error",
                );
              }
            }
          )();
        },
        0,
      );

    return () => {
      cancelled =
        true;

      window.clearTimeout(
        timer,
      );
    };
  }, [
    customMenuEligible,
    customMenuProviderId,
    refundRetryNonce,
  ]);

  async function openCustomMenuEditor(
    item: CustomerCustomMenuEventListItem,
  ) {
    setMenuEditSourceItem(
      item,
    );

    setMenuEditRecord(
      null,
    );

    setMenuEditSelectedId(
      null,
    );

    setMenuEditError(
      null,
    );

    setMenuEditOpen(
      true,
    );

    setMenuEditLoading(
      true,
    );

    try {
      const currentItem =
        await loadCustomerMenuItemForEditAction(
          {
            providerId:
              item.providerId,

            menuItemId:
              item.menuItemId,
          },
        );

      if (!currentItem) {
        setMenuEditError(
          "This menu item is no longer available.",
        );

        return;
      }

      const options =
        currentItem.servingOptions ??
        [];

      if (options.length === 0) {
        setMenuEditError(
          "This menu item does not currently have selectable serving sizes.",
        );

        return;
      }

      setMenuEditRecord(
        currentItem,
      );

      setMenuEditSelectedId(
        options.some(
          (option) =>
            option.id ===
            item.servingOptionId,
        )
          ? item.servingOptionId
          : null,
      );
    }
    catch {
      setMenuEditError(
        "The latest menu information could not be loaded. Please try again.",
      );
    }
    finally {
      setMenuEditLoading(
        false,
      );
    }
  }

  function saveCustomMenuEdit() {
    if (
      !menuEditSourceItem ||
      !menuEditRecord ||
      !menuEditSelectedId
    ) {
      return;
    }

    const selected =
      (
        menuEditRecord
          .servingOptions ??
        []
      ).find(
        (option) =>
          option.id ===
          menuEditSelectedId,
      );

    if (!selected) {
      setMenuEditError(
        "Choose an available serving size.",
      );

      return;
    }

    const updated:
      CustomerCustomMenuEventListItem =
    {
      ...menuEditSourceItem,

      menuItemName:
        menuEditRecord.title ||
        menuEditSourceItem
          .menuItemName,

      servingOptionId:
        selected.id,

      servingOptionName:
        selected.name,

      servingDescription:
        selected.description,

      servingMinimumGuests:
        selected.minimumGuests,

      servingMaximumGuests:
        selected.maximumGuests,

      price:
        selected.price,

      imageUrl:
        menuEditRecord.url,
    };

    addCustomerEventListItem(
      updated,
    );

    submissionIdentityRef.current =
      null;

    setSubmissionError(
      null,
    );

    setMenuEditOpen(
      false,
    );
  }
  function openEventEditor() {
    setEventErrors(
      {},
    );

    setEventDraft(
      eventDraftFromSchedule(
        schedule,
      ),
    );

    setEventDialogOpen(
      true,
    );
  }

  function saveEventDetails() {
    const result =
      validateEventDraft(eventDraft);

    setEventErrors(
      result.errors,
    );

    if (!result.schedule) {
      return;
    }

    writeCustomerEventListSchedule(
      result.schedule,
    );

    submissionIdentityRef.current =
      null;

    setSubmissionError(
      null,
    );

    setEventDialogOpen(
      false,
    );
  }

  function removeItem(
    item: CustomerEventListItem,
  ) {
    removeCustomerEventListItem(
      customerEventListItemKey(
        item,
      ),
    );

    submissionIdentityRef.current =
      null;

    setSubmissionError(
      null,
    );
  }

  function updateAcknowledgement(
    policy:
      CustomerRefundPolicyDisclosure,
    checked: boolean,
  ) {
    setAcknowledgedPolicyKeys(
      (current) => {
        if (checked) {
          return {
            ...current,

            [policy.providerId]:
              policy.effectivePolicyKey,
          };
        }

        const next = {
          ...current,
        };

        delete next[
          policy.providerId
        ];

        return next;
      },
    );
  }

  async function submitCustomMenuBooking() {
    setSubmissionError(
      null,
    );

    if (
      isSubmitting ||
      !customMenuEligible ||
      !customMenuProviderId
    ) {
      return;
    }

    if (
      !schedule ||
      !isCompleteEventSchedule(
        schedule,
      )
    ) {
      setSubmissionError(
        "Complete the event details before submitting your booking.",
      );

      openEventEditor();

      return;
    }

    const currentEventValidation =
      validateCompleteScheduleForSubmission(schedule);

    if (currentEventValidation) {
      setSubmissionError(
        currentEventValidation,
      );

      openEventEditor();

      return;
    }

    if (
      refundPolicyStatus !==
        "ready" ||
      !refundPolicyResult
    ) {
      setSubmissionError(
        "Wait for the current refund policy to load before submitting.",
      );

      return;
    }

    const everyPolicyAcknowledged =
      refundPolicyResult.policies.every(
        (policy) =>
          acknowledgedPolicyKeys[
            policy.providerId
          ] ===
          policy.effectivePolicyKey,
      );

    if (
      !everyPolicyAcknowledged
    ) {
      setSubmissionError(
        "Review and acknowledge the Provider refund policy before submitting.",
      );

      return;
    }

    try {
      setIsSubmitting(
        true,
      );

      const menuSelections =
        customMenuItems
          .map(
            (item) => ({
              menuItemId:
                item.menuItemId,

              servingOptionId:
                item.servingOptionId,
            }),
          )
          .sort(
            (left, right) =>
              `${left.menuItemId}:${left.servingOptionId}`.localeCompare(
                `${right.menuItemId}:${right.servingOptionId}`,
              ),
          );

      const draftKey =
        JSON.stringify({
          providerId:
            customMenuProviderId,

          menuSelections,

          eventType:
            schedule.eventType,

          eventDate:
            schedule.eventDate,

          eventTime:
            schedule.eventTime,
          eventLocation:
            schedule.eventLocation,

          eventAddress:
            schedule.eventAddress,

          specialRequest:
            schedule.specialRequest ??
            "",
        });

      const clientRequestId =
        getSubmissionClientRequestId(
          draftKey,
        );

      const input:
        SubmitCustomMenuBookingRequestInput =
        {
          clientRequestId,

          cateringSelectionType:
            "custom_menu",

          providerId:
            customMenuProviderId,

          eventType:
            schedule.eventType,

          eventDate:
            schedule.eventDate,

          eventTime:
            schedule.eventTime,
          eventLocation:
            schedule.eventLocation,

          eventAddress:
            schedule.eventAddress,
          menuSelections,

          addonIds: [],

          ...(schedule.specialRequest
            ? {
                specialRequest:
                  schedule.specialRequest,
              }
            : {}),

          willArrangeOwnAddOns:
            false,

          policyAcknowledgements:
            buildRefundPolicyAcknowledgements(
              refundPolicyResult
                .policies,
            ),
        };

      const result =
        await submitCustomerBookingRequest(
          input,
        );

      clearItems();

      router.replace(
        `/customer/bookings?submitted=${encodeURIComponent(
          result.bookingId,
        )}`,
      );
    }
    catch (error) {
      if (
        bookingSubmissionRequiresRefundPolicyRefresh(
          error,
        )
      ) {
        setAcknowledgedPolicyKeys(
          {},
        );

        setRefundPolicyNotice(
          "A Provider refund policy changed. Review the updated policy and acknowledge it again before submitting.",
        );

        setRefundRetryNonce(
          (current) =>
            current + 1,
        );
      }

      setSubmissionError(
        error instanceof Error &&
          error.message.trim()
          ? error.message
          : "We could not submit your booking request. Please try again.",
      );
    }
    finally {
      setIsSubmitting(
        false,
      );
    }
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[24px] border border-feasta-border-soft bg-white p-6 text-center shadow-[0_8px_28px_rgb(0_75_59/0.04)] sm:p-8">
          <h1 className="text-2xl font-extrabold text-foreground">
            Your Event List is empty
          </h1>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-feasta-text-secondary">
            Browse providers, packages, and menu items before reviewing your event.
          </p>

          <Link
            href="/customer/providers"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Browse providers

            <ArrowRight
              aria-hidden="true"
              className="size-4"
            />
          </Link>
        </section>
      </main>
    );
  }

  const mixedBookingTypes =
    hasCustomMenuItems &&
    hasPackageItems;

  const multipleMenuProviders =
    hasCustomMenuItems &&
    !hasPackageItems &&
    customMenuProviderIds.length > 1;

  const everyPolicyAcknowledged =
    refundPolicyStatus ===
      "ready" &&
    refundPolicyResult !==
      null &&
    refundPolicyResult.policies.every(
      (policy) =>
        acknowledgedPolicyKeys[
          policy.providerId
        ] ===
        policy.effectivePolicyKey,
    );

  return (
    <>
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header>
          <Link
            href="/customer/providers"
            className="inline-flex min-h-10 items-center gap-2 rounded-full text-sm font-bold text-primary-strong outline-none transition hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
            />

            Continue browsing
          </Link>

          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Your selections
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-foreground sm:text-4xl">
            Review List
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-feasta-text-secondary">
            Review your event details, providers, menu items, serving sizes, and displayed prices before submitting your booking request.
          </p>
        </header>

        <section className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(0_75_59/0.04)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-primary-strong">
                Your event
              </p>

              <h2 className="mt-2 text-xl font-extrabold text-foreground">
                Event schedule
              </h2>
            </div>

            {hasCustomMenuItems ? (
              <button
                type="button"
                onClick={
                  openEventEditor
                }
                className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-full border border-feasta-border-soft bg-white px-4 text-sm font-bold text-primary-strong outline-none transition hover:border-primary/25 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Pencil
                  aria-hidden="true"
                  className="size-4"
                />

                {eventDetailsComplete
                  ? "Edit event"
                  : "Complete event details"}
              </button>
            ) : null}
          </div>

          {schedule ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <EventDetail
                icon={
                  <CalendarDays className="size-4" />
                }
                label="Event date"
                value={
                  formatCustomerEventDate(
                    schedule.eventDate,
                  )
                }
              />

              <EventDetail
                icon={
                  <Clock3 className="size-4" />
                }
                label="Start time"
                value={
                  formatCustomerEventTime(
                    schedule.eventTime,
                  )
                }
              />

              {!hasCustomMenuItems && schedule.eventEndTime ? (
                <EventDetail
                  icon={
                    <Clock3 className="size-4" />
                  }
                  label="End time"
                  value={
                    formatCustomerEventTime(
                      schedule.eventEndTime,
                    )
                  }
                />
              ) : null}

              {schedule.eventType ? (
                <EventDetail
                  icon={
                    <PartyPopper className="size-4" />
                  }
                  label="Event type"
                  value={
                    EVENT_TYPE_LABELS[
                      schedule.eventType
                    ]
                  }
                />
              ) : null}

              {!hasCustomMenuItems && schedule.guestCount !==
              undefined ? (
                <EventDetail
                  icon={
                    <UsersRound className="size-4" />
                  }
                  label="Guests"
                  value={`${schedule.guestCount} guests`}
                />
              ) : null}

              {schedule.eventLocation ? (
                <EventDetail
                  icon={
                    <MapPin className="size-4" />
                  }
                  label="Event location"
                  value={
                    schedule.eventLocation
                  }
                />
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">
              Add your event details before submitting this Event List.
            </p>
          )}

          {schedule?.eventAddress ? (
            <div className="mt-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                Complete event address
              </p>

              <p className="mt-1 text-sm font-semibold leading-6 text-foreground">
                {schedule.eventAddress}
              </p>
            </div>
          ) : null}

          {schedule?.specialRequest ? (
            <div className="mt-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                Special request
              </p>

              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {schedule.specialRequest}
              </p>
            </div>
          ) : null}
        </section>

        <div className="grid gap-5">
          {providerGroups.map(
            (group) => (
              <section
                key={
                  group.providerId
                }
                className="overflow-hidden rounded-[24px] border border-feasta-border-soft bg-white shadow-[0_8px_28px_rgb(0_75_59/0.04)]"
              >
                <header className="flex items-center gap-3 border-b border-feasta-divider bg-feasta-canvas px-5 py-4 sm:px-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
                    <Store
                      aria-hidden="true"
                      className="size-5"
                    />
                  </span>

                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary-strong">
                      Provider
                    </p>

                    <h2 className="truncate text-base font-extrabold text-foreground">
                      {
                        group.providerName
                      }
                    </h2>
                  </div>
                </header>

                <div className="grid gap-3 p-4 sm:p-5">
                  {group.items.map(
                    (item) =>
                      item.type ===
                      "custom_menu" ? (
                        <article
                          key={
                            item.key
                          }
                          className="grid min-w-0 gap-3 rounded-[16px] border border-feasta-border-soft bg-white p-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              item.imageUrl
                            }
                            alt=""
                            className="size-16 rounded-xl object-cover"
                          />

                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-foreground">
                              {
                                item.menuItemName
                              }
                            </p>

                            <p className="mt-1 text-xs font-semibold text-feasta-text-secondary">
                              {
                                item.servingOptionName
                              }
                            </p>

                            <p className="mt-1 text-xs text-feasta-text-secondary">
                              {menuServingGuestLabel(
                                item.servingMinimumGuests,
                                item.servingMaximumGuests,
                              )}
                            </p>

                            {item.servingDescription ? (
                              <p className="mt-1 text-xs leading-5 text-feasta-text-tertiary">
                                {
                                  item.servingDescription
                                }
                              </p>
                            ) : null}
                          </div>

                          <div className="flex min-w-[8rem] flex-row items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
                            <p className="whitespace-nowrap text-sm font-extrabold text-primary-strong">
                              {money.format(
                                item.price,
                              )}
                            </p>

                            <div className="flex flex-wrap justify-end gap-2">
                                                            <button
                                type="button"
                                onClick={() =>
                                  void openCustomMenuEditor(
                                    item,
                                  )
                                }
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-feasta-border-soft px-3 text-xs font-bold text-primary-strong outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                              >
                                <Pencil
                                  aria-hidden="true"
                                  className="size-3.5"
                                />

                                Edit
                              </button>

                              <button
                                type="button"
                                aria-label={`Remove ${item.menuItemName} from Event List`}
                                onClick={() =>
                                  removeItem(
                                    item,
                                  )
                                }
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-feasta-border-soft px-3 text-xs font-bold text-destructive outline-none transition hover:bg-destructive-subtle focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="size-3.5"
                                />

                                Remove
                              </button>
                            </div>
                          </div>
                        </article>
                      ) : (
                        <article
                          key={
                            item.packageId
                          }
                          className="grid min-w-0 gap-3 rounded-[16px] border border-feasta-border-soft bg-white p-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
                        >
                          <div className="grid size-16 place-items-center overflow-hidden rounded-xl bg-feasta-surface-muted">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  item.imageUrl
                                }
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <PackageOpen
                                aria-hidden="true"
                                className="size-6 text-feasta-text-tertiary"
                              />
                            )}
                          </div>

                          <div className="min-w-0">
                            <Link
                              href={
                                item.packageHref
                              }
                              className="rounded-md text-sm font-extrabold text-foreground outline-none hover:text-primary-strong focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {
                                item.packageName
                              }
                            </Link>

                            <p className="mt-1 text-xs text-feasta-text-secondary">
                              Package
                            </p>

                            {item.configuration ? (
                              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                                {
                                  formatCustomerEventDate(
                                    item.configuration
                                      .event
                                      .eventDate,
                                  )
                                }{" "}
                                ·{" "}
                                {
                                  formatCustomerEventTime(item.configuration.event.eventTime)
}{" "}
                                ·{" "}
                                {
                                  item.configuration
                                    .event
                                    .guestCount
                                }{" "}
                                guests
                              </p>
                            ) : null}
                          </div>

                          <div className="flex min-w-[8rem] flex-row items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
                            <p className="whitespace-nowrap text-sm font-extrabold text-primary-strong">
                              {item.price ===
                              null
                                ? "Price unavailable"
                                : money.format(
                                    item.price,
                                  )}
                            </p>

                            <div className="flex flex-wrap justify-end gap-2">
                              <Link
                                href={
                                  item.packageHref
                                }
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-feasta-border-soft px-3 text-xs font-bold text-primary-strong outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                              >
                                <Pencil
                                  aria-hidden="true"
                                  className="size-3.5"
                                />

                                Edit
                              </Link>

                              <button
                                type="button"
                                aria-label={`Remove ${item.packageName} from Event List`}
                                onClick={() =>
                                  removeItem(
                                    item,
                                  )
                                }
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-feasta-border-soft px-3 text-xs font-bold text-destructive outline-none transition hover:bg-destructive-subtle focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="size-3.5"
                                />

                                Remove
                              </button>
                            </div>
                          </div>
                        </article>
                      ),
                  )}
                </div>
              </section>
            ),
          )}
        </div>

        {customMenuEligible ? (
          <RefundPolicySection
            status={
              refundPolicyStatus
            }
            result={
              refundPolicyResult
            }
            error={
              refundPolicyError
            }
            notice={
              refundPolicyNotice
            }
            acknowledgedPolicyKeys={
              acknowledgedPolicyKeys
            }
            onAcknowledgementChange={
              updateAcknowledgement
            }
            onRetry={() =>
              setRefundRetryNonce(
                (current) =>
                  current + 1,
              )
            }
          />
        ) : null}

        <section className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(0_75_59/0.04)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
                Estimated event total
              </p>

              <p className="mt-2 text-xs leading-5 text-feasta-text-secondary">
                Displayed prices are reviewed again before the final booking request is created.
              </p>
            </div>

            <p className="shrink-0 text-2xl font-extrabold text-foreground">
              {allPricesKnown
                ? money.format(
                    estimatedTotal,
                  )
                : "Partial total"}
            </p>
          </div>

          {mixedBookingTypes ? (
            <p
              role="alert"
              className="mt-5 rounded-[16px] border border-primary/15 bg-secondary p-4 text-sm font-semibold leading-6 text-foreground"
            >
              Package and custom-menu selections cannot be submitted together yet. Remove one booking type or submit them separately.
            </p>
          ) : null}

          {multipleMenuProviders ? (
            <p
              role="alert"
              className="mt-5 rounded-[16px] border border-primary/15 bg-secondary p-4 text-sm font-semibold leading-6 text-foreground"
            >
              Custom-menu selections from different providers must be submitted separately.
            </p>
          ) : null}

          {submissionError ? (
            <p
              role="alert"
              className="mt-5 rounded-[16px] border border-destructive/20 bg-destructive-subtle p-4 text-sm font-semibold leading-6 text-destructive"
            >
              {submissionError}
            </p>
          ) : null}

          {existingPackageSubmitHref ? (
            <Link
              href={
                existingPackageSubmitHref
              }
              className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(9_59_38/0.14)] outline-none transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
            >
              Continue to Submit Booking

              <ArrowRight
                aria-hidden="true"
                className="size-4"
              />
            </Link>
          ) : customMenuEligible ? (
            <>
              {!eventDetailsComplete ? (
                <button
                  type="button"
                  onClick={
                    openEventEditor
                  }
                  className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(9_59_38/0.14)] outline-none transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Complete Event Details

                  <Pencil
                    aria-hidden="true"
                    className="size-4"
                  />
                </button>
              ) : (
                <>
                  {refundPolicyStatus ===
                  "loading" ? (
                    <p className="mt-5 text-center text-sm font-semibold text-feasta-text-secondary">
                      Loading the current Provider refund policy…
                    </p>
                  ) : null}

                  {refundPolicyStatus ===
                    "ready" &&
                  !everyPolicyAcknowledged ? (
                    <p className="mt-5 text-center text-sm font-semibold text-feasta-text-secondary">
                      Review and acknowledge the refund policy before submitting.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    disabled={
                      isSubmitting ||
                      refundPolicyStatus !==
                        "ready" ||
                      !everyPolicyAcknowledged
                    }
                    onClick={() =>
                      void submitCustomMenuBooking()
                    }
                    className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(9_59_38/0.14)] outline-none transition-[transform,background-color,box-shadow,opacity] enabled:hover:-translate-y-0.5 enabled:hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none"
                  >
                    {isSubmitting
                      ? "Submitting booking..."
                      : refundPolicyStatus ===
                          "loading"
                        ? "Loading refund policy..."
                        : "Submit Booking"}

                    {!isSubmitting ? (
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4"
                      />
                    ) : null}
                  </button>
                </>
              )}
            </>
          ) : null}
        </section>
      </main>

      <CustomMenuEditDialog
        open={
          menuEditOpen
        }
        sourceItem={
          menuEditSourceItem
        }
        menuItem={
          menuEditRecord
        }
        selectedId={
          menuEditSelectedId
        }
        loading={
          menuEditLoading
        }
        error={
          menuEditError
        }
        onOpenChange={
          setMenuEditOpen
        }
        onSelectedIdChange={
          setMenuEditSelectedId
        }
        onSave={
          saveCustomMenuEdit
        }
      />
      <EventDetailsDialog
        open={
          eventDialogOpen
        }
        draft={
          eventDraft
        }
        errors={
          eventErrors
        }
        onOpenChange={
          setEventDialogOpen
        }
        onChange={(
          field,
          value,
        ) => {
          setEventDraft(
            (current) => ({
              ...current,
              [field]:
                value,
            }),
          );

          setEventErrors(
            (current) => ({
              ...current,
              [field]:
                undefined,
            }),
          );
        }}
        onSave={
          saveEventDetails
        }
      />
    </>
  );
}

function EventDetail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
        {icon}
      </span>

      <div className="min-w-0">
        <dt className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
          {label}
        </dt>

        <dd className="mt-1 break-words text-sm font-bold text-foreground">
          {value}
        </dd>
      </div>
    </div>
  );
}

function CustomMenuEditDialog({
  open,
  sourceItem,
  menuItem,
  selectedId,
  loading,
  error,
  onOpenChange,
  onSelectedIdChange,
  onSave,
}: {
  open: boolean;

  sourceItem:
    CustomerCustomMenuEventListItem | null;

  menuItem:
    ProviderMenuImage | null;

  selectedId:
    string | null;

  loading: boolean;

  error:
    string | null;

  onOpenChange: (
    open: boolean,
  ) => void;

  onSelectedIdChange: (
    id: string,
  ) => void;

  onSave: () => void;
}) {
  const options =
    menuItem?.servingOptions ??
    [];

  const selected =
    options.find(
      (option) =>
        option.id ===
        selectedId,
    ) ?? null;

  return (
    <Dialog
      open={
        open
      }
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Edit menu item
          </DialogTitle>

          <DialogDescription>
            Change the serving size without leaving your Review List.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p
            role="status"
            className="py-8 text-center text-sm font-semibold text-feasta-text-secondary"
          >
            Loading current menu options…
          </p>
        ) : error ? (
          <p
            role="alert"
            className="rounded-[16px] border border-destructive/20 bg-destructive-subtle p-4 text-sm font-semibold leading-6 text-destructive"
          >
            {error}
          </p>
        ) : menuItem ? (
          <div className="grid gap-5">
            <div className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  menuItem.url
                }
                alt=""
                className="size-24 shrink-0 rounded-2xl object-cover"
              />

              <div className="min-w-0">
                <h3 className="text-lg font-extrabold text-foreground">
                  {menuItem.title ||
                    sourceItem?.menuItemName ||
                    "Menu item"}
                </h3>

                {menuItem.category ? (
                  <p className="mt-1 text-sm font-semibold text-primary-strong">
                    {menuItem.category}
                  </p>
                ) : null}

                {menuItem.description ? (
                  <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                    {menuItem.description}
                  </p>
                ) : null}
              </div>
            </div>

            <fieldset className="grid gap-3">
              <legend className="font-extrabold text-foreground">
                Choose serving size
              </legend>

              {options.map(
                (option) => (
                  <label
                    key={
                      option.id
                    }
                    className={`flex cursor-pointer items-start gap-3 rounded-[16px] border p-4 transition focus-within:ring-2 focus-within:ring-primary ${
                      selectedId ===
                      option.id
                        ? "border-primary bg-secondary"
                        : "border-feasta-border-soft bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="review-menu-serving-size"
                      value={
                        option.id
                      }
                      checked={
                        selectedId ===
                        option.id
                      }
                      onChange={() =>
                        onSelectedIdChange(
                          option.id,
                        )
                      }
                      className="mt-1 accent-primary"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-foreground">
                        {option.name}
                      </span>

                      {option.description ? (
                        <span className="mt-1 block text-sm text-feasta-text-secondary">
                          {option.description}
                        </span>
                      ) : null}

                      <span className="mt-1 block text-sm text-feasta-text-secondary">
                        {menuServingGuestLabel(
                          option.minimumGuests,
                          option.maximumGuests,
                        )}
                      </span>

                      <span className="mt-2 block font-extrabold text-primary-strong">
                        {money.format(
                          option.price,
                        )}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </fieldset>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  onOpenChange(
                    false,
                  )
                }
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-feasta-border-soft bg-white px-5 text-sm font-bold text-foreground transition hover:bg-feasta-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  selected ===
                  null
                }
                onClick={
                  onSave
                }
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Update selection
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EventDetailsDialog({
  open,
  draft,
  errors,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean;
  draft: EventDetailsDraft;
  errors: EventDetailsErrors;

  onOpenChange: (
    open: boolean,
  ) => void;

  onChange: (
    field:
      keyof EventDetailsDraft,
    value: string,
  ) => void;

  onSave: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Order details
          </DialogTitle>

          <DialogDescription>
            Complete the details FEASTA needs for this a la carte order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <FormField
            label="Event type"
            error={
              errors.eventType
            }
          >
            <select
              value={
                draft.eventType
              }
              onChange={(
                event,
              ) =>
                onChange(
                  "eventType",
                  event.currentTarget
                    .value,
                )
              }
              className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <option value="">
                Select event type
              </option>

              {CUSTOMER_PLANNING_EVENT_TYPES.map(
                (type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {
                      EVENT_TYPE_LABELS[
                        type
                      ]
                    }
                  </option>
                ),
              )}
            </select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Order / event date"
              error={
                errors.eventDate
              }
            >
              <PhilippineDateInput
                value={
                  draft.eventDate
                }
                onChange={(
                  event,
                ) =>
                  onChange(
                    "eventDate",
                    event.currentTarget
                      .value,
                  )
                }
              />
            </FormField>

            <FormField
              label="Requested time"
              error={
                errors.eventTime
              }
            >
              <Input
                type="time"
                value={
                  draft.eventTime
                }
                onChange={(
                  event,
                ) =>
                  onChange(
                    "eventTime",
                    event.currentTarget
                      .value,
                  )
                }
              />
            </FormField>
          </div>

          <FormField
            label="Location"
            error={
              errors.eventLocation
            }
            hint="Venue name, city, municipality, or general delivery/service location."
          >
            <Input
              maxLength={180}
              placeholder="e.g. Ormoc City"
              value={
                draft.eventLocation
              }
              onChange={(
                event,
              ) =>
                onChange(
                  "eventLocation",
                  event.currentTarget
                    .value,
                )
              }
            />
          </FormField>

          <FormField
            label="Complete address"
            error={
              errors.eventAddress
            }
            hint={`${draft.eventAddress.length}/500 characters`}
          >
            <Textarea
              rows={4}
              maxLength={500}
              placeholder="Street, barangay, landmark, venue, or delivery details..."
              value={
                draft.eventAddress
              }
              onChange={(
                event,
              ) =>
                onChange(
                  "eventAddress",
                  event.currentTarget
                    .value,
                )
              }
            />
          </FormField>

          <FormField
            label="Special requests"
            optional
            error={
              errors.specialRequest
            }
            hint={`${draft.specialRequest.length}/1000 characters`}
          >
            <Textarea
              rows={4}
              maxLength={1000}
              placeholder="Food notes, preparation requests, timing concerns, or other details..."
              value={
                draft.specialRequest
              }
              onChange={(
                event,
              ) =>
                onChange(
                  "specialRequest",
                  event.currentTarget
                    .value,
                )
              }
            />
          </FormField>
        </div>

        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() =>
              onOpenChange(
                false,
              )
            }
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-feasta-border-soft bg-white px-5 text-sm font-bold text-foreground outline-none transition hover:bg-feasta-canvas focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={
              onSave
            }
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white outline-none transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Save details
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label,
  hint,
  error,
  optional = false,
  children,
}: {
  label: string;
  hint?: string | null;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-foreground">
      <span>
        {label}

        {!optional ? (
          <span className="text-primary-strong">
            {" "}*
          </span>
        ) : (
          <span className="ml-1 text-xs font-medium text-feasta-text-tertiary">
            optional
          </span>
        )}
      </span>

      {children}

      {error ? (
        <span className="text-xs font-semibold text-destructive">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs font-medium leading-5 text-feasta-text-tertiary">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function RefundPolicySection({
  status,
  result,
  error,
  notice,
  acknowledgedPolicyKeys,
  onAcknowledgementChange,
  onRetry,
}: {
  status: RefundPolicyStatus;
  result:
    CustomerRefundPolicyDisclosureResult | null;
  error:
    RefundPolicyDisclosureError | null;
  notice: string | null;
  acknowledgedPolicyKeys:
    Readonly<
      Record<string, string>
    >;
  onAcknowledgementChange: (
    policy:
      CustomerRefundPolicyDisclosure,
    checked: boolean,
  ) => void;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(0_75_59/0.04)] sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-primary-strong">
        Refund policy
      </p>

      <h2 className="mt-2 text-xl font-extrabold text-foreground">
        Review before submitting
      </h2>

      {notice ? (
        <p className="mt-4 rounded-[16px] border border-primary/15 bg-secondary p-4 text-sm font-semibold leading-6 text-foreground">
          {notice}
        </p>
      ) : null}

      {status ===
        "idle" ||
      status ===
        "loading" ? (
        <p
          role="status"
          className="mt-4 text-sm font-semibold text-feasta-text-secondary"
        >
          Loading current Provider refund policy…
        </p>
      ) : null}

      {status ===
      "error" ? (
        <div
          role="alert"
          className="mt-4 rounded-[16px] border border-destructive/20 bg-destructive-subtle p-4"
        >
          <p className="font-bold text-destructive">
            {error?.title ??
              "Refund policy unavailable"}
          </p>

          <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
            {error?.message ??
              "The current Provider refund policy could not be loaded."}
          </p>

          {error?.retryable !==
          false ? (
            <button
              type="button"
              onClick={
                onRetry
              }
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-feasta-border-soft bg-white px-4 text-sm font-bold text-primary-strong outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {status ===
        "ready" &&
      result ? (
        <div className="mt-4 grid gap-4">
          {result.policies.map(
            (policy) => {
              const checked =
                acknowledgedPolicyKeys[
                  policy.providerId
                ] ===
                policy.effectivePolicyKey;

              return (
                <article
                  key={
                    policy.providerId
                  }
                  className="rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5"
                >
                  <h3 className="font-extrabold text-foreground">
                    {policy.providerName}
                  </h3>

                  {policy.terms ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-feasta-text-secondary">
                      {policy.terms}
                    </p>
                  ) : null}

                  <div className="mt-3 grid gap-2">
                    {policy.rules.map(
                      (rule) => (
                        <div
                          key={
                            rule.stage
                          }
                          className="flex items-center justify-between gap-4 rounded-xl border border-feasta-border-soft bg-white px-3 py-2 text-sm"
                        >
                          <span className="font-semibold text-feasta-text-secondary">
                            {humanizeStage(
                              rule.stage,
                            )}
                          </span>

                          <span className="font-extrabold text-foreground">
                            {formatRefundPercentage(
                              rule.refundBasisPoints,
                            )}{" "}
                            refund
                          </span>
                        </div>
                      ),
                    )}
                  </div>

                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[14px] border border-primary/15 bg-secondary p-4">
                    <input
                      type="checkbox"
                      checked={
                        checked
                      }
                      onChange={(
                        event,
                      ) =>
                        onAcknowledgementChange(
                          policy,
                          event.currentTarget
                            .checked,
                        )
                      }
                      className="mt-0.5 size-4 accent-primary"
                    />

                    <span className="text-sm font-semibold leading-6 text-foreground">
                      I reviewed and agree to {policy.providerName}&apos;s current refund policy.
                    </span>
                  </label>
                </article>
              );
            },
          )}
        </div>
      ) : null}
    </section>
  );
}

function emptyEventDraft():
  EventDetailsDraft {
  return {
    eventType: "",
    eventDate: "",
    eventTime: "",
    eventLocation: "",
    eventAddress: "",
    specialRequest: "",
  };
}

function eventDraftFromSchedule(
  schedule:
    CustomerEventListSchedule | null,
): EventDetailsDraft {
  if (!schedule) {
    return emptyEventDraft();
  }

  return {
    eventType:
      schedule.eventType ??
      "",

    eventDate:
      schedule.eventDate,

    eventTime:
      schedule.eventTime,

    eventLocation:
      schedule.eventLocation ??
      "",

    eventAddress:
      schedule.eventAddress ??
      "",

    specialRequest:
      schedule.specialRequest ??
      "",
  };
}

function validateEventDraft(
  draft:
    EventDetailsDraft,
): {
  errors:
    EventDetailsErrors;

  schedule:
    CustomerEventListSchedule | null;
} {
  const errors:
    EventDetailsErrors =
    {};

  const eventType =
    draft.eventType;

  const eventDate =
    draft.eventDate.trim();

  const eventTime =
    draft.eventTime.trim();

  const eventLocation =
    draft.eventLocation.trim();

  const eventAddress =
    draft.eventAddress.trim();

  const specialRequest =
    draft.specialRequest.trim();

  if (
    !eventType ||
    !CUSTOMER_PLANNING_EVENT_TYPES.includes(
      eventType,
    )
  ) {
    errors.eventType =
      "Choose an event type.";
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      eventDate,
    ) ||
    eventDate <
      manilaDateValue()
  ) {
    errors.eventDate =
      "Choose a valid date.";
  }

  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
      eventTime,
    )
  ) {
    errors.eventTime =
      "Choose a valid requested time.";
  }

  if (
    !eventLocation ||
    eventLocation.length > 180
  ) {
    errors.eventLocation =
      "Enter the location.";
  }

  if (
    !eventAddress ||
    eventAddress.length > 500
  ) {
    errors.eventAddress =
      "Enter the complete address.";
  }

  if (
    specialRequest.length >
    1_000
  ) {
    errors.specialRequest =
      "Special requests must be 1,000 characters or fewer.";
  }

  if (
    Object.keys(
      errors,
    ).length > 0
  ) {
    return {
      errors,
      schedule: null,
    };
  }

  return {
    errors,

    schedule: {
      eventType:
        eventType as CustomerPlanningEventType,

      eventDate,
      eventTime,
      eventLocation,
      eventAddress,

      ...(specialRequest
        ? {specialRequest}
        : {}),
    },
  };
}

function isCompleteEventSchedule(
  schedule:
    CustomerEventListSchedule | null,
): schedule is CompleteEventSchedule {
  return Boolean(
    schedule &&
      schedule.eventType &&
      /^([01]\d|2[0-3]):[0-5]\d$/u.test(
        schedule.eventTime,
      ) &&
      schedule.eventLocation &&
      schedule.eventAddress,
  );
}

function validateCompleteScheduleForSubmission(
  schedule:
    CompleteEventSchedule,
): string | null {
  if (
    schedule.eventDate <
    manilaDateValue()
  ) {
    return "The selected date is no longer valid. Update your order details.";
  }

  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
      schedule.eventTime,
    )
  ) {
    return "Choose a valid requested time.";
  }

  return null;
}

function getSubmissionClientRequestId(
  draftKey: string,
): string {
  const existing =
    submissionIdentityRefGlobal.current;

  if (
    existing &&
    existing.draftKey ===
      draftKey
  ) {
    return existing.clientRequestId;
  }

  const randomId =
    globalThis.crypto
      ?.randomUUID?.();

  if (!randomId) {
    throw new Error(
      "Secure booking initialization is unavailable. Refresh the page and try again.",
    );
  }

  const clientRequestId =
    `booking-${randomId}`;

  submissionIdentityRefGlobal.current =
    {
      draftKey,
      clientRequestId,
    };

  return clientRequestId;
}

/*
 * This object is replaced by the component-local reference below
 * before submission. Keeping generation in one helper avoids
 * accidental non-idempotent retry IDs.
 */
const submissionIdentityRefGlobal: {
  current: {
    draftKey: string;
    clientRequestId: string;
  } | null;
} = {
  current: null,
};

function humanizeStage(
  value: string,
): string {
  const normalized =
    value
      .replace(
        /_/gu,
        " ",
      )
      .trim();

  if (!normalized) {
    return "Policy stage";
  }

  return (
    normalized.charAt(0)
      .toUpperCase() +
    normalized.slice(1)
  );
}

function formatRefundPercentage(
  basisPoints: number,
): string {
  return `${(
    basisPoints / 100
  ).toLocaleString(
    "en-PH",
    {
      maximumFractionDigits: 2,
    },
  )}%`;
}

function packageReviewHref(
  href: string,
): string {
  const [
    pathname,
    query = "",
  ] =
    href.split(
      "?",
      2,
    );

  const parameters =
    new URLSearchParams(
      query,
    );

  parameters.set(
    "reviewList",
    "1",
  );

  const serialized =
    parameters.toString();

  return serialized
    ? `${pathname}?${serialized}`
    : pathname;
}