import {Slot} from "@radix-ui/react-slot";
import {cva, type VariantProps} from "class-variance-authority";
import {LoaderCircle} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-center text-base font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-3 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted-foreground disabled:opacity-70 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
        secondary:
          "border border-input bg-card text-card-foreground hover:bg-secondary active:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-90 active:brightness-75",
        ghost:
          "bg-transparent text-foreground hover:bg-secondary active:bg-muted",
        link: "min-h-0 min-w-0 bg-transparent p-0 text-primary-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-14",
        compact: "h-12 px-4 text-sm",
        icon: "size-12 p-0",
      },
      fullWidth: {true: "w-full", false: "w-auto"},
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
      fullWidth: false,
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    loadingLabel?: string;
  };

function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  loading = false,
  loadingLabel = "Loading",
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({variant, size, fullWidth}), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      type={asChild ? undefined : type}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export {Button, buttonVariants, type ButtonProps};
