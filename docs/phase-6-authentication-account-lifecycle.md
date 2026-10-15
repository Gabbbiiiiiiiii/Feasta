# Phase 6 authentication and account lifecycle

## Status

This document is the Phase 6 authentication and account-lifecycle architecture
reference. Unless a section is explicitly labelled otherwise, behavior
described as current or authoritative is **Implemented** and covered by local
automated tests.

Status labels used throughout this document:

| Label | Meaning |
| --- | --- |
| **Implemented** | Present in repository code and covered by local validation. |
| **Optional** | Supported policy choice, but not required for the current product flow. |
| **Manually validated** | Requires a human or console/browser/device check in addition to automated tests. |
| **Deployment-dependent** | Requires deployed Firebase/Vercel configuration or production evidence. |
| **Deferred** | Deliberately not implemented; it must not be represented as complete. |

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
Phase 6.9 consolidates the Next.js server authentication boundary without
replacing the Phase 3/4 Firebase session-cookie architecture.

Backend authorization, Firebase Security Rules, and verified server sessions
remain authoritative. An authentication gate result is presentation and routing
data; it never grants access by itself.

## Authentication architecture overview

**Implemented.** FEASTA uses Firebase Authentication for identity and
credential authority, Firestore for trusted application identity and lifecycle
state, Cloud Functions for privileged mutations, and server-only Firebase Admin
SDK code for web sessions and authorization. Flutter and browser code may
request authentication and render routing decisions, but neither is an
authorization boundary.

```text
Flutter customer                   Next.js browser
       |                                  |
Firebase client SDK                Firebase client SDK
       |                                  |
       +-------- Firebase Auth -----------+
                          |
             ID token / Auth user state
                 |                  |
       App Check callables      server ID-token exchange
                 |                  |
          Cloud Functions       Admin SDK + session cookie
                 |                  |
          Firestore/Auth       server account context
                 +--------+---------+
                          |
        Rules, role, account, ownership, and lifecycle checks
```

The primary trust boundaries are:

- Firebase Auth establishes the UID, provider identities, verified email,
  verified phone credential, disabled state, and token validity.
- Firestore `users/{uid}` establishes FEASTA role, account status, blocked
  state, provider link, trusted phone synchronization, consent, and profile
  lifecycle.
- Provider and verification documents establish immutable ownership and the
  provider approval lifecycle.
- Cloud Functions and Next.js server-only modules use Admin SDK data and fail
  closed. Client-side route guards and hidden controls are usability aids only.

## Platform authentication flows

### Flutter customer

**Implemented.**

```text
Firebase/App Check bootstrap
  -> auth and ID-token listeners
  -> load users/{uid} and customers/{uid}
  -> resolve role/account/email/phone state
  -> unauthenticated public surface, verification gate, or customer app
```

The customer mobile application rejects provider/admin roles without changing
their role. Phone-unverified customers may browse and prepare a draft, but the
booking backend independently rejects submission until trusted phone
verification is true.

### Next.js customer

**Implemented.**

```text
customer email/password or Google authentication
  -> trusted customer profile ensure/recovery
  -> ID token exchange
  -> HTTP-only session cookie
  -> requireCustomer + requireVerifiedEmail
  -> protected /customer routes
```

Provider/admin identities are rejected from the customer exchange rather than
being converted to customers.

### Next.js provider

**Implemented.**

```text
provider Auth identity
  -> trusted provider-role identity
  -> email verification
  -> business setup through registerProvider
  -> provider/verification ownership resolution
  -> lifecycle-specific onboarding route
  -> approved-only operational routes
```

The provider shell permits safe onboarding/status routes. Transactional
provider operations require the stricter approved-provider server guard.

### Next.js admin

**Implemented.**

```text
pre-provisioned admin Auth identity
  -> login-only admin portal
  -> expectedRole=admin session restriction
  -> Admin SDK role/account validation
  -> requireAdmin
  -> protected /admin routes
```

There is no public admin registration route, role selector, or browser mutation
that can provision an administrator.

## Required lifecycle flow diagrams

### Customer registration

```text
Auth account
  -> users/{uid} + customers/{uid}
  -> verification email
  -> verified authenticated session
  -> browse and prepare booking
  -> phone verification before booking submission
```

Profile creation is idempotent and forces `role=customer`. If the initial
trusted profile transaction fails, the newly created Auth identity is rolled
back when Firebase permits it. If verification-email delivery fails after
profile creation, the valid account remains recoverable through resend.

### Provider onboarding

```text
Auth account
  -> trusted provider role
  -> email verification
  -> business setup
  -> verification draft
  -> private document upload and submission
  -> admin review
  -> approved, active provider
```

Rejection, resubmission, and suspension remain distinct states. Only an active
admin can make a review decision; providers cannot activate or approve
themselves.

### Next.js session

```text
client authentication
  -> Firebase ID token
  -> same-origin, CSRF-protected server exchange
  -> Admin SDK verification and account resolution
  -> Secure HTTP-only session cookie
  -> server role/account validation on every protected route
```

### Account deactivation

```text
recent reauthentication
  -> trusted backend operation
  -> Firestore account state becomes pending_deletion
  -> refresh tokens revoked
  -> current session cleared
  -> protected access denied
```

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

## Firebase Auth and Firestore responsibility boundaries

**Implemented.**

| Concern | Authoritative source | Client responsibility |
| --- | --- | --- |
| UID and sign-in provider | Firebase Auth | Initiate supported Firebase authentication. |
| Password and password policy | Firebase Auth | Collect securely; never log or persist it. |
| Auth user disabled | Firebase Auth Admin state | Display a safe denial after server/controller resolution. |
| Email address and verification | Firebase Auth | Reload/refresh; never write `isEmailVerified` directly. |
| Phone credential | Firebase Auth | Complete OTP credential flow; never persist OTP. |
| FEASTA role | `users/{uid}.role`, written by trusted workflows | Route for usability; never choose or elevate role. |
| Account status and blocked state | `users/{uid}` and trusted backend | Refresh state and fail closed. |
| Trusted phone synchronization | Auth phone plus `users/customers` backend sync | Invoke the trusted sync; never set the flag. |
| Customer profile | `customers/{uid}` | Edit only allowlisted fields through trusted workflows. |
| Provider ownership | User link plus provider immutable owner fields | Supply business data; never supply actor/owner authority. |
| Provider approval | Provider verification records and admin function | Render lifecycle state only. |
| Web authorization | Verified server cookie plus Admin SDK context | Do not rely on local storage or hidden navigation. |
| Audit timestamps/actor | Cloud Functions/Admin SDK server timestamps | Never submit trusted timestamps or actor fields. |

## Account-context resolution

**Implemented.** Both shared gate resolution and the Next.js server resolver
apply the precedence documented above. Server resolution verifies the session,
loads the current Auth user, loads `users/{uid}`, parses canonical role/account
state, and loads provider ownership/verification data when required. Unknown or
missing privileged data never produces a ready state.

The minimal server context contains only the UID, trusted role/account decision,
email-verification state, and provider linkage/lifecycle required by the route.
Private profile data and Admin SDK credentials are not serialized into Client
Components. Flutter independently resolves the same model from Firebase Auth
and repository-loaded profiles, but backend Rules and callables remain
authoritative.

## Role-routing matrix

**Implemented.** “Onboarding only” means the identity can reach safe provider
setup/status routes but not approved-provider operations.

| Identity | Customer mobile | `/customer/**` | Provider onboarding | Approved provider routes | `/admin/**` |
| --- | --- | --- | --- | --- | --- |
| Unauthenticated | Public routes only | Login | Provider login | Provider login | Admin login |
| Customer | Customer gate | Allow when active and email verified | Deny | Deny | Deny |
| Provider | Unsupported role | Deny | Allow by lifecycle | Allow only when approved/active | Deny |
| Admin | Unsupported role | Deny | Deny | Deny | Allow when active |
| Unknown role | Fail closed | Deny | Deny | Deny | Deny |

## Account-status matrix

**Implemented.** Firebase Auth email verification is authoritative for email.
Trusted backend state is authoritative for the synchronized phone gate.

| State | Gate result | Protected access | Recovery |
| --- | --- | --- | --- |
| No authenticated user | `unauthenticated` | Denied | Sign in or register on an allowed surface. |
| Resolving state | `loading` | Not rendered | Wait; retry a transient repository failure. |
| Missing `users/{uid}` | `missingUserProfile` | Denied | Customer-only trusted recovery when eligible; otherwise support. |
| Auth user disabled | `disabledAuthAccount` | Denied | Contact support/admin; stale tokens do not bypass it. |
| Firestore blocked | `blocked` | Denied | Support/admin review. |
| `pending_deletion` | `deactivated` | Denied | FEASTA support review under retention policy. |
| Firestore disabled/inactive | `disabledAccount`/invalid state | Denied | Support/admin review. |
| Email unverified | `emailVerificationRequired` | Transactional routes denied | Resend, verify, reload, and refresh token. |
| Active customer, phone unverified | `customerPhoneVerificationRequired` for booking | Browse allowed; submission denied | Complete phone verification. |
| Active verified customer | `customerReady` | Customer routes allowed | None. |
| Provider link/profile missing | `providerBusinessSetupRequired` | Onboarding only | Complete trusted business setup. |
| Provider `draft` | `providerVerificationDraft` | Onboarding only | Upload required documents and submit. |
| Provider `submitted` | `providerVerificationSubmitted` | Status/account only | Wait for admin review. |
| Provider `under_review` | `providerUnderReview` | Status/account only | Wait for decision. |
| Provider `resubmission_required` | `providerResubmissionRequired` | Resubmission only | Replace rejected evidence and resubmit. |
| Provider `rejected` | `providerRejected` | Status/account only | Follow trusted remarks/support policy. |
| Provider `suspended` | `providerSuspended` | Operations denied | Support/appeal process where established. |
| Provider `approved`, active, not suspended | `providerApproved` | Approved provider routes allowed | None. |
| Active admin | `adminReady` | Admin routes allowed | None. |
| Wrong or unknown role | `forbiddenRole` | Denied | Use the correct portal; role is never mutated. |
| Expired/revoked/malformed session | `sessionExpired` | Denied | Clear session and authenticate again. |
| Missing/invalid runtime config | `configurationError` | Denied | Operator fixes configuration; no permissive fallback. |

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

## Next.js server authentication foundation

Browser sign-in continues to use the Firebase client SDK with Firebase-managed,
tab-scoped session persistence. This keeps callable authentication usable after
a page reload without manually storing tokens or roles. The HTTP-only server
session remains authoritative. The session route validates Origin and double-
submit CSRF controls, applies a Firestore transaction-backed IP-aware rate
limit, verifies the ID token with revocation checking, enforces a five-minute
recent-sign-in boundary, and replaces the named session cookie. Production
cookies are HTTP-only, Secure, SameSite=Lax, scoped to `/`, and expire after
five days. Credential failures remain generic and responses are non-cacheable.

Every session resolution verifies the Firebase session cookie, optionally
checks revocation according to route sensitivity (defaulting to checked), and
loads the current Firebase Auth user plus `users/{uid}` through Admin SDK. The
typed account policy fails closed for disabled Auth users, missing profiles,
unknown roles/statuses, blocked, disabled, deactivated, or inconsistent
provider links. Provider accounts additionally load the linked provider record,
verify immutable ownership, and parse the canonical verification lifecycle.
Only the minimal server account context is returned; it is not serialized into
Client Components.

Server helpers include `getOptionalAccountContext`,
`requireAuthenticatedAccount`, `requireCustomer`, `requireProvider`,
`requireApprovedProvider`, `requireAdmin`, `requireVerifiedEmail`, and
`requireActiveAccount`. Customer, provider, and admin layouts use their typed
role helpers while remaining protected server-side. Approval is intentionally
not required by the provider shell because draft, submitted, rejected, and
resubmission workflows must remain reachable; transactional provider pages can
use `requireApprovedProvider`.

Malformed, expired, revoked, disabled, or otherwise invalid cookies redirect to
an invalid-session route. That route re-verifies the cookie before clearing it,
so a cross-site request cannot clear a valid session. Safe return paths must be
relative and remain inside the authenticated role namespace; external,
protocol-relative, cross-role, backslash, and newline values fall back to the
role home. Logout retains Origin/CSRF validation, revokes refresh tokens, and
uses the shared cookie-destruction policy.

## Next.js customer authentication (Phase 6.10)

The public customer surface now provides email/password registration, customer
email/password and Google sign-in, verification resend/refresh, password-reset
request and completion, and Firebase email-action handling. Forms reuse the
Phase 5 fields, buttons, focus treatment, responsive spacing, and live error
states. Password reset requests return the same success copy for unknown and
known email addresses. Action-code routes ignore caller-controlled
`continueUrl` values and never perform an external redirect.

Registration creates the Firebase Auth identity, then calls the App
Check-protected `ensureUserProfile` callable. The browser never sends a role,
account status, blocked flag, or verification flag. The callable transaction
creates or repairs `users/{uid}` and `customers/{uid}` with role `customer`.
Failure during initial trusted profile creation deletes the just-created Auth
identity when Firebase permits it. Failure to send the first verification
email retains the completed account and routes to the resend screen. A valid
email/password login also invokes the same idempotent callable, which safely
repairs a legacy missing customer record but rejects existing provider/admin,
blocked, disabled, or inactive identities. Google login uses the same policy.

The ID token exchange remains protected by Origin, CSRF, recent-authentication,
revocation, and persistent rate-limit controls. The session route now returns a
destination selected by the server after applying the role-scoped return-path
policy. Browser code never navigates to the submitted return value directly.
Blocked and deactivated failures use safe state codes only after Firebase has
authenticated the identity; invalid credentials remain generic.

Every route under `/customer/**`, including the profile entry point, is wrapped
by the server customer layout. The layout calls both `requireCustomer` and
`requireVerifiedEmail` before rendering the application shell, so manual URLs
cannot expose protected customer content. Invalid, expired, revoked, or
disabled sessions are revalidated, cleared, and returned to login with a
privacy-safe session-ended message. The customer account entry displays only
the minimal trusted session context.

Firebase Console email templates must use the deployed `/auth/action` handler
for the custom reset/verification completion UI. The emulator uses its own OOB
handler during local acceptance tests. Approved versioned Terms and Privacy
Policy text is still a production content gate; the routes deliberately contain
placeholders rather than invented legal wording.

## Next.js provider authentication and onboarding (Phase 6.11)

Provider enrollment uses a separate customer-incompatible portal. The public
`/provider-register` flow creates Firebase Auth credentials and calls the
App Check-protected `ensureProviderIdentity` callable; it never writes a role
or trusted account field from the browser. Initial identity failure rolls back
the new Auth user where Firebase permits it. `/provider-login` exchanges a
recent provider credential for the same secure HTTP-only session mechanism,
but supplies `expectedRole=provider` as a restriction. The server rejects
customer/admin identities before setting a cookie. Provider routes return to
the provider login surface after missing or invalid sessions.

Verified providers without a linked provider profile are routed to
`/provider/onboarding`. Business setup calls the trusted, transaction-safe and
idempotent `registerProvider` callable using the canonical business fields.
There are no client controls for activation, approval, featured status, review
metadata, or suspension metadata. The backend creates inactive provider and
draft verification records and links ownership.

Server gates route draft and resubmission-required profiles to the verification
workflow; submitted and under-review profiles to a read-only status page;
rejected and suspended profiles to fail-closed status pages with trusted review
reasons where available; and approved, active, nonsuspended profiles to the
dashboard. Dashboard and package management call `requireApprovedProvider`
server-side. Navigation visibility is not used as authorization.

Verification uploads accept PDF, JPEG, PNG, or WebP up to 10 MB, use
`providers/{providerId}/verification/{documentType}/{uniqueFileName}`, and do
not request a public URL. Storage Rules enforce provider ownership and editable
verification state. The `registerVerificationDocument` callable verifies the
actual Storage object, type, size, exact path, ownership, and server-defined
required status. Submission uses the idempotent `submitProviderVerification`
callable. Required documents remain `business_permit` and `valid_id`.

## Next.js admin authentication (Phase 6.12)

Administration has a login-only surface at `/admin-login`. There is no public
admin registration page, handler, callable, or role selector. The browser uses
Firebase email/password authentication with Firebase-managed session
persistence, then
exchanges a fresh ID token for the existing secure FEASTA session cookie with
`expectedRole=admin`. That value only restricts the exchange; trusted Admin SDK
Auth and `users/{uid}` data determine the actual role.

Every `/admin/**` page is protected by the server-rendered admin layout and
`requireAdmin`. Session cookies are verified with revocation checking by
default, the Firebase Auth user is reloaded to reject disabled identities, and
the Firestore profile must be active, unblocked, non-deactivated, and exactly
`role=admin`. Customer/provider sessions and manual URL entry fail closed.
Invalid, expired, revoked, disabled, blocked, and deactivated sessions are
revalidated, cleared, and returned to `/admin-login`. There are currently no
Next.js admin route handlers or server actions; privileged provider review and
account administration remain active-admin-authorized Cloud Functions.

Admin login attempts first pass same-origin and CSRF validation and a persistent
Firestore transaction-backed throttle. It independently limits network identity
and a normalized-email identity for a temporary 15-minute window. Identifier
keys are SHA-256 hashed with the server-only `WEB_RATE_LIMIT_PEPPER`; raw email
addresses are not stored in rate-limit records or structured security logs.
Production refuses to operate this limiter without the pepper. Emulator mode
uses a deterministic non-production value. Firebase Authentication remains the
credential authority and its own abuse protection remains enabled. Responses
are generic and do not distinguish a missing account, wrong password, or wrong
role.

Current admin logout uses the existing Origin/CSRF-protected endpoint, clears
the secure cookie and CSRF cookie, signs out the browser Firebase client, and
revokes refresh tokens. This is intentionally stronger than device-only logout:
other sessions are also invalidated.

### Trusted admin provisioning

Admin identities are provisioned only through the controlled command:

```text
pnpm admin:provision --uid=<existing-auth-uid> --project=<firebase-project-id> --confirm=PROVISION_FEASTA_ADMIN --reason=<approved-change-reference>
```

The operator first creates the Firebase Auth user through a secured Firebase
administrative process, authenticates the command with Application Default
Credentials, and records an approved change reference. The command:

- requires an existing, enabled Auth user with an email;
- refuses to replace a customer/provider role or provider-linked account;
- requires the explicit confirmation phrase and project ID;
- sets the admin claim, transactionally creates/repairs the active admin profile,
  and writes an immutable `adminLogs` event;
- restores previous claims if the Firestore transaction fails;
- refuses emulator endpoints unless `--allow-emulator` is explicit.

No password, service-account JSON, or private key is accepted by the command.
Run it only from a trusted operator workstation or controlled CI job. Review
the resulting Auth user, Firestore profile, and audit entry before granting
production access.

### MFA readiness assessment

MFA is not claimed complete. Firebase Authentication supports multi-factor
authentication for upgraded Identity Platform projects, but FEASTA has not yet
selected factors, enrollment/recovery policy, break-glass ownership, or tested
the Admin portal enrollment/challenge flow. Recommended production hardening is
to require MFA for all admin accounts after those policies and staging tests are
approved. Until then, admin MFA remains an explicit production release gate.

## Next.js role account management (Phase 6.13)

Customer, provider, and admin workspaces now share one account-management panel
while their pages independently retain server role guards. Server-only profile
loading exposes only editable display data and preferences. It never serializes
blocked flags, role mutation controls, approval metadata, session cookies, or
Admin credentials.

Customer profile edits continue through `updateCustomerProfile`; the callable
now rejects unknown fields rather than silently ignoring privileged mutation
attempts. First name, last name, address, city, and province remain the only web
profile fields. Verified phone changes remain in the trusted phone workflow.
Customer soft deactivation retains bookings, payments, disputes, and audits.

Provider owner and business edits use `updateRoleAccountProfile`. The backend
verifies the provider link and immutable owner ID. Owner names, contact details,
description, and location may be maintained without changing activation,
featured, verification, ownership, service-type, or approval fields. Business
name and business email may change only in `draft` or
`resubmission_required`; other states require FEASTA review. Business email is
normalized and checked for duplicates. Provider deactivation is denied while
any provider request remains `pending`, `accepted`,
`waiting_for_down_payment`, `payment_processing`, `confirmed`, or
`in_progress`. Successful deactivation makes the account and public provider
inactive while preserving obligations and financial/audit history.

Admin editing is limited to first and last name plus shared preferences. There
is no role field and no admin self-deactivation callable. Admin lifecycle
changes require another trusted administrator and the controlled provisioning
process, avoiding an unreviewed last-active-admin removal path.

Shared preferences store marketing consent, push notifications, and email
notifications with server timestamps. Terms and Privacy versions remain
server-owned and retain the explicit `unversioned` placeholder until approved
legal versions exist.

Password changes require Firebase password reauthentication, update through
Firebase Auth, revoke all sessions through the trusted callable, and clear the
web session. Accounts without a password provider receive guidance to use their
external identity provider; FEASTA does not silently add credentials.

Email changes require password reauthentication and Firebase
`verifyBeforeUpdateEmail`. The existing verified email and access remain active
while confirmation is pending. Browser code never writes verification flags.
After confirmation, trusted session loading reads Firebase Admin Auth,
synchronizes `users/{uid}` and the customer profile where applicable, then
writes an audit entry and owner notification.

Current logout retains the existing CSRF/origin-protected cookie clearing and
token revocation. Explicit “sign out all sessions” uses
`revokeAllAccountSessions`, requires recent authentication, revokes refresh
tokens, and writes an immutable audit record.

## Phase 6.16 authentication UI quality

All customer authentication and account-management surfaces use the Phase 5
FEASTA tokens and shared fields, buttons, feedback, cards, layout containers,
dialogs, and snackbars. The legacy Flutter account-role selection and provider
registration branch was migrated away from raw colors, fixed spacing, local
text fields, and a raw exception-derived snackbar. This is a presentation
change only; trusted provider creation, server authorization, and account-state
gates remain authoritative.

Web authentication uses a shared `AuthCard` with one `h1`, a readable
`max-w-lg` form width, narrow-screen overflow containment, and a subtle
customer/provider/admin portal identifier. Dynamic authentication and
account-management results use the shared `AuthStatus`: errors are assertive,
focusable live regions, while informational and successful results use polite
announcements. Fields retain visible labels, linked descriptions and errors,
`aria-invalid`, autocomplete metadata, focus-visible styling, and minimum
touch targets. Session actions stack at narrow widths.

Flutter authentication surfaces retain visible labels, keyboard actions,
autofill metadata, semantic password/OAuth/OTP names, live status messaging,
minimum touch targets, scrollable forms, and bounded shared content containers.
The automated matrix renders login, account-role selection, registration, and
phone verification at 360, 390, 600, 768, and 900 logical pixels with 200%
text scaling. Web authentication shells are exercised at 360, 390, 768, 1024,
1280, and 1440 pixels.

Account lifecycle copy continues to come from the canonical gate presentation
model for blocked, disabled, deactivated, session-expired, provider draft,
submitted, under-review, resubmission-required, rejected, suspended, and
approved states. Status is expressed in text and never by color alone. Firebase
and server implementation details are mapped to safe messages before display.

## Phase 6.17 emulator authentication workflows

`pnpm emulator:seed` now creates deterministic customer, provider, and admin
authentication fixtures covering active, unverified, phone-unverified,
blocked, disabled, deactivated, missing-profile, missing-business,
verification-lifecycle, and approved states. Legacy Phase 3 fixture emails and
IDs remain valid. Every fixture is visibly fake, uses the `.test` namespace,
and is restricted to localhost emulator hosts. Synthetic phone values are not
real user numbers and OTP values are never stored.

The seed is idempotent: Auth records are created or restored to their declared
email-verification, phone, disabled, and custom-role state, while deterministic
Firestore documents are merged back to the canonical lifecycle state. The
Auth-only missing-profile customer is the sole intentional synchronization
exception. All seeded Firestore documents carry a fixture marker.

Two cleanup scopes are intentionally distinct:

- `pnpm emulator:fixtures:clear` deletes only exact seeded Auth UIDs and marked
  Firestore documents. It refuses non-local hosts and preserves unrelated
  emulator data.
- `pnpm emulator:reset` is the explicit full reset and clears all Auth,
  Firestore, and Storage emulator state.

`pnpm emulator:tooling:test` seeds twice, validates the full account matrix,
proves targeted cleanup preserves unrelated sentinel data, then proves the full
reset is empty. `pnpm emulator:auth-web:test` seeds the matrix and exercises
customer registration/login, mocked Google identity, email verification and
resend, password reset/change, trusted phone synchronization, provider
onboarding and every verification gate, admin login, block/deactivation,
session revocation, logout, and logout-all behavior. Client/admin Firebase apps
are deleted in `finally` blocks and the hidden Next.js process is stopped and
waited on. Windows acceptance wrappers also inspect only the repository's
dedicated Firestore test ports, stop orphaned Java emulator listeners, and
refuse to terminate a non-Java process.

The documented password is for local emulators only and must never be reused
in production, staging, demonstrations connected to production, or personal
accounts. Production credentials are neither generated nor read by this
tooling.

## Lifecycle operation reference

### Email verification

**Implemented.** Firebase Auth is authoritative. Resend is serialized and
cooldown-protected. Refresh reloads the Auth user, forces an ID-token refresh,
and invokes trusted synchronization; the client cannot set the verification
flag. Blocked, disabled, deactivated, missing-profile, and wrong-role checks
still run after verification.

### Phone verification before booking

**Implemented.** Firebase Phone Authentication owns the OTP challenge. The
verified Auth phone is synchronized through an App Check-protected callable,
and every booking submission independently requires trusted phone
verification. Draft preparation remains allowed. No OTP or verification ID is
stored in Firestore or logs.

### Password reset

**Implemented on Next.js; partially implemented on Flutter.** Both platforms
provide privacy-preserving reset requests. Next.js implements reset
confirmation through the validated action-code route. Flutter verifies action
codes and returns a typed reset-required result, but its native new-password
confirmation route remains **Deferred**.

### Password change

**Implemented.** Password-provider accounts must reauthenticate recently,
change the credential through Firebase Auth, invoke trusted session revocation,
and clear the current web/mobile session as applicable. Google-only accounts
are directed to their identity provider; FEASTA does not silently add a
password provider.

### Email update

**Implemented.** Password accounts reauthenticate and call Firebase
`verifyBeforeUpdateEmail`. The existing email remains active while confirmation
is pending. Firestore does not trust the submitted email; trusted synchronization
reads the confirmed Firebase Auth email, updates applicable profiles, and
writes audit/notification records.

### Customer profile recovery

**Implemented.** `ensureUserProfile` is authenticated, App Check-protected,
rate-limited, role-forcing, transaction-safe, and idempotent. It can repair a
missing customer document for an eligible customer identity. It refuses
provider/admin, blocked, disabled, or inactive identities and never creates
privileged records.

### Provider onboarding and verification gates

**Implemented.** The provider identity, business profile, ownership link,
verification record, documents, submission, and admin decision use trusted
callables. Draft/resubmission routes remain editable; submitted/under-review
routes are read-only; rejected/suspended providers cannot use operational
routes; approved routes additionally require active/nonsuspended provider
state.

### Admin provisioning

**Implemented as a controlled operator workflow.** `pnpm admin:provision`
operates on an existing Firebase Auth UID, requires explicit project/confirmation
arguments and a change reason, refuses unsafe role replacement, and writes an
immutable admin audit event. Provisioning is **Manually validated** in the
target environment. Public admin signup is prohibited.

### Blocked, disabled, and deactivated behavior

**Implemented.** Blocked and `pending_deletion` accounts are denied by account
resolution, server guards, Rules, and sensitive callables. Disabled Auth users
are rejected from current Admin SDK state even when an old token/cookie exists.
Deactivation retains legally and operationally required data and requires
support review for reactivation.

### Session expiration and revocation

**Implemented.** Flutter listens to Auth/token/account changes and terminates
an invalid session without flashing protected content. Next.js verifies
session cookies with revocation checking by default, reloads Auth/profile
state, clears invalid cookies through a protected flow, and redirects to the
correct login surface.

### Logout current session

**Implemented.** Flutter clears Firebase/Google state, cached account context,
listeners, and protected navigation. Web logout validates Origin and CSRF,
clears session/CSRF cookies, signs out the browser Firebase client, and
currently revokes refresh tokens.

### Logout all sessions

**Implemented.** Trusted callables require recent authentication, revoke
Firebase refresh tokens, write immutable audit records, and cause the current
client to clear its session. Because web current-session logout also revokes
tokens, its policy is intentionally stronger than device-only logout.

### Privacy and consent settings

**Implemented with a policy-content limitation.** Marketing consent, push
notifications, and email notifications use trusted mutations and server
timestamps. Terms/privacy acceptance versions are server-owned. The current
`unversioned` value and placeholder legal content remain **Deferred** until
product/legal approves canonical versions and wording.

### Account deactivation and retention

**Implemented.** Customer deactivation is a soft transition to
`pending_deletion`. Provider deactivation additionally fails while active
obligations exist. Admin self-deactivation is unavailable. Bookings, payments,
disputes, verification history, notifications required for operations, and
immutable audits are retained; the client cannot hard-delete them.

## Authentication security controls

### Rate limiting

**Implemented.** Auth/profile callables use Firestore transaction-backed
per-user buckets with retry timing. Browser session creation uses persistent
network-aware limiting, while admin login also uses a normalized identifier
hashed with server-only `WEB_RATE_LIMIT_PEPPER`. Registration, reset/resend,
credential changes, logout-all, provider onboarding, and account mutations are
covered by the abuse-prevention contracts. Flutter additionally serializes UI
requests and bounds OTP resend/confirmation attempts; UI throttling never
replaces backend/Firebase limits.

### App Check usage

**Implemented locally; production enforcement evidence is
Deployment-dependent.** Flutter and browser clients initialize App Check only
in supported client environments. Sensitive callable functions set the
established App Check enforcement policy; emulator/debug paths remain usable
without shipping a hardcoded debug token. Firestore and Storage enforcement,
callable production metrics, and deployed client token evidence remain Phase 4
release gates. Webhooks do not require App Check and continue using independent
signature validation.

### CSRF and origin protection

**Implemented.** Cookie-authenticated mutations and session creation accept
only configured same-origin requests and require the established double-submit
CSRF token. Missing/disallowed Origin, invalid token, or cross-origin logout is
denied. Credentialed wildcard CORS is not used.

### Safe redirect policy

**Implemented.** Return paths must be relative internal paths in the expected
role namespace. Absolute URLs, protocol-relative URLs, userinfo, backslashes,
newlines, unknown destinations, and cross-role destinations fall back to a
safe role home. The server selects the post-session destination.

### Deep-link validation

**Implemented, with Flutter reset completion deferred.** Firebase action links
must use HTTPS and the configured application host. Only `verifyEmail`,
`resetPassword`, and `recoverEmail` modes are recognized. Required action
codes are validated, and untrusted continuation URLs cannot drive navigation.

### Audit logging

**Implemented.** Privileged lifecycle changes use immutable audit entries with
server timestamps and trusted actor UID. Covered events include profile and
preference updates, email synchronization, provider registration/submission
and review, deactivation, session revocation, admin provisioning, and security
denials/rate-limit outcomes. Passwords, OTPs, ID tokens, cookies, authorization
headers, and private keys are never logged.

## Emulator test accounts

**Implemented.** All accounts are local-only `.test` fixtures. The shared
password is `FeastaTest!2026`; it must never be used outside Firebase
emulators. Phone values are synthetic test data.

| Account | Expected state |
| --- | --- |
| `customer@feasta.test` | Active, email and phone verified customer |
| `customer.unverified@feasta.test` | Email-unverified customer |
| `customer.phone-unverified@feasta.test` | Email verified, phone unverified |
| `customer.blocked@feasta.test` | Blocked customer |
| `customer.deactivated@feasta.test` | `pending_deletion` customer |
| `customer.missing-profile@feasta.test` | Auth-only recovery fixture |
| `provider.missing-setup@feasta.test` | Provider identity without business setup |
| `provider.pending@feasta.test` | Draft verification |
| `provider.submitted@feasta.test` | Submitted verification |
| `provider.under-review@feasta.test` | Under review |
| `provider.resubmission@feasta.test` | Resubmission required |
| `provider.rejected@feasta.test` | Rejected |
| `provider.suspended@feasta.test` | Suspended |
| `provider.approved@feasta.test` | Approved and active |
| `provider.blocked@feasta.test` | Approved provider with blocked owner account |
| `admin@feasta.test` | Active admin |
| `admin.blocked@feasta.test` | Blocked admin |
| `admin.disabled@feasta.test` | Disabled Firebase Auth admin |

## Local testing commands

```text
pnpm emulator:start
pnpm emulator:seed
pnpm emulator:fixtures:clear
pnpm emulator:reset
pnpm emulator:tooling:test
pnpm emulator:auth-web:test
pnpm emulator:provider-workflow:test
pnpm emulator:roundtrip:test
pnpm emulator:test
pnpm phase3:verify
pnpm phase4:local
pnpm phase5:verify
```

`emulator:fixtures:clear` is the safe targeted cleanup. `emulator:reset` is the
explicit full local reset. The acceptance wrappers close Firebase clients,
wait for the temporary web process, and remove only Java listeners occupying
dedicated test ports.

`pnpm phase6:verify` is **Implemented**. It composes shared authentication type
tests with the established Phase 3, Phase 4 local, and Phase 5 suites, applies
the error-fatal Flutter analyzer ceiling, and guarantees emulator cleanup. The
exact command passed locally on 2026-07-25. Criterion evidence is recorded in
`docs/phase-6-acceptance.md`.

## Known limitations

- **Deferred:** Flutter native reset-password confirmation UI and final native
  action-link route integration.
- **Deferred:** profile-image picker/cropping UX pending approved media and
  processing policy.
- **Deferred:** canonical legal Terms/Privacy text and version identifiers.
- **Optional / not complete:** admin MFA factor selection, enrollment,
  recovery, break-glass ownership, and staging validation.
- **Deployment-dependent:** deployed App Check enforcement evidence for
  Flutter/web, Firestore, Storage, and callable Functions.
- **Deployment-dependent:** production client-bundle evidence proving Admin SDK
  and credentials are absent.
- **Manually validated:** Firebase Console action-link templates, authorized
  domains, provider configuration, production cookie behavior, and controlled
  admin provisioning in each target environment.
- **Deferred:** the final strict Phase 6 acceptance review and any product
  decision that promotes optional/manual production checks to release blockers.

## Manual test checklist

- [ ] Register a new customer and confirm Auth plus both profile documents.
- [ ] Verify the customer email and confirm a forced token/account refresh.
- [ ] Confirm an unverified phone blocks booking submission from UI and direct
      backend invocation.
- [ ] Complete a Firebase test-phone OTP and submit the booking.
- [ ] Exercise password reset from the deployed email template.
- [ ] Reauthenticate, change password, and confirm old sessions are revoked.
- [ ] Request an email change and confirm Firestore changes only after Auth
      verification.
- [ ] Sign in with Google; verify missing-customer recovery and wrong-role
      rejection.
- [ ] Complete provider identity, email, business setup, document submission,
      review, and approval.
- [ ] Confirm draft/submitted/under-review/resubmission/rejected/suspended
      providers receive the documented route gates.
- [ ] Confirm customer/provider accounts cannot use admin login or routes.
- [ ] Provision an admin through the controlled command and review its audit
      entry.
- [ ] Block, disable, and deactivate test identities while signed in; confirm
      protected access ends.
- [ ] Test current logout and all-session logout from each supported role.
- [ ] Verify external return paths, malicious action continuations,
      cross-origin session creation, and CSRF-invalid mutations are denied.
- [ ] Test authentication screens with keyboard/screen reader, large text, and
      documented mobile/desktop widths.

## Production checklist

- [ ] Configure production Firebase Auth providers and approved domains.
- [ ] Configure deployed action-link handler URLs and manually test verify,
      reset, and recover-email templates.
- [ ] Supply production-only server secrets, including
      `WEB_RATE_LIMIT_PEPPER`, through approved secret management.
- [ ] Confirm production session cookie flags, allowed origins, CSRF behavior,
      HTTPS, and role-scoped redirects.
- [ ] Enable and capture deployed App Check evidence after staged metrics
      validation; retain the documented rollback plan.
- [ ] Capture production bundle evidence that Firebase Admin and private
      credentials are server-only.
- [ ] Approve versioned Terms/Privacy content and consent migration policy.
- [ ] Decide and test the admin MFA enrollment, recovery, and break-glass
      policy, or explicitly accept the residual risk.
- [ ] Exercise controlled admin provisioning with two-person/change-control
      review where organizational policy requires it.
- [ ] Confirm alerting and retention for auth denials, rate limiting, admin
      actions, deactivation, and revocation events.
- [x] Run `pnpm phase6:verify` and record the exact successful result locally.

## Phase 4 deployment gates still pending

The following are **Deployment-dependent** and remain open production release
gates:

- deployed Flutter and web App Check token/enforcement evidence;
- Firestore, Storage, and callable enforcement evidence from the deployed
  project;
- legitimate-traffic monitoring and rollback validation;
- production web bundle evidence that Admin SDK and private configuration never
  enter client chunks.

Local Phase 4 security verification remains passing. Phase 6 documentation and
local emulator success do not waive these release gates.

## Phase 6 completion criteria

Phase 6 is complete only when all of the following are true:

- canonical role/account/provider states resolve consistently across Flutter,
  Next.js, shared types, and backend helpers;
- customer registration, login, Google login, email verification, password
  recovery, phone-before-booking, profile recovery, account management,
  deactivation, logout, and revocation pass;
- provider identity, onboarding, verification lifecycle, ownership, and
  approved-only gates pass;
- admin login-only behavior, controlled provisioning, rate limiting, and
  server-side route authorization pass;
- blocked, disabled, deactivated, missing-profile, wrong-role, expired,
  malformed, and revoked states fail closed;
- cookie, Origin, CSRF, redirect, deep-link, App Check policy, rate-limit,
  idempotency, audit, and secret-boundary regressions pass;
- deterministic emulator workflows seed, replay, export/import, clean up, and
  leave no hanging listeners;
- Phase 3, Phase 4 local, and Phase 5 regressions remain passing;
- `pnpm phase6:verify` exists and exits successfully;
- no mandatory acceptance criterion is skipped and no critical/high
  authentication blocker remains.

Phase 6.19 implements and proves the repeatable local verification command.
The final strict Phase 6 acceptance review remains separate, and
deployment-dependent Phase 4 production gates remain open.

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
- [x] Next.js ID-token exchange and session-cookie creation consolidated
- [x] Revocation-aware session verification with explicit sensitivity option
- [x] Trusted Auth/user/provider context with provider ownership checks
- [x] Typed customer, provider, approved-provider, and admin server guards
- [x] Disabled, missing, blocked, deactivated, wrong-role, and invalid-link denial
- [x] Invalid-cookie clearing without clearing valid sessions
- [x] Role-scoped safe return paths and external redirect denial
- [x] Persistent transaction-safe session-creation rate limiting
- [x] Origin, CSRF, cookie-policy, and Admin client-exclusion regressions
- [x] Web customer registration forces trusted customer role
- [x] Web email/password and Google customer sign-in with profile recovery
- [x] Web email verification resend/refresh and verified-email server gate
- [x] Web password-reset request, completion, and safe action-code handling
- [x] Web role-scoped return paths and malicious redirect denial
- [x] Web blocked, disabled, deactivated, expired, and missing-profile denial
- [x] Protected customer layout and account profile entry point
- [x] Customer authentication accessibility and responsive component coverage
- [ ] Approved production Terms and Privacy Policy content
- [x] Web customer profile editing/account lifecycle UI
- [x] Web provider registration and provider-only secure login
- [x] Provider email-verification resend/refresh gate
- [x] Trusted idempotent provider business setup
- [x] Missing-profile, draft, submitted, under-review, resubmission, rejected,
      suspended, and approved provider routing
- [x] Approved-only dashboard and package-route server gates
- [x] Private verification document upload and submission entry point
- [x] Provider role/ownership/self-approval security regressions
- [x] Dedicated admin login-only surface with no public registration
- [x] Admin-only ID-token exchange and secure session-cookie reuse
- [x] Revocation-aware active-admin server layout guard
- [x] Customer/provider admin portal denial and safe admin return paths
- [x] Disabled, blocked, deactivated, revoked, and invalid admin denial
- [x] Transactional IP and normalized-account admin login throttling
- [x] Generic admin authentication errors and structured security events
- [x] Admin logout clears cookies and revokes sessions
- [x] Controlled trusted admin provisioning command and audit entry
- [x] Admin authentication component, contract, and emulator coverage
- [ ] Admin MFA enrollment/challenge/recovery implementation and validation
- [x] Shared web account profile, preference, credential, and session UI
- [x] Customer safe-field editing and soft deactivation
- [x] Provider owner/business editing with verification-controlled identity
- [x] Provider active-obligation deactivation safeguard
- [x] Admin limited profile editing and self-deactivation denial
- [x] Password reauthentication and external-provider safe behavior
- [x] Verify-before-update email with trusted session synchronization
- [x] Role-neutral preference timestamps and policy-version preservation
- [x] Audited all-session revocation and role-aware logout destinations
- [x] Account mutation protected-field, component, contract, and emulator tests
- [x] Firebase-managed tab persistence for callable operations after reload
- [x] Flutter customer account deactivation and session-management workflows
- [x] Canonical cross-platform account-state decision matrix and terminology
- [x] Matrix-driven shared TypeScript, web, backend, and Flutter gate coverage
- [x] Web and Flutter both require the customer profile document
- [x] Auth email verification and trusted phone-verification authority documented
- [x] Provider lifecycle and ownership decisions aligned across server routing
- [x] Consistent blocked, disabled, deactivated, role, and session recovery copy
- [x] Persistent CSRF/origin-protected web authentication-attempt preflight
- [x] Registration, reset, resend, credential-change, and logout-all throttling
- [x] Flutter OTP resend cooldown cannot be bypassed as a fresh send
- [x] Flutter OTP confirmation attempts bounded per verification session
- [x] Phase 6 authentication abuse adversarial contract coverage
- [x] Phase 4 local security regression retained
- [x] Shared responsive customer/provider/admin web authentication shell
- [x] Focusable live-region authentication and account status feedback
- [x] Provider registration field errors linked to their controls
- [x] Flutter auth, role-selection, registration, and OTP controls use Phase 5
      primitives and semantic labels
- [x] Flutter auth widths 360/390/600/768/900 pass at 200% text scale
- [x] Web auth widths 360/390/768/1024/1280/1440 pass
- [x] Authentication accessibility and responsive suites pass
- [x] Deterministic customer/provider/admin authentication fixture matrix
- [x] Auth/Firestore fixture synchronization with intentional missing-profile case
- [x] Idempotent seed replay validation
- [x] Targeted fixture cleanup preserves unrelated emulator data
- [x] Explicit full Auth/Firestore/Storage reset remains available
- [x] Customer, Google mock, email/reset, phone, provider, and admin emulator workflows
- [x] Block, deactivation, revocation, logout, and logout-all emulator coverage
- [x] Emulator applications/listeners and hidden web process clean up reliably
- [x] Phase 6.18 architecture, lifecycle, emulator, manual, and production documentation
- [x] Phase 6.19 verification command and 52-criterion local acceptance suite
- [x] Phase 6.20 final strict local acceptance review

Phase 4 deployed App Check and production bundle evidence remain independent
production release gates and are not weakened by this model.
