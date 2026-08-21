"use client";

import {
  useEffect,
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
import {
  deleteProviderServiceImage,
  uploadProviderServiceImage,
  type ProviderServiceImage,
} from "@/lib/provider/provider-media-client";

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

  const [serviceId] =
    useState(
      () =>
        initialService?.id ??
        crypto.randomUUID(),
    );

  const [serviceImage, setServiceImage] =
    useState<ProviderServiceImage | null>(
      initialService?.imageUrl &&
      initialService.imagePublicId
        ? {
            url:
              initialService.imageUrl,

            publicId:
              initialService.imagePublicId,
          }
        : null,
    );

  const [
    selectedImageFile,
    setSelectedImageFile,
  ] = useState<File | null>(null);

  const imagePreviewUrl =
    useMemo(
      () =>
        selectedImageFile
          ? URL.createObjectURL(
              selectedImageFile,
            )
          : null,
      [
        selectedImageFile,
      ],
    );

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(
          imagePreviewUrl,
        );
      }
    };
  }, [
    imagePreviewUrl,
  ]);

  const [uploadingImage, setUploadingImage] =
    useState(false);

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

      return null;
    }, [
      category,
      description,
      name,
      parsedPrice,
      pricingType,
      serviceCategories,
    ]);

  function handleImageChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const allowedTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);

    if (!allowedTypes.has(file.type)) {
      setError(
        "Choose a JPEG, PNG, or WebP image.",
      );
      return;
    }

    if (
      file.size <= 0 ||
      file.size >
        5 * 1024 * 1024
    ) {
      setError(
        "The service image must be no larger than 5 MB.",
      );
      return;
    }

    setError(null);
    setSelectedImageFile(file);
  }

  function handleRemoveImage() {
    setSelectedImageFile(null);
    setServiceImage(null);
    setError(null);
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      submitting ||
      uploadingImage ||
      validationError
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    let nextServiceImage =
      serviceImage;

    let uploadedForNewService =
      false;

    try {
      if (selectedImageFile) {
        setUploadingImage(true);

        nextServiceImage =
          await uploadProviderServiceImage(
            serviceId,
            selectedImageFile,
          );

        uploadedForNewService =
          !editing;
      }

      const removingExistingImage =
        editing &&
        initialService.imagePublicId !== "" &&
        !selectedImageFile &&
        nextServiceImage === null;

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
          nextServiceImage?.url ?? "",

        imagePublicId:
          nextServiceImage?.publicId ?? "",
      };

      if (editing) {
        await updateProviderService(
          initialService.id,
          input,
        );
      } else {
        await createProviderService(
          serviceId,
          input,
        );
      }

      if (removingExistingImage) {
        await deleteProviderServiceImage(
          serviceId,
        ).catch((caught) => {
          console.error(
            "[FEASTA service image cleanup]",
            caught,
          );
        });
      }

      await onSaved();
    } catch (caught) {
      console.error(
        editing
          ? "[FEASTA update service]"
          : "[FEASTA create service]",
        caught,
      );

      if (uploadedForNewService) {
        await deleteProviderServiceImage(
          serviceId,
        ).catch(() => undefined);
      }

      setError(
        editing
          ? "The service could not be updated. Please review the details and try again."
          : "The service could not be created. Please review the details and try again.",
      );
    } finally {
      setUploadingImage(false);
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

      <FormField label="Service image">
        <div className="grid gap-3">
          {imagePreviewUrl || serviceImage ? (
            <div className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  imagePreviewUrl ??
                  serviceImage?.url ??
                  ""
                }
                alt=""
                className="h-48 w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Add a photo that clearly represents this service.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              {selectedImageFile ||
                serviceImage
                  ? "Replace image"
                  : "Upload image"}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={
                  submitting ||
                  uploadingImage
                }
                onChange={handleImageChange}
              />
            </label>

            {imagePreviewUrl || serviceImage ? (
              <Button
                type="button"
                variant="secondary"
                disabled={
                  submitting ||
                  uploadingImage
                }
                onClick={handleRemoveImage}
              >
                Remove
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP. Maximum 5 MB.
          </p>
        </div>
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
        disabled={
          submitting ||
          uploadingImage
        }
        onClick={onCancel}
        >
        Cancel
        </Button>

        <Button
          type="submit"
          disabled={
            submitting ||
            uploadingImage ||
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