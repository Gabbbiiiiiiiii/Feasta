# Customer Mobile Step 3 final alignment report

Recommendation: BLOCKED for overall acceptance. The Step 3 changes pass focused verification, but six relevant preparation regressions reproduce on both the original implementation and the updated implementation. Step 3 is not declared complete.

Repository: C:\flutterProject\feasta
Branch: chore/monorepo-setup

## Root causes and draft authority

The screenshot differences cannot be conclusively attributed to different drafts or stale records without the actual session drafts. No live records were accessed. Inspection found no confirmed conversion defect:

- Mobile builds eventTime/eventEndTime from selected TimeOfDay values with explicit AM/PM formatting. Step 3 displays these snapshot strings directly without timezone conversion.
- Mobile builds eventAddress from the current address controller and displays that snapshot directly. The existing secure draft store scopes records by customer, provider, package, and entry context; it does not share the Web browser draft.
- Therefore different or independently restored drafts remain a plausible explanation, not a proven root cause. Screenshot values were not copied into Mobile. Asia/Manila scheduling, address persistence, and validation logic were preserved.

## Files modified in this task

Production:
- apps/customer_mobile/lib/features/customer/booking_summary_screen.dart: separate typed edit results, retained existing review-controller support, automatic server disclosure loading, payment summary, and finalized Step 3 labels.
- apps/customer_mobile/lib/features/customer/event_customization_screen.dart: handle edit results using existing _goToStep, retain the existing agreement/refund controllers for the form lifetime, and dispose them with the form. No Step 1/2 field, persistence, scheduling, or calculation changes.
- apps/customer_mobile/lib/features/customer/booking_payment_requirement.dart: new compact server-disclosure presentation for every selected provider, with deposit/full-payment status, upfront amount, remaining balance, short-notice explanation, loading/error states, and guarded retry supplied by Step 3.

Tests:
- apps/customer_mobile/test/features/customer/booking_step3_alignment_test.dart: new payment, provider-specific acknowledgment, independent edit-result, draft-preservation, automatic summary-load, and disabled-submit coverage.
- apps/customer_mobile/test/features/customer/booking_submission_navigation_test.dart: finalized submit label and actual Step 1/Step 2 round trips preserving draft values and review-controller identities.
- apps/customer_mobile/test/features/customer/booking_summary_ui_test.dart: finalized Step 3 labels; retain narrow-screen and enlarged-text checks.
- apps/customer_mobile/test/features/customer/booking_preparation_flow_test.dart: update only affected Step 3 wording expectations.
- apps/customer_mobile/test/features/customer/customization_descendants_test.dart: update Step 3 submit/review semantics and matching agreement-route assertion.

Report:
- docs/customer-mobile-step3-final-alignment.md

Ignored verification artifacts and isolated baseline copy: .tmp/step3-final/.

## Corrections and preserved behavior

- Edit event returns to Step 1; Edit package returns to Step 2 on the existing form route.
- Unchanged selections retain review controllers and acknowledgments across editing. Existing selection signatures, owner checks, expiry, changed agreement keys, and submission revalidation continue to invalidate obsolete acknowledgments.
- Payment requirements come only from the existing BookingAgreementController and authoritative BookingAgreement fields. No new eligibility/payment calculations or backend contracts.
- The summary shows each provider's deposit availability or full-payment requirement, server upfront amount, server remaining balance, and the 72-hour explanation only for short_notice.
- Labels: Booking & Payment Agreement; Refund Policy; Booking estimate; Estimated service price; Selected FEASTA services; Estimated total; Submit booking request.
- Existing compact event rows, separate package/provider rows, expandable published inclusions, optional services, prominent total, fixed footer, separate provider acknowledgments, disabled submission, price revalidation, reconciliation, and server authority remain intact.
- Submission still requests provider review; it does not collect payment or automatically confirm a booking.

## Verification

- Dart format check: eight modified Dart files, zero changes required.
- Flutter static analysis: all eight modified Dart files, no issues.
- Focused suite: 102 passed. Covers navigation, summary layout, agreement completeness and validity, refund policy, attempt readiness, booking preparation calculations, and draft persistence.
- Final alignment suite after adding the summary integration case: 4 passed (3 overlap with the focused suite; 1 additional case).
- Extended suite: 60 passed, 6 failed. Includes agreement/refund review, preparation flow, descendant authorization, mocked dispatch handoff, and outcome reconciliation.
- Existing V2 compatibility test "published price distinguished from selected Full-Service tier": passed.
- Total distinct passing cases across final runs: 164. Six remaining failures.
- Git diff inspection and scoped git diff --check: passed.
- No emulator tests or real booking/payment operations were executed. Entire repository suites were not run.

Remaining failures, reproduced in the isolated original implementation:
1. special requests remain editable only in Step 1 and survive Step 3 review: missing Special request text at the existing Step 1 assertion.
2. recovery refreshes both add-on sources and removes unavailable or foreign selections: missing recovered-draft text.
3. fresh process restores saved step, tier and notes before initial defaults: missing recovered-draft text.
4. Continue and Back retain draft fields; keyboard hides sticky footer: existing scrolling finder fails.
5. Select Package opens customization and direct review; edits persist: existing scrolling finder fails.
6. open customization descendants: privacy, preparation and nested routes: existing inline-services scenario cannot locate its target.

Evidence: .tmp/step3-final/focused.log, alignment-final.log, extended.log, baseline.log. The baseline copy uses the pre-task snapshots of both changed production screens and restores original wording expectations for the failing cases. All six failures reproduce there. Those unrelated Step 1/2 assertions/flows were not changed to force acceptance.

## Git and Firebase status

The checkout already contained extensive modified and untracked files, including Web/backend work. Those were preserved. No reset, stash, discard, staging, commit, or push was performed. Customer Web, Functions, and shared backend contracts were not modified by this task.

No Firestore writes, real booking submission, payment, Firebase/Vercel deployment, facial recognition, identity verification, or duplicate-identity work was performed. Test stores and callable mocks were local only.

Acceptance remains BLOCKED until the six existing preparation regressions are resolved and relevant verification is green. Live screenshot draft identity and on-device appearance remain unverified.
