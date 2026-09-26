# Secret management

Firebase browser configuration, Firebase app IDs, and reCAPTCHA Enterprise
site keys are public client configuration. They may use `NEXT_PUBLIC_*` only
when the browser must read them. Firebase Admin credentials, PayMongo keys,
webhook signing secrets, server Maps keys, App Check server credentials, API
tokens, and debug tokens are private and must never use `NEXT_PUBLIC_*`.

Tracked `.env.example` files contain names and placeholders only. Developers
copy them to ignored `.env.local` files. Do not commit `.env`, `.env.local`, a
service-account JSON file, private keys, exported Secret Manager data, or a
secret scanner report containing matched text.

## Firebase Functions and local development

Configure production secrets interactively:

```text
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
firebase functions:secrets:set PAYMONGO_SECRET_KEY
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET
```

Functions declare these with `defineSecret` and bind them only where needed.
Webhook handlers log event identifiers and outcomes, not raw payloads,
signatures, authorization headers, or payment instrument data. For emulator
development, use ignored `functions/.env.local` values belonging only to
sandbox accounts.

## Vercel

Set browser-safe Firebase configuration and the App Check site key as public
Vercel variables. Set `FIREBASE_ADMIN_PROJECT_ID`,
`FIREBASE_ADMIN_STORAGE_BUCKET`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and
`FIREBASE_ADMIN_PRIVATE_KEY` as encrypted server-only Vercel variables.
Preserve private-key newlines using Vercel's environment-variable UI. The web
server also supports Application Default Credentials on Google-managed hosts.

Preview and production should use different Firebase projects or service
identities. Grant only required permissions. Never upload service-account JSON
or expose its fields to Client Components.

## Rotation and incident response

1. Create the replacement secret without deleting the current one.
2. Bind a new Functions secret version or update the Vercel environment.
3. Deploy and validate Auth, Maps, checkout, webhook, and refund behavior.
4. Coordinate gateway and backend webhook-secret changes within the smallest
   possible overlap window.
5. Revoke the old credential after validation.
6. Record date, owner, affected services, and validation outside the repo.

If a secret is committed, treat it as compromised even after commit removal:
revoke it first, rotate dependants, inspect usage, then use the repository-owner
process to purge history.

## Verification

Run `pnpm security:secrets`. It examines tracked and non-ignored untracked
files, reports only file and secret type, and never prints matching values.
Known Firebase client configuration and emulator passwords are explicit public
or test fixtures; every other credential-shaped match fails the command.
