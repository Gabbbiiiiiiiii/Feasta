"use client";

import {
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {useRouter} from "next/navigation";

import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {
  addCustomerEventListItem,
  customerEventListItemKey,
  openCustomerEventList,
  readCustomerEventList,
  readCustomerEventListSchedule,
  writeCustomerEventListSchedule,
  type CustomerCustomMenuEventListItem,
} from "@/lib/customer/event-list/customer-event-list";
import {
  manilaDateValue,
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
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    },
  );

function validOptions(
  item: ProviderMenuImage,
) {
  return (
    item.servingOptions ?? []
  ).filter(
    (option) =>
      /^[a-zA-Z0-9_-]{1,128}$/u.test(
        option.id,
      ) &&
      option.name.trim().length > 0 &&
      option.name.length <= 80 &&
      typeof option.description === "string" &&
      option.description.length <= 160 &&
      Number.isSafeInteger(
        option.minimumGuests,
      ) &&
      Number.isSafeInteger(
        option.maximumGuests,
      ) &&
      option.minimumGuests > 0 &&
      option.maximumGuests > 0 &&
      option.minimumGuests <=
        option.maximumGuests &&
      option.maximumGuests <= 1_000_000 &&
      Number.isFinite(option.price) &&
      option.price > 0 &&
      option.price <= 100_000_000,
  );
}

export function CustomerProviderMenu({
  providerId,
  providerName,
  menuImages,
}: {
  providerId: string;
  providerName: string;
  menuImages: readonly ProviderMenuImage[];
}) {
    const router =
    useRouter();
const [
    active,
    setActive,
  ] =
    useState<ProviderMenuImage | null>(
      null,
    );

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    eventDate,
    setEventDate,
  ] =
    useState("");

  const [
    eventTime,
    setEventTime,
  ] =
    useState("");

  const [
    confirmation,
    setConfirmation,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const opener =
    useRef<HTMLButtonElement | null>(
      null,
    );

  const openListAfterClose =
    useRef(false);

  const editContextRef =
    useRef<{
      menuItemId: string;
      returnTo: string;
    } | null>(
      null,
    );

  const [
    editingMenuItemId,
    setEditingMenuItemId,
  ] =
    useState<string | null>(
      null,
    );

  const minimumDate =
    manilaDateValue();

  const options =
    active
      ? validOptions(active)
      : [];

  const selected =
    options.find(
      (option) =>
        option.id === selectedId,
    );


  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          const parameters =
            new URLSearchParams(
              window.location.search,
            );

          const menuItemId =
            parameters
              .get(
                "editMenuItem",
              )
              ?.trim() ?? "";

          if (!menuItemId) {
            return;
          }

          const item =
            menuImages.find(
              (candidate) =>
                candidate.isPublished &&
                candidate.id ===
                  menuItemId,
            );

          if (!item) {
            return;
          }

          const requestedServingOption =
            parameters
              .get(
                "editServingOption",
              )
              ?.trim() ?? "";

          const servingOptions =
            validOptions(item);

          const selectedOption =
            servingOptions.find(
              (option) =>
                option.id ===
                requestedServingOption,
            ) ?? null;

          const returnTo =
            safeCustomerReturnTo(
              parameters.get(
                "editReturnTo",
              ),
            );

          editContextRef.current =
            {
              menuItemId,
              returnTo,
            };

          setEditingMenuItemId(
            menuItemId,
          );

          const schedule =
            readCustomerEventListSchedule();

          setSelectedId(
            selectedOption?.id ??
              null,
          );

          setEventDate(
            schedule?.eventDate ??
              "",
          );

          setEventTime(
            schedule?.eventTime ??
              "",
          );

          setError("");
          setConfirmation("");

          setActive({
            ...item,

            title:
              item.title ||
              "Menu item",
          });

          /*
           * Remove edit parameters from the provider URL after
           * opening the item so closing the dialog does not
           * immediately reopen it.
           */
          parameters.delete(
            "editMenuItem",
          );

          parameters.delete(
            "editServingOption",
          );

          parameters.delete(
            "editReturnTo",
          );

          const remainingQuery =
            parameters.toString();

          window.history.replaceState(
            null,
            "",
            remainingQuery
              ? `${window.location.pathname}?${remainingQuery}`
              : window.location.pathname,
          );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [menuImages]);
function openMenuItem(
    event: MouseEvent<HTMLButtonElement>,
    item: ProviderMenuImage,
    title: string,
  ) {
    opener.current =
      event.currentTarget;

    const schedule =
      readCustomerEventListSchedule();

    editContextRef.current =
      null;

    setEditingMenuItemId(
      null,
    );

    setSelectedId(null);
    setError("");

    setEventDate(
      schedule?.eventDate ?? "",
    );

    setEventTime(
      schedule?.eventTime ?? "",
    );

    setActive({
      ...item,
      title,
    });
  }

  function addSelection() {
    if (
      !active ||
      !selected
    ) {
      return;
    }

    const normalizedDate =
      eventDate.trim();

    const normalizedTime =
      eventTime.trim();

    if (
      !validEventDate(
        normalizedDate,
        minimumDate,
      )
    ) {
      setError(
        "Choose a valid event date.",
      );

      return;
    }

    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
        normalizedTime,
      )
    ) {
      setError(
        "Choose the time you need this menu item.",
      );

      return;
    }

    const item:
      CustomerCustomMenuEventListItem =
    {
      type: "custom_menu",

      key:
        `custom-menu:${providerId}:${active.id}`,

      providerId,
      providerName,

      menuItemId:
        active.id,

      menuItemName:
        active.title,

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
        active.url,

      providerHref:
        `/customer/providers/${providerId}`,
    };

    addCustomerEventListItem(
      item,
    );

    const saved =
      readCustomerEventList()
        .find(
          (entry) =>
            customerEventListItemKey(
              entry,
            ) === item.key,
        );

    if (
      saved?.type !== "custom_menu" ||
      saved.servingOptionId !==
        selected.id ||
      saved.price !==
        selected.price
    ) {
      setError(
        "Your selection could not be saved. Please try again.",
      );

      return;
    }

    const existingSchedule =
      readCustomerEventListSchedule();

    writeCustomerEventListSchedule({
      ...(existingSchedule ?? {
        eventDate:
          normalizedDate,

        eventTime:
          normalizedTime,
      }),

      eventDate:
        normalizedDate,

      eventTime:
        normalizedTime,
    });

    const savedSchedule =
      readCustomerEventListSchedule();

    if (
      savedSchedule?.eventDate !==
        normalizedDate ||
      savedSchedule.eventTime !==
        normalizedTime
    ) {
      setError(
        "Your event schedule could not be saved. Please try again.",
      );

      return;
    }
    const editContext =
      editContextRef.current;

    setConfirmation(
      editContext
        ? `Updated selection: ${active.title} · ${selected.name}`
        : `Added to List: ${active.title} · ${selected.name}`,
    );

    if (editContext) {
      editContextRef.current =
        null;

      setEditingMenuItemId(
        null,
      );

      openListAfterClose.current =
        false;

      setActive(null);

      router.replace(
        editContext.returnTo,
      );

      return;
    }

    openListAfterClose.current =
      true;

    setActive(null);
  }

  return (
    <>
      <p
        role="status"
        className="text-sm font-semibold text-success"
      >
        {confirmation}
      </p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-3">
        {menuImages
          .filter(
            (item) =>
              item.isPublished,
          )
          .map(
            (
              item,
              index,
            ) => {
              const servingOptions =
                validOptions(
                  item,
                );

              const title =
                item.title ||
                `Menu image ${index + 1}`;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`View ${title}`}
                  onClick={(event) =>
                    openMenuItem(
                      event,
                      item,
                      title,
                    )
                  }
                  className="group overflow-hidden rounded-2xl border border-feasta-border-soft bg-card text-left shadow-[0_4px_18px_rgb(0_75_59/0.035)] transition-[transform,border-color,box-shadow] duration-normal hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_16px_36px_rgb(0_75_59/0.085)] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      item.url
                    }
                    alt=""
                    loading="lazy"
                    className="h-32 w-full object-cover transition-transform duration-slow group-hover:scale-[1.035] motion-reduce:transform-none sm:h-36"
                  />

                  <span className="block p-3">
                    <span className="block truncate text-sm font-bold">
                      {title}
                    </span>

                    <span className="mt-1.5 block text-sm font-semibold text-primary-strong">
                      {servingOptions.length
                        ? `${servingOptions.length > 1 ? "From " : ""}${money.format(
                            Math.min(
                              ...servingOptions.map(
                                (option) =>
                                  option.price,
                              ),
                            ),
                          )}`
                        : "Browsing only"}
                    </span>
                  </span>
                </button>
              );
            },
          )}
      </div>

      <Dialog
        open={
          active !== null
        }
        onOpenChange={(
          open,
        ) => {
          if (!open) {
            setActive(null);
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(
            event,
          ) => {
            event.preventDefault();

            opener.current?.focus();

            if (
              openListAfterClose.current
            ) {
              openListAfterClose.current =
                false;

              openCustomerEventList();
            }
          }}
        >
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {active.title}
                </DialogTitle>

                <DialogDescription>
                  {active.description ||
                    "View this menu item and available serving sizes."}
                </DialogDescription>

                {active.category ? (
                  <p className="text-sm font-semibold text-primary-strong">
                    {
                      active.category
                    }
                  </p>
                ) : null}
              </DialogHeader>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  active.url
                }
                alt={
                  active.title
                }
                className="max-h-56 w-full rounded-xl object-contain"
              />

              {options.length ? (
                <>
                  <fieldset className="grid gap-3">
                    <legend className="mb-3 font-bold">
                      Choose serving size
                    </legend>

                    {options.map(
                      (
                        option,
                      ) => (
                        <label
                          key={
                            option.id
                          }
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 focus-within:ring-2 focus-within:ring-primary ${
                            selectedId ===
                            option.id
                              ? "border-primary bg-secondary"
                              : "border-feasta-border-soft"
                          }`}
                        >
                          <input
                            type="radio"
                            name="menu-serving-size"
                            value={
                              option.id
                            }
                            checked={
                              selectedId ===
                              option.id
                            }
                            onChange={() =>
                              setSelectedId(
                                option.id,
                              )
                            }
                            className="mt-1 accent-primary"
                          />

                          <span className="grid gap-1 text-sm">
                            <span className="font-bold">
                              {
                                option.name
                              }
                            </span>

                            {option.description ? (
                              <span>
                                {
                                  option.description
                                }
                              </span>
                            ) : null}

                            <span>
                              {menuServingGuestLabel(
                                option.minimumGuests,
                                option.maximumGuests,
                              )}
                            </span>

                            <span className="font-bold text-primary-strong">
                              {money.format(
                                option.price,
                              )}
                            </span>
                          </span>
                        </label>
                      ),
                    )}
                  </fieldset>

                  <section className="grid gap-4 rounded-xl border border-feasta-border-soft bg-feasta-canvas p-4">
                    <div>
                      <h3 className="font-bold text-foreground">
                        When do you need it?
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                        This schedule is shared by all selections in your Event List.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                        Event date *

                        <PhilippineDateInput
                          min={
                            minimumDate
                          }
                          value={
                            eventDate
                          }
                          onChange={(
                            event,
                          ) => {
                            setEventDate(
                              event
                                .currentTarget
                                .value,
                            );

                            setError("");
                          }}
                        />
                      </label>

                      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                        Serving / event time *

                        <Input
                          type="time"
                          value={
                            eventTime
                          }
                          onChange={(
                            event,
                          ) => {
                            setEventTime(
                              event
                                .currentTarget
                                .value,
                            );

                            setError("");
                          }}
                        />
                      </label>
                    </div>
                  </section>

                  {error ? (
                    <p
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    disabled={
                      !selected ||
                      !eventDate ||
                      !eventTime
                    }
                    onClick={
                      addSelection
                    }
                    className="min-h-12 rounded-full bg-primary px-5 font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {editingMenuItemId ===
                    active?.id
                      ? "Update selection"
                      : "Add to List"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-feasta-text-secondary">
                  Browsing only. Serving options are not currently available.
                </p>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function safeCustomerReturnTo(
  value: string | null,
): string {
  const normalized =
    value?.trim() ?? "";

  if (
    normalized.startsWith(
      "/customer/",
    ) &&
    !normalized.startsWith(
      "//",
    )
  ) {
    return normalized;
  }

  return "/customer/providers";
}

function validEventDate(
  value: string,
  minimumDate: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      value,
    ) ||
    value < minimumDate
  ) {
    return false;
  }

  const parsed =
    new Date(
      `${value}T00:00:00+08:00`,
    );

  return (
    !Number.isNaN(
      parsed.getTime(),
    ) &&
    manilaDateValue(
      parsed,
    ) === value
  );
}