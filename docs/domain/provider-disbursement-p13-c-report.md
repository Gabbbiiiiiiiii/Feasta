# FEASTA P13-C: PayMongo TEST-MODE Provider Disbursement Transport

Branch: feat/p13-c-paymongo-test-transport. Implementation and local mocked validation only.
No Firebase Emulator was used. No external E2E is claimed.

## Scope and financial invariants

The existing completion → three Philippine banking-day eligibility → financial
revalidation → ready → atomic reservation → one aggregate external attempt pipeline
is preserved. Trusted pending retains all reservations and becomes processing;
trusted success alone pays earnings; trusted terminal failure releases reservations
without paying; unknown evidence retains locks in reconciliation_required.

Admin may prepare a retry only after persisted definitive failure, followed by
financial revalidation and a new sequence. No Force Paid or manual payout action
was added. Customer payment behavior and raw-body signature verification were unchanged.

This is an official-simulator harness, not Provider bank provisioning. Linked org_*
account IDs remain readiness evidence and never become bank account numbers.
P13-C implements only wallet_transfer; the distinct workflow mode remains unavailable.

## Exact server-owned configuration

Location: appSettings/platform. Existing Firestore rules prohibit browser
create/update of this platform document, including for Admin users. No settings
defaults, initialization, remote writes or migration were added.

Configuration template only; replace both placeholders with verified test values
before a future reviewed manual E2E:

    {
      "providerDisbursementTestMode": true,
      "providerDisbursementTestAllowedDisbursementId": "<canonical-disbursement-id>",
      "providerDisbursementTestWalletId": "wallet_<verified-test-wallet-id>",
      "providerDisbursementTestDestination": {
        "number": "999999990002",
        "name": "FEASTA TEST PROVIDER",
        "bic": "<configured-supported-test-BIC>",
        "provider": "instapay"
      }
    }

- Test mode must be boolean true.
- providerDisbursementTestAllowedDisbursementId is mandatory and must match
  ^[A-Za-z0-9_-]{1,220}$, the FEASTA disbursement document-ID shape. It must
  equal the current canonical disbursementId. Missing, malformed or different
  values block reservation without writes and skip scheduled dispatch. There is
  no wildcard or missing-field fallback to all disbursements.
- Wallet ID must match ^wallet_[A-Za-z0-9_-]{3,200}$.
- Destination number must be one of the six simulator numbers below.
- Name must be nonempty, at most 200 characters.
- BIC must match ^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$ (8 or 11 characters).
  Shape validation does not claim a BIC is supported by a rail; the manual E2E
  operator must verify the configured test BIC with PayMongo.
- Provider must be instapay or pesonet.
- Explicit live account/destination markers cannot pass capability.
- Existing providerSettlementCapability must still report transportReady and
  wallet_transfer. Test configuration cannot bypass payout readiness, account
  activation, relationship or separate transport-verification requirements.
- providerDisbursementsEnabled === true remains a separate reservation/dispatch
  prerequisite. Capability can describe valid configuration while that flag is
  off; this cannot reserve or send a payout. This task did not modify the flag.

Reservation clones the frozen destination snapshot:

    {
      testMode: true, livemode: false, allowedDisbursementId, walletId, provider,
      destinationAccount: {number, name, bic}
    }

Later settings changes do not alter an existing attempt, including its frozen
allowedDisbursementId. Dispatch validates that frozen ID against the attempt
before HTTP. Reconciliation of already reserved attempts remains evidence-only
and does not depend on the current allowlist. No HTTP occurs inside reservation.

Financial readiness remains independent of this operational restriction. A
financially clear unallowlisted payout remains ready with the operational
dispatchBlockReason paymongo_test_disbursement_not_allowed; it is not reserved,
failed, or held by the allowlist. The platform dispatch flag cannot fan out test
transfers to every eligible payout.

## Official simulator destinations

| Number | Expected final status | Expected error |
|---|---|---|
| 999999990001 | succeeded | — |
| 999999990002 | failed | test_failed_number |
| 999999990003 | failed | account_not_found |
| 999999990004 | failed | account_not_active |
| 999999990005 | failed | account_limit_reached |
| 999999990006 | failed | internal_server_error |

See [PayMongo Transfer Test Cases](https://docs.paymongo.com/docs/transfer-test-cases).
Any other destination number makes this transport unavailable.

## Exact transport contract

The focused paymongo-disbursement-client.ts client has injectable HTTP and sleep
dependencies. Automated tests mock every PayMongo HTTP exchange.

Before dispatch, revalidate the reserved server attempt: schema, positive
safe-integer PHP centavos, frozen test markers, wallet ID, rail, simulator
destination, exact frozen allowed disbursement ID, reserved state, absent gateway ID,
and deterministic external
identity derived from disbursement ID/sequence. Reference and idempotency key
must equal the existing external identity. The browser supplies none of these.

HTTP Basic authentication uses PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY as username and an empty
password. Only a nonempty sk_test_ key is accepted. Error messages contain no
secrets or gateway bodies; the client performs no logging.

The transport defines and reads only PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY.
reconcileProviderDisbursements binds only that dedicated secret. Missing or live
dedicated credentials fail before HTTP; there is no fallback to PAYMONGO_SECRET_KEY.
The shared PAYMONGO_SECRET_KEY and its customer payment, refund, webhook,
remaining-balance lifecycle, and Provider onboarding bindings remain unchanged.
A future P13-C E2E must use the dedicated test credential and must never require
replacing or rotating the shared key. This task defined the binding locally only;
no Firebase secret was set.

1. GET https://api.paymongo.com/v2/wallets/{walletId}?fields=account&fields=balance.
   Require matching wallet ID, livemode false and activated status. V2 data.account
   supplies PHP account_number/account_name with PayMongo provider when present.
   These map to source number/name and the documented source BIC PAEYPHM2XXX.
   The guide's equivalent source_account shape is accepted only with that exact
   BIC, a numeric number and nonempty name. Missing source data, live or inactive
   wallets prevent creation. Use the documented V2 data.balance.available value in
   PHP centavos, requiring a safe nonnegative integer at least equal to
   attempt.amountInCentavos. Exact payout balance is accepted. Missing, malformed,
   negative or insufficient balances prevent POST entirely, with the operational
   reasons paymongo_test_wallet_balance_invalid or
   paymongo_test_wallet_balance_insufficient. No transfer fee is invented or added
   to Provider entitlement; no fee is deducted from the payout. This check covers
   payout principal and does not claim gateway fee-inclusive funding sufficiency.
2. POST https://api.paymongo.com/v2/batch_transfers, using a top-level transfers
   array containing exactly one object with provider, amount, currency PHP,
   purpose Disbursement, description, reference_number, source_account,
   destination_account and metadata. Amount equals the attempt amount, without
   subtracting fees. Metadata contains server attempt/disbursement identifiers
   and a test marker. Idempotency-Key equals attempt.idempotencyKey.
   reference_number equals attempt.referenceNumber.
3. Accept a returned batch only if it contains exactly one transfer matching
   reference, amount, PHP currency, destination number/name/BIC and livemode false.
   Flat V2 and attribute-wrapped resources normalize to whitelisted TransferEvidence.
   Only pending/succeeded/failed statuses are valid. Reject contradictory batch IDs
   or explicit live wrapper evidence. Run existing assertTransferEvidence before
   financial application.

Verified against [PayMongo's V2 guide](https://docs.paymongo.com/docs/money-movement-moving-money-with-api),
[Wallet Resource](https://docs.paymongo.com/reference/wallet-resource), and
[Transfer Resource](https://docs.paymongo.com/reference/transfer-resource).

## HTTP retry and unknown outcomes

Each exchange allows at most three HTTP calls, each with a 10-second timeout,
and 1-second/2-second backoff. Network errors, timeouts and 5xx retry the identical
serialized body and exact same idempotency key. HTTP 409 retries only when its
error code is idempotency_in_progress. Ordinary 4xx, including other 409 errors,
are not blindly retried. No retry generates a UUID. A decode failure after a
successful write remains unknown; same-body/key bounded retry is safe.

Exhaustion, rejection without transfer evidence, malformed responses or financial
mismatches never manufacture trusted definitive failure. Existing dispatch logic
moves unknown outcomes into reconciliation_required with reservations locked.
A scheduled sweep never resends an ambiguous attempt.

This follows [PayMongo's idempotency guidance](https://docs.paymongo.com/docs/money-movement-best-practices).
Wallet retrieval plus submission has an HTTP upper bound of approximately 66
seconds, excluding Firestore work. The scheduled function explicitly binds
PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY, sets a 540-second timeout, and starts no new candidate after
450 seconds; unvisited candidates remain due for the next sweep.

## Retrieval and reconciliation

With a validated known tr_* gateway ID, GET /v2/transfers/{id}.
Otherwise GET /v2/transfers?reference_number={attempt.referenceNumber}&limit=100.
See [PayMongo's reference lookup guidance](https://docs.paymongo.com/docs/money-movement-best-practices).

The client locally checks the reference rather than trusting the gateway filter.
Both data arrays and data.transfers lists are supported. Zero matching resources
returns null; exactly one must pass evidence validation; multiple matches throw.

Incomplete/truncated pages (has_more or a full 100-row page) fail closed rather
than assuming a unique match. This bounded implementation does not scan further
pages; such a result needs operational investigation. Retrieval uses only GET
and never recreates an attempt. Pending remains processing, including resolution
of ambiguity. Errors or zero matches retain reservations. Legacy P13-B attempts
without a simulator snapshot remain unavailable to this HTTP adapter and return
null, preserving locks.

## Signed webhook compatibility and identifiers

payments/paymongo-webhook.ts still verifies the signature against the raw body
before transfer parsing. Only transfer.outward.successful and transfer.outward.failed
are accepted. Both the envelope and resource require livemode false and a FEASTA
pd_ reference with 40 lowercase hexadecimal characters. Success requires succeeded;
failure requires failed. Pending cannot masquerade as terminal. Inward events
are ignored by the Provider parser.

Existing transfer/attributes resources remain supported. Current wallet_transaction
resources map transfer_id (or a trusted tr_* resource ID) to evidence.id and
receiver.bank_account_number/bank_account_name/bank_code to destination_account
number/name/bic. A wallet_tr_* ID cannot replace a transfer ID. Amount/currency/
destination still pass assertTransferEvidence. See
[PayMongo's event examples](https://docs.paymongo.com/docs/developer-tools-webhooks-events).

Persisted gatewayEvidence retains the PayMongo transfer ID, FEASTA reference and
optional provider_reference_number/batch_transfer_id. Missing optional fields
remain compatible with old documents. Terminal webhooks retain previously learned
identifiers when omitted. Conflicting identifiers fail closed. A duplicate may
enrich a previously absent trusted identifier, but never reapplies financial
accounting; a repeated identical observation performs no additional write.
Legacy wallet batch_transaction_id is not mislabeled as V2 batch_transfer_id.

## Independent live-money barriers

1. Only sk_test_ secrets can authorize HTTP.
2. Explicit server test mode is frozen into the attempt; only six official
   simulator destinations are permitted.
3. Wallet and accepted transfer evidence must have livemode false. Missing,
   true or conflicting live evidence fails closed.

There is no sk_live transport path or production-mode switch. Existing financial
and external-dispatch controls remain additional barriers.

## Manual E2E still pending

After implementation review, the user will perform real Firebase + real PayMongo
test-mode E2E manually. This task did not connect to those services for runtime
operations, read remote settings, or verify the remote wallet/BIC/subscription.

Before any manual E2E, set the server-owned allowlist to exactly the selected
canonical FEASTA disbursement document ID, verify its test wallet balance, and
leave other ready payouts outside that allowlist. This task did not perform any
of those remote changes.

First scenario: 999999990002 → PayMongo test_failed_number → signed webhook or
evidence-only reconciliation → FEASTA failed → Admin Payment Monitoring →
Retry failed payout → financial revalidation → new attempt sequence.

Verify the deployed signed webhook subscription covers outward transfer events.
The adapter does not invent a callback URL or configure subscriptions. Real
resource shapes and test-mode behavior must still be verified against the actual
account. None of those observations are claimed by mocked tests.

## Files

Added:

- functions/src/provider-finance/paymongo-disbursement-client.ts
- functions/test/paymongo-disbursement-client.test.cjs
- docs/domain/provider-disbursement-p13-c-report.md

Modified:

- functions/src/provider-finance/provider-disbursement-transport.ts
- functions/src/provider-finance/provider-disbursement-domain.ts
- functions/src/provider-finance/provider-disbursement-execution.ts
- functions/src/provider-finance/provider-disbursement-reconciliation.ts
- functions/src/provider-finance/provider-disbursement-webhook.ts
- functions/test/provider-disbursement-transactions.test.cjs
- docs/domain/provider-disbursement-policy-v1.md

No customer-payment route, Admin retry implementation, index exports, Firestore
rules, package manifest or remote configuration was changed.

## Final validation

| Check | Result |
|---|---|
| pnpm --dir functions build | PASS |
| node --test functions/test/paymongo-disbursement-client.test.cjs | 126 passed |
| node --test functions/test/provider-disbursement-domain.test.cjs | 97 passed |
| node --test functions/test/provider-disbursement-policy.test.cjs | 4 passed |
| node --test functions/test/provider-disbursement-transactions.test.cjs | 59 passed |
| node --test functions/test/provider-disbursement-wiring.test.cjs | 5 passed |
| node --test functions/test/function-security-contract.test.cjs | 93 passed |
| Combined node --test run of all six files | 384 passed, 0 failed, 0 skipped |
| pnpm --dir functions lint | PASS: 0 errors, 470 max-len warnings |
| git diff --check | PASS (line-ending conversion notices only) |

There are 126 P13-C client/webhook tests and 23 added transaction/accounting
regressions (59 transaction tests including existing coverage). The final
pre-E2E correction pass adds 19 client and 10 transaction tests. The dedicated
secret correction adds 13 further tests for isolated credentials, scheduler
bindings, missing/live rejection, and unchanged shared-secret consumers.
Every PayMongo HTTP exchange is mocked. No emulator was run. P13-B regressions
cover Admin retry restrictions, pending/unknown lock preservation, terminal
idempotency, and signed webhook rejection.

## Safety confirmations

No deployment performed. Nothing committed or pushed. No remote Firebase
setting/document changed. No PayMongo API request sent. Public documentation was
read only. No live secret used. No real money moved.
providerDisbursementsEnabled was not enabled or modified.

## Final worktree snapshot

Includes the initial P13-C implementation and both safety corrections.

### git status --short

```text
 M docs/domain/provider-disbursement-policy-v1.md
 M functions/src/provider-finance/provider-disbursement-domain.ts
 M functions/src/provider-finance/provider-disbursement-execution.ts
 M functions/src/provider-finance/provider-disbursement-reconciliation.ts
 M functions/src/provider-finance/provider-disbursement-transport.ts
 M functions/src/provider-finance/provider-disbursement-webhook.ts
 M functions/test/provider-disbursement-transactions.test.cjs
?? docs/domain/provider-disbursement-p13-c-report.md
?? functions/src/provider-finance/paymongo-disbursement-client.ts
?? functions/test/paymongo-disbursement-client.test.cjs
```
