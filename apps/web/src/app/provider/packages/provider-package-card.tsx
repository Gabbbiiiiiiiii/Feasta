import {
  Archive,
  Edit3,
  Send,
  Users,
} from "lucide-react";

import {
  ImagePlaceholder,
} from "@/components/shared/image-placeholder";
import {
  PriceDisplay,
} from "@/components/shared/price-display";
import {
  StatusBadge,
  humanize,
} from "@/components/shared/status-badge";
import {
  Button,
} from "@/components/ui/button";
import type {
  ProviderPackage,
} from "@/lib/provider/provider-package-client";

type ProviderPackageCardProps = {
  item: ProviderPackage;
  onEdit: React.MouseEventHandler<HTMLButtonElement>;
  onPublish: () => void;
  onArchive: () => void;
};

export function ProviderPackageCard({
  item,
  onEdit,
  onPublish,
  onArchive,
}: ProviderPackageCardProps) {
  const cover =
    item.imageUrls?.[0] ||
    item.imageUrl;

  return (
    <article
      aria-label={item.name}
      className="min-w-0 self-start overflow-hidden rounded-card border border-border bg-card shadow-card"
    >
      <div className="relative h-48 overflow-hidden bg-muted">
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt={item.name}
              loading="lazy"
              className="absolute inset-0 size-full object-contain"
            />
          </>
        ) : (
          <ImagePlaceholder
            className="h-full min-h-0 rounded-none"
            label="No package image"
          />
        )}

        <div className="absolute right-2 top-2">
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="grid content-start gap-2 p-3">
        <h2
          className="line-clamp-2 break-words text-base font-bold"
          title={item.name}
        >
          {item.name}
        </h2>

        <p className="text-xs font-semibold uppercase text-primary-strong">
          {humanize(item.eventType)}
        </p>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users
            aria-hidden="true"
            className="size-4 shrink-0"
          />
          {item.minimumGuests}{"\u2013"}{item.maximumGuests} guests
        </p>

        <PriceDisplay amount={item.price} />

        <p className="text-xs text-muted-foreground">
          Full payment required
        </p>
      </div>

      {item.status !== "archived" ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-border p-2">
          <Button
            id={`provider-package-edit-${item.id}`}
            type="button"
            variant="secondary"
            size="compact"
            className="mr-auto"
            aria-label={`Edit ${item.name}`}
            onClick={onEdit}
          >
            <Edit3
              aria-hidden="true"
              className="size-4"
            />
            Edit
          </Button>

          {item.status === "draft" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Publish ${item.name}`}
              title="Publish package"
              onClick={onPublish}
            >
              <Send
                aria-hidden="true"
                className="size-4"
              />
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Archive ${item.name}`}
            title="Archive package"
            onClick={onArchive}
          >
            <Archive
              aria-hidden="true"
              className="size-4"
            />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
