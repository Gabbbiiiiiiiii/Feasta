param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("rules", "tooling", "auth-web", "provider", "payment")]
  [string]$Suite
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exitCode = 1

# Firebase CLI defaults function discovery to 10 seconds. The FEASTA export
# inventory can exceed that on a cold Windows emulator start.
if (-not $env:FUNCTIONS_DISCOVERY_TIMEOUT) {
  $env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
}

Push-Location $root
try {
  switch ($Suite) {
    "rules" {
      & pnpm.cmd --dir functions test:rules
      $exitCode = $LASTEXITCODE
    }
    "tooling" {
      & pnpm.cmd exec firebase emulators:exec `
        --config firebase.tooling.test.json `
        --project demo-feasta-phase3 `
        --only auth,firestore,storage `
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-emulator-tooling.ps1"
      $exitCode = $LASTEXITCODE
    }
    "auth-web" {
      & pnpm.cmd exec firebase emulators:exec `
        --config firebase.acceptance.json `
        --project demo-feasta-phase3 `
        --only auth,firestore,functions `
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-auth-web.ps1"
      $exitCode = $LASTEXITCODE
    }
    "provider" {
      & pnpm.cmd exec firebase emulators:exec `
        --config firebase.provider.test.json `
        --project demo-feasta-phase3 `
        --only auth,firestore,functions,storage `
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-provider-workflow.ps1"
      $exitCode = $LASTEXITCODE
    }
    "payment" {
      & pnpm.cmd exec firebase emulators:exec `
        --config firebase.payment.test.json `
        --project demo-feasta-phase3 `
        --only firestore `
        "node functions/test/emulator/payment-webhook.integration.cjs"
      $exitCode = $LASTEXITCODE
    }
  }
} finally {
  $ports = switch ($Suite) {
    "rules" { @(38080) }
    "tooling" { @(48080) }
    "auth-web" { @(58080) }
    "provider" { @(58280) }
    "payment" { @(60880) }
  }
  & powershell -NoProfile -ExecutionPolicy Bypass `
    -File scripts/stop-emulator-listeners.ps1 -Ports $ports
  Pop-Location
}

exit $exitCode
