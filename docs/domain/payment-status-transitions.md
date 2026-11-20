# Payment Status Transitions

## Purpose

This document defines the canonical lifecycle of a FEASTA payment. A payment
represents one financial transaction associated with a main event and, where
applicable, a specific Provider request.

Payment state is controlled by trusted backend code and verified payment-gateway
evidence. A browser redirect or client callback is never proof of payment or
refund.

## Canonical statuses

| Status | Firestore value | Meaning |
|---|---|---|
| Pending | `pending` | The payment exists, but processing or successful payment has not been confirmed. |
| Processing | `processing` | A trusted checkout/payment attempt is in progress. |
| Paid | `paid` | The payment was successfully completed and verified. |
| Partially refunded | `partially_refunded` | One or more completed refunds have returned less than the full paid amount. |
| Failed | `failed` | The payment attempt failed. |
| Expired | `expired` | The payment window expired, but a trusted retry may create a new processing attempt. |
| Refunded | `refunded` | Completed refunds have returned the full paid amount. |

## Allowed transitions

| Current | Allowed next states |
|---|---|
| `pending` | `processing`, `paid`, `failed`, `expired` |
| `processing` | `paid`, `failed`, `expired` |
| `failed` | `processing` |
| `expired` | `processing` |
| `paid` | `partially_refunded`, `refunded` |
| `partially_refunded` | `refunded` |
| `refunded` | none |

`pending` to `paid` permits a verified fast webhook to arrive before checkout
creation records `processing`. `refunded` is terminal. Failed and expired
attempts may return only to `processing`; confirmed payment cannot move back to
an unpaid state.

Partial and full refund status is cumulative across all completed refund
operations for the payment. Refund status does not assert that a Provider
settlement or payout was reversed, dispatched, or completed.