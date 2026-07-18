"use client";

import {Eye, EyeOff} from "lucide-react";
import * as React from "react";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type">
>(({className, disabled, ...props}, ref) => {
  const [visible, setVisible] = React.useState(false);
  const label = visible ? "Hide password" : "Show password";
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-14", className)}
        disabled={disabled}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
        disabled={disabled}
        className="absolute right-1 top-1/2 -translate-y-1/2"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export {PasswordInput};
