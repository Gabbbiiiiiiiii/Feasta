"use client";

import {ArrowLeft} from "lucide-react";
import Link from "next/link";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function PublicProviderDetailError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <section
      className="grid gap-5"
      aria-labelledby="provider-profile-error-title"
    >
      <Link
        href="/customer/providers"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg px-1 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-3 focus-visible:ring-offset-[#FFF8F6]"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to providers
      </Link>
      <h1 id="provider-profile-error-title" className="sr-only">
        Provider profile unavailable
      </h1>
      <ApplicationErrorState
        kind="load"
        description="This provider profile could not be loaded. Please try again."
        onRetry={reset}
        className="border-[#E8C9BE] bg-white shadow-[0_4px_18px_rgba(92,45,29,0.06)]"
      />
    </section>
  );
}
