import {MapPin} from "lucide-react";
import type {ReactNode} from "react";

import {PageHeading} from "@/components/layout/page-heading";

export function ProviderDirectoryShell({children}: {children: ReactNode}) {
  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-4rem)] bg-[#FFF9F4] px-4 py-6 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1280px] min-w-0 gap-5 sm:gap-6">
        <PageHeading
          eyebrow="FEASTA MARKETPLACE"
          title="Event services in Ormoc City"
          description="Discover approved local event professionals for celebrations across Ormoc City and nearby communities."
          className="border-[#E8C9BE]"
          actions={(
            <div
              className="flex w-full items-center gap-3 rounded-full border border-[#E8C9BE] bg-white px-4 py-2.5 shadow-[0_3px_12px_rgba(92,45,29,0.06)] sm:w-auto"
              aria-label="Service area: Ormoc City, Leyte"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF0E9] text-[#B23A16]">
                <MapPin aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[#8A6D63]">
                  Service area
                </span>
                <span className="mt-1 block truncate text-sm font-black text-[#2E1C17]">
                  Ormoc City, Leyte
                </span>
              </span>
            </div>
          )}
        />
        {children}
      </div>
    </div>
  );
}
