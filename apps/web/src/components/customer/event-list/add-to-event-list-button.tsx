"use client";

import {useState} from "react";
import {Check, Plus} from "lucide-react";

import {CUSTOMER_EVENT_LIST_CLOUD_ENABLED} from "@/lib/customer/event-list/customer-event-list-cloud-transport";
import {fromWebItem, toWebItem} from "@/lib/customer/event-list/customer-event-list-cloud-contract";
import {useCustomerEventListCloudAsync} from "@/lib/customer/event-list/use-customer-event-list-cloud-async";
import {
  customerEventListItemKey,
  useCustomerEventList,
  type CustomerPackageEventListItem,
} from "@/lib/customer/event-list/customer-event-list";

export function AddToEventListButton({
  item,
  className = "",
  label = "Add to List",
}: {
  item: CustomerPackageEventListItem;
  className?: string;
  label?: string;
}) {
  const {items, addItem, readSchedule} = useCustomerEventList();
  const cloud = useCustomerEventListCloudAsync();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canonicalIdentity = CUSTOMER_EVENT_LIST_CLOUD_ENABLED
    ? fromWebItem(item).identity
    : null;
  const cloudEntry = canonicalIdentity && cloud.state.document?.entries.find(
    (entry) => entry.identity === canonicalIdentity,
  );
  // Only server-confirmed, Web-compatible entries count as an added selection.
  const confirmedCloud = cloud.state.status === "ready" &&
    cloudEntry && toWebItem(cloudEntry).status === "supported";
  const added = CUSTOMER_EVENT_LIST_CLOUD_ENABLED
    ? Boolean(confirmedCloud)
    : items.some((candidate) =>
        customerEventListItemKey(candidate) === customerEventListItemKey(item));
  const pending = CUSTOMER_EVENT_LIST_CLOUD_ENABLED &&
    (saving || cloud.state.status === "pending" ||
      cloud.recovery?.status === "sending" ||
      cloud.recovery?.status === "awaiting_snapshot");
  const uncertain = CUSTOMER_EVENT_LIST_CLOUD_ENABLED &&
    cloud.recovery?.status === "uncertain";

  async function handleSave() {
    if (saving || added || pending) return;
    setSaveError(null);
    if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
      if (!addItem(item)) {
        setSaveError("Could not save this selection. Check browser storage and try again.");
      }
      return;
    }
    setSaving(true);
    try {
      if (uncertain) {
        await cloud.retryUncertainAsync();
      } else if (cloud.state.status === "missing") {
        // This click explicitly requests a save; initialize only when the
        // server has confirmed there is no existing cloud document.
        const others = items.filter((candidate) =>
          customerEventListItemKey(candidate) !== customerEventListItemKey(item));
        await cloud.initializeCloudListAsync([...others, item], readSchedule());
      } else {
        await cloud.saveItemAsync(item);
      }
      // The Firestore listener, not callable acceptance, sets the saved badge.
    } catch (error) {
      setSaveError(error instanceof Error ? error.message :
        "Could not verify the cloud Event List. No new save was confirmed.");
    } finally {
      setSaving(false);
    }
  }

  const displayLabel = added ? "Added to List" : pending ? "Saving to List…" :
    uncertain ? "Retry Save" : label;
  return (
    <>
      <button
        type="button"
        disabled={added || pending || (CUSTOMER_EVENT_LIST_CLOUD_ENABLED &&
          !uncertain && !["missing", "ready"].includes(cloud.state.status))}
        aria-pressed={added}
        aria-busy={Boolean(pending)}
        onClick={() => { void handleSave(); }}
        className={[
          "inline-flex min-h-12 w-full items-center justify-center gap-2",
          "rounded-full border px-5 text-sm font-bold outline-none",
          "transition-[transform,border-color,background-color,color,box-shadow]",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          added
            ? "cursor-default border-success/20 bg-success/5 text-success"
            : "border-primary/25 bg-white text-primary-strong hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary hover:shadow-sm",
          "motion-reduce:transform-none",
          className,
        ].join(" ")}
      >
        {added ? <Check aria-hidden="true" className="size-4" /> :
          <Plus aria-hidden="true" className="size-4" />}
        {displayLabel}
      </button>
      {saveError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {saveError}
        </p>
      )}
    </>
  );
}
