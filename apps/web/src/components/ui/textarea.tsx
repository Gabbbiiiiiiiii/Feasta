import * as React from "react";

import {useFieldControlProps} from "@/components/forms/form-field";
import {cn} from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({className, disabled, required, id, "aria-describedby": describedBy, ...props}, ref) => {
  const field = useFieldControlProps();
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-32 w-full resize-y rounded-lg border border-input bg-card px-4 py-3 text-base text-card-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-disabled aria-invalid:border-destructive aria-invalid:ring-destructive",
        className,
      )}
      id={id ?? field.id}
      aria-describedby={describedBy ?? field["aria-describedby"]}
      aria-invalid={props["aria-invalid"] ?? field["aria-invalid"]}
      disabled={disabled ?? field.disabled}
      required={required ?? field.required}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export {Textarea};
