# Emulator development workflow

Run commands from the monorepo root.

```powershell
pnpm emulator:start
pnpm emulator:seed
pnpm emulator:export
pnpm emulator:reset
pnpm emulator:test
pnpm emulator:tooling:test
pnpm emulator:auth-web:test
pnpm emulator:provider-workflow:test
pnpm emulator:roundtrip:test
pnpm emulator:hosting:test
pnpm phase3:verify
```

`emulator:start` starts Auth, Firestore, Functions, Storage, and Hosting. It
imports `firebase/emulator-data` when an export exists and exports current state
on shutdown. The directory is ignored by Git.

`emulator:reset` reads emulator host variables when present and otherwise uses
the normal local ports. It rejects every endpoint except `127.0.0.1` or
`localhost`. Add `-RemoveExport` when invoking the PowerShell script directly
to remove the ignored saved export as well. It never targets production
Firebase services.

`emulator:tooling:test` uses isolated ports and a `demo-*` project. It seeds
Auth and Firestore, creates a Storage fixture, validates the fixed records,
resets all three products, and verifies that no state remains.

## Seed accounts

All seeded accounts use password `FeastaTest!2026` and verified email state.

| Account | Role/state |
|---|---|
| `customer@feasta.test` | Customer |
| `provider.pending@feasta.test` | Draft provider |
| `provider.submitted@feasta.test` | Submitted provider |
| `provider.approved@feasta.test` | Approved provider |
| `admin@feasta.test` | Admin |

The seed is idempotent and uses fixed Auth UIDs and Firestore IDs. It includes
customer/provider identities, all verification examples, catalog data, a main
event and provider request, legacy booking compatibility data, payment,
notification, review, complaint, announcement, and public app settings.

## Hosting approach

Next.js remains a server-rendered application with API routes and secure Admin
SDK session handling, so normal development continues with:

```powershell
pnpm --dir apps/web dev
```

Firebase Hosting Emulator runs separately on `http://127.0.0.1:5000`. It serves
a small static integration page and validates the `/api/health` rewrite to the
Functions Emulator. This tests Hosting headers, public-root behavior, and
Functions rewrites without pretending that the dynamic Next.js application is
static or enabling experimental framework integration. Production hosting will
require a deliberate SSR deployment choice (framework integration, Cloud Run,
or another Next.js host); this Phase 3 configuration is local validation only.
