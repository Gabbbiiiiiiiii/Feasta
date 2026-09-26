# Storage foundation

FEASTA Storage paths use Firestore documents as the source of ownership. A
provider asset path always contains the provider document ID, never an assumed
owner UID. All limits below are enforced against the uploaded object's actual
size and MIME metadata by Storage Rules. Cloud Functions perform additional
checks for verification documents.

| Path | Write policy | Read policy | Types | Maximum |
|---|---|---|---|---:|
| `users/{uid}/profile/{fileName}` | Active owner; create, replace, and delete | Owner or active admin | JPEG, PNG, WebP | 5 MB |
| `providers/{providerId}/logo/{fileName}` | Active provider owner | Public | JPEG, PNG, WebP | 5 MB |
| `providers/{providerId}/cover/{fileName}` | Active provider owner | Public | JPEG, PNG, WebP | 10 MB |
| `providers/{providerId}/verification/{documentType}/{fileName}` | Active provider owner while verification is `draft` or `resubmission_required` | Provider owner or active admin | PDF, JPEG, PNG, WebP | 10 MB |
| `providers/{providerId}/packages/{fileName}` | Active provider owner | Public | JPEG, PNG, WebP | 10 MB |
| `bookings/{bookingId}/attachments/{fileName}` | Active booking participant; create only | Booking participants or active admin | PDF, JPEG, PNG, WebP | 10 MB |
| `complaints/{complaintId}/evidence/{fileName}` | Active complaint creator; create only | Creator, explicitly related provider, or active admin | PDF, JPEG, PNG, WebP | 10 MB |

Provider ownership is resolved through `providers/{providerId}.ownerId`.
Booking participants are the booking customer, the owner of its `providerId`,
or a provider whose linked ID appears in `providerIds`. Complaint evidence may
be read by the related provider because the provider must be able to respond to
evidence submitted against it; unrelated providers and customers are denied.

Profile and public provider assets may be replaced and deleted by their owner.
Verification objects may be created or replaced by their owner only while the
provider verification is `draft` or `resubmission_required`; client deletion is
always denied. Booking and complaint files cannot be overwritten or deleted by
clients. New unique file names remain preferred for corrections because they
preserve object-level history.
Verification file metadata is registered separately by
`registerVerificationDocument`; sensitive files do not require public URLs.

All protected writes require an active, unblocked Firestore user. Ownership is
resolved from the authenticated UID and Firestore records, never client custom
metadata; ownership-like custom metadata is rejected. Unknown types and HTML,
script, executable, archive, or generic binary uploads are denied because each
path uses an explicit MIME allowlist and requires a matching approved file-name
extension. Storage Rules can validate declared object metadata, not inspect file
bytes; verification registration additionally validates the stored object
server-side. Content scanning remains a backend concern. Sensitive verification
objects are never publicly readable.

Verification document types are the canonical values in
`provider-verification.md`. Adding a new type requires updating Cloud Function
constants, Storage Rules, tests, and domain documentation together.
