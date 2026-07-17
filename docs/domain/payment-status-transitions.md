# Payment Status Transitions

## Purpose

This document defines the canonical lifecycle of a FEASTA payment.

A payment represents one financial transaction associated with a main event and, where applicable, a specific provider request.

Payment state must be controlled by trusted backend code and payment-gateway webhook verification.

---

## Canonical statuses

| Status | Firestore value | Meaning |
|---|---|---|
| Pending | `pending` | The payment record exists, but successful payment has not been confirmed. |
| Paid | `paid` | The payment was successfully completed and verified. |
| Failed | `failed` | The payment attempt failed. |
| Expired | `expired` | The payment can no longer be completed because its payment window expired. |

---

## Terminal statuses

The following statuses are terminal for an individual payment attempt:

```text
paid
failed
expired