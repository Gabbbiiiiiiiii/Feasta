"use client";

import {useEffect, useRef, useState} from "react";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";

import {
  CatalogImageUploader,
  uploadCatalogImages,
} from "@/components/provider/catalog-image-uploader";
import {Button} from "@/components/ui/button";
import {ProviderPackageMoneyInput} from "./provider-package-money-input";
import {packageMoneyCentavos} from "@/lib/provider/package-pricing-preview";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  CATERING_PACKAGE_SERVICE_TIERS,
  cateringPackageServiceTierDescription,
  cateringPackageServiceTierLabel,
  type CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";
import type {
  PackageServiceOptions,
  PackageThemeOption,
} from "@/lib/catering/package-offer-configuration";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";

type ServiceDraft = {
  enabled: boolean;
  price: string;
  inputError?: string;
  includedServicesText: string;
};

export type PackageThemeDraft = {
  id: string;
  name: string;
  description: string;
  images: CatalogImageDraft[];
};

export type ProviderPackageOfferDraft = {
  serviceOptions: Record<CateringPackageServiceTier, ServiceDraft>;
  themeOptions: PackageThemeDraft[];
};

export type SerializedPackageOfferDraft = {
  serviceOptions: PackageServiceOptions;
  themeOptions: PackageThemeOption[];
  startingPrice: number | null;
  error: string | null;
};

export function createProviderPackageOfferDraft(
  initial?: {
    serviceOptions?: PackageServiceOptions;
    themeOptions?: readonly PackageThemeOption[];
  },
): ProviderPackageOfferDraft {
  return {
    serviceOptions: Object.fromEntries(
      CATERING_PACKAGE_SERVICE_TIERS.map((tier) => {
        const existing = initial?.serviceOptions?.[tier];
        return [
          tier,
          {
            enabled: existing !== undefined,
            price: existing ? String(existing.price) : "",
            includedServicesText:
              existing?.includedServices.join("\n") ?? "",
          },
        ];
      }),
    ) as Record<CateringPackageServiceTier, ServiceDraft>,
    themeOptions: (initial?.themeOptions ?? []).map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      images: theme.imageUrls.map((url, index) => ({
        id: `retained-${theme.id}-${index}`,
        title: "",
        url,
      })),
    })),
  };
}

export function serializeProviderPackageOfferDraft(
  value: ProviderPackageOfferDraft,
): SerializedPackageOfferDraft {
  const enabledTiers = CATERING_PACKAGE_SERVICE_TIERS.filter(
    (tier) => value.serviceOptions[tier].enabled,
  );

  if (enabledTiers.length === 0) {
    return invalid("Enable at least one catering service tier.");
  }

  const serviceOptions: PackageServiceOptions = {};

  for (const tier of enabledTiers) {
    const draft = value.serviceOptions[tier];
    const cents = packageMoneyCentavos(draft.price);
    if (draft.inputError) return invalid(draft.inputError);
    const price = cents === null ? Number.NaN : cents / 100;

    if (
      draft.price.trim() === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 10_000_000 ||
      Math.abs(price * 100 - Math.round(price * 100)) > 1e-8
    ) {
      return invalid(
        `Enter a valid price with at most two decimal places for ${cateringPackageServiceTierLabel(tier)}.`,
      );
    }

    const includedServices = parseLines(draft.includedServicesText);
    if (
      includedServices.length > 50 ||
      includedServices.some((item) => item.length > 160)
    ) {
      return invalid(
        `${cateringPackageServiceTierLabel(tier)} can have at most 50 included services, each up to 160 characters.`,
      );
    }

    serviceOptions[tier] = {
      price,
      includedServices,
    };
  }

  if (
    value.themeOptions.length > 0 &&
    !enabledTiers.some(
      (tier) =>
        tier === "buffet_setup" ||
        tier === "full_service",
    )
  ) {
    return invalid(
      "Theme options require Buffet Setup or Full-Service Catering.",
    );
  }

  if (value.themeOptions.length > 12) {
    return invalid("Add at most 12 theme options.");
  }

  const ids = new Set<string>();
  const themeOptions: PackageThemeOption[] = [];

  for (const [index, theme] of value.themeOptions.entries()) {
    const name = theme.name.trim();
    const description = theme.description.trim();

    if (!/^[A-Za-z0-9_-]{2,80}$/u.test(theme.id)) {
      return invalid(`Theme ${index + 1} has an invalid identifier.`);
    }
    if (ids.has(theme.id)) {
      return invalid("Theme identifiers must be unique.");
    }
    ids.add(theme.id);

    if (name.length < 2 || name.length > 80) {
      return invalid(
        `Theme ${index + 1} needs a name between 2 and 80 characters.`,
      );
    }
    if (description.length > 500) {
      return invalid(`${name} description cannot exceed 500 characters.`);
    }
    if (theme.images.length > 4) {
      return invalid(`${name} can have at most 4 reference images.`);
    }

    themeOptions.push({
      id: theme.id,
      name,
      description,
      imageUrls: theme.images.map((image) => image.url),
    });
  }

  return {
    serviceOptions,
    themeOptions,
    startingPrice: Math.min(
      ...enabledTiers.map(
        (tier) => serviceOptions[tier]!.price,
      ),
    ),
    error: null,
  };
}

export async function uploadProviderPackageThemeImages(
  draft: ProviderPackageOfferDraft,
  serialized: SerializedPackageOfferDraft,
  onThemeImagesUploaded: (
    themeId: string,
    images: CatalogImageDraft[],
  ) => void,
): Promise<PackageThemeOption[]> {
  const result: PackageThemeOption[] = [];

  for (const theme of serialized.themeOptions) {
    const images =
      draft.themeOptions.find(
        (candidate) => candidate.id === theme.id,
      )?.images ?? [];
    const uploaded = await uploadCatalogImages(
      images,
      (saved) => {
        onThemeImagesUploaded(
          theme.id,
          images.map((image) =>
            image.id === saved.id ? saved : image,
          ),
        );
      },
    );

    result.push({
      ...theme,
      imageUrls: uploaded.map((image) => image.url),
    });
  }

  return result;
}

export function ProviderPackageOfferBuilder({
  value,
  onChange,
  disabled = false,
  error,
  legacyNotice,
  section = "all",
  priceUnit = "fixed package price",
}: {
  value: ProviderPackageOfferDraft;
  onChange: (value: ProviderPackageOfferDraft) => void;
  disabled?: boolean;
  error?: string;
  legacyNotice?: string;
  section?: "all" | "pricing" | "themes";
  priceUnit?: string;
}) {
  const supportsThemes =
    value.serviceOptions.buffet_setup.enabled ||
    value.serviceOptions.full_service.enabled;

  function updateService(
    tier: CateringPackageServiceTier,
    patch: Partial<ServiceDraft>,
  ) {
    onChange({
      ...value,
      serviceOptions: {
        ...value.serviceOptions,
        [tier]: {
          ...value.serviceOptions[tier],
          ...patch,
        },
      },
    });
  }


  return (
    <div className="grid gap-6">
      {section !== "themes" ? <section
        aria-labelledby="package-service-options-title"
        className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"
      >
        <div>
          <h3
            id="package-service-options-title"
            className="text-sm font-bold uppercase text-primary-strong"
          >
            Catering service tiers
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Enable each service level available for this package. The lowest
            enabled price becomes the package&apos;s starting price.
          </p>
          {legacyNotice ? (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
              {legacyNotice}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {CATERING_PACKAGE_SERVICE_TIERS.map((tier) => {
            const option = value.serviceOptions[tier];
            const label = cateringPackageServiceTierLabel(tier);
            return (
              <article
                key={tier}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={option.enabled}
                    disabled={disabled}
                    onChange={(event) =>
                      updateService(tier, {
                        enabled: event.currentTarget.checked,
                      })
                    }
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {cateringPackageServiceTierDescription(tier)}
                    </span>
                  </span>
                </label>

                {option.enabled ? (
                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm font-medium">
                      {label} price (PHP {priceUnit})
                      <ProviderPackageMoneyInput
                        value={option.price} error={option.inputError} disabled={disabled}
                        onChange={(price, inputError) => updateService(tier, {price, inputError})}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Included services
                      <Textarea
                        rows={4}
                        value={option.includedServicesText}
                        disabled={disabled}
                        placeholder="Enter one included service per line"
                        onChange={(event) =>
                          updateService(tier, {
                            includedServicesText:
                              event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section> : null}

      {section !== "pricing" ? <PackageThemeEditor value={value} onChange={onChange} disabled={disabled} supportsThemes={supportsThemes} /> : null}
    </div>
  );
}

function parseLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function invalid(error: string): SerializedPackageOfferDraft {
  return {
    serviceOptions: {},
    themeOptions: [],
    startingPrice: null,
    error,
  };
}

function PackageThemeEditor({value, onChange, disabled, supportsThemes}: {
  value: ProviderPackageOfferDraft;
  onChange: (value: ProviderPackageOfferDraft) => void;
  disabled: boolean;
  supportsThemes: boolean;
}) {
  const [draft, setDraft] = useState<PackageThemeDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const addThemeTrigger = useRef<HTMLButtonElement>(null);
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); };
  }, []);

  function open(button: HTMLButtonElement, theme?: PackageThemeDraft) {
    opener.current = button;
    setEditing(Boolean(theme));
    setDraft(theme ? {...theme, images: theme.images.map((image) => ({...image}))} : {
      id: `theme_${crypto.randomUUID().replaceAll("-", "_")}`,
      name: "", description: "", images: [],
    });
    setError(null);
  }

  function save() {
    if (!draft || !supportsThemes || disabled) return;
    const next = editing ? value.themeOptions.map((theme) => theme.id === draft.id ? draft : theme) : [...value.themeOptions, draft];
    const validation = serializeProviderPackageOfferDraft({...value, themeOptions: next});
    if (validation.error) { setError(validation.error); return; }
    onChange({...value, themeOptions: next});
    setDraft(null);
  }

  return (
    <section aria-labelledby="package-theme-options-title" className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="package-theme-options-title" className="text-sm font-bold uppercase text-primary-strong">Theme options</h3>
          <p className="mt-1 text-sm text-muted-foreground">Optional visual choices for setup-based tiers. Themes do not change the service-tier price.</p></div>
        {supportsThemes ? <Button ref={addThemeTrigger} type="button" variant="secondary" disabled={disabled || value.themeOptions.length >= 12} onClick={(event) => open(event.currentTarget)}>Add Theme</Button> : null}
      </div>
      {!supportsThemes ? <p className="text-sm text-muted-foreground">Enable Buffet Setup or Full-Service Catering to add themes.</p> : null}
      {supportsThemes && value.themeOptions.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No themes added. Themes are optional.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {value.themeOptions.map((theme, index) => <article key={theme.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
          <div className="min-w-0"><h4 className="break-words font-semibold">{theme.name || `Theme ${index + 1}`}</h4><p className="text-xs text-muted-foreground">{theme.images.length} images</p></div>
          <Button type="button" variant="secondary" disabled={disabled || !supportsThemes} aria-label={`Edit theme ${theme.name || index + 1}`} onClick={(event) => open(event.currentTarget, theme)}>Edit</Button>
        </article>)}
      </div>
      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="z-[70] max-w-xl" overlayClassName="z-[60]" onCloseAutoFocus={(event) => {
          event.preventDefault(); (opener.current?.isConnected ? opener.current : addThemeTrigger.current)?.focus();
        }} onEscapeKeyDown={(event) => event.stopPropagation()}>
          <DialogHeader><DialogTitle>{editing ? "Edit Theme" : "Add Theme"}</DialogTitle><DialogDescription>Theme changes stay local until you save the package.</DialogDescription></DialogHeader>
          {draft ? <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium">Theme name<Input value={draft.name} maxLength={80} onChange={(event) => setDraft({...draft, name: event.target.value})} /></label>
            <label className="grid gap-2 text-sm font-medium">Theme description<Textarea value={draft.description} maxLength={500} rows={3} onChange={(event) => setDraft({...draft, description: event.target.value})} /></label>
            <CatalogImageUploader retainPreviewsOnUnmount images={draft.images} onChange={(images) => {
              for (const image of images) if (image.file && image.url.startsWith("blob:")) previewUrls.current.add(image.url);
              setDraft({...draft, images});
            }} maximumImages={4} heading="Add theme images" helperText="Optional reference images for this theme." inputLabel="Theme images" />
          </div> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="flex-wrap">
            {editing ? <Button type="button" variant="secondary" onClick={() => {
              onChange({...value, themeOptions: value.themeOptions.filter((theme) => theme.id !== draft?.id)}); setDraft(null);
            }}>Remove Theme</Button> : null}
            <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="button" onClick={save}>Save Theme</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
