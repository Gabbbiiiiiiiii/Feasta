$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:FIREBASE_FUNCTIONS_EMULATOR_HOST = "127.0.0.1:55201"

Push-Location $root
try {
  & node functions/test/emulator/provider-workflow.integration.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Provider workflow acceptance test failed."
  }
} finally {
  Pop-Location
}
