# Step 21D: independent provider booking display

Branch and HEAD verified before editing and after validation:
`chore/monorepo-setup`, `dc8cf32edca44d1b86497af14e5e6f1daa8f4309`.

## Files changed

- `apps/customer_mobile/lib/shared/models/feasta_models.dart`: added a getter identifying version-2 independent assignments; preserved the incoming model edits and formatting.
- `apps/customer_mobile/lib/shared/models/independent_booking.dart`: new validated parent/assignment/request read projections.
- `apps/customer_mobile/lib/features/customer/customer_bookings_screen.dart`: routes mixed booking cards to the coordinated parent summary.
- `apps/customer_mobile/lib/features/customer/booking_details_screen.dart`: routes mixed events to independent details and accepts an optional booking stream for offline widget tests.
- `apps/customer_mobile/lib/features/customer/independent_booking_display.dart`: new shared parent summary and live provider request cards.
- `apps/customer_mobile/test/features/customer/independent_booking_display_test.dart`: 39 offline model/widget tests.
- This report.

Before editing, 53 files (all incoming tracked/untracked changes plus the two previously unchanged screens) were copied with matching SHA-256 hashes to `C:\Users\gabbyyy\AppData\Local\Temp\feasta-21d-20261115-115352`. `manifest.json` records the hashes. Final comparison found only the three intended existing files changed: the two screens and `feasta_models.dart`. Other incoming changes, including Step 21C-3 and authentication source changes, were preserved.

## Read-only contract inspection

The existing bookings source queries `mainEvents` by customer ID and paginates live parent records. `bookingById` also reads a `mainEvents` document. `BookingModel.fromDoc` retains the raw record in `lifecycleData`, making existing assignment snapshots available without changing serialization.

`submit-multi-provider-booking.ts` establishes the actual stored contract:

- `packageAssignmentVersion: 2` identifies mixed events. `providerAssignments` contains explicit `catering_package`/`marketplace_service` kinds, provider and request IDs, package or service identities, services and provider amounts.
- `packageAssignments` is also written as a compatibility projection. Mixed display uses `providerAssignments` exclusively, never concatenating the two lists.
- Singular provider/package fields are a projection of the first assignment. They are not the identity or financial state of every provider.
- `totalAmount` is the aggregate gross event amount. Marketplace charges are already included. They must not be added again from `selectedAddOns` or `addOnsTotal`.
- `providerRequestIds` identifies individual documents in `providerRequests`. Those documents contain the authoritative individual `status`, `paymentStatus`, `providerBusinessName`, `services`, `amount`, package/service identity and customer/event linkage.
- At acceptance/payment stages, `financialSnapshot` supplies versioned gross/upfront/balance centavos. `settlementSchemaVersion`, `settlementStatus`, `grossSettledAmountInCentavos` and `outstandingAmountInCentavos` describe provider-specific settlement. Submission-time `remainingBalance` is not a current settlement balance.

The existing `customerPaymentRequests`, `customerPaymentRequestById`, `CustomerProviderPaymentRequest` and checkout-option parser already read individual requests and gate checkout using trusted financial snapshots, request state, parent eligibility, deadline evidence and review/refund conditions. Their authority and callable contracts were unchanged. No authentication/repository source was edited in this step.

## Resulting behavior

The list shows one coordinated event with its reference, shared date/time/venue, independent provider count, explicitly labeled parent event status, and one aggregate total. The Philippine calendar date is rendered with the explicit UTC+8 offset. The first provider is not presented as the whole event. Legacy Catering cards retain their existing rendering and actions.

Mixed details show each provider once, with its actual business name, Catering package or marketplace category/service, request status, provider amount and provider payment status. Where settlement evidence exists, the card also shows settlement status, gross settled amount and outstanding amount. Missing settlement evidence is labeled unavailable rather than derived from the parent's balance or payment status. Marketplace requests do not need or acquire a package ID.

The projection validates unique provider/request IDs, exact request membership, customer and event ownership linkage, selection identity/type, matching assignment/request/service amounts, aggregate equality, and any supplied financial/settlement snapshot. Money is compared in integer centavos. Version-1 package assignments are supported by the read projection; existing Catering screens remain on their legacy path. Missing or inconsistent mixed assignments never fall back to the first provider or the compatibility array.

The existing read-only relationship source supplies live request updates. Missing requests, duplicate records, read errors and inconsistent financial or identity data show an actionable refresh/support state and hide provider cards/payment actions. Unknown individual status or absent payment status displays unavailable. There are no display-screen Firestore writes.

There is one Manage Payments entry point when a validated request passes the existing checkout-option parser and neither its review state nor the parent review state blocks it. It opens the existing provider-request payment flow. No parent payment obligation is created, no provider is charged twice, and no payment session is created by merely viewing the screen. Legacy first-provider chat/cancellation/recovery/add-on action widgets are not applied to mixed events. Provider-specific nonpayment action UX remains outside this display step.

## Actual verification

| Completed run | Passed | Failed |
| --- | ---: | ---: |
| New independent booking model/widget suite | 39 | 0 |
| Existing booking presentation, pagination/source, lifecycle, payment/deadline and complaint suites (7 files) | 144 | 1 |
| Step 21A–21C model/submission/controller/retry suites plus Home booking timeline (8 files) | 89 | 0 |
| Total distinct tests | 272 | 1 |

The new tests cover single Catering compatibility, mixed Catering + Photography, accepted/pending and accepted/rejected combinations in both provider directions, confirmed/pending, independent payment and settlement amounts, marketplace without package ID, exact aggregate with centavos, multiple marketplace providers, compatibility-array deduplication, malformed/missing assignments and requests, unknown states, checkout eligibility/review holds, live updates/read errors and a 320px layout at 2x text scale. They exercise the actual list screen and mixed details branch using offline streams.

The one existing failure is `customer_payment_contract_test.dart`, `P13-D full payment customer copy new package and booking summary present Full Payment`. At line 144 it requires the literal `'Full Payment'` in `booking_summary_screen.dart`. The literal is absent in the baseline HEAD source. `git diff --exit-code HEAD` confirmed that this test and both source files it inspects (`package_details_screen.dart`, `booking_summary_screen.dart`) are unchanged from HEAD. This deterministic source assertion is pre-existing and was not repaired as part of display work.

The previously classified three Event List and eight authentication assertion failures were not rerun or repaired. No claim is made that those suites are green.

Final targeted Flutter analyzer: six changed/new Dart files, no issues. `git diff --check`: passed. New files were also checked for trailing whitespace. Early analyzer findings (missing braces and a private fixture return type) were corrected. An initial focused test run stalled in fixture stream cleanup; the corrected completed 39/0 run supersedes it.

Ignored local evidence logs under `apps/customer_mobile`: `step21d-focused-verified.log`, `step21d-regressions.log`, `step21d-submission-regressions.log`, `step21d-analyzer-verified.log`.

## Remaining Step 22 E2E gaps and status

No production or emulator validation was performed. Step 22 must verify deployed callable/rules/index parity, real signed-in reads and account changes, mixed-event creation followed by live independent acceptance/rejection, per-provider financial snapshots and payment settlement updates, device navigation to the existing payment flow, offline/reconnect behavior, refunds/cancellation/recovery consistency and device accessibility. Existing server checkout safeguards remain authoritative and were not exercised with real money. Broader provider-specific chat, complaints, cancellation/recovery and review UX for mixed events needs separate assessment; legacy actions were not redirected to an arbitrary provider.

No staging, commits, pushes, merges, Firebase deployment, production Firebase access, real payments, emulator tests or identity-verification implementation. HEAD is unchanged. Step 22 was not started.
