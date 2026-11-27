"use client";

import {Eye, EyeOff} from "lucide-react";
import {useState} from "react";

import {cn} from "@/lib/utils";

type SensitiveAmountProps = {
  label: string;
  value: string;
  defaultVisible?: boolean;
  className?: string;
};

function maskAmount(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("₱")) {
    return "₱••••••";
  }
  return "••••••";
}

function SensitiveAmount({
  label,
  value,
  defaultVisible = true,
  className,
}: SensitiveAmountProps) {
  const [visible, setVisible] = useState(defaultVisible);

  return (
    <span className={cn("inline-flex max-w-full items-center gap-2", className)}>
      <span className="min-w-0 truncate tabular-nums">
        {visible ? (
          value
        ) : (
          <>
            <span aria-hidden="true">{maskAmount(value)}</span>
            <span className="sr-only">Amount hidden</span>
          </>
        )}
      </span>

      <button
        type="button"
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={!visible}
        title={visible ? "Hide amount" : "Show amount"}
        onClick={() => setVisible((current) => !current)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-primary-tint hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {visible ? (
          <Eye aria-hidden="true" className="size-4" />
        ) : (
          <EyeOff aria-hidden="true" className="size-4" />
        )}
      </button>
    </span>
  );
}

export {SensitiveAmount, type SensitiveAmountProps};
