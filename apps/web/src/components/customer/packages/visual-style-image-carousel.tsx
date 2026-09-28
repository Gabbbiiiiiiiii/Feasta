"use client";

import {ChevronLeft, ChevronRight} from "lucide-react";
import {useState} from "react";

import {Button} from "@/components/ui/button";

export function VisualStyleImageCarousel({
  imageUrls,
  styleName,
}: {
  imageUrls: readonly string[];
  styleName: string;
}) {
  const [index, setIndex] = useState(0);
  const images = imageUrls.slice(0, 4);

  if (images.length === 0) {
    return (
      <div className="grid h-40 place-items-center rounded-[16px] border border-dashed border-feasta-border-strong bg-white px-4 text-center text-xs font-semibold text-feasta-text-tertiary">
        No reference images available.
      </div>
    );
  }

  const activeIndex = Math.min(index, images.length - 1);
  const move = (delta: number) =>
    setIndex(
      (current) =>
        (current + delta + images.length) %
        images.length,
    );

  return (
    <div
      className="relative overflow-hidden rounded-[16px] border border-feasta-border-soft bg-white"
      aria-label={`${styleName} reference images`}
    >
      {/* Public package image URLs are normalized before rendering. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[activeIndex]}
        alt={`${styleName} reference ${activeIndex + 1} of ${images.length}`}
        className="h-40 w-full object-cover"
      />

      {images.length > 1 ? (
        <>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => move(-1)}
            aria-label={`Previous ${styleName} image`}
            className="absolute left-2 top-1/2 size-9 min-h-9 min-w-9 -translate-y-1/2 rounded-full bg-white/90 shadow-sm"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => move(1)}
            aria-label={`Next ${styleName} image`}
            className="absolute right-2 top-1/2 size-9 min-h-9 min-w-9 -translate-y-1/2 rounded-full bg-white/90 shadow-sm"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {images.map((image, dotIndex) => (
              <button
                key={image}
                type="button"
                aria-label={`Show ${styleName} image ${dotIndex + 1}`}
                aria-current={
                  dotIndex === activeIndex
                    ? "true"
                    : undefined
                }
                onClick={() => setIndex(dotIndex)}
                className={[
                  "size-2 rounded-full border border-white shadow-sm",
                  dotIndex === activeIndex
                    ? "bg-white"
                    : "bg-black/35",
                ].join(" ")}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
