import {LoaderCircle} from "lucide-react";

import {cn} from "@/lib/utils";

function LoadingSpinner({label = "Loading", className}: {label?: string; className?: string}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="status" aria-label={label}>
      <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary-strong motion-reduce:animate-none" />
      <span aria-hidden="true" className="sr-only">{label}</span>
    </span>
  );
}

function LoadingSkeleton({
  className,
  label = "Loading content",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-skeleton motion-reduce:animate-none", className)}
      role="status"
      aria-label={label}
    />
  );
}

export {LoadingSkeleton, LoadingSpinner};
