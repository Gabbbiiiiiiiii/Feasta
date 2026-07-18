import {cva, type VariantProps} from "class-variance-authority";
import {Circle, CircleAlert, CircleCheck, CircleX, Info} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-pill border px-3 py-1 text-sm font-bold leading-tight",
  {
    variants: {
      tone: {
        neutral: "border-input bg-muted text-foreground",
        success: "border-success bg-success-subtle text-success",
        warning: "border-warning bg-warning-subtle text-warning",
        destructive: "border-destructive bg-destructive-subtle text-destructive",
        info: "border-info bg-info-subtle text-info",
      },
    },
    defaultVariants: {tone: "neutral"},
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({className, tone = "neutral", children, ...props}: BadgeProps) {
  const Icon = {
    neutral: Circle,
    success: CircleCheck,
    warning: CircleAlert,
    destructive: CircleX,
    info: Info,
  }[tone ?? "neutral"];
  return (
    <span className={cn(badgeVariants({tone}), className)} {...props}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 overflow-hidden text-ellipsis">{children}</span>
    </span>
  );
}

export {Badge, badgeVariants, type BadgeProps};
