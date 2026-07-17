$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$firebaseRoot = [System.IO.Path]::GetFullPath((Join-Path $root "firebase"))
$exportDir = [System.IO.Path]::GetFullPath((Join-Path $firebaseRoot "emulator-data-roundtrip"))

if (!$exportDir.StartsWith($firebaseRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an export directory outside firebase/."
}

if (Test-Path -LiteralPath $exportDir) {
  Remove-Item -LiteralPath $exportDir -Recurse -Force
}

Push-Location $root
try {
  & pnpm.cmd exec firebase emulators:exec `
    --config firebase.roundtrip.export.test.json `
    --project demo-feasta-phase3 `
    --only auth,firestore,storage `
    --export-on-exit $exportDir `
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/seed-and-validate-emulators.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Seed/export emulator run failed." }

  $metadata = Join-Path $exportDir "firebase-export-metadata.json"
  if (!(Test-Path -LiteralPath $metadata)) {
    throw "Emulator export metadata was not created."
  }

  & pnpm.cmd exec firebase emulators:exec `
    --config firebase.tooling.import.test.json `
    --project demo-feasta-phase3 `
    --only auth,firestore,storage `
    --import $exportDir `
    "node --experimental-strip-types scripts/validate-emulator-state.ts"
  if ($LASTEXITCODE -ne 0) { throw "Import validation emulator run failed." }

  Write-Host "Seed, export, fresh import, and imported-state validation passed."
} finally {
  Pop-Location
  if (Test-Path -LiteralPath $exportDir) {
    Remove-Item -LiteralPath $exportDir -Recurse -Force
  }
}
