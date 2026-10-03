# Startup Issue Report

## Summary
The app startup path was vulnerable to hanging indefinitely during Firebase initialization and the splash-screen auth/Firestore bootstrap sequence. The blocking point was the splash screen flow in lib/screens/splash/splash_screen.dart, where several awaited async operations had no timeout, no logging, and no fallback path.

## Execution Flow
1. lib/main.dart initializes Flutter bindings and runs Firebase initialization.
2. lib/app.dart mounts the splash screen as the app home.
3. lib/screens/splash/splash_screen.dart runs _checkUser() inside initState().
4. _checkUser() checks:
   - the current Firebase auth user,
   - user reload state,
   - the Firestore user profile document,
   - provider verification status for provider accounts.
5. Based on the result, the app navigates to onboarding, login, email verification, phone verification, customer dashboard, provider dashboard, or admin dashboard.

## Where Startup Blocks
The startup flow can stop at these operations:
- Firebase initialization in lib/main.dart
- Auth reload in the splash flow
- Shared preferences initialization
- Firestore user profile lookup
- Provider verification lookup in lib/repositories/auth_repository.dart

## Why It Blocks
These operations were awaited directly without timeout handling, error recovery, or logging. If Firebase or Firestore is slow, unreachable, or fails, the splash screen can remain on the loading spinner forever and prevent the app from reaching its next screen.

## Changes Made
### Added startup guard helper
- Added lib/core/utils/startup_guard.dart
- This helper wraps startup steps with timeout protection and debug logging.

### Protected app entrypoint
- Updated lib/main.dart
- Firebase initialization is now wrapped in timeout protection and logging.

### Protected splash startup flow
- Updated lib/screens/splash/splash_screen.dart
- The splash flow now protects:
  - initial delay,
  - auth reload,
  - shared preferences access,
  - user profile lookup,
  - provider verification lookup.
- On failure or timeout, the app falls back to a safe route instead of hanging.

### Protected provider verification lookup
- Updated lib/repositories/auth_repository.dart
- The Firestore query for provider verification now has timeout protection and logging.

### Added regression tests
- Added test/startup_guard_test.dart
- Covers timeout fallback and successful completion paths.

## Verification
Verified with:
- flutter test test/startup_guard_test.dart
- flutter analyze lib/main.dart lib/app.dart lib/screens/splash/splash_screen.dart lib/repositories/auth_repository.dart lib/core/utils/startup_guard.dart

Result:
- 2 tests passed
- analyzer reported no issues
