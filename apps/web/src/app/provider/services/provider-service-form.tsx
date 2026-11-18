"use client";
import {offerNameError, offerNameKey, offerDescriptionError, serviceGuestLimitsError} from "@/lib/provider/provider-offer-policy";
import {ServicePriceInput} from "./service-price-input";
import {parseServicePriceText, servicePriceError} from "@/lib/provider/provider-service-price";

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
  existingServices?: readonly Pick<ProviderService,"id"|"name"|"isDeleted">[];
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
  existingServices = [],
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
  const simplePackage = media && showPackageDetails && !editing;
  const freelancePreview = showPackageDetails ? readFreelanceServiceDetails(freelanceDetails) : null;

  const [priceInputError,setPriceInputError]=useState<string | undefined>();
  const [minimumGuestText,setMinimumGuestText]=useState(String(initialService?.minimumGuests ?? ""));
  const [maximumGuestText,setMaximumGuestText]=useState(String(initialService?.maximumGuests ?? ""));
  const nameValidation=offerNameError(name) || (existingServices.some((item) => item.id!==initialService?.id && !item.isDeleted && offerNameKey(item.name)===offerNameKey(name)) ? "You already have a package with this name." : null);
  const descriptionValidation=offerDescriptionError(description);
  const guestValidation=serviceGuestLimitsError(pricingType,Number(minimumGuestText),Number(maximumGuestText));
  const parsedPrice =
    pricingType === "custom_quote"
      ? null
      : parseServicePriceText(price,pricingType);

  const validationError =
    useMemo(() => {
      if (nameValidation) return nameValidation;
      if (descriptionValidation) return descriptionValidation;
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

      if (
        !categoryIsActive
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

      if (pricingType !== "custom_quote" && priceInputError) return priceInputError;
      if (
        pricingType !== "custom_quote" &&
        (
          parsedPrice === null ||
          !Number.isFinite(parsedPrice) ||
          parsedPrice < 0 ||
          parsedPrice > 9_999_999
        )
      ) {
        return !price.trim() ? "Enter a service price." : servicePriceError(pricingType);
      }

      if (guestValidation) return guestValidation;
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
      nameValidation, descriptionValidation, guestValidation, priceInputError,
      showPackageDetails,
      usePortfolio,
      photos,
      freelanceDetails,
      category,
      parsedPrice,
      price,
      pricingType,
      serviceCategories,
      activeServiceCategoryCodes,
    ]);

  const invalidCoverage = freelanceDetails.coverageMinutes !== undefined && (!Number.isSafeInteger(freelanceDetails.coverageMinutes) || freelanceDetails.coverageMinutes < 1 || freelanceDetails.coverageMinutes > 1440);
  const invalidCrewSize = freelanceDetails.crewSize !== undefined && (!Number.isSafeInteger(freelanceDetails.crewSize) || freelanceDetails.crewSize < 1 || freelanceDetails.crewSize > 100);
  const validationField = validationError && validationError===nameValidation ? "name"
    : validationError && validationError===descriptionValidation ? "description"
    : validationError && validationError===guestValidation ? "guests"
    : validationError?.includes("service category") ? "category"
    : validationError?.includes("pricing type") ? "pricing"
    : validationError && (validationError===priceInputError || /price/i.test(validationError)) ? "price"
    : showPackageDetails && invalidCoverage ? "coverage"
    : showPackageDetails && invalidCrewSize ? "crewSize" : null;
  const fieldError = (field: string) => {
    if (field==="name") return error?.includes("You already have a package with this name.")
      ? "You already have a package with this name." : nameValidation ?? undefined;
    if (field==="description") return descriptionValidation ?? undefined;
    if (field==="guests") return guestValidation ?? undefined;
    if (field==="price" && pricingType!=="custom_quote") return priceInputError ||
      (!price.trim()?"Enter a service price.":parsedPrice===null?servicePriceError(pricingType):undefined);
    return validationField===field ? validationError ?? undefined : undefined;
  };
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
      if (guestValidation) return guestValidation;
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
        minimumGuests: pricingType==="per_guest" ? Number(minimumGuestText) : null,
        maximumGuests: pricingType==="per_guest" ? Number(maximumGuestText) : null,

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
        /^Unknown field: (freelanceDetails|portfolio|expectedRevision|minimumGuests|maximumGuests)\.?$/.test(caught.message);

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

      if (caught instanceof Error && caught.message.includes("You already have a package with this name.")) {
        setError("You already have a package with this name.");
        return;
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
  const portfolioFields = (
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
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={inDialog ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "grid gap-6"}
      aria-busy={submitting || uploadingImage}
    >
      <div className={inDialog ? "grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto overscroll-contain p-6" : "grid gap-6"}>
      {showPackageDetails && !simplePackage ? <div><h3 className="font-semibold">About Your Service</h3><p className="mt-1 text-sm text-muted-foreground">{media ? "Add your service details, what's included, and how customers will receive their photos or videos." : "Add your service details, what's included, and how customers will receive your work."}</p></div> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label={simplePackage ? "Package name" : "Service name"}
          className="relative" labelClassName="pr-20"
          error={fieldError("name")}
          required
        >
          <Input
            onInput={() => setError(null)}
            placeholder={media ? "e.g., Wedding Photography Package" : "e.g., Wedding Event Service"}
            value={name}
            onChange={(event) =>
              (setError(null), setName(event.target.value))
            }
            maxLength={80}
            autoComplete="off"
          />
          <span className="absolute right-0 top-0 text-xs tabular-nums text-muted-foreground">{name.length} / 80</span>
        </FormField>

        <FormField
          label={simplePackage ? "Package type" : "Service category"}
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

              setPriceInputError(undefined);
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
            <ServicePriceInput value={price} onChange={(next,error) => {setPrice(next);setPriceInputError(error);}} />
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
        label={simplePackage ? "About this package (optional)" : showPackageDetails ? "Short description" : "Description"}
        description={`${description.length} / 500`}
      >
        <Textarea
          value={description}
          onChange={(event) =>
            setDescription(
              event.target.value,
            )
          }
          maxLength={500}
          rows={simplePackage ? 2 : 5}
        />
      </FormField>

      {pricingType==="per_guest" && <fieldset className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" aria-label="Guest capacity">
        <FormField label="Minimum guests" required error={fieldError("guests")}><Input type="text" inputMode="numeric" value={minimumGuestText} onChange={(event) => {if (/^\d{0,5}$/u.test(event.target.value)) setMinimumGuestText(event.target.value);}} /></FormField>
        <FormField label="Maximum guests" required><Input type="text" inputMode="numeric" value={maximumGuestText} onChange={(event) => {if (/^\d{0,5}$/u.test(event.target.value)) setMaximumGuestText(event.target.value);}} /></FormField>
      </fieldset>}
      {showPackageDetails ? <FreelanceServiceFields simplePackage={simplePackage} category={category} value={freelanceDetails} onChange={setFreelanceDetails} /> : null}

      {simplePackage ? <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-semibold">Portfolio photos (optional)</summary>
        {portfolioFields}
      </details> : portfolioFields}

      {freelancePreview && !simplePackage ? <section className="rounded-lg border border-border p-4">
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

      {error && !error.includes("You already have a package with this name.") ? (
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
