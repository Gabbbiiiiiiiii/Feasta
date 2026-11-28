# PayMongo isolated test-transfer demonstration

## Decision and evidence

This procedure demonstrates the PayMongo transfer transport only. It does not
demonstrate provider onboarding or release FEASTA provider earnings. A successful
test transfer is labelled `confirmed_test_success`, never a provider payment.

On 2026-11-16 the operator supplied these read-only observations:

- The shared account credential (version 3) and dedicated disbursement test
  credential (version 1) are matching test keys. No credential values were shared.
- Firestore references `org_test_merchant`, with stored activation `activated`
  and identity verification `passed`. No invitation or relationship ID is stored.
- A current PayMongo account GET returned the same account ID, activation
  `pending`, and no identity-verification status.
- Relationship discovery for that child returned zero results and `has_more:false`.
- Both canonical PHP 900 payouts remain financially ready, with no attempt.
  Platform dispatch is disabled and the test wallet/allowlist are not configured.

The current Relationships reference says test and live keys read the same
relationships. The Accounts reference describes mock responses with test keys;
the invitation guide says test invitations are not persisted and emit no webhooks.
Therefore test-key support does not establish a stateful simulated parent-child
relationship for `org_test_merchant`. The current empty result is not evidence of
a FEASTA parser bug. Nor does it prove PayMongo cannot support any other account.
Search snippets still describe mock relationships; use the current reference
page and the account-specific observations rather than that stale snippet.

Official sources inspected:

- https://docs.paymongo.com/reference/linked-accounts-relationships
- https://docs.paymongo.com/reference/accounts
- https://docs.paymongo.com/docs/account-settings-linked-accounts
- https://docs.paymongo.com/docs/transfer-test-cases
- https://docs.paymongo.com/docs/money-movement-moving-money-with-api

An actual relationship, if later established through PayMongo's supported
account/invitation flow, can be revalidated by the existing FEASTA path. Do not
invent a relationship ID, set readiness flags manually, or weaken its checks.
Account creation/invitation may affect real linked relationships even when using
test keys; this demo never calls either endpoint.

## Isolation

`scripts/paymongo-payout-demo.cjs` reuses the existing compiled test transport and
evidence validators. Its explicit demo authorization callback applies only to
synthetic `feasta_demo_*` identities, fixed PHP 900 test transfers, and the
official success simulator number `999999990001`. It never calls the production
reservation/execution service and makes no Firestore calls.

It does not change `providerPaymentAccounts`, `providerDisbursements`, earnings,
customer payments, platform settings, shared keys, or deployed Functions. Keep
`providerDisbursementsEnabled:false`. The existing two PHP 900 payouts remain
untouched. A successful isolated test must not mark either payout paid.

## Prerequisites

- Node 22 and existing installed repository dependencies.
- Existing compiled Functions transport files. If absent, build using the normal
  Functions build procedure; do not deploy anything for this CLI demo.
- gcloud access to `PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY` version 1 in
  `feasta-catering-system`. The CLI captures this value in memory; never paste
  credentials into arguments, screenshots, or chat. Live/public keys are rejected.
- A gateway-retrievable, activated PHP test wallet with sufficient test funds.
  The transport checks principal funding; gateway fee requirements may also apply.
- A BIC supported by the selected InstaPay simulator institution, verified from
  PayMongo's receiving-institutions GET or account documentation. Shape validation
  alone does not prove a BIC is supported. Do not copy a bank code from unit fixtures.

If no usable test wallet exists or the wallet API rejects access, stop and
resolve test-wallet provisioning/capability with PayMongo. Do not use a live
wallet or invent a wallet ID. A local mocked test is not gateway E2E evidence.

## 1. Inspect (GET only)

From `C:\flutterProject\feasta` in normal PowerShell:

```powershell
node scripts/paymongo-payout-demo.cjs inspect
```

This lists wallet ID, merchant ID, mode, activation, currency and available test
balance. Source bank/account numbers and names are excluded. It sends no transfer
and does not create a receipt. Return this output before choosing the wallet.

## 2. One explicitly confirmed test send

After verifying a real test wallet ID and supported BIC, replace the placeholders:

```powershell
node scripts/paymongo-payout-demo.cjs send --run capstone-demo-01 --wallet YOUR_VERIFIED_TEST_WALLET_ID --bic YOUR_VERIFIED_BIC --confirm-test-transfer
```

This is an actual request to PayMongo's test simulator, not a local mock. Amount
is 90000 centavos, currency PHP, destination `999999990001`, rail InstaPay. No
real money moves. There is no option to substitute a real destination or a
canonical FEASTA payout ID. The existing transport rechecks wallet identity,
mode, funding, destination and expiry before POST.

The receipt under `.local/paymongo-payout-demo/capstone-demo-01.json` is local
demo evidence only; retain it. A deterministic reference/idempotency key and a
persisted uncertainty marker precede POST. Existing run IDs cannot be resent.
Bounded in-call retries reuse the same body and idempotency key.

## 3. Retrieve pending or uncertain results (GET only)

```powershell
node scripts/paymongo-payout-demo.cjs status --run capstone-demo-01
```

This explicitly retrieves a gateway result; there is no polling loop. The client
matches transfer reference, amount, currency, destination and mode. Empty lookup,
timeout or conflicting evidence is unresolved, never success. An unresolved or
pending receipt blocks additional sends, including a new run name. Never delete
or edit a receipt to unlock another transfer.

If the process crashes, a `demo.lock` may remain. Verify the CLI process is no
longer running before removing only that stale lock, retain all JSON receipts,
then use `status`. Do not run `send` after a crash.

### Read-only diagnosis of an unresolved attempt

Run `node scripts/paymongo-payout-demo.cjs diagnose --run capstone-demo-01`.
This issues three GET requests: test-wallet balance, a reference-filtered transfer
lookup documented in PayMongo's Money Movement best practices, and the first
unfiltered transfer page. It returns HTTP statuses, safe API error codes, response
field names and exact-reference matches. It never changes the receipt or sends a
transfer. The unfiltered page is diagnostic, not an exhaustive history lookup.

For the first operator send, the saved reference is
`pd_e61f712d5d26204b3b54602cec686e53d88282c2`. Submission was unconfirmed and the
subsequent bounded status lookup found no match. The old client discarded the
original POST response diagnostics, so that response cannot be reconstructed.
Do not infer failure or change the selected BIC based solely on an empty lookup.
Keep the unresolved lock in place until trusted evidence or PayMongo support
resolves the original reference.

### Observed reference normalization and verified recovery

The operator's subsequent GET-only diagnostics found exactly one transfer:
`tr_eeb529c821ecd1da8f60110d`, amount 90000 centavos, PHP, test mode, status
`succeeded`, created at `2026-11-16T14:15:20.530508Z`. Both FEASTA metadata IDs,
merchant, amount and destination matched the demo. PayMongo returned
`pd-e61f712d5d26204b3b54602cec686e53d88282c2`; the attempt sent and searched for
`pd_e61f712d5d26204b3b54602cec686e53d88282c2`. The balance fell by exactly PHP 900.
This is account-specific empirical evidence of a prefix underscore-to-hyphen
conversion, not a general documented promise to normalize arbitrary references.

Run the narrowly scoped recovery:

```powershell
node scripts/paymongo-payout-demo.cjs reconcile --run capstone-demo-01 --transfer tr_eeb529c821ecd1da8f60110d
```

It retrieves the source wallet and exact transfer using GET only. It requires
test mode, matching source account and merchant, exact amount/currency/rail,
exact destination number/name/BIC, both matching FEASTA metadata IDs, the test
metadata marker, and either the original reference or precisely its `pd_` to
`pd-` prefix conversion. It then updates only the local demo receipt from trusted
gateway evidence. The original reference and idempotency key stay unchanged;
the returned gateway reference is retained separately in evidence. Subsequent
`status` uses this exact-transfer verification again. Any mismatch leaves the
receipt unresolved. No POST or canonical accounting write occurs.

The local canonical transport now recognizes only the two exact `pd_`/`pd-`
prefix spellings followed by the same 40 lowercase hexadecimal characters.
Create responses, GET lookup, signed-webhook routing and terminal duplicate
handling share this rule. Internal attempt/document IDs and idempotency keys
remain unchanged. Raw gateway references are retained in evidence. Amount,
currency, mode, destination, uniqueness and financial guards still apply.
This correction has not been deployed. Do not resend the successful demo.

### Resolve the account relationship blocker before application payouts

Run this read-only inventory in normal PowerShell:

```powershell
node scripts/paymongo-payout-demo.cjs relationships
```

It retrieves the stored mock account and up to 100 actual relationships visible
to the parent credential, not only relationships filtered to the mock child. Only
account/relationship identifiers and activation/verification state are printed;
person details, emails, banking information and credentials are excluded. Test
keys read shared relationships, so the output is not labelled simulated data.
It never creates/invites an account or writes Firebase. If pagination indicates
more data, the inventory is incomplete and cannot prove absence.

If the stored child has a verified actual relationship, the existing refresh
service already retrieves and validates it; transport readiness remains a
separate step. If a different child exists, establish that it belongs to this
provider through PayMongo onboarding evidence before proposing a controlled
mapping repair. Never choose an unrelated child just because it is enabled.

If no actual relationship exists, software cannot manufacture one with a GET
or a Firestore flag. Confirm Linked Accounts approval in the parent PayMongo
Dashboard and complete its supported provider linking/onboarding flow. Test
invitation responses are not proof of persisted onboarding. Any actual account
invitation, provider communication or live-mode onboarding must be explicitly
scoped before execution. Keep platform dispatch disabled throughout this phase.

## Expected demonstration

1. Gateway confirms the test wallet is activated and funded.
2. One test transfer receives a gateway `tr_*` identifier and matching reference.
3. Retrieval establishes `succeeded` (or the initial gateway response does).
4. CLI reports `confirmed_test_success` and `canonicalAccountingChanged:false`.
5. FEASTA's two real application payout records remain unchanged and blocked.

Explain in the defense: "The gateway test transfer succeeds. Provider-linked
account authorization is independently enforced and is not bypassed by this
demonstration." Do not claim that provider bank funds were received, provider
onboarding passed, or a canonical FEASTA payout was completed.

## Validation and current limits

Run `node --test scripts/paymongo-payout-demo.test.cjs`. Tests mock all HTTP and
credentials. They exercise live-key rejection, live/unfunded-wallet rejection,
matched success, mismatched evidence, local uncertainty, duplicate prevention,
and exclusion of secret/source bank details from output and receipts.

No external transfer has been run as part of this implementation. Wallet access,
supported BIC, test funding and gateway completion remain to be demonstrated.
Production onboarding, account refresh, verification, scheduler, booking safety,
payment expiration, refunds and ledger authority are unchanged.
