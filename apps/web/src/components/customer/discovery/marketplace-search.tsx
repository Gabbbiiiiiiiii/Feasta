import {
  ChevronDown,
  MapPin,
  Search,
} from "lucide-react";

import {Button} from "@/components/ui/button";
import {
  PROVIDER_SERVICE_TYPE_OPTIONS,
} from "@/lib/customer/providers/provider-catalog";

export function MarketplaceSearch() {
  return (
    <form
      action="/customer/providers"
      method="get"
      role="search"
      className="
        grid min-w-0 gap-2
        rounded-2xl
        border border-white/80
        bg-white
        p-2
        shadow-[0_10px_28px_rgba(38,24,20,0.12)]
        sm:grid-cols-[11rem_minmax(0,1fr)_auto]
      "
    >
      <label
        className="
          relative flex min-h-12 min-w-0
          items-center
          border-b border-[#E2BFB5]/70
          sm:border-b-0
          sm:border-r
        "
      >
        <span className="sr-only">
          Event service type
        </span>

        <MapPin
          aria-hidden="true"
          className="
            pointer-events-none
            absolute left-3
            size-4
            text-[#B02F00]
          "
        />

        <select
          name="service"
          defaultValue="all"
          aria-label="Event service type"
          className="
            h-12 w-full
            appearance-none
            border-0
            bg-transparent
            py-0 pl-9 pr-9
            text-sm font-semibold
            text-[#261814]
            outline-none
            focus:ring-0
          "
        >
          <option value="all">
            All event services
          </option>

          {PROVIDER_SERVICE_TYPE_OPTIONS.map(
            (option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ),
          )}
        </select>

        <ChevronDown
          aria-hidden="true"
          className="
            pointer-events-none
            absolute right-3
            size-4 text-[#695C56]
          "
        />
      </label>

      <label
        className="
          relative flex min-h-12 min-w-0
          items-center
        "
      >
        <span className="sr-only">
          Search the FEASTA
        </span>

        <Search
          aria-hidden="true"
          className="
            pointer-events-none
            absolute left-3
            size-5
            text-[#8E7068]
          "
        />

        <input
          type="search"
          name="q"
          minLength={2}
          maxLength={80}
          aria-label="Search the FEASTA"
          placeholder="Search caterers, venues, photographers, and services"
          className="
            h-12 w-full min-w-0
            border-0 bg-transparent
            py-0 pl-11 pr-3
            text-sm text-[#261814]
            outline-none
            placeholder:text-[#8E7068]
            focus:ring-0
          "
        />
      </label>

      <Button
        type="submit"
        className="
          h-12 w-full
          rounded-xl
          bg-[#B02F00]
          px-6
          font-bold text-white
          shadow-sm
          hover:bg-[#8F2600]
          sm:w-auto
        "
      >
        <Search
          aria-hidden="true"
          className="size-4"
        />

        Find event services
      </Button>
    </form>
  );
}