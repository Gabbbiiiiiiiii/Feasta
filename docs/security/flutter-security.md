# Flutter customer security

- Android release uses Play Integrity; debug builds use the App Check debug
  provider without a hardcoded token. Apple release uses App Attest.
- `USE_FIREBASE_EMULATORS=true` is rejected in profile and release builds.
- Release startup verifies the public Firebase project ID and displays a
  generic fail-closed screen if secure initialization fails.
- Firebase SDK owns Auth tokens and session persistence. Tokens, passwords,
  private keys, and server API keys are not stored in preferences or Dart
  defines.
- Customer addresses migrate from SharedPreferences into encrypted platform
  storage. Preferences retain only low-risk UI/onboarding/permission choices.
- Booking creation revalidates email verification, phone verification, role,
  active status, and blocked status. Firestore Rules enforce the same verified
  customer requirement.
- Active customer screens monitor their trusted user document and sign out
  immediately when the account becomes blocked, disabled, or changes role.
- Release logging omits exception details and stack traces. Debug logs mask
  email, phone, token, password, and secret-shaped text.
- PayMongo checkout URLs require HTTPS and a PayMongo-owned hostname. Incoming
  deep links are unsupported until a production app-link host is configured;
  the policy helper rejects non-HTTPS, user-info, and foreign-host links.
- Provider verification evidence uses private Firebase Storage. The unused
  legacy public Cloudinary verification uploader was removed. The customer app
  has no verification-document viewer, so screenshot exposure is not present.

Run `pnpm flutter:security:test` for fail-fast source-policy validation. The
pure Dart policy tests live under `test/security`; Phase 4 also runs Flutter
analysis and the complete backend rules and emulator regressions. On this
Windows environment the Flutter test runner can occasionally stall before test
discovery, so analysis and the deterministic source validation remain separate.
