import {ChevronLeft, ChevronRight} from "lucide-react";

import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export type CursorPaginationProps<TCursor> = {
  previousCursor?: TCursor | null;
  nextCursor?: TCursor | null;
  onPrevious: (cursor: TCursor) => void;
  onNext: (cursor: TCursor) => void;
  pageLabel?: string;
  loading?: boolean;
  className?: string;
};

function CursorPagination<TCursor>({
  previousCursor,
  nextCursor,
  onPrevious,
  onNext,
  pageLabel,
  loading = false,
  className,
}: CursorPaginationProps<TCursor>) {
  return (
    <nav aria-label="Table pagination" className={cn("flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <p className="text-center text-sm text-muted-foreground sm:text-left" aria-live="polite">
        {pageLabel ?? "Cursor-paginated results"}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          variant="secondary"
          size="compact"
          disabled={loading || previousCursor == null}
          onClick={() => previousCursor != null && onPrevious(previousCursor)}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="compact"
          disabled={loading || nextCursor == null}
          onClick={() => nextCursor != null && onNext(nextCursor)}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export {CursorPagination};
