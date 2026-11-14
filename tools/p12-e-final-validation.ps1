param(
  [switch]$PreflightOnly
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom
$root = Split-Path -Parent $PSScriptRoot

$docs = @(
  "docs/domain/payment-status-transitions.md",
  "docs/domain/payment-schema.md",
  "docs/domain/payment-business-contract.md",
  "docs/domain/payments.md",
  "docs/domain/provider-finance-and-payouts.md",
  "docs/domain/cancellation-refund-hardening.md"
)

$customerTests = @(
  "test/components/customer-payment-receipt-ui.test.tsx",
  "test/components/customer-payment-receipt-service-contract.test.tsx",
  "test/components/customer-payment-refund-history-wiring.test.tsx",
  "test/components/customer-payments.test.tsx"
)

$providerTests = @(
  "test/components/provider-earnings-statement-ui.test.tsx",
  "test/components/provider-earnings-statement-ui-wiring.test.tsx",
  "test/components/provider-earnings-statement-service-contract.test.tsx"
)

$adminTests = @(
  "test/components/admin-financial-report-ui.test.tsx",
  "test/components/admin-financial-report-service-contract.test.tsx",
  "test/components/admin-financial-report-integration-wiring.test.tsx",
  "test/components/admin-report-export.test.tsx",
  "test/components/admin-reports-integration.test.tsx"
)

$adminDomainTest = "test/components/admin-financial-report-domain.test.ts"

$backendTests = @(
  "test/payment-gateway-fee-evidence.test.cjs",
  "test/payment-gateway-fee-wiring.test.cjs",
  "test/financial-ledger.test.cjs",
  "test/financial-ledger-domain.test.cjs",
  "test/financial-ledger-wiring.test.cjs",
  "test/financial-ledger-reversal.test.cjs",
  "test/financial-ledger-refund-wiring.test.cjs",
  "test/provider-earning-domain.test.cjs",
  "test/provider-earning-wiring.test.cjs",
  "test/provider-settlement-domain.test.cjs",
  "test/provider-settlement-wiring.test.cjs",
  "test/provider-settlement-management.test.cjs",
  "test/provider-settlement-capability.test.cjs",
  "test/provider-settlement-capability-wiring.test.cjs",
  "test/provider-settlement-wallet-wiring.test.cjs",
  "test/provider-settlement-refund-wiring.test.cjs",
  "test/provider-finance-settlement-ui-wiring.test.cjs",
  "test/payment-settlement.test.cjs",
  "test/webhook-settlement-wiring.test.cjs",
  "test/provider-payout-readiness-wiring.test.cjs",
  "test/admin-payout-attempt-evidence-ui-wiring.test.cjs",
  "test/refund-accounting-domain.test.cjs",
  "test/refund-allocation-domain.test.cjs",
  "test/refund-execution-domain.test.cjs",
  "test/refund-operation-plan.test.cjs",
  "test/refund-operation-set.test.cjs",
  "test/refund-status-reader-migration.test.cjs",
  "test/multi-payment-refund-approval-wiring.test.cjs",
  "test/multi-payment-refund-execution-wiring.test.cjs"
)

$webLintFiles = @(
  "src/app/customer/payments/actions.ts",
  "src/app/customer/payments/[paymentId]/receipt/page.tsx",
  "src/app/provider/payments/provider-finance-panel.tsx",
  "src/app/provider/payments/statements/page.tsx",
  "src/app/provider/payments/statements/provider-earnings-statement-client.tsx",
  "src/components/customer/payments/customer-payment-receipt.tsx",
  "src/components/customer/payments/customer-payments-client.tsx",
  "src/components/admin/reports/admin-financial-report-summary.tsx",
  "src/components/admin/reports/admin-reports-executive-client.tsx",
  "src/lib/customer/payments/customer-payment-service.ts",
  "src/lib/customer/payments/customer-payment-types.ts",
  "src/lib/provider/payments/provider-earnings-statement-service.ts",
  "src/lib/provider/payments/provider-earnings-statement-types.ts",
  "src/lib/admin/reports/admin-financial-report-domain.ts",
  "src/lib/admin/reports/admin-financial-report-service.ts",
  "src/lib/admin/reports/admin-financial-report-types.ts",
  "src/lib/admin/reports/admin-report-excel.ts",
  "src/lib/admin/reports/admin-report-export.ts",
  "src/lib/admin/reports/admin-report-service.ts",
  "src/lib/admin/reports/admin-report-types.ts"
)

$functionsLintFiles = @(
  "src/payments/payment-security.ts",
  "src/payments/process-webhook.ts",
  "src/payments/financial-ledger-domain.ts",
  "src/payments/financial-ledger.ts",
  "src/payments/payment-settlement.ts",
  "src/payments/request-refund.ts",
  "src/provider-finance/provider-earning-domain.ts",
  "src/provider-finance/provider-settlement-capability.ts",
  "src/provider-finance/provider-settlement-domain.ts",
  "src/provider-finance/provider-settlement-management.ts",
  "src/refunds/inspect-refund-reconciliation.ts",
  "src/refunds/refund-accounting-domain.ts",
  "src/refunds/refund-accounting.ts",
  "src/refunds/refund-allocation-domain.ts",
  "src/refunds/refund-execution.ts",
  "src/refunds/refund-operation-plan.ts",
  "src/refunds/refund-operation-set.ts"
)

$requiredPaths = @(
  "package.json",
  "apps/web/package.json",
  "apps/web/vitest.config.ts",
  "functions/package.json",
  "packages/shared-types/package.json",
  "packages/shared-types/src/enums.ts",
  "packages/shared-types/test/payment.test.mjs",
  "packages/shared-types/test/refund-policy.test.mjs",
  "firebase/firestore.rules",
  "functions/test/rules/firestore.rules.test.cjs"
)
$requiredPaths += $docs
$requiredPaths += $customerTests | ForEach-Object { "apps/web/$_" }
$requiredPaths += $providerTests | ForEach-Object { "apps/web/$_" }
$requiredPaths += $adminTests | ForEach-Object { "apps/web/$_" }
$requiredPaths += "apps/web/$adminDomainTest"
$requiredPaths += $backendTests | ForEach-Object { "functions/$_" }
$requiredPaths += $webLintFiles | ForEach-Object { "apps/web/$_" }
$requiredPaths += $functionsLintFiles | ForEach-Object { "functions/$_" }

Push-Location $root
try {
  $missingPaths = @(
    $requiredPaths |
      Sort-Object -Unique |
      Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }
  )
  if ($missingPaths.Count -gt 0) {
    throw "P12-E preflight missing required files:`n$($missingPaths -join "`n")"
  }

  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to determine the current Git branch."
  }
  if ($branch -ne "chore/monorepo-setup") {
    throw "P12-E must run on chore/monorepo-setup; current branch is $branch."
  }

  Write-Host "P12-E preflight passed on $branch."
  if ($PreflightOnly) {
    exit 0
  }

  $results = [ordered]@{}
  $failures = New-Object System.Collections.Generic.List[string]

  function Invoke-External {
    param(
      [Parameter(Mandatory = $true)]
      [string]$FilePath,
      [Parameter(Mandatory = $true)]
      [string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & $FilePath @Arguments 2>&1 | ForEach-Object {
        Write-Host "$_"
      }
      $exitCode = [int]$LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    return $exitCode
  }

  function Assert-ExternalSuccess {
    param(
      [Parameter(Mandatory = $true)]
      [string]$FilePath,
      [Parameter(Mandatory = $true)]
      [string[]]$Arguments,
      [Parameter(Mandatory = $true)]
      [string]$Description
    )

    $code = Invoke-External -FilePath $FilePath -Arguments $Arguments
    if ($code -ne 0) {
      throw "$Description exited with code $code."
    }
  }

  function Assert-Regex {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Text,
      [Parameter(Mandatory = $true)]
      [string]$Pattern,
      [Parameter(Mandatory = $true)]
      [string]$Description
    )

    if (-not [regex]::IsMatch(
      $Text,
      $Pattern,
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )) {
      throw "Missing contract evidence: $Description"
    }
  }

  function Invoke-Gate {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Name,
      [Parameter(Mandatory = $true)]
      [scriptblock]$Action
    )

    Write-Host "`n=== $Name ==="
    try {
      & $Action
      $results[$Name] = 0
      Write-Host "PASS: $Name"
    } catch {
      $results[$Name] = 1
      $failures.Add("$Name - $($_.Exception.Message)")
      Write-Host "FAIL: $Name - $($_.Exception.Message)"
    }
  }

  Invoke-Gate "Docs contract" {
    $statusDoc = Get-Content -Raw -LiteralPath $docs[0]
    foreach ($status in @(
      "pending",
      "processing",
      "paid",
      "partially_refunded",
      "failed",
      "expired",
      "refunded"
    )) {
      Assert-Regex $statusDoc ([regex]::Escape("``$status``")) "status $status"
    }
    Assert-Regex $statusDoc 'pending.*processing.*paid.*failed.*expired' "pending transitions"
    Assert-Regex $statusDoc 'processing.*paid.*failed.*expired' "processing transitions"
    Assert-Regex $statusDoc 'failed.*processing' "failed retry transition"
    Assert-Regex $statusDoc 'expired.*processing' "expired retry transition"
    Assert-Regex $statusDoc 'paid.*partially_refunded.*refunded' "paid refund transitions"
    Assert-Regex $statusDoc 'partially_refunded.*refunded' "partial-to-full refund transition"
    Assert-Regex $statusDoc 'refunded.*none' "refunded terminal state"

    $allDocs = ($docs | ForEach-Object { Get-Content -Raw -LiteralPath $_ }) -join "`n"
    foreach ($phrase in @(
      "multi",
      "commission",
      "Provider VAT",
      "FEASTA VAT",
      "Provider earning",
      "observed",
      "zero",
      "missing",
      "Payment Receipt",
      "Provider Earnings Statement",
      "Financial Report",
      "Financial Export",
      "Asia/Manila",
      "fail-closed"
    )) {
      Assert-Regex $allDocs ([regex]::Escape($phrase)) "documentation phrase $phrase"
    }
    Assert-Regex $allDocs 'missing[\s\S]{0,180}(null|absent|unavailable)[\s\S]{0,180}(never|must not)[\s\S]{0,80}zero' "missing fee evidence is never zero"
    Assert-Regex $allDocs 'gateway processing fee[\s\S]{0,250}separate[\s\S]{0,350}commission[\s\S]{0,350}VAT[\s\S]{0,350}Provider earning[\s\S]{0,350}refund allocation[\s\S]{0,350}settlement[\s\S]{0,350}payout' "gateway-fee separation"
    Assert-Regex $allDocs 'Customer-paid truth is not Provider-paid truth' "customer-paid truth separation"
    Assert-Regex $allDocs 'Refund truth is not payout truth' "refund truth separation"
    Assert-Regex $allDocs 'Provider earning truth is not settlement truth' "earning truth separation"
    Assert-Regex $allDocs 'settlement truth is not payout transport truth' "settlement transport truth separation"
  }

  Invoke-Gate "Firestore security" {
    $emulatorPorts = @(38080, 39199, 34400, 34500)
    foreach ($port in $emulatorPorts) {
      $existingListener = Get-NetTCPConnection `
        -LocalPort $port `
        -State Listen `
        -ErrorAction SilentlyContinue
      if ($null -ne $existingListener) {
        throw "Required Firebase emulator port $port is already in use."
      }
    }

    try {
      Assert-ExternalSuccess "pnpm" @(
        "--dir", "functions", "exec", "firebase", "emulators:exec",
        "--config", "../firebase.test.json",
        "--project", "demo-feasta-phase3",
        "--only", "firestore,storage",
        "node --test --test-concurrency=1 test/rules/firestore.rules.test.cjs"
      ) "Firestore finance security tests"
    } finally {
      # Firebase Storage rules runtime 1.1.3 can terminate noisily on Windows
      # and leave an emulator child listening after emulators:exec returns.
      # Stop only listeners created on this gate's previously free ports.
      foreach ($port in $emulatorPorts) {
        $listener = Get-NetTCPConnection `
          -LocalPort $port `
          -State Listen `
          -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $listener) {
          Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        }
      }
    }

    $rules = Get-Content -Raw -LiteralPath "firebase/firestore.rules"
    foreach ($collection in @(
      "providerEarnings",
      "providerSettlements",
      "providerPayoutAttempts"
    )) {
      Assert-Regex $rules (
        "match\s+/$collection/\{[^}]+\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;"
      ) "$collection client isolation"
    }
    Assert-Regex $rules 'match\s+/financialLedgerEntries/\{[^}]+\}[\s\S]{0,800}allow\s+read:\s*if\s+isAdmin\(\);[\s\S]{0,160}allow\s+create,\s*update,\s*delete:\s*if\s+false;' "immutable admin-readable financial ledger"
  }

  Invoke-Gate "Server authority" {
    $reportingFiles = @(
      $webLintFiles |
        Where-Object {
          $_ -match 'receipt|statement|admin-financial-report|admin-report-(excel|export|service|types)'
        } |
        ForEach-Object { Join-Path "apps/web" $_ }
    )
    $mutationPattern = '\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\('
    foreach ($path in $reportingFiles) {
      $source = Get-Content -Raw -LiteralPath $path
      if ([regex]::IsMatch($source, $mutationPattern)) {
        throw "Executable client mutation API found in reporting surface: $path"
      }
    }
    foreach ($service in @(
      "apps/web/src/lib/customer/payments/customer-payment-service.ts",
      "apps/web/src/lib/provider/payments/provider-earnings-statement-service.ts",
      "apps/web/src/lib/admin/reports/admin-financial-report-service.ts"
    )) {
      Assert-Regex (Get-Content -Raw -LiteralPath $service) 'server-only' "server-only boundary in $service"
    }
  }

  Invoke-Gate "Gateway-fee separation" {
    Assert-ExternalSuccess "pnpm" @(
      "--dir", "functions", "exec", "node", "--test",
      "test/payment-gateway-fee-evidence.test.cjs",
      "test/payment-gateway-fee-wiring.test.cjs"
    ) "gateway-fee evidence tests"
  }

  Invoke-Gate "Terminology" {
    $forbidden = 'Official Receipt|Official Invoice|Sales Invoice|BIR Invoice|Tax Invoice'
    $applicationFiles = Get-ChildItem -LiteralPath "apps/web/src" -Recurse -File |
      Where-Object { $_.Extension -in @(".ts", ".tsx") }
    foreach ($file in $applicationFiles) {
      $source = Get-Content -Raw -LiteralPath $file.FullName
      if ([regex]::IsMatch($source, $forbidden, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        throw "Forbidden FEASTA-generated document label in $($file.FullName)"
      }
    }
    $businessContract = Get-Content -Raw -LiteralPath "docs/domain/payment-business-contract.md"
    Assert-Regex $businessContract 'FEASTA does not[\s\S]{0,120}Official Receipt[\s\S]{0,160}Official Invoice[\s\S]{0,160}Sales Invoice[\s\S]{0,160}BIR[\s\S]{0,160}Tax Invoice' "terminology disclaimer"
  }

  Invoke-Gate "Payout fail-closed" {
    Assert-ExternalSuccess "pnpm" @(
      "--dir", "functions", "exec", "node", "--test",
      "test/provider-settlement-capability.test.cjs",
      "test/provider-settlement-capability-wiring.test.cjs"
    ) "settlement capability tests"
  }

  Invoke-Gate "Shared contracts" {
    Assert-ExternalSuccess "pnpm" @("--dir", "packages/shared-types", "build") "shared-types build"
    Assert-ExternalSuccess "pnpm" @(
      "--dir", "packages/shared-types", "exec", "node", "--test",
      "test/payment.test.mjs",
      "test/refund-policy.test.mjs"
    ) "shared payment/refund contract tests"
  }

  Invoke-Gate "Web TypeScript" {
    Assert-ExternalSuccess "pnpm" @("--dir", "apps/web", "typecheck") "web TypeScript"
  }

  Invoke-Gate "Web strict lint" {
    $arguments = @("--dir", "apps/web", "exec", "eslint", "--max-warnings", "0")
    $arguments += $webLintFiles
    Assert-ExternalSuccess "pnpm" $arguments "web P12 strict lint"
  }

  Invoke-Gate "Web P12 tests" {
    $componentTests = @()
    $componentTests += $customerTests
    $componentTests += $providerTests
    $componentTests += $adminTests
    $arguments = @("--dir", "apps/web", "exec", "vitest", "run")
    $arguments += $componentTests
    Assert-ExternalSuccess "pnpm" $arguments "Customer/Provider/Admin P12 component tests"

    $domainRunner = @"
import { startVitest } from 'vitest/node';
const files = ['$adminDomainTest'];
const vitest = await startVitest('test', files, { include: files, watch: false });
const failed = vitest?.state.getTestModules().some((module) => module.state() === 'failed');
await vitest?.close();
if (failed) process.exitCode = 1;
"@
    Assert-ExternalSuccess "pnpm" @(
      "--dir", "apps/web", "exec", "node", "--input-type=module", "-e", $domainRunner
    ) "Admin financial-report domain test"
  }

  Invoke-Gate "Functions build" {
    Assert-ExternalSuccess "pnpm" @("--dir", "functions", "build") "Functions build"
  }

  Invoke-Gate "Functions strict lint" {
    $arguments = @("--dir", "functions", "exec", "eslint", "--max-warnings", "0")
    $arguments += $functionsLintFiles
    Assert-ExternalSuccess "pnpm" $arguments "Functions P12 strict lint"
  }

  Invoke-Gate "Backend P12 tests" {
    $arguments = @("--dir", "functions", "exec", "node", "--test")
    $arguments += $backendTests
    Assert-ExternalSuccess "pnpm" $arguments "backend P12 tests"
  }

  Invoke-Gate "Stale wording" {
    $allDocs = ($docs | ForEach-Object { Get-Content -Raw -LiteralPath $_ }) -join "`n"
    $mojibakeMarkers = @(
      [char]0x00C2,
      [char]0x00C3,
      [char]0xFFFD
    )
    if ($mojibakeMarkers | Where-Object { $allDocs.Contains($_) }) {
      throw "Mojibake remains in canonical P12 documentation."
    }
    $paymentsDoc = Get-Content -Raw -LiteralPath "docs/domain/payments.md"
    if ($paymentsDoc -match '\|\s*`paid`\s*\|\s*`refunded`\s*\|') {
      throw "Stale paid-to-refunded-only lifecycle wording remains."
    }
    Assert-Regex $allDocs 'Net FEASTA platform revenue[\s\S]{0,80}(not derived automatically|is not derived automatically)' "incomplete-fee revenue wording"
  }

  Invoke-Gate "Diff" {
    Assert-ExternalSuccess "git" @("diff", "--check") "git diff --check"
    $scriptLines = Get-Content -LiteralPath "tools/p12-e-final-validation.ps1"
    if ($scriptLines | Where-Object { $_ -match '[ \t]+$' }) {
      throw "Trailing whitespace found in the untracked validator."
    }
  }

  Write-Host ""
  Write-Host ("Docs contract          : {0}" -f $results["Docs contract"])
  Write-Host ("Firestore security     : {0}" -f $results["Firestore security"])
  Write-Host ("Server authority       : {0}" -f $results["Server authority"])
  Write-Host ("Gateway-fee separation : {0}" -f $results["Gateway-fee separation"])
  Write-Host ("Terminology            : {0}" -f $results["Terminology"])
  Write-Host ("Payout fail-closed     : {0}" -f $results["Payout fail-closed"])
  Write-Host ("Shared contracts       : {0}" -f $results["Shared contracts"])
  Write-Host ("Web TypeScript         : {0}" -f $results["Web TypeScript"])
  Write-Host ("Web strict lint        : {0}" -f $results["Web strict lint"])
  Write-Host ("Web P12 tests          : {0}" -f $results["Web P12 tests"])
  Write-Host ("Functions build        : {0}" -f $results["Functions build"])
  Write-Host ("Functions strict lint  : {0}" -f $results["Functions strict lint"])
  Write-Host ("Backend P12 tests      : {0}" -f $results["Backend P12 tests"])
  Write-Host ("Stale wording          : {0}" -f $results["Stale wording"])
  Write-Host ("Diff                   : {0}" -f $results["Diff"])
  Write-Host ""

  if ($failures.Count -eq 0) {
    $completionMessage = "P12 " + [char]0x2014 +
      " REFUNDS, CANCELLATIONS, RECEIPTS & REPORTING IS COMPLETE."
    Write-Host $completionMessage
    exit 0
  }

  Write-Host "P12-E IS NOT GREEN."
  foreach ($failure in $failures) {
    Write-Host "- $failure"
  }
  exit 1
} finally {
  Pop-Location
}
