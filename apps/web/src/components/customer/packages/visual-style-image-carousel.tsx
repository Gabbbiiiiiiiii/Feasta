"use client";

import {ChevronLeft, ChevronRight} from "lucide-react";
import {useState} from "react";

import {Button} from "@/components/ui/button";

export function VisualStyleImageCarousel({
  imageUrls,
  styleName,
  compact = false,
}: {
  imageUrls: readonly string[];
  styleName: string;
  compact?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const images = imageUrls.slice(0, 4);

  if (images.length === 0) {
    return (
      <div className={[
        "grid place-items-center rounded-[16px] border border-dashed border-feasta-border-strong bg-white text-center text-xs font-semibold text-feasta-text-tertiary",
        compact ? "h-36" : "h-44",
      ].join(" ")}>
        Reference photos will appear here.
      </div>
    );
  }

  const activeIndex = Math.min(index, images.length - 1);
  const move = (delta: number) => setIndex((current) => (current + delta + images.length) % images.length);

  return (
    <div className="relative overflow-hidden rounded-[16px] border border-feasta-border-soft bg-white" aria-label={`${styleName} reference photos`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[activeIndex]}
        alt={`${styleName} reference ${activeIndex + 1} of ${images.length}`}
        className={["w-full object-cover", compact ? "h-36" : "h-44"].join(" ")}
      />
      {images.length > 1 ? (
        <>
          <Button type="button" size="icon" variant="secondary" onClick={(event) => { event.stopPropagation(); move(-1); }} aria-label={`Previous ${styleName} photo`} className="absolute left-2 top-1/2 size-9 min-h-9 min-w-9 -translate-y-1/2 rounded-full bg-white/90 shadow-sm">
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="secondary" onClick={(event) => { event.stopPropagation(); move(1); }} aria-label={`Next ${styleName} photo`} className="absolute right-2 top-1/2 size-9 min-h-9 min-w-9 -translate-y-1/2 rounded-full bg-white/90 shadow-sm">
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {images.map((_, dotIndex) => (
              <button key={dotIndex} type="button" aria-label={`Show ${styleName} photo ${dotIndex + 1}`} aria-current={dotIndex === activeIndex ? "true" : undefined} onClick={(event) => { event.stopPropagation(); setIndex(dotIndex); }} className={["size-2 rounded-full border border-white shadow-sm", dotIndex === activeIndex ? "bg-white" : "bg-black/35"].join(" ")} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
