import {ImageOff} from "lucide-react";

import {cn} from "@/lib/utils";

function ImagePlaceholder({label = "Image unavailable", className}: {label?: string; className?: string}) {
  return (
    <div
      className={cn("grid min-h-32 place-content-center justify-items-center gap-2 rounded-md bg-muted p-4 text-center text-muted-foreground", className)}
      role="img"
      aria-label={label}
    >
      <ImageOff aria-hidden="true" className="size-9" />
      <span className="max-w-full break-words text-sm font-semibold" aria-hidden="true">{label}</span>
    </div>
  );
}

export {ImagePlaceholder};
