# FEASTA Firestore collections

Collection names are case-sensitive. A rename requires coordinated shared
types, Dart constants, rules, indexes, Functions, documentation, and data
migration changes.

## Canonical top-level collections

| Collection | Purpose | Primary authority |
|---|---|---|
| `users` | Authentication, role, and account state | Auth/backend |
| `customers` | Private customer profile | Customer/backend |
| `providers` | Provider business and visibility state | Provider/backend |
| `providerVerifications` | Provider verification application | Provider/admin backend |
| `packages` | Provider packages | Provider |
| `menuItems` | Provider menu catalog | Provider |
| `addons` | Provider add-on services | Provider |
| `mainEvents` | Overall customer event/booking aggregate | Customer/backend |
| `providerRequests` | Request to one selected provider | Participants/backend |
| `payments` | Canonical financial records | Payment backend |
| `chatRooms` | Participant conversations | Participants |
| `reviews` | Completed-event reviews | Customer/backend |
| `favorites` | Customer favorite providers | Customer |
| `notifications` | User notifications | Backend |
| `complaints` | Complaint case record | Creator/admin backend |
| `reports` | Administrative reports | Backend/admin |
| `adminLogs` | Immutable administrative audit log | Backend |
| `announcements` | Platform announcements | Admin |
| `bookingRecoveryOffers` | Replacement-provider offers | Backend/participants |
| `appSettings` | Public and private application settings | Admin |
| `rateLimits` | Transactional abuse counters | Backend only |
| `idempotencyKeys` | Operation leases and replay results | Backend only |

## Event relationship

```text
mainEvents/{mainEventId}
|-- customerId
|-- event information and eventDate
|-- aggregate status
|-- estimated total cost
`-- selected provider references

providerRequests/{providerRequestId}
|-- mainEventId
|-- customerId
|-- providerId
|-- providerRequestType
|-- packageId and selectedAddons
|-- status and pricing
`-- payment summary

payments/{paymentId}
|-- mainEventId
|-- providerRequestId
|-- customerId and providerId
|-- status and amount
`-- payment-provider metadata
```

One provider rejection changes only its request. It does not implicitly cancel
the entire `mainEvents` aggregate.

## Subcollections

| Parent | Subcollection | Purpose |
|---|---|---|
| `mainEvents/{mainEventId}` | `timeline` | Event timeline |
| `mainEvents/{mainEventId}` | `statusHistory` | Immutable event status history |
| `providerRequests/{providerRequestId}` | `statusHistory` | Immutable request history |
| `chatRooms/{chatRoomId}` | `messages` | Conversation messages |
| `providerVerifications/{verificationId}` | `documents` | Registered document metadata |
| `complaints/{complaintId}` | `activity` | Complaint activity history |

## Deterministic IDs

Firestore-generated IDs remain the default unless uniqueness or idempotency
requires a stable ID.

| Collection | Stable ID policy |
|---|---|
| `customers` | `{uid}` |
| New `providers` | `{ownerUid}` |
| New `providerVerifications` | `{ownerUid}` |
| `favorites` | `{customerId}_{providerId}` |
| `chatRooms` | `{providerRequestId}` when one room per request |
| `reviews` | `{mainEventId}_{customerId}` |
| `rateLimits` | SHA-256 of scope, subject, and window |
| `idempotencyKeys` | SHA-256 of operation, actor, and caller key/payload |

## Naming rules

- Use plural camelCase top-level names.
- Use `mainEventId`, not `bookingId`, in new canonical aggregates.
- Use `status` for the collection's canonical lifecycle field.
- Do not create aliases such as both `recoveryOffers` and
  `bookingRecoveryOffers`.
- Chat messages belong under `chatRooms/{chatRoomId}/messages`.
- New history belongs in the canonical status-history subcollections.
- Provider-request state must not be stored as the main-event state.

## Legacy collections pending migration

| Legacy collection | Current compatibility use | Canonical replacement |
|---|---|---|
| `bookings` | Older Flutter booking records | `mainEvents` |
| `bookingProviderRequests` | Older planned request name | `providerRequests` |
| `addonRequests` | Older external add-on requests | `providerRequests` |
| `bookingTimelines` | Older top-level history | Canonical timeline/history subcollections |
| top-level `messages` | Historical chat shape | `chatRooms/{chatRoomId}/messages` |

Legacy paths must not be deleted until Flutter, Functions, rules, indexes, and
production data have migrated. New Next.js and Cloud Function workflows use
canonical collections.

## Change checklist

Any collection/schema change must update, where applicable:

- `packages/shared-types/src/collections.ts`;
- Flutter Firestore collection constants;
- Firestore and Storage Rules;
- `firebase/firestore.indexes.json`;
- Cloud Functions and web server code;
- emulator seeds and tests;
- domain documentation and migration tooling.
