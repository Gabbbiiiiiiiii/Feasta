"use client";

import {Check, Copy} from "lucide-react";
import {useEffect, useRef, useState} from "react";

import {cn} from "@/lib/utils";

type CopyTextButtonProps = {
  value: string;
  ariaLabel: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
};

export function CopyTextButton({
  value,
  ariaLabel,
  label,
  copiedLabel = "Copied",
  className,
}: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      data-print-hidden=""
      aria-label={copied ? `${ariaLabel} — ${copiedLabel}` : ariaLabel}
      title={copied ? copiedLabel : ariaLabel}
      onClick={() => void handleCopy()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden",
        label ? "px-1.5 py-1" : "p-1",
        copied && "text-primary-strong",
        className,
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      {label ? <span>{copied ? copiedLabel : label}</span> : null}
    </button>
  );
}
