"use client";

import {useEffect, useId, useRef, useState} from "react";
import {ChevronLeft, ChevronRight, ImagePlus, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {CATALOG_IMAGE_TYPES, CATALOG_IMAGE_LIMIT, validateCatalogFiles, type CatalogImageDraft} from "@/lib/provider/catalog-media";
import {uploadProviderServiceImage} from "@/lib/provider/provider-media-client";

// Use the existing owner-scoped Cloudinary upload contract. A fresh asset ID
// per image prevents later selections from overwriting an existing image.
export async function uploadCatalogImages(images: readonly CatalogImageDraft[], onUploaded: (image: CatalogImageDraft) => void): Promise<CatalogImageDraft[]> {
  const result: CatalogImageDraft[] = [];
  for (const image of images) {
    if (!image.file) { result.push(image); continue; }
    const uploaded = await uploadProviderServiceImage(image.id, image.file);
    const saved = {id: image.id, title: image.title, url: uploaded.url};
    onUploaded(saved);
    result.push(saved);
  }
  return result;
}

export function CatalogImageUploader({images, onChange, disabled = false, titles = false, publication}: {
  images: readonly CatalogImageDraft[];
  onChange: (images: CatalogImageDraft[]) => void;
  disabled?: boolean;
  titles?: boolean;
  publication?: {published: ReadonlySet<string>; onChange: (id: string, published: boolean) => void};
}) {
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); };
  }, []);
  useEffect(() => {
    const current = new Set(images.map((image) => image.url));
    for (const url of previews.current) {
      if (!current.has(url)) { URL.revokeObjectURL(url); previews.current.delete(url); }
    }
  }, [images]);
  return <div className="grid min-w-0 content-start gap-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-input bg-muted/30 p-3">
      <ImagePlus aria-hidden="true" className="size-7 text-primary-strong" />
      <div className="min-w-0 flex-1 basis-48">
      <h4 className="text-base font-bold">{titles ? "Add menu images" : "Add package images"}</h4>
      <p className="text-sm text-muted-foreground">{titles ? "Upload menus, catalog posters, or food photos." : "Upload package posters, menus, or service photos."}</p>
      </div>
      <input ref={fileInput} id={inputId} className="sr-only" tabIndex={-1}
        aria-label={titles ? "Menu images" : "Package images"} aria-describedby={`${inputId}-limits ${inputId}-count`}
        type="file" accept={CATALOG_IMAGE_TYPES.join(",")} multiple disabled={disabled || images.length >= CATALOG_IMAGE_LIMIT}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          try {
            validateCatalogFiles(files, images.length);
            const selected = files.map((file) => {
              const url = URL.createObjectURL(file); previews.current.add(url);
              return {id: crypto.randomUUID(), title: "", url, file};
            });
            onChange([...images, ...selected]); setError(null);
          } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not select images."); }
          event.target.value = "";
        }} />
      <Button size="compact" variant="secondary" className="my-1" disabled={disabled || images.length >= CATALOG_IMAGE_LIMIT}
        aria-controls={inputId} aria-describedby={`${inputId}-limits ${inputId}-count`} onClick={() => fileInput.current?.click()}>
        {images.length ? "Add more images" : "Choose images"}
      </Button>
      <p id={`${inputId}-limits`} className="w-full text-xs text-muted-foreground">JPEG, PNG or WebP • Up to {CATALOG_IMAGE_LIMIT} images • 5 MB each</p>
      <p className="w-full text-xs text-muted-foreground">Upload starts when you save. {titles ? "Titles are optional." : "The first image will be used as the cover."}</p>
    </div>
    <p id={`${inputId}-count`} role="status" aria-live="polite" aria-atomic="true" className="text-sm font-medium">{images.length} of {CATALOG_IMAGE_LIMIT} images selected</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] content-start items-start gap-3">
      {images.map((image, index) => <div key={image.id} role="group" aria-label={`Selected image ${index + 1}`} className="min-w-0 self-start overflow-hidden rounded-xl border border-border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.title || `Selected image ${index + 1}`} className="h-36 w-full bg-muted object-contain" />
        <div className="grid gap-1 border-t border-border p-2">
        {titles ? <label className="grid gap-1 text-xs">Title / category {index + 1}<Input maxLength={80} value={image.title} disabled={disabled}
          onChange={(event) => onChange(images.map((entry) => entry.id === image.id ? {...entry, title: event.target.value} : entry))} /></label>
          : <div className="flex h-7 items-center">{index === 0 ? <Badge className="border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary-strong">Cover</Badge> : <span className="px-2 text-xs font-semibold">Image {index + 1}</span>}</div>}
        {publication ? <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" disabled={disabled} checked={publication.published.has(image.id)}
            aria-label={`Publish ${image.title || `menu image ${index + 1}`}`}
            onChange={(event) => publication.onChange(image.id, event.target.checked)} />Published
        </label> : null}
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="size-11 min-h-11 min-w-11" disabled={disabled || index === 0}
            title="Move image earlier" aria-label={`Move image ${index + 1} earlier`} onClick={() => {
              const next = [...images]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; onChange(next);
            }}><ChevronLeft aria-hidden="true" className="size-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="size-11 min-h-11 min-w-11" disabled={disabled || index === images.length - 1}
            title="Move image later" aria-label={`Move image ${index + 1} later`} onClick={() => {
              const next = [...images]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; onChange(next);
            }}><ChevronRight aria-hidden="true" className="size-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="ml-auto size-11 min-h-11 min-w-11" disabled={disabled}
            title="Remove image" aria-label={`Remove image ${index + 1}`}
            onClick={() => onChange(images.filter((entry) => entry.id !== image.id))}><Trash2 aria-hidden="true" className="size-4" /></Button>
        </div>
        </div>
      </div>)}
    </div>
  </div>;
}
