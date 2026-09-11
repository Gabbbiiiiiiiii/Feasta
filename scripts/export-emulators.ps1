$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "firebase\emulator-data"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

Push-Location $root
try {
  & pnpm.cmd --dir functions exec firebase emulators:export ../firebase/emulator-data --project feasta-catering-system --force
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
