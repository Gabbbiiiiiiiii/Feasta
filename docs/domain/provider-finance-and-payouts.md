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