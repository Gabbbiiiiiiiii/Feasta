$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  & node --experimental-strip-types scripts/seed-emulators.ts
  if ($LASTEXITCODE -ne 0) { throw "Seed command failed." }

  & node --experimental-strip-types scripts/validate-emulator-state.ts
  if ($LASTEXITCODE -ne 0) { throw "Seed state validation failed." }
} finally {
  Pop-Location
}
