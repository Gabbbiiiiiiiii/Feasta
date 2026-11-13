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