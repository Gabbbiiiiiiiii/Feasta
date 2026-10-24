import * as React from "react";

import {cn} from "@/lib/utils";

type CheckboxFieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  description?: string;
};

function CheckboxField({label, description, className, id, ...props}: CheckboxFieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? `checkbox-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <div className="flex items-start gap-3">
      <input
        id={controlId}
        type="checkbox"
        className={cn(
          "mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        aria-describedby={descriptionId}
        {...props}
      />
      <div className="grid gap-1">
        <label htmlFor={controlId} className="font-semibold text-foreground">{label}</label>
        {description ? <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

type RadioOption = {value: string; label: string; description?: string};
type RadioGroupProps = Omit<React.ComponentProps<"fieldset">, "onChange"> & {
  legend: string;
  name: string;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  ...props
}: RadioGroupProps) {
  return (
    <fieldset className={cn("grid gap-3", className)} disabled={disabled} {...props}>
      <legend className="mb-1 text-sm font-bold">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-12 items-start gap-3 rounded-lg border border-border p-3 hover:bg-secondary">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === undefined ? undefined : value === option.value}
            defaultChecked={value === undefined ? defaultValue === option.value : undefined}
            onChange={(event) => onValueChange?.(event.currentTarget.value)}
            className="mt-0.5 size-5 accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <span>
            <span className="block font-semibold">{option.label}</span>
            {option.description ? <span className="block text-sm text-muted-foreground">{option.description}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export {CheckboxField, RadioGroup, type CheckboxFieldProps, type RadioGroupProps};
