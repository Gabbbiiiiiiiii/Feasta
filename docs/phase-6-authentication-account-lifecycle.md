# Phase 6 authentication and account lifecycle

## Status

Phase 6.1 audited the existing authentication architecture. Phase 6.2 defines
the shared, fail-closed authentication domain used by TypeScript, Functions,
Next.js server code, and Flutter. Phase 6.3 applies that model to the Flutter
customer startup and authentication gate. Phase 6.4 completes Flutter customer
registration and trusted initial profile creation. Phase 6.5 consolidates
Flutter email/Google login, logout, and active-session failure handling.
Phase 6.6 standardizes Flutter email verification, resend, refresh, password
reset requests, and the Firebase action-code boundary. Phase 6.7 adds trusted
phone verification before booking submission. Remaining account
screens are implemented in later controlled subphases.

Backend authorization, Firebase Security Rules, and verified server sessions
remain authoritative. An authentication gate result is presentation and routing
data; it never grants access by itself.

## Canonical stored values

Roles are exactly `customer`, `provider`, and `admin`. Unknown roles resolve to
`forbiddenRole` and never receive protected access.

Account statuses are exactly:

- `active`
- `blocked`
- `disabled`
- `pending_deletion`

No separate stored `deactivated` value is introduced. `pending_deletion` is the
retained lifecycle state that resolves to the client/server gate concept
`deactivated`. Firebase Auth's disabled flag remains distinct and resolves to
`disabledAuthAccount`. A Firestore `disabled` status resolves to
`disabledAccount`.

Provider verification uses the Phase 3 lifecycle:

```text
draft -> submitted -> under_review -> approved -> suspended
                                  -> rejected
                                  -> resubmission_required -> submitted
```

The detailed transition and document policy remains in
`docs/domain/provider-verification-status-transitions.md` and
`docs/domain/provider-verification.md`.

## Parsing policy

Parsers accept canonical wire values plus explicit camel-case spellings used by
older in-process models, such as `pendingDeletion`, `underReview`, and
`resubmissionRequired`. Case and surrounding whitespace are normalized.

Legacy privileged or ambiguous values are not upgraded. Examples such as
`super_admin`, `enabled`, and provider status `verified` return no canonical
value and resolve to a fail-closed gate.

## Gate precedence

Gate resolution evaluates the highest-risk conditions first:

1. configuration error, loading, or expired session;
2. unauthenticated or Firebase Auth disabled;
3. missing user profile or unknown role/account status;
4. blocked, pending deletion, disabled, or inactive profile;
5. required-role mismatch;
6. email verification;
7. customer phone verification or provider business/verification state;
8. ready state for customer, approved provider, or admin.

An approved provider resolves to `providerApproved` only when the related
provider profile is active and not suspended. Missing provider linkage resolves
to `providerBusinessSetupRequired`. Unknown provider states resolve to
`invalidAccountState`.

## Sources of truth

- TypeScript constants, parsers, and gate resolver:
  `packages/shared-types/src/authentication.ts`
- Backend account-state helper:
  `functions/src/shared/account-state.ts`
- Next.js server account context:
  `apps/web/src/lib/auth/account-context.ts`
- Flutter parser and gate model:
  `apps/customer_mobile/lib/features/authentication/domain/auth_account_state.dart`

## Flutter customer startup and routing

The Flutter application initializes Firebase, App Check, and emulator or
production services before `FeastaApp` is mounted. The existing runtime security
guard rejects emulator configuration in release builds. `FeastaApp` then owns a
single `CustomerAuthenticationController`, unless a test supplies one, and the
`AuthenticationGate` renders no protected customer surface while account state
is unresolved.

The controller owns authentication, ID-token, and Firestore account listeners.
Profile reads are performed by `CustomerAuthStateRepository`, not widgets. Loads
are serialized so bursts from auth, token, and account listeners cannot create
parallel account-state resolutions. Transient network/server failures expose a
safe retry state; expired sessions, disabled Auth accounts, blocked or pending
deletion accounts, missing profiles, and unsupported roles fail closed.

`CustomerRouteGuard` is the guarded routing policy while legacy feature screens
continue their controlled migration from imperative `Navigator` calls. It
allows public browsing, records only known internal protected destinations, and
rejects absolute, protocol-relative, query-bearing, fragment-bearing,
backslash-containing, or unknown redirect values. After authentication the gate
restores a valid intended customer destination without using UI routing as an
authorization decision.

Phone-unverified customers may browse the normal customer application. Booking
submission remains protected by the existing verification guard and trusted
repository validation; startup routing does not treat client visibility as
booking authorization. Provider and admin identities receive an unsupported-role
state in the customer application and their stored role is never mutated.

## Flutter customer registration

`CustomerRegistrationController` owns local validation, duplicate-submission
prevention, typed error mapping, and the registration result. The screen uses
the Phase 5 fields, buttons, spacing, typography, snackbars, and responsive
container; it never writes Firestore directly and its input model contains no
role or trusted account flags.

`AuthRepository` normalizes the email, creates the Firebase Auth identity, and
calls `ensureUserProfile`. That App Check-protected, authenticated, rate-limited
callable transactionally creates or repairs `users/{uid}` and `customers/{uid}`
with server timestamps. It forces `role=customer`, sources email verification
from Firebase Auth, initializes phone verification as false, and rejects
wrong-role, blocked, or disabled existing profiles.

If initial profile creation fails after a new Auth identity is created, the
existing rollback helper attempts to delete that identity and preserves the
profile failure. If rollback could not remove the identity, a retry while that
same normalized identity remains signed in repairs missing documents through
the idempotent callable; it never creates provider or admin records. A different
or signed-out duplicate identity receives the normal sign-in/recovery message
instead of an automatic password sign-in. Missing `customers/{uid}` documents
and fully missing customer profiles are covered by the emulator repair test.

Verification-email delivery occurs only after both profile documents exist. A
delivery failure does not delete the valid account; the verification screen
explains that the user should use its rate-limited resend action.

Terms and privacy acceptance are required locally and accepted timestamps are
recorded by the trusted callable using server timestamps. Production legal URLs
are supplied as non-secret compile-time values:

```text
--dart-define=FEASTA_TERMS_URL=https://<approved-host>/<terms-path>
--dart-define=FEASTA_PRIVACY_URL=https://<approved-host>/<privacy-path>
```

Only valid HTTPS URLs are opened. Missing or invalid configuration fails with a
friendly message rather than launching an unsafe link.

## Flutter customer login and sessions

`CustomerLoginController` owns validation, duplicate-submit prevention, typed
Firebase error presentation, and the distinction between Google cancellation
and failure. The screen uses Phase 5 controls with visible labels, password
visibility, autofill hints, keyboard submission, live error semantics,
forgot-password navigation, and customer-registration navigation. Passwords are
passed unchanged to Firebase Auth and are never logged or persisted manually.

Firebase Auth's supported mobile persistence is the only remember-session
mechanism. FEASTA stores neither ID tokens nor role/account state in local or
shared preferences.

After either email or Google authentication, `AuthRepository` synchronizes
Auth-owned fields through `syncUserAuthState`, repairs a missing customer profile
only through `ensureUserProfile`, verifies that the resulting profile is active
and has `role=customer`, and forces an ID-token refresh. Existing provider/admin
profiles are rejected and never overwritten. The central authentication gate
then resolves email verification, customer-profile presence, phone verification,
and the intended destination.

Current-session logout signs out both Google Sign-In and Firebase Auth, cancels
the account listener, clears the cached identity, pending refresh state, and
protected intended destination, and returns the root navigator to public
browsing. Non-sensitive product preferences are not cleared.

Revoked/expired/invalid refresh credentials, disabled Auth accounts, blocked or
deactivated Firestore accounts, unsupported roles, and profile authorization
loss terminate the local Firebase session while preserving a safe terminal
message. The user explicitly acknowledges that message before returning to the
login/public state, preventing protected content from flashing or remaining in
the navigation stack.

## Flutter email verification and account recovery

The verification screen shows a masked destination, uses the Phase 5 controls,
and serializes resend and refresh actions. A successful resend starts a
60-second client cooldown; Firebase rate limiting remains authoritative. The
refresh path reloads the Firebase Auth user, forces an ID-token refresh, and
calls the trusted `syncUserAuthState` workflow. The client never writes
`isEmailVerified` directly. The central authentication gate then re-evaluates
role, blocked/deactivated state, customer-profile presence, and the intended
internal destination before rendering protected content.

Password-reset requests normalize and validate email locally, prevent duplicate
submissions, and display the same privacy-preserving success state whether an
account exists or not. Firebase errors are mapped to typed, user-safe recovery
errors. Passwords, tokens, and action codes are not logged.

`FirebaseActionLink` accepts only HTTPS links on the configured application
host, recognizes `verifyEmail`, `resetPassword`, and `recoverEmail`, and rejects
userinfo, missing codes, unknown modes, and external or protocol-relative
continuation URLs. `AuthRepository.handleActionCode` applies verified email and
email-recovery codes through Firebase Auth. Reset codes are verified and return
only a masked destination plus a typed `passwordResetRequired` result; the
new-password confirmation screen is intentionally deferred to the account
settings/action-link routing subphase. Invalid, expired, and already-used codes
fail through the same safe typed error model.

## Flutter phone verification and booking submission

Phone verification is deferred until the customer attempts to submit a
booking. Registration, email verification, browsing, favorites, package views,
and in-memory booking preparation do not require phone verification. The
authoritative submission rule is intentionally simple: every booking
submission requires `users/{uid}.isPhoneVerified == true`.

Flutter normalizes `+639XXXXXXXXX`, `639XXXXXXXXX`, `09XXXXXXXXX`, and
`9XXXXXXXXX` to canonical `+639XXXXXXXXX`. Firebase Phone Authentication owns
the OTP challenge and credential. OTP values and verification IDs are never
written to Firestore or logged. The UI serializes requests, applies a 60-second
resend cooldown, maps invalid/expired codes and abuse errors, and returns to the
interrupted booking after refreshing the central account context.

After Firebase links or updates the phone credential, the client forces an ID
token refresh and calls the App Check-protected `syncPhoneVerification`
callable. That callable reads the verified number from Firebase Admin Auth,
requires an active customer, and transactionally updates `users/{uid}` and
`customers/{uid}` with server timestamps. It accepts neither a client phone
number nor a client verification flag.

`submitBookingRequest` is the canonical booking-submission boundary. It
independently checks active customer state, email verification, trusted phone
verification, a matching Firebase Admin Auth phone number, provider approval,
package availability, server-owned prices,
and add-on availability. Lifecycle, payment, notification, timeline, and audit
fields are written in a server transaction. Deterministic request-derived IDs
make transport retries safe. Firestore Rules continue denying unverified draft
creation, any client `pending` submission, trusted phone-flag changes, and
backend-controlled lifecycle/payment fields.

The previous client-batch implementation remains as an unused private migration
reference until downstream legacy add-on-request consumers are migrated. It is
not invoked by the production repository path and should be removed in a later
booking-domain cleanup.

## Flutter customer account management

The authenticated account surface now provides one Phase 5-based management
screen for profile, privacy/consent, credentials, session revocation, and soft
deactivation. Profile mutations go through the App Check-protected
`updateCustomerProfile` callable, which accepts only first name, last name,
address, city, and province. Role, account status, active/blocked flags,
verification flags, provider linkage, ownership, and timestamps are never
accepted from the client. Phone changes remain in the trusted phone-verification
workflow. Profile-photo Storage ownership remains protected by the existing
rules; selecting/cropping a new photo is deferred until the product approves a
media-picker dependency and image-processing policy.

Privacy preferences are stored through `updateCustomerPreferences`, with
server-owned consent/preference timestamps and an audit record. The current
legal policy versions use the explicit `unversioned` placeholder until product
legal supplies canonical version identifiers; the UI does not invent policy
wording. Marketing consent and notification preferences are distinct.

Password and email changes require recent Firebase reauthentication. Password
accounts reauthenticate with their current password; Google-only accounts are
directed to Google for password/email identity management. Email changes use
Firebase `verifyBeforeUpdateEmail`; Firestore is not changed until the verified
Auth email is read by `syncUserAuthState`. That trusted sync updates both user
and customer profiles transactionally, writes an audit log, and creates an
owner notification.

`deactivateCustomerAccount` is a soft lifecycle transition to
`pending_deletion`. It disables the user and customer profile, records server
timestamps/reason and an audit event, then revokes refresh tokens. It never
deletes bookings, payments, disputes, notifications, or audit records.
Reactivation requires FEASTA support review. `revokeAllCustomerSessions`
requires recent authentication, revokes refresh tokens, writes an immutable
audit record, and signs out the current device. Current-session logout retains
the existing central authentication-controller behavior.

## Phase 6 checklist

- [x] Phase 6.1 cross-application authentication audit
- [x] Canonical roles and account statuses reconciled
- [x] Provider verification lifecycle retained
- [x] Typed authentication gate results defined
- [x] Safe legacy parsers fail closed
- [x] Backend account-state helper added
- [x] Next.js server account-context type added
- [x] Flutter account-state model aligned
- [x] Shared gate-resolution matrix tested
- [x] Trusted Firebase phone verification persistence
- [x] Central Flutter authentication controller and guarded route policy
- [x] Flutter startup/authentication gate prevents protected-content flash
- [x] Flutter session-expired, disabled, blocked, deactivated, missing-profile,
      unsupported-role, and transient-retry states
- [x] Safe intended-destination validation and restoration
- [x] Flutter auth/token/account refresh listeners with serialized loads
- [x] Flutter emulator release guard regression coverage
- [x] Flutter customer registration controller and typed error mapping
- [x] Customer role and trusted registration fields remain server-owned
- [x] Customer profile transaction, rollback, and idempotent repair coverage
- [x] Verification-email failure recovery and resend guidance
- [x] Terms/privacy consent controls and trusted server timestamps
- [x] Registration accessibility, responsive, and large-text coverage
- [x] Typed Flutter email/password and Google customer login
- [x] Google cancellation distinguished from authentication failure
- [x] Missing Google customer profile uses trusted idempotent recovery
- [x] Provider/admin identities rejected without role mutation
- [x] Firebase-supported persistence only; no manual token persistence
- [x] Central logout clears identity, listeners, intended route, and navigation
- [x] Revoked, expired, blocked, disabled, and inaccessible-session handling
- [x] Login error semantics and repeated-submit coverage
- [x] Masked Flutter email-verification destination and accessible actions
- [x] Verification resend serialization, cooldown, and rate-limit errors
- [x] Auth reload, forced ID-token refresh, and trusted verification sync
- [x] Verification refresh preserves blocked/deactivated and role gates
- [x] Verification-screen logout/change-account flow
- [x] Privacy-preserving password-reset request and retry flow
- [x] Same-host Firebase action-link validation and typed action-code handling
- [ ] Reset-password confirmation UI and native action-link route integration
- [x] Philippine mobile normalization and masked phone presentation
- [x] OTP resend cooldown, typed failures, and duplicate-attempt prevention
- [x] Phone credential linking/update and forced ID-token refresh
- [x] App Check-protected trusted phone synchronization callable
- [x] Booking UI gate resumes only after account-context refresh
- [x] Server-authoritative phone check on every booking submission
- [x] Client phone-flag mutation and direct submitted-booking writes denied
- [x] Booking callable validates provider/package/add-on pricing server-side
- [x] Flutter customer profile view and safe-field editing
- [x] App Check-protected profile and preference callables with audit logs
- [x] Password change with recent authentication and Google-only guidance
- [x] Verify-before-update email flow with trusted dual-profile synchronization
- [x] Privacy/marketing/notification preference persistence with timestamps
- [x] Soft account deactivation to `pending_deletion` with session revocation
- [x] Current-session logout retained and all-session logout implemented
- [x] Blocked/deactivated account presentation and protected-flow denial
- [x] Account controller duplicate-submit, typed-error, and large-text coverage
- [ ] Profile-photo selection/cropping UX pending approved media dependency
- [ ] Web registration, recovery, verification, and account settings
- [ ] Provider onboarding and server-side verification gates
- [x] Flutter customer account deactivation and session-management workflows
- [ ] Phase 6 verification command and full acceptance suite

Phase 4 deployed App Check and production bundle evidence remain independent
production release gates and are not weakened by this model.
