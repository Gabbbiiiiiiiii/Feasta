import {SearchX} from "lucide-react";
import Link from "next/link";

export default function PublicProviderNotFound() {
  return (
    <section
      className="mx-auto grid max-w-2xl justify-items-center gap-4 rounded-2xl border border-[#E2BFB5]/80 bg-white px-5 py-12 text-center shadow-[0_5px_18px_rgba(38,24,20,0.06)] sm:px-8"
      aria-labelledby="provider-not-found-title"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-[#FFF1ED] text-[#B02F00]"
      >
        <SearchX className="size-6" />
      </span>
      <div>
        <h1
          id="provider-not-found-title"
          className="text-2xl font-black text-[#261814] sm:text-3xl"
        >
          Provider profile not found
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-[#695C56] sm:text-base">
          This provider is unavailable or is no longer listed in the public
          marketplace.
        </p>
      </div>
      <Link
        href="/customer/providers"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#B02F00] px-5 text-sm font-bold text-white transition-colors hover:bg-[#8F2700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B02F00] focus-visible:ring-offset-3 focus-visible:ring-offset-white"
      >
        Browse public providers
      </Link>
    </section>
  );
}
