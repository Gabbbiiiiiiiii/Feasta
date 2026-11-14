# Google sign-in consent review

Status: ready for review; no commit, push, merge, deployment, backend change, or production registration test.

Google login panels (including modals) and the registration screen share a compact disclosure with separate Terms and Privacy links. Registration reuses its validated document snapshots without changing email registration checkboxes or submission requirements.

The Google tap captures detached documents and independent, untrimmed versions only when the disclosure is loaded and visible. Links open the captured full published documents on separate screens. After Google authentication, both documents are loaded again and compared in full. Missing, malformed, unavailable, or changed documents discard the pre-authentication acceptance.

A one-shot handoff is bound to the authenticated UID and authentication operation epoch. Only the existing strict missing-profile bootstrap path can submit acceptedTerms/acceptedPrivacy true and those exact versions. Established profiles keep ordinary synchronization; historical consent is not rewritten. The handoff is consumed even for existing accounts and cannot cross identities or session transitions.

Without usable pre-Google acceptance, onboarding shows compact policy cards with names, exact versions, full-document links, and one Agree and continue action. Backend policy failures retain the existing four strict error contracts and require fresh action. Existing identity guards, sign-out, restrictions, and callable/App Check paths are retained.

Validation:

- Entire isolated authentication suite: 285 tests passed.
- After final compact styling and an additional session-handoff test: all 60 consent widget, Google consent, and authentication navigation tests passed.
- Flutter analysis: 17 existing findings in unrelated files; none in changed files.
- git diff --check passed.

Tests cover new profile exact-version provisioning, established-account preservation, cancellation, unavailable/malformed policies, policy changes (including changed text with the same version), document links, independent versions, stale callbacks, and session/identity handoff invalidation. Native Google account selection was not exercised against production services.

The seven pre-existing desktop generated-plugin working-tree changes were left untouched.
