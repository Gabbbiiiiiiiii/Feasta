# Payment security

The approved product/business rules for future full-payment, deposit/balance,
commission, tax and settlement work are recorded in
[`payment-business-contract.md`](payment-business-contract.md).
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
| `paid` | `partially_refunded`, `refunded` |
| `partially_refunded` | `refunded` |
| `refunded` | none |

`pending` to `paid` is allowed because a fast webhook can arrive before the
checkout-creation transaction records `processing`. No transition may move a
confirmed payment back to a failed or processing state.

## Checkout

`createPaymentSession` requires an authenticated, active Customer and App Check outside emulators.

The request identifies the canonical Provider request, a supported payment choice, and an idempotency key. The client does not provide the authoritative payable amount.

The trusted backend derives checkout options and exact PHP centavo amounts from the frozen Provider-request financial state.

Depending on the canonical state, checkout may represent:

- the required minimum or deposit payment;
- the full booking amount; or
- the exact remaining balance.

A Customer may pay the exact remaining balance early when the backend checkout domain permits it.

Remaining-balance due, grace-period, and overdue state are display and reminder truth. They do not replace checkout options as payment-action authority.

Before creating a new remaining-balance checkout, the backend validates cancellation state, existing checkout recovery, duplicate checkout protection, and canonical financial state.

Currency is server-fixed to `PHP` and payable amounts are server-derived integer centavos.

Neither the web application nor the Flutter application treats a redirect as proof of payment. Successful Customer payment remains authoritative only after trusted gateway verification.

Customer payment success is also separate from Provider settlement. A verified Customer payment may create Provider earning and settlement accounting without claiming that the Provider has been paid.
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
the legacy full-refund confirmation. The refund request and confirmed state change are both
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

A payment may contain multiple completed refund operations. Cumulative completed
amounts move `paid` to `partially_refunded` and finally to `refunded`. Each
completed operation creates separate immutable reversal evidence for commission,
Provider VAT, FEASTA VAT, and Provider earning. Refund and payout reservations
exclude each other before external money movement. Refund truth does not imply
payout truth.

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

## P10 remaining balance and Provider settlement

P10 separates Customer payment truth from Provider settlement truth.

Remaining-balance statuses are `not_applicable`, `not_due`, `due_soon`, `due`, `grace_period`, `overdue`, `paid`, and `cancelled`.

Provider settlement statuses are `awaiting_availability`, `ready`, `reserved`, `processing`, `paid`, `reconciliation_required`, and `cancelled`.

Payout-attempt statuses are `reserved`, `dispatching`, `submitted`, `processing`, `succeeded`, `failed`, and `ambiguous`.

Refund and payout reservation paths check each other's canonical locks before external money movement.

Ambiguous payout outcomes require reconciliation and must not automatically mark a Provider paid.

Settlement transport remains independently gated from linked-account onboarding readiness and currently fails closed.

See `provider-finance-and-payouts.md` for the complete P10 finance contract.
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
## P8 commission, VAT, and financial ledger

Every canonical successful P5 payment creates exactly one immutable
`financialLedgerEntries/{paymentId}` record inside the same trusted Firestore
transaction that records the payment outcome.

The provider request stores cumulative accounting projections:

- `commissionAccruedInCentavos`
- `commissionReversedInCentavos`
- `commissionEarnedInCentavos`
- `providerVatAccruedInCentavos`
- `providerVatReversedInCentavos`
- `providerVatNetInCentavos`
- `platformVatAccruedInCentavos`
- `platformVatReversedInCentavos`
- `platformVatNetInCentavos`
- withholding-ready accrued/reversed/net fields, currently fixed to zero

Commission uses the snapshotted booking commission rate and cumulative integer
centavo allocation. This guarantees that deposit plus remaining balance produces
the same final commission as one full payment, including centavo rounding.

For a provider whose snapshotted tax profile is both `vat_registered` and
`verified`, provider VAT is recorded as the VAT-inclusive component of the
provider service gross. A Non-VAT or unverified provider receives no provider
VAT component.

FEASTA/platform VAT is calculated only when the snapshotted platform tax status
is `vat_registered`, and its base is FEASTA's commission rather than the whole
provider service amount.

Withholding fields exist in the immutable calculation snapshots so later tax
work can extend the accounting contract, but P8 does not automatically apply
withholding.

Completed canonical refunds do not modify or erase the original successful
payment ledger entry. Each completed refund operation instead creates a separate
immutable `refund_{refundOperationId}` ledger record. Commission, provider VAT,
and platform VAT are reversed proportionally using cumulative deterministic
rounding. A sequence of partial refunds therefore reconciles to the exact same
final reversal as one full refund.

Firestore client rules allow only Admin reads of raw
`financialLedgerEntries`. Customer and Provider clients cannot read them, and
no browser client, including Admin, can create, update, or delete ledger
evidence. Ledger writes are Functions/Admin-SDK only.

## P11 Admin monitoring and versioned payment policy

P11 keeps the payment trust boundaries introduced by the earlier payment phases
while adding Admin finance visibility and configurable future package
payment-term bounds.

Admin Payment Monitoring distinguishes:

- booking value;
- Customer collected amount;
- Customer remaining balance;
- Provider earning state;
- Provider settlement state;
- Provider payout-attempt evidence;
- FEASTA commission;
- Provider VAT;
- FEASTA VAT;
- failed Customer payments;
- failed Provider payouts; and
- reconciliation-required settlements.

Those values are not collapsed into a single "paid" state. In particular,
Customer payment success does not imply Provider payout success.

The versioned `appSettings/platform` financial policy contains commission,
simulated FEASTA tax/VAT, deposit bounds, and remaining-balance deadline bounds
under one `financialPolicyVersion`.

The initial/default package policy is:

- minimum deposit: 20%;
- maximum deposit: 80%;
- minimum remaining-balance deadline: 1 day before the event; and
- maximum remaining-balance deadline: 30 days before the event.

Admin changes to those bounds apply to future Provider package create/edit
operations. Trusted Cloud Functions reload and enforce the current policy.
Provider browser validation is guidance only.

Existing saved package terms and frozen booking financial snapshots are not
recalculated when Admin settings change. Booking snapshot validation therefore
checks stored package terms against the permanent technical envelope rather
than today's Admin policy.

Direct client mutation of `appSettings/platform` is denied. Admin monitoring
does not expose controls to mark Provider payouts paid, retry payout dispatch,
force reconciliation, release settlement money, send payouts, or withdraw
funds.

Settlement transport remains fail-closed and the current implementation does
not dispatch PayMongo batch transfers.

## P12 gateway-fee evidence and read-only reporting

Trusted PayMongo evidence may establish an observed gateway processing fee,
including a legitimate zero-centavo fee. Missing evidence remains null, absent,
or unavailable and is never defaulted to zero. Gateway processing fees remain
separate from commission, Provider VAT, FEASTA VAT, Provider earning, refund
allocation, settlement, and payout calculations.

Customer Payment History and the protected Payment Receipt route use bounded
server-authorized projections and expose partial/full refund history without
Provider or internal finance evidence. The receipt is printable.

The monthly Provider Earnings Statement uses `Asia/Manila` periods and exposes
earning and refund-reversal evidence through read-only print and CSV views.
Provider earning truth remains separate from settlement truth.

The read-only Admin Financial Report and Financial Export cover commission, VAT,
reversals, refunds, Provider earnings, settlements, and gateway-fee evidence
completeness. If gateway-fee evidence is incomplete, Net FEASTA platform revenue
is not derived automatically.

Customer-paid truth is not Provider-paid truth. Settlement truth is not payout
transport truth, and transport remains fail-closed.
