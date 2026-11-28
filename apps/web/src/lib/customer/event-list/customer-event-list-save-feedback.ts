import type {CloudListState} from "./customer-event-list-cloud-controller";
import type {RecoverySnapshot} from "./customer-event-list-cloud-recovery";
import type {CloudSaveOutcome} from "./use-customer-event-list-cloud-async";

/** Save acknowledgement is reactive; callable acceptance alone is not saved. */
export function cloudEventListSaveFeedback(
  outcome: CloudSaveOutcome,
  state: CloudListState,
  recovery: RecoverySnapshot | null,
) {
  if (state.status === "error") return {
    message: state.error ?? "Cloud save could not be confirmed. Review Event List recovery.", success: false,
  };
  const acknowledged = outcome.status === "confirmed" ||
    (recovery?.requestId === outcome.requestId && recovery.status === "confirmed");
  const confirmed = acknowledged && state.document !== null &&
    state.document.revision >= outcome.revision;
  return {
    message: confirmed
      ? "Cloud Event List confirmed. Revalidation required; nothing is reserved."
      : "Cloud save accepted. Waiting for Firestore confirmation; nothing is reserved.",
    success: confirmed,
  };
}
