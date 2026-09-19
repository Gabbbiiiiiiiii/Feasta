# Provider verification status transitions

The provider profile (`providers.verificationStatus`) and its application
(`providerVerifications.status`) use the same lifecycle value.

| From | To | Actor | Effect |
|---|---|---|---|
| `draft` | `submitted` | Owning provider through `submitProviderVerification` | Locks the current document set and keeps the provider inactive. |
| `resubmission_required` | `submitted` | Owning provider through `submitProviderVerification` | Submits the replacement document set and keeps the provider inactive. |
| `submitted` | `under_review` | Admin through `reviewProviderVerification` | Records the reviewer and keeps the provider inactive. |
| `under_review` | `approved` | Admin through `reviewProviderVerification` | Activates the provider and permits public discovery. |
| `under_review` | `rejected` | Admin through `reviewProviderVerification` | Records a final rejection and keeps the provider inactive. |
| `under_review` | `resubmission_required` | Admin through `reviewProviderVerification` | Keeps the provider inactive and re-enables document replacement. |
| `approved` | `suspended` | Admin through `reviewProviderVerification` | Deactivates the provider and removes public availability. |

All other transitions are rejected. In particular, `submitted` cannot skip
`under_review`, providers cannot review themselves, and `rejected` cannot be
used as a substitute for `resubmission_required`.

Provider lifecycle statuses are exactly:

```text
draft
submitted
under_review
resubmission_required
approved
rejected
suspended
```

The verification-document status values (`pending`, `verified`, `rejected`,
and `expired`) describe individual files and are intentionally separate from
the provider lifecycle.
