"use client";

import {AddToEventListButton} from "@/components/customer/event-list/add-to-event-list-button";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import type {CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";

export function PackageEventListAction({
  packageRecord,
  layout = "stacked",
}: {
  packageRecord: Pick<
    PublicPackage,
    "id" | "providerId" | "providerName" | "name" | "price" | "imageUrl"
  >;
  layout?: "stacked" | "banner";
}) {
  const item: CustomerPackageEventListItem = {
    type: "package",
    packageId: packageRecord.id,
    providerId: packageRecord.providerId,
    packageName: packageRecord.name,
    providerName: packageRecord.providerName,
    price: packageRecord.price,
    imageUrl: packageRecord.imageUrl,
    packageHref: `/customer/packages/${encodeURIComponent(packageRecord.id)}`,
  };

  return (
    <div className={layout === "banner" ? "rounded-[20px] border border-feasta-border-soft bg-white p-4 sm:p-5" : "mt-3"}>
      {layout === "banner" ? (
        <p className="text-sm leading-6 text-feasta-text-secondary">
          Save this package to your Event List while you compare options.
          The list is planning context in this browser and does not submit a booking.
        </p>
      ) : (
        <p className="mb-3 text-xs leading-5 text-feasta-text-secondary">
          Add this package to your planning list. Displayed prices are not a booking quote.
        </p>
      )}
      <AddToEventListButton
        item={item}
        className={layout === "banner" ? "mt-4" : undefined}
      />
    </div>
  );
}
