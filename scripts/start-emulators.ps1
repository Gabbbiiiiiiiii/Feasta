$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "firebase\emulator-data"
$metadata = Join-Path $dataDir "firebase-export-metadata.json"

$arguments = @(
  "--dir", "functions", "exec", "firebase", "emulators:start",
  "--config", "../firebase.json",
  "--project", "feasta-catering-system",
  "--only", "auth,firestore,functions,storage,hosting",
  "--export-on-exit", "../firebase/emulator-data"
)
if (Test-Path -LiteralPath $metadata) {
  $arguments += @("--import", "../firebase/emulator-data")
}

Push-Location $root
try {
  & pnpm.cmd @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
