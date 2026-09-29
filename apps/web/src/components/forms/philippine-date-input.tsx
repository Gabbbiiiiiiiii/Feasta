"use client";

import {forwardRef, useState, type ChangeEvent, type ComponentProps, type CSSProperties} from "react";

import {useFieldControlProps} from "@/components/forms/form-field";
import {Input} from "@/components/ui/input";
import {formatPhilippineDate} from "@/lib/dates/philippine-date";
import {cn} from "@/lib/utils";

const hiddenNativeDateText = [
  "text-transparent",
  "caret-transparent",
  "[&::-webkit-datetime-edit]:text-transparent",
  "[&::-webkit-datetime-edit-day-field]:text-transparent",
  "[&::-webkit-datetime-edit-fields-wrapper]:text-transparent",
  "[&::-webkit-datetime-edit-month-field]:text-transparent",
  "[&::-webkit-datetime-edit-text]:text-transparent",
  "[&::-webkit-datetime-edit-year-field]:text-transparent",
].join(" ");

type PhilippineDateInputProps = Omit<ComponentProps<"input">, "type"> & {
  displayClassName?: string;
  plain?: boolean;
  /**
   * Renders the formatted date as text. Use this when the caption is a
   * separate label. Wrapping labels keep the caption text exact by drawing
   * the date with CSS instead.
   */
  visibleText?: boolean;
};

const PhilippineDateInput = forwardRef<HTMLInputElement, PhilippineDateInputProps>(
  function PhilippineDateInput({
    className,
    value,
    defaultValue,
    onChange,
    placeholder = "MM/DD/YYYY",
    plain = false,
    displayClassName,
    disabled,
    visibleText = false,
    ...props
  }, ref) {
    const field = useFieldControlProps();
    const controlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState(
      typeof defaultValue === "string" ? defaultValue : "",
    );
    const currentValue = controlled ? String(value ?? "") : uncontrolledValue;
    const isDisabled = Boolean(disabled ?? field.disabled);
    const display = currentValue ? formatPhilippineDate(currentValue) : placeholder;

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      onChange?.(event);
      if (!controlled) setUncontrolledValue(event.currentTarget.value);
    }

    const inputClassName = cn(className, hiddenNativeDateText);
    const sharedProps = {
      ...props,
      lang: "en-PH" as const,
      type: "date" as const,
      value: controlled ? value : undefined,
      defaultValue: controlled ? undefined : defaultValue,
      disabled: isDisabled,
      onChange: handleChange,
      className: inputClassName,
    };

    return (
      <div className="relative min-w-0">
        {plain ? (
          <input ref={ref} {...sharedProps} />
        ) : (
          <Input ref={ref} {...sharedProps} />
        )}
        <span
          aria-hidden="true"
          title={currentValue ? display : undefined}
          style={visibleText ? undefined : {"--philippine-date": JSON.stringify(display)} as CSSProperties}
          className={cn(
            "pointer-events-none absolute inset-y-0 flex items-center overflow-hidden",
            visibleText ? "truncate" : "before:min-w-0 before:truncate before:[content:var(--philippine-date)]",
            displayClassName ?? "left-4 right-12 text-base",
            currentValue && !isDisabled ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {visibleText ? display : null}
        </span>
      </div>
    );
  },
);

export {PhilippineDateInput};
