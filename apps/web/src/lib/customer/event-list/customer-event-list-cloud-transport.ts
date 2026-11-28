"use client";

import type {User} from "firebase/auth";
import {
  doc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {httpsCallable} from "firebase/functions";

import {auth, db, functions} from "@/lib/firebase/client";
import {decodeDocument} from "./customer-event-list-cloud-contract";
import type {
  PlanningDocument,
} from "../../../../../../functions/src/customer-event-lists/contract";

/**
 * Phase 2B-2: transport foundation only.
 *
 * This flag must remain false until the authenticated Web
 * Event List integration and coordinated release are reviewed.
 */
export const CUSTOMER_EVENT_LIST_CLOUD_ENABLED = true;

export type CustomerEventListMutationAction =
  | "import"
  | "add"
  | "update"
  | "remove"
  | "clear"
  | "schedule"
  | "cleanup";

export type CustomerEventListMutationInput = {
  version: 1;
  requestId: string;
  expectedRevision: number | null;
  action: CustomerEventListMutationAction;
} & Record<string, unknown>;

export type CustomerEventListMutationResult = {
  version: 1;
  revision: number;
  changed: boolean;
  migrationReviewRequired: boolean;
  removedIdentities: string[];
  preservedIdentities: string[];
  replayed: boolean;
};

export type CustomerEventListCloudEvent =
  | {
      status: "ready";
      document: PlanningDocument;
    }
  | {
      status: "missing";
    }
  | {
      status: "cached";
    }
  | {
      status: "error";
      error: Error;
    };

function authorizedSession(
  user: User,
  isCurrent: () => boolean,
): boolean {
  return auth.currentUser === user && isCurrent();
}

/**
 * No automatic retries:
 * callers must preserve requestId when retrying the same
 * uncertain mutation and obtain a fresh revision after conflicts.
 */
export async function sendCustomerEventListMutation(
  user: User,
  input: CustomerEventListMutationInput,
  isCurrent: () => boolean,
): Promise<CustomerEventListMutationResult> {
  if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
    throw new Error("Customer Event List cloud synchronization is disabled.");
  }

  if (!authorizedSession(user, isCurrent)) {
    throw new Error("Customer session changed.");
  }

  const callable = httpsCallable<
    CustomerEventListMutationInput,
    CustomerEventListMutationResult
  >(functions, "mutateCustomerEventList");

  const result = await callable(input);

  if (!authorizedSession(user, isCurrent)) {
    throw new Error("Customer session changed.");
  }

  const value = result.data;

  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.changed !== "boolean" ||
    typeof value.migrationReviewRequired !== "boolean" ||
    typeof value.replayed !== "boolean" ||
    !Array.isArray(value.removedIdentities) ||
    !Array.isArray(value.preservedIdentities) ||
    !value.removedIdentities.every((id) => typeof id === "string") ||
    !value.preservedIdentities.every((id) => typeof id === "string")
  ) {
    throw new Error("Invalid Event List mutation response.");
  }

  return value;
}

/**
 * Firestore supplies cloud state; the callable remains the
 * only permitted write transport.
 *
 * Cached snapshots are never presented as confirmed server state.
 */
export function subscribeCustomerEventListCloud(
  user: User,
  isCurrent: () => boolean,
  onEvent: (event: CustomerEventListCloudEvent) => void,
): Unsubscribe {
  if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
    return () => undefined;
  }

  if (!authorizedSession(user, isCurrent)) {
    return () => undefined;
  }

  const reference = doc(db, "customerEventLists", user.uid);

  return onSnapshot(
    reference,
    {includeMetadataChanges: true},
    (snapshot) => {
      if (!authorizedSession(user, isCurrent)) return;

      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
        onEvent({status: "cached"});
        return;
      }

      if (!snapshot.exists()) {
        onEvent({status: "missing"});
        return;
      }

      try {
        const document = decodeDocument(snapshot.data(), user.uid);
        onEvent({status: "ready", document});
      } catch {
        onEvent({
          status: "error",
          error: new Error("Invalid cloud Event List document."),
        });
      }
    },
    (error) => {
      if (!authorizedSession(user, isCurrent)) return;
      onEvent({
        status: "error",
        error: new Error(error.message),
      });
    },
  );
}

/** Wait for server evidence; never restore an authenticated edit from cache or local storage. */
export function readCustomerEventListCloud(
  user: User,
  isCurrent: () => boolean,
): Promise<PlanningDocument> {
  if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED || !authorizedSession(user, isCurrent)) {
    return Promise.reject(new Error("Customer cloud session is not active."));
  }
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    let finished = false;
    const finish = (document: PlanningDocument | null, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      unsubscribe();
      if (!authorizedSession(user, isCurrent)) reject(new Error("Customer session changed."));
      else if (document) resolve(document);
      else reject(error ?? new Error("Saved cloud Event List could not be found."));
    };
    const timeout = setTimeout(() => finish(null, new Error("Cloud Event List is not ready. Reopen Edit details when connected.")), 15000);
    unsubscribe = subscribeCustomerEventListCloud(user, isCurrent, (event) => {
      if (event.status === "ready") finish(event.document);
      else if (event.status === "missing") finish(null);
      else if (event.status === "error") finish(null, event.error);
    });
    if (finished) unsubscribe();
  });
}
