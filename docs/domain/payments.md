# Payment security

Canonical payment records are backend-owned. Firestore Rules deny every client
create, update, and delete on `payments`, nested payment events, and immutable
payment audit history. Customers and linked providers receive read-only access;
admins use callable/backend operations rather than direct Firestore writes.

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
webhook for the supported payment/refund events and point it to the deployed
`payMongoWebhook` URL. Production credentials and webhook registration are
external deployment steps and are not committed.
