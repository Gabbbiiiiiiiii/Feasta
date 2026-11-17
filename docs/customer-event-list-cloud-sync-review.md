# Event List Web and Mobile synchronization — local review

Date: 2026-11-16 (Asia/Manila). Branch: `chore/monorepo-setup`.

Implementation is ready for joint code review. Production synchronization remains
disabled. Live cross-device acceptance has **not** been performed. No emulator,
deployment, commit, push, or production Firestore mutation was performed.

## Exact source changes made during this task

Modified existing files (including files that were already untracked):

1. `apps/customer_mobile/lib/features/customer/event_list/event_list_controller.dart`
2. `apps/customer_mobile/lib/features/customer/event_list/event_list_cloud_transport.dart`
3. `apps/customer_mobile/lib/features/customer/event_list/customer_event_list_screen.dart`
4. `apps/customer_mobile/lib/features/customer/event_list/event_list_scope.dart`
5. `apps/customer_mobile/lib/features/customer/event_list/save_package_to_event_list.dart`
6. `apps/customer_mobile/lib/features/customer/event_list/save_review_configuration.dart`
7. `apps/web/src/lib/customer/event-list/customer-event-list-cloud-recovery.ts`
8. `apps/web/test/components/customer-event-list-cloud-recovery.test.ts`

Created source, tests, and documentation:

1. `apps/customer_mobile/lib/features/customer/event_list/event_list_cloud_session.dart`
2. `apps/customer_mobile/test/features/customer/event_list_cloud_sync_test.dart`
3. `apps/customer_mobile/test/features/customer/event_list_cloud_sync_ui_test.dart`
4. `docs/customer-event-list-cloud-sync-review.md` (this file)

Local evidence and verified original copies are under
`.local/event-list-sync-backup-20261116/` and `.local/event-list-sync-*.log`.
`modified-files.json` records original and resulting SHA-256 hashes for all eight
edited files. Originals were copied and hashes compared before each first edit.
The original Git status is `initial-git-status.txt`; the final status is
`.local/event-list-sync-final-git-status.txt`.
Temporary baseline screen/test copies used to reproduce failures were removed.
The workspace-local Dart analytics directory is `.local/dart-appdata/`.

## Mobile behavior

The controller's explicit `cloudEnabled` option defaults to false. Existing app
construction keeps that default. When enabled for review, authenticated startup,
add/update/configuration saves, remove, clear, and canonical schedule operations
use `mutateCustomerEventList` in `asia-southeast1`. The collection is
`customerEventLists/{uid}` and the schema is the existing version 1 contract.

`EventListCloudSession` owns one authorization generation. It persists the exact
command and secure random request ID before dispatch, verifies that persistence,
and retains uncertain commands across reconstruction. Recovery replays that
command; it does not combine recovery with a new edit. Success requires both an
accepted callable response and a server-confirmed Firestore revision at least as
new as the accepted revision. Cached and pending-write snapshots cannot confirm
success. Definitive revision rejection releases the rejected command; network and
authorization uncertainty preserve it. Concurrent operations for one owner are
blocked. Listener failures can restart on retry. Live account checks and route
guards prevent stale operations from publishing results or dispatching queued
saves after invalidation.

Only a server-confirmed missing document permits importing that customer's prior
local record. Existing documents, including empty lists, win. Guest storage and
booking drafts remain local, and cloud mode suppresses the local guest-transfer
offer. Native package identities become `catering_package:provider:selection`;
marketplace identities remain `marketplace_service:provider:selection`.

The full cloud envelope remains separate from the editable native projection.
Unsupported configurations and custom menus remain visible as read-only cards
with canonical removal. Other entries survive unrelated mutations, and Web href
metadata survives native editing. The screen shows cloud saving, confirmation,
and recovery errors. Saved-package/configuration actions use cloud-specific
failure feedback. Cloud booking cleanup without server proof returns failure and
retains entries; existing backend proof safeguards were not changed.

## Web compatibility review

Existing initialization, save/update, removal, clearing, scheduling, reload
recovery, custom-menu preservation, and session isolation were exercised by the
Web suite. The shared JSON corpus is consumed by both platforms and backend.

One defect was corrected: `functions/aborted` revision conflicts previously stayed
uncertain forever. Because the server checks request receipts before revisions,
that rejection proves the exact command was not accepted. Recovery now clears
that rejected command and permits a reviewed edit from the latest snapshot.
Uncertain network results and authorization failures still retain recovery.
Failure to clear recovery storage blocks new writes safely.

`CUSTOMER_EVENT_LIST_CLOUD_ENABLED` remains false. No Web/backend schema, payment,
booking lifecycle, expiration engine, strike policy, or cleanup proof changes were
made during this task.

## Verification results

Counts below describe separate runs and overlap; do not add them together.

| Check | Passed | Failed | Evidence |
| --- | ---: | ---: | --- |
| Focused Flutter Event List, authentication, configuration, submission, booking/payment regressions, excluding older UI/guest harness suites | 521 | 0 | `.local/event-list-sync-mobile-final.log` |
| Final new cloud controller/UI tests, sequential | 19 | 0 | `.local/event-list-sync-new-final.log` |
| Final cloud + review parity + startup run | 25 | 0 | `.local/event-list-sync-mobile-final-additions.log` |
| Guest panel scenarios in separate fresh processes | 5 | 0 | `.local/event-list-sync-guest-isolated.log` |
| Guest transfer scenarios in separate fresh processes | 4 | 0 | `.local/event-list-sync-transfer-isolated.log` |
| Web Event List/cloud/add-button/customization regression tests (18 files) | 242 | 0 | `.local/event-list-sync-web-final.log` |
| Backend Event List schema/mutation and multi-provider submission tests, after fresh TypeScript compilation | 104 | 0 | `.local/event-list-sync-backend-final.log` |
| Older Mobile UI tests against preserved starting screen | 1 | 5 | `.local/event-list-sync-baseline-ui.log` |

Flutter analysis: no issues (`.local/event-list-sync-analyze-final.log`).
Web TypeScript (`pnpm.cmd exec tsc --noEmit`) and scoped ESLint passed.
Backend TypeScript compilation and scoped Event List ESLint passed.
Git whitespace validation was limited to this task's edited tracked source files.

The initial combined Flutter run encountered five older UI failures and stalled
in guest tests; guest cases subsequently passed individually. An isolated copy of
the backed-up starting screen reproduced all five UI failures:

- `event_list_ui_test.dart`: single-provider review stays enabled without coordinated hint.
- `event_list_ui_test.dart`: Event List UI persistence/isolation/navigation/accessibility scenarios (expects the absent Continue Browsing button).
- `event_list_customization_ui_test.dart`: saved-package handoff scenarios (cannot locate an expected remove control).
- `event_list_restore_edit_test.dart`: saved summary names (expects the absent Configuration details control).
- `event_list_restore_edit_test.dart`: customer/guest restore/edit/save scenarios (expects a Needs customization label not shown by that screen).

These are preexisting acceptance/test alignment issues, not newly introduced cloud
test failures. They prevent an all-green Mobile UI acceptance claim. No remaining
cloud implementation blocker was identified locally. Mocks and shared fixtures
prove local contract behavior; they do not prove live Firestore Rules enforcement,
deployed callable availability, or real-device cross-device delivery.

## Preservation and deployment status

All initial tracked/untracked work remains present. Existing changes were extended
only in the eight files listed above, with verified backups. No reset/clean,
unrelated overwrite, commit, or push was used. The working tree remains dirty and
contains the user's initial work plus these changes and local evidence.

Firebase deployment status: **no deployment performed**. No Functions, rules,
hosting, Firebase project configuration, or production documents were changed by
this task. Local verification used mocks/in-memory backend adapters, not an emulator.

## Joint ChatGPT/user review and acceptance

1. Review this manifest alongside the before/after hashes and the original Git
   status. Review the Mobile session/controller and Web recovery change together
   with `functions/src/customer-event-lists/mutate-event-list.ts` and the shared
   corpus at `contracts/customer-event-list/fixtures.json`.
2. Inspect both gates and confirm they are still false. Review request structure,
   canonical identities, receipt-before-revision semantics, snapshot confirmation,
   missing-document import, and account invalidation on both clients.
3. Review the five reproduced baseline UI failures and the guest test-order issue
   as acceptance evidence. Do not describe the whole existing Mobile UI suite as
   green or conceal those results.
4. Only after separate explicit authorization for activation and a controlled
   Firebase acceptance environment, test the same authorized customer on Web and
   a physical Mobile device. No production mutation is authorized by this report.
   Exercise Web-to-Mobile and Mobile-to-Web add, configured edit, remove, clear,
   schedule/reload, and empty-cloud precedence. Compare canonical documents and
   revisions, not only visible native rows.
5. In that separately authorized environment, exercise two concurrent editors,
   disconnect/reconnect, lost callable response/relaunch, unsupported custom menus,
   account A to B to signed-out transitions, guest/draft isolation, and first-time
   import. Confirm saved feedback follows server snapshots and no retry duplicates
   a mutation. Retained unsupported cleanup entries are expected.
6. Recheck existing booking agreements, refund presentation, payment calculations,
   expiration/strike behavior, and navigation. This task does not authorize their
   redesign, cloud activation, or any deployment.

Next step is joint review and acceptance testing; this report does not propose a
new feature phase.
