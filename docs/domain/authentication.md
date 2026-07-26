# Authentication and session foundation

## Admin authentication and provisioning

The web admin portal is login-only at `/admin-login`. All `/admin/**` routes
resolve a revocation-aware HTTP-only session on the server and require the
trusted Firestore role `admin` plus an active, unblocked account and an enabled
Firebase Auth user. There is no public admin registration endpoint.

Production administrators are provisioned from an existing Firebase Auth UID
with `pnpm admin:provision` and the explicit confirmation phrase documented in
`docs/phase-6-authentication-account-lifecycle.md`. The command requires
Application Default Credentials, refuses role conversion, and creates an admin
audit log. Admin MFA is assessed but not yet implemented or claimed complete.

## Trusted profile fields

Clients never create or update `role`, `accountStatus`, `isActive`,
`isBlocked`, `isEmailVerified`, `isPhoneVerified`, or `providerId` directly.
Firebase Auth establishes identity; callable Functions use the Admin SDK to
create profiles and synchronize Auth-owned metadata.

Web account management uses Firebase-managed tab session persistence only for
Firebase client SDK operations such as App Check-protected callables. The
HTTP-only Firebase session cookie and server-side Admin SDK checks remain the
authorization boundary. The application never manually stores ID tokens or
roles.

Provider account deactivation is blocked by any nonterminal provider request.
Admin self-deactivation is not exposed or accepted. Password changes revoke
sessions, and email changes remain pending until Firebase verifies the new
address. Trusted session loading then synchronizes Auth-owned email and
verification state with audit and notification records.

- `ensureUserProfile` creates or repairs customer `users/{uid}` and
  `customers/{uid}` documents. The role is always `customer` and cannot be
  supplied by the caller. When customer registration supplies accepted terms
  and privacy consent, their timestamps are recorded by the server and existing
  consent timestamps are preserved.
- `registerProvider` creates the provider user/profile/application atomically.
- `syncUserAuthState` validates active status and synchronizes verified email
  state and last-login timestamps.

Customer Google profile creation is idempotent. Existing provider/admin
profiles are rejected by the customer profile callable, and blocked or
disabled profiles cannot be refreshed into an active state.

Flutter customer login uses Firebase Auth persistence directly. It does not
store ID tokens or trusted role/account context manually. Email and Google
login both pass through the trusted profile synchronization/recovery callables,
validate the customer role, and refresh the ID token before the central account
gate grants a customer destination. Terminal account/session failures sign out
the local session while preserving a safe user-facing reason.

## Web sessions

The web client signs in with the Firebase client SDK using Firebase-managed
tab/session persistence and immediately exchanges a fresh ID token at
`POST /api/auth/session`. The server verifies the token and Firestore profile,
then creates the `feasta_session` cookie with:

- `HttpOnly`
- `SameSite=Lax`
- `Secure` in production
- five-day maximum age
- root path scope

Protected customer, provider, and admin layouts call the server-only
`requireRole` guard. It verifies the session with revocation checking and
re-reads the Firestore role/account state. The proxy's cookie-presence check is
only an early redirect optimization; it is not the authorization boundary.

Logout revokes the user's refresh tokens and clears the cookie. Disabled,
revoked, blocked, missing-profile, and role-mismatched sessions are denied.

Production uses Application Default Credentials supplied by the hosting
environment. Service-account JSON and private keys must never be placed in a
`NEXT_PUBLIC_` variable or committed to the repository.

## Authentication abuse prevention

Authentication protections are layered; client cooldowns are usability
controls and never replace Firebase or server enforcement.

| Operation | Primary protection |
|---|---|
| Customer/provider Auth registration | Firebase Auth abuse controls plus same-origin, CSRF-protected persistent web preflight; trusted profile callables use App Check and Firestore rate limits |
| Session creation | Origin and double-submit CSRF validation, persistent per-IP counter, fresh/revocation-checked ID token, secure session cookie |
| Password reset | Privacy-preserving response, Firebase Auth quotas, persistent web IP/normalized-identifier preflight |
| Verification resend | Firebase Auth quotas, 60-second client cooldown, persistent web IP/UID preflight |
| Phone OTP send | Firebase Phone Auth/App Check/quota enforcement, serialized request, 60-second resend cooldown |
| Phone OTP confirmation | Firebase Phone Auth verification plus five attempts per mobile verification session |
| Email/password changes | Firebase recent reauthentication plus persistent web UID preflight; trusted synchronization/session revocation remains rate-limited |
| Logout all sessions | Recent reauthentication, persistent web UID preflight, App Check-protected callable counter, Admin SDK token revocation |
| Provider onboarding/submission | Active provider role, ownership, App Check, persistent callable counter, deterministic registration and idempotency keys |
| Admin login | Generic failures, CSRF/origin validation, persistent per-IP and normalized-account counters, revocation-aware admin session guard |

The preflight route stores only hashed subjects in `rateLimits`; it does not
store submitted email addresses or tokens. Authentication tokens, passwords,
OTP codes, session cookies, and authorization headers are never included in
application logs. Public reset responses continue to avoid disclosing whether
an account exists.

Firebase Phone Auth and Firebase email action endpoints remain independently
protected by Firebase even if a custom client bypasses FEASTA UI cooldowns.
Production App Check enforcement remains a deployment release gate documented
in the Phase 4 security architecture.
