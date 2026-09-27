"use client";

import {
  Plus,
  Trash2,
} from "lucide-react";

import {Button} from "@/components/ui/button";
import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";
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
  serviceOptions:
    Record<
      CateringPackageServiceTier,
      ServiceDraft
    >;
  themeOptions: PackageThemeDraft[];
};

type InitialPackageOffer = {
  serviceOptions?: PackageServiceOptions;
  themeOptions?: readonly PackageThemeOption[];
  serviceTier?:
    | CateringPackageServiceTier
    | null;
  price?: number | null;
  serviceInclusions?: readonly string[];
};

export type SerializedPackageOfferDraft = {
  serviceOptions: PackageServiceOptions;
  themeOptions: PackageThemeOption[];
  visualStyleImageDrafts: Record<string, readonly CatalogImageDraft[]>;
  startingPrice: number | null;
  firstEnabledTier:
    CateringPackageServiceTier | null;
  error: string | null;
};

type ProviderPackageOfferBuilderProps = {
  value: ProviderPackageOfferDraft;
  onChange: (
    value: ProviderPackageOfferDraft,
  ) => void;
  disabled?: boolean;
  error?: string;
  legacyNotice?: string;
};

export function createProviderPackageOfferDraft(
  initial?: InitialPackageOffer,
): ProviderPackageOfferDraft {
  const hasStructuredServiceOptions =
    Boolean(
      initial?.serviceOptions &&
      Object.keys(
        initial.serviceOptions,
      ).length > 0,
    );

  const serviceOptions = Object.fromEntries(
    CATERING_PACKAGE_SERVICE_TIERS.map(
      (tier) => {
        const existing =
          initial?.serviceOptions?.[tier];

        const legacyEnabled =
          !hasStructuredServiceOptions &&
          initial?.serviceTier === tier &&
          typeof initial?.price === "number";

        return [
          tier,
          {
            enabled:
              existing !== undefined ||
              legacyEnabled,
            price:
              existing
                ? String(existing.price)
                : legacyEnabled
                  ? String(initial?.price ?? "")
                  : "",
            includedServicesText:
              existing
                ? existing.includedServices.join(
                    "\n",
                  )
                : legacyEnabled
                  ? (
                      initial
                        ?.serviceInclusions ??
                      []
                    ).join("\n")
                  : "",
          },
        ];
      },
    ),
  ) as Record<
    CateringPackageServiceTier,
    ServiceDraft
  >;

  return {
    serviceOptions,
    themeOptions:
      (initial?.themeOptions ?? []).map(
        (theme) => ({
          id: theme.id,
          name: theme.name,
          description: theme.description,
          images: visualStyleImageDrafts(theme.id, theme.imageUrls),
        }),
      ),
  };
}

export function serializeProviderPackageOfferDraft(
  value: ProviderPackageOfferDraft,
): SerializedPackageOfferDraft {
  const enabledTiers =
    CATERING_PACKAGE_SERVICE_TIERS.filter(
      (tier) =>
        value.serviceOptions[tier].enabled,
    );

  if (enabledTiers.length === 0) {
    return invalid(
      "Enable at least one service option.",
    );
  }

  const serviceOptions:
    PackageServiceOptions = {};

  for (const tier of enabledTiers) {
    const draft =
      value.serviceOptions[tier];

    const price =
      Number(draft.price);

    if (
      draft.price.trim() === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 10_000_000
    ) {
      return invalid(
        `Enter a valid price for ${cateringPackageServiceTierLabel(tier)}.`,
      );
    }

    const included =
      parseLines(
        draft.includedServicesText,
      );

    const inclusionError =
      validateLines(
        included,
        `${cateringPackageServiceTierLabel(tier)} included services`,
      );

    if (inclusionError) {
      return invalid(inclusionError);
    }

    serviceOptions[tier] = {
      price,
      includedServices: included,
    };
  }

  const supportsThemes =
    enabledTiers.includes(
      "buffet_setup",
    ) ||
    enabledTiers.includes(
      "full_service",
    );

  if (
    !supportsThemes &&
    value.themeOptions.length > 0
  ) {
    return invalid(
      "Visual styles require Buffet Setup or Full-Service Catering.",
    );
  }

  const themeOptions:
    PackageThemeOption[] = [];

  for (
    const [
      index,
      theme,
    ] of value.themeOptions.entries()
  ) {
    const name = theme.name.trim();

    if (
      name.length < 2 ||
      name.length > 80
    ) {
      return invalid(
        `Visual style ${index + 1} must have a name between 2 and 80 characters.`,
      );
    }

    const description =
      theme.description.trim();

    if (description.length > 500) {
      return invalid(
        `${name} description cannot exceed 500 characters.`,
      );
    }

    if (
      !/^[A-Za-z0-9_-]{2,80}$/u.test(
        theme.id,
      )
    ) {
      return invalid(
        `${name} has an invalid visual style identifier.`,
      );
    }

    if (theme.images.length < 3 || theme.images.length > 4) {
      return invalid(`${name} must have 3 to 4 reference photos.`);
    }

    themeOptions.push({
      id: theme.id,
      name,
      description,
      imageUrls: theme.images.map((image) => image.url),
    });
  }

  const prices =
    Object.values(serviceOptions)
      .map((option) => option?.price)
      .filter(
        (price): price is number =>
          typeof price === "number",
      );

  return {
    serviceOptions,
    themeOptions,
    visualStyleImageDrafts: Object.fromEntries(
      value.themeOptions.map((theme) => [theme.id, theme.images]),
    ),
    startingPrice:
      prices.length > 0
        ? Math.min(...prices)
        : null,
    firstEnabledTier:
      enabledTiers[0] ?? null,
    error: null,
  };
}

export function ProviderPackageOfferBuilder({
  value,
  onChange,
  disabled = false,
  error,
  legacyNotice,
}: ProviderPackageOfferBuilderProps) {
  const supportsThemes =
    value.serviceOptions.buffet_setup
      .enabled ||
    value.serviceOptions.full_service
      .enabled;

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
      themeOptions:
        value.themeOptions.map(
          (theme) =>
            theme.id === id
              ? {
                  ...theme,
                  ...patch,
                }
              : theme,
        ),
    });
  }

  function addTheme() {
    const id =
      `theme_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    onChange({
      ...value,
      themeOptions: [
        ...value.themeOptions,
        {
          id,
          name: "",
          description: "",
          images: [],
        },
      ],
    });
  }

  function removeTheme(id: string) {
    onChange({
      ...value,
      themeOptions:
        value.themeOptions.filter(
          (theme) => theme.id !== id,
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
            Service options
          </h3>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Enable every way customers can book
            this package. Each service option has
            its own price and fixed included
            services.
          </p>

          {legacyNotice ? (
            <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">
                Existing package update:
              </span>{" "}
              {legacyNotice}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {CATERING_PACKAGE_SERVICE_TIERS.map(
            (tier) => {
              const option =
                value.serviceOptions[tier];

              return (
                <article
                  key={tier}
                  className={[
                    "rounded-2xl border p-4 transition duration-150",
                    option.enabled
                      ? "border-primary bg-secondary/40 shadow-sm ring-1 ring-primary/10"
                      : "border-border bg-background/70 hover:border-primary/40 hover:bg-background",
                  ].join(" ")}
                >
                  <label
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-xl",
                      !option.enabled ? "h-full" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={option.enabled}
                      disabled={disabled}
                      onChange={(event) =>
                        updateService(
                          tier,
                          {
                            enabled:
                              event.currentTarget
                                .checked,
                          },
                        )
                      }
                      className="mt-1 size-4 accent-primary"
                    />

                    <span>
                      <span className="block font-bold text-foreground">
                        {cateringPackageServiceTierLabel(
                          tier,
                        )}
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {cateringPackageServiceTierDescription(
                          tier,
                        )}
                      </span>

                      {option.enabled ? (
                        <span className="mt-3 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-strong">
                          Selected service option
                        </span>
                      ) : null}
                    </span>
                  </label>

                  {option.enabled ? (
                    <div className="mt-4 grid gap-4 border-t border-border pt-4">
                      <label className="grid gap-2 text-sm font-medium">
                        Price

                        <Input
                          type="number"
                          min="0"
                          max="10000000"
                          step="0.01"
                          inputMode="decimal"
                          value={option.price}
                          disabled={disabled}
                          placeholder="0.00"
                          onChange={(event) =>
                            updateService(
                              tier,
                              {
                                price:
                                  event.currentTarget
                                    .value,
                              },
                            )
                          }
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-medium">
                        Included services

                        <Textarea
                          rows={5}
                          value={
                            option
                              .includedServicesText
                          }
                          disabled={disabled}
                          placeholder={
                            tier === "drop_off"
                              ? "Delivery`nFood packaging`nServing utensils"
                              : tier ===
                                  "buffet_setup"
                                ? "Delivery`nBuffet equipment`nSetup and pull-out"
                                : "Buffet setup`nService staff`nEvent service`nCleanup"
                          }
                          onChange={(event) =>
                            updateService(
                              tier,
                              {
                                includedServicesText:
                                  event
                                    .currentTarget
                                    .value,
                              },
                            )
                          }
                        />

                        <span className="text-xs font-normal leading-5 text-muted-foreground">
                          Keep this list short and
                          tier-specific. Put detailed
                          furniture, setup, staffing,
                          timing, and limitations in
                          the main package description.
                        </span>
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            },
          )}
        </div>

        {error ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="package-theme-options-title"
        className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3
              id="package-theme-options-title"
              className="text-sm font-bold uppercase text-primary-strong"
            >
              Visual styles
            </h3>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Visual styles are included choices
              for Buffet Setup and Full-Service
              Catering. Each style must include
              3 to 4 reference photos. Put furniture, setup,
              waitstaff, timing, and other contract
              details in the main package
              description.
            </p>
          </div>

          {supportsThemes ? (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={addTheme}
              className="shrink-0"
            >
              <Plus
                aria-hidden="true"
                className="size-4"
              />
              Add visual style
            </Button>
          ) : null}
        </div>

        {!supportsThemes ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
            Enable Buffet Setup or Full-Service
            Catering to offer selectable visual
            styles.
          </div>
        ) : value.themeOptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
            No visual styles yet. Visual styles are
            optional and never add to the selected
            service-option price.
          </div>
        ) : (
          <div className="grid gap-4">
            {value.themeOptions.map(
              (theme, index) => (
                <article
                  key={theme.id}
                  className="rounded-2xl border border-border bg-background p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-foreground">
                        Visual style {index + 1}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Included at no additional
                        cost.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      aria-label={`Remove visual style ${index + 1}`}
                      onClick={() =>
                        removeTheme(theme.id)
                      }
                    >
                      <Trash2
                        aria-hidden="true"
                        className="size-4"
                      />
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm font-medium">
                      Visual style name

                      <Input
                        value={theme.name}
                        maxLength={80}
                        disabled={disabled}
                        placeholder="e.g. Black Monochrome"
                        onChange={(event) =>
                          updateTheme(
                            theme.id,
                            {
                              name:
                                event.currentTarget
                                  .value,
                            },
                          )
                        }
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium">
                      Visual style description

                      <Textarea
                        rows={4}
                        maxLength={500}
                        value={theme.description}
                        disabled={disabled}
                        placeholder="Describe the colors, mood, and visual style. Furniture and setup logistics belong in the main package description."
                        onChange={(event) =>
                          updateTheme(
                            theme.id,
                            {
                              description:
                                event.currentTarget
                                  .value,
                            },
                          )
                        }
                      />

                      <span className="text-xs font-normal text-muted-foreground">
                        {theme.description.length}/500
                        characters
                      </span>
                    </label>

                    <div className="grid gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Reference photos *</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Add 3 to 4 photos showing different angles of the tables, buffet setup, and decor.</p>
                      </div>
                      <CatalogImageUploader
                        images={theme.images}
                        onChange={(images) => updateTheme(theme.id, {images})}
                        disabled={disabled}
                        maxImages={4}
                        reorderable
                        heading="Add visual style photos"
                        helperText="Upload 3 to 4 reference photos for this visual style."
                      />
                      <p className={theme.images.length >= 3 && theme.images.length <= 4 ? "text-xs font-medium text-muted-foreground" : "text-xs font-medium text-destructive"}>
                        {theme.images.length} of 4 required photos selected
                      </p>
                    </div>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export async function uploadProviderPackageVisualStyleImages(
  value: SerializedPackageOfferDraft,
): Promise<PackageThemeOption[]> {
  const result: PackageThemeOption[] = [];

  for (const style of value.themeOptions) {
    const drafts = value.visualStyleImageDrafts[style.id] ?? [];
    const uploaded = await uploadCatalogImages(drafts, () => undefined);
    result.push({
      id: style.id,
      name: style.name,
      description: style.description,
      imageUrls: uploaded.map((image) => image.url),
    });
  }

  return result;
}

function visualStyleImageDrafts(
  styleId: string,
  imageUrls: readonly string[] | undefined,
): CatalogImageDraft[] {
  return (imageUrls ?? []).map((url, index) => ({
    id: `retained_${styleId}_${index}`,
    title: "",
    url,
  }));
}

function invalid(
  error: string,
): SerializedPackageOfferDraft {
  return {
    serviceOptions: {},
    themeOptions: [],
    visualStyleImageDrafts: {},
    startingPrice: null,
    firstEnabledTier: null,
    error,
  };
}

function parseLines(
  value: string,
): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function validateLines(
  values: readonly string[],
  label: string,
): string | null {
  if (values.length > 50) {
    return `${label} can contain at most 50 items.`;
  }


  return null;
}
