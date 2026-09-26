$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "apps\customer_mobile"

Push-Location $mobile
try {
  & flutter analyze --no-fatal-warnings --no-fatal-infos
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & flutter test test/registration_rollback_test.dart
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
