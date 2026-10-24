"use client";

import {
  useMemo,
  useRef,
  useState,
} from "react";

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
  createProviderPackage,
  updateProviderPackage,
  type ProviderPackage,
  type ProviderPackageInput,
  type ProviderPackagePaymentPolicy,
} from "@/lib/provider/provider-package-client";

import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import {packageImageDrafts} from "@/lib/provider/catalog-media";

import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";
import {DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS, depositRateBpsToPercentage, type ProviderPackagePaymentPolicyBounds} from "@/lib/provider/provider-package-payment-policy";

import {foodInclusionsError, parsePackageDishes} from "@/lib/provider/package-food-inclusions";
import {providerPackageSaveError} from "@/lib/provider/provider-package-save-error";
import {packagePreviewGuestCount} from "@/lib/provider/package-pricing-preview";
import {ProviderPackagePricePreview} from "./provider-package-price-preview";
import {ProviderPackageReview} from "./provider-package-review";
import {ProviderPackageFoodMenu} from "./provider-package-food-menu";
import {Textarea} from "@/components/ui/textarea";
import {Select} from "@/components/ui/select";
import {
  ProviderPackageOfferBuilder,
  createProviderPackageOfferDraft,
  serializeProviderPackageOfferDraft,
  uploadProviderPackageThemeImages,
  type ProviderPackageOfferDraft,
} from "./provider-package-offer-builder";

const EVENT_TYPES = [
  "birthday",
  "wedding",
  "anniversary",
  "reunion",
  "corporate",
  "baptism",
  "graduation",
  "other",
] as const;

type ProviderPackageFormProps = {
  dialogLayout?: boolean;
  providerServiceType?: string;
  serviceCategories?: readonly string[];
  packageCategoryOptions: readonly {
    code: string;
    name: string;
  }[];
  eventTypesSupported: string[];
  minGuestsPerEvent: number;
  maxGuestsPerEvent: number;

  paymentPolicyBounds?:
    ProviderPackagePaymentPolicyBounds;

  initialPackage?: ProviderPackage;

  onSaved: () => void | Promise<void>;
  onCancel: () => void;
  onSubmittingChange?: (busy: boolean) => void;
};

export function ProviderPackageForm({
  dialogLayout = false,
  providerServiceType = "catering",
  serviceCategories = [],
  packageCategoryOptions,
  eventTypesSupported,
  minGuestsPerEvent,
  maxGuestsPerEvent,

  paymentPolicyBounds = DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS,
  initialPackage,
  onSaved,
  onCancel,
  onSubmittingChange,
}: ProviderPackageFormProps) {
  const [step, setStep] = useState(0);
  const [previewGuestCount, setPreviewGuestCount] = useState("");
  const [previewTier, setPreviewTier] = useState("");
  const scrollContainer = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [pricingModel, setPricingModel] = useState<"per_pax" | "per_bundle" | "legacy">(initialPackage ? initialPackage.pricingModel ?? "legacy" : "per_pax");
  const steps = ["Basic details", "Pricing & capacity", "Food menu", "Services & media", "Review & save"];
  function goToStep(next: number) {
    setStep(next);
    setError(null);
    requestAnimationFrame(() => {
      stepHeading.current?.focus({preventScroll: true});
      if (scrollContainer.current) scrollContainer.current.scrollTop = 0;
    });
  }
  const capabilities = providerContentCapabilities(providerServiceType, serviceCategories);

  const editing =
    initialPackage !== undefined;

  const [
    serviceCategoryCode,
    setServiceCategoryCode,
  ] = useState(
    initialPackage?.serviceCategoryCode ??
      "",
  );
  const availableEventTypes =
    useMemo(
        () =>
        EVENT_TYPES.filter(
            (eventType) =>
            eventTypesSupported.includes(
                eventType,
            ),
        ),
        [eventTypesSupported],
    );
  const [name, setName] =
    useState(
      initialPackage?.name ?? "",
    );

  const [
    description,
    setDescription,
  ] = useState(
    initialPackage?.description ?? "",
  );

  const [eventType, setEventType] =
    useState<string>(
      initialPackage?.eventType ??
        availableEventTypes[0] ??
        "",
    );

  const [
    minimumGuests,
    setMinimumGuests,
  ] = useState(
    initialPackage
      ? String(
          initialPackage.minimumGuests,
        )
      : "",
  );

  const [
    maximumGuests,
    setMaximumGuests,
  ] = useState(
    initialPackage
      ? String(
          initialPackage.maximumGuests,
        )
      : "",
  );

  const [
    foodInclusions,
    setFoodInclusions,
  ] = useState(
    initialPackage?.foodInclusions ?? [],
  );

  const [
    decorInclusionsText,
    setDecorInclusionsText,
  ] = useState(
    initialPackage?.decorInclusions.join(
      "\n",
    ) ?? "",
  );

  const [
    furnitureInclusionsText,
    setFurnitureInclusionsText,
  ] = useState(
    initialPackage?.furnitureInclusions.join(
      "\n",
    ) ?? "",
  );

  const [
    serviceInclusionsText,
    setServiceInclusionsText,
  ] = useState(
    initialPackage?.serviceInclusions.join(
      "\n",
    ) ?? "",
  );

  const minimumDepositPercentageAllowed = depositRateBpsToPercentage(paymentPolicyBounds.minimumDepositRateBps);
  const maximumDepositPercentageAllowed = depositRateBpsToPercentage(paymentPolicyBounds.maximumDepositRateBps);
  const [paymentPolicy, setPaymentPolicy] = useState<ProviderPackagePaymentPolicy>(initialPackage?.paymentPolicy ?? "full_payment");
  const [depositPercentage, setDepositPercentage] = useState(
    initialPackage?.paymentPolicy === "deposit_then_balance" ? String(initialPackage.depositPercentage) : "",
  );
  const parsedDepositPercentage = depositPercentage.trim() === "" ? Number.NaN : Number(depositPercentage);
  const depositError = paymentPolicy === "deposit_then_balance" && (
    !Number.isFinite(parsedDepositPercentage) || parsedDepositPercentage <= 0 || parsedDepositPercentage >= 100 ||
    parsedDepositPercentage < minimumDepositPercentageAllowed || parsedDepositPercentage > maximumDepositPercentageAllowed
  ) ? `Enter a deposit percentage between ${minimumDepositPercentageAllowed}% and ${maximumDepositPercentageAllowed}%, greater than 0% and below 100%.` : undefined;

  const [images, setImages] = useState(() => packageImageDrafts(initialPackage?.imageUrls, initialPackage?.imageUrl));
  const [offerDraft, setOfferDraft] =
    useState<ProviderPackageOfferDraft>(
      () =>
        createProviderPackageOfferDraft(
          initialPackage,
        ),
    );
  const [offerInteracted, setOfferInteracted] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const offerConfiguration =
    serializeProviderPackageOfferDraft(
      offerDraft,
    );
  const parsedPrice =
    offerConfiguration.startingPrice ??
    Number.NaN;

  const foodError = foodInclusionsError(foodInclusions);

  const validatedPreviewGuests = packagePreviewGuestCount({guestCount: previewGuestCount, minimumGuests, maximumGuests,
    providerMinimumGuests: minGuestsPerEvent, providerMaximumGuests: maxGuestsPerEvent});

  const parsedMinimumGuests =
    Number(minimumGuests);
  const parsedMaximumGuests =
    Number(maximumGuests);

  const validationError =
    useMemo(() => {
      if (
        name.trim().length < 2 ||
        name.trim().length > 120
      ) {
        return {field: "name", message: "Package name must be between 2 and 120 characters."};
      }

      if (
        description.trim().length < 10 ||
        description.trim().length > 2000
      ) {
        return {field: "description", message: "Description must be between 10 and 2000 characters."};
      }

      if (
        !availableEventTypes.includes(
            eventType as
            typeof EVENT_TYPES[number],
        )
        ) {
        return {field: "eventType", message: "Choose an event type supported by your business."};
        }

      if (
        !packageCategoryOptions.some(
          (category) =>
            category.code ===
              serviceCategoryCode,
        )
      ) {
        return {
          field: "serviceCategoryCode",
          message: "Choose an active catering service category for this package.",
        };
      }

      if (
        offerConfiguration.error
      ) {
        return {
          field: "serviceOptions",
          message:
            offerConfiguration.error,
        };
      }

      if (
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > 10_000_000
      ) {
        return {field: "price", message: "Enter a valid package price."};
      }

      if (
        !Number.isInteger(
            parsedMinimumGuests,
        ) ||
        parsedMinimumGuests <
            minGuestsPerEvent ||
        parsedMinimumGuests >
            maxGuestsPerEvent
        ) {
        return {field: "minimumGuests", message: `Minimum guests must be between ${minGuestsPerEvent} and ${maxGuestsPerEvent}.`};
        }

      if (
        !Number.isInteger(
            parsedMaximumGuests,
        ) ||
        parsedMaximumGuests <
            parsedMinimumGuests ||
        parsedMaximumGuests >
            maxGuestsPerEvent
        ) {
        return {field: "maximumGuests", message: `Maximum guests must be between the selected minimum and ${maxGuestsPerEvent}.`};
        }

      return null;
    }, [
      name,
      description,
      eventType,
      offerConfiguration.error,
      parsedPrice,
      parsedMinimumGuests,
      parsedMaximumGuests,
      availableEventTypes,
      packageCategoryOptions,
      serviceCategoryCode,
      minGuestsPerEvent,
      maxGuestsPerEvent,
    ]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (step !== 4 || submitting || validationError || depositError || foodError) {
      return;
    }

    setSubmitting(true);
    onSubmittingChange?.(true);
    setError(null);

    try {
      const uploaded = await uploadCatalogImages(images, (saved) => setImages((current) => current.map((image) => image.id === saved.id ? saved : image)));
      const uploadedThemes =
        await uploadProviderPackageThemeImages(
          offerDraft,
          offerConfiguration,
          (themeId, uploadedImages) =>
            setOfferDraft((current) => ({
              ...current,
              themeOptions:
                current.themeOptions.map(
                  (theme) =>
                    theme.id === themeId
                      ? {
                          ...theme,
                          images:
                            uploadedImages,
                        }
                      : theme,
                ),
            })),
        );
      const input: ProviderPackageInput = {
        ...(pricingModel !== "legacy" ? {pricingModel} : {}),
        name: name.trim(),
        description:
          description.trim(),
        eventType,
        serviceCategoryCode,
        price: parsedPrice,
        serviceOptions:
          offerConfiguration.serviceOptions,
        themeOptions:
          uploadedThemes,

        paymentPolicy,
        depositPercentage: paymentPolicy === "full_payment" ? 100 : parsedDepositPercentage,

        minimumGuests:
          parsedMinimumGuests,
        maximumGuests:
          parsedMaximumGuests,
        imageUrl: uploaded[0]?.url ?? "",
        imageUrls: uploaded.map((image) => image.url),
        foodInclusions: parsePackageDishes(foodInclusions).map((dish) => dish.raw),
        decorInclusions:
          parseInclusions(
            decorInclusionsText,
          ),
        furnitureInclusions:
          parseInclusions(
            furnitureInclusionsText,
          ),
        serviceInclusions:
          parseInclusions(
            serviceInclusionsText,
          ),
      };

      if (editing) {
        await updateProviderPackage(
          initialPackage.id,
          input,
        );
      } else {
        await createProviderPackage(
          input,
        );
      }

      await onSaved();
    } catch (caught) {
      setError(providerPackageSaveError(caught));
    } finally {
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }

  if (
    packageCategoryOptions.length === 0
  ) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
      >
        <p className="font-medium text-foreground">
          Package setup is unavailable
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          Your business does not have an active catering service category available for packages. Update your provider profile before creating or editing a package.
        </p>

        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (
  availableEventTypes.length === 0
) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <p className="font-medium text-foreground">
        Package creation is unavailable
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        Your business does not have any supported event types configured. Update your provider profile before creating a package.
      </p>

      <div className="mt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={dialogLayout ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "min-w-0"}
    >
      <fieldset
        disabled={submitting}
        className={
          dialogLayout
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "grid min-w-0 gap-5"
        }
      >
      <div ref={scrollContainer} role={dialogLayout ? "region" : undefined} aria-label={dialogLayout ? "Package details" : undefined} tabIndex={dialogLayout ? 0 : undefined}
        className={
        dialogLayout
          ? "mx-2 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-3 py-5 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:mx-3"
          : "grid min-w-0 gap-5"
      }>
      <nav aria-label="Package creation progress">
      <ol className="grid grid-cols-5 gap-2">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "rounded-lg bg-primary/10 p-2 text-xs font-bold text-primary-strong" : "rounded-lg bg-muted p-2 text-xs text-muted-foreground"}>{index + 1}<span className="hidden sm:block">{label}</span>
      </li>)}</ol>
      </nav>
      <h3 ref={stepHeading} tabIndex={-1} className="text-lg font-bold focus:outline-none">Step {step + 1}: {steps[step]}</h3>
      <ProviderPackagePricePreview name={name} pricingModel={pricingModel} minimumGuests={minimumGuests}
        maximumGuests={maximumGuests} guestCount={previewGuestCount} onGuestCountChange={setPreviewGuestCount}
        validatedGuestCount={validatedPreviewGuests} selectedTier={previewTier} onTierChange={setPreviewTier} offerDraft={offerDraft} />
      <section hidden={step !== 0} className="space-y-4">
      <FormField label="Pricing model" required>
      <Select value={pricingModel} onChange={(event) => setPricingModel(event.target.value as typeof pricingModel)}>{editing && !initialPackage.pricingModel ? <option value="legacy">Legacy fixed price</option> : null}<option value="per_pax">Per Pax - price per person</option>
      <option value="per_bundle">Per Bundle - fixed price for a guest range</option>
      </Select>
      <p className="text-sm text-muted-foreground">Prices are charged per person for Per Pax. One fixed price covers the package&apos;s guest range for Per Bundle.</p>
      <p className="text-xs text-muted-foreground">Per Pax and Per Bundle drafts cannot be published until customer pricing compatibility is verified.</p>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Package name"
          error={validationError?.field === "name" ? validationError.message : undefined}
          required
        >
          <Input
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            maxLength={120}
            autoComplete="off"
          />
        </FormField>

        <FormField
          label="Event type"
          error={validationError?.field === "eventType" ? validationError.message : undefined}
          required
        >
          <Select
            value={eventType}
            onChange={(event) =>
              setEventType(
                event.target.value,
              )
            }
            className="min-h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {availableEventTypes.map(
            (value) => (
                <option
                  key={value}
                  value={value}
                >
                  {formatEventType(
                    value,
                  )}
                </option>
              ),
            )}
          </Select>
        </FormField>
      </div>

      <FormField
        label="Service category"
        error={
          validationError?.field ===
            "serviceCategoryCode"
            ? validationError.message
            : undefined
        }
        required
      >
        <Select
          value={serviceCategoryCode}
          onChange={(event) =>
            setServiceCategoryCode(
              event.target.value,
            )
          }
          className="min-h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">
            Choose a service category
          </option>

          {packageCategoryOptions.map(
            (category) => (
              <option
                key={category.code}
                value={category.code}
              >
                {category.name}
              </option>
            ),
          )}
        </Select>

        {editing &&
        initialPackage?.serviceCategoryCode ===
          null ? (
          <p className="text-xs leading-5 text-muted-foreground">
            This legacy package does not have a service category yet. Choose one before saving.
          </p>
        ) : null}
      </FormField>

      <FormField
        label="Description"
        error={validationError?.field === "description" ? validationError.message : undefined}
        required
      >
        <Textarea
          value={description}
          onChange={(event) =>
            setDescription(
              event.target.value,
            )
          }
          maxLength={2000}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </FormField>

      </section>
      <section hidden={step !== 1} className="space-y-4">
      <ProviderPackageOfferBuilder
        section="pricing"
        priceUnit={pricingModel === "per_pax" ? "per person" : "fixed package price"}
        value={offerDraft}
        onChange={(next) => {
          setOfferInteracted(true);
          setOfferDraft(next);
        }}
        disabled={submitting}
        error={
          offerInteracted &&
          validationError?.field ===
            "serviceOptions"
            ? validationError.message
            : undefined
        }
        legacyNotice={
          editing &&
          Object.keys(
            initialPackage.serviceOptions,
          ).length === 0
            ? "This legacy package remains readable, but you must configure at least one service tier before saving changes."
            : undefined
        }
      />
      <h3 className="text-sm font-bold uppercase text-primary-strong">Pricing &amp; capacity</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Starting price"
          error={validationError?.field === "price" ? validationError.message : undefined}
          required
        >
          <Input
            type="number"
            value={
              Number.isFinite(parsedPrice)
                ? parsedPrice
                : ""
            }
            readOnly
            aria-describedby="package-starting-price-help"
          />
          <p
            id="package-starting-price-help"
            className="text-xs text-muted-foreground"
          >
            Automatically set to the lowest enabled service-tier price.
          </p>
        </FormField>

        <div className="grid gap-4 sm:col-span-2">
          <FormField label="Payment terms" required>
            <Select value={paymentPolicy} onChange={(event) => {
              const value = event.target.value;
              if (value === "full_payment" || value === "deposit_then_balance") setPaymentPolicy(value);
            }}>
              <option value="full_payment">Full Payment</option>
              <option value="deposit_then_balance">Deposit + Remaining Balance</option>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {paymentPolicy === "full_payment"
                ? "Customers pay the full amount after you accept their booking request."
                : "Customers can pay the required deposit first and must pay the remaining balance 24 hours before the scheduled event start."}
            </p>
          </FormField>
          {paymentPolicy === "deposit_then_balance" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Deposit required (%)" error={depositError} required
                description={`Current FEASTA policy allows ${minimumDepositPercentageAllowed}%–${maximumDepositPercentageAllowed}%.`}>
                <Input type="number" min={minimumDepositPercentageAllowed} max={maximumDepositPercentageAllowed}
                  step="any" value={depositPercentage} onChange={(event) => setDepositPercentage(event.target.value)} />
              </FormField>
              <div className="grid content-start gap-2 text-sm">
                <p className="font-semibold">Remaining balance deadline</p>
                <p>24 hours before the scheduled event start</p>
                <p className="text-muted-foreground">FEASTA automatically sets the remaining balance deadline based on the Customer&apos;s event date and start time.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Minimum guests"
          error={validationError?.field === "minimumGuests" ? validationError.message : undefined}
          required
        >
          <Input
            type="number"
            min={minGuestsPerEvent}
            max={maxGuestsPerEvent}
            step="1"
            value={minimumGuests}
            onChange={(event) =>
              setMinimumGuests(
                event.target.value,
              )
            }
          />
        </FormField>

        <FormField
          label="Maximum guests"
          error={validationError?.field === "maximumGuests" ? validationError.message : undefined}
          required
        >
          <Input
            type="number"
            min={
                parsedMinimumGuests >=
                minGuestsPerEvent
                ? parsedMinimumGuests
                : minGuestsPerEvent
            }
            max={maxGuestsPerEvent}
            step="1"
            value={maximumGuests}
            onChange={(event) =>
              setMaximumGuests(
                event.target.value,
              )
            }
          />
        </FormField>
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        Your business is configured for{" "}
        <span className="font-medium text-foreground">
            {minGuestsPerEvent}–
            {maxGuestsPerEvent} guests
        </span>{" "}
        per event.
        </p>

      </section>
      <section hidden={step !== 2} className="space-y-4"><ProviderPackageFoodMenu value={foodInclusions} onChange={setFoodInclusions} /><p className="text-sm text-muted-foreground">All listed dishes are package inclusions. Customer-configurable category counts and substitutions are unavailable until booking support is verified.</p></section>
      <section hidden={step !== 3} className="space-y-4">
      <ProviderPackageOfferBuilder section="themes" value={offerDraft} onChange={setOfferDraft} disabled={submitting} />
      <section aria-label="Images" className="grid gap-3"><h3 className="text-sm font-bold uppercase text-primary-strong">Images</h3>
        <CatalogImageUploader images={images} onChange={setImages} disabled={submitting} />
      </section>



      <section aria-label="Optional inclusions" className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="text-sm font-bold uppercase text-primary-strong">Optional inclusions</h3>
      <p className="mt-1 text-sm text-muted-foreground">Optional — add inclusions to help customers understand what this package covers. Every inclusion field is optional.</p></div>

      {capabilities.decorations ? <InclusionTextarea
        label="Decoration inclusions"
        value={decorInclusionsText}
        onChange={
          setDecorInclusionsText
        }
      /> : null}

      {capabilities.furniture ? <InclusionTextarea
        label="Furniture inclusions"
        value={
          furnitureInclusionsText
        }
        onChange={
          setFurnitureInclusionsText
        }
      /> : null}

      <InclusionTextarea
        label="Service inclusions"
        value={serviceInclusionsText}
        onChange={
          setServiceInclusionsText
        }
      />
      </section>

      </section>
      <div hidden={step !== 4}>
        <ProviderPackageReview name={name} description={description} eventType={eventType}
          serviceCategory={packageCategoryOptions.find((category) => category.code === serviceCategoryCode)?.name ?? ""}
          pricingModel={pricingModel} minimumGuests={minimumGuests} maximumGuests={maximumGuests}
          serviceOptions={offerConfiguration.serviceOptions} food={foodInclusions} decor={decorInclusionsText}
          furniture={furnitureInclusionsText} services={serviceInclusionsText} offerDraft={offerDraft}
          images={images} paymentPolicy={paymentPolicy} depositPercentage={depositPercentage}
          previewGuestCount={validatedPreviewGuests} />
      </div>
      </div>
      <div className={dialogLayout ? "grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4 sm:px-6" : "grid gap-3"}>
      {step === 4 && (validationError || depositError || foodError) ? <p role="alert" className="text-sm text-destructive">{validationError?.message || depositError || foodError}</p> : null}
      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 [&>button]:flex-1 sm:[&>button]:flex-none">
        <Button
          type="button"
          variant="secondary"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </Button>

        {step > 0 ? <Button type="button" variant="secondary" onClick={() => goToStep(step - 1)}>Back</Button> : null}
        {step < 4 ? <Button type="button" onClick={() => {
          const fields = step === 0 ? ["name", "description", "eventType", "serviceCategoryCode"] : step === 1 ? ["price", "minimumGuests", "maximumGuests", "serviceOptions"] : step === 3 ? ["serviceOptions"] : [];
          const pricingError = step === 1 ? serializeProviderPackageOfferDraft({...offerDraft, themeOptions: []}).error : null;
          const guestError = step === 1 && (!Number.isInteger(parsedMinimumGuests) || !Number.isInteger(parsedMaximumGuests) || parsedMinimumGuests < minGuestsPerEvent || parsedMaximumGuests > maxGuestsPerEvent || parsedMaximumGuests < parsedMinimumGuests) ? "Enter a guest range within your business capacity." : null;
          const message = (step === 2 ? foodError : null) || pricingError || guestError || (validationError && fields.includes(validationError.field) && !(step === 1 && validationError.field === "serviceOptions") ? validationError.message : null) || (step === 1 ? depositError : null);
          if (message) { setError(message); return; }
          goToStep(step + 1);
        }}>Next</Button> : <Button
          type="submit"
          disabled={
            submitting ||
            Boolean(
              validationError,
            ) || Boolean(depositError) || Boolean(foodError)
          }
          loading={submitting}
          loadingLabel={
            editing
              ? "Saving changes"
              : "Creating package"
          }
        >
          {editing
          ? "Save changes"
          : "Create draft package"}
        </Button>}
      </div>
      </div>
      </fieldset>
    </form>
  );
}

function InclusionTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
}) {
  const count =
    parseInclusions(value).length;

  return (
    <div className="grid gap-2">
        <FormField label={label}>
        <Textarea
            value={value}
            onChange={(event) =>
            onChange(
                event.target.value,
            )
            }
            rows={3}
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Enter one inclusion per line"
        />
        </FormField>

        <p className="text-xs text-muted-foreground">
        {count}/50 items. Enter one item per line.
        </p>
    </div>
    );
}

function parseInclusions(
  value: string,
): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

function formatEventType(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}
