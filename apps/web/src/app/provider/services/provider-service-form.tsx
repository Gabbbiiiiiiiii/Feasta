"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  ADDON_PRICING_TYPES,
  type AddonPricingType,
  type ProviderServiceCategory,
} from "@feasta/shared-types";

import {
  FormField,
} from "@/components/forms/form-field";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  Textarea,
} from "@/components/ui/textarea";
import {
  createProviderService,
  updateProviderService,
  type ProviderService,
  type ProviderServiceInput,
} from "@/lib/provider/provider-service-client";

type ProviderServiceFormProps = {
  serviceCategories:
    readonly ProviderServiceCategory[];

  initialService?: ProviderService;

  onSaved: () => void | Promise<void>;
  onCancel: () => void;
};

export function ProviderServiceForm({
  serviceCategories,
  initialService,
  onSaved,
  onCancel,
}: ProviderServiceFormProps) {
  const editing =
    initialService !== undefined;

  const [name, setName] =
    useState(
      initialService?.name ?? "",
    );

  const [description, setDescription] =
    useState(
      initialService?.description ?? "",
    );

  const [category, setCategory] =
    useState<ProviderServiceCategory>(
      initialService?.category ??
        serviceCategories[0] ??
        "other_event_service",
    );

  const [pricingType, setPricingType] =
    useState<AddonPricingType>(
      initialService?.pricingType ??
        "fixed",
    );

  const [price, setPrice] =
    useState(
      initialService?.price !== null &&
      initialService?.price !== undefined
        ? String(initialService.price)
        : "",
    );

  const [imageUrl, setImageUrl] =
    useState(
      initialService?.imageUrl ?? "",
    );

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const parsedPrice =
    pricingType === "custom_quote"
      ? null
      : Number(price);

  const validationError =
    useMemo(() => {
      if (
        name.trim().length < 2 ||
        name.trim().length > 160
      ) {
        return "Service name must be between 2 and 160 characters.";
      }

      if (
        description.trim().length > 1000
      ) {
        return "Service description must not exceed 1000 characters.";
      }

      if (
        !serviceCategories.includes(
          category,
        )
      ) {
        return "Select a service category that belongs to your provider profile.";
      }

      if (
        !ADDON_PRICING_TYPES.includes(
          pricingType,
        )
      ) {
        return "Select a valid pricing type.";
      }

      if (
        pricingType !== "custom_quote" &&
        (
          parsedPrice === null ||
          !Number.isFinite(parsedPrice) ||
          parsedPrice < 0 ||
          parsedPrice > 100_000_000
        )
      ) {
        return "Enter a valid service price.";
      }

      if (
        imageUrl.trim() !== ""
      ) {
        try {
          const url =
            new URL(
              imageUrl.trim(),
            );

          if (
            url.protocol !== "https:" ||
            url.username !== "" ||
            url.password !== "" ||
            url.port !== "" ||
            url.hash !== ""
          ) {
            return "Image URL must be a valid HTTPS URL.";
          }
        } catch {
          return "Image URL must be a valid HTTPS URL.";
        }
      }

      return null;
    }, [
      category,
      description,
      imageUrl,
      name,
      parsedPrice,
      pricingType,
      serviceCategories,
    ]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      submitting ||
      validationError
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const input: ProviderServiceInput = {
        name:
          name.trim(),

        description:
          description.trim(),

        category,

        pricingType,

        price:
          pricingType === "custom_quote"
            ? null
            : parsedPrice,

        imageUrl:
          imageUrl.trim(),
      };

      if (editing) {
        await updateProviderService(
          initialService.id,
          input,
        );
      } else {
        await createProviderService(
          input,
        );
      }

      await onSaved();
    } catch (caught) {
      console.error(
        editing
          ? "[FEASTA update service]"
          : "[FEASTA create service]",
        caught,
      );

      setError(
        editing
          ? "The service could not be updated. Please review the details and try again."
          : "The service could not be created. Please review the details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Service name"
          required
        >
          <Input
            value={name}
            onChange={(event) =>
              setName(
                event.target.value,
              )
            }
            maxLength={160}
            autoComplete="off"
          />
        </FormField>

        <FormField
          label="Service category"
          required
        >
          <select
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value as
                  ProviderServiceCategory,
              )
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {serviceCategories.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {formatServiceCategory(
                    item,
                  )}
                </option>
              ),
            )}
          </select>
        </FormField>
      </div>

      <FormField
        label="Description"
      >
        <Textarea
          value={description}
          onChange={(event) =>
            setDescription(
              event.target.value,
            )
          }
          maxLength={1000}
          rows={5}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Pricing type"
          required
        >
          <select
            value={pricingType}
            onChange={(event) => {
              const nextPricingType =
                event.target.value as
                  AddonPricingType;

              setPricingType(
                nextPricingType,
              );

              if (
                nextPricingType ===
                  "custom_quote"
              ) {
                setPrice("");
              }
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ADDON_PRICING_TYPES.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {formatPricingType(
                    item,
                  )}
                </option>
              ),
            )}
          </select>
        </FormField>

        {pricingType !==
        "custom_quote" ? (
          <FormField
            label={priceLabel(
              pricingType,
            )}
            required
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) =>
                setPrice(
                  event.target.value,
                )
              }
              inputMode="decimal"
            />
          </FormField>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">
              Custom quote
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Customers will request pricing
              instead of seeing a fixed amount.
            </p>
          </div>
        )}
      </div>

      <FormField
        label="Image URL"
      >
        <Input
          type="url"
          value={imageUrl}
          onChange={(event) =>
            setImageUrl(
              event.target.value,
            )
          }
          placeholder="https://..."
          autoComplete="off"
        />

        <p className="mt-1 text-xs text-muted-foreground">
          Temporary image URL field. A dedicated
          service image uploader will replace this
          once the service media workflow is added.
        </p>
      </FormField>

      {validationError ? (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {validationError}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Button
        type="button"
        variant="secondary"
        disabled={submitting}
        onClick={onCancel}
        >
        Cancel
        </Button>

        <Button
          type="submit"
          disabled={
            submitting ||
            validationError !== null
          }
        >
          {submitting
            ? editing
              ? "Saving..."
              : "Creating..."
            : editing
              ? "Save changes"
              : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

function formatServiceCategory(
  value: ProviderServiceCategory,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}

function formatPricingType(
  value: AddonPricingType,
): string {
  switch (value) {
    case "fixed":
      return "Fixed price";

    case "per_guest":
      return "Per guest";

    case "per_hour":
      return "Per hour";

    case "per_unit":
      return "Per unit";

    case "custom_quote":
      return "Custom quote";
  }
}

function priceLabel(
  pricingType: AddonPricingType,
): string {
  switch (pricingType) {
    case "fixed":
      return "Price";

    case "per_guest":
      return "Price per guest";

    case "per_hour":
      return "Price per hour";

    case "per_unit":
      return "Price per unit";

    case "custom_quote":
      return "Price";
  }
}