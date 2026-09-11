"use client";

import {Search, X} from "lucide-react";
import * as React from "react";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

type SearchInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  onClear?: () => void;
  clearLabel?: string;
};

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({onClear, clearLabel = "Clear search", className, ...props}, ref) => (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input ref={ref} type="search" className={cn("pl-12", onClear && "pr-14", className)} {...props} />
      {onClear ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={onClear}
          disabled={props.disabled}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  ),
);
SearchInput.displayName = "SearchInput";

export {SearchInput, type SearchInputProps};
