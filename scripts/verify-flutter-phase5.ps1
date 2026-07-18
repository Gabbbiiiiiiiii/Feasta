$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "apps\customer_mobile"

Push-Location $mobile
try {
  $phase5FormatTargets = @(
    "lib/core/theme",
    "lib/core/widgets",
    "lib/features/presentation/screens/login_screen.dart",
    "lib/features/presentation/screens/customer_register_screen.dart",
    "lib/features/customer/customer_search_screen.dart",
    "lib/features/customer/provider_profile_screen.dart",
    "lib/features/customer/customer_favorites_screen.dart",
    "lib/features/customer/customer_bookings_screen.dart",
    "test/core/widgets",
    "test/features/customer/representative_screen_migration_test.dart"
  )

  & dart format --output=none --set-exit-if-changed @phase5FormatTargets
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  # The repository still has documented legacy warnings and infos. Errors are
  # fatal; warning/info cleanup remains visible without blocking Phase 5.
  & flutter analyze --no-fatal-warnings --no-fatal-infos
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  # The full suite includes primitive, semantics, responsive, migration, and
  # runtime-security widget/unit coverage.
  & flutter test
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
