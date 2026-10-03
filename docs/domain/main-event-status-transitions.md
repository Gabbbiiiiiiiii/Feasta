# Main Event Status Transitions

## Purpose

This document defines the canonical lifecycle of a FEASTA main event.

A main event represents the customer's overall event booking. It coordinates one or more provider requests, payments, and fulfillment activities without duplicating the detailed lifecycle of each individual provider request.

Provider-specific acceptance, rejection, payment, and fulfillment states belong to provider request documents.

## Canonical statuses

| Status                     | Firestore value              | Description                                                                                                          |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Draft                      | `draft`                      | The customer is still creating or editing the event. Provider requests have not yet been formally submitted.         |
| Pending Provider Approval  | `pending_provider_approval`  | The event has been submitted and at least one required provider request is awaiting a provider decision.             |
| Needs Provider Replacement | `needs_provider_replacement` | A required provider request was rejected, cancelled, or expired and the customer must choose a replacement provider. |
| Waiting for Down Payment   | `waiting_for_down_payment`   | All required provider requests have been accepted and the event is waiting for the required initial payment.         |
| Confirmed                  | `confirmed`                  | Required provider requests and required down payments have been confirmed.                                           |
| In Progress                | `in_progress`                | The event date has arrived or event fulfillment has formally started.                                                |
| Completed                  | `completed`                  | The event and all required provider services have been completed.                                                    |
| Cancelled                  | `cancelled`                  | The event was intentionally cancelled and will not continue.                                                         |
| Expired                    | `expired`                    | The event can no longer continue because a required deadline passed without the necessary action.                    |

## Terminal statuses

The following statuses are terminal:

* `completed`
* `cancelled`
* `expired`

A terminal main event must not return to an active lifecycle status.

Administrative correction of a terminal event must use a controlled backend operation and must create an admin audit log. It must not be performed through a normal client-side status update.

## Allowed transitions

| Current status               | Allowed next status          | Trigger                                                                                             |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `draft`                      | `pending_provider_approval`  | Customer submits the event and its initial required provider requests.                              |
| `draft`                      | `cancelled`                  | Customer abandons or explicitly cancels the draft.                                                  |
| `pending_provider_approval`  | `waiting_for_down_payment`   | Every required provider request has been accepted.                                                  |
| `pending_provider_approval`  | `needs_provider_replacement` | A required provider request is rejected, cancelled, or expires.                                     |
| `pending_provider_approval`  | `cancelled`                  | Customer or authorized administrator cancels the event.                                             |
| `pending_provider_approval`  | `expired`                    | The provider-response deadline expires and the event cannot continue.                               |
| `needs_provider_replacement` | `pending_provider_approval`  | Customer selects and submits a replacement provider request.                                        |
| `needs_provider_replacement` | `cancelled`                  | Customer chooses not to replace the unavailable provider.                                           |
| `needs_provider_replacement` | `expired`                    | The replacement-selection deadline expires.                                                         |
| `waiting_for_down_payment`   | `confirmed`                  | All required down payments are successfully paid and corresponding provider requests are confirmed. |
| `waiting_for_down_payment`   | `needs_provider_replacement` | A required provider request becomes unavailable before payment confirmation.                        |
| `waiting_for_down_payment`   | `cancelled`                  | Customer or authorized administrator cancels the event.                                             |
| `waiting_for_down_payment`   | `expired`                    | The payment deadline expires before successful payment.                                             |
| `confirmed`                  | `in_progress`                | Event fulfillment starts.                                                                           |
| `confirmed`                  | `needs_provider_replacement` | A required provider cancels before fulfillment and replacement remains possible.                    |
| `confirmed`                  | `cancelled`                  | The event is cancelled under an allowed cancellation policy.                                        |
| `in_progress`                | `completed`                  | All required event services are completed.                                                          |
| `in_progress`                | `cancelled`                  | An authorized administrator terminates the event because fulfillment cannot continue.               |

## Transition diagram

```text
draft
  |
  | submit event
  v
pending_provider_approval
  |                     \
  | all required         \ required provider rejected,
  | requests accepted     \ cancelled, or expired
  v                        v
waiting_for_down_payment   needs_provider_replacement
  |                         |
  | required payments      | replacement submitted
  | confirmed               |
  v                         |
confirmed <-----------------+
  |
  | fulfillment starts
  v
in_progress
  |
  | all required services complete
  v
completed
```

At applicable non-terminal stages, the event may transition to `cancelled` or `expired`.

## Main event aggregation rules

The main event status is an aggregate derived from its required provider requests and required payment obligations.

### Draft

Set the main event to `draft` when:

* The customer has not submitted the event.
* Provider selection or event customization is still incomplete.
* No provider is expected to act yet.

### Pending provider approval

Set the main event to `pending_provider_approval` when:

* The customer has submitted the event.
* At least one required provider request has status `pending`.
* No required provider request currently requires replacement.

Optional add-on requests should not block the overall event unless they are explicitly marked as required.

### Needs provider replacement

Set the main event to `needs_provider_replacement` when:

* A required provider request is `rejected`, `cancelled`, or `expired`.
* No valid replacement request has been submitted for that required service.
* The overall event has not been cancelled or expired.

Once the replacement request is submitted, return the main event to `pending_provider_approval`.

### Waiting for down payment

Set the main event to `waiting_for_down_payment` when:

* Every required provider request has been accepted.
* At least one required provider request is waiting for its down payment.
* No required provider request is rejected, cancelled, or expired.

### Confirmed

Set the main event to `confirmed` when:

* Every required provider request is confirmed.
* Every required initial payment has succeeded.
* The event has not started.
* No required provider replacement is outstanding.

An optional provider request that is still pending must not necessarily block confirmation unless the request is marked as required.

### In progress

Set the main event to `in_progress` when:

* Event fulfillment has formally started; or
* A trusted backend process determines that the event has reached its configured start time and the required services are active.

The transition should not rely only on an untrusted customer device clock.

### Completed

Set the main event to `completed` when:

* Every required provider request is completed.
* No required provider service remains active or unresolved.
* Any required completion checks have passed.

Optional provider requests that were cancelled before confirmation should not block completion.

## Required and optional provider requests

Each provider request should contain a field that determines whether it blocks the main event lifecycle:

```text
isRequired: boolean
```

Examples:

* Primary catering request: normally required.
* Venue request: required when the event depends on that venue.
* Photographer request: optional unless the customer marks it as essential.
* Additional entertainment request: normally optional.

Only required provider requests participate in blocking aggregate transitions unless the business rules explicitly say otherwise.

## Transition authority

| Transition category                | Authorized actor                                                          |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Save or edit draft                 | Event owner                                                               |
| Submit event                       | Event owner                                                               |
| Cancel eligible event              | Event owner, administrator, or trusted backend                            |
| Aggregate provider-request results | Cloud Function or trusted server                                          |
| Confirm event after payment        | Payment webhook handler or trusted server                                 |
| Start event                        | Authorized provider workflow, administrator, or trusted scheduled process |
| Complete event                     | Trusted backend after required provider requests are completed            |
| Expire event                       | Trusted scheduled backend process                                         |
| Administrative correction          | Administrator through privileged backend operation                        |

Clients must not directly set aggregate statuses such as `confirmed`, `completed`, or `expired`.

## Atomic update requirements

Whenever a status transition occurs, the system should atomically update:

```text
mainEvents/{mainEventId}
  status
  updatedAt
  statusUpdatedAt
```

It should also create an immutable status-history record:

```text
mainEvents/{mainEventId}/statusHistory/{historyId}
  fromStatus
  toStatus
  reasonCode
  reason
  actorType
  actorId
  source
  createdAt
```

Recommended `source` values include:

```text
customer_app
provider_web
admin_web
cloud_function
payment_webhook
scheduled_job
migration
```

## Transition validation

Every transition must verify:

1. The current stored status matches the expected source status.
2. The requested destination is included in the allowed transition map.
3. The actor is authorized to trigger the transition.
4. All transition-specific preconditions are satisfied.
5. The event has not already entered a terminal state.
6. The status update and history record are written atomically.
7. Duplicate webhook or scheduled-job execution is idempotent.

## Invalid transitions

The following examples must be rejected:

```text
draft -> confirmed
draft -> completed
pending_provider_approval -> in_progress
needs_provider_replacement -> confirmed
waiting_for_down_payment -> completed
confirmed -> completed
completed -> in_progress
cancelled -> confirmed
expired -> pending_provider_approval
```

Skipping intermediate states is prohibited unless a documented administrative migration explicitly permits it.

## Suggested TypeScript transition map

```ts
import type { MainEventStatus } from "@feasta/shared-types";

export const MAIN_EVENT_STATUS_TRANSITIONS = {
  draft: [
    "pending_provider_approval",
    "cancelled",
  ],
  pending_provider_approval: [
    "waiting_for_down_payment",
    "needs_provider_replacement",
    "cancelled",
    "expired",
  ],
  needs_provider_replacement: [
    "pending_provider_approval",
    "cancelled",
    "expired",
  ],
  waiting_for_down_payment: [
    "confirmed",
    "needs_provider_replacement",
    "cancelled",
    "expired",
  ],
  confirmed: [
    "in_progress",
    "needs_provider_replacement",
    "cancelled",
  ],
  in_progress: [
    "completed",
    "cancelled",
  ],
  completed: [],
  cancelled: [],
  expired: [],
} as const satisfies Record<
  MainEventStatus,
  readonly MainEventStatus[]
>;
```

## Suggested transition helper

```ts
import type { MainEventStatus } from "@feasta/shared-types";

import { MAIN_EVENT_STATUS_TRANSITIONS } from "./main-event-status-transitions";

export function canTransitionMainEventStatus(
  currentStatus: MainEventStatus,
  nextStatus: MainEventStatus,
): boolean {
  return MAIN_EVENT_STATUS_TRANSITIONS[
    currentStatus
  ].includes(nextStatus);
}
```

## Firestore security direction

Firestore clients should not be allowed to freely update `mainEvents.status`.

Security rules should either:

* Prevent client status updates entirely and require Cloud Functions; or
* Permit only narrowly scoped customer transitions such as `draft` to `pending_provider_approval` and eligible cancellation transitions.

Aggregate transitions based on multiple provider requests or payments must be performed by trusted backend code.

## Audit and observability

Each rejected transition attempt should record enough structured information for debugging and security monitoring:

```text
mainEventId
currentStatus
requestedStatus
actorId
actorRole
source
reasonCode
timestamp
```

Sensitive payload data should not be copied into logs.

## Open implementation decisions

Before implementing the final Firestore rules and Cloud Functions, confirm:

1. Whether a customer may cancel an event after it becomes `in_progress`.
2. Whether a required provider may be replaced after the event becomes `confirmed`.
3. Whether entering `in_progress` is manual, time-based, or both.
4. Whether completion requires every provider request or only required provider requests.
5. Whether optional provider-request payment failures affect the main event.
6. The deadlines that produce `expired` at each lifecycle stage.

Until these policies are finalized, the transition map in this document is the canonical baseline.
