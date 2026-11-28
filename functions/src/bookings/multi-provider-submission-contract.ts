import {isCanonicalEventTimeRange} from "../provider-availability/validate-provider-availability.js";
/**
 * FEASTA Task 3: bounded multi-provider submission envelope.
 *
 * This parser does NOT authorize booking creation.
 * Every configuration must undergo current server-side package,
 * pricing, availability, payment-policy and agreement validation.
 */

export type MultiProviderSubmissionEntry = {
  providerId: string;
  packageId: string;
  configuration: Readonly<Record<string, unknown>>;
};

export type MultiProviderSubmissionEnvelope = {
  schemaVersion: 1;
  clientRequestId: string;
  event: Readonly<Record<string, unknown>>;
  selections: readonly MultiProviderSubmissionEntry[];
};

// Conservative initial limit. Revisit only after assessing the
// complete Firestore transaction's read and write budget.
export const MAX_MULTI_PROVIDER_SELECTIONS = 4;

export class MultiProviderContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultiProviderContractError";
  }
}

function invalid(message: string): never {
  throw new MultiProviderContractError(message);
}

function record(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return invalid("Expected a structured object.");
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    return invalid("Invalid object representation.");
  }

  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): void {
  const expected = new Set(required);

  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    invalid("Unexpected or missing submission fields.");
  }
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{8,160}$/.test(value)
  ) {
    return invalid(`Invalid ${label}.`);
  }

  return value;
}

function boundedText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    return invalid(`Invalid ${label}.`);
  }

  return value.trim();
}

function clock(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ) {
    return invalid(`Invalid ${label}.`);
  }

  return value;
}

function eventDetails(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const input = record(value);

  exactKeys(input, [
    "eventType",
    "eventDate",
    "eventTime",
    "eventEndTime",
    "guestCount",
    "eventLocation",
    "eventAddress",
    "specialRequest",
  ]);

  const eventType = boundedText(input.eventType, "event type", 120);
  const eventDate = boundedText(input.eventDate, "event date", 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
    !Number.isFinite(Date.parse(`${eventDate}T00:00:00Z`)) ||
    new Date(`${eventDate}T00:00:00Z`)
      .toISOString().slice(0, 10) !== eventDate
  ) {
    invalid("Invalid calendar date.");
  }

  const eventTime = clock(input.eventTime, "event time");
  const eventEndTime = clock(input.eventEndTime, "end time");

  if (!isCanonicalEventTimeRange(eventTime, eventEndTime)) {
    invalid("Invalid event time range.");
  }

  const guestCount = input.guestCount;

  if (
    typeof guestCount !== "number" ||
    !Number.isSafeInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10000
  ) {
    invalid("Invalid guest count.");
  }

  const eventLocation = boundedText(
    input.eventLocation,
    "event location",
    180,
  );

  const eventAddress = boundedText(
    input.eventAddress,
    "event address",
    500,
  );

  if (
    typeof input.specialRequest !== "string" ||
    input.specialRequest.length > 1000
  ) {
    invalid("Invalid special request.");
  }

  return {
    eventType,
    eventDate,
    eventTime,
    eventEndTime,
    guestCount,
    eventLocation,
    eventAddress,
    specialRequest: input.specialRequest,
  };
}

/**
 * Parse the transport envelope only.
 *
 * configuration is deliberately NOT validated or trusted here.
 * The 14C2 authoritative resolver must validate every field against
 * the current provider, published package, and booking policies.
 *
 * Do not route this parser's output directly into Firestore writes.
 */
export function parseMultiProviderSubmissionEnvelope(
  value: unknown,
): MultiProviderSubmissionEnvelope {
  const input = record(value);

  exactKeys(input, [
    "schemaVersion",
    "clientRequestId",
    "event",
    "selections",
  ]);

  if (input.schemaVersion !== 1) {
    invalid("Unsupported multi-provider submission version.");
  }

  const clientRequestId = identifier(
    input.clientRequestId,
    "request identity",
  );

  const event = eventDetails(input.event);
  const rawSelections = input.selections;

  if (
    !Array.isArray(rawSelections) ||
    rawSelections.length < 2 ||
    rawSelections.length > MAX_MULTI_PROVIDER_SELECTIONS
  ) {
    invalid("Select between 2 and 4 configured providers.");
  }

  const providers = new Set<string>();
  const selections: MultiProviderSubmissionEntry[] = [];

  for (const candidate of rawSelections) {
    const selection = record(candidate);

    exactKeys(selection, [
      "providerId",
      "packageId",
      "configuration",
    ]);

    const providerId = identifier(
      selection.providerId,
      "provider ID",
    );

    const packageId = identifier(
      selection.packageId,
      "package ID",
    );

    if (providers.has(providerId)) {
      invalid("Only one configuration per provider is allowed.");
    }

    providers.add(providerId);

    // Snapshot presence is required; actual content remains untrusted.
    const configuration = record(selection.configuration);

    if (Object.keys(configuration).length === 0) {
      invalid("Package configuration is required.");
    }

    if (configuration.customTheme !== undefined &&
        (typeof configuration.customTheme !== "string" ||
          configuration.customTheme.length > 10000)) {
      invalid("Invalid custom theme request.");
    }
    if (configuration.themeChoice !== undefined && configuration.themeChoice !== null &&
        (typeof configuration.themeChoice !== "string" ||
          !["none", "package", "custom"].includes(configuration.themeChoice))) {
      invalid("Invalid theme choice.");
    }
    if (configuration.willArrangeOwnAddOns !== undefined &&
        typeof configuration.willArrangeOwnAddOns !== "boolean") {
      invalid("Invalid customer-arranged services choice.");
    }
    if (configuration.customerArrangedAddOnsNote !== undefined &&
        (typeof configuration.customerArrangedAddOnsNote !== "string" ||
        configuration.customerArrangedAddOnsNote.length > 1000)) {
      invalid("Invalid customer-arranged services note.");
    }

    // A saved provider configuration must belong to this exact event.
    // The event-level specialRequest is intentionally not compared:
    // providers may have different package-specific instructions.
    // Mobile stores the event as configuration.event.
    // Web stores the event fields directly on configuration.
    // A present nested event must be valid; never fall back
    // to another representation when it is malformed.
    const configuredEvent = Object.prototype.hasOwnProperty.call(
      configuration,
      "event",
    )
      ? record(configuration.event)
      : configuration;

    const sharedEventFields = [
      "eventType",
      "eventDate",
      "eventTime",
      "eventEndTime",
      "guestCount",
      "eventLocation",
      "eventAddress",
    ] as const;

    for (const field of sharedEventFields) {
      if (
        !Object.prototype.hasOwnProperty.call(configuredEvent, field) ||
        configuredEvent[field] !== event[field]
      ) {
        invalid(
          `Provider configuration has conflicting ${field}.`,
        );
      }
    }

    selections.push({
      providerId,
      packageId,
      configuration,
    });
  }

  return {
    schemaVersion: 1,
    clientRequestId,
    event,
    selections,
  };
}
/**
 * Explicit marketplace-service selection for future mixed-provider submissions.
 *
 * This parser is transport validation only. It does not authorize a service,
 * price, owner, refund, payment agreement, or booking.
 *
 * Existing schema-v1 Catering selections are intentionally unchanged.
 */
export type MultiProviderMarketplaceSelection = {
  kind: "marketplace_service";
  providerId: string;
  serviceId: string;
  expectedRevision: number;
  configuration: Readonly<Record<string, unknown>>;
};

export function parseMultiProviderMarketplaceSelection(
  value: unknown,
  sharedEvent: Readonly<Record<string, unknown>>,
  allowLegacyRevision = false,
): MultiProviderMarketplaceSelection {
  const selection = record(value);

  exactKeys(selection, [
    "kind",
    "providerId",
    "serviceId",
    "expectedRevision",
    "configuration",
  ]);

  if (selection.kind !== "marketplace_service") {
    invalid("Invalid marketplace selection kind.");
  }

  const providerId = identifier(selection.providerId, "provider ID");
  const serviceId = identifier(selection.serviceId, "service ID");
  const revision = selection.expectedRevision;

  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < (allowLegacyRevision ? 0 : 1)
  ) {
    invalid("Invalid marketplace service revision.");
  }

  const configuration = record(selection.configuration);
  const event = record(sharedEvent);

  // The service's saved configuration must refer to the same event.
  // A malformed nested event must never fall back to outer fields.
  const configuredEvent = Object.prototype.hasOwnProperty.call(
    configuration,
    "event",
  ) ?
    record(configuration.event) :
    configuration;

  // Marketplace prices come exclusively from the trusted service record.
  // Presence, including null/undefined/zero, is invalid at either event layout.
  if (
    Object.prototype.hasOwnProperty.call(configuration, "price") ||
    Object.prototype.hasOwnProperty.call(configuredEvent, "price")
  ) {
    invalid("Marketplace configuration must not supply price.");
  }

  const sharedFields = [
    "eventType",
    "eventDate",
    "eventTime",
    "eventEndTime",
    "guestCount",
    "eventLocation",
    "eventAddress",
  ] as const;

  for (const field of sharedFields) {
    if (
      !Object.prototype.hasOwnProperty.call(event, field) ||
      !Object.prototype.hasOwnProperty.call(configuredEvent, field) ||
      configuredEvent[field] !== event[field]
    ) {
      invalid(`Marketplace configuration has conflicting ${field}.`);
    }
  }

  if (
    configuration.specialRequest !== undefined &&
    (
      typeof configuration.specialRequest !== "string" ||
      configuration.specialRequest.length > 1000
    )
  ) {
    invalid("Invalid marketplace provider instructions.");
  }

  return {
    kind: "marketplace_service",
    providerId,
    serviceId,
    expectedRevision: revision,
    configuration,
  };
}

/**
 * Mixed-provider transport contract, schema v2.
 *
 * Schema v1 remains unchanged and Catering-only.
 *
 * This parser authorizes NO booking writes, prices, services,
 * provider eligibility, payment policies, or acknowledgements.
 */
export type MultiProviderMixedCateringSelection = {
  kind: "catering_package";
  providerId: string;
  packageId: string;
  configuration: Readonly<Record<string, unknown>>;
};

export type MultiProviderMixedSelection =
  | MultiProviderMixedCateringSelection
  | MultiProviderMarketplaceSelection;

export type MultiProviderMixedSubmissionEnvelope = {
  schemaVersion: 2;
  clientRequestId: string;
  event: Readonly<Record<string, unknown>>;
  selections: readonly MultiProviderMixedSelection[];
};

function mixedConfigurationEvent(
  configuration: Readonly<Record<string, unknown>>,
  event: Readonly<Record<string, unknown>>,
): void {
  const configured = Object.prototype.hasOwnProperty.call(
    configuration,
    "event",
  ) ?
    record(configuration.event) :
    configuration;

  const fields = [
    "eventType",
    "eventDate",
    "eventTime",
    "eventEndTime",
    "guestCount",
    "eventLocation",
    "eventAddress",
  ] as const;

  for (const field of fields) {
    if (
      !Object.prototype.hasOwnProperty.call(configured, field) ||
      configured[field] !== event[field]
    ) {
      invalid(`Provider configuration has conflicting ${field}.`);
    }
  }
}

export function parseMultiProviderMixedSubmissionEnvelope(
  value: unknown,
): MultiProviderMixedSubmissionEnvelope {
  const input = record(value);

  exactKeys(input, [
    "schemaVersion",
    "clientRequestId",
    "event",
    "selections",
  ]);

  if (input.schemaVersion !== 2) {
    invalid("Unsupported mixed-provider submission version.");
  }

  const clientRequestId = identifier(
    input.clientRequestId,
    "request identity",
  );

  const event = eventDetails(input.event);
  const raw = input.selections;

  if (!Array.isArray(raw) || raw.length === 0) {
    invalid("Select a provider.");
  }
  if (raw.length > MAX_MULTI_PROVIDER_SELECTIONS) {
    invalid("Select between 2 and 4 configured providers for a mixed booking.");
  }

  const providers = new Set<string>();
  const selections: MultiProviderMixedSelection[] = [];

  let cateringCount = 0;
  let marketplaceCount = 0;

  for (const candidate of raw) {
    const selection = record(candidate);
    let parsed: MultiProviderMixedSelection;

    if (selection.kind === "catering_package") {
      exactKeys(selection, [
        "kind",
        "providerId",
        "packageId",
        "configuration",
      ]);

      const providerId = identifier(
        selection.providerId,
        "provider ID",
      );

      const packageId = identifier(
        selection.packageId,
        "package ID",
      );

      const configuration = record(
        selection.configuration,
      );

      if (Object.keys(configuration).length === 0) {
        invalid("Package configuration is required.");
      }

      if (
        configuration.customTheme !== undefined &&
        (
          typeof configuration.customTheme !== "string" ||
          configuration.customTheme.length > 10000
        )
      ) {
        invalid("Invalid custom theme request.");
      }

      if (
        configuration.themeChoice !== undefined &&
        configuration.themeChoice !== null &&
        (
          typeof configuration.themeChoice !== "string" ||
          !["none", "package", "custom"].includes(
            configuration.themeChoice,
          )
        )
      ) {
        invalid("Invalid theme choice.");
      }

      if (
        configuration.willArrangeOwnAddOns !== undefined &&
        typeof configuration.willArrangeOwnAddOns !== "boolean"
      ) {
        invalid("Invalid customer-arranged services choice.");
      }

      if (
        configuration.customerArrangedAddOnsNote !== undefined &&
        (
          typeof configuration.customerArrangedAddOnsNote !== "string" ||
          configuration.customerArrangedAddOnsNote.length > 1000
        )
      ) {
        invalid("Invalid customer-arranged services note.");
      }

      mixedConfigurationEvent(configuration, event);

      parsed = {
        kind: "catering_package",
        providerId,
        packageId,
        configuration,
      };

      cateringCount++;
    } else if (selection.kind === "marketplace_service") {
      parsed = parseMultiProviderMarketplaceSelection(
        selection,
        event,
        raw.length === 1,
      );

      marketplaceCount++;
    } else {
      invalid("Unsupported mixed-provider selection kind.");
    }

    if (providers.has(parsed.providerId)) {
      invalid("Only one configuration per provider is allowed.");
    }

    providers.add(parsed.providerId);
    selections.push(parsed);
  }

  // Schema v2 also admits a standalone marketplace service. The trusted reader checks its category.
  // Catering-only bookings retain the proven schema-v1 path.
  if (!(marketplaceCount === 1 && cateringCount === 0) &&
      (cateringCount === 0 || marketplaceCount === 0)) {
    invalid("Mixed booking requires Catering and an event service.");
  }

  return {
    schemaVersion: 2,
    clientRequestId,
    event,
    selections,
  };
}
