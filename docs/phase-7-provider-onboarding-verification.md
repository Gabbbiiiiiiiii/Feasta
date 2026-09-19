# Phase 7 provider onboarding and verification

## Scope and architecture

Phase 7 extends the trusted provider registration and verification foundation
without changing its authorization boundary. Firebase Authentication identifies
the owner, `users/{uid}` fixes the `provider` role, and callable Functions in
`asia-southeast1` own provider creation, verification state, audit history, and
public visibility.

The browser presents onboarding and review state. It never grants provider or
administrator permissions. Next.js server guards, callable authorization,
Firestore Rules, and Storage Rules independently enforce the same decisions.

```text
Provider Auth account
  -> trusted provider identity
  -> resumable onboarding draft
  -> deterministic provider and verification records
  -> private document registration
  -> provider submission
  -> admin review
  -> approved public projection
```

Canonical field definitions and compatibility behavior remain documented in
`docs/domain/provider-onboarding-schema.md`. Verification transitions,
document policy, history, and visibility are documented in
`docs/domain/provider-verification.md`.

## Canonical model

Provider service types are `catering`, `addon`, and `both`. Provider
verification states are:

```text
draft
submitted
under_review
resubmission_required
approved
rejected
suspended
```

The only provider-controlled submission transitions are:

```text
draft -> submitted
resubmission_required -> submitted
```

Administrators control:

```text
submitted -> under_review
under_review -> approved
under_review -> rejected
under_review -> resubmission_required
approved -> suspended
```

Unknown roles, account states, provider states, document types, and document
states fail closed. Shared TypeScript and Flutter parsers preserve documented
legacy compatibility without converting unknown privileged values into access.

## Onboarding flow

The web onboarding shell has eight ordered steps:

1. Owner information
2. Business information
3. Services and event capabilities
4. Location and coverage
5. Capacity and schedule
6. Terms and consent
7. Verification documents
8. Review and submit

Steps are server-validated. The trusted draft callable stores normalized data
in the backend-only `providerOnboardingDrafts` collection. A provider may resume
after logout, revisit completed steps, and open only the first incomplete step.
Manual URL entry cannot skip required server validation. Approved providers do
not restart onboarding.

Owner and business emails are normalized. Philippine phone inputs accept local
`09...` and `+63...` forms and are stored in canonical `+63` format. Numeric
capacity and schedule values are bounded server-side; negative and impossible
values are rejected. Provider-declared schedule settings are planning inputs,
not trusted proof of live availability.

Logo and cover uploads use owner-specific Storage paths. Storage Rules validate
ownership, MIME type, size, and path. The draft callable verifies the actual
Storage object before persisting its path. Replacements are retry-safe and
obsolete objects are removed only after the new draft state is saved.

## Verification documents

Canonical document types are:

- `business_permit`
- `dti_registration` (the DTI or SEC registration slot)
- `bir_registration`
- `valid_id`
- `sanitary_permit`
- `mayors_permit`
- `other`

Required documents are derived from trusted service and business data. Clients
cannot choose `isRequired`. Private evidence accepts PDF, JPEG, PNG, or WebP up
to 10 MB at:

```text
providers/{providerId}/verification/{documentType}/{uniqueFileName}
```

The registration callable verifies the exact path, object existence, actual
content type, actual size, provider ownership, and editable state. A document
may be uploaded, replaced, or removed only while the parent is `draft` or
`resubmission_required`. Submitted and under-review evidence is locked.
Sensitive evidence has no public read path and does not require a public URL.

The admin document route verifies the current admin session, origin/CSRF policy
where applicable, provider linkage, and the requested private Storage path
before returning a bounded server response.

## Submission and administrative review

Submission revalidates:

- active, unblocked provider account;
- verified Firebase Auth email;
- provider ownership;
- all required profile sections;
- terms and privacy versions and trusted acceptance timestamps;
- required registered document types;
- actual private Storage object metadata;
- an allowed current lifecycle state.

Provider and verification records transition together. Submission is
idempotent and writes one audit event, notification, and immutable verification
history event per successful operation.

The admin queue is server-authorized and bounded. It supports status, service
type, date, and global search-token filters with stable cursor pagination.
Search operates on trusted denormalized tokens, not the visible page. Summary
counts use aggregation queries.

Review decisions execute transactionally and reject stale or conflicting
decisions. Approval rechecks required documents. Rejection, resubmission, and
suspension require meaningful remarks. Review metadata, reviewer UID,
timestamps, audit log, notification, and verification history are written by
the trusted backend.

## Verification history

Every registration, document upload/replacement/removal, submission, and admin
decision writes an immutable history entry below:

```text
providerVerifications/{verificationId}/history/{historyId}
```

Each entry links to its `adminLogs` record and includes the permitted actor,
transition, document metadata, remarks, and timestamp. Provider owners see
their permitted timeline and decision remarks. Administrators see the review
history and can follow structured audit references. No client can write or
delete history.

## Permission model

An unapproved provider may edit permitted onboarding fields, manage evidence
while editable, view its state, and maintain inactive draft packages.

An unapproved provider cannot:

- publish or activate packages;
- appear in public discovery;
- expose provider media publicly;
- receive a live provider request;
- accept or confirm bookings;
- create or collect payments;
- invoke approved-provider-only operations.

These restrictions are enforced by Functions, Firestore Rules, Storage Rules,
Next.js server guards, public query projections, booking submission, and
payment creation. Hiding navigation is only a usability measure.

## Public visibility

`providers.publiclyVisible` is a backend-owned projection. It is true only
when:

- verification is `approved`;
- the provider is active, not suspended, and not deleted;
- the linked owner has role `provider`;
- the owner account is active, unblocked, and linked back to the provider;
- required public business, service, and location fields exist.

Public list queries additionally constrain the canonical lifecycle fields.
Direct provider reads independently recheck owner state and public profile
readiness.

Public packages require `published`, active, `isPublished`, nondeleted, and
`providerPubliclyVisible` projections. Package publication itself requires a
currently public provider. Approval, rejection, resubmission, suspension,
blocking, and deactivation synchronize provider and package projections.

Flutter public streams reject cached snapshots and public detail reads use the
server. Server-rendered web discovery revalidates current data. Stale client
state cannot authorize access or restore a hidden provider.

## Security and privacy

- Provider and admin roles are loaded from trusted records.
- Provider ownership is checked on every protected operation.
- Providers cannot self-approve, self-activate, or write lifecycle fields.
- Verification documents remain private to the owner and active admins.
- App Check remains enforced for supported production callables and relaxed
  only by the documented emulator policy.
- Audit logs and history are immutable to clients.
- Credentials, document contents, tokens, and sensitive URLs are not logged.
- No service-account credential is exposed to browser or Flutter code.

## Verification

Run:

```text
pnpm phase7:verify
```

The command first verifies the Phase 7 evidence inventory, then composes
`phase6:verify`. Phase 6 already executes Phase 3-5 regressions, shared types,
Functions build/lint/tests, web lint/typecheck/components/accessibility/
responsive/build, Flutter checks, Rules, secrets, emulator tooling, provider
workflow, payments, authentication, hosting, and cleanup. Phase 7 does not
duplicate those suites.

The provider emulator workflow proves:

```text
register
-> verify email
-> complete onboarding
-> upload and register documents
-> submit
-> admin starts review
-> admin approves
-> provider becomes publicly discoverable
-> published package becomes discoverable
-> customer reads provider
```

It also proves rejection, resubmission, suspension, private-document access,
unsafe public-query denial, audit logs, notifications, and immutable history.

## Known limitations and release gates

- Production composite indexes must be deployed before production queue
  traffic uses the new query families.
- Provider visibility/package projection updates intentionally fail closed if
  a single provider owns more than the bounded transactional package batch;
  that operational case requires a controlled backend migration.
- Local emulator shutdown on Java 25 may print a Storage Rules runtime
  shutdown warning after tests pass; the verification command independently
  checks that dedicated listeners are gone.
- Deployment-dependent Phase 4 App Check enforcement and production bundle
  evidence remain open release gates. Local Phase 7 verification does not
  claim those gates are complete.

