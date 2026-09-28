"use client";

import {useState} from "react";
import {ImageOff} from "lucide-react";
import {menuServingGuestLabel, type ProviderMenuImage} from "@/lib/provider/provider-menu";

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function CustomerProviderMenu({menuImages}: {menuImages: readonly ProviderMenuImage[]}) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4">
    {menuImages.map((item, index) =>
      <MenuItemCard key={item.id} item={item} fallbackTitle={`Menu item ${index + 1}`} />)}
  </div>;
}

function MenuItemCard({item, fallbackTitle}: {item: ProviderMenuImage; fallbackTitle: string}) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = item.title || fallbackTitle;
  return <article className="min-w-0 overflow-hidden rounded-xl border border-feasta-border-soft bg-white">
    <div className="grid h-48 place-items-center overflow-hidden bg-feasta-surface-muted">
      {imageFailed ? <div className="grid justify-items-center gap-2 p-4 text-center text-feasta-text-tertiary">
        <ImageOff aria-hidden="true" className="size-7" />
        <span className="text-xs font-semibold">Image unavailable</span>
      </div> :
        // Provider media is validated and owner-scoped by the trusted menu reader.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={title} loading="lazy" className="size-full object-contain"
          onError={() => setImageFailed(true)} />}
    </div>
    <div className="grid gap-3 p-4">
      <div>
        {item.category ? <p className="text-xs font-extrabold uppercase tracking-wide text-primary-strong">{item.category}</p> : null}
        <h3 className="mt-1 break-words text-base font-extrabold text-foreground">{title}</h3>
        {item.description ? <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-feasta-text-secondary">{item.description}</p> : null}
      </div>
      {item.servingOptions?.length ? <ul aria-label={`Serving sizes for ${title}`} className="grid gap-2 border-t border-feasta-divider pt-3">
        {item.servingOptions.map((option) => <li key={option.id} className="rounded-lg bg-feasta-canvas p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <span className="break-words text-sm font-bold text-foreground">{option.name}</span>
            <span className="text-sm font-extrabold text-primary-strong">{money.format(option.price)}</span>
          </div>
          <p className="mt-1 text-xs text-feasta-text-secondary">{menuServingGuestLabel(option.minimumGuests, option.maximumGuests)}</p>
          {option.description ? <p className="mt-1 break-words text-xs text-feasta-text-secondary">{option.description}</p> : null}
        </li>)}
      </ul> : <p className="border-t border-feasta-divider pt-3 text-xs text-feasta-text-secondary">Browsing only. No serving sizes are currently listed.</p>}
      <p className="text-[11px] leading-4 text-feasta-text-tertiary">Displayed prices are informational and are revalidated before any future booking.</p>
    </div>
  </article>;
}
