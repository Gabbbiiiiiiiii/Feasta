$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  & node --experimental-strip-types scripts/validate-emulator-state.ts --create-unrelated-sentinel
  if ($LASTEXITCODE -ne 0) { throw "Unrelated sentinel creation failed." }

  & node --experimental-strip-types scripts/seed-emulators.ts
  if ($LASTEXITCODE -ne 0) { throw "First seed command failed." }

  & node --experimental-strip-types scripts/seed-emulators.ts
  if ($LASTEXITCODE -ne 0) { throw "Idempotent seed replay failed." }

  & node --experimental-strip-types scripts/validate-emulator-state.ts
  if ($LASTEXITCODE -ne 0) { throw "Seed validation failed." }

  & node --experimental-strip-types scripts/clear-auth-emulator-fixtures.ts
  if ($LASTEXITCODE -ne 0) { throw "Targeted fixture cleanup failed." }

  & node --experimental-strip-types scripts/validate-emulator-state.ts --expect-fixtures-empty
  if ($LASTEXITCODE -ne 0) { throw "Targeted fixture cleanup validation failed." }

  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reset-emulators.ps1
  if ($LASTEXITCODE -ne 0) { throw "Reset command failed." }

  & node --experimental-strip-types scripts/validate-emulator-state.ts --expect-empty
  if ($LASTEXITCODE -ne 0) { throw "Reset validation failed." }
} finally {
  Pop-Location
}
