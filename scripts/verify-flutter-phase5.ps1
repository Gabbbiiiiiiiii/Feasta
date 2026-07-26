$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "apps\customer_mobile"
$knownDiagnosticCeiling = 53

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

  # Errors remain fatal. The documented warning/info baseline is allowed, but
  # a net increase beyond the known ceiling fails the verification command.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $analysisOutput = @(
      & flutter analyze --no-fatal-warnings --no-fatal-infos 2>&1
    )
    $analysisExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $analysisOutput | ForEach-Object { Write-Host "$_" }
  if ($analysisExitCode -ne 0) { exit $analysisExitCode }

  $diagnosticCount = 0
  foreach ($line in $analysisOutput) {
    if ("$line" -match "(\d+)\s+issues?\s+found") {
      $diagnosticCount = [int]$Matches[1]
    }
  }
  if ($diagnosticCount -gt $knownDiagnosticCeiling) {
    Write-Error "Flutter analyzer diagnostics increased to $diagnosticCount; the allowed legacy ceiling is $knownDiagnosticCeiling."
    exit 1
  }
  Write-Host "Flutter analyzer diagnostic baseline: $diagnosticCount/$knownDiagnosticCeiling (errors remain fatal)."

  # The full suite includes primitive, semantics, responsive, migration, and
  # runtime-security widget/unit coverage.
  & flutter test
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
