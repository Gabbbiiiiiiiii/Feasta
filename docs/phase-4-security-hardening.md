# Phase 4 security hardening

Run the complete local security and regression suite with:

```text
pnpm phase4:verify
```

The command validates the 45-scenario adversarial coverage manifest, Flutter
release/security source policy, and the complete Phase 3 suite: builds, lint,
type checks, web security tests, Flutter analysis, App Check policy, secret
scan, Firestore and Storage Rules, rate limiting, idempotency, payment webhook,
Auth/session/provider workflows, emulator data round trips, and Hosting.

Security event fields and monitoring signals are documented in
`security/security-logging-and-monitoring.md`. Flutter release/session/storage
controls are documented in `security/flutter-security.md`. The scenario-to-test
mapping is maintained in `security/adversarial-test-matrix.md` and is checked by
`pnpm security:coverage`.

Production monitoring alerts, Secret Manager values, Vercel values, Firebase
App Check enforcement metrics, Play Integrity registration, and PayMongo
webhook configuration remain environment-owned deployment tasks. No production
credential is required by the local verification suite.
