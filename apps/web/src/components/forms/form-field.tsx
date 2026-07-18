"use client";

import * as React from "react";

import {cn} from "@/lib/utils";

type FieldContextValue = {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
  disabled: boolean;
  required: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

export type FormFieldProps = {
  label: string;
  children: React.ReactNode;
  description?: string;
  error?: string;
  serverError?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  id?: string;
};

function FormField({
  label,
  children,
  description,
  error,
  serverError,
  required = false,
  disabled = false,
  loading = false,
  className,
  id,
}: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? `field-${generatedId}`;
  const errorMessage = error || serverError;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = errorMessage ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider
      value={{
        controlId,
        describedBy,
        invalid: Boolean(errorMessage),
        disabled: disabled || loading,
        required,
      }}
    >
      <div
        className={cn("grid gap-2", className)}
        data-disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
      >
        <label className="text-sm font-bold text-foreground" htmlFor={controlId}>
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="ml-1 text-destructive">*</span>
              <span className="sr-only"> required</span>
            </>
          ) : null}
        </label>
        {description ? (
          <p className="text-sm text-muted-foreground" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {children}
        {loading ? <span className="sr-only" role="status">Loading field</span> : null}
        {errorMessage ? (
          <p className="text-sm font-semibold text-destructive" id={errorId} role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldControlProps() {
  const field = React.useContext(FieldContext);
  return field
    ? {
        id: field.controlId,
        "aria-describedby": field.describedBy,
        "aria-invalid": field.invalid || undefined,
        disabled: field.disabled,
        required: field.required,
      }
    : {};
}

export {FormField, useFieldControlProps};
