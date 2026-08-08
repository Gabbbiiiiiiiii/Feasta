import {ChevronLeft, ChevronRight} from "lucide-react";
import Link from "next/link";

import {Button} from "@/components/ui/button";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "@/lib/customer/providers/provider-types";

export function ProviderPagination({
  page,
  filters,
}: {
  page: ProviderDiscoveryPage;
  filters: ProviderDiscoveryFilters;
}) {
  if (!page.previousCursor && !page.nextCursor) return null;
  return (
    <nav aria-label="Provider results pagination" className="flex flex-col-reverse gap-3 rounded-xl border border-[#E8C9BE] bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-center text-xs text-[#78645D] sm:text-left" aria-live="polite">
        Showing up to {page.pageSize} providers per page
      </p>
      <div className="grid grid-cols-2 gap-2">
        {page.previousCursor ? (
          <Button asChild variant="secondary" size="compact" className="border-[#DDBCB1]">
            <Link href={providerDiscoveryHref(filters, page.previousCursor)}>
              <ChevronLeft aria-hidden="true" />Previous
            </Link>
          </Button>
        ) : <span />}
        {page.nextCursor ? (
          <Button asChild variant="secondary" size="compact" className="border-[#DDBCB1]">
            <Link href={providerDiscoveryHref(filters, page.nextCursor)}>
              Next<ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
