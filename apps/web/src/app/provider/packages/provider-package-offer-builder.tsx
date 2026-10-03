"use client";

import {Plus, Trash2} from "lucide-react";

import {
  CatalogImageUploader,
  uploadCatalogImages,
} from "@/components/provider/catalog-image-uploader";
import {Button} from "@/components/ui/button";
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
    const price = Number(draft.price);

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
}: {
  value: ProviderPackageOfferDraft;
  onChange: (value: ProviderPackageOfferDraft) => void;
  disabled?: boolean;
  error?: string;
  legacyNotice?: string;
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

  function updateTheme(
    id: string,
    patch: Partial<PackageThemeDraft>,
  ) {
    onChange({
      ...value,
      themeOptions: value.themeOptions.map((theme) =>
        theme.id === id ? {...theme, ...patch} : theme,
      ),
    });
  }

  return (
    <div className="grid gap-6">
      <section
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
                      {label} price
                      <Input
                        type="number"
                        min="0"
                        max="10000000"
                        step="0.01"
                        value={option.price}
                        disabled={disabled}
                        onChange={(event) =>
                          updateService(tier, {
                            price: event.currentTarget.value,
                          })
                        }
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
      </section>

      <section
        aria-labelledby="package-theme-options-title"
        className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              id="package-theme-options-title"
              className="text-sm font-bold uppercase text-primary-strong"
            >
              Theme options
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Optional visual choices for setup-based tiers. Themes do not
              change the service-tier price.
            </p>
          </div>
          {supportsThemes && value.themeOptions.length < 12 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...value,
                  themeOptions: [
                    ...value.themeOptions,
                    {
                      id: `theme_${crypto.randomUUID().replaceAll("-", "_")}`,
                      name: "",
                      description: "",
                      images: [],
                    },
                  ],
                })
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Add theme
            </Button>
          ) : null}
        </div>

        {!supportsThemes ? (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            Enable Buffet Setup or Full-Service Catering to add themes.
          </p>
        ) : value.themeOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            No themes added. Themes are optional.
          </p>
        ) : (
          <div className="grid gap-4">
            {value.themeOptions.map((theme, index) => (
              <article
                key={theme.id}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold">Theme {index + 1}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={`Remove theme ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        themeOptions: value.themeOptions.filter(
                          (candidate) => candidate.id !== theme.id,
                        ),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium">
                    Theme name
                    <Input
                      value={theme.name}
                      maxLength={80}
                      disabled={disabled}
                      onChange={(event) =>
                        updateTheme(theme.id, {
                          name: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Theme description
                    <Textarea
                      rows={3}
                      value={theme.description}
                      maxLength={500}
                      disabled={disabled}
                      onChange={(event) =>
                        updateTheme(theme.id, {
                          description: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <CatalogImageUploader
                    images={theme.images}
                    onChange={(images) =>
                      updateTheme(theme.id, {images})
                    }
                    disabled={disabled}
                    maximumImages={4}
                    heading="Add theme images"
                    helperText="Optional reference images for this theme."
                    inputLabel={`${theme.name || `Theme ${index + 1}`} images`}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
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
