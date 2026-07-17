$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$nextBin = Join-Path $root "apps\web\node_modules\next\dist\bin\next"
$webPort = 53300
$webProcess = $null

if (!(Test-Path -LiteralPath $nextBin)) {
  throw "Next.js is not installed. Run pnpm install first."
}

$env:FIREBASE_ADMIN_PROJECT_ID = $env:GCLOUD_PROJECT
$env:FIREBASE_ADMIN_STORAGE_BUCKET = "$($env:GCLOUD_PROJECT).appspot.com"
$env:USE_FIREBASE_EMULATORS = "true"
$env:FIREBASE_FUNCTIONS_EMULATOR_HOST = "127.0.0.1:55001"
$env:PHASE3_WEB_URL = "http://127.0.0.1:$webPort"

Push-Location $root
try {
  $webProcess = Start-Process -FilePath "node.exe" `
    -ArgumentList @($nextBin, "dev", "-p", $webPort) `
    -WorkingDirectory (Join-Path $root "apps\web") `
    -WindowStyle Hidden `
    -PassThru

  & node functions/test/emulator/auth-web.integration.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Authentication/web acceptance test failed."
  }
} finally {
  if ($null -ne $webProcess -and !$webProcess.HasExited) {
    Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}
