"use client";

import {CalendarDays, MessageSquareQuote, PackageOpen, Star} from "lucide-react";

import {DetailDrawer} from "@/components/data";
import {SectionLoading} from "@/components/feedback/application-states";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import type {ProviderReviewDetail} from "@/lib/provider/reviews/provider-review-types";

type ProviderReviewDetailDrawerProps = {
  review: ProviderReviewDetail | null;
  open: boolean;
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
};

export function ProviderReviewDetailDrawer({
  review,
  open,
  loading,
  error,
  onOpenChange,
  onRetry,
}: ProviderReviewDetailDrawerProps) {
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Review details"
      description="Review the customer feedback and event context shared with your business."
    >
      {loading ? (
        <SectionLoading label="Loading review details" />
      ) : error ? (
        <div
          className="grid gap-4 rounded-card border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <div>
            <p className="font-semibold">Review details are unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="secondary" size="compact" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : review ? (
        <div className="grid gap-6">
          <DrawerSection title="Review">
            <DetailRow label="Review ID" value={review.id} />
            <DetailRow label="Customer" value={review.customerDisplayName} />
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rating
              </p>
              <div
                className="mt-2 inline-flex items-center gap-2"
                aria-label={`${review.rating} out of 5 stars`}
              >
                <span className="inline-flex gap-0.5 text-warning" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="size-4"
                      fill={star <= review.rating ? "currentColor" : "none"}
                    />
                  ))}
                </span>
                <span className="text-sm font-semibold" aria-hidden="true">
                  {review.rating}/5
                </span>
              </div>
            </div>
            <DetailRow label="Customer review" value={review.comment} preserveWhitespace />
          </DrawerSection>

          <DrawerSection title="Event">
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Event type"
              value={formatLabel(review.context.eventType)}
            />
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Event date"
              value={formatDate(review.context.eventDate)}
            />
          </DrawerSection>

          <DrawerSection title="Service">
            <DetailRow
              icon={<PackageOpen className="size-4" />}
              label="Service / package"
              value={review.context.serviceSummary}
            />
          </DrawerSection>

          <DrawerSection title="Visibility">
            <div className="rounded-lg border border-border p-3">
              <Badge tone={review.visibility === "visible" ? "success" : "neutral"}>
                {review.visibility === "visible" ? "Visible" : "Hidden"}
              </Badge>
              <p className="mt-2 text-sm text-muted-foreground">
                {review.visibility === "visible"
                  ? "Visible to customers on your public provider profile."
                  : "Hidden from public view."}
              </p>
            </div>
          </DrawerSection>

          <DrawerSection title="Activity">
            <DetailRow label="Created" value={formatDateTime(review.createdAt)} />
            <DetailRow
              label="Updated"
              value={review.updatedAt ? formatDateTime(review.updatedAt) : "Not updated"}
            />
          </DrawerSection>

          {review.providerReply ? (
            <DrawerSection title="Your reply">
              <div className="rounded-lg border border-primary/20 bg-primary-tint/30 p-4">
                <MessageSquareQuote
                  aria-hidden="true"
                  className="size-5 text-primary-strong"
                />
                <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                  {review.providerReply}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Replied {review.providerReplyAt
                    ? formatDateTime(review.providerReplyAt)
                    : "at an unavailable time"}
                </p>
              </div>
            </DrawerSection>
          ) : null}
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function DrawerSection({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
  preserveWhitespace = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  preserveWhitespace?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 break-words text-sm font-medium ${
          preserveWhitespace ? "whitespace-pre-wrap" : ""
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  return formatDateValue(value, {dateStyle: "long"});
}

function formatDateTime(value: string): string {
  return formatDateValue(value, {dateStyle: "medium", timeStyle: "short"});
}

function formatDateValue(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "Asia/Manila",
  }).format(date);
}
