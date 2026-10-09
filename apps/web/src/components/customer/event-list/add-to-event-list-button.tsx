"use client";

import {Check, Plus} from "lucide-react";

import {
  customerEventListItemKey,
  useCustomerEventList,
  type CustomerPackageEventListItem,
} from "@/lib/customer/event-list/customer-event-list";

export function AddToEventListButton({
  item,
  className = "",
}: {
  item: CustomerPackageEventListItem;
  className?: string;
}) {
  const {items, addItem} = useCustomerEventList();
  const added = items.some(
    (candidate) => customerEventListItemKey(candidate) === customerEventListItemKey(item),
  );

  return (
    <button
      type="button"
      disabled={added}
      aria-pressed={added}
      onClick={() => addItem(item)}
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
      {added ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Plus aria-hidden="true" className="size-4" />
      )}
      {added ? "Added to List" : "Add to List"}
    </button>
  );
}
