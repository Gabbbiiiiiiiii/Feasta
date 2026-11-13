# Task 3 verification — 2026-11-12

Status: **incomplete; blocked at the backend verification gate**. No release or live end-to-end success is claimed.

## Exact blocking authority

`functions/src/provider-requests/provider-request-integrity.ts`, in
`assertSelectedServiceLinkage`, requires every catering request's `packageId`,
provider identity, package name and package price to match the main event's
single package/provider assignment. `validateAcceptanceProviderRequest` invokes
this authority before provider acceptance. Its payment-term linkage also relies
on the parent package terms.

An Event List containing two independently selected packages cannot satisfy that
existing parent contract: the first request passes, but `provider_002` fails with
`The provider-request service linkage is invalid.` The new release-gate test
verifies this exact provider and verifies that no document is written.

The atomic transaction kernel alone does not validate this lifecycle constraint.
Creating one parent and multiple requests without this check would produce a
submission that cannot progress through the authoritative lifecycle.

The draft application boundary now invokes the existing acceptance validator
before queueing writes. It fails closed with
`MULTI_PROVIDER_PARENT_CONTRACT_UNAVAILABLE`. No existing authorization or
financial authority was relaxed. The user's instruction prohibits inventing new
booking, financial or authorization contracts; therefore an authoritative
multi-package parent representation and its lifecycle/payment linkage must be
established before completing this integration.

Additional scope limitation: the current multi-provider resolver rejects
nonempty Event Service/add-on selections, and the existing package/payment
authority admits catering packages. The draft does not turn those selections
into another booking or financial contract.

## Files added in this execution

Functions:

- `functions/src/bookings/submit-multi-provider-booking.ts`: unexported-from-index
  application-boundary draft using current authentication, rate limiting,
  customer verification, maintenance, occasion, package, pricing, occupancy,
  agreement, refund and transaction authorities. Contains the lifecycle gate.
- `functions/test/multi-provider-submission-fixture.cjs`: offline V2 fixture,
  derived from the existing successful package-reader fixture; includes the
  authoritative compatibility down-payment field required by financial parsing.
- `functions/test/multi-provider-submission.integration.test.cjs`: offline
  application-boundary integration tests using real SDK references and an
  in-memory atomic transaction adapter. Does not use a Firebase emulator,
  credentials, network reads, or live Firebase writes.

Web: no changes made in this execution.

Mobile: no changes made in this execution.

Documentation: this report. All pre-existing modified/untracked source work was
preserved. Normal Functions build output was regenerated; no substantive tracked
vendor/shared-runtime diff was observed.

## Callable and schema status

**No new deployable callable is exported from `functions/src/index.ts`.** Existing
single-provider exports remain unchanged by this execution. The new module's
draft callable declarations are `submitMultiProviderBookingRequest` and
`getMultiProviderBookingDisclosures`; they are not release-ready and are not wired
into either client.

The candidate request wraps the existing parsed envelope, without changing its
parser:

```ts
{
  submission: {
    schemaVersion: 1,
    clientRequestId: string,
    event: {
      eventType: string, eventDate: string, eventTime: string,
      eventEndTime: string, guestCount: number,
      eventLocation: string, eventAddress: string, specialRequest: string
    },
    selections: [ // 2–4 unique providers
      {providerId: string, packageId: string, configuration: object}
    ]
  },
  policyAcknowledgements?: /* existing refund acknowledgement shape */ object[],
  agreementAcknowledgements?: {providerId: string, agreementKey: string}[]
}
```

The reused coordinator's result shape is
`{bookingId, mainEventId, providerRequestIds, created}`. The draft disclosure
result is `{agreements, refundPolicies}`. These are candidate callable transport
shapes, **not a verified new canonical booking contract**. The canonical
multi-package parent document schema remains unresolved.

## Backend results

| Check | Result |
| --- | --- |
| Functions build (`pnpm --dir functions build`) | Passed |
| Final TypeScript compile (`pnpm exec tsc --pretty false` in Functions) | Passed |
| Existing focused multi-provider suites | 120 passed, 0 failed |
| Existing provider availability suite | 14 passed, 0 failed |
| Existing focused booking/availability/provider-integrity regressions | 51 passed, 0 failed; includes the 14 availability tests |
| Broader initial focused baseline | 322 passed, 0 failed; overlaps the above suites |
| New application-boundary integration suite | 18 tests: 12 passed, 6 failed |
| Targeted new-source ESLint | Exit 0; 0 errors, 49 line-length warnings |
| `git diff --check` | Passed |

New integration test breakdown:

- Positive submission tests: **0 passed, 3 failed** (2-, 3-, and 4-provider
  submissions). Replay and conflicting-replay assertions within these tests are
  not reached and are not claimed as successful application-level coverage.
- Negative submission tests: **11 passed, 3 failed**. The passing tests cover
  unavailable providers, stale revisions, invalid pricing, duplicate providers,
  conflicting package/provider ownership, blocked customers, unavailable
  occasions, maintenance, same-day occupancy, unverified identity and missing
  callable authentication.
- Negative tests for missing/changed agreements and simulated commit failure
  **fail** because the parent-contract gate is encountered first. Their desired
  error/rollback paths are not verified by this suite.
- Additional release-gate diagnostic: **1 passed**, verifying rejection of the
  second provider and no writes.

The 2-/3-/4-provider tests initially passed the document-creation-only adapter
before the lifecycle authority was added. That intermediate result is not an
end-to-end success and is superseded by the final failing results above.

Existing transaction-coordinator unit coverage remains green, but it is not a
substitute for successful application-boundary replay/rollback coverage.
Expired agreements, enforced refund-policy submission, complete authenticated
callable success, downstream payment/refund/complaint integration and live
submission remain unverified.

Logs are in `.tmp/task3-backend-integration.log`,
`.tmp/task3-multi-provider-baseline.log`, `.tmp/task3-availability.log`,
`.tmp/task3-lifecycle-regression.log`, `.tmp/task3-typecheck.log`,
`.tmp/task3-functions-lint.log`, and `.tmp/task3-diff-check.log`.

## Web and Mobile

Client integration was not started because critical backend tests fail. Web
TypeScript/lint/Event List tests and Mobile format/analyze/tests were not run in
this execution. The previously reported 107 Mobile tests are not independently
reverified here. Existing client work is preserved.

## Git and deployment

Branch: `chore/monorepo-setup`. Working tree remains dirty with the extensive
pre-existing modified/untracked work and the four new files listed above.
Detailed status is recorded in `.tmp/task3-git-status.log` (captured before this
report was added).

No reset, stash, commit, push, deployment, live Firebase data modification,
Firebase emulator or device emulator was performed. Live E2E is **unverified**.
The work is stopped at the backend gate, before the release boundary.
