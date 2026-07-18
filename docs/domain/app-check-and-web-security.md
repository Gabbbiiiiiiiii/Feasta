# App Check and web server security

## App Check clients

The Flutter Android client activates App Check immediately after Firebase. A
debug build uses Firebase's debug provider and prints a generated token for the
developer to register; no token is embedded in source. A release build always
uses Play Integrity. Release testing therefore requires a registered Android
app/signing certificate and a device accepted by Play Integrity.
The Gradle project deliberately has no debug-key fallback for release signing;
the trusted CI/release environment must provide the production signing setup.

The Next.js browser client initializes reCAPTCHA Enterprise App Check once,
only in a browser. `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` is a public site
key, not a secret. Server rendering never initializes browser App Check. The
Firebase emulator configuration skips browser App Check because local emulators
do not validate production attestation.

All deployed callable Functions use `enforceAppCheck: true`; the shared option
sets it to false only under `FUNCTIONS_EMULATOR=true`. HTTP webhooks must not use
App Check because external payment systems cannot mint Firebase tokens. A future
webhook must instead verify the provider signature against the raw request body,
reject stale/replayed events, and remain covered by idempotency tests. No webhook
endpoint exists in the current Functions tree.

`consumeAppCheckToken` is not enabled. It requires limited-use token support at
every client call site and adds latency; FEASTA currently uses server-side
transactions and idempotency keys for replay-sensitive operations. Reconsider
token consumption when both mobile and web SDK call sites explicitly request
limited-use tokens.

## Product enforcement rollout

1. Register Android Play Integrity and the web reCAPTCHA Enterprise provider.
2. Deploy client token generation and inspect App Check metrics/logs.
3. Register local debug tokens only for trusted developers; never commit them.
4. Enable enforcement for Firestore, Storage, and callable Functions in the
   development/staging Firebase project.
5. Validate sign-in, Firestore, Storage, Maps, provider verification, complaint,
   and review traffic on legitimate clients.
6. Enable Firestore and Storage enforcement in production. Callable enforcement
   is already declared in deployed function options.

Firestore and Storage enforcement is Firebase project configuration managed in
the Firebase Console; it is not expressible in `firestore.rules` or
`storage.rules`. Rules remain mandatory authorization after attestation.

Rollback: disable enforcement for the affected Firebase product in App Check,
leave client token generation deployed, inspect rejected-request metrics, fix
provider registration/configuration, validate staging, then re-enable. Do not
replace Play Integrity with the debug provider in a release build.

## Web session and request security

Firebase client credentials are exchanged at `/api/auth/session`. The server
verifies the ID token and recent sign-in, loads the trusted Firestore profile,
then issues the `feasta_session` Firebase session cookie. It is HTTP-only,
SameSite Lax, path `/`, five days, and Secure in production. Protected layouts
verify signature, expiration and revocation and then reject disabled Auth users,
missing profiles, blocked/inactive accounts, and incorrect roles.

Cookie-authenticated mutations require an exact allowed Origin plus a
double-submit CSRF token from `/api/auth/csrf`. Configure exact origins in
`WEB_ALLOWED_ORIGINS`; wildcards are unsupported. Return paths must pass the
same-origin relative-path validator. Logout validates Origin/CSRF, revokes
refresh tokens when possible, and clears both cookies.

Security headers are emitted by Next.js. Production removes `unsafe-eval` and
adds HSTS. `unsafe-inline` remains for Next.js bootstrap/style compatibility;
moving to a nonce-based CSP is a future hardening item.

## Validation

- `pnpm --dir functions test`
- `pnpm --dir apps/web test:security`
- `pnpm emulator:auth-web:test`
- `pnpm --dir apps/web build`

The emulator acceptance test covers unauthenticated and wrong-role redirects,
valid customer/provider/admin access, blocked and disabled rejection, revoked
session rejection after logout, valid same-origin CSRF, invalid CSRF, and a
disallowed Origin. The App Check policy test proves deployed enforcement and
emulator bypass. After console enforcement, confirm a real registered client is
accepted and an equivalent request with its App Check header removed is denied.
