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
import {ProviderPackageReview} from "./provider-package-review";
import {ProviderPackageFoodMenu} from "./provider-package-food-menu";
import {OccasionRequestDialog} from "@/components/provider/occasion-request-dialog";
import {packageOccasionChoices, type PackageOccasionOptions} from "@/lib/provider/package-occasion-options";
import {X} from "lucide-react";
import {Textarea} from "@/components/ui/textarea";
import {Select} from "@/components/ui/select";
import {
  ProviderPackageOfferBuilder,
  createProviderPackageOfferDraft,
  serializeProviderPackageOfferDraft,
  uploadProviderPackageThemeImages,
  type ProviderPackageOfferDraft,
} from "./provider-package-offer-builder";

type ProviderPackageFormProps = {
  occasionCatalog?: PackageOccasionOptions | null;
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
  occasionCatalog,
  minGuestsPerEvent,
  maxGuestsPerEvent,

  paymentPolicyBounds = DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS,
  initialPackage,
  onSaved,
  onCancel,
  onSubmittingChange,
}: ProviderPackageFormProps) {
  const [step, setStep] = useState(0);
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
      (packageCategoryOptions.length === 1 ? packageCategoryOptions[0].code : ""),
  );
  const occasionOptions = packageOccasionChoices(occasionCatalog, serviceCategoryCode);
  const availableEventTypes = occasionOptions.map((option) => option.id);
  const occasionLabel = (id: string) => occasionCatalog?.options.find((option) => option.id === id)?.label ?? formatEventType(id);
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

  const [selectedOccasions, setSelectedOccasions] = useState<string[]>(() => {
    const initial = initialPackage?.eventType ?? availableEventTypes[0];
    return initial ? [initial] : [];
  });
  const [occasionScope, setOccasionScope] = useState<"specific" | "all">("specific");
  const [occasionToAdd, setOccasionToAdd] = useState("");
  const occasionSelector = useRef<HTMLSelectElement>(null);
  // The legacy writer accepts exactly one supported eventType. Never pick a
  // primary occasion from a multi-selection or discard the other chips on save.
  const eventType = selectedOccasions.length === 1 ? selectedOccasions[0] : "";
  // Retain only the existing scalar scope when the V2 read configuration is
  // unavailable. This does not add choices or authorize a new scope; the legacy
  // callable still checks current ownership, capabilities and draft status.
  const retainingLegacyScope = !occasionCatalog && initialPackage?.status === "draft" &&
    occasionScope === "specific" && selectedOccasions.length === 1 &&
    eventType === initialPackage.eventType && serviceCategoryCode === initialPackage.serviceCategoryCode &&
    eventTypesSupported.includes(eventType);
  const occasionError = retainingLegacyScope ? undefined : !occasionCatalog
    ? "Approved occasion choices are unavailable. Reload before saving."
    : occasionScope === "all" ? undefined
    : !selectedOccasions.length || selectedOccasions.some((id) => !availableEventTypes.includes(id))
      ? "Add one occasion supported by your business before continuing."
      : selectedOccasions.length > occasionCatalog.maxSpecificOccasions
        ? `Choose at most ${occasionCatalog.maxSpecificOccasions} approved occasions.` : undefined;
  const occasionSaveGate = occasionScope === "all" || selectedOccasions.length > 1
    ? "Multiple occasions and Fits All cannot be saved until the V2 package writer is verified. These selections stay in this open wizard only."
    : eventType && !eventTypesSupported.includes(eventType)
      ? "This approved occasion requires the V2 package writer before it can be saved." : undefined;

  function addOccasion() {
    if (!availableEventTypes.some((value) => value === occasionToAdd)) return;
    setOccasionScope("specific");
    setSelectedOccasions((current) => occasionScope === "all" ? [occasionToAdd] : current.includes(occasionToAdd) ? current : [...current, occasionToAdd]);
    setOccasionToAdd("");
    setError(null);
    occasionSelector.current?.focus();
  }

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

      if (occasionError) {
        return {field: "eventType", message: occasionError};
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
      occasionError,
      offerConfiguration.error,
      parsedPrice,
      parsedMinimumGuests,
      parsedMaximumGuests,
      packageCategoryOptions,
      serviceCategoryCode,
      minGuestsPerEvent,
      maxGuestsPerEvent,
    ]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (step !== 4 || submitting || occasionSaveGate || occasionError || validationError || depositError || foodError) {
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
      <nav aria-label="Package creation progress" className={dialogLayout ? "shrink-0 border-b border-border px-5 py-3 sm:px-6" : undefined}>
      <ol className="grid grid-cols-5 gap-2">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "rounded-lg bg-primary/10 p-2 text-xs font-bold text-primary-strong" : "rounded-lg bg-muted p-2 text-xs text-muted-foreground"}>{index + 1}<span className="hidden sm:block">{label}</span>
      </li>)}</ol>
      </nav>
      <div ref={scrollContainer} role={dialogLayout ? "region" : undefined} aria-label={dialogLayout ? "Package details" : undefined} tabIndex={dialogLayout ? 0 : undefined}
        className={
        dialogLayout
          ? "mx-2 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:mx-3"
          : "grid min-w-0 gap-5"
      }>
      <h3 ref={stepHeading} tabIndex={-1} className="text-lg font-bold focus:outline-none">Step {step + 1}: {steps[step]}</h3>
      <section hidden={step !== 0} className="space-y-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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

        <FormField label="Suitable occasions" required error={occasionError} className="min-w-0">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <Select ref={occasionSelector} value={occasionToAdd} required={false}
              onChange={(event) => setOccasionToAdd(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); addOccasion(); }
              }}>
              <option value="">Choose an approved occasion</option>
              {availableEventTypes.map((value) => (
                <option key={value} value={value} disabled={occasionScope === "specific" && selectedOccasions.includes(value)}>{occasionLabel(value)}{occasionScope === "specific" && selectedOccasions.includes(value) ? " (selected)" : ""}</option>
              ))}
            </Select>
            <Button type="button" variant="secondary" aria-label="Add selected occasion"
              disabled={!availableEventTypes.some((value) => value === occasionToAdd) || (occasionScope === "specific" && selectedOccasions.includes(occasionToAdd))}
              onClick={addOccasion}>Add</Button>
          </div>
          <Button type="button" variant="secondary" aria-pressed={occasionScope === "all"}
            disabled={!occasionCatalog || !availableEventTypes.length}
            onClick={() => { setOccasionScope("all"); setSelectedOccasions([]); setOccasionToAdd(""); setError(null); }}>Fits All Occasions</Button>
          {occasionScope === "all" ? <ul aria-label="Selected occasions"><li>Fits All Occasions <Button type="button" variant="ghost" aria-label="Remove Fits All Occasions" onClick={() => setOccasionScope("specific")}>Remove</Button></li></ul> : null}
          <OccasionRequestDialog />
          <p className="text-xs text-muted-foreground">Fits All requires approval for every active occasion applicable to this category. Future catalog changes require server revalidation.</p>
          {retainingLegacyScope ? <p className="text-sm text-muted-foreground">Approved occasion choices are unavailable. You can save this draft with its existing occasion and category; changing either requires reloading the approved choices.</p> : null}
          {occasionSaveGate ? <p role="status" className="text-sm text-muted-foreground">{occasionSaveGate}</p> : null}
          {selectedOccasions.length > 0 ? (
            <ul aria-label="Selected occasions" className="flex flex-wrap gap-2">
              {selectedOccasions.map((value) => (
                <li key={value} className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2.5 text-xs font-semibold text-primary-strong">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{occasionLabel(value)}{retainingLegacyScope ? " (retained legacy occasion)" : availableEventTypes.some((allowed) => allowed === value) ? "" : " (no longer supported)"}</span>
                  <Button type="button" variant="ghost" className="h-[30px] min-h-[30px] w-8 min-w-8 shrink-0 self-start rounded-full p-0" aria-label={`Remove ${occasionLabel(value)} occasion`}
                    onClick={() => {
                      setSelectedOccasions((current) => current.filter((item) => item !== value));
                      setError(null);
                      occasionSelector.current?.focus();
                    }}><X aria-hidden="true" className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
          ) : null}
        </FormField>

      <FormField
        className="min-w-0 sm:col-start-1"
        label="Service category"
        error={
          validationError?.field ===
            "serviceCategoryCode"
            ? validationError.message
            : undefined
        }
        required
      >
        {packageCategoryOptions.length === 1 && serviceCategoryCode === packageCategoryOptions[0].code ? (
          <Input readOnly value={packageCategoryOptions[0].name} />
        ) : <Select
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
        </Select>}

        {packageCategoryOptions.length === 1 && serviceCategoryCode === packageCategoryOptions[0].code ? <p className="text-xs text-muted-foreground">This is your authorized service category.</p> : null}
        {editing &&
        initialPackage?.serviceCategoryCode ===
          null ? (
          <p className="text-xs leading-5 text-muted-foreground">
            This legacy package does not have a service category yet. Choose one before saving.
          </p>
        ) : null}
      </FormField>

      </div>

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
      <FormField label="Pricing model" required>
      <Select value={pricingModel} onChange={(event) => setPricingModel(event.target.value as typeof pricingModel)}>{editing && !initialPackage.pricingModel ? <option value="legacy">Legacy fixed price</option> : null}<option value="per_pax">Per Pax - price per person</option>
      <option value="per_bundle">Per Bundle - fixed price for a guest range</option>
      </Select>
      <p className="text-sm text-muted-foreground">Prices are charged per person for Per Pax. One fixed price covers the package&apos;s guest range for Per Bundle.</p>
      <p className="text-xs text-muted-foreground">Per Pax and Per Bundle drafts cannot be published until customer pricing compatibility is verified.</p>
      </FormField>
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
      <section aria-label="Payment and starting price" className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
      <h4 className="text-sm font-bold uppercase text-primary-strong">Payment terms</h4>
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

      </section>
      <section aria-label="Guest capacity" className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
      <h4 className="text-sm font-bold uppercase text-primary-strong">Guest capacity</h4>
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

      </section>
      <section hidden={step !== 2} className="space-y-4"><ProviderPackageFoodMenu value={foodInclusions} onChange={setFoodInclusions} /><p className="text-sm text-muted-foreground">All listed dishes are package inclusions. Customer-configurable category counts and substitutions are unavailable until booking support is verified.</p></section>
      <section hidden={step !== 3} className="space-y-4">
      <ProviderPackageOfferBuilder section="themes" value={offerDraft} onChange={setOfferDraft} disabled={submitting} />
      <section aria-label="Images" className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"><h3 className="text-sm font-bold uppercase text-primary-strong">Package images</h3>
        <CatalogImageUploader images={images} onChange={setImages} disabled={submitting} />
      </section>



      <section aria-label="Optional inclusions" className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
      <div className="sm:col-span-2"><h3 className="text-sm font-bold uppercase text-primary-strong">Optional inclusions</h3>
      <p className="mt-1 text-sm text-muted-foreground">Optional — add inclusions to help customers understand what this package covers. Every inclusion field is optional. These shared inclusions apply across enabled tiers; separate tier decorations, furniture, and equipment are unavailable in this editor.</p></div>

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
        <ProviderPackageReview name={name} description={description} eventType={occasionScope === "all" ? "Fits All Occasions" : selectedOccasions.map(occasionLabel).join(", ")}
          serviceCategory={packageCategoryOptions.find((category) => category.code === serviceCategoryCode)?.name ?? ""}
          pricingModel={pricingModel} minimumGuests={minimumGuests} maximumGuests={maximumGuests}
          serviceOptions={offerConfiguration.serviceOptions} food={foodInclusions} decor={decorInclusionsText}
          furniture={furnitureInclusionsText} services={serviceInclusionsText} offerDraft={offerDraft}
          images={images} paymentPolicy={paymentPolicy} depositPercentage={depositPercentage}
          />
      </div>
      </div>
      <div className={dialogLayout ? "grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4 sm:px-6" : "grid gap-3"}>
      {step === 4 && (validationError || depositError || foodError) ? <p role="alert" className="text-sm text-destructive">{validationError?.message || depositError || foodError}</p> : null}
      {error && !(step === 0 && error === occasionError) ? (
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
            submitting || Boolean(occasionSaveGate) ||
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
    <div className="grid content-start gap-2 rounded-xl border border-border bg-background p-3">
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
