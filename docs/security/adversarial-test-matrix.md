# Adversarial security test matrix

Every expected-deny row maps to an automated assertion using `assertFails`,
`assert.rejects`, or an explicit false/redirect assertion. `pnpm
security:coverage` fails if a required scenario disappears from this manifest;
`pnpm phase4:verify` executes the mapped suites and the Phase 3 regression suite.

| Scenario | Automated evidence |
| --- | --- |
| Unauthenticated access to protected data | Firestore and Storage Rules suites assert anonymous denial. |
| Customer acts as provider | Firestore provider ownership and provider workflow callable denial assertions. |
| Customer acts as admin | Firestore admin collection and verification denial assertions. |
| Provider acts as admin | Web role test and provider verification callable denial assertions. |
| User changes own role | Firestore Rules `assertFails`. |
| User changes own blocked status | Firestore Rules `assertFails`. |
| Missing Firestore profile | Auth emulator and callable authorization tests reject it. |
| Disabled Firebase Auth user | Auth/web emulator verifies rejection. |
| Revoked session | Web security test uses `assert.rejects`. |
| Expired session | Web security test uses `assert.rejects`. |
| Customer reads another customer profile | Firestore Rules `assertFails`. |
| Customer reads another customer booking | Firestore Rules `assertFails`. |
| Provider reads unassigned booking/request | Firestore Rules `assertFails`. |
| Provider edits another provider | Firestore Rules `assertFails`. |
| Non-admin reads admin logs | Firestore Rules `assertFails`. |
| Public reads inactive provider | Firestore Rules `assertFails`. |
| Deleted provider appears publicly | Firestore soft-delete query/rules denial assertion. |
| Provider approves itself | Firestore and provider emulator denial assertions. |
| Provider modifies submitted verification | Firestore Rules `assertFails`. |
| Provider replaces document while under review | Provider workflow callable rejects invalid state. |
| Other provider reads private verification document | Storage Rules `assertFails`. |
| Customer reads verification document | Storage Rules `assertFails`. |
| Invalid verification file upload | Storage Rules `assertFails`. |
| Oversized verification upload | Storage Rules `assertFails`. |
| Client sets paid | Firestore Rules customer/provider `assertFails`. |
| Client changes amount | Firestore Rules `assertFails`. |
| Invalid webhook signature | Payment unit test explicitly returns false. |
| Replayed webhook | Payment emulator asserts duplicate with unchanged effects. |
| Wrong currency | Payment unit and emulator rejection assertions. |
| Wrong booking ID | Payment emulator ownership-mismatch assertion. |
| Duplicate payment creation | Deterministic payment/provider emulator replay assertions. |
| CSRF mutation | Web origin/CSRF test explicitly rejects invalid mutation. |
| Disallowed origin | Web policy test explicitly returns false. |
| Open redirect | Web policy test explicitly returns false. |
| Missing session cookie | Web test uses `assert.rejects`. |
| Tampered cookie | Web test uses `assert.rejects`. |
| Customer opens admin route | Web role policy explicitly returns false. |
| Provider opens admin route | Web role policy explicitly returns false. |
| Admin SDK imported client-side | Web source test asserts no forbidden import. |
| CSP blocks unexpected script origin | Web CSP test asserts no wildcard/unexpected origin. |
| Rapid Maps calls | Atomic rate-limit test rejects above quota; Maps security contract binds it. |
| Rapid verification submission | Atomic rate-limit test plus callable security contract. |
| Duplicate provider registration | Provider emulator asserts deterministic replay. |
| Duplicate admin approval | Provider workflow idempotency assertion. |
| Replayed callable request | Abuse-control suite asserts one side effect and replay result. |
