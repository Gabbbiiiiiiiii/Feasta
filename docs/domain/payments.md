# Payment security

Canonical payment records are backend-owned. Firestore Rules deny every client
create, update, and delete on `payments`, nested payment events, and immutable
payment audit history. Raw payment documents also contain gateway correlation,
webhook state, and refund accounting, so Customer and Provider client reads are
denied. Participant screens use bounded server DTOs; admins use trusted server
services and callable operations rather than direct Firestore writes.

## Lifecycle

The exact payment lifecycle is:

| Current | Allowed next states |
|---|---|
| `pending` | `processing`, `paid`, `failed`, `expired` |
| `processing` | `paid`, `failed`, `expired` |
| `failed` | `processing` |
| `expired` | `processing` |
| `paid` | `refunded` |
| `refunded` | none |

`pending → paid` is allowed because a fast webhook can arrive before the
checkout-creation transaction records `processing`. No transition may move a
confirmed payment back to a failed or processing state.

## Checkout

`createPaymentSession` requires an authenticated, active customer and App Check
outside emulators. It accepts only `bookingId` and an idempotency key. The server
loads `mainEvents/{bookingId}`, verifies customer ownership, requires
`waiting_for_down_payment`, verifies the linked approved provider, and derives
the amount from `downPaymentAmount`. Currency is server-fixed to `PHP`.

The canonical document stores both the peso amount and integer centavos. The
PayMongo Checkout Session receives server metadata containing `payment_id`,
`booking_id`, and `customer_id`. PayMongo API requests use the deterministic
payment ID as their idempotency key. The secret key is a Functions secret named
`PAYMONGO_SECRET_KEY`; it is never returned or logged.

The Flutter app opens the returned HTTPS checkout URL. It never creates a
payment record or displays success based only on a redirect. Add-on checkout is
disabled until it has an equivalent backend-derived amount and ownership flow.

## Webhook

`payMongoWebhook` is intentionally an HTTP endpoint without App Check because
PayMongo cannot mint Firebase App Check tokens. It requires POST and verifies
`Paymongo-Signature` against the untouched raw body using
`PAYMONGO_WEBHOOK_SECRET` before parsing JSON. Test/live signatures are compared
in constant time, and timestamps outside five minutes are rejected.

The event must contain the server-issued payment ID. A Firestore transaction:

1. rejects a previously stored event ID;
2. reloads the payment, booking, and provider;
3. verifies customer and provider linkage;
4. compares exact integer amount and `PHP` currency;
5. enforces the lifecycle transition;
6. updates payment and booking state;
7. stores the minimal webhook event record;
8. creates an audit log and customer/provider notifications.

`paidAt`, `failedAt`, `expiredAt`, and `refundedAt` use backend server
timestamps. Raw payloads, card data, billing data, authorization headers, and
full PayMongo error payloads are not stored or logged.

## Refunds

`requestPaymentRefund` requires an active admin, App Check, a paid payment, and
a gateway payment ID. It requests the refund using the backend secret but does
not mark the payment refunded. Only a signed `payment.refunded` webhook performs
`paid → refunded`. The refund request and confirmed state change are both
audited.

Policy-backed cancellation refunds use
`payments/{paymentId}/refunds/{refundOperationId}`. Those operation documents
are never client-readable. Customer/Provider status is exposed only through the
participant-safe cancellation callables. A refund below 100 centavos is never
rounded up or sent to PayMongo: the one existing reservation remains in a
failed/reconciliation-required state with `GATEWAY_MINIMUM_UNSUPPORTED`.

Partial-refund support varies by payment method. Execution is allowed only when
trusted payment evidence identifies `card` or `gcash`; unknown methods and
`paymaya` are routed to reconciliation with
`PARTIAL_REFUND_CAPABILITY_UNCONFIRMED` before any gateway request. The current
webhook parser does not yet capture authoritative payment-method evidence, so
legacy/current unknown-method partial refunds remain blocked. This is a
production rollout blocker, not a client decision.

## Cancellation/refund rollout

The private `appSettings/cancellationRefundRollout` document is server-managed:

```json
{
  "schemaVersion": 1,
  "isPublic": false,
  "customerCancellationMode": "review_only",
  "automaticPolicyRefundApprovalMode": "off"
}
```

`customerCancellationMode` is `off`, `review_only`, or `enabled`. Missing or
malformed configuration fails closed. Automatic approval may be `enabled` only
when Customer cancellation is also `enabled`; no automatic approval trigger is
currently implemented. The initial production value must be `review_only` with
automatic approval `off`. Firestore client rules deny changes to this document
and to `appSettings/refundPolicyBookingAgreement` even for an Admin browser.

## Configuration and validation

```powershell
firebase functions:secrets:set PAYMONGO_SECRET_KEY
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET
pnpm --dir functions test
pnpm emulator:payment:test
pnpm emulator:test
```

Set `PAYMENT_SUCCESS_URL` and `PAYMENT_CANCEL_URL` from
`functions/.env.example`; deployed values must be HTTPS. Register one PayMongo
webhook for the payment events `checkout_session.payment.paid`, `payment.paid`,
`payment.failed`, `payment_intent.payment_failed`,
`checkout_session.expired`. B6 refund reconciliation expects
`refund.succeeded` and `payment.refund.updated`; legacy full-refund confirmation
also uses `payment.refunded`. PayMongo's current event guide names
`refund.succeeded`, while its webhook-resource/refund guide names
`payment.refunded` and `payment.refund.updated`, so production must subscribe to
all available names and validate staging payloads before rollout. Point the
subscription to the deployed
`payMongoWebhook` URL. Refund events must include the exact FEASTA metadata
`feasta_payment_id` and `feasta_refund_operation_id`; missing metadata, unknown
operations, gateway/payment ID mismatch, amount mismatch, currency mismatch,
or unsupported event types fail closed. Production credentials, capability
confirmation, and webhook registration are external deployment steps and are
not committed or changed by local validation.

PayMongo references used for the release audit:

- [Refund resource](https://docs.paymongo.com/reference/refund-resource)
- [Refund guide](https://docs.paymongo.com/docs/payment-acceptance-refunds)
- [Webhook event payloads](https://docs.paymongo.com/docs/developer-tools-webhooks-events)
- [Webhook resource event names](https://docs.paymongo.com/reference/webhook-resource)
