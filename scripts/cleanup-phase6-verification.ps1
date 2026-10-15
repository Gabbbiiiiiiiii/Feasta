$ErrorActionPreference = "Stop"

$firestoreTestPorts = @(
  38080,
  48080,
  48280,
  48480,
  58080,
  58280,
  60880
)

& (Join-Path $PSScriptRoot "stop-emulator-listeners.ps1") `
  -Ports $firestoreTestPorts
