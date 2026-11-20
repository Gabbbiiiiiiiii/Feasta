# Step 21C-3: mixed booking retry restoration

Branch and HEAD verified before edits and after verification:
`chore/monorepo-setup`, `dc8cf32edca44d1b86497af14e5e6f1daa8f4309`.

## Files

- Modified the incoming untracked `apps/customer_mobile/lib/features/customer/event_list/event_list_submission_controller.dart`.
- Created `apps/customer_mobile/test/features/customer/event_list_retry_restoration_test.dart`.
- Created this report.

All 49 incoming tracked modifications and untracked files were backed up before source edits, with matching SHA-256 hashes, under `C:\Users\gabbyyy\AppData\Local\Temp\feasta-21c3-20261115-114536`. Its `manifest.json` records hashes. Final comparison found only the intended controller changed among those 49 files. All other incoming changes were preserved.

## Restoration and authority

The storage wrapper remains version 1 at `event_list_v1:<uid>`; the nested submission's `schemaVersion` determines the selection decoder. Schema v1 retains its Catering package/configuration reconstruction. Schema v2 requires explicit selection kinds and reconstructs marketplace provider/service identities, positive safe integer revisions, shared event details and provider-specific instructions. Marketplace entries never acquire package identities or client price authority. Catering retains its original package configuration, including informational snapshot fields; their presence does not authorize server prices.

Both decoders pass reconstructed entries through the existing submission builder and compare the entire serialized projection with the saved submission. Unknown keys, missing fields, fabricated package IDs, wrong kinds, duplicate providers, inconsistent event details, unsupported schema versions and noncanonical payloads fail closed. Saved revisions are used solely to validate the stored projection, never as fresh catalog authority. The original submission map is retained, rather than replacing it with the projection.

Uncertain requests keep their exact original clientRequestId and payload. Restoration only invokes the existing `reconcileBookingSubmission` read path, with that original ID. It never invokes booking submission or invents success. Unresolved outcomes block further dispatch even if the planning list or current catalog has changed. Confirmed server creation restores the existing booking result; only the persistence phase changes. Provider requests are not created again.

After confirmed rejection, preparing a changed selection obtains a new request ID, refreshes marketplace identity/revision metadata and reloads provider-specific payment/refund disclosures. All acknowledgements must be made again. The existing pre-dispatch refresh, revision checks and consent invalidation are unchanged.

## Verification

| Completed run | Passed | Failed |
| --- | ---: | ---: |
| Seven-file focused set, including initial 15 restoration cases | 83 | 0 |
| Final restoration suite, including new metadata/consent case | 16 | 0 |
| Earlier acceptance/configuration/catalog regressions, 15 files | 184 | 0 |

These runs overlap: 268 distinct tests passed (68 existing focused + 16 restoration + 184 regressions). No remaining failure occurred in the selected suites.

The focused set includes Step 21A/21B mixed models and submission contracts, trusted service revision tests, Step 21C-2 mixed controller tests, and existing submission controller/UI tests. It verifies unchanged Catering behavior, acknowledgement mapping, uncertain results and revision refresh gating. The final 16 restoration tests cover v1, Catering + Photography, multiple marketplace providers, original identity/payload retention across repeated checks, confirmed creation, invalid/tampered envelopes, no automatic dispatch, and changed metadata receiving a new identity and fresh consent after rejection.

The regression selection was `booking_step3_alignment_test`, `event_list_restore_edit_test`, `event_list_review_parity_test`, `booking_preparation_flow_test`, `booking_submission_navigation_test`, `booking_summary_ui_test`, `customization_descendants_test`, `booking_agreement_review_test`, `booking_refund_policy_review_test`, `customer_event_list_test`, `event_list_ui_test`, `event_list_review_controller_test`, `save_review_configuration_test`, `event_list_catalog_test`, and `event_list_configuration_codec_test` (all `.dart`).

Final targeted Flutter analysis of the changed controller and new test: no issues. Dart formatting completed. `git diff --check` passed. Local ignored evidence logs are `apps/customer_mobile/step21c3-focused-final.log`, `step21c3-restoration-final.log`, `step21c3-regressions.log`, and `step21c3-flutter-analyzer-final.log`.

An initial test run had 78 passes and five failures caused by the new test fixture assuming the last sorted row was marketplace; selecting by explicit kind corrected the fixture. The green completed runs above supersede it. One command was invoked from the repository root without a pubspec and was rerun from Customer Mobile. Initial SDK wrapper invocations stalled under sandbox access; successful checks used the installed Dart executable and Flutter tools snapshot with SDK/cache access.

## Limits and status

This preserves the existing reconciliation-only retry design. Persisted records do not contain consent acknowledgements, so restoration does not replay a booking submission with newly generated consent under the old ID. Server idempotency code and fingerprint contracts were not changed. Unknown outcomes still require reconciliation/support if the server cannot establish an outcome. Fully coordinated malicious rewriting of a structurally valid local record cannot be authenticated by this unsigned storage format; validation detects malformed/inconsistent envelopes, while the server remains authoritative for request ownership and outcomes.

The previously recorded three broader Home failures and eight authentication assertion failures were not rerun or repaired. No authentication source was edited. There are no newly observed unresolved defects in the tested scope; deployed behavior was not verified.

No staging, commits, pushes, merges, deployments, production Firebase reads/writes, emulator tests, payment transactions, unrelated UI changes or identity-verification work. Step 21D was not started.
