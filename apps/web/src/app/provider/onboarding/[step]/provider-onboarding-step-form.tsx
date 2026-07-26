"use client";

import {
  ADDON_SERVICE_CATEGORIES,
  CATERING_SERVICE_CATEGORIES,
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  normalizePhilippinePhone,
  normalizeProviderEmail,
  serviceCategoryMatchesProviderType,
  type ProviderOnboardingInput,
  type ProviderServiceCategory,
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
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
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

type FormValues = ProviderOnboardingInput & {
  ownerPhone: string;
  ownerEmail: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  termsPolicyVersion: string;
  privacyPolicyVersion: string;
};

export function ProviderOnboardingStepForm({
  step,
  draft,
}: {
  step: ProviderOnboardingStep;
  draft: ProviderOnboardingDraft;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const idempotencyKey = useRef(globalThis.crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedImages, setSelectedImages] = useState<{
    logo: File | null;
    cover: File | null;
  }>({logo: null, cover: null});
  const [values, setValues] = useState<FormValues>(() => initialValues(draft));
  const initialMediaPaths = useRef({
    logo: draft.logoStoragePath ?? null,
    cover: draft.coverStoragePath ?? null,
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
    setValues((current) => ({...current, [key]: value}));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const prepared = prepareStepValues(step.number, values);
    const imageErrors = step.number === 2
      ? Object.fromEntries(
          (["logo", "cover"] as const).flatMap((mediaType) => {
            const file = selectedImages[mediaType];
            const issue = file ? validateImageFile(mediaType, file) : null;
            return issue ? [[`${mediaType}StoragePath`, issue]] : [];
          }),
        )
      : {};
    const validationErrors = {...prepared.errors, ...imageErrors};
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError("Review the highlighted owner or business fields.");
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
          logoStoragePath: logo?.storagePath ??
            submissionValues.logoStoragePath,
          coverStoragePath: cover?.storagePath ??
            submissionValues.coverStoragePath,
        };
      }
      await saveProviderOnboardingDraft(
        step.number,
        stepPayload(step.number, submissionValues),
      );
      if (step.number === 2) {
        await cleanupReplacedMedia(initialMediaPaths.current, submissionValues);
        initialMediaPaths.current = {
          logo: submissionValues.logoStoragePath,
          cover: submissionValues.coverStoragePath,
        };
        setSelectedImages({logo: null, cover: null});
      }
      setValues(submissionValues);
      setDirty(false);
      if (step.number === 6) {
        await registerProviderBusiness(
          submissionValues,
          idempotencyKey.current,
        );
        router.replace("/provider/verification?stage=documents");
      } else {
        const next = PROVIDER_ONBOARDING_STEPS.find(
          (candidate) => candidate.number === step.number + 1,
        );
        if (!next) throw new Error("The next onboarding step is unavailable.");
        router.push(providerOnboardingPath(next));
      }
      router.refresh();
    } catch (caught) {
      setError(customerAuthenticationError(caught));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function goBack() {
    if (
      dirty &&
      !window.confirm("Discard the unsaved changes on this step?")
    ) {
      return;
    }
    const previous = PROVIDER_ONBOARDING_STEPS[step.number - 2];
    router.push(previous ? providerOnboardingPath(previous) : "/provider");
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
        loading={loading}
        fieldErrors={fieldErrors}
        selectedImages={selectedImages}
        setSelectedImage={(mediaType, file) => {
          setDirty(true);
          setSelectedImages((current) => ({
            ...current,
            [mediaType]: file,
          }));
          if (!file) return;
          const validationError = validateImageFile(mediaType, file);
          setFieldErrors((current) => ({
            ...current,
            [`${mediaType}StoragePath`]: validationError ?? "",
          }));
        }}
        removeImage={(mediaType) => {
          setDirty(true);
          setSelectedImages((current) => ({
            ...current,
            [mediaType]: null,
          }));
          update(
            mediaType === "logo" ? "logoStoragePath" : "coverStoragePath",
            null,
          );
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
          loadingLabel={step.number === 6 ? "Creating profile" : "Saving"}
          className="w-full sm:w-auto"
        >
          {step.number === 6 ? "Save and continue to documents" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

function StepFields({
  step,
  values,
  loading,
  fieldErrors,
  selectedImages,
  setSelectedImage,
  removeImage,
  update,
}: {
  step: number;
  values: FormValues;
  loading: boolean;
  fieldErrors: Record<string, string>;
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
  const textList = (value: string) =>
    [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
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
        <FormField label="Owner phone" description="Use a Philippine number, such as 0917 123 4567." required disabled={loading} error={fieldErrors.ownerPhone}>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={values.ownerPhone} onChange={(event) => update("ownerPhone", event.target.value)} onBlur={() => {
            const normalized = normalizePhilippinePhone(values.ownerPhone);
            if (normalized) update("ownerPhone", normalized);
          }} />
        </FormField>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Business name" required disabled={loading} error={fieldErrors.businessName}>
          <Input autoComplete="organization" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} />
        </FormField>
        <FormField label="Business email" required disabled={loading} error={fieldErrors.businessEmail}>
          <Input type="email" inputMode="email" autoComplete="email" value={values.businessEmail} onChange={(event) => update("businessEmail", event.target.value)} onBlur={() => {
            const normalized = normalizeProviderEmail(values.businessEmail);
            if (normalized) update("businessEmail", normalized);
          }} />
        </FormField>
        <FormField label="Business phone" description="Use a Philippine mobile or landline number." required disabled={loading} error={fieldErrors.businessPhone}>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={values.businessPhone} onChange={(event) => update("businessPhone", event.target.value)} onBlur={() => {
            const normalized = normalizePhilippinePhone(values.businessPhone);
            if (normalized) update("businessPhone", normalized);
          }} />
        </FormField>
        <FormField className="sm:col-span-2" label="Business description" description="Describe your services in at least 20 characters." required disabled={loading} error={fieldErrors.description}>
          <Textarea minLength={20} maxLength={2000} value={values.description} onChange={(event) => update("description", event.target.value)} />
        </FormField>
        <ProviderBusinessImageField
          mediaType="logo"
          currentPath={values.logoStoragePath}
          selectedFile={selectedImages.logo}
          disabled={loading}
          error={fieldErrors.logoStoragePath || undefined}
          onSelect={(file) => setSelectedImage("logo", file)}
          onRemove={() => removeImage("logo")}
        />
        <ProviderBusinessImageField
          mediaType="cover"
          currentPath={values.coverStoragePath}
          selectedFile={selectedImages.cover}
          disabled={loading}
          error={fieldErrors.coverStoragePath || undefined}
          onSelect={(file) => setSelectedImage("cover", file)}
          onRemove={() => removeImage("cover")}
        />
      </div>
    );
  }

  if (step === 3) {
    const availableCategories = values.providerServiceType === "catering"
      ? CATERING_SERVICE_CATEGORIES
      : values.providerServiceType === "addon"
        ? ADDON_SERVICE_CATEGORIES
        : PROVIDER_SERVICE_CATEGORIES;
    return (
      <div className="grid gap-4">
        <FormField label="Service type" required disabled={loading} error={fieldErrors.providerServiceType}>
          <Select value={values.providerServiceType} onChange={(event) => {
            const nextType = event.target.value as FormValues["providerServiceType"];
            const categories = values.serviceCategories.filter((category) =>
              serviceCategoryMatchesProviderType(category, nextType)
            );
            update("providerServiceType", nextType);
            update("serviceCategories", categories);
            update("providerCategory", categories[0] ?? "");
          }}>
            <option value="catering">Catering</option>
            <option value="addon">Add-on services</option>
            <option value="both">Catering and add-ons</option>
          </Select>
        </FormField>
        <CheckboxGroup
          legend="Supported service categories"
          description="Choose every category this business can deliver."
          values={availableCategories}
          selected={values.serviceCategories}
          disabled={loading}
          error={fieldErrors.serviceCategories}
          label={serviceCategoryLabel}
          onToggle={(category) => {
            const next = toggleList(values.serviceCategories, category);
            update("serviceCategories", next);
            update("providerCategory", next[0] ?? "");
          }}
        />
        <CheckboxGroup
          legend="Supported event types"
          description="Choose the event types this business accepts."
          values={PROVIDER_EVENT_TYPES}
          selected={values.eventTypesSupported}
          disabled={loading}
          error={fieldErrors.eventTypesSupported}
          label={titleFromValue}
          onToggle={(eventType) =>
            update(
              "eventTypesSupported",
              toggleList(values.eventTypesSupported, eventType),
            )}
        />
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField className="sm:col-span-2" label="Business address" required disabled={loading}>
          <Input autoComplete="street-address" value={values.address} onChange={(event) => update("address", event.target.value)} />
        </FormField>
        <FormField label="City" required disabled={loading}>
          <Input autoComplete="address-level2" value={values.city} onChange={(event) => update("city", event.target.value)} />
        </FormField>
        <FormField label="Province" required disabled={loading}>
          <Input autoComplete="address-level1" value={values.province} onChange={(event) => update("province", event.target.value)} />
        </FormField>
        <FormField className="sm:col-span-2" label="Service coverage" description="Separate cities or areas with commas." required disabled={loading} error={fieldErrors.serviceAreas}>
          <Input value={values.serviceAreas.join(", ")} onChange={(event) => update("serviceAreas", textList(event.target.value))} placeholder="Ormoc City, Albuera, Kananga" />
        </FormField>
        <NumberField
          label="Maximum service distance (km)"
          description="Optional planning limit; each booking is still checked by the backend."
          value={values.maxServiceDistanceKm}
          minimum={1}
          maximum={1000}
          required={false}
          disabled={loading}
          error={fieldErrors.maxServiceDistanceKm}
          onChange={(value) =>
            update(
              "maxServiceDistanceKm",
              value === "" ? null : Number(value),
            )}
        />
        <FormField label="Latitude" description="Optional." disabled={loading}>
          <Input type="number" step="any" value={values.locationCoordinates?.latitude ?? ""} onChange={(event) => updateCoordinate(values, update, "latitude", event.target.value)} />
        </FormField>
        <FormField label="Longitude" description="Optional." disabled={loading}>
          <Input type="number" step="any" value={values.locationCoordinates?.longitude ?? ""} onChange={(event) => updateCoordinate(values, update, "longitude", event.target.value)} />
        </FormField>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Minimum guests per event" value={values.minGuestsPerEvent} minimum={1} disabled={loading} error={fieldErrors.minGuestsPerEvent} onChange={(value) => update("minGuestsPerEvent", integer(value))} />
        <NumberField label="Maximum guests per event" value={values.maxGuestsPerEvent} minimum={1} disabled={loading} error={fieldErrors.maxGuestsPerEvent} onChange={(value) => update("maxGuestsPerEvent", integer(value))} />
        <NumberField label="Available staff" value={values.availableStaffCount} minimum={0} disabled={loading} onChange={(value) => update("availableStaffCount", integer(value))} />
        <NumberField label="Available equipment units" value={values.availableEquipmentCount} minimum={0} disabled={loading} onChange={(value) => update("availableEquipmentCount", integer(value))} />
        <NumberField label="Maximum events per day" value={values.maxEventsPerDay} minimum={1} disabled={loading || !values.acceptsMultipleEventsPerDay} onChange={(value) => update("maxEventsPerDay", integer(value, 1))} />
        <NumberField label="Booking lead time (days)" value={values.bookingLeadTimeDays} minimum={0} maximum={365} disabled={loading} error={fieldErrors.bookingLeadTimeDays} onChange={(value) => update("bookingLeadTimeDays", integer(value))} />
        <div className="sm:col-span-2">
          <CheckboxField
            label="Accept multiple events on the same day"
            description="Only enable this when staffing and equipment capacity support it."
            checked={values.acceptsMultipleEventsPerDay}
            disabled={loading}
            onChange={(event) => {
              update("acceptsMultipleEventsPerDay", event.target.checked);
              if (!event.target.checked) update("maxEventsPerDay", 1);
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <CheckboxGroup
            legend="Operating days"
            description="These are normal operating days, not a promise of availability."
            values={PROVIDER_OPERATING_DAYS}
            selected={values.operatingDays}
            disabled={loading}
            error={fieldErrors.operatingDays}
            label={titleFromValue}
            onToggle={(day) =>
              update("operatingDays", toggleList(values.operatingDays, day))}
          />
        </div>
        <FormField
          className="sm:col-span-2"
          label="Unavailable dates"
          description="Optional dates in YYYY-MM-DD format, separated by commas. Booking availability is verified separately."
          disabled={loading}
          error={fieldErrors.unavailableDates}
        >
          <Textarea
            value={values.unavailableDates.join(", ")}
            placeholder="2026-12-24, 2026-12-25"
            onChange={(event) =>
              update("unavailableDates", textList(event.target.value))}
          />
        </FormField>
        <div className="sm:col-span-2">
          <AuthStatus
            tone="info"
            message="Capacity and schedule settings are planning constraints only. FEASTA verifies actual availability when a booking is submitted."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        Review the current <Link className="font-semibold text-primary underline" href="/terms">Terms</Link> and{" "}
        <Link className="font-semibold text-primary underline" href="/privacy">Privacy Policy</Link>.
      </p>
      <CheckboxField
        label="I accept the Terms"
        checked={values.acceptedTerms}
        required
        disabled={loading}
        onChange={(event) => update("acceptedTerms", event.target.checked)}
      />
      <CheckboxField
        label="I accept the Privacy Policy"
        checked={values.acceptedPrivacy}
        required
        disabled={loading}
        onChange={(event) => update("acceptedPrivacy", event.target.checked)}
      />
      <AuthStatus
        tone="info"
        message="Saving this step records server-generated consent timestamps. Your provider profile remains inactive and unapproved."
      />
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
    businessEmail: draft.businessEmail ?? draft.ownerEmail,
    businessPhone: draft.businessPhone ?? "",
    description: draft.description ?? "",
    providerServiceType: draft.providerServiceType ?? "catering",
    providerCategory: PROVIDER_SERVICE_CATEGORIES.includes(
      draft.providerCategory as ProviderServiceCategory,
    )
      ? draft.providerCategory as ProviderServiceCategory
      : "catering_service",
    serviceCategories: draft.serviceCategories?.length
      ? draft.serviceCategories
      : PROVIDER_SERVICE_CATEGORIES.includes(
          draft.providerCategory as ProviderServiceCategory,
        )
        ? [draft.providerCategory as ProviderServiceCategory]
        : ["catering_service"],
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
    bookingLeadTimeDays: draft.bookingLeadTimeDays ?? 0,
    unavailableDates: draft.unavailableDates ?? [],
    logoStoragePath: draft.logoStoragePath ?? null,
    coverStoragePath: draft.coverStoragePath ?? null,
    acceptedTerms: draft.acceptedTerms,
    acceptedPrivacy: draft.acceptedPrivacy,
    termsPolicyVersion: draft.termsPolicyVersion,
    privacyPolicyVersion: draft.privacyPolicyVersion,
  };
}

function stepPayload(
  step: number,
  values: FormValues,
): Record<string, unknown> {
  if (step === 1) return pick(values, ["ownerFirstName", "ownerLastName", "ownerPhone"]);
  if (step === 2) return pick(values, ["businessName", "businessEmail", "businessPhone", "description", "logoStoragePath", "coverStoragePath"]);
  if (step === 3) return pick(values, ["providerServiceType", "providerCategory", "serviceCategories", "eventTypesSupported"]);
  if (step === 4) return pick(values, ["address", "city", "province", "serviceAreas", "maxServiceDistanceKm", "locationCoordinates"]);
  if (step === 5) return pick(values, ["minGuestsPerEvent", "maxGuestsPerEvent", "acceptsMultipleEventsPerDay", "maxEventsPerDay", "availableStaffCount", "availableEquipmentCount", "operatingDays", "bookingLeadTimeDays", "unavailableDates"]);
  return pick(values, ["acceptedTerms", "acceptedPrivacy", "termsPolicyVersion", "privacyPolicyVersion"]);
}

function pick(
  values: FormValues,
  fields: readonly (keyof FormValues)[],
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, values[field]]));
}

function updateCoordinate(
  values: FormValues,
  update: <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => void,
  key: "latitude" | "longitude",
  raw: string,
) {
  if (raw === "") {
    update("locationCoordinates", null);
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  update("locationCoordinates", {
    latitude: key === "latitude"
      ? value
      : values.locationCoordinates?.latitude ?? 0,
    longitude: key === "longitude"
      ? value
      : values.locationCoordinates?.longitude ?? 0,
  });
}

function prepareStepValues(
  step: number,
  values: FormValues,
): {values: FormValues; errors: Record<string, string>} {
  const normalized = {...values};
  const errors: Record<string, string> = {};
  if (step === 1) {
    normalized.ownerFirstName = values.ownerFirstName.trim();
    normalized.ownerLastName = values.ownerLastName.trim();
    const phone = normalizePhilippinePhone(values.ownerPhone);
    if (!normalized.ownerFirstName) {
      errors.ownerFirstName = "Enter the owner's first name.";
    }
    if (!normalized.ownerLastName) {
      errors.ownerLastName = "Enter the owner's last name.";
    }
    if (!phone) {
      errors.ownerPhone = "Enter a valid Philippine phone number.";
    } else {
      normalized.ownerPhone = phone;
    }
  }
  if (step === 2) {
    normalized.businessName = values.businessName.trim();
    normalized.description = values.description.trim();
    const email = normalizeProviderEmail(values.businessEmail);
    const phone = normalizePhilippinePhone(values.businessPhone);
    if (normalized.businessName.length < 2) {
      errors.businessName = "Enter a business name.";
    }
    if (!email) {
      errors.businessEmail = "Enter a valid business email address.";
    } else {
      normalized.businessEmail = email;
    }
    if (!phone) {
      errors.businessPhone = "Enter a valid Philippine phone number.";
    } else {
      normalized.businessPhone = phone;
    }
    if (normalized.description.length < 20) {
      errors.description =
        "Describe the business using at least 20 characters.";
    }
  }
  if (step === 3) {
    if (values.serviceCategories.length === 0) {
      errors.serviceCategories = "Choose at least one service category.";
    }
    if (values.eventTypesSupported.length === 0) {
      errors.eventTypesSupported = "Choose at least one event type.";
    }
  }
  if (step === 4) {
    if (values.serviceAreas.length === 0) {
      errors.serviceAreas = "Enter at least one service coverage area.";
    }
    if (
      values.maxServiceDistanceKm != null &&
      (!Number.isFinite(values.maxServiceDistanceKm) ||
        values.maxServiceDistanceKm < 1 ||
        values.maxServiceDistanceKm > 1000)
    ) {
      errors.maxServiceDistanceKm =
        "Enter a distance from 1 to 1,000 km, or leave it blank.";
    }
  }
  if (step === 5) {
    if (
      values.minGuestsPerEvent < 1 ||
      values.minGuestsPerEvent > values.maxGuestsPerEvent
    ) {
      errors.minGuestsPerEvent =
        "Minimum guests must be at least 1 and not exceed the maximum.";
    }
    if (values.maxGuestsPerEvent < 1) {
      errors.maxGuestsPerEvent = "Maximum guests must be at least 1.";
    }
    if (values.operatingDays.length === 0) {
      errors.operatingDays = "Choose at least one operating day.";
    }
    if (
      values.bookingLeadTimeDays < 0 ||
      values.bookingLeadTimeDays > 365
    ) {
      errors.bookingLeadTimeDays =
        "Booking lead time must be between 0 and 365 days.";
    }
    if (values.unavailableDates.some((date) =>
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    )) {
      errors.unavailableDates = "Use valid YYYY-MM-DD dates.";
    }
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

function serviceCategoryLabel(value: ProviderServiceCategory): string {
  const labels: Record<ProviderServiceCategory, string> = {
    catering_service: "Catering service",
    food_trays_packed_meals: "Food trays / packed meals",
    catering_event_styling: "Catering and event styling",
    photographer: "Photographer",
    videographer: "Videographer",
    photo_booth: "Photo booth",
    event_coordinator: "Event coordinator",
    event_host_emcee: "Event host / emcee",
    sound_system: "Sound system",
    lights_and_sounds: "Lights and sounds",
    singer_band: "Singer / band",
    dancer_performer: "Dancer / performer",
    decorator_event_stylist: "Decorator / event stylist",
    florist: "Florist",
    cake_provider: "Cake provider",
    gown_suit_rental: "Gown / suit rental",
    car_rental: "Car rental",
    venue_provider: "Venue provider",
    tables_chairs_rental: "Tables and chairs rental",
    other_event_service: "Other event service",
  };
  return labels[value];
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

async function cleanupReplacedMedia(
  previous: {logo: string | null; cover: string | null},
  current: FormValues,
): Promise<void> {
  const obsolete = [
    previous.logo &&
      previous.logo !== current.logoStoragePath
      ? previous.logo
      : null,
    previous.cover &&
      previous.cover !== current.coverStoragePath
      ? previous.cover
      : null,
  ].filter((path): path is string => Boolean(path));
  await Promise.allSettled(
    obsolete.map((path) => deleteProviderOnboardingImage(path)),
  );
}
