"use client";

import {useId, useState} from "react";
import {Input} from "@/components/ui/input";

export function isPackageIntegerEdit(value: string, maximum: number): boolean {
  // Bound the string before numeric conversion, including pasted input.
  return value === "" || (value.length <= String(maximum).length &&
    /^[1-9][0-9]*$/.test(value) && Number(value) <= maximum);
}

export function ProviderPackageIntegerInput({value, minimum = 1, maximum, disabled, label, onChange}: {
  value: string; minimum?: number; maximum: number; disabled?: boolean; label?: string;
  onChange: (value: string, error?: string) => void;
}) {
  const id = useId();
  const [rejected, setRejected] = useState(false);
  const invalid = value === "" || !isPackageIntegerEdit(value, maximum) || Number(value) < minimum;
  const message = rejected || invalid ? `Enter a whole number from ${minimum} to ${maximum}. Signs, decimals and exponents are not allowed.` : null;
  function commit(next: string) {
    if (!isPackageIntegerEdit(next, maximum)) {
      setRejected(true);
      onChange(value, `Enter a whole number from ${minimum} to ${maximum}.`);
      return;
    }
    setRejected(false);
    onChange(next);
  }
  return <>
    <Input aria-label={label} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
      required disabled={disabled} value={value} aria-invalid={Boolean(message)} aria-describedby={message ? id : undefined}
      onChange={(event) => commit(event.target.value)}
      onPaste={(event) => {
        event.preventDefault();
        const input = event.currentTarget;
        commit(value.slice(0, input.selectionStart ?? 0) + event.clipboardData.getData("text") +
          value.slice(input.selectionEnd ?? value.length));
      }} />
    {message ? <span id={id} role="alert" className="text-xs text-destructive">{message}</span> : null}
  </>;
}
