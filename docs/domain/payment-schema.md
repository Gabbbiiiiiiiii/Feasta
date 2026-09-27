payments/{paymentId}

mainEventId
providerRequestId

customerId
providerId
recipientProviderId

paymentType
gateway
currency
amount

status

gatewayCheckoutId
gatewayPaymentIntentId
gatewayPaymentId
gatewayReferenceNumber

idempotencyKey
gatewayEventIds

originalPaymentId
refundAmount
refundedAmount
refundReason

checkoutUrl
receiptUrl

expiresAt
paidAt
failedAt
cancelledAt
refundPendingAt
partiallyRefundedAt
refundedAt

failureCode
failureMessage

createdAt
updatedAt
statusUpdatedAt

## P10 remaining-balance and Provider settlement schema

### Provider request

Relevant canonical fields include:

- `settlementSchemaVersion`
- `settlementStatus`
- `grossSettledAmountInCentavos`
- `outstandingAmountInCentavos`
- `remainingBalancePaymentId`
- `fullySettled`
- `remainingBalanceStatus`
- `remainingBalanceDueAt`
- `remainingBalanceGraceEndsAt`
- `remainingBalanceLifecycleUpdatedAt`

The immutable financial snapshot contains the authoritative `remainingBalanceInCentavos`.

### providerEarnings/{earningId}

Provider earning records include canonical pending, available, paid, and reversed centavo buckets linked to the payment, Provider request, main event, and Provider.

### providerSettlements/{settlementId}

Provider settlement records include `earningId`, `paymentId`, `providerRequestId`, `mainEventId`, `providerId`, `customerId`, net/reserved/paid-out centavo amounts, settlement status, payout-attempt references, and reconciliation state.

### providerPayoutAttempts/{payoutAttemptId}

Payout-attempt records include `settlementId`, `earningId`, `providerId`, amount, status, `paymongo` gateway identity, bounded gateway evidence, and lifecycle timestamps.

### Client access

`providerPaymentAccounts`, `providerEarnings`, `providerSettlements`, and `providerPayoutAttempts` remain trusted server-managed collections.

## P11 platform financial policy and package-term schema

### appSettings/platform

Relevant canonical fields include:

- `schemaVersion`
- `isPublic`
- `timezone`
- `currencyCode`
- `platformCommissionRateBps`
- `platformTaxStatus`
- `platformVatRateBps`
- `minimumDepositRateBps`
- `maximumDepositRateBps`
- `minimumBalanceDueDaysBeforeEvent`
- `maximumBalanceDueDaysBeforeEvent`
- `financialPolicyVersion`
- `financialPolicyEffectiveAt`
- `updatedAt`
- `updatedBy`

Initial/default values are:

- `platformCommissionRateBps = 1000`
- `platformTaxStatus = non_vat`
- `platformVatRateBps = 1200`
- `minimumDepositRateBps = 2000`
- `maximumDepositRateBps = 8000`
- `minimumBalanceDueDaysBeforeEvent = 1`
- `maximumBalanceDueDaysBeforeEvent = 30`

The VAT rate is stored for versioned configuration but is financially active
only when the snapshotted FEASTA tax status is `vat_registered`.

`financialPolicyVersion` is the single financial-policy version. FEASTA does
not maintain independent payment-policy, deposit-policy, or balance-policy
version fields.

Direct browser mutation of `appSettings/platform` is denied. Updates are
performed by the authenticated Admin server layer.

### packages/{packageId} payment terms

Canonical package payment-term fields include:

- `paymentPolicy`
- `depositPercentage`
- `balanceDueDaysBeforeEvent`
- `downPaymentPercentage` as the compatibility projection

`paymentPolicy` is either `full_payment` or `deposit_then_balance`.

For a new or edited `deposit_then_balance` package, trusted Functions compare
the requested terms with the current `appSettings/platform` policy.

Saved package documents are not rewritten after a later policy change. Their
permanent technical envelope permits a deposit greater than 0% and below 100%
and a balance deadline from 1 through 365 days before the event.

`full_payment` stores 100% payment and no remaining-balance deadline.

### Historical snapshot rule

Provider-request and booking financial snapshots remain frozen financial truth.

A later Admin financial-policy update must not recalculate:

- booking gross value;
- collected amount;
- remaining balance;
- commission;
- Provider VAT;
- FEASTA VAT;
- Provider earnings;
- Provider settlement; or
- payout-attempt evidence.
