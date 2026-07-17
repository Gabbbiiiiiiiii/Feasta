# Provider Request Status Transitions

## Purpose

This document defines the canonical lifecycle of a provider request in FEASTA.

A provider request represents one service request connected to a main event. Examples include:

- Catering
- Photography
- Videography
- Venue
- Hosting
- Styling
- Lights and sounds
- Other event add-ons

Each provider request belongs to exactly one main event and one provider.

The provider-request lifecycle must remain separate from the overall main-event lifecycle.

---

## Canonical statuses

| Status | Firestore value | Meaning |
|---|---|---|
| Pending | `pending` | The request has been submitted and is waiting for the provider's response. |
| Accepted | `accepted` | The provider accepted the request, but payment or additional confirmation may still be required. |
| Rejected | `rejected` | The provider declined the request. |
| Waiting for Down Payment | `waiting_for_down_payment` | The provider accepted the request and the required down payment has not yet been completed. |
| Payment Processing | `payment_processing` | A payment attempt is currently being processed or verified. |
| Confirmed | `confirmed` | The request is fully secured and all required initial payment conditions have been satisfied. |
| In Progress | `in_progress` | The provider has started fulfilling the requested service. |
| Completed | `completed` | The provider has completed the requested service. |
| Cancelled | `cancelled` | The request was intentionally cancelled. |
| Expired | `expired` | The request can no longer proceed because a required deadline passed. |

---

## Terminal statuses

The following statuses are terminal:

```text
rejected
completed
cancelled
expired