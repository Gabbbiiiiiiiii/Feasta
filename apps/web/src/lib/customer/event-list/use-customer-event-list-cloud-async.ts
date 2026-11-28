"use client";

import {useCallback, useEffect, useRef, useState} from "react";

import {auth} from "@/lib/firebase/client";
import type {CustomerEventListItem, CustomerEventListSchedule} from "./customer-event-list";
import {useCustomerEventListSession} from "./customer-event-list";
import {
  CustomerEventListCloudController,
  type CloudListState,
} from "./customer-event-list-cloud-controller";
import {
  newEventListRequestId,
  planCloudImport,
  planCloudSave,
  planCloudRemove,
  planCloudClear,
  planCloudSchedule,
  planCloudCanonicalConfigurationEdit,
} from "./customer-event-list-cloud-mutations";
import {
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED,
  sendCustomerEventListMutation,
  subscribeCustomerEventListCloud,
} from "./customer-event-list-cloud-transport";
import type {User} from "firebase/auth";
import {fromWebItem} from "./customer-event-list-cloud-contract";
import type {PlanningEntry} from "../../../../../../functions/src/customer-event-lists/contract";
import {
  readPendingCustomerEventListMutation,
  savePendingCustomerEventListMutation,
  clearPendingCustomerEventListMutation,
} from "./customer-event-list-cloud-recovery-storage";
import {
  CustomerEventListCloudRecovery,
  type RecoverySnapshot,
} from "./customer-event-list-cloud-recovery";

export type CloudSaveOutcome = {
  requestId: string;
  revision: number;
  status: "confirmed" | "awaiting_snapshot";
};

const EMPTY_STATE: CloudListState = {
  status: "idle",
  document: null,
  error: null,
  pendingRevision: null,
};

type ActiveController = {
  controller: CustomerEventListCloudController;
  recovery: CustomerEventListCloudRecovery;
  user: User;
  generation: number;
};

/**
 * Additive Web cloud interface.
 *
 * Existing synchronous local Event List operations remain unchanged.
 * No cloud listener or mutation is started while the rollout gate is off.
 */
export function useCustomerEventListCloudAsync() {
  const session = useCustomerEventListSession();
  const user = session.user;
  const generation = session.generation;

  const activeRef = useRef<ActiveController | null>(null);
  const [recoveryView, setRecoveryView] = useState<{
    user: User;
    generation: number;
    snapshot: RecoverySnapshot;
  } | null>(null);
  const [cloud, setCloud] = useState<{
    user: User;
    generation: number;
    state: CloudListState;
  } | null>(null);

  useEffect(() => {
    if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED || !user) {
      return;
    }

    let active = true;
    const owner = user;
    const epoch = generation;

    const isCurrent = () =>
      active &&
      auth.currentUser === owner &&
      activeRef.current?.user === owner &&
      activeRef.current?.generation === epoch;

    const controller = new CustomerEventListCloudController(
      {
        subscribe: subscribeCustomerEventListCloud,
        send: sendCustomerEventListMutation,
      },
      (state) => {
        if (!isCurrent()) return;
        if (state.status === "ready" && state.document) {
          recovery.observeServerRevision(state.document.revision);
        }
        setCloud({user: owner, generation: epoch, state});
      },
    );

    const recovery = new CustomerEventListCloudRecovery(
      isCurrent,
      (input) => sendCustomerEventListMutation(owner, input, isCurrent),
      (snapshot) => {
        if (isCurrent()) {
          setRecoveryView({user: owner, generation: epoch, snapshot});
        }
      },
      {
        save: (payload) => savePendingCustomerEventListMutation(owner.uid, payload),
        clear: (requestId) => clearPendingCustomerEventListMutation(owner.uid, requestId),
      },
    );

    activeRef.current = {
      controller, recovery, user: owner, generation: epoch,
    };

    const saved = readPendingCustomerEventListMutation(owner.uid);
    if (saved !== null) recovery.restorePending(saved);
    controller.start(owner, isCurrent);

    return () => {
      active = false;
      recovery.stop();
      controller.stop();
      if (activeRef.current?.controller === controller) {
        activeRef.current = null;
      }
    };
  }, [user, generation]);
  const saveItemAsync = useCallback(
    async (item: CustomerEventListItem): Promise<CloudSaveOutcome> => {
      if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
        throw new Error("Customer Event List cloud synchronization is disabled.");
      }

      const active = activeRef.current;
      if (!user || !active || active.user !== user ||
          active.generation !== generation || auth.currentUser !== user) {
        throw new Error("Customer session changed.");
      }

      if (active.recovery.hasUnresolvedOperation) {
        throw new Error("A cloud Event List change is still pending recovery.");
      }

      const snapshot = active.controller.snapshot;
      if (snapshot.status !== "ready" || !snapshot.document) {
        throw new Error("Cloud Event List is not ready. No changes were made.");
      }

      const request = planCloudSave(
        snapshot.document, item, newEventListRequestId(),
      );
      const result = await active.recovery.begin(request);

      if (activeRef.current !== active || auth.currentUser !== user) {
        throw new Error("Customer session changed.");
      }

      return {
        requestId: request.requestId,
        revision: result.revision,
        status: active.recovery.snapshot.status === "confirmed"
          ? "confirmed" : "awaiting_snapshot",
      };
    },
    [user, generation],
  );
  const initializeCloudListAsync = useCallback(
    async (
      localItems: readonly CustomerEventListItem[],
      localSchedule: CustomerEventListSchedule | null,
    ): Promise<CloudSaveOutcome> => {
      if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
        throw new Error("Customer Event List cloud synchronization is disabled.");
      }

      const active = activeRef.current;
      if (!user || !active || active.user !== user ||
          active.generation !== generation || auth.currentUser !== user) {
        throw new Error("Customer session changed.");
      }

      if (active.recovery.hasUnresolvedOperation) {
        throw new Error("A cloud Event List change is still pending recovery.");
      }

      if (active.controller.snapshot.status !== "missing") {
        throw new Error(
          "Cloud initialization requires a confirmed missing document.",
        );
      }

      const request = planCloudImport(
        user.uid, localItems, localSchedule, newEventListRequestId(),
      );
      const result = await active.recovery.begin(request);

      if (activeRef.current !== active || auth.currentUser !== user) {
        throw new Error("Customer session changed.");
      }

      return {
        requestId: request.requestId,
        revision: result.revision,
        status: active.recovery.snapshot.status === "confirmed"
          ? "confirmed" : "awaiting_snapshot",
      };
    },
    [user, generation],
  );

  // All list mutations use the same session-bound recovery coordinator.
  // Never fall back to local writes when cloud synchronization is enabled.
  const runConfirmedMutation = useCallback(async (
    makeRequest: (document: NonNullable<CloudListState["document"]>) =>
      Parameters<CustomerEventListCloudRecovery["begin"]>[0],
  ): Promise<CloudSaveOutcome> => {
    if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
      throw new Error("Customer Event List cloud synchronization is disabled.");
    }
    const active = activeRef.current;
    if (!user || !active || active.user !== user ||
        active.generation !== generation || auth.currentUser !== user) {
      throw new Error("Customer session changed.");
    }
    if (active.recovery.hasUnresolvedOperation) {
      throw new Error("A cloud Event List change is still pending recovery.");
    }
    const {status, document} = active.controller.snapshot;
    if (status !== "ready" || !document) {
      throw new Error("Cloud Event List is not ready. No changes were made.");
    }
    const command = makeRequest(document);
    const result = await active.recovery.begin(command);
    if (activeRef.current !== active || auth.currentUser !== user) {
      throw new Error("Customer session changed.");
    }
    return {
      requestId: command.requestId,
      revision: result.revision,
      status: active.recovery.snapshot.status === "confirmed"
        ? "confirmed" : "awaiting_snapshot",
    };
  }, [user, generation]);

  const editCanonicalConfigurationAsync = useCallback(
    async (original: PlanningEntry, patch: Record<string, unknown>): Promise<CloudSaveOutcome & {entry: PlanningEntry}> => {
      let entry = original;
      const result = await runConfirmedMutation((document) => {
        const command = planCloudCanonicalConfigurationEdit(document, original, patch, newEventListRequestId());
        entry = command.entry as PlanningEntry;
        return command;
      });
      return {...result, entry};
    },
    [runConfirmedMutation],
  );

  const removeItemAsync = useCallback(
    (item: CustomerEventListItem): Promise<CloudSaveOutcome> =>
      runConfirmedMutation((document) => planCloudRemove(
        document, fromWebItem(item).identity, newEventListRequestId(),
      )),
    [runConfirmedMutation],
  );

  const clearListAsync = useCallback(
    (): Promise<CloudSaveOutcome> =>
      runConfirmedMutation((document) => planCloudClear(
        document, newEventListRequestId(),
      )),
    [runConfirmedMutation],
  );

  // Removal uses the original canonical identity, including read-only entries.
  const removeCanonicalEntryAsync = useCallback(
    (identity: string): Promise<CloudSaveOutcome> =>
      runConfirmedMutation((document) => planCloudRemove(
        document, identity, newEventListRequestId(),
      )),
    [runConfirmedMutation],
  );

  const writeScheduleAsync = useCallback(
    (schedule: CustomerEventListSchedule | null): Promise<CloudSaveOutcome> =>
      runConfirmedMutation((document) => planCloudSchedule(
        document, schedule, newEventListRequestId(),
      )),
    [runConfirmedMutation],
  );

  const retryUncertainAsync = useCallback(
    async (): Promise<CloudSaveOutcome> => {
      if (!CUSTOMER_EVENT_LIST_CLOUD_ENABLED) {
        throw new Error("Customer Event List cloud synchronization is disabled.");
      }

      const active = activeRef.current;
      if (!user || !active || active.user !== user ||
          active.generation !== generation || auth.currentUser !== user) {
        throw new Error("Customer session changed.");
      }

      const requestId = active.recovery.snapshot.requestId;
      const result = await active.recovery.retry();

      if (activeRef.current !== active || auth.currentUser !== user) {
        throw new Error("Customer session changed.");
      }

      if (!requestId) {
        throw new Error("Missing original Event List request ID.");
      }

      return {
        requestId,
        revision: result.revision,
        status: active.recovery.snapshot.status === "confirmed"
          ? "confirmed" : "awaiting_snapshot",
      };
    },
    [user, generation],
  );
  const state =
    CUSTOMER_EVENT_LIST_CLOUD_ENABLED &&
    user &&
    cloud?.user === user &&
    cloud.generation === generation &&
    auth.currentUser === user
      ? cloud.state
      : EMPTY_STATE;

  const currentRecovery =
    CUSTOMER_EVENT_LIST_CLOUD_ENABLED &&
    user &&
    recoveryView?.user === user &&
    recoveryView.generation === generation &&
    auth.currentUser === user
      ? recoveryView.snapshot
      : null;

  const effectiveState: CloudListState =
    currentRecovery?.status === "uncertain"
      ? {
          ...state,
          status: "error",
          error: currentRecovery.error ??
            "The outcome of this cloud save is uncertain.",
          pendingRevision: null,
        }
      : currentRecovery?.status === "sending" ||
          currentRecovery?.status === "awaiting_snapshot"
        ? {
            ...state,
            status: "pending",
            error: null,
            pendingRevision: currentRecovery.acceptedRevision,
          }
        : state;

  return {
    enabled: CUSTOMER_EVENT_LIST_CLOUD_ENABLED,
    state: effectiveState,
    recovery: currentRecovery,
    saveItemAsync,
    editCanonicalConfigurationAsync,
    removeItemAsync,
    removeCanonicalEntryAsync,
    clearListAsync,
    writeScheduleAsync,
    initializeCloudListAsync,
    retryUncertainAsync,
  };
}
