import {ChevronDown} from "lucide-react";
import * as React from "react";

import {useFieldControlProps} from "@/components/forms/form-field";
import {cn} from "@/lib/utils";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({className, children, disabled, required, id, "aria-describedby": describedBy, ...props}, ref) => {
    const field = useFieldControlProps();
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "min-h-14 w-full appearance-none rounded-lg border border-input bg-card px-4 py-3 pr-12 text-base text-card-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-disabled aria-invalid:border-destructive aria-invalid:ring-destructive",
            className,
          )}
          id={id ?? field.id}
          aria-describedby={describedBy ?? field["aria-describedby"]}
          aria-invalid={props["aria-invalid"] ?? field["aria-invalid"]}
          disabled={disabled ?? field.disabled}
          required={required ?? field.required}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    );
  },
);
Select.displayName = "Select";

export {Select};
