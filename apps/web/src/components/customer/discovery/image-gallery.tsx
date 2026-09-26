"use client";

import {useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";

export function ImageGallery({images, label}: {images: readonly {url: string; title: string}[]; label: string}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const openedFrom = useRef<HTMLButtonElement | null>(null);
  if (images.length === 0) return null;
  const selected = images[active] ?? images[0]!;
  function move(direction: number) { setActive((current) => (current + direction + images.length) % images.length); setZoomed(false); }
  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setZoomed(false); }}>
    <div aria-label={label} className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3">
      {images.map((image, index) => <DialogTrigger asChild key={`${image.url}-${index}`}>
        <button type="button" onClick={(event) => { openedFrom.current = event.currentTarget; setActive(index); setZoomed(false); }}
          className="min-w-0 overflow-hidden rounded-xl border border-feasta-border-soft bg-card text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={`View ${image.title || `${label} image ${index + 1}`}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" loading="lazy" className="aspect-[4/3] w-full bg-feasta-surface-muted object-contain" />
          <span className="block min-h-11 break-words p-3 text-sm font-semibold">{image.title || `Image ${index + 1}`}</span>
        </button>
      </DialogTrigger>)}
    </div>
    <DialogContent className="flex max-h-[95dvh] max-w-6xl flex-col gap-3 overflow-hidden p-3 sm:p-5"
      onCloseAutoFocus={(event) => { if (openedFrom.current?.isConnected) { event.preventDefault(); openedFrom.current.focus(); } }}>
      <DialogHeader><DialogTitle>{selected.title || label}</DialogTitle>
        <DialogDescription>Image {active + 1} of {images.length}. Zoom in to read details.</DialogDescription></DialogHeader>
      <div tabIndex={0} aria-label="Image viewing area" className="min-h-0 overflow-auto rounded-lg bg-feasta-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selected.url} alt={selected.title || label}
          className={zoomed ? "block h-auto w-[200%] max-w-none" : "mx-auto block max-h-[65dvh] w-full object-contain"} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => setZoomed((value) => !value)} aria-pressed={zoomed}>{zoomed ? "Fit image" : "Zoom in"}</Button>
        {images.length > 1 ? <div className="flex gap-2">
          <Button variant="secondary" onClick={() => move(-1)} aria-label="Previous image">Previous</Button>
          <Button variant="secondary" onClick={() => move(1)} aria-label="Next image">Next</Button>
        </div> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
