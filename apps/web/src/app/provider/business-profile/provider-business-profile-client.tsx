"use client";

import {
  BadgeCheck,
  Building2,
  ImageIcon,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useMemo, useRef, useState} from "react";

import {normalizePhilippinePhone} from "@feasta/shared-types";

import {AuthStatus} from "@/components/auth/auth-status";
import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {PageHeading} from "@/components/layout/page-heading";
import {ProviderBusinessImageField} from "@/components/provider/provider-business-image-field";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {
  updateProviderBusinessProfile,
} from "@/lib/provider/business-profile/provider-business-profile-client";
import type {
  ProviderBusinessMedia,
  ProviderBusinessProfile,
  UpdateProviderBusinessProfileInput,
} from "@/lib/provider/business-profile/provider-business-profile-types";
import {
  uploadProviderOnboardingImage,
} from "@/lib/provider/provider-media-client";

type ProfileForm = {
  businessPhone: string;
  description: string;
  address: string;
  city: string;
  province: string;
};

type ProfileField = keyof ProfileForm;
type MediaType = "logo" | "cover";
type FormErrors = Partial<Record<ProfileField | MediaType, string>>;

type MediaDraft = {
  file: File | null;
  remove: boolean;
};

const emptyMediaDraft: MediaDraft = {file: null, remove: false};

export function ProviderBusinessProfileClient({
  initialProfile,
}: {
  initialProfile: ProviderBusinessProfile;
}) {
  const router = useRouter();
  const initialForm = useMemo(
    () => profileForm(initialProfile),
    [initialProfile],
  );
  const operation = useRef(false);
  const [canonicalForm, setCanonicalForm] = useState(initialForm);
  const [form, setForm] = useState(initialForm);
  const [logo, setLogo] = useState(initialProfile.logo);
  const [coverImage, setCoverImage] = useState(initialProfile.coverImage);
  const [logoDraft, setLogoDraft] = useState<MediaDraft>(emptyMediaDraft);
  const [coverDraft, setCoverDraft] = useState<MediaDraft>(emptyMediaDraft);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const dirty = serializeForm(form) !== serializeForm(canonicalForm) ||
    logoDraft.file !== null || logoDraft.remove ||
    coverDraft.file !== null || coverDraft.remove;

  function updateField(field: ProfileField, value: string) {
    setForm((current) => ({...current, [field]: value}));
    setErrors((current) => ({...current, [field]: undefined}));
    clearStatus();
  }

  function chooseMedia(mediaType: MediaType, file: File | null) {
    const validationError = file ? validateMediaFile(mediaType, file) : null;
    setErrors((current) => ({...current, [mediaType]: validationError ?? undefined}));
    setSuccessMessage(null);
    setErrorMessage(null);

    if (validationError) return;
    const draft = {file, remove: false};
    if (mediaType === "logo") setLogoDraft(draft);
    else setCoverDraft(draft);
  }

  function removeMedia(mediaType: MediaType) {
    setErrors((current) => ({...current, [mediaType]: undefined}));
    setSuccessMessage(null);
    setErrorMessage(null);
    const currentMedia = mediaType === "logo" ? logo : coverImage;
    const draft = {file: null, remove: currentMedia !== null};
    if (mediaType === "logo") setLogoDraft(draft);
    else setCoverDraft(draft);
  }

  function discardChanges() {
    if (saving) return;
    setForm(canonicalForm);
    setLogoDraft(emptyMediaDraft);
    setCoverDraft(emptyMediaDraft);
    setErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function saveProfile() {
    if (operation.current || !dirty) return;

    const validated = validateForm(form);
    setErrors(validated.errors);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!validated.value) {
      setErrorMessage("Review the highlighted business profile information.");
      return;
    }

    operation.current = true;
    setSaving(true);

    try {
      let uploadedLogo: ProviderBusinessMedia | null | undefined;
      let uploadedCover: ProviderBusinessMedia | null | undefined;

      if (logoDraft.file) {
        uploadedLogo = await uploadProviderOnboardingImage("logo", logoDraft.file);
      } else if (logoDraft.remove) {
        uploadedLogo = null;
      }

      if (coverDraft.file) {
        uploadedCover = await uploadProviderOnboardingImage("cover", coverDraft.file);
      } else if (coverDraft.remove) {
        uploadedCover = null;
      }

      const input = changedInput(
        canonicalForm,
        validated.value,
        uploadedLogo,
        uploadedCover,
      );

      if (Object.keys(input).length > 0) {
        await updateProviderBusinessProfile(input);
      }

      const nextLogo = uploadedLogo === undefined ? logo : uploadedLogo;
      const nextCover = uploadedCover === undefined ? coverImage : uploadedCover;
      setCanonicalForm(validated.value);
      setForm(validated.value);
      setLogo(nextLogo);
      setCoverImage(nextCover);
      setLogoDraft(emptyMediaDraft);
      setCoverDraft(emptyMediaDraft);
      setErrors({});
      setSuccessMessage("Business profile saved.");
      feastaToast.success("Business profile saved.");
      router.refresh();
    } catch (error) {
      const message = safeErrorMessage(
        error,
        "The business profile could not be saved. Please try again.",
      );
      setErrorMessage(message);
      feastaToast.error(message);
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }

  function clearStatus() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  const visibleLogo = logoDraft.remove ? null : logo;
  const visibleCover = coverDraft.remove ? null : coverImage;
  const categories = initialProfile.serviceCategories.length > 0
    ? initialProfile.serviceCategories
    : initialProfile.primaryServiceCategory
      ? [initialProfile.primaryServiceCategory]
      : [];

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Business"
        title="Business Profile"
        description="Manage the public business information customers use when evaluating your services."
      />

      <section
        className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card"
        aria-labelledby="public-preview-title"
      >
        <div className="relative min-h-40 bg-muted sm:min-h-52">
          {visibleCover?.url ? (
            // Public provider images are delivered through Cloudinary.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={visibleCover.url}
              alt={`${initialProfile.businessName} cover`}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <ImagePlaceholder
              label="Business cover image unavailable"
              className="absolute inset-0 size-full rounded-none"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" aria-hidden="true" />
        </div>
        <div className="relative grid min-w-0 gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-12 size-24 overflow-hidden rounded-xl border-4 border-card bg-muted shadow-card sm:size-28">
            {visibleLogo?.url ? (
              // Public provider images are delivered through Cloudinary.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={visibleLogo.url}
                alt={`${initialProfile.businessName} logo`}
                className="size-full object-cover"
              />
            ) : (
              <ImagePlaceholder
                label="Business logo unavailable"
                className="size-full min-h-0 rounded-none p-2"
              />
            )}
          </div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Public profile preview</p>
              <h2 id="public-preview-title" className="mt-1 break-words text-2xl font-bold">
                {initialProfile.businessName}
              </h2>
              <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{form.city}, {form.province}</span>
              </p>
            </div>
            <p className="w-fit rounded-pill border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-bold text-primary">
              {providerServiceTypeLabel(initialProfile.providerServiceType)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Service categories">
            {categories.map((category) => (
              <span key={category} className="rounded-pill border border-border bg-muted px-3 py-1 text-sm font-semibold">
                {providerCategoryLabel(category)}
              </span>
            ))}
          </div>
          <p className="max-w-4xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {form.description}
          </p>
        </div>
      </section>

      <section
        className="grid gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
        aria-labelledby="verified-information-title"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-success-subtle p-2 text-success">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="verified-information-title" className="text-xl font-bold">Verified business information</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Business identity and service capabilities are read-only here. Changes require the appropriate FEASTA verification or account process.
            </p>
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyDetail icon={Building2} label="Business name" value={initialProfile.businessName} />
          <ReadOnlyDetail icon={BadgeCheck} label="Business email" value={initialProfile.businessEmail} />
          <ReadOnlyDetail icon={ShieldCheck} label="Provider service type" value={providerServiceTypeLabel(initialProfile.providerServiceType)} />
          <ReadOnlyDetail
            icon={BadgeCheck}
            label="Service categories"
            value={categories.map(providerCategoryLabel).join(", ") || "Not available"}
          />
        </dl>
      </section>

      <form
        className="grid min-w-0 gap-6"
        aria-label="Business profile"
        aria-busy={saving || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          void saveProfile();
        }}
        noValidate
      >
        <section className="grid gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="description-title">
          <SectionHeading icon={Building2} id="description-title" title="Business Description" description="Tell customers what your business offers and what makes your service a good fit for their event." />
          <FormField
            label="Description"
            description={`${form.description.length}/2000 characters. Minimum 20 characters.`}
            error={errors.description}
            required
            disabled={saving}
          >
            <Textarea
              value={form.description}
              maxLength={2000}
              rows={7}
              onChange={(event) => updateField("description", event.target.value)}
            />
          </FormField>
        </section>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <section className="grid content-start gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="contact-title">
            <SectionHeading icon={Phone} id="contact-title" title="Business Contact" description="Use the public business number customers can use for event inquiries." />
            <FormField label="Business phone" error={errors.businessPhone} required disabled={saving}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.businessPhone}
                onChange={(event) => updateField("businessPhone", event.target.value)}
              />
            </FormField>
          </section>

          <section className="grid content-start gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="location-title">
            <SectionHeading icon={MapPin} id="location-title" title="Business Location" description="Keep your canonical business address accurate for customer-facing discovery." />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField className="sm:col-span-2" label="Address" error={errors.address} required disabled={saving}>
                <Input
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                />
              </FormField>
              <FormField label="City" error={errors.city} required disabled={saving}>
                <Input
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(event) => updateField("city", event.target.value)}
                />
              </FormField>
              <FormField label="Province" error={errors.province} required disabled={saving}>
                <Input
                  autoComplete="address-level1"
                  value={form.province}
                  onChange={(event) => updateField("province", event.target.value)}
                />
              </FormField>
            </div>
          </section>
        </div>

        <section className="grid gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="media-title">
          <SectionHeading icon={ImageIcon} id="media-title" title="Business Media" description="Use a recognizable logo and a wide cover photo. Media is uploaded through FEASTA's secured provider image workflow." />
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <ProviderBusinessImageField
              mediaType="logo"
              currentUrl={visibleLogo?.url ?? null}
              selectedFile={logoDraft.file}
              disabled={saving}
              error={errors.logo}
              onSelect={(file) => chooseMedia("logo", file)}
              onRemove={() => removeMedia("logo")}
            />
            <ProviderBusinessImageField
              mediaType="cover"
              currentUrl={visibleCover?.url ?? null}
              selectedFile={coverDraft.file}
              disabled={saving}
              error={errors.cover}
              onSelect={(file) => chooseMedia("cover", file)}
              onRemove={() => removeMedia("cover")}
            />
          </div>
        </section>

        <section className="sticky bottom-3 z-10 grid gap-3 rounded-card border border-border bg-card/95 p-4 shadow-card backdrop-blur sm:flex sm:items-center sm:justify-between" aria-label="Business profile save controls">
          <div className="min-w-0">
            <p className="font-bold">{dirty ? "You have unsaved changes." : "Your saved profile is up to date."}</p>
            <p className="text-sm text-muted-foreground">Changes are published from the canonical provider profile after a successful save.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" disabled={saving || !dirty} onClick={discardChanges}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Discard changes
            </Button>
            <Button type="submit" loading={saving} disabled={saving || !dirty}>
              <Save className="size-4" aria-hidden="true" />
              Save Business Profile
            </Button>
          </div>
        </section>

        {successMessage ? <AuthStatus message={successMessage} tone="success" /> : null}
        {errorMessage ? <AuthStatus message={errorMessage} tone="error" /> : null}
      </form>
    </div>
  );
}

function ReadOnlyDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-4">
      <dt className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 break-words font-semibold">{value}</dd>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  id,
  title,
  description,
}: {
  icon: typeof Building2;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div>
        <h2 id={id} className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function profileForm(profile: ProviderBusinessProfile): ProfileForm {
  return {
    businessPhone: profile.businessPhone,
    description: profile.description,
    address: profile.address,
    city: profile.city,
    province: profile.province,
  };
}

function serializeForm(form: ProfileForm): string {
  return JSON.stringify(form);
}

function validateForm(form: ProfileForm): {
  value: ProfileForm | null;
  errors: FormErrors;
} {
  const errors: FormErrors = {};
  const businessPhone = normalizePhilippinePhone(form.businessPhone);
  const description = form.description.trim();
  const address = form.address.trim();
  const city = form.city.trim();
  const province = form.province.trim();

  if (!businessPhone) {
    errors.businessPhone = "Enter a valid Philippine business phone number.";
  }
  validateText(errors, "description", description, 20, 2000, "Description");
  validateText(errors, "address", address, 3, 250, "Address");
  validateText(errors, "city", city, 2, 100, "City");
  validateText(errors, "province", province, 2, 100, "Province");

  return {
    value: Object.keys(errors).length === 0 && businessPhone
      ? {businessPhone, description, address, city, province}
      : null,
    errors,
  };
}

function validateText(
  errors: FormErrors,
  field: ProfileField,
  value: string,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (value.length < minimum || value.length > maximum) {
    errors[field] = `${label} must be between ${minimum} and ${maximum} characters.`;
  }
}

function validateMediaFile(mediaType: MediaType, file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  const maximum = mediaType === "logo" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size <= 0 || file.size > maximum) {
    return `The ${mediaType === "logo" ? "logo" : "cover"} must be no larger than ${mediaType === "logo" ? "5" : "10"} MB.`;
  }
  return null;
}

function changedInput(
  canonical: ProfileForm,
  next: ProfileForm,
  logo: ProviderBusinessMedia | null | undefined,
  coverImage: ProviderBusinessMedia | null | undefined,
): UpdateProviderBusinessProfileInput {
  const input: UpdateProviderBusinessProfileInput = {};
  for (const field of [
    "businessPhone",
    "description",
    "address",
    "city",
    "province",
  ] as const) {
    if (canonical[field] !== next[field]) input[field] = next[field];
  }
  if (logo !== undefined) input.logo = logo;
  if (coverImage !== undefined) input.coverImage = coverImage;
  return input;
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0 && message.length <= 240) return message;
  }
  return fallback;
}
