# FEASTA — Phase 1C Stage C: private Save Progress / Resume candidate

Scope: branch `feat/catering-package-enhancements`, based on `545fc0c10a95dada01244190b729f2c581b221d0`.

## Implemented in this patch

- Four Auth/App Check-protected callable exports: private save, get, list, discard.
- Ownership and provider status checked server-side for each operation.
- One private record per draft, optimistic revision updates, idempotent request ledger.
- Listing is owner-scoped, bounded to 20 records; deletion decreases quota transactionally.
- Recovery (read/list/discard) remains available during maintenance. Creation/update remains blocked during maintenance and if the server policy gate is disabled.
- Browser callable wrapper, provider Saved Progress section, Resume, Save Progress and Discard actions.
- Multi-occasion/Fits All intent, text fields, catering tier prices and service descriptions, and theme *text* saved for new unbound editor drafts.
- UI and API default **OFF** for browser: `NEXT_PUBLIC_PROVIDER_PACKAGE_EDITOR_PROGRESS_ENABLED` must be explicitly `true` in a reviewed local build.
- Server write gate default **OFF**: `contractPolicies/providerPackageV2.featureGates.packageEditorProgressWrites` must be explicitly true in an isolated emulator environment. Do not modify production policy.

## Limits and safety

- This is **editor progress**, not an actual FEASTA package draft. It does not affect the existing provider packages collection, publications, bookings or payments.
- This version does **not** attach images. The Web Save Progress action refuses to save if package images or theme images are present, rather than falsely claiming those will be restored. Do not upload images to work around this limit.
- Only *new unbound package editors* can use the feature. Existing package editing still uses the legacy writer, and binding a private progress draft to an existing package remains unsupported.
- Each provider is capped at 20 private drafts. Deletion is permanent and requires owner, matching revision, and valid idempotency key.
- The existing V2 canonical multi-occasion create/update, publication, public reader, customer pricing, and Flutter contracts remain gated.
- Do not use this code in production without verified native callable transport (including App Check and CORS), live policy/rules/index compatibility, auth-state handling, and manual Web create/save/refresh/resume/discard acceptance in a **local emulator**. The existing release remains NO-GO.
- Firebase Admin SDK bypasses Firestore client security rules: native callable security review, external Admin SDK isolation and rules regression must be separately verified.

## Local validation order

1. Apply the patch to clean commit `545fc0c1` using the guarded apply script.
2. Direct `tsc --noEmit` and compile from `functions/node_modules/typescript/bin/tsc` (skip `pnpm --dir functions build` due junction-backed install helper).
3. Run the structural parser tests and Firestore/Auth emulator suite with unique ports and `--project demo-feasta-phase1c`.
4. Execute Web typecheck and selected provider-package tests in the feature worktree without invoking package-manager install.
5. Before enabling browser feature, set up and verify a **separately isolated** local Functions emulator, callable auth and App Check transport, and the demo-only policy fixture. Never switch this feature on in production based only on raw-handler emulator tests.

Do not commit, push, merge, activate features or deploy automatically.
