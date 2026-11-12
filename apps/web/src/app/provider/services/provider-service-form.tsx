"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import {
  ADDON_PRICING_TYPES,
  type AddonPricingType,
  type ServiceCategoryCode,
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
  uploadServicePortfolioPhoto,
  type ProviderServiceImage,
} from "@/lib/provider/provider-media-client";
import type {
  ServiceCategoryOption,
} from "@/lib/service-categories/service-category-service";

import {parseFreelanceServiceDetails, readFreelanceServiceDetails, supportsServicePackageDetails, type FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import {phpFormatter} from "@/components/shared/price-display";
import {FreelanceServiceSummary} from "@/components/shared/freelance-service-summary";
import {ServicePortfolioFields, type PortfolioDraftPhoto} from "./service-portfolio-fields";
import {FreelanceServiceFields} from "./freelance-service-fields";

type ProviderServiceFormProps = {
  isFreelancer?: boolean;
  serviceCategories:
  readonly ServiceCategoryCode[];
  serviceCategoryOptions:
    readonly ServiceCategoryOption[];

  initialService?: ProviderService;
  inDialog?: boolean;
  onSubmittingChange?: (submitting: boolean) => void;

  onSaved: () => void | Promise<void>;
  onCancel: () => void;
};

export function ProviderServiceForm({
  isFreelancer,
  serviceCategories,
  serviceCategoryOptions,
  initialService,
  inDialog = false,
  onSubmittingChange,
  onSaved,
  onCancel,
}: ProviderServiceFormProps) {
  const fieldId = useId();
  const [photos, setPhotos] = useState<PortfolioDraftPhoto[]>(initialService?.portfolio?.photos ?? []);
  const [coverAssetId, setCoverAssetId] = useState(initialService?.portfolio?.coverAssetId ?? null);
  const [portfolioProgress, setPortfolioProgress] = useState("");
  const usePortfolio = isFreelancer && (photos.length > 0 || Boolean(initialService?.portfolio?.photos.length));
  const [freelanceDetails, setFreelanceDetails] = useState<FreelanceServiceDetails>(() =>
    initialService?.freelanceDetails ?? {deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: []});
  const editing =
    initialService !== undefined;

  const selectableServiceCategories =
    useMemo(
      () =>
        serviceCategoryOptions
          .filter(
            (item) =>
              item.status === "active" ||
              (
                editing &&
                item.code ===
                  initialService?.category
              ),
          )
          .sort((left, right) =>
            left.name.localeCompare(
              right.name,
              undefined,
              {sensitivity: "base"},
            ),
          ),
      [
        editing,
        initialService?.category,
        serviceCategoryOptions,
      ],
    );

  const activeServiceCategoryCodes =
    useMemo(
      () =>
        serviceCategoryOptions
          .filter(
            (item) =>
              item.status === "active",
          )
          .map((item) => item.code),
      [serviceCategoryOptions],
    );

  const [name, setName] =
    useState(
      initialService?.name ?? "",
    );

  const [description, setDescription] =
    useState(
      initialService?.description ?? "",
    );

  const [category, setCategory] =
  useState<ServiceCategoryCode>(
    initialService?.category ??
      activeServiceCategoryCodes[0] ??
      "",
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

  const showPackageDetails = supportsServicePackageDetails(isFreelancer ? "individual" : undefined, category);
  const media = category === "photographer" || category === "videographer";
  const freelancePreview = showPackageDetails ? readFreelanceServiceDetails(freelanceDetails) : null;

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
        return name.trim() ? "Service name must be between 2 and 160 characters." : "Enter a service name.";
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

      const categoryIsActive =
        activeServiceCategoryCodes.includes(
          category,
        );

      const keepingExistingCategory =
        editing &&
        category === initialService?.category;

      if (
        !categoryIsActive &&
        !keepingExistingCategory
      ) {
        return "Select an active service category.";
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

      if (usePortfolio && photos.some((photo) => !photo.altText.trim())) {
        return "Add a short image description for every portfolio photo.";
      }
      if (showPackageDetails) {
        try {
          parseFreelanceServiceDetails(freelanceDetails);
        } catch (error) {
          return (error as Error).message;
        }
      }
      return null;
    }, [
      showPackageDetails,
      usePortfolio,
      photos,
      freelanceDetails,
      category,
      description,
      name,
      parsedPrice,
      pricingType,
      serviceCategories,
      activeServiceCategoryCodes,
      editing,
      initialService?.category,
    ]);

  const invalidCoverage = freelanceDetails.coverageMinutes !== undefined && (!Number.isSafeInteger(freelanceDetails.coverageMinutes) || freelanceDetails.coverageMinutes < 1 || freelanceDetails.coverageMinutes > 1440);
  const invalidCrewSize = freelanceDetails.crewSize !== undefined && (!Number.isSafeInteger(freelanceDetails.crewSize) || freelanceDetails.crewSize < 1 || freelanceDetails.crewSize > 100);
  const validationField = (validationError?.startsWith("Service name") || validationError === "Enter a service name.") ? "name"
    : validationError?.startsWith("Service description") ? "description"
    : validationError?.includes("service category") ? "category"
    : validationError?.includes("pricing type") ? "pricing"
    : validationError?.includes("service price") ? "price"
    : showPackageDetails && invalidCoverage ? "coverage"
    : showPackageDetails && invalidCrewSize ? "crewSize" : null;
  const fieldError = (field: string) => validationField === field ? validationError ?? undefined : undefined;

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
    onSubmittingChange?.(true);
    setError(null);

    let nextServiceImage =
      serviceImage;

    let uploadedForNewService =
      false;

    try {
      if (usePortfolio) {
        for (const [index, photo] of photos.entries()) {
          if (!photo.file || photo.uploaded) continue;
          setPortfolioProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
          try {
            const uploadError = await uploadServicePortfolioPhoto(serviceId, photo.id, photo.file);
            if (uploadError) {
              setError(`Photo ${index + 1} could not be uploaded. ${uploadError}`);
              return;
            }
            setPhotos((current) => current.map((item) => item.id === photo.id ? {...item, uploaded: true} : item));
          } catch {
            setError(`Photo ${index + 1} could not be uploaded. Save again to retry.`);
            return;
          }
        }
      }
      if (selectedImageFile && !usePortfolio) {
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
        editing && !usePortfolio &&
        initialService.imagePublicId !== "" &&
        !selectedImageFile &&
        nextServiceImage === null;

      const input: ProviderServiceInput = {
        ...(editing ? {expectedRevision: initialService.revision ?? 0} : {}),
        ...(usePortfolio ? {portfolio: {coverAssetId, photos: photos.map(({id, altText}) => ({id, altText}))}} : {}),
        ...(showPackageDetails ? {freelanceDetails: parseFreelanceServiceDetails(freelanceDetails)} : {}),
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
          usePortfolio ? "" : nextServiceImage?.url ?? "",

        imagePublicId:
          usePortfolio ? "" : nextServiceImage?.publicId ?? "",
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
      const backendNeedsUpdate = caught instanceof Error &&
        /^Unknown field: (freelanceDetails|portfolio|expectedRevision)\.?$/.test(caught.message);

      if (!backendNeedsUpdate) {
        console.error(
          editing ? "[FEASTA update service]" : "[FEASTA create service]",
          caught,
        );
      }

      if (uploadedForNewService) {
        await deleteProviderServiceImage(
          serviceId,
        ).catch(() => undefined);
      }

      if (backendNeedsUpdate) {
        setError("Your changes are still in this form. The FEASTA server needs an update before it can save this package.");
        return;
      }

      setError(
        editing
          ? "The service could not be updated. Please review the details and try again."
          : "The service could not be created. Please review the details and try again.",
      );
    } finally {
      setUploadingImage(false);
      setPortfolioProgress("");
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }
  return (
    <form
      onSubmit={handleSubmit}
      className={inDialog ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "grid gap-6"}
      aria-busy={submitting || uploadingImage}
    >
      <div className={inDialog ? "grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto overscroll-contain p-6" : "grid gap-6"}>
      {showPackageDetails ? <div><h3 className="font-semibold">About Your Service</h3><p className="mt-1 text-sm text-muted-foreground">{media ? "Add your service details, what's included, and how customers will receive their photos or videos." : "Add your service details, what's included, and how customers will receive your work."}</p></div> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Service name"
          error={fieldError("name")}
          required
        >
          <Input
            placeholder={media ? "e.g., Wedding Photography Package" : "e.g., Wedding Event Service"}
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
          error={fieldError("category")}
          id={`${fieldId}-category`}
          required
        >
          <select
            id={`${fieldId}-category`}
            aria-invalid={Boolean(fieldError("category")) || undefined}
            aria-describedby={fieldError("category") ? `${fieldId}-category-error` : undefined}
            required
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value,
              )
            }
            className="h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {selectableServiceCategories.map(
              (item) => (
                <option
                  key={item.code}
                  value={item.code}
                >
                  {item.name}
                  {item.status === "discontinued"
                    ? " (Discontinued)"
                    : ""}
                </option>
              ),
            )}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Pricing type"
          error={fieldError("pricing")}
          id={`${fieldId}-pricing`}
          required
        >
          <select
            id={`${fieldId}-pricing`}
            aria-invalid={Boolean(fieldError("pricing")) || undefined}
            aria-describedby={fieldError("pricing") ? `${fieldId}-pricing-error` : undefined}
            required
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
            className="h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            error={fieldError("price")}
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
        error={fieldError("description")}
        label={showPackageDetails ? "Short description" : "Description"}
        description="Tell customers what makes your service special."
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

      {showPackageDetails ? <FreelanceServiceFields category={category} value={freelanceDetails} onChange={setFreelanceDetails} /> : null}

      <section aria-labelledby={fieldId + "-portfolio"} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 id={fieldId + "-portfolio"} className="font-semibold">Show Your Work</h3>
        <p className="text-sm text-muted-foreground">Upload photos of your previous events so customers can see your work.</p>
        {isFreelancer ? <ServicePortfolioFields photos={photos} coverAssetId={coverAssetId} disabled={submitting}
          onChange={(next, cover) => {setPhotos(next); setCoverAssetId(cover);}} /> : null}
        {portfolioProgress ? <p role="status" className="text-sm">{portfolioProgress}</p> : null}
        {!usePortfolio ? <details open={!isFreelancer || Boolean(serviceImage || selectedImageFile)}>
          <summary className="cursor-pointer text-sm font-semibold">
            {isFreelancer ? "Use one photo instead of a gallery" : "Manage cover photo"}
          </summary>
          <div className="mt-3">
            <FormField label="Cover photo" id={`${fieldId}-image`}>
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
                      Choose the photo customers will see first on your listing.
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
                      id={`${fieldId}-image`}
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
          </div>
        </details> : null}
      </section>

      {freelancePreview ? <section className="rounded-lg border border-border p-4">
        <h3 className="font-semibold">Customer preview</h3>
        {name.trim() ? <p className="mt-2 font-medium">{name.trim()}</p> : null}
        <p className="text-sm text-muted-foreground">
          {pricingType === "custom_quote" ? "Request a quote" :
            price.trim() && parsedPrice !== null && Number.isFinite(parsedPrice)
              ? priceLabel(pricingType) + " · " + phpFormatter.format(parsedPrice)
              : "Enter a price to preview it."}
        </p>
        <FreelanceServiceSummary details={freelancePreview} />
      </section> : null}

      {validationError && !validationField ? (
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

      </div>

      <div className={inDialog ? "flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-6 py-4" : "flex flex-wrap justify-end gap-3"}>
        {!inDialog ? <Button
        type="button"
        variant="secondary"
        disabled={
          submitting ||
          uploadingImage
        }
        onClick={onCancel}
        >
        Cancel
        </Button> : null}

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
