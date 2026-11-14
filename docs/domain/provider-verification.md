# Provider registration and verification

Provider registration is a trusted, idempotent server workflow. Flutter may
create the Firebase Auth account, then calls `ensureProviderIdentity` to create
`users/{uid}` with the fixed `provider` role. It calls `registerProvider` only
after that identity exists. Clients never create `providers`,
`providerVerifications`, their document metadata, approvals, or audit records
directly.

`registerProvider` uses the caller UID as the deterministic provider and
verification ID for new registrations. In one Firestore transaction it creates
the provider in `draft`, creates its verification in `draft`, links
`users/{uid}.providerId`, and writes an audit log. A valid repeated call returns
the same IDs with `created=false`. Missing, cross-owner, or incomplete existing
links fail safely.

The canonical owner, business, operational-capacity, consent, and field-writer
contract is documented in
[`provider-onboarding-schema.md`](provider-onboarding-schema.md).

## Document policy

The accepted document types are:

- `business_permit`
- `dti_registration`
- `bir_registration`
- `valid_id`
- `sanitary_permit`
- `mayors_permit`
- `other`

The current FEASTA policy is server-derived:

- every provider requires `business_permit`, `dti_registration` (the canonical
  slot for DTI or SEC registration), `bir_registration`, and `valid_id`;
- catering and food-service providers additionally require either
  `sanitary_permit` or `mayors_permit`;
- venue providers require `mayors_permit`;
- `other` is optional supporting evidence.

The policy uses the trusted provider service type and canonical service
categories. It is never taken from client-controlled `isRequired` values.

Sensitive files use this private path:

```text
providers/{providerId}/verification/{documentType}/{uniqueFileName}
```

The owner uploads while the provider is in `draft` or
`resubmission_required`, then calls `registerVerificationDocument`. The callable
checks ownership, the exact provider/type path, Storage existence, actual object
metadata, and the parent status. Allowed content types are PDF, JPEG, PNG, and
WebP, with a 10 MB maximum. A public download URL is neither required nor stored.
Document metadata is server-written. Replacing a document preserves
`createdAt`, resets its review state to `pending`, and updates `updatedAt`.
The replaced private object is removed after the transaction. Providers remove
documents through `removeVerificationDocument`, which checks ownership and
allows removal only in `draft` or `resubmission_required`; direct Storage and
Firestore deletion remains denied. Submitted and under-review evidence is
locked until an administrator explicitly reopens the workflow.

The web UI receives only safe metadata such as type, status, and size. It does
not receive or persist public download URLs. Upload progress is local,
ephemeral UI state. File names, document contents, credentials, and identity
data are not written to application logs.

## Submission and review

`submitProviderVerification` requires an active, unblocked provider owner with
a currently verified Firebase Auth email. It revalidates the required profile
sections, trusted terms/privacy acceptance, dynamic document policy, registered
document status (`pending` or previously `verified`), private Storage path,
object existence, MIME type, and size. In one transaction it moves both records
from `draft` or `resubmission_required` to `submitted`, keeps the provider
inactive, writes an audit log, and creates an owner notification.

Submission is idempotent. Replaying the same idempotency key returns the stored
result; a new request received while both trusted records are already
`submitted` returns the existing normalized result without duplicate audit
logs or notifications. Only an administrator can move `submitted` to
`under_review`.

The verification record snapshots the trusted terms/privacy versions and
server-generated acceptance timestamps from `users/{uid}` when registration
is created.

An active admin uses `reviewProviderVerification` with one of these actions:

- `start_review`
- `approve`
- `reject`
- `require_resubmission`
- `suspend`

The callable enforces the lifecycle in
`provider-verification-status-transitions.md`, updates the provider and
verification atomically, writes an audit log, and notifies the owner. Rejection,
resubmission, and suspension require a reason. Approval activates public
availability; rejection and resubmission keep it inactive; suspension disables
an approved provider.

The server-protected provider status page covers all canonical states. Draft
and resubmission states link to the editable verification workflow; submitted
and under-review states remain read-only; approved links to the provider
dashboard. Rejection, resubmission, and suspension reasons are shown only in
their corresponding states. General review remarks are shown only while under
review.

## Admin verification queue

`/admin/providers` is protected by the server-side admin account guard. The
queue includes legacy `pending`, canonical `submitted`, and `under_review`
applications. Search, status, service type, and application-date filters are
executed by bounded Admin SDK queries rather than filtering the visible page.
Results use a page size of 20 and opaque `(createdAt, document ID)` cursors in
stable descending order.

Search uses trusted, denormalized `searchTokens` on
`providerVerifications/{verificationId}`. New provider registrations populate
tokens for provider ID, business name/contact details, owner name/contact
details, and service fields. Existing records can be prepared with the
query-policy migration:

```text
pnpm --dir functions migrate:query-policy
pnpm --dir functions migrate:query-policy -- --apply
```

The first command is a dry run. The applying command must be run only against
the intended project after review. Composite indexes for status, service type,
search tokens, and `createdAt` must be deployed before enabling the production
queue. Queue summary cards use Firestore aggregation counts and do not load
entire collections.

## Immutable history and public visibility

Every registration, document upload/replacement/removal, submission, and
administrative decision creates an immutable
`providerVerifications/{verificationId}/history/{historyId}` record in the
same transaction as its audit log. History stores status transitions,
permitted remarks, document type/status, actor identifiers, and the related
`adminLogs` document ID. Provider owners may read their own timeline; admins
may read the complete timeline and follow the audit reference. Clients cannot
create, edit, or delete history.

`providers.publiclyVisible` is a backend-owned discovery projection. It is
true only when the provider is approved, active, not suspended/deleted, has
the required public profile fields, and its owner account is an active,
unblocked provider account whose `providerId` links back to that provider.
Review decisions, provider deactivation, and
user-security-state changes update this projection. Public provider queries
must include `publiclyVisible == true` in addition to the canonical lifecycle
filters. Firestore and Storage Rules independently recheck provider and owner
state.

Public packages require `status == published`, `isActive == true`,
`isPublished == true`, `providerPubliclyVisible == true`, a non-null
`publishedAt`, and a publicly eligible provider. Suspension removes provider
and package projections from discovery. Mobile discovery ignores cached
snapshots and server-loads public detail records so stale offline data cannot
restore forbidden visibility.
