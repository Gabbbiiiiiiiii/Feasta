# Phase 3 Parts 2–3 implementation report

Date: 2026-07-17

## Delivered

### Provider verification lifecycle

- Canonical statuses and an explicit transition graph now exist in Functions,
  shared TypeScript, Flutter, rules, and domain documentation.
- Review transitions are strict: a submitted application must enter
  `under_review` before a decision.
- The audited admin review callable now supports `approved -> suspended`.
- Approval activates a provider; rejection, resubmission, review, and
  suspension keep it inactive.
- Provider clients cannot create lifecycle records, review themselves, or
  mutate lifecycle status through Firestore rules.
- Individual document `pending`/`verified` statuses remain separate and valid.

### Customer mobile authentication

- Email/password registration creates Auth first, calls the privileged
  idempotent customer-profile Function, and deletes the new Auth user if
  initial profile creation fails.
- Customer and Google profile creation no longer sends trusted role/account
  fields from Flutter.
- `ensureUserProfile` always creates a customer role, creates both profile
  documents atomically, and refuses existing provider/admin, blocked, or
  disabled profiles.
- `syncUserAuthState` performs trusted email-verification and last-login writes
  with the Admin SDK for all valid roles.
- Login recovers a missing profile through the customer-only callable, applies
  blocked/disabled checks, and signs out on failure.
- Google sign-in is duplicate-safe and rejects non-customer, blocked, and
  disabled profiles.
- Email verification refresh now reloads Firebase Auth, synchronizes trusted
  metadata, and keeps the user on the verification screen when still
  unverified.
- Password reset, resend, logout, and existing friendly UI mapping remain in
  place.
- The unsafe legacy `AuthService` registration/admin/verification APIs were
  removed; only its compatibility logout wrapper remains.
- Provider registration now calls the existing privileged callable instead of
  writing role/provider/verification documents from Flutter.

### Next.js sessions

- Client sign-in uses in-memory Firebase Auth persistence.
- Fresh ID tokens are exchanged for five-day Firebase session cookies.
- The cookie is HTTP-only, SameSite=Lax, path-scoped to `/`, and Secure in
  production.
- Server verification checks revocation/disabled state and re-reads Firestore
  role, block, active, and account status.
- Customer, provider, and admin layouts enforce role authorization server-side.
- Proxy cookie-presence checks provide early redirects but are not trusted as
  the authorization boundary.
- Logout revokes refresh tokens and clears the session cookie.
- Email/password and Google web sign-in UI, unauthorized handling, and
  role-specific authenticated landing pages are present.
- Server-only Admin/emulator environment variables are documented in
  `apps/web/.env.example`; no credentials or secrets were added.

## Automated validation

| Check | Result |
|---|---|
| Functions build and lifecycle unit tests | Passed (2 tests) |
| Functions ESLint | Passed |
| Shared types build | Passed |
| Next.js ESLint | Passed |
| Next.js production build | Passed; protected routes and proxy emitted correctly |
| Firebase Auth/Firestore/Functions emulator integration | Passed on isolated test ports |
| Provider legacy-status scan | Passed; no provider `verified`, `pending`, or `waiting` lifecycle values remain |
| `git diff --check` | Passed; line-ending notices only |
| Full Flutter analysis | Still fails with 264 pre-existing issues outside Parts 2–3 |

The emulator integration covers Google authentication, customer profile
creation, duplicate-call safety, fixed customer role, null provider ID,
non-customer rejection, blocked-account rejection, and disabled-account
rejection. It also proves that an authenticated client cannot change its own
trusted role to `admin` through Firestore rules.

## Existing inconsistency not silently changed

Flutter still references undefined legacy booking, payment, add-on, recovery,
and notification constants throughout `feasta_repository.dart`, models, and
screens. Those errors are not provider-verification lifecycle values and are
outside Parts 2–3, so they were not recreated or guessed. Full analysis improved
from the audited 273 issues to 264, but the application-wide analyzer baseline
will remain red until that separate schema migration is completed.
