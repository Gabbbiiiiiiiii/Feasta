# Soft deletion and retention

Retained, user-facing records use:

```text
isDeleted: boolean
deletedAt: timestamp | null
deletedBy: uid | null
deletionReason: string | null
```

Providers, packages, add-ons, reviews, complaints, and announcements are
soft-deleted. A deletion sets `isDeleted=true`, a server timestamp, the actor,
and a non-empty reason. Public queries require `isDeleted=false`; owners and
admins retain the access allowed by security rules. Hard delete is denied.

Payments, payment events, admin logs, booking/provider-request status history,
and provider-verification audit history are immutable retention records. They
must never be soft- or hard-deleted. Redaction required by law must be handled
through an audited backend process without destroying financial or lifecycle
facts.

## Deployment order

Legacy documents may not have `isDeleted` or provider `searchTokens`. Firestore
does not return a missing field for `where('isDeleted', isEqualTo: false)`.

1. Configure Admin credentials for the intended Firebase project.
2. From `functions`, run `pnpm migrate:query-policy` (dry run).
3. Review counts, then run `pnpm migrate:query-policy -- --apply`.
4. Deploy indexes and wait until they are ready.
5. Deploy rules, Functions, and clients.

The migration is idempotent: it only fills missing deletion metadata and
search tokens. It does not change already-deleted records.
