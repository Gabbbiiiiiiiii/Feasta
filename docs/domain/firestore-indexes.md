# Firestore query and index policy

`firebase/firestore.indexes.json` is the deployable source of truth. It was
derived from the Flutter queries, Next.js server access, Cloud Functions, and
the supported admin query contract. Equality fields precede range/sort fields.

Single-field equality lookups such as `providers.ownerId`,
`providerVerifications.providerId`, and `providerVerifications.ownerId` use
Firestore's automatic single-field indexes; redundant one-field composite
indexes must not be added.

The committed composites cover:

- account lists by role/account status and newest creation time;
- provider verification, service type, city, featured state, ownership,
  visibility, and token search;
- verification queues;
- customer/provider event and provider-request lists;
- payment, notification, and complaint queues;
- active, non-deleted provider packages/add-ons and published reviews.

Run `firebase deploy --only firestore:indexes` after review. An index should be
removed when its query is removed; speculative combinations increase write
latency and storage cost.

See [pagination.md](pagination.md) for the query contract and
[soft-deletion.md](soft-deletion.md) for the required migration order.
