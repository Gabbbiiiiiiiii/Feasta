import type {User} from "firebase/auth";
import type {PlanningDocument} from
  "../../../../../../functions/src/customer-event-lists/contract";
import type {
  CustomerEventListCloudEvent,
  CustomerEventListMutationInput,
  CustomerEventListMutationResult,
} from "./customer-event-list-cloud-transport";

export type CloudListState = {
  status: "idle" | "loading" | "missing" | "cached" |
    "ready" | "pending" | "error";
  document: PlanningDocument | null;
  error: string | null;
  pendingRevision: number | null;
};

export type CloudListTransport = {
  subscribe: (
    user: User,
    isCurrent: () => boolean,
    onEvent: (event: CustomerEventListCloudEvent) => void,
  ) => () => void;
  send: (
    user: User,
    input: CustomerEventListMutationInput,
    isCurrent: () => boolean,
  ) => Promise<CustomerEventListMutationResult>;
};

export class CustomerEventListCloudController {
  private generation = 0;
  private unsubscribe: (() => void) | null = null;
  private user: User | null = null;
  private sessionCheck: (() => boolean) | null = null;
  private busy = false;

  private state: CloudListState = {
    status: "idle",
    document: null,
    error: null,
    pendingRevision: null,
  };

  constructor(
    private readonly transport: CloudListTransport,
    private readonly notify: (state: CloudListState) => void,
  ) {}

  get snapshot(): CloudListState {
    return this.state;
  }

  private publish(next: CloudListState): void {
    this.state = next;
    this.notify(next);
  }

  stop(): void {
    this.generation++;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.user = null;
    this.sessionCheck = null;
    this.busy = false;
    this.publish({
      status: "idle",
      document: null,
      error: null,
      pendingRevision: null,
    });
  }

  start(user: User, sessionCheck: () => boolean): void {
    this.stop();
    const epoch = this.generation;
    this.user = user;
    this.sessionCheck = sessionCheck;

    const current = () =>
      this.generation === epoch &&
      this.user === user &&
      this.sessionCheck === sessionCheck &&
      sessionCheck();

    this.publish({
      status: "loading",
      document: null,
      error: null,
      pendingRevision: null,
    });

    this.unsubscribe = this.transport.subscribe(
      user,
      current,
      (event) => {
        if (!current()) return;

        if (event.status === "ready") {
          const awaiting = this.state.pendingRevision;
          const confirmed = awaiting === null ||
            event.document.revision >= awaiting;

          this.publish({
            status: confirmed
              ? (this.busy ? "pending" : "ready")
              : "pending",
            document: event.document,
            error: null,
            pendingRevision: confirmed ? null : awaiting,
          });
        } else if (event.status === "cached") {
          this.publish({
            ...this.state,
            status: this.state.pendingRevision === null
              ? "cached" : "pending",
          });
        } else if (event.status === "missing") {
          this.publish({
            status: "missing",
            document: null,
            error: null,
            pendingRevision: null,
          });
        } else {
          this.publish({
            ...this.state,
            status: "error",
            error: event.error.message,
          });
        }
      },
    );
  }

  async mutate(
    input: CustomerEventListMutationInput,
  ): Promise<CustomerEventListMutationResult> {
    const user = this.user;
    const sessionCheck = this.sessionCheck;
    const epoch = this.generation;

    if (!user || !sessionCheck || !sessionCheck()) {
      throw new Error("Customer session is not active.");
    }
    if (this.busy || this.state.pendingRevision !== null) {
      throw new Error("A cloud Event List change is still pending.");
    }

    if (input.action === "import") {
      if (this.state.status !== "missing" ||
          input.expectedRevision !== null) {
        throw new Error("Cloud import requires an absent document.");
      }
    } else {
      if (this.state.status !== "ready" ||
          !this.state.document ||
          input.expectedRevision !== this.state.document.revision) {
        throw new Error("Cloud Event List revision is not ready.");
      }
    }

    const current = () =>
      this.generation === epoch &&
      this.user === user &&
      this.sessionCheck === sessionCheck &&
      sessionCheck();

    this.busy = true;
    this.publish({
      ...this.state,
      status: "pending",
      error: null,
    });

    try {
      const result = await this.transport.send(user, input, current);
      if (!current()) {
        throw new Error("Customer session changed.");
      }

      const observed = this.state.document?.revision ?? -1;
      const confirmed = observed >= result.revision;

      this.publish({
        ...this.state,
        status: confirmed ? "ready" : "pending",
        pendingRevision: confirmed ? null : result.revision,
        error: null,
      });

      return result;
    } catch (error) {
      if (current()) {
        this.publish({
          ...this.state,
          status: "error",
          pendingRevision: null,
          error: error instanceof Error ? error.message : "Cloud save failed.",
        });
      }
      throw error;
    } finally {
      if (current()) {
        this.busy = false;
        const latest = this.snapshot;
        if (latest.status === "pending" &&
            latest.pendingRevision === null) {
          this.publish({...latest, status: "ready"});
        }
      }
    }
  }
}