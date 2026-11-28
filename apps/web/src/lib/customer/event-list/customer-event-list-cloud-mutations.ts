"use client";
import {stable} from "../../../../../../functions/src/customer-event-lists/contract";

import type {
  PlanningDocument,
  PlanningEntry,
} from "../../../../../../functions/src/customer-event-lists/contract";
import {
  decodeDocument,
  fromWebItem,
  fromWebList,
  toWebItem,
} from "./customer-event-list-cloud-contract";
import {
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED,
  type CustomerEventListMutationInput,
  type CustomerEventListMutationResult,
} from "./customer-event-list-cloud-transport";
import type {CustomerEventListCloudController} from "./customer-event-list-cloud-controller";
import type {
  CustomerEventListItem,
  CustomerEventListSchedule,
} from "./customer-event-list";

/**
 * Pure command planning is available to tests even when transport is disabled.
 * Nothing here writes to browser storage or Firestore directly.
 *
 * A request ID belongs to one exact payload. An uncertain retry must reuse
 * that payload and request ID; generating a fresh ID is not a safe retry.
 */
export function validateRequestId(requestId: string): string {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
    throw new Error("Invalid Event List request ID.");
  }
  return requestId;
}

export function newEventListRequestId(): string {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new Error("Secure request ID generation is unavailable.");
  }
  return validateRequestId(crypto.randomUUID());
}

function confirmed(doc: PlanningDocument): PlanningDocument {
  return decodeDocument(doc, doc.ownerUid);
}

function base(
  doc: PlanningDocument,
  requestId: string,
): Pick<
  CustomerEventListMutationInput,
  "version" | "requestId" | "expectedRevision"
> {
  return {
    version: 1,
    requestId: validateRequestId(requestId),
    expectedRevision: confirmed(doc).revision,
  };
}

export function planCloudSave(
  document: PlanningDocument,
  item: CustomerEventListItem,
  requestId: string,
): CustomerEventListMutationInput {
  const cloud = confirmed(document);
  const incoming = fromWebItem(item);
  const existing = cloud.entries.find(
    (entry) => entry.identity === incoming.identity,
  );

  if (existing) {
    if (toWebItem(existing).status !== "supported") {
      throw new Error(
        "This selection requires a compatible editor. Its cloud data was preserved.",
      );
    }

    if (existing.configuration !== null &&
        incoming.configuration === null) {
      throw new Error(
        "A package-only save cannot erase a configured selection.",
      );
    }
  } else if (cloud.entries.length >= 24) {
    throw new Error("Your Event List already contains 24 selections.");
  }

  return {
    ...base(cloud, requestId),
    action: existing ? "update" : "add",
    entry: incoming,
  };
}

/**
 * Updates a configured canonical package without converting it through the
 * narrower Web Event List model. The original is the entry captured when
 * editing began, not a freshly substituted entry from the latest snapshot.
 *
 * This is planning only. Session checks, revision enforcement and recovery
 * remain owned by the existing cloud mutation coordinator and server.
 */
export function planCloudCanonicalConfigurationEdit(
  document: PlanningDocument,
  original: PlanningEntry,
  patch: Record<string, unknown>,
  requestId: string,
): CustomerEventListMutationInput {
  const cloud = confirmed(document);
  const existing = cloud.entries.find(
    (entry) => entry.identity === original.identity,
  );

  if (!existing) {
    throw new Error("The saved selection no longer exists.");
  }

  if (stable(existing) !== stable(original)) {
    throw new Error(
      "This saved selection changed on another device. Reopen it before editing.",
    );
  }

  if (existing.kind !== "catering_package" || !existing.configuration) {
    throw new Error("This selection cannot be edited as a catering package.");
  }

  const allowedFields = new Set([
    "event",
    "serviceTier",
    "packageThemeId",
    "themeInspiration",
    "selectedFoods",
    "selectedDecorations",
    "selectedFurniture",
    "foodChoiceSelections",
    "selectedEventServices",
    "willArrangeOwnAddOns",
    "customerArrangedAddOnsNote",
    "estimatedTotal",
    "pricingContext",
  ]);

  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    Object.keys(patch).some((key) => !allowedFields.has(key))
  ) {
    throw new Error("Unsupported canonical configuration edit.");
  }

  const previous = existing.configuration;
  const next: Record<string, unknown> = {
    ...previous,
    ...patch,
  };

  if (Object.hasOwn(patch, "event")) {
    const event = patch.event;
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("Invalid edited event details.");
    }
    next.event = {
      ...(previous.event as Record<string, unknown>),
      ...(event as Record<string, unknown>),
    };
  }

  if (Object.hasOwn(patch, "themeInspiration")) {
    const theme = patch.themeInspiration;
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
      throw new Error("Invalid edited theme details.");
    }
    next.themeInspiration = {
      ...((previous.themeInspiration ?? {}) as Record<string, unknown>),
      ...(theme as Record<string, unknown>),
    };
  }

  const candidate = {
    ...existing,
    configuration: next,
  };

  const validated = decodeDocument(
    {
      ...cloud,
      entries: [candidate],
    },
    cloud.ownerUid,
  ).entries[0];

  if (validated.identity !== original.identity) {
    throw new Error("The saved selection identity cannot change.");
  }

  return {
    ...base(cloud, requestId),
    action: "update",
    entry: validated,
  };
}
export function planCloudRemove(
  document: PlanningDocument,
  identity: string,
  requestId: string,
): CustomerEventListMutationInput {
  const cloud = confirmed(document);

  if (!cloud.entries.some((entry) => entry.identity === identity)) {
    throw new Error("The saved selection no longer exists.");
  }

  return {
    ...base(cloud, requestId),
    action: "remove",
    identity,
  };
}

export function planCloudClear(
  document: PlanningDocument,
  requestId: string,
): CustomerEventListMutationInput {
  const cloud = confirmed(document);

  return {
    ...base(cloud, requestId),
    action: "clear",
  };
}

export function planCloudSchedule(
  document: PlanningDocument,
  schedule: CustomerEventListSchedule | null,
  requestId: string,
): CustomerEventListMutationInput {
  const cloud = confirmed(document);

  const validated = fromWebList(
    cloud.ownerUid,
    [],
    schedule,
  );

  return {
    ...base(cloud, requestId),
    action: "schedule",
    schedule: validated.schedule,
  };
}

export function planCloudImport(
  uid: string,
  localItems: readonly CustomerEventListItem[],
  schedule: CustomerEventListSchedule | null,
  requestId: string,
): CustomerEventListMutationInput {
  const local = fromWebList(uid, localItems, schedule);

  if (local.revision !== 0) {
    throw new Error("Import must use revision zero.");
  }

  return {
    version: 1,
    requestId: validateRequestId(requestId),
    expectedRevision: null,
    action: "import",
    local,
  };
}

export function findCanonicalEntry(
  document: PlanningDocument,
  identity: string,
): PlanningEntry | null {
  const cloud = confirmed(document);
  return cloud.entries.find(
    (entry) => entry.identity === identity,
  ) ?? null;
}

/**
 * Deliberately unavailable while the production feature gate is disabled.
 * The controller owns session checks, confirmed revisions, and pending state.
 *
 * A callable response means accepted by the server, not yet observed through
 * a confirmed Firestore snapshot.
 *
 * Cleanup is excluded here: it requires separately reviewed booking proof.
 */
export class CustomerEventListCloudMutationApi {
  constructor(
    private readonly controller: CustomerEventListCloudController,
  ) {}

  async execute(
    input: CustomerEventListMutationInput,
  ): Promise<CustomerEventListMutationResult> {
    if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
      throw new Error("Customer Event List cloud synchronization is disabled.");
    }

    validateRequestId(input.requestId);
    return this.controller.mutate(input);
  }
}