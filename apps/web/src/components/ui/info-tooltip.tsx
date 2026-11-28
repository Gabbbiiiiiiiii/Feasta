"use client";

import {Info} from "lucide-react";
import {useId, useState} from "react";

import {cn} from "@/lib/utils";

type InfoTooltipProps = {
  label: string;
  text: string;
  className?: string;
};

function InfoTooltip({label, text, className}: InfoTooltipProps) {
  const tooltipId = useId();
  const [pinned, setPinned] = useState(false);

  return (
    <span
      className={cn("group/tooltip inline-flex shrink-0 items-center", className)}
      onMouseLeave={() => setPinned(false)}
    >
      <button
        type="button"
        aria-label={`More information about ${label}`}
        aria-describedby={tooltipId}
        aria-expanded={pinned}
        onClick={() => setPinned((open) => !open)}
        onBlur={() => setPinned(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinned(false);
          }
        }}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-primary-tint hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>

      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-3rem)] rounded-lg border border-border bg-popover px-3 py-2 text-xs font-normal leading-5 text-foreground shadow-floating transition-[opacity,transform] duration-fast ease-out motion-reduce:transition-none",
          pinned
            ? "translate-y-0 opacity-100"
            : "translate-y-1 opacity-0 group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:translate-y-0 group-focus-within/tooltip:opacity-100",
        )}
      >
        {text}
      </span>
    </span>
  );
}

export {InfoTooltip, type InfoTooltipProps};
