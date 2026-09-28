"use client";

import {ArrowRight, Plus, StickyNote, Trash2, X} from "lucide-react";
import Link from "next/link";
import {useEffect, useMemo, useRef, useState} from "react";

import {PriceDisplay} from "@/components/shared/price-display";
import {
  CUSTOMER_EVENT_LIST_OPEN_EVENT,
  customerEventListItemKey,
  useCustomerEventList,
  type CustomerEventListItem,
} from "@/lib/customer/event-list/customer-event-list";
import {menuServingGuestLabel} from "@/lib/provider/provider-menu";
import {cn} from "@/lib/utils";

export function CustomerEventListMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const {items, removeItem, removeService, clearItems} = useCustomerEventList();
  const reviewHref = items.length > 0 ? "/customer/event-list/review" : null;
  const {selectionCount, knownTotal, pricedSelectionCount} = useMemo(
    () => summarizeEventList(items),
    [items],
  );

  function closeDrawer(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 320);
    }
  }

  useEffect(() => {
    const openDrawer = () => setOpen(true);
    window.addEventListener(CUSTOMER_EVENT_LIST_OPEN_EVENT, openDrawer);
    return () => window.removeEventListener(CUSTOMER_EVENT_LIST_OPEN_EVENT, openDrawer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDrawer();
    };
    window.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    const shell = triggerRef.current?.closest<HTMLElement>(
      "[data-customer-marketplace-shell], [data-public-provider-marketplace-shell]",
    );
    const content = shell?.querySelector<HTMLElement>("[data-customer-marketplace-content]");
    if (!content || typeof window.matchMedia !== "function") return undefined;
    const desktopLayout = window.matchMedia("(min-width: 1024px)");
    const synchronizeLayout = () => {
      content.style.paddingRight = open && desktopLayout.matches ? "410px" : "";
    };
    synchronizeLayout();
    desktopLayout.addEventListener("change", synchronizeLayout);
    return () => {
      desktopLayout.removeEventListener("change", synchronizeLayout);
      content.style.paddingRight = "";
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={
          selectionCount > 0
            ? `Open Event List, ${selectionCount} ${selectionCount === 1 ? "planned item" : "planned items"}`
            : "Open Event List"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="customer-event-list-panel"
        title="Event List"
        onClick={() => {
          if (open) closeDrawer(false);
          else setOpen(true);
        }}
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-full outline-none transition-colors duration-200",
          "hover:bg-feasta-surface-soft hover:text-primary-strong focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          items.length > 0 ? "text-primary-strong" : "text-feasta-text-tertiary",
        )}
      >
        <StickyNote aria-hidden="true" className="size-[19px]" strokeWidth={items.length > 0 ? 2.3 : 1.7} />
        {selectionCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-primary px-1 text-[9px] font-semibold leading-none text-white"
          >
            {selectionCount > 99 ? "99+" : selectionCount}
          </span>
        ) : null}
      </button>

      <div
        className="pointer-events-none fixed bottom-0 right-0 top-[var(--feasta-marketplace-header-height,7.25rem)] z-30 w-full max-w-[410px]"
        aria-hidden={!open}
      >
        <aside
          id="customer-event-list-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="customer-event-list-title"
          className={cn(
            "absolute inset-y-0 right-0 flex h-full w-full max-w-[410px] flex-col overflow-hidden border-l border-feasta-border-soft bg-white shadow-[-8px_0_26px_rgb(43_33_29/0.07)] transition-transform duration-300 motion-reduce:transition-none",
            open ? "pointer-events-auto translate-x-0" : "pointer-events-none translate-x-full",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-feasta-divider px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-strong">
                Planning list
              </p>
              <h2 id="customer-event-list-title" className="mt-1 text-[23px] font-bold leading-none tracking-[-0.025em]">
                Event List
              </h2>
              <p className="mt-2 text-xs leading-5 text-feasta-text-secondary">
                Saved in this browser for planning. This is not a confirmed booking or payment.
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close Event List"
              onClick={() => closeDrawer()}
              className="grid size-10 shrink-0 place-items-center rounded-full text-feasta-text-secondary outline-none hover:bg-feasta-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="grid flex-1 content-center gap-3 px-5 py-8 text-center">
              <p className="text-base font-bold">Your Event List is empty.</p>
              <p className="text-sm leading-6 text-feasta-text-secondary">
                Add packages while you browse. You can review them later without submitting a request.
              </p>
              <Link
                href="/customer/packages"
                onClick={() => closeDrawer(false)}
                className="mx-auto inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Browse packages
              </Link>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={clearItems}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-feasta-text-secondary outline-none hover:bg-feasta-surface-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Clear list
                  </button>
                </div>
                <ul className="grid gap-3">
                  {items.map((item) => (
                    <EventListMenuItem
                      key={customerEventListItemKey(item)}
                      item={item}
                      onRemove={() => removeItem(customerEventListItemKey(item))}
                      onRemoveService={removeService}
                      onNavigate={() => closeDrawer(false)}
                    />
                  ))}
                </ul>
                <Link
                  href="/customer/providers"
                  onClick={() => closeDrawer(false)}
                  className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-primary/30 bg-[#FFF9F7] px-5 text-sm font-semibold outline-none hover:border-primary/50 hover:text-primary-strong focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Plus aria-hidden="true" className="size-[18px]" />
                  Browse more
                </Link>
              </div>
              <div className="shrink-0 border-t border-feasta-divider px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-feasta-text-tertiary">
                  {pricedSelectionCount === selectionCount
                    ? "Displayed planning total"
                    : "Displayed prices on file"}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-feasta-text-secondary">
                  These amounts are saved display snapshots, not a booking quote.
                </p>
                <PriceDisplay amount={knownTotal} className="mt-2" />
                {reviewHref ? (
                  <Link
                    href={reviewHref}
                    onClick={() => closeDrawer(false)}
                    className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    Review List
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function EventListMenuItem({
  item,
  onRemove,
  onRemoveService,
  onNavigate,
}: {
  item: CustomerEventListItem;
  onRemove: () => void;
  onRemoveService: (packageId: string, serviceId: string) => void;
  onNavigate: () => void;
}) {
  const title = item.type === "custom_menu" ? item.menuItemName : item.packageName;
  const href = item.type === "custom_menu" ? item.providerHref : item.packageHref;
  const label = item.type === "custom_menu"
    ? `Remove ${item.menuItemName} from Event List`
    : `Remove ${item.packageName} from Event List`;

  return (
    <li className="rounded-[16px] border border-feasta-border-soft bg-feasta-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={href}
            onClick={onNavigate}
            className="break-words text-sm font-bold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {title}
          </Link>
          <p className="mt-1 break-words text-xs text-feasta-text-secondary">{item.providerName}</p>
          {item.type === "custom_menu" ? (
            <p className="mt-1 text-xs text-feasta-text-secondary">
              {item.servingOptionName} · {menuServingGuestLabel(item.servingMinimumGuests, item.servingMaximumGuests)}
            </p>
          ) : null}
          <PriceDisplay amount={item.price} className="mt-2" />
        </div>
        <button
          type="button"
          aria-label={label}
          onClick={onRemove}
          className="grid size-8 shrink-0 place-items-center rounded-full text-feasta-text-tertiary outline-none hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      {item.type !== "custom_menu" && item.configuration?.selectedEventServices.length ? (
        <ul className="mt-3 grid gap-2">
          {item.configuration.selectedEventServices.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
              <span className="min-w-0 break-words text-xs font-semibold">{service.name}</span>
              <button
                type="button"
                aria-label={`Remove ${service.name} from Event List`}
                onClick={() => onRemoveService(item.packageId, service.id)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-feasta-text-tertiary outline-none hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function summarizeEventList(items: readonly CustomerEventListItem[]) {
  let selectionCount = 0;
  let knownTotal = 0;
  let pricedSelectionCount = 0;

  for (const item of items) {
    selectionCount += 1;
    if (item.price !== null) {
      knownTotal += item.price;
      pricedSelectionCount += 1;
    }
    if (item.type === "custom_menu") continue;
    for (const service of item.configuration?.selectedEventServices ?? []) {
      selectionCount += 1;
      if (service.price !== null) {
        knownTotal += service.price;
        pricedSelectionCount += 1;
      }
    }
  }

  return {selectionCount, knownTotal, pricedSelectionCount};
}
