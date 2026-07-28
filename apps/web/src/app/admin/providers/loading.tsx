import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {LoadingSkeleton} from "@/components/feedback/loading";

export default function AdminProvidersLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-label="Loading provider verification queue">
      <div>
        <LoadingSkeleton className="h-4 w-40" />
        <LoadingSkeleton className="mt-3 h-10 w-full max-w-xl" />
        <LoadingSkeleton className="mt-3 h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({length: 3}, (_, index) => (
          <LoadingSkeleton key={index} className="h-32 rounded-card" />
        ))}
      </div>
      <LoadingSkeleton className="h-52 rounded-card" />
      <TableLoadingSkeleton caption="Provider verification queue" />
    </div>
  );
}
