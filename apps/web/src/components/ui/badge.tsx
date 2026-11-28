import {cva, type VariantProps} from "class-variance-authority";
import {Circle, CircleAlert, CircleCheck, CircleX, Info} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 border leading-tight",
  {
    variants: {
      tone: {
        neutral: "border-input bg-muted text-foreground",
        success: "border-success bg-success-subtle text-success",
        warning: "border-warning bg-warning-subtle text-warning",
        destructive: "border-destructive bg-destructive-subtle text-destructive",
        info: "border-info bg-info-subtle text-info",
      },
      shape: {
        pill: "rounded-pill",
        rounded: "rounded-md",
      },
      size: {
        default: "px-3 py-1 text-sm font-bold [&>svg]:size-4",
        compact: "px-2 py-0.5 text-xs font-semibold [&>svg]:size-3.5",
      },
    },
    defaultVariants: {
      tone: "neutral",
      shape: "pill",
      size: "default",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({
  className,
  tone = "neutral",
  shape = "pill",
  size = "default",
  children,
  ...props
}: BadgeProps) {
  const Icon = {
    neutral: Circle,
    success: CircleCheck,
    warning: CircleAlert,
    destructive: CircleX,
    info: Info,
  }[tone ?? "neutral"];
  return (
    <span className={cn(badgeVariants({tone, shape, size}), className)} {...props}>
      <Icon aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 overflow-hidden text-ellipsis">{children}</span>
    </span>
  );
}

export {Badge, badgeVariants, type BadgeProps};
