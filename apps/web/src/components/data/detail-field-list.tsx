import type {ReactNode} from "react";

import {cn} from "@/lib/utils";

const PLACEHOLDER_VALUES = new Set([
  "—",
  "-",
  "not available",
  "not configured",
  "not recorded",
  "not assigned",
  "not applicable",
  "not specified",
  "not provided",
  "unavailable",
  "none",
]);

function isPlaceholderValue(value: ReactNode): boolean {
  return (
    typeof value === "string" &&
    PLACEHOLDER_VALUES.has(value.trim().toLowerCase())
  );
}

type DetailFieldListProps = {
  columns?: 1 | 2 | 3;
  layout?: "grid" | "rows";
  className?: string;
  children: ReactNode;
};

function DetailFieldList({
  columns = 2,
  layout = "grid",
  className,
  children,
}: DetailFieldListProps) {
  if (layout === "rows") {
    return (
      <dl
        className={cn(
          "min-w-0 divide-y divide-border/75 rounded-xl border border-border bg-card",
          className,
        )}
      >
        {children}
      </dl>
    );
  }

  return (
    <dl
      className={cn(
        "grid min-w-0 gap-2.5",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

type DetailFieldItemProps = {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
  secondary?: ReactNode;
  icon?: ReactNode;
  wide?: boolean;
  code?: boolean;
  numeric?: boolean;
  muted?: boolean;
  preserveWhitespace?: boolean;
  variant?: "tile" | "row";
  className?: string;
  valueClassName?: string;
};

function DetailFieldItem({
  label,
  value,
  children,
  secondary,
  icon,
  wide = false,
  code = false,
  numeric = false,
  muted,
  preserveWhitespace = false,
  variant = "tile",
  className,
  valueClassName,
}: DetailFieldItemProps) {
  const content = children ?? value;
  const isMuted = muted ?? isPlaceholderValue(content);

  if (variant === "row") {
    return (
      <div
        className={cn(
          "grid min-w-0 gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline sm:gap-4",
          className,
        )}
      >
        <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          {label}
        </dt>
        <dd
          className={cn(
            "min-w-0 break-words text-sm",
            isMuted
              ? "font-normal text-muted-foreground/75"
              : "font-semibold text-foreground",
            code &&
              !isMuted &&
              "inline-block w-fit max-w-full break-all rounded-md border border-border/80 bg-secondary/60 px-2 py-0.5 font-mono text-xs font-medium text-foreground",
            numeric && "tabular-nums",
            preserveWhitespace && "whitespace-pre-wrap",
            valueClassName,
          )}
        >
          {content}
        </dd>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/70 bg-secondary/55 px-3.5 py-2.5",
        wide && "col-span-full",
        icon && "flex items-start gap-3",
        className,
      )}
    >
      {icon ? (
        <span className="mt-0.5 shrink-0 text-primary/80 [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          {label}
        </dt>
        <dd
          className={cn(
            "mt-1 break-words text-sm",
            isMuted
              ? "font-normal text-muted-foreground/75"
              : "font-semibold text-foreground",
            code &&
              !isMuted &&
              "mt-1.5 inline-block max-w-full break-all rounded-md border border-border/80 bg-card px-2 py-0.5 font-mono text-xs font-medium text-foreground",
            numeric && "tabular-nums",
            preserveWhitespace && "whitespace-pre-wrap",
            valueClassName,
          )}
        >
          {content}
        </dd>
        {secondary ? (
          <dd className="mt-0.5 break-words text-xs text-muted-foreground">
            {secondary}
          </dd>
        ) : null}
      </div>
    </div>
  );
}

export {
  DetailFieldItem,
  DetailFieldList,
  type DetailFieldItemProps,
  type DetailFieldListProps,
};
