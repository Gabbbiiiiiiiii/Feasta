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

## Document policy

The accepted document types are:

- `business_permit`
- `dti_registration`
- `bir_registration`
- `valid_id`
- `sanitary_permit`
- `mayors_permit`
- `other`

The current minimum FEASTA policy requires `business_permit` and `valid_id`.
This policy is defined in Cloud Functions constants and is not taken from a
client-controlled `isRequired` value. Any future policy change must update the
server constant and this document together.

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

## Submission and review

`submitProviderVerification` derives required types from the server policy,
requires complete pending document records with non-empty Storage paths, moves
both records to `submitted`, and keeps the provider inactive.

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
