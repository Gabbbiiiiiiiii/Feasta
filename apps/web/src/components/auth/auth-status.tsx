"use client";

import {useEffect, useRef} from "react";

import {cn} from "@/lib/utils";

type AuthStatusTone = "error" | "info" | "success" | "warning";

const toneClasses: Record<AuthStatusTone, string> = {
  error: "border-destructive/30 bg-destructive-subtle text-destructive",
  info: "border-info/30 bg-info-subtle text-info",
  success: "border-success/30 bg-success-subtle text-success",
  warning: "border-warning/40 bg-warning-subtle text-warning",
};

export function AuthStatus({
  id,
  message,
  tone = "info",
  focusOnChange,
  className,
}: {
  id?: string;
  message: string;
  tone?: AuthStatusTone;
  focusOnChange?: boolean;
  className?: string;
}) {
  const statusRef = useRef<HTMLDivElement>(null);
  const shouldFocus = focusOnChange ?? tone === "error";

  useEffect(() => {
    if (shouldFocus && message) {
      statusRef.current?.focus();
    }
  }, [message, shouldFocus]);

  return (
    <div
      ref={statusRef}
      id={id}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      tabIndex={shouldFocus ? -1 : undefined}
      className={cn(
        "rounded-lg border p-3 text-sm font-semibold leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        toneClasses[tone],
        className,
      )}
    >
      {message}
    </div>
  );
}
