"use client";

import {useId, useRef, useState} from "react";
import {Input} from "@/components/ui/input";
import {isPackageMoneyEdit, packageMoneyCentavos} from "@/lib/provider/package-pricing-preview";

const INVALID_MONEY = "Use digits and one decimal point, with at most two decimal places. Exponents and signs are not allowed.";

export function ProviderPackageMoneyInput({value, error, disabled, onChange, readOnly = false, description}: {
  value: string; error?: string; disabled?: boolean; readOnly?: boolean; description?: string;
  onChange: (value: string, error?: string) => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const cents = packageMoneyCentavos(value);
  const display = !focused && cents !== null
    ? (cents / 100).toLocaleString("en-PH", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : value;
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const selection = useRef({start: 0, end: 0});
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const validation = error || (value !== "" && packageMoneyCentavos(value) === null
    ? "Enter a price from PHP 0.00 to PHP 10,000,000.00 with at most two decimal places." : undefined);

  function rememberSelection(element: HTMLInputElement) {
    selection.current = {start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0};
  }

  function commit(next: string) {
    if (isPackageMoneyEdit(next)) {
      onChange(next);
    } else {
      onChange(value, INVALID_MONEY);
      const previous = {...selection.current};
      requestAnimationFrame(() => input.current?.setSelectionRange(
        Math.min(previous.start, value.length), Math.min(previous.end, value.length),
      ));
    }
  }

  return <>
    <span className="relative block">
    <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">₱</span>
    <Input className="pl-7" ref={input} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      value={compositionText ?? display} onFocus={() => setFocused(true)} disabled={disabled} readOnly={readOnly} aria-invalid={Boolean(validation)}
      aria-describedby={id} onBeforeInput={(event) => rememberSelection(event.currentTarget)}
      onPaste={(event) => rememberSelection(event.currentTarget)}
      onSelect={(event) => { if (!composing.current) rememberSelection(event.currentTarget); }}
      onCompositionStart={(event) => {
        composing.current = true;
        setCompositionText(event.currentTarget.value);
        onChange(value, "Finish entering the price to preview or save.");
      }} onCompositionEnd={(event) => {
        composing.current = false;
        setCompositionText(null);
        commit(event.currentTarget.value);
      }} onChange={(event) => {
        if (composing.current) setCompositionText(event.currentTarget.value);
        else commit(event.currentTarget.value);
      }} onBlur={() => {
        setFocused(false);
        if (!readOnly && !composing.current && value === "") onChange(value, "Enter the price you charge for this service tier.");
      }} />
    </span>
    <span id={id} className={validation ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      role={validation ? "alert" : undefined}>{validation || description || "Enter the price you charge for this service tier."}</span>
  </>;
}
