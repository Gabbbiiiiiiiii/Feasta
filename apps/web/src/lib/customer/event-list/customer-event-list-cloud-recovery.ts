import type {
  CustomerEventListMutationInput,
  CustomerEventListMutationResult,
} from "./customer-event-list-cloud-transport";

export type RecoveryStatus =
  | "idle"
  | "sending"
  | "uncertain"
  | "awaiting_snapshot"
  | "confirmed";

export type RecoverySnapshot = {
  status: RecoveryStatus;
  requestId: string | null;
  acceptedRevision: number | null;
  error: string | null;
};

/**
 * One in-memory mutation per authenticated session.
 *
 * An uncertain response is not proof of either success or failure.
 * Only replaying the SAME payload/requestId can resolve that ambiguity.
 *
 * This module does not perform Firestore reads or writes by itself.
 */
export class CustomerEventListCloudRecovery {
  private status: RecoveryStatus = "idle";
  private originalPayload: string | null = null;
  private acceptedRevision: number | null = null;
  private observedRevision: number | null = null;
  private error: string | null = null;
  private disposed = false;
  private blocked = false;

  constructor(
    private readonly isCurrentSession: () => boolean,
    private readonly send: (
      input: CustomerEventListMutationInput,
    ) => Promise<CustomerEventListMutationResult>,
    private readonly notify: (snapshot: RecoverySnapshot) => void,
    private readonly persistence?: {
      save: (payload: string) => void;
      clear: (requestId: string) => void;
    },
  ) {}

  get snapshot(): RecoverySnapshot {
    const input = this.originalPayload === null
      ? null
      : JSON.parse(this.originalPayload) as CustomerEventListMutationInput;

    return {
      status: this.status,
      requestId: input?.requestId ?? null,
      acceptedRevision: this.acceptedRevision,
      error: this.error,
    };
  }

  get hasUnresolvedOperation(): boolean {
    return this.blocked || this.status === "sending" ||
      this.status === "uncertain" ||
      this.status === "awaiting_snapshot";
  }

  private current(): boolean {
    return !this.disposed && this.isCurrentSession();
  }

  private publish(): void {
    if (this.current()) this.notify(this.snapshot);
  }

  /**
   * A plain JSON clone freezes the command's serialized meaning:
   * retries always use the same canonical JSON payload.
   */
  private cloneInput(): CustomerEventListMutationInput {
    if (this.originalPayload === null) {
      throw new Error("There is no recoverable Event List request.");
    }

    return JSON.parse(this.originalPayload) as CustomerEventListMutationInput;
  }

  private async dispatch(): Promise<CustomerEventListMutationResult> {
    if (!this.current()) throw new Error("Customer session changed.");
    if (this.blocked) throw new Error("Stored Event List recovery requires review.");

    if (this.status === "sending") {
      throw new Error("An Event List mutation is already sending.");
    }

    // A confirmed prior operation permits a new command.
    // An uncertain operation permits only retrying its original payload.
    if (this.status !== "idle" &&
        this.status !== "uncertain" &&
        this.status !== "confirmed") {
      throw new Error("This Event List request cannot be resent.");
    }

    const input = this.cloneInput();
    this.status = "sending";
    this.error = null;
    this.publish();

    try {
      const result = await this.send(input);

      if (!this.current()) {
        throw new Error("Customer session changed.");
      }

      if (
        result.version !== 1 ||
        !Number.isSafeInteger(result.revision) ||
        result.revision < 0 ||
        typeof result.changed !== "boolean" ||
        typeof result.migrationReviewRequired !== "boolean" ||
        typeof result.replayed !== "boolean" ||
        !Array.isArray(result.removedIdentities) ||
        !Array.isArray(result.preservedIdentities)
      ) {
        throw new Error("Invalid Event List mutation response.");
      }

      this.acceptedRevision = result.revision;
      this.status = "awaiting_snapshot";
      // A listener may observe the commit before the callable response arrives.
      // Use the same confirmation/receipt cleanup path in either arrival order.
      if (this.observedRevision !== null) {
        this.observeServerRevision(this.observedRevision);
      }
      if (this.status === "awaiting_snapshot") this.publish();

      return result;
    } catch (cause) {
      if (this.current()) {
        // The backend checks receipts before revisions. An aborted revision
        // check therefore proves this exact command was never accepted, even
        // on replay. Release it so a reviewed, freshly loaded edit can proceed.
        if (typeof cause === "object" && cause !== null &&
            "code" in cause && cause.code === "functions/aborted") {
          try {
            this.persistence?.clear(input.requestId);
            this.originalPayload = null;
            this.acceptedRevision = null;
            this.observedRevision = null;
            this.status = "idle";
            this.error = "Your Event List changed. Review the latest selections before saving again.";
          } catch {
            this.blocked = true;
            this.status = "uncertain";
            this.error = "Could not clear rejected recovery data. Review this request.";
          }
          this.publish();
          throw cause;
        }
        this.status = "uncertain";
        this.error = cause instanceof Error
          ? cause.message
          : "Event List request outcome is uncertain.";
        this.publish();
      }
      throw cause;
    }
  }

  async begin(
    input: CustomerEventListMutationInput,
  ): Promise<CustomerEventListMutationResult> {
    if (!this.current()) throw new Error("Customer session changed.");

    if (this.blocked) {
      throw new Error("Stored Event List recovery requires review.");
    }
    if (this.status !== "idle" && this.status !== "confirmed") {
      throw new Error("Resolve the previous Event List mutation first.");
    }

    if (
      !/^[A-Za-z0-9_-]{16,128}$/.test(input.requestId) ||
      input.version !== 1
    ) {
      throw new Error("Invalid Event List mutation request.");
    }

    const serialized = JSON.stringify(input);
    // Must be durably recorded BEFORE contacting the server; if browser
    // persistence fails, abort without sending a mutation.
    this.persistence?.save(serialized);
    this.originalPayload = serialized;
    this.acceptedRevision = null;
    this.observedRevision = null;
    this.error = null;

    return this.dispatch();
  }

  async retry(): Promise<CustomerEventListMutationResult> {
    if (!this.current()) throw new Error("Customer session changed.");

    if (this.blocked) {
      throw new Error("Stored Event List recovery requires review.");
    }
    if (this.status !== "uncertain") {
      throw new Error("There is no uncertain Event List request to retry.");
    }

    return this.dispatch();
  }

  /** A restored request is never automatically replayed. */
  restorePending(serialized: string): void {
    if (!this.current() || this.status !== "idle" || this.originalPayload) {
      throw new Error("Cannot restore an Event List request in this session.");
    }
    try {
      if (serialized.length > 300000) throw new Error("oversized");
      const input = JSON.parse(serialized) as CustomerEventListMutationInput;
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          input.version !== 1 ||
          typeof input.requestId !== "string" ||
          !/^[A-Za-z0-9_-]{16,128}$/.test(input.requestId) ||
          !["import", "add", "update", "remove", "clear", "schedule", "cleanup"].includes(input.action) ||
          (input.action === "import" ? input.expectedRevision !== null :
            !Number.isSafeInteger(input.expectedRevision) ||
            (input.expectedRevision as number) < 0)) {
        throw new Error("invalid");
      }
      this.originalPayload = serialized;
      this.status = "uncertain";
      this.error = "Previous save outcome is unknown. Retry the same request to reconcile.";
      this.publish();
    } catch {
      // Never allow a fresh mutation over an unreadable pending record.
      this.blocked = true;
      this.status = "uncertain";
      this.error = "Saved recovery data needs review. No changes were sent.";
      this.publish();
    }
  }

  /**
   * Observing a newer revision does NOT resolve an uncertain request:
   * another device might have written that revision.
   */
  observeServerRevision(revision: number): void {
    if (!this.current() || !Number.isSafeInteger(revision) ||
        revision < 0) return;

    this.observedRevision =
      Math.max(this.observedRevision ?? -1, revision);

    if (this.status === "awaiting_snapshot" &&
        this.acceptedRevision !== null &&
        this.observedRevision >= this.acceptedRevision) {
      this.status = "confirmed";
      this.error = null;
      if (this.originalPayload) {
        const original = JSON.parse(this.originalPayload) as CustomerEventListMutationInput;
        try {
          this.persistence?.clear(original.requestId);
        } catch {
          // Retain a safe retry marker; duplicate receipts remain idempotent.
          this.blocked = true;
          this.status = "uncertain";
          this.error = "Could not clear saved recovery data. Review this request.";
        }
      }
      this.publish();
    }
  }

  /**
   * This discards only the client recovery capability, never a
   * server receipt or confirmed document. Do not use for retry.
   */
  stop(): void {
    this.disposed = true;
    this.originalPayload = null;
    this.acceptedRevision = null;
    this.observedRevision = null;
    this.error = null;
    this.status = "idle";
  }
}
