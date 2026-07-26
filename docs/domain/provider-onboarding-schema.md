# Canonical provider onboarding schema

This document defines the Phase 7 provider onboarding contract. Existing
Firestore documents remain flat for compatibility. Shared TypeScript types are
in `packages/shared-types/src/provider.ts`; Flutter equivalents are in
`apps/customer_mobile/lib/core/domain/provider_onboarding.dart`.

Unknown role, service, provider-verification, document-type, and
document-status values fail closed. Missing operational fields on legacy
provider documents use the original registration defaults. The legacy
`guestCapacity` input is accepted as an alias for `maxGuestsPerEvent`.

## Web onboarding progress

The web portal uses eight ordered steps: owner, business, services, location,
capacity, consent, documents, and review. Steps 1–6 are saved by the App
Check-protected `saveProviderOnboardingDraft` callable in
`providerOnboardingDrafts/{uid}`. Browser Firestore access to that collection
is denied; server rendering reads it through the Admin SDK.

Only the first incomplete setup step or an earlier completed step may be
opened. The server redirects manual attempts to skip ahead. Completing step 6
calls the idempotent `registerProvider` workflow, which creates the inactive
draft provider and verification records and deletes the temporary draft.
Approved providers go to their provider home; submitted, under-review,
rejected, and suspended providers go to their status page; providers requiring
resubmission return to document recovery.

Owner and business email values are trimmed and lowercased. Philippine contact
numbers accept common local or `+63` forms and are stored in a normalized
`+63...` representation without enforcing a fragile carrier-prefix list.

Logo and cover uploads use their final deterministic provider media prefixes:
`providers/{uid}/logo/` and `providers/{uid}/cover/`. Before the deterministic
provider document exists, Storage permits only the active provider account
whose UID matches the path and whose `providerId` is still null. JPEG, PNG, and
WebP are allowed; logos are limited to 5 MB and covers to 10 MB. The trusted
draft callable verifies actual Storage existence, MIME type, size, and exact
owner path before persisting `logoStoragePath` or `coverStoragePath`. Repeated
uploads replace a deterministic onboarding object; draft metadata is saved
before an obsolete object is deleted.

## Owner identity

| Field | Authority | Allowed writer |
|---|---|---|
| `ownerId` | Firebase Auth UID | Trusted backend only |
| `ownerFirstName`, `ownerLastName` | Validated owner input | Provider through trusted onboarding/account callable |
| `ownerEmail` | Firebase Auth / `users.email` snapshot | Trusted backend only |
| `ownerPhone` | `users.phoneNumber` snapshot | Trusted backend only |
| `termsPolicyVersion`, `privacyPolicyVersion` | Accepted policy version | Trusted identity/account callable |
| `termsAcceptedAt`, `privacyAcceptedAt` | Server timestamp | Trusted backend only |

Consent is authoritative on `users/{uid}`. It is not inferred from the presence
of a checkbox in the UI, and clients cannot supply acceptance timestamps.
`unversioned` remains the compatibility value until approved policy versions
are published.

## Business and operations

Provider-writable onboarding values are:

- `businessName`, normalized `businessEmail`, and `businessPhone`;
- `description`;
- `providerServiceType`: `catering`, `addon`, or `both`;
- `providerCategory` as the primary legacy category and canonical
  `serviceCategories` for all supported categories;
- `address`, `city`, `province`, and optional validated
  `locationCoordinates`;
- `serviceAreas`, optional `maxServiceDistanceKm`, and
  `eventTypesSupported`;
- `minGuestsPerEvent` and `maxGuestsPerEvent`;
- `acceptsMultipleEventsPerDay` and `maxEventsPerDay`;
- `availableStaffCount` and `availableEquipmentCount`;
- `operatingDays`, `bookingLeadTimeDays`, and ISO `unavailableDates`.

The `registerProvider` callable validates these fields and applies defaults for
older callers. Profile edits use a trusted account-management callable when
legal identity or verification-sensitive data is involved.

Service categories are checked against `providerServiceType`: catering-only
accounts may use catering categories, add-on-only accounts may use add-on
categories, and `both` may use either. All counts are non-negative integers;
guest minimum cannot exceed guest maximum; a single-event provider always has
`maxEventsPerDay=1`. Service distance is optional and limited to 1–1,000 km,
booking lead time to 0–365 days, and unavailable dates to 366 unique ISO dates.

Coverage, distance, operating days, and unavailable dates are provider-declared
planning constraints. They never imply that a requested slot is available:
booking submission must perform its own trusted availability checks. Phase 7.5
does not implement a booking calendar engine. No direct browser Maps API was
added; future geocoding must continue through FEASTA's authenticated,
rate-limited Maps callables.

## Server-owned provider fields

Clients cannot assign or update:

- ownership and account-link fields;
- `verificationStatus`;
- `isActive`, `isFeatured`, or `isSuspended`;
- approval, review, rejection, resubmission, or suspension metadata;
- search tokens and aggregate counters;
- audit fields and server timestamps;
- soft-deletion actor/timestamp fields except through the documented
  soft-deletion workflow.

Firestore and callable authorization remain authoritative even when the UI
hides an unavailable action.

## Verification

Provider lifecycle values are:

`draft`, `submitted`, `under_review`, `resubmission_required`, `approved`,
`rejected`, and `suspended`.

Document types are:

`business_permit`, `dti_registration`, `bir_registration`, `valid_id`,
`sanitary_permit`, `mayors_permit`, and `other`.

The server-required minimum is `business_permit` and `valid_id`. Document
statuses are `pending`, `verified`, `rejected`, and `expired`; they are separate
from the provider lifecycle.

Submission and review metadata includes server timestamps, reviewer UID,
remarks, and the distinct rejection, resubmission, and suspension reasons.
The immutable history authority is the backend-written `adminLogs` audit
stream. Client-written history entries are forbidden.

## Compatibility rules

- A missing legacy provider verification status is interpreted as `draft` only
  for display/model migration; an explicit unknown value is invalid.
- A missing legacy provider service type is interpreted as `catering`; an
  explicit unknown value is invalid.
- Missing activation flags never grant access in authorization helpers.
- Missing legacy schedule/capacity values use empty lists, `null`, `false`,
  `1`, or `0` as appropriate.
- `guestCapacity` is read as a compatibility alias for
  `maxGuestsPerEvent`.
- New writes use canonical names only.
