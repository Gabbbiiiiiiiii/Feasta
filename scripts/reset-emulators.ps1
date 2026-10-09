param([switch]$RemoveExport)

$ErrorActionPreference = "Stop"
$projectId = if ($env:GCLOUD_PROJECT) { $env:GCLOUD_PROJECT } else { "feasta-catering-system" }
$root = Split-Path -Parent $PSScriptRoot
$authHost = if ($env:FIREBASE_AUTH_EMULATOR_HOST) { $env:FIREBASE_AUTH_EMULATOR_HOST } else { "127.0.0.1:9099" }
$firestoreHost = if ($env:FIRESTORE_EMULATOR_HOST) { $env:FIRESTORE_EMULATOR_HOST } else { "127.0.0.1:8080" }
$storageHost = if ($env:FIREBASE_STORAGE_EMULATOR_HOST) { $env:FIREBASE_STORAGE_EMULATOR_HOST } else { "127.0.0.1:9199" }

foreach ($hostAndPort in @($authHost, $firestoreHost, $storageHost)) {
  if ($hostAndPort -notmatch '^(127\.0\.0\.1|localhost):\d+$') {
    throw "Refusing to reset a non-local emulator endpoint: $hostAndPort"
  }
}

$endpoints = @(
  "http://$authHost/emulator/v1/projects/$projectId/accounts",
  "http://$firestoreHost/emulator/v1/projects/$projectId/databases/(default)/documents"
)

foreach ($endpoint in $endpoints) {
  try {
    Invoke-RestMethod -Method Delete -Uri $endpoint | Out-Null
  } catch {
    throw "Could not clear emulator endpoint $endpoint. Start the emulators first. $($_.Exception.Message)"
  }
}

Push-Location $root
try {
  $env:GCLOUD_PROJECT = $projectId
  $env:FIREBASE_STORAGE_EMULATOR_HOST = $storageHost
  & pnpm.cmd --dir functions exec node test/clear-storage-emulator.cjs
  if ($LASTEXITCODE -ne 0) {
    throw "Could not clear Storage Emulator data."
  }
} finally {
  Pop-Location
}

if ($RemoveExport) {
  $dataDir = [System.IO.Path]::GetFullPath((Join-Path $root "firebase\emulator-data"))
  $allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $root "firebase"))
  if (!$dataDir.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove an export directory outside firebase/."
  }
  if (Test-Path -LiteralPath $dataDir) {
    Remove-Item -LiteralPath $dataDir -Recurse -Force
  }
}

Write-Host "Cleared Auth, Firestore, and Storage emulator data."
