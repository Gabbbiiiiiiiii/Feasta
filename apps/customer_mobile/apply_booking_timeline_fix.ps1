$ErrorActionPreference = 'Stop'

$root = 'C:\flutterProject\feasta\apps\customer_mobile'
$statusFile = Join-Path $root 'lib\core\constants\status_constants.dart'
$repoFile = Join-Path $root 'lib\features\authentication\data\repositories\feasta_repository.dart'

if (!(Test-Path $statusFile)) { throw "Missing: $statusFile" }
if (!(Test-Path $repoFile)) { throw "Missing: $repoFile" }

Write-Host 'Creating backups...' -ForegroundColor Cyan
Copy-Item $statusFile "$statusFile.bak" -Force
Copy-Item $repoFile "$repoFile.bak" -Force

# 1) Add canonical in_progress constant without renaming existing statuses.
$status = Get-Content $statusFile -Raw
if ($status -notmatch "static const String inProgress\s*=\s*'in_progress';") {
    $anchor = "static const String confirmed = 'confirmed';"
    if ($status -notlike "*$anchor*") {
        throw "Could not find BookingStatus.confirmed in status_constants.dart"
    }
    $status = $status.Replace(
        $anchor,
        "$anchor`r`n  static const String inProgress = 'in_progress';"
    )
    Set-Content -Path $statusFile -Value $status -Encoding UTF8
    Write-Host 'Added BookingStatus.inProgress.' -ForegroundColor Green
} else {
    Write-Host 'BookingStatus.inProgress already exists.' -ForegroundColor DarkGray
}

# 2) Replace only bookingTimelines(...) in the repository.
$repo = Get-Content $repoFile -Raw
$pattern = '(?s)  Stream<QuerySnapshot<Map<String, dynamic>>> bookingTimelines\(\s*String bookingId,?\s*\) \{.*?\n  \}\r?\n\r?\n  Future<\(\{String paymentId, String checkoutUrl\}\)> createPaymentSession'
$replacement = @"
  Stream<QuerySnapshot<Map<String, dynamic>>> bookingTimelines(
    String bookingId,
  ) {
    return _db
        .collection(FirestoreCollections.mainEvents)
        .doc(bookingId)
        .collection('timeline')
        .orderBy('createdAt', descending: false)
        .limit(100)
        .snapshots();
  }

  Future<({String paymentId, String checkoutUrl})> createPaymentSession
"@

$updated = [regex]::Replace($repo, $pattern, $replacement, 1)
if ($updated -eq $repo) {
    throw "Could not locate the current bookingTimelines method. Repository backup was preserved."
}
Set-Content -Path $repoFile -Value $updated -Encoding UTF8
Write-Host 'Updated bookingTimelines to mainEvents/{bookingId}/timeline.' -ForegroundColor Green

Write-Host ''
Write-Host 'Formatting and analyzing...' -ForegroundColor Cyan
Set-Location $root

dart format `
  lib\core\constants\status_constants.dart `
  lib\features\authentication\data\repositories\feasta_repository.dart `
  lib\features\customer\booking_details_screen.dart

flutter analyze `
  lib\core\constants\status_constants.dart `
  lib\features\authentication\data\repositories\feasta_repository.dart `
  lib\features\customer\booking_details_screen.dart
