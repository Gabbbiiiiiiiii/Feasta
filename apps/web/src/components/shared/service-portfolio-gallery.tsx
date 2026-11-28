"use client";

import {useId, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import type {ServicePortfolio} from "@/lib/provider/service-portfolio";

export function ServicePortfolioGallery({portfolio, showCover = true}: {
  portfolio: ServicePortfolio;
  showCover?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<number | null>(null);
  const titleId = useId();
  if (!portfolio.photos.length) return null;
  const cover = portfolio.photos.find((photo) => photo.id === portfolio.coverAssetId);
  const selected = portfolio.photos[index] ?? portfolio.photos[0];

  function move(delta: number) {
    const count = portfolio.photos.length;
    setIndex((current) => (current + delta + count) % count);
  }

  return <div className="mt-3 grid gap-2">
    {showCover && cover ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cover.thumbnailUrl} alt={cover.altText} loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
    ) : null}
    <Button type="button" variant="secondary" className="justify-self-start" onClick={() => {
      setIndex(Math.max(0, portfolio.photos.findIndex((photo) => photo.id === portfolio.coverAssetId)));
      dialog.current?.showModal();
    }}>View portfolio ({portfolio.photos.length} photos)</Button>
    <dialog ref={dialog} aria-labelledby={titleId}
      className="m-auto w-[min(95vw,60rem)] rounded-lg bg-background p-4 text-foreground backdrop:bg-black/70"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h3 id={titleId} className="font-semibold">Service portfolio</h3>
        <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>Close</Button>
      </div>
      <div onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const end = event.changedTouches[0]?.clientX;
          touchStart.current = null;
          if (start !== null && end !== undefined && Math.abs(end - start) > 50) move(end > start ? -1 : 1);
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selected.url} alt={selected.altText} loading="lazy" className="max-h-[65vh] w-full object-contain" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
        <Button type="button" variant="secondary" disabled={portfolio.photos.length < 2} onClick={() => move(-1)}>Previous</Button>
        <p role="status" className="text-sm">{index + 1} of {portfolio.photos.length} · {selected.altText}</p>
        <Button type="button" variant="secondary" disabled={portfolio.photos.length < 2} onClick={() => move(1)}>Next</Button>
      </div>
    </dialog>
  </div>;
}
