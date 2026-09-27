# Provider Finance and Payouts

## Overview

P9 adds the provider earnings and payout-account domain to FEASTA.

The implementation separates customer payment activity from provider earnings and payout readiness.

## Provider payout accounts

Provider payout setup is represented by the `providerPaymentAccounts` collection.

Stored data is limited to bounded payout references and lifecycle state, including:

- provider ID
- owner ID
- linked account type
- PayMongo invitation reference and status
- PayMongo account reference
- activation status
- setup status
- payout-ready state
- timestamps

FEASTA does not store card numbers, CVV values, bank passwords, provider PayMongo secrets, or raw bank-account payloads.

Individual or freelance providers use the PayMongo consumer linked-account path.

Registered businesses use the PayMongo merchant linked-account path.

## Payout readiness

A provider must have a payout-ready account before accepting a new booking request that can lead to payment.

Payout readiness is checked again when a customer attempts to create a new payment checkout.

An already-created recoverable checkout is handled before the new payout-readiness gate so an existing payment session is not stranded unnecessarily.

A genuine successful PayMongo webhook is always recorded even if payout readiness later changes. Gateway financial truth is never discarded because of a later payout-state change.

## Provider earnings

Successful canonical payments create a deterministic `providerEarnings/{paymentId}` record.

Provider earning is calculated as:

Customer gross collected
- FEASTA commission
- applicable withholding
= Provider earning

Provider VAT remains within the provider service gross and is not deducted again from provider earnings.

FEASTA VAT on commission remains a FEASTA-side tax component.

Earning balances are tracked using separate buckets:

- pending
- available
- paid
- reversed

Completed refunds proportionally reverse only pending and available provider earnings.

A refund that would rewrite an already-paid provider earning fails closed and requires payout reconciliation instead.

## Provider Payments & Payouts workspace

The provider `/provider/payments` workspace includes:

- payout-account setup status
- linked-account type
- PayMongo onboarding action
- payout-ready state
- payout status refresh
- pending earnings
- available earnings
- paid earnings
- reversed earnings
- earnings history
- existing customer booking-payment monitoring

Customer gross payment records remain visually and semantically separate from provider earnings.

## Security

`providerPaymentAccounts` and `providerEarnings` are server-managed Firestore collections.

Direct browser reads and writes are denied for customers, providers, and admin clients.

The provider web application receives only the bounded finance projection through its authenticated server layer.

Cloud Functions and trusted Admin SDK services maintain canonical payout and earning state.

## Firestore index

Provider earnings history uses a composite index on:

- `providerId` ascending
- `createdAt` descending

## P9 validation

P9 validation covers:

- provider earning calculations
- refund earning reversals
- paid-earning fail-closed behavior
- PayMongo linked-account parsing
- sensitive-data exclusion
- linked-account type mapping
- payout onboarding authorization
- payout readiness on provider acceptance
- payout readiness before new checkout creation
- preservation of existing checkout recovery
- successful webhook financial truth
- provider Payments & Payouts UI
- Firestore client isolation
- Firestore composite index validity

## P10 settlement and remaining-balance contract

P10 extends the P9 Provider-finance domain while keeping Customer payment, Provider earning, Provider settlement, and payout-attempt evidence as separate financial truths.

A successful Customer payment does not by itself mean that the Provider has been paid.

### Customer remaining balance

Canonical remaining-balance statuses are:

- `not_applicable`
- `not_due`
- `due_soon`
- `due`
- `grace_period`
- `overdue`
- `paid`
- `cancelled`

Authoritative Provider-request fields include:

- `grossSettledAmountInCentavos`
- `outstandingAmountInCentavos`
- `remainingBalanceStatus`
- `remainingBalanceDueAt`
- `remainingBalanceGraceEndsAt`
- `remainingBalancePaymentId`

Clients display this server-owned lifecycle. They do not calculate overdue state locally. Checkout options remain the authority for whether a Customer may start a payment.

The remaining-balance lifecycle scheduler runs hourly in `Asia/Manila`. It updates lifecycle state and deterministic reminders only. It does not move Customer or Provider money.

### Provider settlement

Canonical Provider settlement statuses are:

- `awaiting_availability`
- `ready`
- `reserved`
- `processing`
- `paid`
- `reconciliation_required`
- `cancelled`

Customer payment success creates Provider earning accounting but does not make the Provider paid.

Provider service completion can release eligible pending earning into available earning and make the corresponding settlement ready.

Payout reservation belongs to settlement truth. The Provider earning remains available until authoritative payout success.

### Payout attempts

Canonical payout-attempt statuses are:

- `reserved`
- `dispatching`
- `submitted`
- `processing`
- `succeeded`
- `failed`
- `ambiguous`

Payout-attempt evidence is stored in `providerPayoutAttempts` and includes bounded gateway evidence such as the gateway resource ID, failure code, failure message, and lifecycle timestamps.

An ambiguous payout result retains reconciliation state instead of automatically retrying or marking the Provider paid.

### Refund and payout exclusion

Refund dispatch and Provider payout reservation protect each other before external money movement. A refund reservation blocks payout reservation, while payout activity that requires reconciliation blocks unsafe refund dispatch.

### Settlement transport

Provider onboarding readiness and actual settlement transport readiness remain separate.

`settlementTransportReady` must be explicitly verified. A linked or activated PayMongo account alone does not enable settlement dispatch.

The current P10 implementation remains fail-closed and does not introduce an unverified PayMongo wallet-transfer dispatch.

### Admin reconciliation

Admin Payment Monitoring exposes bounded read-only visibility for Provider earning, settlement, reconciliation state, and referenced payout-attempt evidence.

The Admin interface does not expose payout mutation controls such as Retry payout, Force reconcile, Mark paid, Release settlement, Send payout, or Withdraw.

### Security

The following collections remain trusted backend-only finance records:

- `providerPaymentAccounts`
- `providerEarnings`
- `providerSettlements`
- `providerPayoutAttempts`

Firestore client rules deny direct reads and writes to these collections. Provider and Admin views are projected through trusted server-side services.
