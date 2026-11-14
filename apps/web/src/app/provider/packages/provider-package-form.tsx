"use client";
import {ProviderPackageMoneyInput} from "./provider-package-money-input";
import {ProviderPackageIntegerInput, isPackageIntegerEdit} from "./provider-package-integer-input";
import {usePackageConfirmation} from "./use-package-confirmation";

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

import {packageV2Enabled, createV2PackageDraft, updateV2PackageDraft,
  completeV2PackageProgress, hasPendingV2Draft, retryPendingV2Draft} from "@/lib/provider/provider-package-v2-client";
import type {CreateProviderPackageV2Request, FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";
import {ProviderPackageFoodChoices} from "./provider-package-food-choices";
import {
  ProviderPackageIndividualFood,
  type IndividualFoodDraftV2,
} from "./provider-package-individual-food";
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
import {
  savePackageProgress, packageProgressError, packageEditorProgressEnabled,
  type SavedEditorDraft, type EditorProgress,
} from "@/lib/provider/provider-package-progress";
import {Textarea} from "@/components/ui/textarea";
import {Select} from "@/components/ui/select";
import {
  ProviderPackageOfferBuilder,
  createProviderPackageOfferDraft,
  serializeProviderPackageOfferDraft,
  tierExtraInclusions,
  uploadProviderPackageThemeImages,
  type ProviderPackageOfferDraft,
} from "./provider-package-offer-builder";

type PackageStructure = "" | "fixed" | "customizable" | "individual";

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
  initialEditorProgress?: SavedEditorDraft | null;
  onProgressSaved?: (draft: SavedEditorDraft) => void;
  onProgressExit?: () => void;

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
  initialEditorProgress,
  onProgressSaved,
  onProgressExit,
  onSaved,
  onCancel,
  onSubmittingChange,
}: ProviderPackageFormProps) {
  const {confirm, confirmationDialog} = usePackageConfirmation();
  const [pendingV2, setPendingV2] = useState(() => hasPendingV2Draft());
  const [draftSaved, setDraftSaved] = useState(false);
  const [step, setStep] = useState(initialEditorProgress?.currentStep ?? 0);
  const [savedProgress, setSavedProgress] = useState<SavedEditorDraft | null>(initialEditorProgress ?? null);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  // Preserve the same request ID on an ambiguous network failure, so retries
  // cannot create a second private draft for an identical payload.
  const pendingProgress = useRef<{signature: string; key: string} | null>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [pricingModel, setPricingModel] = useState<"per_pax" | "per_bundle" | "legacy">(initialEditorProgress?.progress.pricingModel ?? (initialPackage ? initialPackage.pricingModel ?? "legacy" : "per_pax"));
  const [offerStructure, setOfferStructure] = useState<PackageStructure>(
    initialEditorProgress?.progress.offerStructure ??
      initialPackage?.offerStructure ?? initialPackage?.v2?.offerStructure ?? "",
  );
  const usesV2 = initialPackage ? Boolean(initialPackage.v2) :
    packageV2Enabled || offerStructure === "fixed" || offerStructure === "customizable";
  const [packageStyle, setPackageStyle] = useState(
    initialEditorProgress?.progress.packageStyle ??
      initialPackage?.packageStyle ?? initialPackage?.v2?.packageStyle ?? "",
  );
  const steps = ["Package details", "Pricing & capacity", "Food menu", "Services & media", "Review & save"];
  function goToStep(next: number) {
    if (!Number.isInteger(next) || next < 0 || next > 4) return;
    setStep(next as 0 | 1 | 2 | 3 | 4);
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
    initialEditorProgress?.progress.serviceCategoryCode ?? initialPackage?.serviceCategoryCode ??
      (packageCategoryOptions.length === 1 ? packageCategoryOptions[0].code : ""),
  );
  const occasionOptions = packageOccasionChoices(occasionCatalog, serviceCategoryCode);
  const availableEventTypes = occasionOptions.map((option) => option.id);
  const occasionLabel = (id: string) => occasionCatalog?.options.find((option) => option.id === id)?.label ?? formatEventType(id);
  const [name, setName] =
    useState(
      initialEditorProgress?.progress.name ?? initialPackage?.name ?? "",
    );

  const [
    description,
    setDescription,
  ] = useState(
    initialEditorProgress?.progress.description ?? initialPackage?.description ?? "",
  );

  const [selectedOccasions, setSelectedOccasions] = useState<string[]>(() => {
    if (initialEditorProgress?.progress.occasion) {
      return initialEditorProgress.progress.occasion.occasionIds ?? [];
    }
    if (initialPackage?.v2) return initialPackage.v2.occasionIds;
    const initial = initialPackage?.eventType;
    return initial ? [initial] : [];
  });
  const [occasionScope, setOccasionScope] = useState<"specific" | "all">(initialEditorProgress?.progress.occasion?.occasionScope ?? initialPackage?.v2?.occasionScope ?? "specific");
  const [occasionToAdd, setOccasionToAdd] = useState("");
  const occasionSelector = useRef<HTMLSelectElement>(null);
  // The legacy writer accepts exactly one supported eventType. Never pick a
  // primary occasion from a multi-selection or discard the other chips on save.
  const eventType = selectedOccasions.length === 1 ? selectedOccasions[0] : "";
  // Retain only the existing scalar scope when the V2 read configuration is
  // unavailable. This does not add choices or authorize a new scope; the legacy
  // callable still checks current ownership, capabilities and draft status.
  const retainingLegacyScope = !usesV2 && !occasionCatalog && initialPackage?.status === "draft" &&
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
  const occasionSaveGate = usesV2 ? undefined : occasionScope === "all" || selectedOccasions.length > 1
    ? "Multiple occasions and Fits All cannot create a real package until the V2 writer is verified. Use Save progress to keep unfinished selections where enabled."
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

  const [guestInputErrors, setGuestInputErrors] = useState<{minimum?: string; maximum?: string}>({});
  const guestCapacityLimit = Math.min(maxGuestsPerEvent, 400);

  const [
    minimumGuests,
    setMinimumGuests,
  ] = useState(
    initialEditorProgress?.progress.minimumGuestsText ?? (initialPackage
      ? String(
          initialPackage.minimumGuests,
        )
      : ""),
  );

  const [
    maximumGuests,
    setMaximumGuests,
  ] = useState(
    initialEditorProgress?.progress.maximumGuestsText ?? (initialPackage
      ? String(
          initialPackage.maximumGuests,
        )
      : ""),
  );

  const [
    foodInclusions,
    setFoodInclusions,
  ] = useState(
    initialEditorProgress?.progress.foodInclusions ?? initialPackage?.foodInclusions ?? [],
  );

  const [foodChoiceGroups, setFoodChoiceGroups] = useState<FoodChoiceGroupV2[]>(
    initialEditorProgress?.progress.foodChoiceGroups ?? initialPackage?.v2?.foodChoiceGroups ?? [],
  );

  // The Web package currently resolves older generated shared declarations.
  // This local type mirrors the current private progress source contract.
  const restoredIndividualFoodDraft = (
    initialEditorProgress?.progress as
      (EditorProgress & {individualFoodDraft?: IndividualFoodDraftV2}) | undefined
  )?.individualFoodDraft;

  const [individualFoodDraft, setIndividualFoodDraft] = useState<IndividualFoodDraftV2>(
    () => restoredIndividualFoodDraft ?? {
      id: "individual_item",
      name: "",
      servingOptions: [],
    },
  );

  const [
    decorInclusionsText,
    setDecorInclusionsText,
  ] = useState(
    initialEditorProgress?.progress.decorInclusions?.join("\n") ?? initialPackage?.decorInclusions.join(
      "\n",
    ) ?? "",
  );

  const [
    furnitureInclusionsText,
    setFurnitureInclusionsText,
  ] = useState(
    initialEditorProgress?.progress.furnitureInclusions?.join("\n") ?? initialPackage?.furnitureInclusions.join(
      "\n",
    ) ?? "",
  );

  const [
    serviceInclusionsText,
    setServiceInclusionsText,
  ] = useState(
    initialEditorProgress?.progress.serviceInclusions?.join("\n") ?? initialPackage?.serviceInclusions.join(
      "\n",
    ) ?? "",
  );

  const minimumDepositPercentageAllowed = depositRateBpsToPercentage(paymentPolicyBounds.minimumDepositRateBps);
  const maximumDepositPercentageAllowed = depositRateBpsToPercentage(paymentPolicyBounds.maximumDepositRateBps);
  const [paymentPolicy, setPaymentPolicy] = useState<ProviderPackagePaymentPolicy>(initialEditorProgress?.progress.paymentPolicy ?? initialPackage?.paymentPolicy ?? "full_payment");
  const [depositPercentage, setDepositPercentage] = useState(
    initialEditorProgress?.progress.depositPercentageText ?? (initialPackage?.paymentPolicy === "deposit_then_balance" ? String(initialPackage.depositPercentage) : ""),
  );
  const parsedDepositPercentage = depositPercentage.trim() === "" ? Number.NaN : Number(depositPercentage);
  const depositError = paymentPolicy === "deposit_then_balance" && (
    !Number.isFinite(parsedDepositPercentage) || parsedDepositPercentage <= 0 || parsedDepositPercentage >= 100 ||
    parsedDepositPercentage < minimumDepositPercentageAllowed || parsedDepositPercentage > maximumDepositPercentageAllowed
  ) ? `Enter a deposit percentage between ${minimumDepositPercentageAllowed}% and ${maximumDepositPercentageAllowed}%, greater than 0% and below 100%.` : undefined;

  const [images, setImages] = useState(() => packageImageDrafts(initialPackage?.imageUrls, initialPackage?.imageUrl));
  const [offerDraft, setOfferDraft] =
    useState<ProviderPackageOfferDraft>(
      () => {
        const draft = createProviderPackageOfferDraft(initialPackage?.v2 ?
          {...initialPackage, serviceOptions: initialPackage.v2.serviceOptions} : initialPackage);
        const progress = initialEditorProgress?.progress;
        if (progress?.tiers) {
          for (const tier of ["drop_off", "buffet_setup", "full_service"] as const) {
            const saved = progress.tiers[tier];
            if (saved) {
              draft.serviceOptions[tier] = {
                enabled: saved.enabled,
                price: saved.priceText,
                includedServicesText: saved.includedServices.join("\n"),
                decorInclusionsText: saved.decorInclusions.join("\n"),
                furnitureInclusionsText: saved.furnitureInclusions.join("\n"),
                equipmentInclusionsText: saved.equipmentInclusions.join("\n"),
              };
            }
          }
        }
        if (progress?.themes) {
          draft.themeOptions = progress.themes.map((theme) => ({
            id: theme.editorThemeId, name: theme.name, description: theme.description, images: [],
          }));
        }
        return draft;
      },
    );
  const [offerInteracted, setOfferInteracted] =
    useState(false);

  const submissionPending = useRef(false);
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

  // Preserve existing V2 fixed-package choice groups.
  // Do not send unsupported food-selection contracts to the legacy writer.
  const foodStructureError =
    offerStructure === "individual"
      ? "Individual Food Item requires serving-size, quantity, and pricing contracts before saving."
      : offerStructure === "customizable" && !usesV2
        ? "This draft has no saved V2 contract. Keep its details for reviewed recovery; the current editor cannot convert it in place or safely save customer food selections."
        : offerStructure === "customizable" && foodChoiceGroups.length === 0
          ? "Add at least one customer-selectable food group for this customizable package."
          : null;

  const foodError = (!usesV2 && foodChoiceGroups.length ? "Return to Customizable Package to save the food-choice groups, or remove them before changing structure." : null) || foodStructureError || foodInclusionsError(foodInclusions) || (usesV2 ? (() => {
    try {parseFoodChoiceGroupsV2(foodChoiceGroups); return null;}
    catch {return "Complete each food-choice group with a title, valid options, and a possible selection count.";}
  })() : null);

  // Keep invalid or incomplete guest counts invalid.
  // Number("") would otherwise incorrectly become zero.
  const parseGuestCount = (value: string): number => {
    if (!value || !isPackageIntegerEdit(value, guestCapacityLimit)) return Number.NaN;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
  };

  const parsedMinimumGuests =
    parseGuestCount(minimumGuests);
  const parsedMaximumGuests =
    parseGuestCount(maximumGuests);

  const validationError =
    useMemo(() => {
      if (guestInputErrors.minimum) return {field: "minimumGuests", message: guestInputErrors.minimum};
      if (guestInputErrors.maximum) return {field: "maximumGuests", message: guestInputErrors.maximum};
      if (
        name.trim().length < 2 ||
        name.trim().length > (usesV2 ? 80 : 120)
      ) {
        return {field: "name", message: `Package name must be between 2 and ${usesV2 ? 80 : 120} characters.`};
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
        (usesV2 ? parsedPrice <= 0 : parsedPrice < 0) ||
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
            guestCapacityLimit
        ) {
        return {field: "minimumGuests", message: `Minimum guests must be between ${minGuestsPerEvent} and ${guestCapacityLimit}.`};
        }

      if (
        !Number.isInteger(
            parsedMaximumGuests,
        ) ||
        parsedMaximumGuests <
            parsedMinimumGuests ||
        parsedMaximumGuests >
            guestCapacityLimit
        ) {
        return {field: "maximumGuests", message: `Maximum guests must be between the selected minimum and ${guestCapacityLimit}.`};
        }

      return null;
    }, [
      usesV2,
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
      guestInputErrors,
      guestCapacityLimit,
    ]);


  function packageClassificationError(): string | null {
    // Historical legacy packages remain editable without new metadata.
    // New packages and any partially classified package require both fields.
    const historicalUnclassified =
      editing &&
      !usesV2 &&
      !initialPackage?.offerStructure &&
      !initialPackage?.packageStyle &&
      !offerStructure &&
      !packageStyle.trim();

    if (historicalUnclassified) return null;

    if (!offerStructure) {
      return "Choose a package structure.";
    }

    const style = packageStyle.trim();

    if ([...style].length < 2 || [...style].length > 80) {
      return "Enter a package style between 2 and 80 characters.";
    }

    if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(style)) {
      return "Remove unsupported characters from the package style.";
    }

    return null;
  }

  async function persistProgress(): Promise<SavedEditorDraft> {
      const tiers: NonNullable<EditorProgress["tiers"]> = {};
      for (const tier of ["drop_off", "buffet_setup", "full_service"] as const) {
        const value = offerDraft.serviceOptions[tier];
        tiers[tier] = {
          enabled: value.enabled,
          priceText: value.price,
          includedServices: parseInclusions(value.includedServicesText),
          ...tierExtraInclusions(value),
        };
      }
      const progress: EditorProgress = {
        name, description, serviceCategoryCode,
        ...(offerStructure ? {offerStructure} : {}),
        ...(packageStyle.trim() ?
          {packageStyle: packageStyle.trim()} : {}),
        occasion: {occasionSchemaVersion: 2, occasionScope,
          occasionIds: occasionScope === "all" ? [] : selectedOccasions},
        pricingModel, minimumGuestsText: minimumGuests, maximumGuestsText: maximumGuests,
        tiers, foodInclusions, ...(usesV2 || foodChoiceGroups.length ? {foodChoiceGroups} : {}),
        ...(usesV2 && offerStructure === "individual" ?
          {individualFoodDraft} : {}),
        serviceInclusions: parseInclusions(serviceInclusionsText),
        decorInclusions: parseInclusions(decorInclusionsText),
        furnitureInclusions: parseInclusions(furnitureInclusionsText),
        equipmentInclusions: initialEditorProgress?.progress.equipmentInclusions ?? [],
        themes: offerDraft.themeOptions.map((theme) => ({
          editorThemeId: theme.id, name: theme.name,
          description: theme.description, assetIds: [],
        })),
        marketingAssetIds: [], paymentPolicy,
        depositPercentageText: depositPercentage,
      };
      const input = {
        editorDraftId: savedProgress?.editorDraftId ?? null,
        expectedRevision: savedProgress?.revision ?? 0,
        currentStep: step as 0 | 1 | 2 | 3 | 4,
        progress,
      };
      const signature = JSON.stringify(input);
      if (pendingProgress.current?.signature !== signature) {
        pendingProgress.current = {signature, key: crypto.randomUUID()};
      }
      const saved = await savePackageProgress({
        ...input, idempotencyKey: pendingProgress.current.key,
      });
      pendingProgress.current = null;
      setSavedProgress(saved);
      onProgressSaved?.(saved);
      return saved;
  }

  async function handleSaveProgress(): Promise<void> {
    if (editing || submitting || progressSaving) return;
    // The current server deliberately rejects unverified or unattached media.
    // Do not create a misleading "saved" acknowledgement for media not recoverable.
    if (images.length > 0 || offerDraft.themeOptions.some((theme) => theme.images.length > 0)) {
      setProgressError("Save Progress & Exit cannot preserve selected package or theme images yet. Remove these image selections before saving unfinished progress, or use a supported package-save flow when your package is ready.");
      return;
    }
    setProgressSaving(true);
    onSubmittingChange?.(true);
    setProgressError(null);
    let saved = false;
    try {
      await persistProgress();
      saved = true;
    } catch (caught) {
      setProgressError(packageProgressError(caught));
    } finally {
      setProgressSaving(false);
      onSubmittingChange?.(false);
    }
    if (saved) onProgressExit?.();
  }

  async function handleSavePackageDraft() {
    if (step !== 4 || submissionPending.current || submitting || occasionSaveGate || occasionError || validationError || depositError || foodError ||
      offerConfiguration.error || packageClassificationError()) {
      return;
    }
    // The final network mutation is an independent, explicit user decision.
    // A fast second click on Next must not silently create a private package.
    if (usesV2 && !await confirm({
      message: editing ? "Confirm saving these changes to your private package draft?" : "Create private package draft?",
      supportingText: editing ? undefined : "Your package will be saved as a private draft. It will not be published or visible to customers. You can review and edit your package later.",
      confirmLabel: editing ? "Save changes" : "Create Draft",
    })) return;
    if (submissionPending.current || submitting || draftSaved) return;



    submissionPending.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    setError(null);

    try {
      if (usesV2 && savedProgress) {
        if (images.length || offerDraft.themeOptions.some((theme) => theme.images.length)) {
          throw new Error("PROGRESS_MEDIA_UNSUPPORTED");
        }
        const saved = await persistProgress();
        await completeV2PackageProgress({editorDraftId:saved.editorDraftId, expectedRevision:saved.revision,
          expectedPackageRevision:null, idempotencyKey:crypto.randomUUID()});
        setDraftSaved(true);
        await onSaved();
        return;
      }
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
        ...(offerStructure ? {offerStructure} : {}),
        ...(packageStyle.trim() ? {packageStyle: packageStyle.trim()} : {}),
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

      if (usesV2) {
        const {eventType: _eventType, ...fields} = input;
        void _eventType;
        const serviceOptions = Object.fromEntries(Object.entries(fields.serviceOptions).map(([tier, option]) => [tier, {
          ...option,
          ...tierExtraInclusions(offerDraft.serviceOptions[tier as keyof typeof offerDraft.serviceOptions]),
        }]));
        const v2: CreateProviderPackageV2Request = {...fields, serviceOptions,
          equipmentInclusions: initialPackage?.v2?.equipmentInclusions ?? initialEditorProgress?.progress.equipmentInclusions ?? [],
          ...(offerStructure ? {offerStructure} : {}),
          ...(packageStyle.trim() ? {packageStyle: packageStyle.trim()} : {}),
          ...(foodChoiceGroups.length ? {foodChoiceGroups: parseFoodChoiceGroupsV2(foodChoiceGroups)} : {}),
          sharedContractVersion:2, offerSchemaVersion:2, occasionSchemaVersion:2,
          occasionScope, occasionIds:occasionScope === "all" ? [] : selectedOccasions,
          idempotencyKey:crypto.randomUUID()};
        if (initialPackage?.v2) await updateV2PackageDraft({...v2, packageId:initialPackage.id,
          expectedRevision:initialPackage.v2.revision});
        else await createV2PackageDraft(v2);
        setDraftSaved(true);
      } else if (editing) {
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
      setPendingV2(usesV2 && hasPendingV2Draft());
      setError(caught instanceof Error && caught.message === "PROGRESS_MEDIA_UNSUPPORTED"
        ? "Saved progress cannot attach images yet. Remove images before completing this progress draft."
        : providerPackageSaveError(caught));
    } finally {
      submissionPending.current = false;
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
      // Only the explicit save button may request confirmation. Native form
      // submission must never turn a navigation click into a save action.
      onSubmit={(event) => event.preventDefault()}
      className={dialogLayout ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "min-w-0"}
    >
      {confirmationDialog}
      <fieldset
        disabled={submitting || progressSaving || pendingV2 || draftSaved}
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
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <h4 className="font-semibold">Tell us about your package</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Start with a clear package name, choose suitable occasions,
            and describe what customers can expect.
            You will set prices, add food, and configure services
            in the next steps.
          </p>
        </div>
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
            maxLength={usesV2 ? 80 : 120}
            autoComplete="off"
            placeholder="e.g., Busog Na Set or Wedding Buffet Package"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use a name customers can easily recognize.
            You can add the menu details in Step 3.
          </p>
        </FormField>

        <FormField label="Suitable occasions" required error={occasionError} className="min-w-0">
          <p className="mb-2 text-xs leading-5 text-muted-foreground">
            Choose an approved occasion, then click Add.
            You can add more than one if your business is eligible.
          </p>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <Select ref={occasionSelector} value={occasionToAdd} required={false}
              onChange={(event) => setOccasionToAdd(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
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
          <p className="text-xs leading-5 text-muted-foreground">
            Cannot find the occasion you need? Use Request an Occasion.
            Requests are reviewed separately and do not grant immediate approval.
          </p>
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
        <p className="mb-2 text-xs leading-5 text-muted-foreground">
          Select the service category your business is authorized to offer.
          If only one category is approved, it is already selected.
        </p>
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

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField label="Package structure" required>
              <Select
                value={offerStructure}
                onChange={(event) =>
                  setOfferStructure(event.target.value as PackageStructure)
                }
              >
                <option value="">Choose package structure</option>
                <option value="fixed">Fixed Package</option>
                <option value="customizable">Customizable Package</option>
                {/* Keep restored records readable without offering this structure for creation. */}
                {offerStructure === "individual" ? (
                  <option value="individual" disabled>Individual Food Item</option>
                ) : null}
              </Select>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Classifies this offer. Customer checkout follows
                existing supported booking rules.
              </p>
            </FormField>

            <FormField label="Package style" required>
              <Input
                value={packageStyle}
                onChange={(event) => setPackageStyle(event.target.value)}
                maxLength={80}
                autoComplete="off"
                placeholder="e.g., Grazing Table, Bilao, Packed Meals"
              />
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Enter your own catering style.
                There is no predefined style list.
              </p>
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
          placeholder="Describe your package, what makes it special, and who it is suitable for."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Keep this easy to understand. Exact dishes, quantities,
          prices, and service inclusions belong in the next steps.
        </p>
      </FormField>

      </section>
      <section hidden={step !== 1} className="space-y-4">
      <FormField label="Pricing model" required>
      <Select value={pricingModel} onChange={(event) => setPricingModel(event.target.value as typeof pricingModel)}>{editing && !initialPackage.pricingModel ? <option value="legacy">Legacy fixed price</option> : null}<option value="per_pax">Per Pax - price per person</option>
      <option value="per_bundle">Per Bundle - fixed price for a guest range</option>
      </Select>
      <p className="text-sm text-muted-foreground">Prices are charged per person for Per Pax. One fixed price covers the package&apos;s guest range for Per Bundle.</p>
      <p className="text-xs text-muted-foreground">{usesV2
        ? "Save a valid V2 draft before publishing. Publication also requires current provider eligibility and server approval."
        : "This draft has no saved V2 contract. Review and retain its details; conversion requires a reviewed recovery before publishing."}</p>
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
          <ProviderPackageMoneyInput
            value={Number.isFinite(parsedPrice) ? String(parsedPrice) : ""}
            readOnly
            onChange={() => {}}
            description="Automatically set to the lowest enabled service-tier price."
          />
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
          <ProviderPackageIntegerInput minimum={minGuestsPerEvent} maximum={guestCapacityLimit}
              value={minimumGuests} onChange={(value, minimum) => {setMinimumGuests(value); setGuestInputErrors((errors) => ({...errors, minimum}));}} />
        </FormField>

        <FormField
          label="Maximum guests"
          error={validationError?.field === "maximumGuests" ? validationError.message : undefined}
          required
        >
          <ProviderPackageIntegerInput minimum={Number.isSafeInteger(parsedMinimumGuests) ? Math.max(minGuestsPerEvent, parsedMinimumGuests) : minGuestsPerEvent} maximum={guestCapacityLimit}
              value={maximumGuests} onChange={(value, maximum) => {setMaximumGuests(value); setGuestInputErrors((errors) => ({...errors, maximum}));}} />
        </FormField>
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        Your business is configured for{" "}
        <span className="font-medium text-foreground">
            {minGuestsPerEvent}–
            {guestCapacityLimit} guests
        </span>{" "}
        per event.
        </p>
      </section>

      </section>
      <section hidden={step !== 2} className="space-y-4">
        {offerStructure === "fixed" ? (
          <p className="text-sm text-muted-foreground">
            Fixed package: list included dishes. Where supported,
            you can also offer optional customer food selections
            without changing the fixed package pricing model.
          </p>
        ) : null}
        {offerStructure === "customizable" ? (
          <p className="text-sm text-muted-foreground">
            Customizable package: list dishes included for every
            customer, then configure the dishes customers must select.
          </p>
        ) : null}
        {offerStructure === "individual" ? (
          <div className="grid gap-4">
            <p role="status" className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
              Individual food items can be edited in private progress.
              Final package saving and customer booking remain unavailable.
            </p>
            <ProviderPackageIndividualFood
              value={individualFoodDraft}
              onChange={setIndividualFoodDraft}
              disabled={submitting || progressSaving}
            />
          </div>
        ) : (
          <ProviderPackageFoodMenu
            value={foodInclusions}
            onChange={setFoodInclusions}
          />
        )}
        {usesV2 && offerStructure !== "individual" ? (
          <ProviderPackageFoodChoices
            value={foodChoiceGroups}
            onChange={setFoodChoiceGroups}
            disabled={submitting || progressSaving}
          />
        ) : null}
        {foodError ? <p role="alert" className="text-sm text-destructive">{foodError}</p> : null}
      </section>
      <section hidden={step !== 3} className="space-y-4">
      <ProviderPackageOfferBuilder section="themes" value={offerDraft} onChange={setOfferDraft} disabled={submitting} />
      <ProviderPackageOfferBuilder section="tier-inclusions" value={offerDraft}
        onChange={setOfferDraft} disabled={submitting} />
      <section aria-label="Images" className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"><h3 className="text-sm font-bold uppercase text-primary-strong">Package images</h3>
        <CatalogImageUploader images={images} onChange={setImages} disabled={submitting} />
        <p className="text-xs text-muted-foreground">
          Images selected here remain in this editing session until a
          supported package save uploads them. Save Progress &amp; Exit
          does not preserve package or theme images yet.
          Remove image selections before saving unfinished progress.
        </p>
      </section>



      <section aria-label="Optional inclusions" className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
      <div className="sm:col-span-2"><h3 className="text-sm font-bold uppercase text-primary-strong">Optional inclusions</h3>
      <p className="mt-1 text-sm text-muted-foreground">Optional — add inclusions to help customers understand what this package covers. Every inclusion field is optional. These shared inclusions apply across enabled tiers. V2 tier-specific inclusions are configured above.</p></div>

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
          serviceOptions={offerConfiguration.serviceOptions} food={foodInclusions} foodChoiceGroups={usesV2 ? foodChoiceGroups : []} decor={decorInclusionsText}
          furniture={furnitureInclusionsText} services={serviceInclusionsText} offerDraft={offerDraft}
          images={images} paymentPolicy={paymentPolicy} depositPercentage={depositPercentage}
          />
      </div>
      </div>
      <div className={dialogLayout ? "grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4 sm:px-6" : "grid gap-3"}>
      {step === 4 && (validationError || depositError || foodError) ? <p role="alert" className="text-sm text-destructive">{validationError?.message || depositError || foodError}</p> : null}
      {savedProgress ? <p role="status" className="text-xs text-muted-foreground">Private progress saved (revision {savedProgress.revision}). This is not a package draft or publication.</p> : null}
      {progressError ? <p role="alert" className="text-sm text-destructive">{progressError}</p> : null}
      {error && !(step === 0 && error === occasionError) ? (
        <div
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
          {/^Step [1-4]:/u.test(error) ? <Button type="button" variant="secondary" onClick={() => goToStep(Number(error.charAt(5)) - 1)}>Return to Step {error.charAt(5)}</Button> : null}
        </div>
      ) : null}

      <div role="group" aria-label="Package wizard actions" className="grid min-w-0 items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,20rem)] lg:gap-6 [&_button]:px-3 [&_button]:text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-3 lg:flex-col lg:items-start">
        <Button
          type="button"
          variant="secondary"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </Button>

        {!editing && packageEditorProgressEnabled ? <Button type="button" variant="secondary"
          disabled={submitting || progressSaving} onClick={() => void handleSaveProgress()}>
          {progressSaving ? "Saving progress..." : onProgressExit ? "Save Progress & Exit" :
            savedProgress ? "Update saved progress" : "Save progress"}
        </Button> : null}
        </div>
        <div className="min-w-0 text-center">
          {usesV2 ? <p className="mx-auto max-w-prose text-xs leading-5 text-muted-foreground">Save Progress keeps unfinished editor state. Save Package Draft creates a private package; it does not publish.</p> : null}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 [&>button]:w-full [&>button]:min-w-0">
        {step > 0 ? <Button type="button" variant="secondary" onClick={() => goToStep(step - 1)}>Back</Button> : <span aria-hidden="true" />}
        {step < 4 ? <Button key="next-step" type="button" onClick={() => {
          const fields = step === 0 ? ["name", "description", "eventType", "serviceCategoryCode"] : step === 1 ? ["price", "minimumGuests", "maximumGuests", "serviceOptions"] : step === 3 ? ["serviceOptions"] : [];
          const pricingError = step === 1 ? serializeProviderPackageOfferDraft({...offerDraft, themeOptions: []}).error : null;
          const guestError = step === 1 && (!Number.isInteger(parsedMinimumGuests) || !Number.isInteger(parsedMaximumGuests) || parsedMinimumGuests < minGuestsPerEvent || parsedMaximumGuests > guestCapacityLimit || parsedMaximumGuests < parsedMinimumGuests) ? "Enter a guest range within your business capacity." : null;
          const message = (step === 0 ? packageClassificationError() : null) || (step === 2 ? foodError : null) || pricingError || guestError || (validationError && fields.includes(validationError.field) && !(step === 1 && validationError.field === "serviceOptions") ? validationError.message : null) || (step === 1 ? depositError : null);
          if (message) { setError(message); return; }
          goToStep(step + 1);
        }}>Next</Button> : <Button
          key="save-package"
          type="button"
          onClick={() => void handleSavePackageDraft()}
          disabled={
            submitting || progressSaving || Boolean(occasionSaveGate) ||
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
          : usesV2 ? "Save Package Draft" : "Create draft package"}
        </Button>}
        </div>
      </div>
      </div>
      </fieldset>
      {pendingV2 ? <div role="alert" className="space-y-2 p-4">
        <p>A previous save has no confirmed result. Retry that exact request before making another package.</p>
        <Button type="button" disabled={submitting} onClick={async () => {
          setSubmitting(true);
          onSubmittingChange?.(true);
          try { await retryPendingV2Draft(); setPendingV2(false); setDraftSaved(true); await onSaved(); }
          catch (caught) { setPendingV2(hasPendingV2Draft()); setError(providerPackageSaveError(caught)); }
          finally { setSubmitting(false); onSubmittingChange?.(false); }
        }}>Retry pending save</Button>
      </div> : null}
      {draftSaved ? <div role="status" className="p-4">Private package draft saved successfully.
        <Button type="button" onClick={() => void onSaved()}>Refresh saved packages</Button>
      </div> : null}
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
