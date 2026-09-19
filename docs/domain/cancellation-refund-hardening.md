# Cancellation/refund release hardening

## Browser authority

The browser never owns refund policy snapshots/agreements, eligibility state,
cancellation pointers or decisions, payment/refund accounting, operation state,
gateway identity, canonical relationships, actor identity, or lifecycle state.
Raw cancellation requests and refund operations are denied to every client.
Raw payments are Admin-readable only; Customer/Provider clients use trusted
server projections.

`providerRequests` remains participant-readable for legacy Customer Mobile
compatibility. Firestore cannot redact individual fields after a document read,
so its embedded refund-policy evidence and cancellation pointers remain visible
to canonical participants until all clients migrate to server projections. All
writes to those fields are denied. This is a read-exposure migration blocker,
not browser authority.

## Authorization matrix

| Operation | Customer | Provider | Admin | Unauthenticated/wrong participant |
|---|---|---|---|---|
| Policy disclosure | Own authenticated booking selection | Denied | Denied | Denied |
| Policy authoring | Denied | Own Provider/package via callable | Denied | Denied |
| Eligibility advance | Denied | Own request via callable | Denied | Denied |
| Cancellation preflight | Own provider request | Denied | Denied | Denied |
| Cancellation submission | Own provider request | Denied | Denied | Denied |
| Safe cancellation status | Own request | Own request | Use inspection | Denied |
| Approve/reject/execute | Denied | Denied | Callable only | Denied |
| Reconciliation inspection | Denied | Denied | Callable only | Denied |
| Raw cancellation/refund operation | Denied | Denied | Denied | Denied |
| Raw payment | Denied | Denied | Read only | Denied |

## Safe read model

`getProviderRequestCancellationOptions` accepts only `providerRequestId`,
re-derives Customer ownership and all canonical links, reads the private rollout
gate, and returns a bounded policy disclosure, informational refund preview,
and active safe cancellation projection. Submission always revalidates in its
own transaction.

`getProviderRequestCancellationStatus` accepts only `providerRequestId` and
returns the same bounded projection to the canonical Customer or owning
Provider. New submissions maintain `latestCancellationRequestId`; existing
legacy records fall back to active/approved pointers. Historical terminal
records with no pointer are not fabricated or queried heuristically.

`inspectProviderRequestRefundReconciliation` is Admin-only and read-only. It
re-derives cancellation/request/event/payment/operation linkage and returns IDs,
bounded states, centavo amount, gateway status, safe failure code, and whether
reconciliation is required. It does not return gateway IDs, idempotency keys,
raw payloads, or secrets and cannot mutate money.

## Operations and blockers

- Missing/malformed rollout configuration fails closed.
- Initial production mode is `review_only`; automatic approval is off and no
  automatic approval trigger exists.
- Legacy requests have no fabricated policy or percentage and remain manual
  review; the policy approval callable rejects them.
- Invalid policy evidence fails closed.
- Refunds below 100 centavos are not sent or rounded; their single reservation
  remains authoritative for reconciliation and cannot be blindly retried.
- Partial execution requires trusted `card`/`gcash` method evidence. Unknown
  methods and `paymaya` fail before the gateway request and retain the existing
  reservation. Current webhook parsing does not capture that evidence, so this
  remains a production blocker for partial refunds.
- Refund webhook metadata is mandatory. Missing/unknown/mismatched evidence
  fails closed; correlation is never weakened.
- Monitoring should alert on `refund_failed`, operations left `processing`,
  `GATEWAY_MINIMUM_UNSUPPORTED`, `REFUND_RECONCILIATION_REQUIRED`, webhook
  rejection reason codes, and nonzero reserved refund totals older than the
  operational settlement window.
