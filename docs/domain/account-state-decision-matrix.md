# Cross-platform account-state decision matrix

This matrix is the Phase 6.14 contract for Flutter customer mobile, Next.js
customer/provider/admin portals, and trusted backend operations. The canonical
wire values and gate names live in
`packages/shared-types/src/authentication.ts`; Flutter mirrors those values in
`auth_account_state.dart` and the canonical presentation copy in
`auth_account_presentation.dart`.

Client routing explains a trusted state. It does not authorize an operation.
Next.js server guards, callable checks, Firebase Auth, Firestore Rules, and
Storage Rules remain authoritative.

## Authoritative sources

| Decision | Authoritative source | Refresh requirement |
|---|---|---|
| Authentication, disabled Auth user, email verification | Firebase Authentication and a freshly verified ID token/session cookie | Reload Auth and force-refresh the ID token after verification or credential changes |
| Role, account status, blocked/active state, provider link, phone verification | `users/{uid}` written through trusted workflows | Reload account context after profile, block, deactivation, or phone-verification changes |
| Customer profile existence | `customers/{uid}` | Mobile and web both fail closed when it is absent |
| Provider ownership and business setup | `users/{uid}.providerId` plus matching `providers/{providerId}.ownerId` | Reload the server account context after `registerProvider` |
| Provider verification | `providers/{providerId}.verificationStatus` and trusted provider flags | Refresh after upload, submission, or admin review |
| Session expiry/revocation | Firebase token/session verification | Clear stale context and sign in again |

## Customer decisions

Phone verification gates booking submission, not browsing. Every trusted
booking submission independently requires `isPhoneVerified == true`.

| State | Canonical gate | Flutter customer mobile | Next.js customer portal | Trusted enforcement | Recovery |
|---|---|---|---|---|---|
| Unauthenticated | `unauthenticated` | Public browsing; protected destination goes to login | Public pages allowed; protected layout goes to login | No authenticated operation | Sign in |
| Active, email and phone verified | `customerReady` | Customer app | Customer protected routes | Active customer checks | None |
| Email unverified | `emailVerificationRequired` | Verification screen | Verification route | Firebase Auth `emailVerified` | Check/resend verification |
| Phone unverified | `customerPhoneVerificationRequired` | Browsing allowed; booking submission opens phone flow | Account access allowed; booking submission denied | Trusted user flag checked by booking callable/rules | Verify phone |
| Blocked | `blocked` | Terminal message and sign-out | Session creation/verification denied | Server/callable/rules blocked check | Contact support |
| Disabled Auth account | `disabledAuthAccount` | Terminal message and sign-out | ID token/session rejected | Firebase Auth disabled state | Contact support |
| Deactivated | `deactivated` | Terminal message and sign-out | Session creation/verification denied | `accountStatus=pending_deletion` | Contact support |
| Missing customer profile | `missingUserProfile` | Recovery state; no customer access | Session rejected; no protected rendering | Both `users/{uid}` and `customers/{uid}` required | Retry trusted recovery or contact support |
| Expired/revoked session | `sessionExpired` | Clear cached context and sign out | Clear invalid cookie and return to login | Revocation-aware verification | Sign in again |

## Provider decisions

The Flutter customer app rejects every provider gate as an unsupported role and
never changes the stored role.

| State | Canonical gate | Next.js provider destination | Trusted enforcement | Recovery |
|---|---|---|---|---|
| Unauthenticated | `unauthenticated` | Provider login | No provider operation | Sign in |
| Email unverified | `emailVerificationRequired` | Provider verification-email gate | Firebase Auth `emailVerified` | Verify email |
| Missing business setup | `providerBusinessSetupRequired` | `/provider/onboarding` | Provider role; no approved operations | Complete setup |
| Draft | `providerVerificationDraft` | `/provider/verification` | Inactive provider | Upload and submit documents |
| Submitted | `providerVerificationSubmitted` | `/provider/status` | Inactive provider | Wait for review |
| Under review | `providerUnderReview` | `/provider/status` | Inactive provider | Wait for review |
| Resubmission required | `providerResubmissionRequired` | `/provider/verification` | Inactive; replacement allowed only in this state/draft | Replace requested documents |
| Rejected | `providerRejected` | `/provider/status` | Inactive; approved operations denied | Review feedback/contact support |
| Suspended | `providerSuspended` | `/provider/status` | Inactive and suspended | Contact support |
| Approved | `providerApproved` | Provider dashboard | Approved, active, not suspended, owned profile | None |
| Blocked | `blocked` | Session denied | Server/callable/rules blocked check | Contact support |
| Disabled Auth/account | `disabledAuthAccount` / `disabledAccount` | Session denied | Firebase Auth/account state | Contact support |
| Deactivated | `deactivated` | Session denied | `accountStatus=pending_deletion` | Contact support |
| Missing/invalid ownership link | `providerBusinessSetupRequired` or fail-closed invalid link | Onboarding only when no link; otherwise session denied | Matching user link and provider `ownerId` | Trusted registration recovery or support |

## Admin decisions

| State | Canonical gate | Next.js admin portal | Trusted enforcement | Recovery |
|---|---|---|---|---|
| Unauthenticated | `unauthenticated` | Admin login | No admin operation | Sign in |
| Active admin | `adminReady` | Admin protected routes | Revocation-aware active admin guard | None |
| Customer/provider/unknown role | `forbiddenRole` | Denied; never redirected into admin content | Trusted Firestore role | Use correct portal |
| Blocked | `blocked` | Session denied | Server/callable/rules blocked check | Contact support |
| Disabled Auth/account | `disabledAuthAccount` / `disabledAccount` | Session denied | Firebase Auth/account state | Contact support |
| Deactivated | `deactivated` | Session denied | `accountStatus=pending_deletion` | Contact support |
| Expired/revoked session | `sessionExpired` | Invalid cookie cleared; admin login | Revocation-aware session verification | Sign in again |

## Decision precedence

Resolvers fail closed in this order: configuration/loading/session,
authentication, disabled Auth, required profile, valid canonical role and
account fields, blocked, deactivated, disabled/inactive, required role, email
verification, role-specific profile/setup state, then ready/approved access.
Unknown roles, account statuses, provider statuses, malformed trusted fields,
and mismatched ownership links never grant access.

## Account refresh and sign-out

- Flutter serializes account loads and listens to Auth token plus user/customer
  document changes. Terminal states sign out while preserving the safe message.
- Next.js verifies the Firebase session cookie and reloads Auth plus Firestore
  account data for protected requests. Invalid, expired, or revoked cookies are
  cleared by the invalid-session route.
- Authentication, logout, email/phone verification, account edits,
  deactivation, provider registration, and provider review must refresh or
  discard cached account context.
- Neither platform stores a trusted role, ID token, or account decision in
  `localStorage`/`SharedPreferences`.

## Canonical messages

Canonical labels, messages, and recovery action names are exported as
`AUTHENTICATION_GATE_PRESENTATION`. Status-specific review notes may add detail,
but must not rename lifecycle states or contradict the canonical decision.

