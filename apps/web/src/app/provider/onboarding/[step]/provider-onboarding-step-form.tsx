"use client";

import {
  PROVIDER_AGREEMENT_VERSION,
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  isServiceCategoryCode,
  normalizePhilippineMobile,
  normalizePhilippinePhone,
  normalizeProviderEmail,
  providerCapacityCapabilities,  type ProviderBusinessRegistrationType,  type ProviderOnboardingInput,
} from "@feasta/shared-types";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {CheckboxField} from "@/components/forms/selection-controls";
import {ProviderBusinessImageField} from "@/components/provider/provider-business-image-field";
import {ProviderBusinessLocationField} from "@/components/provider/provider-business-location-field";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {providerOnboardingError} from "@/lib/auth/error-messages";
import {
  registerProviderBusiness,
  saveProviderOnboardingDraft,
} from "@/lib/auth/provider-client";
import {
  deleteProviderOnboardingImage,
  uploadProviderOnboardingImage,
} from "@/lib/provider/provider-media-client";
import {
  providerOnboardingPath,
  PROVIDER_ONBOARDING_STEPS,
  type ProviderOnboardingDraft,
  type ProviderOnboardingStep,
} from "@/lib/provider/onboarding";
import {
  PROVIDER_AGREEMENT_FINAL_SECTION,
  PROVIDER_AGREEMENT_SECTIONS,
} from "@/lib/provider/provider-agreement";
import type {
  ServiceCategoryOption,
} from "@/lib/service-categories/service-category-service";

type FormValues = Omit<
  ProviderOnboardingInput,
  "bookingLeadTimeDays" | "businessRegistrationType"
> & {
  bookingLeadTimeDays: number | null;
  businessRegistrationType: ProviderBusinessRegistrationType | null;
  ownerPhone: string;
  ownerEmail: string;
  providerAgreementAccepted: boolean;
  providerAgreementVersion: string;
};

export function ProviderOnboardingStepForm({
  step,
  draft,
  serviceCategories = [],
  editingExistingApplication = false,
}: {
  step: ProviderOnboardingStep;
  draft: ProviderOnboardingDraft;
  serviceCategories?: readonly ServiceCategoryOption[];
  editingExistingApplication?: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const idempotencyKey = useRef(globalThis.crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasNoServiceOffering, setHasNoServiceOffering] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedImages, setSelectedImages] = useState<{
    logo: File | null;
    cover: File | null;
  }>({logo: null, cover: null});
  const [values, setValues] = useState<FormValues>(() => initialValues(draft));
  const initialMediaPublicIds = useRef({
    logo: draft.logoPublicId ?? null,
    cover: draft.coverPublicId ?? null,
  });

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty || loading) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, loading]);

  const update = <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => {
    setDirty(true);

    setValues((current) => ({
      ...current,
      [key]: value,
    }));

    setFieldErrors((current) => {
      if (!(key in current)) {
        return current;
      }

      const next = {
        ...current,
      };

      delete next[
        key as string
      ];

      return next;
    });

    setError(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy.current) return;

    if (step.number === 3 && hasNoServiceOffering) {
      setFieldErrors((current) => ({
        ...current,
        providerServiceType:
          "Choose at least one service offering.",
      }));
      setError("Review the highlighted service fields.");
      return;
    }

    const prepared = prepareStepValues(
      step.number,
      values,
      serviceCategories,
    );
    const imageErrors = step.number === 2
      ? Object.fromEntries(
          (["logo", "cover"] as const).flatMap((mediaType) => {
            const file = selectedImages[mediaType];
            const issue = file ? validateImageFile(mediaType, file) : null;
            const field = providerMediaErrorField(
            mediaType,
          );

          return issue
            ? [[field, issue]]
            : [];
          }),
        )
      : {};
    const validationErrors = {...prepared.errors, ...imageErrors};
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError(
        "Complete all required fields before continuing.",
      );
      return;
    }
    busy.current = true;
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      let submissionValues = prepared.values;
      if (step.number === 2) {
        const [logo, cover] = await Promise.all([
          selectedImages.logo
            ? uploadProviderOnboardingImage("logo", selectedImages.logo)
            : null,
          selectedImages.cover
            ? uploadProviderOnboardingImage("cover", selectedImages.cover)
            : null,
        ]);
        submissionValues = {
          ...submissionValues,
          logoUrl:
            logo?.url ??
            submissionValues.logoUrl,
          logoPublicId:
            logo?.publicId ??
            submissionValues.logoPublicId,
          coverImageUrl:
            cover?.url ??
            submissionValues.coverImageUrl,
          coverPublicId:
            cover?.publicId ??
            submissionValues.coverPublicId,
        };
      }
      await saveProviderOnboardingDraft(
        step.number,
        stepPayload(step.number, submissionValues),
      );
      if (step.number === 2) {
        await cleanupRemovedMedia(
          initialMediaPublicIds.current,
          submissionValues,
        );

        initialMediaPublicIds.current = {
          logo: submissionValues.logoPublicId,
          cover: submissionValues.coverPublicId,
        };
        setSelectedImages({logo: null, cover: null});
      }
      setValues(submissionValues);
      setDirty(false);

      if (editingExistingApplication) {
        const destination =
          step.number === 6
            ? "/provider/verification?stage=documents"
            : (() => {
                const next =
                  PROVIDER_ONBOARDING_STEPS.find(
                    (candidate) =>
                      candidate.number ===
                      step.number + 1,
                  );

                if (!next) {
                  throw new Error(
                    "The next onboarding step is unavailable.",
                  );
                }

                return providerOnboardingPath(
                  next,
                );
              })();

        window.location.assign(
          destination,
        );
        return;
      }

      if (step.number === 6) {
        if (submissionValues.bookingLeadTimeDays === null) {
          throw new Error(
            "Minimum booking notice is required before registration.",
          );
        }

        if (submissionValues.businessRegistrationType === null) {

          throw new Error(

            "Business registration status is required before registration.",

          );

        }


        await registerProviderBusiness(
          {
            ...submissionValues,
            bookingLeadTimeDays: submissionValues.bookingLeadTimeDays,
            businessRegistrationType:
              submissionValues.businessRegistrationType,
          },
          idempotencyKey.current,
        );
        // Registration changes the trusted account from an onboarding draft
        // into a linked provider. Use a full document navigation here so the
        // Next.js client router cannot reuse the pre-registration Step 1-6
        // cache when the provider later navigates backward.
        window.location.replace(
          "/provider/verification?stage=documents",
        );
        return;
      } else {
        const next = PROVIDER_ONBOARDING_STEPS.find(
          (candidate) => candidate.number === step.number + 1,
        );
        if (!next) throw new Error("The next onboarding step is unavailable.");
        router.push(providerOnboardingPath(next));
      }
      router.refresh();
    } catch (caught) {
      setError(
        providerOnboardingError(
          caught,
        ),
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function goBack() {
    if (
      dirty &&
      !window.confirm(
        "Discard the unsaved changes on this step?",
      )
    ) {
      return;
    }

    const previous =
      PROVIDER_ONBOARDING_STEPS[
        step.number - 2
      ];

    const destination =
      previous
        ? providerOnboardingPath(
            previous,
          )
        : "/provider";

    if (editingExistingApplication) {
      window.location.assign(
        destination,
      );
      return;
    }

    router.push(
      destination,
    );
  }


  return (
    <form
      className="grid min-w-0 gap-5"
      onSubmit={submit}
      aria-describedby={error ? "provider-onboarding-error" : undefined}
    >
      <h2 className="sr-only">{step.label}</h2>
      <StepFields
        step={step.number}
        values={values}
        serviceCategories={serviceCategories}
        loading={loading}
        editingExistingApplication={editingExistingApplication}
        fieldErrors={fieldErrors}
        onServiceOfferingEmptyChange={setHasNoServiceOffering}
        selectedImages={selectedImages}
        setSelectedImage={(mediaType, file) => {
          setDirty(true);
          setSelectedImages((current) => ({
            ...current,
            [mediaType]: file,
          }));
          if (!file) return;
          const validationError = validateImageFile(mediaType, file);
          const field = providerMediaErrorField(
            mediaType,
          );

          setFieldErrors((current) => ({
            ...current,
            [field]: validationError ?? "",
          }));
        }}
        removeImage={(mediaType) => {
          setDirty(true);

          setSelectedImages((current) => ({
            ...current,
            [mediaType]: null,
          }));

          setValues((current) =>
            mediaType === "logo"
              ? {
                  ...current,
                  logoUrl: null,
                  logoPublicId: null,
                }
              : {
                  ...current,
                  coverImageUrl: null,
                  coverPublicId: null,
                }
          );

          const field = providerMediaErrorField(
            mediaType,
          );

          setFieldErrors((current) => ({
            ...current,
            [field]: "",
          }));
        }}
        update={update}
      />

      {error ? (
        <AuthStatus
          id="provider-onboarding-error"
          message={error}
          tone="error"
        />
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={goBack}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          Back
        </Button>

        <Button
          type="submit"
          loading={loading}
          loadingLabel={
            step.number === 6 &&
            !editingExistingApplication
              ? "Creating profile"
              : "Saving"
          }
          className="w-full sm:w-auto"
        >
          {step.number === 6
            ? "Save and continue to documents"
            : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

function StepFields({
  step,
  values,
  serviceCategories,
  loading,
  editingExistingApplication,
  fieldErrors,
  onServiceOfferingEmptyChange,
  selectedImages,
  setSelectedImage,
  removeImage,
  update,
}: {
  step: number;
  values: FormValues;
  serviceCategories: readonly ServiceCategoryOption[];
  loading: boolean;
  editingExistingApplication: boolean;
  fieldErrors: Record<string, string>;
  onServiceOfferingEmptyChange: (empty: boolean) => void;
  selectedImages: {logo: File | null; cover: File | null};
  setSelectedImage: (
    mediaType: "logo" | "cover",
    file: File | null,
  ) => void;
  removeImage: (mediaType: "logo" | "cover") => void;
  update: <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => void;
}) {
  const [serviceOfferingSelection, setServiceOfferingSelection] =
    useState<"catering" | "addon" | "both" | "none">(
      values.providerServiceType,
    );

  const integer = (value: string, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  if (step === 1) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Owner first name" required disabled={loading} error={fieldErrors.ownerFirstName}>
          <Input autoComplete="given-name" value={values.ownerFirstName} onChange={(event) => update("ownerFirstName", event.target.value)} />
        </FormField>
        <FormField label="Owner last name" required disabled={loading} error={fieldErrors.ownerLastName}>
          <Input autoComplete="family-name" value={values.ownerLastName} onChange={(event) => update("ownerLastName", event.target.value)} />
        </FormField>
        <FormField label="Account email" description="Managed by your authenticated account." disabled>
          <Input type="email" value={values.ownerEmail} readOnly />
        </FormField>
        <FormField
          label="Owner mobile"
          description={
            editingExistingApplication
              ? "This is your verified account mobile number. Change it from Account & Settings so FEASTA can verify the new number securely."
              : "Use a Philippine mobile number, such as 0917 123 4567."
          }
          required
          disabled={
            loading ||
            editingExistingApplication
          }
          error={fieldErrors.ownerPhone}
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.ownerPhone}
            disabled={
              loading ||
              editingExistingApplication
            }
            readOnly={
              editingExistingApplication
            }
            onChange={(event) =>
              update(
                "ownerPhone",
                event.target.value,
              )
            }
            onBlur={() => {
              const normalized =
                normalizePhilippineMobile(
                  values.ownerPhone,
                );

              if (normalized) {
                update(
                  "ownerPhone",
                  normalized,
                );
              }
            }}
          />
        </FormField>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Business name"
          description="Enter the official or customer-facing name of your business."
          required
          disabled={loading}
          error={fieldErrors.businessName}
        >
          <Input
            autoComplete="organization"
            minLength={2}
            maxLength={120}
            value={values.businessName}
            onChange={(event) =>
              update("businessName", event.target.value)
            }
          />
        </FormField>

        <FormField
          className="sm:col-span-2"
          label="Business registration status"
          description="This helps FEASTA request only the verification documents that apply to your provider account."
          required
          disabled={loading}
          error={fieldErrors.businessRegistrationType}
        >
          <div
            className={[
              "grid gap-3 sm:grid-cols-2",
              fieldErrors.businessRegistrationType
                ? "[&>label]:border-destructive [&>label]:bg-destructive/5"
                : "",
            ].join(" ")}
            role="radiogroup"
            aria-required="true"
            aria-invalid={
              Boolean(
                fieldErrors.businessRegistrationType,
              )
            }
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
              <input
                className="mt-1"
                type="radio"
                name="businessRegistrationType"
                value="individual"
                checked={values.businessRegistrationType === "individual"}
                disabled={loading}
                onChange={() =>
                  update("businessRegistrationType", "individual")
                }
              />
              <span>
                <span className="block font-medium">
                  Individual / freelance provider
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  I provide services independently and am not registering a
                  separate business entity with FEASTA.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
              <input
                className="mt-1"
                type="radio"
                name="businessRegistrationType"
                value="registered_business"
                checked={
                  values.businessRegistrationType === "registered_business"
                }
                disabled={loading}
                onChange={() =>
                  update("businessRegistrationType", "registered_business")
                }
              />
              <span>
                <span className="block font-medium">
                  Registered business / organization
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  My service operates as a registered business or organization.
                </span>
              </span>
            </label>
          </div>

        </FormField>


        <FormField
          label="Business email"
          description="Use an email address customers can use to contact your business."
          required
          disabled={loading}
          error={fieldErrors.businessEmail}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={160}
            value={values.businessEmail}
            onChange={(event) =>
              update("businessEmail", event.target.value)
            }
            onBlur={() => {
              const normalized =
                normalizeProviderEmail(values.businessEmail);

              if (normalized) {
                update("businessEmail", normalized);
              }
            }}
          />
        </FormField>

        <FormField
          label="Business phone"
          description="Enter the primary Philippine mobile or landline number customers can use to reach your business."
          required
          disabled={loading}
          error={fieldErrors.businessPhone}
        >
          <div className="grid gap-3">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={values.businessPhone}
              onChange={(event) =>
                update("businessPhone", event.target.value)
              }
              onBlur={() => {
                const normalized =
                  normalizePhilippinePhone(values.businessPhone);

                if (normalized) {
                  update("businessPhone", normalized);
                }
              }}
            />

            <CheckboxField
              label="Use my account phone number"
              description={
                values.ownerPhone
                  ? "Use the mobile number from your provider account as your business contact number."
                  : "Add a mobile number in Owner information before using this option."
              }
              checked={
                Boolean(normalizePhilippinePhone(values.ownerPhone)) &&
                normalizePhilippinePhone(values.businessPhone) ===
                  normalizePhilippinePhone(values.ownerPhone)
              }
              disabled={
                loading ||
                !normalizePhilippinePhone(values.ownerPhone)
              }
              onChange={(checked) => {
                if (checked) {
                  const accountPhone =
                    normalizePhilippinePhone(values.ownerPhone);

                  if (accountPhone) {
                    update("businessPhone", accountPhone);
                  }
                } else {
                  update("businessPhone", "");
                }
              }}
            />
          </div>
        </FormField>

        <FormField
          className="sm:col-span-2"
          label="Business description"
          description="Describe your services, specialties, and what customers can expect. Use 20 to 2,000 characters."
          required
          disabled={loading}
          error={fieldErrors.description}
        >
          <Textarea
            minLength={20}
            maxLength={2000}
            value={values.description}
            onChange={(event) =>
              update("description", event.target.value)
            }
          />
        </FormField>
        <ProviderBusinessImageField
          mediaType="logo"
          currentUrl={values.logoUrl}
          selectedFile={selectedImages.logo}
          disabled={loading}
          error={fieldErrors.logoUrl || undefined}
          onSelect={(file) =>
            setSelectedImage("logo", file)
          }
          onRemove={() => removeImage("logo")}
        />
        <ProviderBusinessImageField
          mediaType="cover"
          currentUrl={values.coverImageUrl}
          selectedFile={selectedImages.cover}
          disabled={loading}
          error={fieldErrors.coverImageUrl || undefined}
          onSelect={(file) =>
            setSelectedImage("cover", file)
          }
          onRemove={() => removeImage("cover")}
        />
      </div>
    );
  }

  if (step === 3) {
    const cateringSelected =
      serviceOfferingSelection === "catering" ||
      serviceOfferingSelection === "both";

    const addonSelected =
      serviceOfferingSelection === "addon" ||
      serviceOfferingSelection === "both";

    const cateringCategories = serviceCategories.filter(
      (category) => category.serviceType === "catering",
    );

    const addonCategories = serviceCategories.filter(
      (category) => category.serviceType === "addon",
    );

    const categoryNames = new Map(
      serviceCategories.map(
        (category) => [
          category.code,
          category.name,
        ] as const,
      ),
    );

    const predefinedEventTypes = PROVIDER_EVENT_TYPES.filter(
      (eventType) => eventType !== "other",
    );

    const allPredefinedEventsSelected =
      predefinedEventTypes.length > 0 &&
      predefinedEventTypes.every(
        (eventType) =>
          values.eventTypesSupported.includes(eventType),
      );

    const updateServiceOfferings = (
      nextCatering: boolean,
      nextAddon: boolean,
    ) => {
      if (!nextCatering && !nextAddon) {
        setServiceOfferingSelection("none");
        onServiceOfferingEmptyChange(true);
        update("serviceCategories", []);
        update("providerCategory", "");
        return;
      }

      const nextType: FormValues["providerServiceType"] =
        nextCatering && nextAddon
          ? "both"
          : nextCatering
            ? "catering"
            : "addon";

      const allowedCategories = new Set(
        serviceCategories
          .filter(
            (category) =>
              (nextCatering &&
                category.serviceType === "catering") ||
              (nextAddon &&
                category.serviceType === "addon"),
          )
          .map((category) => category.code),
      );

      const nextCategories =
        values.serviceCategories.filter((category) =>
          allowedCategories.has(category),
        );

      setServiceOfferingSelection(nextType);
      onServiceOfferingEmptyChange(false);
      update("providerServiceType", nextType);
      update("serviceCategories", nextCategories);
      update(
        "providerCategory",
        nextCategories.includes(values.providerCategory)
          ? values.providerCategory
          : nextCategories[0] ?? "",
      );
    };

    const toggleServiceCategory = (
      category: (typeof serviceCategories)[number]["code"],
    ) => {
      const next = toggleList(
        values.serviceCategories,
        category,
      );

      update("serviceCategories", next);
      update("providerCategory", next[0] ?? "");
    };

    const toggleAllPredefinedEvents = () => {
      const otherSelected =
        values.eventTypesSupported.includes("other");

      if (allPredefinedEventsSelected) {
        update(
          "eventTypesSupported",
          otherSelected ? ["other"] : [],
        );
        return;
      }

      update("eventTypesSupported", [
        ...predefinedEventTypes,
        ...(otherSelected ? ["other" as const] : []),
      ]);
    };

    return (
      <div className="grid gap-6">
        <fieldset
          className="grid gap-4 rounded-lg border border-border p-4"
          aria-invalid={
            fieldErrors.providerServiceType ? true : undefined
          }
        >
          <legend className="px-1 text-sm font-semibold">
            Services your business provides *
          </legend>

          <p className="text-sm text-muted-foreground">
            Choose the service groups your business provides.
            You can select both.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label
              className={[
                "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors",
                cateringSelected
                  ? "border-primary bg-primary/5"
                  : "border-border",
                loading
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-primary/60",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={cateringSelected}
                disabled={loading}
                onChange={(event) =>
                  updateServiceOfferings(
                    event.target.checked,
                    addonSelected,
                  )
                }
                className="mt-1 size-4 accent-primary"
              />

              <span className="grid gap-1">
                <span className="font-semibold">
                  Catering services
                </span>
                <span className="text-sm text-muted-foreground">
                  Food preparation, catering packages, packed
                  meals, and catering-related services.
                </span>
              </span>
            </label>

            <label
              className={[
                "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors",
                addonSelected
                  ? "border-primary bg-primary/5"
                  : "border-border",
                loading
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-primary/60",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={addonSelected}
                disabled={loading}
                onChange={(event) =>
                  updateServiceOfferings(
                    cateringSelected,
                    event.target.checked,
                  )
                }
                className="mt-1 size-4 accent-primary"
              />

              <span className="grid gap-1">
                <span className="font-semibold">
                  Additional event services
                </span>
                <span className="text-sm text-muted-foreground">
                  Photography, styling, entertainment, rentals,
                  coordination, and other event services.
                </span>
              </span>
            </label>
          </div>

          {serviceOfferingSelection === "none" ||
          fieldErrors.providerServiceType ? (
            <p
              className="text-sm text-destructive"
              role="alert"
            >
              {serviceOfferingSelection === "none"
                ? "Choose at least one service offering."
                : fieldErrors.providerServiceType}
            </p>
          ) : null}
        </fieldset>

        {cateringSelected ? (
          <CheckboxGroup
            legend="Catering services"
            description="Select every catering service your business provides."
            values={cateringCategories.map(
              (category) => category.code,
            )}
            selected={values.serviceCategories}
            disabled={loading}
            error={
              !addonSelected
                ? fieldErrors.serviceCategories
                : undefined
            }
            label={(category) =>
              categoryNames.get(category) ??
              titleFromValue(category)
            }
            onToggle={toggleServiceCategory}
          />
        ) : null}

        {cateringSelected && !addonSelected ? (
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              updateServiceOfferings(true, true)
            }
            className="w-fit text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Add event services
          </button>
        ) : null}

        {addonSelected ? (
          <CheckboxGroup
            legend="Additional event services"
            description="Select every additional event service your business provides."
            values={addonCategories.map(
              (category) => category.code,
            )}
            selected={values.serviceCategories}
            disabled={loading}
            error={
              !cateringSelected
                ? fieldErrors.serviceCategories
                : undefined
            }
            label={(category) =>
              categoryNames.get(category) ??
              titleFromValue(category)
            }
            onToggle={toggleServiceCategory}
          />
        ) : null}

        {addonSelected && !cateringSelected ? (
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              updateServiceOfferings(true, true)
            }
            className="w-fit text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Also provide catering
          </button>
        ) : null}

        {cateringSelected &&
        addonSelected &&
        fieldErrors.serviceCategories ? (
          <p
            className="text-sm text-destructive"
            role="alert"
          >
            {fieldErrors.serviceCategories}
          </p>
        ) : null}

        <fieldset
          className="grid gap-3 rounded-lg border border-border p-4"
          aria-invalid={
            fieldErrors.eventTypesSupported ? true : undefined
          }
        >
          <legend className="text-sm font-semibold">
            Supported event types
          </legend>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Choose the event types this business accepts.
            </p>

            <button
              type="button"
              disabled={loading}
              onClick={toggleAllPredefinedEvents}
              className="text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {allPredefinedEventsSelected
                ? "Clear all"
                : "Select all"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDER_EVENT_TYPES.map((eventType) => (
              <CheckboxField
                key={eventType}
                label={titleFromValue(eventType)}
                checked={values.eventTypesSupported.includes(
                  eventType,
                )}
                disabled={loading}
                onChange={() =>
                  update(
                    "eventTypesSupported",
                    toggleList(
                      values.eventTypesSupported,
                      eventType,
                    ),
                  )
                }
              />
            ))}
          </div>

          {values.eventTypesSupported.includes("other") ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Select Other when your business accepts event
              types that are not listed above.
            </p>
          ) : null}

          {fieldErrors.eventTypesSupported ? (
            <p
              className="text-sm text-destructive"
              role="alert"
            >
              {fieldErrors.eventTypesSupported}
            </p>
          ) : null}
        </fieldset>
      </div>
    );
  }

  if (step === 4) {
    return (
      <ProviderBusinessLocationField
        address={values.address}
        city={values.city}
        province={values.province}
        coordinates={values.locationCoordinates}
        serviceAreas={values.serviceAreas}
        maxServiceDistanceKm={values.maxServiceDistanceKm}
        loading={loading}
        fieldErrors={fieldErrors}
        onLocationChange={(location) => {
          update("address", location.address);
          update("city", location.city);
          update("province", location.province);
          update("locationCoordinates", {
            latitude: location.latitude,
            longitude: location.longitude,
          });
        }}
        onLocationClear={() => {
          update("address", "");
          update("city", "");
          update("province", "");
          update("locationCoordinates", null);
        }}
        onServiceAreasChange={(areas) =>
          update("serviceAreas", areas)
        }
        onMaximumDistanceChange={(distance) =>
          update("maxServiceDistanceKm", distance)
        }
      />
    );
  }

  if (step === 5) {
  const capabilities = resolveStepFiveCapacityCapabilities(
    values.serviceCategories,
    serviceCategories,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {capabilities.requiresGuestCapacity ? (
        <>
          <NumberField
            label="Minimum guests per event"
            description="The smallest event size your business normally accepts."
            value={values.minGuestsPerEvent}
            minimum={1}
            maximum={100000}
            disabled={loading}
            error={fieldErrors.minGuestsPerEvent}
            onChange={(value) =>
              update(
                "minGuestsPerEvent",
                integer(value),
              )
            }
          />

          <NumberField
            label="Maximum guests per event"
            description="The largest event size your business can currently support."
            value={values.maxGuestsPerEvent}
            minimum={1}
            maximum={100000}
            disabled={loading}
            error={fieldErrors.maxGuestsPerEvent}
            onChange={(value) =>
              update(
                "maxGuestsPerEvent",
                integer(value),
              )
            }
          />
        </>
      ) : null}

      {capabilities.usesStaffCapacity ? (
        <NumberField
          label="Available staff"
          description="People normally available to fulfill bookings."
          value={values.availableStaffCount}
          minimum={0}
          maximum={100000}
          disabled={loading}
          error={fieldErrors.availableStaffCount}
          onChange={(value) =>
            update(
              "availableStaffCount",
              integer(value),
            )
          }
        />
      ) : null}

      {capabilities.usesEquipmentCapacity ? (
        <NumberField
          label="Available equipment units"
          description="Equipment, vehicles, booths, rental units, or other service resources currently available."
          value={values.availableEquipmentCount}
          minimum={0}
          maximum={100000}
          disabled={loading}
          error={fieldErrors.availableEquipmentCount}
          onChange={(value) =>
            update(
              "availableEquipmentCount",
              integer(value),
            )
          }
        />
      ) : null}

      <div className="sm:col-span-2">
        <CheckboxField
          label="Accept multiple events on the same day"
          description="Enable this only when your staffing, equipment, and schedule can support multiple bookings."
          checked={
            values.acceptsMultipleEventsPerDay
          }
          disabled={loading}
          onChange={(event) => {
            update(
              "acceptsMultipleEventsPerDay",
              event.target.checked,
            );

            if (!event.target.checked) {
              update(
                "maxEventsPerDay",
                1,
              );
            }
          }}
        />
      {values.acceptsMultipleEventsPerDay ? (
        <NumberField
          label="Maximum events per day"
          description="Maximum bookings your business can realistically fulfill on the same day."
          value={values.maxEventsPerDay}
          minimum={1}
          maximum={100}
          disabled={loading}
          error={fieldErrors.maxEventsPerDay}
          onChange={(value) =>
            update(
              "maxEventsPerDay",
              integer(value, 1),
            )
          }
        />
      ) : null}

      <NumberField
        label="Minimum booking notice (days)"
        description="How many days in advance should customers normally book? Enter 0 if you accept same-day or rush bookings."
        value={values.bookingLeadTimeDays}
        minimum={0}
        maximum={365}
        disabled={loading}
        error={fieldErrors.bookingLeadTimeDays}
        onChange={(value) =>
          update(
            "bookingLeadTimeDays",
            value === "" ? null : integer(value),
          )
        }
      />

      </div>

      <fieldset
        className="sm:col-span-2 grid gap-3 rounded-lg border border-border p-4"
        disabled={loading}
        aria-invalid={
          fieldErrors.operatingDays ? true : undefined
        }
      >
        <legend className="text-sm font-semibold">
          Operating days
        </legend>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            These are your normal operating days, not a guarantee of availability.
          </p>

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              update(
                "operatingDays",
                values.operatingDays.length ===
                  PROVIDER_OPERATING_DAYS.length
                  ? []
                  : [...PROVIDER_OPERATING_DAYS],
              )
            }
            className="text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {values.operatingDays.length ===
            PROVIDER_OPERATING_DAYS.length
              ? "Clear all"
              : "Select all"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDER_OPERATING_DAYS.map((day) => (
            <CheckboxField
              key={day}
              label={titleFromValue(day)}
              checked={values.operatingDays.includes(day)}
              disabled={loading}
              onChange={() =>
                update(
                  "operatingDays",
                  toggleList(
                    values.operatingDays,
                    day,
                  ),
                )
              }
            />
          ))}
        </div>

        {fieldErrors.operatingDays ? (
          <p
            className="text-sm text-destructive"
            role="alert"
          >
            {fieldErrors.operatingDays}
          </p>
        ) : null}
      </fieldset>

      <FormField
        className="sm:col-span-2"
        label="Unavailable dates"
        description="Optional dates when your business cannot accept bookings."
        disabled={loading}
        error={fieldErrors.unavailableDates}
      >
        <div className="grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="date"
              disabled={loading}
              aria-label="Add unavailable date"
              onChange={(event) => {
                const date = event.target.value;

                if (
                  !date ||
                  values.unavailableDates.includes(date)
                ) {
                  return;
                }

                update(
                  "unavailableDates",
                  [...values.unavailableDates, date].sort(),
                );

                event.target.value = "";
              }}
            />
          </div>

          {values.unavailableDates.length > 0 ? (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Unavailable dates"
            >
              {values.unavailableDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() =>
                    update(
                      "unavailableDates",
                      values.unavailableDates.filter(
                        (item) => item !== date,
                      ),
                    )
                  }
                  aria-label={`Remove unavailable date ${date}`}
                >
                  <span>{date}</span>
                  <span aria-hidden="true">?</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No unavailable dates added.
            </p>
          )}
        </div>
      </FormField>
    </div>
  );
}

  return (
    <ProviderAgreementStep
      accepted={values.providerAgreementAccepted}
      loading={loading}
      error={fieldErrors.providerAgreementAccepted}
      onAcceptedChange={(accepted) =>
        update(
          "providerAgreementAccepted",
          accepted,
        )
      }
    />
  );
}

function ProviderAgreementStep({
  accepted,
  loading,
  error,
  onAcceptedChange,
}: {
  accepted: boolean;
  loading: boolean;
  error?: string;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const [hasReachedEnd, setHasReachedEnd] =
    useState(accepted);

  const acceptanceEnabled =
    accepted || hasReachedEnd;

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="font-semibold text-foreground">
          Read the FEASTA Provider Agreement
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Review the complete agreement below. Scroll to the end
          before accepting the provider terms.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="font-semibold text-foreground">
              FEASTA Provider Agreement
            </p>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Version {PROVIDER_AGREEMENT_VERSION}
            </p>
          </div>

          <Link
            href="/provider-agreement"
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-sm font-semibold text-primary hover:underline"
          >
            Open full page
          </Link>
        </div>

        <div
          tabIndex={0}
          aria-label="Scrollable FEASTA Provider Agreement"
          className="max-h-[32rem] overflow-y-auto overscroll-auto scroll-smooth px-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
          onScroll={(event) => {
            const element =
              event.currentTarget;

            const remaining =
              element.scrollHeight -
              element.scrollTop -
              element.clientHeight;

            if (remaining <= 24) {
              setHasReachedEnd(true);
            }
          }}
        >
          <div className="grid gap-7">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm leading-6 text-muted-foreground">
                This agreement explains the responsibilities that
                apply when offering catering or event-related
                services through FEASTA.
              </p>
            </div>

            {PROVIDER_AGREEMENT_SECTIONS.map(
              (section) => (
                <section
                  key={section.title}
                  className="grid gap-2"
                >
                  <h4 className="font-semibold leading-6 text-foreground">
                    {section.title}
                  </h4>

                  <div className="grid gap-3">
                    {section.paragraphs.map(
                      (paragraph) => (
                        <p
                          key={paragraph}
                          className="text-sm leading-6 text-muted-foreground"
                        >
                          {paragraph}
                        </p>
                      ),
                    )}
                  </div>
                </section>
              ),
            )}

            <section className="grid gap-2">
              <h4 className="font-semibold leading-6 text-foreground">
                {PROVIDER_AGREEMENT_FINAL_SECTION.title}
              </h4>

              <div className="grid gap-3">
                {PROVIDER_AGREEMENT_FINAL_SECTION.paragraphs.map(
                  (paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-6 text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ),
                )}
              </div>
            </section>

            <section className="grid gap-4 border-t border-border pt-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  End of Provider Agreement
                </p>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Confirm your acceptance below to continue to
                  provider verification.
                </p>
              </div>

              <CheckboxField
                label="I have read and agree to the FEASTA Provider Agreement."
                checked={accepted}
                required
                disabled={
                  loading ||
                  !acceptanceEnabled
                }
                onChange={(event) =>
                  onAcceptedChange(
                    event.target.checked,
                  )
                }
              />

              {error ? (
                <p
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      {!acceptanceEnabled ? (
        <AuthStatus
          tone="info"
          message="Scroll through the Provider Agreement to the end to enable the acceptance checkbox."
        />
      ) : (
        <AuthStatus
          tone="info"
          message="Your acceptance is recorded with the current agreement version and acceptance time when you continue. Your provider profile remains inactive until FEASTA completes verification."
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  minimum,
  maximum,
  required = true,
  disabled,
  error,
  onChange,
}: {
  label: string;
  description?: string;
  value: number | null;
  minimum: number;
  maximum?: number;
  required?: boolean;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} description={description} required={required} disabled={disabled} error={error}>
      <Input type="number" inputMode="numeric" min={minimum} max={maximum} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </FormField>
  );
}

function CheckboxGroup<T extends string>({
  legend,
  description,
  values,
  selected,
  disabled,
  error,
  label,
  onToggle,
}: {
  legend: string;
  description: string;
  values: readonly T[];
  selected: readonly T[];
  disabled: boolean;
  error?: string;
  label: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-4" aria-invalid={error ? true : undefined}>
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {values.map((value) => (
          <CheckboxField
            key={value}
            label={label(value)}
            checked={selected.includes(value)}
            disabled={disabled}
            onChange={() => onToggle(value)}
          />
        ))}
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </fieldset>
  );
}

function initialValues(draft: ProviderOnboardingDraft): FormValues {
  return {
    ownerFirstName: draft.ownerFirstName,
    ownerLastName: draft.ownerLastName,
    ownerPhone: draft.ownerPhone,
    ownerEmail: draft.ownerEmail,
    businessName: draft.businessName ?? "",
    businessRegistrationType: draft.businessRegistrationType ?? null,
    businessEmail: draft.businessEmail ?? draft.ownerEmail,
    businessPhone: draft.businessPhone ?? "",
    description: draft.description ?? "",
    providerServiceType: draft.providerServiceType ?? "catering",
    providerCategory:
      isServiceCategoryCode(draft.providerCategory)
        ? draft.providerCategory
        : "",
    serviceCategories:
      draft.serviceCategories?.length
        ? draft.serviceCategories
        : isServiceCategoryCode(
              draft.providerCategory,
            )
          ? [draft.providerCategory]
          : [],
    address: draft.address ?? "",
    city: draft.city ?? "Ormoc City",
    province: draft.province ?? "Leyte",
    locationCoordinates: draft.locationCoordinates ?? null,
    serviceAreas: draft.serviceAreas ?? [],
    maxServiceDistanceKm: draft.maxServiceDistanceKm ?? null,
    eventTypesSupported: draft.eventTypesSupported ?? [],
    minGuestsPerEvent: draft.minGuestsPerEvent ?? 1,
    maxGuestsPerEvent: draft.maxGuestsPerEvent ?? 1,
    acceptsMultipleEventsPerDay: draft.acceptsMultipleEventsPerDay ?? false,
    maxEventsPerDay: draft.maxEventsPerDay ?? 1,
    availableStaffCount: draft.availableStaffCount ?? 0,
    availableEquipmentCount: draft.availableEquipmentCount ?? 0,
    operatingDays: draft.operatingDays ?? [],
    bookingLeadTimeDays: draft.bookingLeadTimeDays ?? null,
    unavailableDates: draft.unavailableDates ?? [],
    logoUrl: draft.logoUrl ?? null,
    logoPublicId: draft.logoPublicId ?? null,
    coverImageUrl: draft.coverImageUrl ?? null,
    coverPublicId: draft.coverPublicId ?? null,
    providerAgreementAccepted:
      draft.providerAgreementAccepted ?? false,
    providerAgreementVersion:
      draft.providerAgreementVersion || PROVIDER_AGREEMENT_VERSION,
  };
}

function stepPayload(
  step: number,
  values: FormValues,
): Record<string, unknown> {
  if (step === 1) return pick(values, ["ownerFirstName", "ownerLastName", "ownerPhone"]);
  if (step === 2) {
    return pick(values, [
      "businessName",
      "businessRegistrationType",
      "businessEmail",
      "businessPhone",
      "description",
      "logoUrl",
      "logoPublicId",
      "coverImageUrl",
      "coverPublicId",
    ]);
  }
  if (step === 3) return pick(values, ["providerServiceType", "providerCategory", "serviceCategories", "eventTypesSupported"]);
  if (step === 4) return pick(values, ["address", "city", "province", "serviceAreas", "maxServiceDistanceKm", "locationCoordinates"]);
  if (step === 5) return pick(values, ["minGuestsPerEvent", "maxGuestsPerEvent", "acceptsMultipleEventsPerDay", "maxEventsPerDay", "availableStaffCount", "availableEquipmentCount", "operatingDays", "bookingLeadTimeDays", "unavailableDates"]);
  return pick(values, [
    "providerAgreementAccepted",
    "providerAgreementVersion",
  ]);
}

function pick(
  values: FormValues,
  fields: readonly (keyof FormValues)[],
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, values[field]]));
}

function resolveStepFiveCapacityCapabilities(
  selectedCodes: readonly string[],
  serviceCategories: readonly ServiceCategoryOption[],
) {
  const categoriesByCode = new Map(
    serviceCategories.map((category) => [category.code, category]),
  );

  return selectedCodes.reduce(
    (resolved, code) => {
      const explicit =
        categoriesByCode.get(code)?.capacityCapabilities;
      const categoryCapabilities =
        explicit ?? providerCapacityCapabilities([code]);

      return {
        requiresGuestCapacity:
          resolved.requiresGuestCapacity ||
          categoryCapabilities.requiresGuestCapacity,
        usesStaffCapacity:
          resolved.usesStaffCapacity ||
          categoryCapabilities.usesStaffCapacity,
        usesEquipmentCapacity:
          resolved.usesEquipmentCapacity ||
          categoryCapabilities.usesEquipmentCapacity,
      };
    },
    {
      requiresGuestCapacity: false,
      usesStaffCapacity: false,
      usesEquipmentCapacity: false,
    },
  );
}
function prepareStepValues(
  step: number,
  values: FormValues,
  serviceCategories: readonly ServiceCategoryOption[],
): {values: FormValues; errors: Record<string, string>} {
  const normalized = {...values};
  const errors: Record<string, string> = {};
  if (step === 1) {
    normalized.ownerFirstName = values.ownerFirstName.trim();
    normalized.ownerLastName = values.ownerLastName.trim();
    const phone = normalizePhilippineMobile(values.ownerPhone);
    if (!normalized.ownerFirstName) {
      errors.ownerFirstName = "Enter the owner's first name.";
    }
    if (!normalized.ownerLastName) {
      errors.ownerLastName = "Enter the owner's last name.";
    }
    if (!phone) {
      errors.ownerPhone = "Enter a valid Philippine mobile number.";
    } else {
      normalized.ownerPhone = phone;
    }
  }
  if (step === 2) {
    normalized.businessName = values.businessName.trim();
    normalized.description = values.description.trim();

    if (
      values.businessRegistrationType !== "individual" &&
      values.businessRegistrationType !== "registered_business"
    ) {
      errors.businessRegistrationType =
        "Choose your business registration status.";
    }

    const email = normalizeProviderEmail(values.businessEmail);
    const phone = normalizePhilippinePhone(values.businessPhone);

    if (normalized.businessName.length < 2) {
      errors.businessName =
        "Business name must contain at least 2 characters.";
    } else if (normalized.businessName.length > 120) {
      errors.businessName =
        "Business name must not exceed 120 characters.";
    }

    if (!email) {
      errors.businessEmail =
        "Enter a valid business email address.";
    } else if (email.length > 160) {
      errors.businessEmail =
        "Business email must not exceed 160 characters.";
    } else {
      normalized.businessEmail = email;
    }

    if (!phone) {
      errors.businessPhone =
        "Enter a valid Philippine mobile or landline number.";
    } else {
      normalized.businessPhone = phone;
    }

    if (normalized.description.length < 20) {
      errors.description =
        "Business description must contain at least 20 characters.";
    } else if (normalized.description.length > 2000) {
      errors.description =
        "Business description must not exceed 2,000 characters.";
    }
  }
  if (step === 3) {
    const allowedServiceTypes =
      values.providerServiceType === "both"
        ? new Set(["catering", "addon"])
        : new Set([values.providerServiceType]);

    const selectedServiceCategories = new Set(
      values.serviceCategories,
    );

    const selectedCategoryRecords =
      serviceCategories.filter((category) =>
        selectedServiceCategories.has(category.code),
      );

    const hasUnknownServiceCategory =
      selectedCategoryRecords.length !==
      selectedServiceCategories.size;

    const hasIncompatibleServiceCategory =
      selectedCategoryRecords.some(
        (category) =>
          !allowedServiceTypes.has(category.serviceType),
      );

    if (values.serviceCategories.length === 0) {
      errors.serviceCategories =
        "Choose at least one service category.";
    } else if (
      hasUnknownServiceCategory ||
      hasIncompatibleServiceCategory
    ) {
      errors.serviceCategories =
        "Choose service categories that match the services your business provides.";
    }

    if (values.eventTypesSupported.length === 0) {
      errors.eventTypesSupported =
        "Choose at least one event type.";
    } else if (
      values.eventTypesSupported.some(
        (eventType) =>
          !PROVIDER_EVENT_TYPES.includes(eventType),
      )
    ) {
      errors.eventTypesSupported =
        "Choose only supported event types.";
    }
  }
  if (step === 4) {
    normalized.address = values.address.trim();
    normalized.city = values.city.trim();
    normalized.province = values.province.trim();
    normalized.serviceAreas = [
      ...new Set(
        values.serviceAreas
          .map((area) => area.trim())
          .filter(Boolean),
      ),
    ];

    if (
      normalized.address.length < 3 ||
      normalized.address.length > 250
    ) {
      errors.address =
        "Choose a valid business address.";
    }

    if (
      normalized.city.length < 2 ||
      normalized.city.length > 100
    ) {
      errors.city =
        "Choose a business location with a valid city or municipality.";
    }

    if (
      normalized.province.length < 2 ||
      normalized.province.length > 100
    ) {
      errors.province =
        "Choose a business location with a valid province.";
    }

    if (
      !normalized.locationCoordinates ||
      !Number.isFinite(
        normalized.locationCoordinates.latitude,
      ) ||
      !Number.isFinite(
        normalized.locationCoordinates.longitude,
      )
    ) {
      errors.address =
        "Choose your business location from the address suggestions or set it on the map.";
    }

    if (normalized.serviceAreas.length === 0) {
      errors.serviceAreas =
        "Add at least one city, municipality, or province you serve.";
    }

    if (
      values.maxServiceDistanceKm != null &&
      (!Number.isFinite(values.maxServiceDistanceKm) ||
        values.maxServiceDistanceKm < 1 ||
        values.maxServiceDistanceKm > 1000)
    ) {
      errors.maxServiceDistanceKm =
        "Enter a travel distance from 1 to 1,000 km.";
    }
  }
  if (step === 5) {
  const capabilities = resolveStepFiveCapacityCapabilities(
    values.serviceCategories,
    serviceCategories,
  );

  if (capabilities.requiresGuestCapacity) {
    if (
      !Number.isInteger(values.minGuestsPerEvent) ||
      values.minGuestsPerEvent < 1 ||
      values.minGuestsPerEvent > 100000 ||
      values.minGuestsPerEvent >
        values.maxGuestsPerEvent
    ) {
      errors.minGuestsPerEvent =
        "Minimum guests must be from 1 to 100,000 and not exceed the maximum.";
    }

    if (
      !Number.isInteger(values.maxGuestsPerEvent) ||
      values.maxGuestsPerEvent < 1 ||
      values.maxGuestsPerEvent > 100000
    ) {
      errors.maxGuestsPerEvent =
        "Maximum guests must be from 1 to 100,000.";
    }
  } else {
    normalized.minGuestsPerEvent = 0;
    normalized.maxGuestsPerEvent = 0;
  }

  if (!capabilities.usesStaffCapacity) {
    normalized.availableStaffCount = 0;
  } else if (
    !Number.isInteger(values.availableStaffCount) ||
    values.availableStaffCount < 0 ||
    values.availableStaffCount > 100000
  ) {
    errors.availableStaffCount =
      "Available staff must be from 0 to 100,000.";
  }

  if (!capabilities.usesEquipmentCapacity) {
    normalized.availableEquipmentCount = 0;
  } else if (
    !Number.isInteger(values.availableEquipmentCount) ||
    values.availableEquipmentCount < 0 ||
    values.availableEquipmentCount > 100000
  ) {
    errors.availableEquipmentCount =
      "Available equipment must be from 0 to 100,000.";
  }

  if (!values.acceptsMultipleEventsPerDay) {
    normalized.maxEventsPerDay = 1;
  } else if (
    !Number.isInteger(values.maxEventsPerDay) ||
    values.maxEventsPerDay < 1 ||
    values.maxEventsPerDay > 100
  ) {
    errors.maxEventsPerDay =
      "Maximum events per day must be from 1 to 100.";
  }

  if (values.operatingDays.length === 0) {
    errors.operatingDays =
      "Choose at least one operating day.";
  }

  if (values.bookingLeadTimeDays === null) {
    errors.bookingLeadTimeDays =
      "Enter your minimum booking notice.";
  } else if (
    !Number.isInteger(values.bookingLeadTimeDays) ||
    values.bookingLeadTimeDays < 0 ||
    values.bookingLeadTimeDays > 365
  ) {
    errors.bookingLeadTimeDays =
      "Minimum booking notice must be between 0 and 365 days.";
  }

  if (
    values.unavailableDates.some(
      (date) =>
        !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
        Number.isNaN(
          Date.parse(
            `${date}T00:00:00Z`,
          ),
        ),
    )
  ) {
    errors.unavailableDates =
      "Use valid YYYY-MM-DD dates.";
  }
}
  if (step === 6 && !values.providerAgreementAccepted) {
    errors.providerAgreementAccepted =
      "Accept the FEASTA Provider Agreement to continue.";
  }

  return {values: normalized, errors};
}

function toggleList<T extends string>(
  values: readonly T[],
  value: T,
): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function titleFromValue(value: string): string {
  return value.split("_").map(
    (part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
  ).join(" ");
}


function validateImageFile(
  mediaType: "logo" | "cover",
  file: File,
): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  const maximum = mediaType === "logo"
    ? 5 * 1024 * 1024
    : 10 * 1024 * 1024;
  if (file.size <= 0 || file.size > maximum) {
    return `Choose an image no larger than ${
      mediaType === "logo" ? "5" : "10"
    } MB.`;
  }
  return null;
}

function providerMediaErrorField(
  mediaType: "logo" | "cover",
): "logoUrl" | "coverImageUrl" {
  return mediaType === "logo"
    ? "logoUrl"
    : "coverImageUrl";
}

async function cleanupRemovedMedia(
  previous: {
    logo: string | null;
    cover: string | null;
  },
  current: FormValues,
): Promise<void> {
  const removed: (
    | "logo"
    | "cover"
  )[] = [];

  if (
    previous.logo &&
    current.logoPublicId === null
  ) {
    removed.push("logo");
  }

  if (
    previous.cover &&
    current.coverPublicId === null
  ) {
    removed.push("cover");
  }

  await Promise.allSettled(
    removed.map((mediaType) =>
      deleteProviderOnboardingImage(
        mediaType,
      )
    ),
  );
}
