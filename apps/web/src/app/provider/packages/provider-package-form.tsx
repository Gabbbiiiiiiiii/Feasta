"use client";

import {
  useMemo,
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
} from "@/lib/provider/provider-package-client";

import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import {packageImageDrafts} from "@/lib/provider/catalog-media";

import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";

import {Textarea} from "@/components/ui/textarea";
import {Select} from "@/components/ui/select";

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
  eventTypesSupported: string[];
  minGuestsPerEvent: number;
  maxGuestsPerEvent: number;

  initialPackage?: ProviderPackage;

  onSaved: () => void | Promise<void>;
  onCancel: () => void;
  onSubmittingChange?: (busy: boolean) => void;
};

export function ProviderPackageForm({
  dialogLayout = false,
  providerServiceType = "catering",
  serviceCategories = [],
  eventTypesSupported,
  minGuestsPerEvent,
  maxGuestsPerEvent,
  initialPackage,
  onSaved,
  onCancel,
  onSubmittingChange,
}: ProviderPackageFormProps) {
  const capabilities = providerContentCapabilities(providerServiceType, serviceCategories);
  const editing =
    initialPackage !== undefined;
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

  const [price, setPrice] =
    useState(
      initialPackage
        ? String(initialPackage.price)
        : "",
    );

  const [
    downPaymentPercentage,
    setDownPaymentPercentage,
  ] = useState(
    initialPackage
      ? String(
          initialPackage
            .downPaymentPercentage,
        )
      : "20",
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
    foodInclusionsText,
    setFoodInclusionsText,
  ] = useState(
    initialPackage?.foodInclusions.join(
      "\n",
    ) ?? "",
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

  const [images, setImages] = useState(() => packageImageDrafts(initialPackage?.imageUrls, initialPackage?.imageUrl));

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const parsedPrice = Number(price);
  const parsedDownPayment =
    Number(downPaymentPercentage);
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
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > 10_000_000
      ) {
        return {field: "price", message: "Enter a valid package price."};
      }

      if (
        !Number.isFinite(
          parsedDownPayment,
        ) ||
        parsedDownPayment < 0 ||
        parsedDownPayment > 100
      ) {
        return {field: "downPayment", message: "Down payment must be between 0 and 100%."};
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
      parsedPrice,
      parsedDownPayment,
      parsedMinimumGuests,
      parsedMaximumGuests,
      availableEventTypes,
      minGuestsPerEvent,
      maxGuestsPerEvent,
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
    onSubmittingChange?.(true);
    setError(null);

    try {
      const uploaded = await uploadCatalogImages(images, (saved) => setImages((current) => current.map((image) => image.id === saved.id ? saved : image)));
      const input: ProviderPackageInput = {
        name: name.trim(),
        description:
          description.trim(),
        eventType,
        price: parsedPrice,
        downPaymentPercentage:
          parsedDownPayment,
        minimumGuests:
          parsedMinimumGuests,
        maximumGuests:
          parsedMaximumGuests,
        imageUrl: uploaded[0]?.url ?? "",
        imageUrls: uploaded.map((image) => image.url),
        foodInclusions:
          parseInclusions(
            foodInclusionsText,
          ),
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
      console.error(
        editing
          ? "[FEASTA update package]"
          : "[FEASTA create package]",
        caught,
      );

      setError(
        editing
          ? "The package could not be updated. Check the details and try again."
          : "The package could not be created. Check the details and try again.",
      );
    } finally {
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
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
      <div role={dialogLayout ? "region" : undefined} aria-label={dialogLayout ? "Package details" : undefined} tabIndex={dialogLayout ? 0 : undefined}
        className={
        dialogLayout
          ? "mx-2 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-3 py-5 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:mx-3"
          : "grid min-w-0 gap-5"
      }>
      <h3 className="text-sm font-bold uppercase text-primary-strong">Basic details</h3>
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

      <h3 className="text-sm font-bold uppercase text-primary-strong">Pricing &amp; capacity</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Package price"
          error={validationError?.field === "price" ? validationError.message : undefined}
          required
        >
          <Input
            type="number"
            min="0"
            max="10000000"
            step="0.01"
            value={price}
            onChange={(event) =>
              setPrice(
                event.target.value,
              )
            }
          />
        </FormField>

        <FormField
          label="Down payment (%)"
          error={validationError?.field === "downPayment" ? validationError.message : undefined}
          required
        >
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={
              downPaymentPercentage
            }
            onChange={(event) =>
              setDownPaymentPercentage(
                event.target.value,
              )
            }
          />
        </FormField>
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

      <section aria-label="Images" className="grid gap-3"><h3 className="text-sm font-bold uppercase text-primary-strong">Images</h3>
        <CatalogImageUploader images={images} onChange={setImages} disabled={submitting} />
      </section>

      <section aria-label="Optional inclusions" className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="text-sm font-bold uppercase text-primary-strong">Optional inclusions</h3>
      <p className="mt-1 text-sm text-muted-foreground">Optional — add inclusions to help customers understand what this package covers. Every inclusion field is optional.</p></div>
      {capabilities.catering ? <InclusionTextarea
        label="Food inclusions"
        value={foodInclusionsText}
        onChange={
          setFoodInclusionsText
        }
      /> : null}

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

      </div>
      <div className={dialogLayout ? "grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4 sm:px-6" : "grid gap-3"}>
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

        <Button
          type="submit"
          disabled={
            submitting ||
            Boolean(
              validationError,
            )
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
        </Button>
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
