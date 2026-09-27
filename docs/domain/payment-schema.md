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
