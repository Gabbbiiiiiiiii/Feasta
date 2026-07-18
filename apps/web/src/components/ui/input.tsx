import * as React from "react";

import {useFieldControlProps} from "@/components/forms/form-field";
import {cn} from "@/lib/utils";

const inputStyles =
  "flex min-h-14 w-full rounded-lg border border-input bg-card px-4 py-3 text-base text-card-foreground shadow-none transition-colors placeholder:text-muted-foreground hover:border-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({className, disabled, required, id, "aria-describedby": describedBy, ...props}, ref) => {
    const field = useFieldControlProps();
    return (
      <input
        ref={ref}
        className={cn(inputStyles, className)}
        id={id ?? field.id}
        aria-describedby={describedBy ?? field["aria-describedby"]}
        aria-invalid={props["aria-invalid"] ?? field["aria-invalid"]}
        disabled={disabled ?? field.disabled}
        required={required ?? field.required}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export {Input, inputStyles};
