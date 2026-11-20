"use client";

import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import {cn} from "@/lib/utils";

const OTP_LENGTH = 6;

export function SixDigitOtpInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
  errorId,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from(
    {length: OTP_LENGTH},
    (_, index) => value[index] ?? "",
  );

  function focusCell(index: number) {
    inputRefs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus();
  }

  function commit(nextDigits: string[]) {
    onChange(nextDigits.join("").slice(0, OTP_LENGTH));
  }

  function distribute(index: number, rawValue: string) {
    const incoming = rawValue.replace(/\D/gu, "");
    if (!incoming) return;
    const start = incoming.length >= OTP_LENGTH ? 0 : index;
    const next = [...digits];
    incoming.slice(0, OTP_LENGTH - start).split("").forEach(
      (digit, offset) => {
        next[start + offset] = digit;
      },
    );
    commit(next);
    focusCell(Math.min(start + incoming.length, OTP_LENGTH - 1));
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const incoming = event.target.value.replace(/\D/gu, "");
    if (!incoming) return;
    if (incoming.length > 1) {
      distribute(index, incoming);
      return;
    }
    const next = [...digits];
    next[index] = incoming;
    commit(next);
    if (index < OTP_LENGTH - 1) focusCell(index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
        commit(next);
        return;
      }
      if (index > 0) {
        next[index - 1] = "";
        commit(next);
        focusCell(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/gu, "");
    if (!pasted) return;
    event.preventDefault();
    distribute(index, pasted);
  }

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={invalid ? errorId : undefined}
      aria-invalid={invalid || undefined}
      className="min-w-0"
    >
      <legend className="mb-2 text-sm font-bold text-foreground">
        Verification code
        <span aria-hidden="true" className="ml-1 text-destructive">*</span>
        <span className="sr-only"> required</span>
      </legend>
      <div
        data-testid="provider-registration-otp-cells"
        className="mx-auto grid w-full max-w-[376px] grid-cols-6 gap-1.5 sm:gap-2"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            enterKeyHint={index === OTP_LENGTH - 1 ? "done" : "next"}
            value={digit}
            aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(
              "aspect-square min-h-0 w-full min-w-0 max-w-14 rounded-[10px] border bg-card p-0 text-center text-xl font-black text-card-foreground shadow-none transition-[border-color,box-shadow,background-color] caret-primary outline-none",
              "border-input hover:border-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted-foreground disabled:opacity-100",
              invalid && "border-destructive bg-destructive-subtle/30 ring-1 ring-destructive/30 focus-visible:border-destructive focus-visible:ring-destructive/35",
            )}
          />
        ))}
      </div>
      {invalid ? (
        <p className="mt-2 text-xs font-semibold text-destructive">
          Check the verification error below.
        </p>
      ) : null}
    </fieldset>
  );
}
