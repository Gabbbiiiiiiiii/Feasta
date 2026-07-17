# Authentication and session foundation

## Trusted profile fields

Clients never create or update `role`, `accountStatus`, `isActive`,
`isBlocked`, `isEmailVerified`, `isPhoneVerified`, or `providerId` directly.
Firebase Auth establishes identity; callable Functions use the Admin SDK to
create profiles and synchronize Auth-owned metadata.

- `ensureUserProfile` creates or repairs customer `users/{uid}` and
  `customers/{uid}` documents. The role is always `customer` and cannot be
  supplied by the caller.
- `registerProvider` creates the provider user/profile/application atomically.
- `syncUserAuthState` validates active status and synchronizes verified email
  state and last-login timestamps.

Customer Google profile creation is idempotent. Existing provider/admin
profiles are rejected by the customer profile callable, and blocked or
disabled profiles cannot be refreshed into an active state.

## Web sessions

The web client signs in with the Firebase client SDK using in-memory
persistence and immediately exchanges a fresh ID token at
`POST /api/auth/session`. The server verifies the token and Firestore profile,
then creates the `__session` cookie with:

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
