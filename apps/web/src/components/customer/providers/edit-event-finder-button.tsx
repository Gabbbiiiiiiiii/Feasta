"use client";

import {Pencil} from "lucide-react";

export function EditEventFinderButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new Event("feasta:open-event-finder"));
      }}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/20 bg-white px-4 text-xs font-bold text-primary-strong transition-colors hover:bg-primary-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Pencil aria-hidden="true" className="size-3.5" />
      Edit event
    </button>
  );
}