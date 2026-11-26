"use client";

import {useId, useState} from "react";
import {Input} from "@/components/ui/input";

export function isPackageIntegerEdit(value: string, maximum: number): boolean {
  // Bound the string before numeric conversion, including pasted input.
  return value === "" || (value.length <= String(maximum).length &&
    /^[1-9][0-9]*$/.test(value) && Number(value) <= maximum);
}

export function ProviderPackageIntegerInput({
  value,
  minimum = 1,
  maximum,
  disabled,
  label,
  invalid: externalInvalid = false,
  showInlineError = true,
  overflowMessage,
  zeroMessage,
  nonNumericMessage,
  onChange,
  onBlur,
}: {
  value: string;
  minimum?: number;
  maximum: number;
  disabled?: boolean;
  label?: string;
  invalid?: boolean;
  showInlineError?: boolean;
  overflowMessage?: string;
  zeroMessage?: string;
  nonNumericMessage?: string;
  onChange: (value: string, error?: string) => void;
  onBlur?: () => void;
}) {
  const id = useId();
  const [rejected, setRejected] = useState(false);
  const rangeText = minimum >= maximum
    ? `Enter ${maximum}.`
    : `Enter a number from ${minimum} to ${maximum}.`;
  const invalid = value === "" || !isPackageIntegerEdit(value, maximum) || Number(value) < minimum;
  const message = rejected || invalid ? rangeText : null;
  function commit(next: string) {
    if (!isPackageIntegerEdit(next, maximum)) {
      setRejected(true);
      const isZero = /^0+$/u.test(next);
      const isTooHigh = /^[1-9][0-9]*$/.test(next) &&
        (next.length > String(maximum).length || Number(next) > maximum);
      onChange(
        value,
        isZero && zeroMessage
          ? zeroMessage
          : isTooHigh
            ? (overflowMessage ?? `Cannot exceed ${maximum}.`)
            : (nonNumericMessage ?? "Numbers only (no decimals or symbols)."),
      );
      return;
    }
    setRejected(false);
    onChange(next);
  }
  return <>
    <Input aria-label={label} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
      required disabled={disabled} value={value}
      aria-invalid={Boolean(externalInvalid || (showInlineError && message))}
      aria-describedby={showInlineError && message ? id : undefined}
      onBlur={onBlur}
      onChange={(event) => commit(event.target.value)}
      onPaste={(event) => {
        event.preventDefault();
        const input = event.currentTarget;
        commit(value.slice(0, input.selectionStart ?? 0) + event.clipboardData.getData("text") +
          value.slice(input.selectionEnd ?? value.length));
      }} />
    {showInlineError && message ? <span id={id} role="alert" className="text-xs text-destructive">{message}</span> : null}
  </>;
}
