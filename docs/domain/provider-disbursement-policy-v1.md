# FEASTA Provider Disbursement Policy v1

## Status

P13-B orchestration is preserved. P13-C adds a server-owned PayMongo V2 simulator
transport; it remains unavailable without explicit test configuration and existing
Provider readiness. The separate external-dispatch flag must also authorize reservation.

Real external money movement remains disabled until PayMongo sandbox
disbursement/Workflow capability is verified for the FEASTA account.

## Ordinary Provider payout

A canonical Provider Request created under
`providerDisbursementPolicyVersion = 1` becomes payout-eligible on the
third Philippine banking day after trusted event completion.

The normal release boundary is 10:00 AM Asia/Manila.

Saturday, Sunday, and configured Philippine banking holidays do not count
as banking days.

Historical Provider Requests without the frozen v1 policy are not
automatically enrolled.

## Amount

The Provider payout is derived only from canonical Provider earnings and
Provider settlements.

For an ordinary payment:

Customer gross collected
- FEASTA commission
- applicable withholding
= Provider earning

Provider VAT already contained in the service gross is not deducted again.

A Provider Request with a deposit and remaining-balance payment is treated
as one disbursement obligation. The disbursement amount is the sum of the
final payable source settlements after completed reversals.

## Preconditions

External dispatch must fail closed unless:

- the Provider Request is completed;
- the Customer obligation is fully settled;
- the payout-eligibility boundary has been reached;
- source settlements reconcile;
- no refund is reserved or processing;
- no settlement or payment requires reconciliation;
- the Provider payout account is ready;
- the linked PayMongo relationship is enabled;
- the selected settlement transport is separately verified;
- there is no active payout attempt;
- the amount is positive PHP;
- platform disbursements are enabled.

## State machine

scheduled
-> held | ready
-> reserved
-> processing
-> paid

A terminal known-safe gateway failure may return to a retryable state.

An ambiguous gateway outcome goes to `reconciliation_required` and must
not automatically retry.

`cancelled` means no Provider money remains payable.

## Payment-default compensation

The Customer payment-default allocation remains exactly:

- Customer refund: 70% of collected deposit
- Provider reservation compensation: 20%
- FEASTA cancellation/platform fee: 10%

The 20% Provider compensation is separate from ordinary commission and
ordinary completed-service earnings.

It becomes payout-eligible one Philippine banking day after the required
Customer refund is successfully confirmed and the allocation is
financially clear.

A server Firestore trigger observes committed canonical payment-default finalization and schedules the same execution engine idempotently. It uses the persisted finalization timestamp and does not recalculate the allocation.

## PayMongo transport

Current transfer boundary is one V2 batch transfer per ProviderDisbursement.
P13-C supports wallet_transfer only, using a verified activated test wallet and an
official simulator destination configured by the server. Linked-account org IDs
remain readiness evidence, never bank destinations. The distinct workflow mode
remains unavailable in this adapter.

P13-C requires the dedicated PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY to contain an
sk_test_ credential, explicit frozen test mode, and livemode false
wallet/transfer evidence. No live transport exists. The transport reads only this
dedicated secret, and reconcileProviderDisbursements binds only this secret.
Missing dedicated credentials or sk_live_ credentials fail before HTTP, with no
fallback to PAYMONGO_SECRET_KEY. The shared key and existing customer payment,
refund, webhook, remaining-balance lifecycle, and Provider onboarding bindings
remain unchanged. P13-C E2E must never require changing the shared key. No remote
Firebase secret was set by this correction. Configuration, HTTP retry,
reconciliation and pending manual E2E details are in
[the P13-C report](provider-disbursement-p13-c-report.md).

When test mode is true, the server-owned
providerDisbursementTestAllowedDisbursementId must be a valid FEASTA disbursement
document ID matching the current disbursement exactly. Absent, malformed or
mismatched values block reservation and external dispatch. This restriction is
operational: financial readiness remains independent, and other ready payouts
remain untouched. Reservation freezes the allowed ID into the attempt; settings
changes cannot redirect an existing attempt.

Before transfer creation, retrieve the test wallet account and balance. Require
matching wallet identity, livemode false, activated status, valid PayMongo source
account, and a safe nonnegative V2 balance.available in PHP centavos covering the
entire attempt amount. Exact payout balance is accepted. Invalid or insufficient
funding prevents transfer submission and supplies no terminal gateway failure.
No fee is invented or deducted from Provider entitlement. Gateway fee-inclusive
funding sufficiency is not claimed by this principal-only check.

FEASTA must not invent an undocumented child-wallet transfer contract.

Every external write must use a deterministic idempotency key and FEASTA
internal reference.

Webhook/gateway confirmation is authoritative for successful payout.

Provider payout transfer fees are FEASTA-side operating costs unless a
future written policy explicitly changes this rule. They are not silently
subtracted from Provider entitlement.

## Admin safety

Admin may inspect payout state and retry a definitively failed transfer
only after validation.

Admin may never manually:

- force a payout to Paid;
- invent a gateway success;
- clear an ambiguous transfer without reconciliation evidence;
- change payout amounts after reservation.

Raw gateway identifiers stay in Additional details.

## Financial readiness and execution

`providerDisbursementsEnabled` means external dispatch permission only. Missing/false is OFF. Financial readiness is computed independently of this flag or account transport readiness. No deployed setting is changed by this implementation.

The trusted completion instant is captured on the server before the lifecycle transaction and persisted as both request completion and payout anchor. Transaction retries reuse it. Initial transport is `disabled`; only reservation freezes verified transport, test-mode evidence and destination.

`providerDisbursements` references all canonical source settlements. One `providerDisbursementAttempts` record owns the external attempt identity/reference/idempotency key. Existing `providerPayoutAttempts` records remain settlement reservation linkage records and cannot independently dispatch the aggregate. Every payable settlement reserves in the same transaction or none do. Fully reversed zero settlements remain canonical evidence and are excluded from monetary reservations.

Pending keeps reservations. Trusted success atomically completes existing settlement accounting and marks the aggregate paid. Terminal gateway failure releases reservations without paying earnings. Timeout/unknown remains locked for evidence-only reconciliation. Admin retry prepares a financial revalidation only after persisted terminal failure; the next reservation increments the attempt sequence. Client amounts/statuses/destination changes are rejected.

Gateway success/failure enters through the existing signature-verified PayMongo
route. The parser requires the standard event envelope and full test-mode
evidence, supporting transfer-shaped and wallet_transaction resources. Real
PayMongo account-specific verification remains a sandbox prerequisite; no
external E2E has been executed.

A later refund cannot automatically claw back paid Provider funds. Existing refund dispatch guards remain authoritative. Ordinary Provider suspension is not used as a financial hold.
