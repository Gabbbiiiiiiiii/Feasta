import {LoadingSkeleton, LoadingSpinner} from "@/components/feedback/loading";
import {EmptyState, ErrorState} from "@/components/feedback/states";
import {cn} from "@/lib/utils";

type ApplicationErrorKind =
  | "load"
  | "permission-denied"
  | "connectivity"
  | "server"
  | "invalid-submission"
  | "session-expired";

type ApplicationEmptyKind =
  | "search"
  | "bookings"
  | "providers"
  | "verification-submissions"
  | "payments"
  | "notifications"
  | "complaints"
  | "reports"
  | "packages";

const errorCopy: Record<ApplicationErrorKind, {title: string; description: string; actionLabel?: string}> = {
  load: {title: "We could not load this content", description: "Please try again. Your existing information has not been changed."},
  "permission-denied": {title: "You do not have access", description: "Use an account with permission to view this content."},
  connectivity: {title: "You appear to be offline", description: "Check your connection, then try again."},
  server: {title: "FEASTA is temporarily unavailable", description: "Please wait a moment and try again."},
  "invalid-submission": {title: "Some details need your attention", description: "Review the highlighted fields and submit again."},
  "session-expired": {title: "Your session has expired", description: "Sign in again to continue securely.", actionLabel: "Sign in"},
};

const emptyCopy: Record<ApplicationEmptyKind, {title: string; description: string}> = {
  search: {title: "No matching results", description: "Try changing your search or clearing a filter."},
  bookings: {title: "No bookings yet", description: "Your current and completed bookings will appear here."},
  providers: {title: "No providers found", description: "Try changing your search or verification filters."},
  "verification-submissions": {title: "No verification submissions", description: "New provider submissions will appear here."},
  payments: {title: "No payments yet", description: "Payment activity will appear here when available."},
  notifications: {title: "No notifications", description: "You are all caught up."},
  complaints: {title: "No complaints", description: "Complaint records will appear here when submitted."},
  reports: {title: "No report data", description: "There is no data for the selected reporting range."},
  packages: {title: "No packages yet", description: "Create a package to make it available to customers."},
};

function ApplicationErrorState({kind, description, onRetry, className}: {
  kind: ApplicationErrorKind;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const copy = errorCopy[kind];
  return <ErrorState title={copy.title} description={description ?? copy.description} actionLabel={copy.actionLabel} onAction={onRetry} className={className} />;
}

function ApplicationEmptyState({kind, className}: {kind: ApplicationEmptyKind; className?: string}) {
  const copy = emptyCopy[kind];
  return <EmptyState title={copy.title} description={copy.description} className={className} />;
}

function FullPageLoading({label = "Loading page"}: {label?: string}) {
  return <div className="grid min-h-[50vh] place-items-center" aria-busy="true"><LoadingSpinner label={label} /></div>;
}

function SectionLoading({label = "Loading section", className}: {label?: string; className?: string}) {
  return <div className={cn("grid min-h-40 place-items-center rounded-card border border-border bg-card", className)} aria-busy="true"><LoadingSpinner label={label} /></div>;
}

function ListLoadingSkeleton({count = 4, className}: {count?: number; className?: string}) {
  return (
    <div className={cn("grid gap-3", className)} aria-busy="true" aria-label="Loading list">
      {Array.from({length: count}, (_, index) => (
        <div key={index} className="grid grid-cols-[4rem_1fr] gap-4 rounded-card border border-border bg-card p-4">
          <LoadingSkeleton className="size-16" label={index === 0 ? "Loading list item image" : "Loading image"} />
          <div className="grid content-center gap-2">
            <LoadingSkeleton className="h-5 w-2/3" label="Loading item title" />
            <LoadingSkeleton className="h-4 w-full" label="Loading item details" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableLoadingSkeleton({caption, rows = 5, className}: {caption: string; rows?: number; className?: string}) {
  return (
    <div className={cn("grid gap-3 rounded-card border border-border bg-card p-4", className)} aria-busy="true" aria-label={`Loading ${caption}`}>
      <LoadingSkeleton className="h-10 w-full" label="Loading table headings" />
      {Array.from({length: rows}, (_, index) => <LoadingSkeleton key={index} className="h-14 w-full" label="Loading table row" />)}
    </div>
  );
}

export {ApplicationEmptyState, ApplicationErrorState, FullPageLoading, ListLoadingSkeleton, SectionLoading, TableLoadingSkeleton, emptyCopy, errorCopy, type ApplicationEmptyKind, type ApplicationErrorKind};
