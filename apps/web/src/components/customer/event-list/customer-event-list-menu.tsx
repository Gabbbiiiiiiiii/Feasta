"use client";

import {
  ArrowRight,
  PackageOpen,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {createPortal} from "react-dom";

import {
  CUSTOMER_EVENT_LIST_OPEN_EVENT,
  customerEventListItemKey,
  useCustomerEventList,
} from "@/lib/customer/event-list/customer-event-list";
import {menuServingGuestLabel} from "@/lib/provider/provider-menu";
import {cn} from "@/lib/utils";

export function CustomerEventListMenu() {
  const [open, setOpen] =
    useState(false);
  const mounted =
    useSyncExternalStore(
      subscribeToNothing,
      () => true,
      () => false,
    );

  const triggerRef =
    useRef<HTMLButtonElement>(null);

  const closeRef =
    useRef<HTMLButtonElement>(null);

  const {
    items,
    removeItem,
    removeService,
    clearItems,
  } = useCustomerEventList();

  const hasEventListItems =
    items.length > 0;

  const reviewListHref =
    hasEventListItems
      ? "/customer/event-list/review"
      : null;

  const {
    selectionCount,
    knownTotal,
    pricedSelectionCount,
  } = useMemo(() => {
    let selections = 0;
    let total = 0;
    let priced = 0;

    for (const item of items) {
      selections += 1;

      if (item.price !== null) {
        total += item.price;
        priced += 1;
      }

      if (item.type === "custom_menu") continue;

      for (
        const service of
        item.configuration
          ?.selectedEventServices ?? []
      ) {
        selections += 1;

        if (service.price !== null) {
          total += service.price;
          priced += 1;
        }
      }
    }

    return {
      selectionCount: selections,
      knownTotal: total,
      pricedSelectionCount: priced,
    };
  }, [items]);

  function openDrawer() {
    setOpen(true);
  }

  function closeDrawer({
    restoreFocus = true,
  }: {
    restoreFocus?: boolean;
  } = {}) {
    /*
     * Keep the drawer mounted while closing.
     * This allows translate-x-full to animate
     * before it becomes non-interactive.
     */
    setOpen(false);

    if (restoreFocus) {
      window.setTimeout(() => {
        triggerRef.current?.focus();
      }, 320);
    }
  }

  useEffect(() => {
    function handleOpenRequest() {
      openDrawer();
    }

    window.addEventListener(
      CUSTOMER_EVENT_LIST_OPEN_EVENT,
      handleOpenRequest,
    );



  return () => {
      window.removeEventListener(
        CUSTOMER_EVENT_LIST_OPEN_EVENT,
        handleOpenRequest,
      );
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key !== "Escape") {
        return;
      }

      closeDrawer();
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open]);

  useEffect(() => {
    const shell =
      triggerRef.current?.closest(
        "[data-customer-marketplace-shell], [data-public-provider-marketplace-shell]",
      );

    if (!(shell instanceof HTMLElement)) {
      return undefined;
    }

    const content =
      shell.querySelector<HTMLElement>(
        "[data-customer-marketplace-content]",
      );

    if (!content) {
      return undefined;
    }

    /*
     * Keep a non-null reference for the event callback.
     * This also preserves TypeScript narrowing.
     */
    const contentElement =
      content;

    if (typeof window.matchMedia !== "function") {
      return undefined;
    }

    const desktopLayout =
      window.matchMedia(
        "(min-width: 1024px)",
      );

    function synchronizeLayout() {
      /*
       * On desktop, reserve the same width as the
       * Event List panel so it never covers the page.
       *
       * The global header is outside this wrapper,
       * therefore it always remains full-width.
       */
      contentElement.style.paddingRight =
        open && desktopLayout.matches
          ? "410px"
          : "";
    }

    synchronizeLayout();

    desktopLayout.addEventListener(
      "change",
      synchronizeLayout,
    );

    return () => {
      desktopLayout.removeEventListener(
        "change",
        synchronizeLayout,
      );

      contentElement.style.paddingRight =
        "";
    };
  }, [open]);

  return (
    <>
      {/* =====================================================
          EVENT LIST HEADER ICON
         ===================================================== */}

      <button
        ref={triggerRef}
        type="button"
        aria-label={
          selectionCount > 0
            ? `Open Event List, ${selectionCount} ${
                selectionCount === 1
                  ? "selected service"
                  : "selected services"
              }`
            : "Open Event List"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="customer-event-list-panel"
        title="Event List"
        onClick={() => {
          if (open) {
            closeDrawer({
              restoreFocus: false,
            });

            return;
          }

          openDrawer();
        }}
        className={[
          "relative inline-flex size-12",
          "shrink-0 items-center justify-center",
          "rounded-xl border border-transparent",
          "outline-none",
          "transition-colors",
          "hover:border-border hover:bg-card",
          hasEventListItems ? "text-primary-strong" : "text-foreground",
          "focus-visible:ring-2",
          "focus-visible:ring-ring",
        ].join(" ")}
      >
        <StickyNote
          aria-hidden="true"
          strokeWidth={2}
          className="size-5"
        />

        {selectionCount > 0 ? (
          <span
            aria-hidden="true"
            className={[
              "absolute -right-0.5 -top-0.5",
              "grid min-h-[18px]",
              "min-w-[18px]",
              "place-items-center",
              "rounded-full",
              "border-2 border-white",
              "bg-primary",
              "px-1",
              "text-[9px]",
              "font-semibold",
              "leading-none",
              "text-white",
            ].join(" ")}
          >
            {selectionCount > 99
              ? "99+"
              : selectionCount}
          </span>
        ) : null}
      </button>

      {/* =====================================================
          DRAWER CONTAINER
          Portaled to the document body so the header's
          backdrop-filter does not trap this fixed panel.
         ===================================================== */}

      {mounted
        ? createPortal(
      <div
        className={[
          "pointer-events-none",
          "fixed bottom-0 right-0",
          "top-[72px] z-30",
          "w-full max-w-[410px]",
        ].join(" ")}
        aria-hidden={!open}
      >
        <aside
          id="customer-event-list-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="customer-event-list-title"
          className={cn(
            [
              "absolute inset-y-0 right-0",
              "flex h-full w-full",
              "max-w-[410px] flex-col",
              "overflow-hidden",
              "border-l",
              "border-feasta-border-soft",
              "bg-white",
              "shadow-[-8px_0_26px_rgb(43_33_29/0.07)]",
              "transition-transform",
              "duration-300",
              "ease-[cubic-bezier(0.22,1,0.36,1)]",
              "will-change-transform",
              "motion-reduce:transition-none",
            ].join(" "),
            open
              ? [
                  "pointer-events-auto",
                  "translate-x-0",
                ].join(" ")
              : [
                  "pointer-events-none",
                  "translate-x-full",
                ].join(" "),
          )}
        >
          {/* =================================================
              HEADER
             ================================================= */}

          <div
            className={[
              "shrink-0",
              "border-b",
              "border-feasta-divider",
              "bg-white",
              "px-5 py-4",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={[
                    "grid size-12 shrink-0",
                    "place-items-center",
                    "rounded-[14px]",
                    "bg-[#FFF1EC]",
                    "text-primary-strong",
                  ].join(" ")}
                >
                  <StickyNote
                    aria-hidden="true"
                    strokeWidth={1.9}
                    className="size-5"
                  />
                </div>

                <div className="min-w-0">
                  <p
                    className={[
                      "text-[11px]",
                      "font-semibold",
                      "uppercase",
                      "tracking-[0.12em]",
                      "text-primary-strong",
                    ].join(" ")}
                  >
                    Your selections
                  </p>

                  <div className="mt-1 flex items-center gap-3">
                    <h2
                      id="customer-event-list-title"
                      className={[
                        "truncate",
                        "text-[23px]",
                        "font-bold",
                        "leading-none",
                        "tracking-[-0.025em]",
                        "text-foreground",
                      ].join(" ")}
                    >
                      Event List
                    </h2>


                  </div>
                </div>
              </div>

              <button
                ref={closeRef}
                type="button"
                onClick={() =>
                  closeDrawer()
                }
                aria-label="Close Event List"
                title="Close Event List"
                className={[
                  "grid size-9 shrink-0",
                  "place-items-center",
                  "rounded-full",
                  "text-feasta-text-secondary",
                  "outline-none",
                  "transition-[background-color,color,transform]",
                  "duration-200",
                  "hover:bg-feasta-canvas",
                  "hover:text-foreground",
                  "active:scale-95",
                  "focus-visible:ring-2",
                  "focus-visible:ring-ring",
                  "motion-reduce:transform-none",
                ].join(" ")}
              >
                <X
                  aria-hidden="true"
                  className="size-[18px]"
                  strokeWidth={1.8}
                />
              </button>
            </div>
          </div>

          {/* =================================================
              EMPTY STATE
             ================================================= */}

          {!hasEventListItems ? (
            <div
              className={[
                "flex min-h-0 flex-1",
                "items-center justify-center",
                "overflow-y-auto",
                "px-6 py-10",
              ].join(" ")}
            >
              <div className="mx-auto max-w-xs text-center">
                <div
                  className={[
                    "mx-auto grid size-14",
                    "place-items-center",
                    "rounded-[14px]",
                    "bg-[#FFF1EC]",
                    "text-primary-strong",
                  ].join(" ")}
                >
                  <PackageOpen
                    aria-hidden="true"
                    className="size-6"
                  />
                </div>

                <h3 className="mt-4 text-base font-semibold text-foreground">
                  Your Event List is empty
                </h3>

                <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                  Customize a package or add an
                  event service to begin planning
                  your event.
                </p>

                <Link
                  href="/customer/providers"
                  onClick={() =>
                    closeDrawer({
                      restoreFocus: false,
                    })
                  }
                  className={[
                    "mt-5 inline-flex",
                    "min-h-11",
                    "items-center",
                    "justify-center",
                    "gap-2",
                    "rounded-full",
                    "bg-primary",
                    "px-5",
                    "text-sm",
                    "font-semibold",
                    "!text-white",
                    "outline-none",
                    "transition-[background-color,transform]",
                    "hover:bg-primary-hover",
                    "focus-visible:ring-2",
                    "focus-visible:ring-primary",
                    "focus-visible:ring-offset-2",
                  ].join(" ")}
                  style={{
                    color: "#ffffff",
                  }}
                >
                  Browse services

                  <ArrowRight
                    aria-hidden="true"
                    className="size-4"
                  />
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* =============================================
                  SELECTED SERVICES
                 ============================================= */}

              <div
                className={[
                  "min-h-0 flex-1",
                  "overflow-y-auto",
                  "overscroll-contain",
                  "px-5 py-5",
                  "[scrollbar-width:thin]",
                ].join(" ")}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3
                      className={[
                        "text-[15px]",
                        "font-semibold",
                        "text-foreground",
                      ].join(" ")}
                    >
                      Your selections
                    </h3>

                    <p className="mt-0.5 text-xs text-feasta-text-secondary">
                      Items saved for your event
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={clearItems}
                    className={[
                      "inline-flex min-h-9",
                      "shrink-0",
                      "items-center gap-1.5",
                      "rounded-lg",
                      "px-2",
                      "text-sm",
                      "font-normal",
                      "text-feasta-text-secondary",
                      "outline-none",
                      "transition-colors",
                      "hover:bg-red-50",
                      "hover:text-red-700",
                      "focus-visible:ring-2",
                      "focus-visible:ring-primary",
                    ].join(" ")}
                  >
                    <Trash2
                      aria-hidden="true"
                      className="size-3.5"
                      strokeWidth={1.8}
                    />

                    Clear
                  </button>
                </div>

                <div className="grid gap-3">
                  {items.map((item) => item.type === "custom_menu" ? (
                    <article key={customerEventListItemKey(item)} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] gap-3 rounded-[16px] border border-feasta-border-soft bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt="" className="size-16 rounded-xl object-cover" />
                      <div className="min-w-0">
                        <Link href={item.providerHref} onClick={() => closeDrawer({restoreFocus: false})} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <h4 className="text-[15px] font-semibold">{item.menuItemName}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                     <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-strong">
                       Provider
                     </span>
                     <span className="font-medium text-feasta-text-secondary">
                       {item.providerName}
                     </span>
                   </div>
                        </Link>
                        <p className="mt-2 text-xs text-feasta-text-secondary">
                     {item.servingOptionName} &middot;{" "}
                     {menuServingGuestLabel(
                       item.servingMinimumGuests,
                       item.servingMaximumGuests,
                     )}
                   </p>
                        <p className="mt-2 text-[15px] font-semibold text-primary-strong">{formatPrice(item.price)}</p>
                      </div>
                      <button type="button" onClick={() => removeItem(customerEventListItemKey(item))} aria-label={`Remove ${item.menuItemName} from Event List`} className="grid size-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </article>
                  ) : (
                    <div
                      key={customerEventListItemKey(item)}
                      className="grid gap-3"
                    >
                      {/* =====================================
                          PACKAGE
                         ===================================== */}

                      <article
                        className={[
                          "grid min-w-0",
                          "grid-cols-[5.25rem_minmax(0,1fr)_auto]",
                          "gap-3",
                          "rounded-[18px]",
                          "border",
                          "border-feasta-border-soft",
                          "bg-white",
                          "p-3.5",
                          "shadow-[0_2px_10px_rgb(43_33_29/0.035)]",
                        ].join(" ")}
                      >
                        <Link
                          href={item.packageHref}
                          onClick={() =>
                            closeDrawer({
                              restoreFocus: false,
                            })
                          }
                          className={[
                            "relative grid",
                            "aspect-square",
                            "size-[84px]",
                            "shrink-0",
                            "place-items-center",
                            "overflow-hidden",
                            "rounded-[14px]",
                            "bg-[#FFF3EE]",
                            "outline-none",
                            "focus-visible:ring-2",
                            "focus-visible:ring-primary",
                          ].join(" ")}
                        >
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
                              className="size-6 text-primary-strong"
                            />
                          )}
                        </Link>

                        <div className="min-w-0 self-center">
                          <Link
                            href={
                              item.packageHref
                            }
                            onClick={() =>
                              closeDrawer({
                                restoreFocus:
                                  false,
                              })
                            }
                            className={[
                              "block rounded-md",
                              "outline-none",
                              "focus-visible:ring-2",
                              "focus-visible:ring-primary",
                            ].join(" ")}
                          >
                            <h4
                              className={[
                                "line-clamp-2",
                                "text-[15px]",
                                "font-semibold",
                                "leading-5",
                                "text-foreground",
                              ].join(" ")}
                            >
                              {
                                item.packageName
                              }
                            </h4>

                            <p
                              className={[
                                "mt-1 truncate",
                                "text-xs",
                                "font-normal",
                                "text-feasta-text-secondary",
                              ].join(" ")}
                            >
                              {
                                item.providerName
                              }
                            </p>
                          </Link>

                          <p
                            className={[
                              "mt-2.5",
                              "text-[15px]",
                              "font-semibold",
                              "text-primary-strong",
                            ].join(" ")}
                          >
                            {formatPrice(
                              item.price,
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeItem(
                              customerEventListItemKey(item),
                            )
                          }
                          aria-label={`Remove ${item.packageName} from Event List`}
                          title="Remove from Event List"
                          className={[
                            "grid size-8",
                            "shrink-0",
                            "place-items-center",
                            "rounded-full",
                            "text-feasta-text-tertiary",
                            "outline-none",
                            "transition-colors",
                            "hover:bg-red-50",
                            "hover:text-red-700",
                            "focus-visible:ring-2",
                            "focus-visible:ring-primary",
                          ].join(" ")}
                        >
                          <X
                            aria-hidden="true"
                            className="size-3.5"
                            strokeWidth={1.8}
                          />
                        </button>
                      </article>

                      {/* =====================================
                          EVENT SERVICES
                         ===================================== */}

                      {item.configuration
                        ?.selectedEventServices
                        .map((service) => (
                          <article
                            key={`${item.packageId}:${service.id}`}
                            className={[
                              "grid min-w-0",
                              "grid-cols-[5.25rem_minmax(0,1fr)_auto]",
                              "gap-3",
                              "rounded-[18px]",
                              "border",
                              "border-feasta-border-soft",
                              "bg-white",
                              "p-3.5",
                              "shadow-[0_2px_10px_rgb(43_33_29/0.035)]",
                            ].join(
                              " ",
                            )}
                          >
                            <div
                              className={[
                                "grid aspect-square",
                                "size-[84px]",
                                "shrink-0",
                                "place-items-center",
                                "rounded-[14px]",
                                "bg-[#FFF3EE]",
                                "text-primary-strong",
                              ].join(
                                " ",
                              )}
                            >
                              <StickyNote
                                aria-hidden="true"
                                strokeWidth={
                                  1.9
                                }
                                className="size-6"
                              />
                            </div>

                            <div className="min-w-0 self-center">
                              <h4
                                className={[
                                  "line-clamp-2",
                                  "text-[15px]",
                                  "font-semibold",
                                  "leading-5",
                                  "text-foreground",
                                ].join(
                                  " ",
                                )}
                              >
                                {
                                  service.name
                                }
                              </h4>

                              <p
                                className={[
                                  "mt-1 truncate",
                                  "text-xs",
                                  "font-normal",
                                  "text-feasta-text-secondary",
                                ].join(
                                  " ",
                                )}
                              >
                                {
                                  service.providerName
                                }
                              </p>

                              {service.category ? (
                                <p
                                  className={[
                                    "mt-1 truncate",
                                    "text-xs",
                                    "font-normal",
                                    "text-feasta-text-tertiary",
                                  ].join(
                                    " ",
                                  )}
                                >
                                  {humanize(
                                    service.category,
                                  )}
                                </p>
                              ) : null}

                              <p
                                className={[
                                  "mt-2.5",
                                  "text-[15px]",
                                  "font-semibold",
                                  "text-primary-strong",
                                ].join(
                                  " ",
                                )}
                              >
                                {formatPrice(
                                  service.price,
                                )}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                removeService(
                                  item.packageId,
                                  service.id,
                                )
                              }
                              aria-label={`Remove ${service.name} from Event List`}
                              title="Remove from Event List"
                              className={[
                                "grid size-8",
                                "shrink-0",
                                "place-items-center",
                                "rounded-full",
                                "text-feasta-text-tertiary",
                                "outline-none",
                                "transition-colors",
                                "hover:bg-red-50",
                                "hover:text-red-700",
                                "focus-visible:ring-2",
                                "focus-visible:ring-primary",
                              ].join(
                                " ",
                              )}
                            >
                              <X
                                aria-hidden="true"
                                className="size-3.5"
                                strokeWidth={1.8}
                              />
                            </button>
                          </article>
                        ))}
                    </div>
                  ))}
                </div>

                {/* ===========================================
                    ADD MORE SERVICES
                   =========================================== */}

                <Link
                  href="/customer/providers"
                  onClick={() =>
                    closeDrawer({
                      restoreFocus: false,
                    })
                  }
                  className={[
                    "mt-5 flex",
                    "min-h-[52px]",
                    "w-full",
                    "items-center",
                    "justify-center",
                    "gap-2",
                    "rounded-[16px]",
                    "border",
                    "border-dashed",
                    "border-primary/30",
                    "bg-[#FFF9F7]",
                    "px-5",
                    "text-sm",
                    "font-semibold",
                    "text-foreground",
                    "outline-none",
                    "transition-[border-color,background-color,color]",
                    "hover:border-primary/50",
                    "hover:bg-[#FFF3EE]",
                    "hover:text-primary-strong",
                    "focus-visible:ring-2",
                    "focus-visible:ring-primary",
                  ].join(" ")}
                >
                  <Plus
                    aria-hidden="true"
                    className="size-[18px]"
                    strokeWidth={1.8}
                  />

                  Browse More
                </Link>
              </div>

              {/* =============================================
                  FOOTER
                 ============================================= */}

              <div
                className={[
                  "shrink-0",
                  "border-t",
                  "border-feasta-divider",
                  "bg-white",
                  "px-5",
                  "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
                  "pt-6",
                ].join(" ")}
              >
                <div className="flex items-end justify-between gap-5">
                  <div className="min-w-0">
                    <p
                      className={[
                        "text-[11px]",
                        "font-semibold",
                        "uppercase",
                        "tracking-[0.09em]",
                        "text-feasta-text-tertiary",
                      ].join(" ")}
                    >
                      {pricedSelectionCount ===
                      selectionCount
                        ? "Estimated event total"
                        : "Known event total"}
                    </p>

                    {pricedSelectionCount !==
                    selectionCount ? (
                      <p className="mt-1 max-w-[12rem] text-[11px] leading-4 text-feasta-text-secondary">
                        Some selected services
                        do not have a published
                        price yet.
                      </p>
                    ) : null}
                  </div>

                  <p
                    className={[
                      "shrink-0",
                      "text-[24px]",
                      "font-bold",
                      "leading-none",
                      "tracking-[-0.025em]",
                      "text-foreground",
                    ].join(" ")}
                  >
                    {formatPrice(
                      knownTotal,
                    )}
                  </p>
                </div>

                {/* ===========================================
                    REVIEW LIST
                   =========================================== */}

                {reviewListHref ? (
                  <Link
                    href={
                      reviewListHref
                    }
                    onClick={() =>
                      closeDrawer({
                        restoreFocus:
                          false,
                      })
                    }
                    className={[
                      "mt-6 flex",
                      "min-h-[52px]",
                      "w-full",
                      "items-center",
                      "justify-center",
                      "gap-2.5",
                      "rounded-full",
                      "bg-primary",
                      "px-6",
                      "text-sm",
                      "font-semibold",
                      "!text-white",
                      "shadow-[0_8px_20px_rgb(176_47_0/0.14)]",
                      "outline-none",
                      "transition-[transform,background-color,box-shadow]",
                      "duration-200",
                      "hover:-translate-y-0.5",
                      "hover:bg-primary-hover",
                      "hover:shadow-[0_10px_24px_rgb(176_47_0/0.18)]",
                      "focus-visible:ring-2",
                      "focus-visible:ring-primary",
                      "focus-visible:ring-offset-2",
                      "motion-reduce:transform-none",
                      "[&_svg]:!text-white",
                      "[&_span]:!text-white",
                    ].join(" ")}
                    style={{
                      color: "#ffffff",
                    }}
                  >
                    <span
                      className="!text-white"
                      style={{
                        color:
                          "#ffffff",
                      }}
                    >
                      Review List
                    </span>

                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 !text-white"
                      strokeWidth={2}
                      style={{
                        color:
                          "#ffffff",
                      }}
                    />
                  </Link>
                ) : null}

                {/* ===========================================
                    SAVED NOTICE
                   =========================================== */}

                <div
                  className={[
                    "mt-4 flex",
                    "items-center",
                    "gap-2.5",
                    "rounded-xl",
                    "bg-[#FFF9F7]",
                    "px-3.5 py-3",
                  ].join(" ")}
                >
                  <StickyNote
                    aria-hidden="true"
                    className={[
                      "size-4",
                      "shrink-0",
                      "text-primary-strong",
                    ].join(" ")}
                    strokeWidth={1.8}
                  />

                  <p className="min-w-0 flex-1 text-xs leading-5 text-feasta-text-secondary">
                    Your Event List is saved
                    while you continue browsing.
                  </p>

                  <ArrowRight
                    aria-hidden="true"
                    className={[
                      "size-4",
                      "shrink-0",
                      "text-primary-strong",
                    ].join(" ")}
                    strokeWidth={1.8}
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      </div>,
            document.body,
          )
        : null}
    </>
  );
}

function subscribeToNothing() {
  return () => {};
}

function humanize(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatPrice(
  price: number | null,
): string {
  if (price === null) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
    },
  ).format(price);
}
