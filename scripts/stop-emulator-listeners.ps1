param(
  [Parameter(Mandatory = $true)]
  [int[]]$Ports
)

$ErrorActionPreference = "Stop"
$stopped = @()

foreach ($port in ($Ports | Sort-Object -Unique)) {
  $matchingLines = netstat -ano -p tcp |
    Select-String -Pattern "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$"
  foreach ($line in $matchingLines) {
    if ($line.Line -notmatch "LISTENING\s+(\d+)\s*$") { continue }
    $processId = [int]$Matches[1]
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) { continue }
    if ($process.ProcessName -ne "java") {
      throw "Refusing to stop non-emulator process '$($process.ProcessName)' (PID $processId) on test port $port."
    }
    Stop-Process -Id $processId -Force
    $stopped += "$port/$processId"
  }
}

if ($stopped.Count -gt 0) {
  Write-Host "Stopped orphaned Firestore Emulator listeners: $($stopped -join ', ')."
}
