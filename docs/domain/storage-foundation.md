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
| `bookings/{bookingId}/attachments/{fileName}` | Active booking participant | Booking participants or active admin | PDF, JPEG, PNG, WebP | 10 MB |
| `complaints/{complaintId}/evidence/{fileName}` | Active complaint creator | Creator, explicitly related provider, or active admin | PDF, JPEG, PNG, WebP | 10 MB |

Provider ownership is resolved through `providers/{providerId}.ownerId`.
Booking participants are the booking customer, the owner of its `providerId`,
or a provider whose linked ID appears in `providerIds`. Complaint evidence may
be read by the related provider because the provider must be able to respond to
evidence submitted against it; unrelated providers and customers are denied.

Profile and public provider assets may be replaced and deleted by their owner.
Verification, booking, and complaint files cannot be deleted by clients so an
audit trail remains. Verification file metadata is registered separately by
`registerVerificationDocument`; sensitive files do not require public URLs.

Verification document types are the canonical values in
`provider-verification.md`. Adding a new type requires updating Cloud Function
constants, Storage Rules, tests, and domain documentation together.
