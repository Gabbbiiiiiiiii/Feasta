"use client";

import {ChevronLeft, ChevronRight} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

export type PortfolioDraftPhoto = {id: string; altText: string; url?: string; file?: File; uploaded?: boolean};

function PhotoPreview({photo}: {photo: PortfolioDraftPhoto}) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!photo.file || !image.current) return;
    const url = URL.createObjectURL(photo.file);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo.file]);
  return photo.file || photo.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={image} src={photo.url} alt={photo.altText} className="aspect-[4/3] w-full rounded object-cover" />
  ) : null;
}

export function ServicePortfolioFields({photos, coverAssetId, disabled, onChange}: {
  photos: PortfolioDraftPhoto[];
  coverAssetId: string | null;
  disabled: boolean;
  onChange: (photos: PortfolioDraftPhoto[], coverAssetId: string | null) => void;
}) {
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(false);
  function add(files: FileList | null) {
    if (disabled || !files?.length) return;
    const picked = Array.from(files);
    if (picked.length + photos.length > 20) {
      setError("A portfolio can contain up to 20 photos.");
      return;
    }
    if (picked.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        !file.size || file.size > 20 * 1024 * 1024)) {
      setError("Choose JPEG, PNG, or WebP photos up to 20 MB each.");
      return;
    }
    setError("");
    const next = [...photos, ...picked.map((file) => ({id: crypto.randomUUID(), altText: "", file}))];
    onChange(next, coverAssetId ?? next[0].id);
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...photos];
    const destination = index + direction;
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next, coverAssetId);
  }

  return <fieldset disabled={disabled} className="grid gap-3">
    <legend className="sr-only">Portfolio gallery</legend>
    <label className="grid gap-2 rounded border border-dashed p-3 text-sm" onDragOver={(event) => {
      event.preventDefault();
      setProgress(true);
    }} onDragLeave={() => setProgress(false)} onDrop={(event) => {
      event.preventDefault();
      setProgress(false);
      add(event.dataTransfer.files);
    }}>
      {progress ? "Drop photos here" : "Choose or drop up to 20 photos"}
      <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
        add(event.target.files);
        event.target.value = "";
      }} />
    </label>
    <p className="text-sm text-muted-foreground">JPEG, PNG, or WebP, up to 20 MB each. Photos upload when you save. Only add photos you have permission to publish.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {photos.length ? <p className="text-sm text-muted-foreground">Choose the photo customers see first as your cover. Use the arrows to change the gallery order.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      {photos.map((photo, index) => {
        const name = `Photo ${index + 1}`;
        const isCover = photo.id === coverAssetId;
        return <div key={photo.id} role="group" aria-label={name} className="grid content-start gap-3 rounded-xl border border-border bg-card p-3">
          <PhotoPreview photo={photo} />
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <p className="text-sm font-semibold">{name}</p>
            {isCover ? <span className="inline-flex min-h-12 items-center text-sm font-semibold text-primary">Cover photo</span> :
              <Button type="button" size="compact" variant="ghost" aria-label={`Set ${name.toLowerCase()} as cover`}
                onClick={() => onChange(photos, photo.id)}>Set as cover</Button>}
          </div>
          <label className="grid gap-1 text-sm">Photo description
            <Input value={photo.altText} required maxLength={200} placeholder="e.g. Couple sharing their first dance"
              onChange={(event) => onChange(photos.map((item) => item.id === photo.id
                ? {...item, altText: event.target.value} : item), coverAssetId)} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {photos.length > 1 ? <div className="flex gap-1" role="group" aria-label="Gallery order">
              <Button type="button" size="icon" variant="secondary" aria-label={`Move ${name.toLowerCase()} earlier`}
                title="Move earlier" disabled={index === 0} onClick={() => move(index, -1)}>
                <ChevronLeft aria-hidden="true" className="size-5" />
              </Button>
              <Button type="button" size="icon" variant="secondary" aria-label={`Move ${name.toLowerCase()} later`}
                title="Move later" disabled={index === photos.length - 1} onClick={() => move(index, 1)}>
                <ChevronRight aria-hidden="true" className="size-5" />
              </Button>
            </div> : null}
            <Button type="button" size="compact" variant="ghost" className="ml-auto text-destructive"
              aria-label={`Remove ${name.toLowerCase()}`} onClick={() => {
                const next = photos.filter((item) => item.id !== photo.id);
                onChange(next, isCover ? next[0]?.id ?? null : coverAssetId);
              }}>Remove</Button>
          </div>
        </div>;
      })}
    </div>
  </fieldset>;
}
