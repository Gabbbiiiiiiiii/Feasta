# FEASTA payment business contract

This document records the approved capstone payment rules.

It is a product and engineering contract. It does not claim that the FEASTA
capstone is currently a registered financial institution or VAT-registered
operating business.

## Customer payment policy

- A package uses either `full_payment` or `deposit_then_balance`.
- For `deposit_then_balance`, the provider chooses a minimum deposit within the
  current versioned FEASTA payment-term policy.
- The initial/default deposit range is 20% to 80%.
- The provider chooses a remaining-balance deadline within the current
  versioned FEASTA payment-term policy.
- The initial/default remaining-balance deadline range is 1 to 30 days before
  the event.
- A deposit is the minimum payment required to confirm the booking. It is not
  the maximum the customer may pay.
- A customer may always choose to pay the full booking amount for a
  `deposit_then_balance` package.
- After the minimum payment succeeds, the customer may pay the exact remaining
  balance early or by the due date.
- FEASTA does not accept arbitrary customer-entered payment amounts.
- All required booking payments remain inside the FEASTA/PayMongo payment flow.

Existing legacy records with a 0% down-payment value remain readable for
compatibility. A 0% deposit is not offered as a new package payment policy.

### Versioned package payment-term policy

The Admin financial policy stores these package-term limits in
`appSettings/platform`:

- `minimumDepositRateBps`
- `maximumDepositRateBps`
- `minimumBalanceDueDaysBeforeEvent`
- `maximumBalanceDueDaysBeforeEvent`

The same `financialPolicyVersion` also versions FEASTA commission and simulated
FEASTA tax configuration. FEASTA does not create a separate deposit-policy or
balance-policy version.

Admin policy changes apply prospectively when a Provider creates or edits a
package. The trusted create/update Cloud Functions independently reload the
current platform policy and enforce it server-side. Provider form validation is
only an early user-experience check and is not financial authority.

Changing the Admin policy does not recalculate or rewrite existing packages,
Provider-request financial snapshots, payments, earnings, settlements, payout
attempts, or ledger records.

A package that was valid when saved remains readable under the permanent
technical envelope. For `deposit_then_balance`, the stored deposit must be
greater than 0% and below 100%, and the stored balance deadline must be between
1 and 365 days before the event. `full_payment` remains a distinct 100% payment
policy with no remaining-balance deadline.
## Commission

- The initial/default platform commission policy is 10%.
- Commission is stored as versioned platform configuration in
  `appSettings/platform` rather than treated as a permanent hard-coded rate.
- `financialPolicyVersion` identifies the version of the financial policy used
  for new trusted financial snapshots.
- There is one economic commission for each provider booking/request.
- If the customer pays in multiple successful transactions, FEASTA allocates
  that same commission proportionally as money is collected.
- Failed or unpaid amounts do not earn commission.
- Refund accounting must be capable of reversing the corresponding commission.
- Money allocation uses integer centavos and basis points.
- Cumulative reconciliation ensures that split payments produce the same final
  commission as one full payment.

## Payment gateway fees

The initial FEASTA business policy is to absorb PayMongo processing costs from
platform economics instead of silently adding another provider deduction.

Gateway processing fees remain separate from:

- FEASTA commission;
- VAT;
- provider earnings;
- withholding;
- refunds; and
- payouts.

Only trusted PayMongo evidence may establish an observed gateway processing
fee. An observed fee may legitimately be zero. If that evidence is missing, the
fee remains null, absent, or unavailable; missing evidence must never default to
zero.

Gateway processing fees do not participate in canonical commission, Provider
VAT, FEASTA VAT, Provider earning, refund allocation, settlement, or payout
calculations.

## Provider settlement

Customer collection and provider settlement are separate financial concepts.

A customer may be fully paid while some provider earnings remain pending or
unsettled.

Actual payout capability and payout timing must use marketplace/payment
features supported for the real FEASTA PayMongo account.

## Provider tax treatment

Provider tax status is separate from `businessRegistrationType`.

The planned provider tax statuses are:

- `vat_registered`
- `non_vat`

For a verified VAT-registered provider, provider VAT belongs to the provider's
event-service sale.

For a verified Non-VAT provider, FEASTA must not create a 12% provider-VAT
component merely because the provider has a TIN.

Provider tax status must be separately verified before production tax
calculations rely on it.

## FEASTA tax treatment

FEASTA tax status is separate from provider tax status.

For this capstone:

- FEASTA does not claim to currently be an actually VAT-registered operating
  business.
- The platform may simulate/configure a VAT-registered FEASTA for demonstration
  and future-production architecture.
- When FEASTA VAT is enabled, VAT applies to FEASTA's own platform
  fee/commission rather than automatically to the provider's complete booking
  sale.
- The initial/default demonstration VAT rate is 12%.
- FEASTA tax status and VAT rate are versioned platform configuration under the
  same `financialPolicyVersion` used for commission and package payment-term
  bounds.

Whether FEASTA commission is calculated from a VAT-inclusive or VAT-exclusive
provider service base is a FEASTA commercial policy. It must be versioned and
must not be represented as a BIR-mandated commission formula.

## Withholding

The future production data model will reserve explicit fields for applicable
marketplace withholding.

The capstone will not automatically calculate or deduct withholding until the
eventual legal/payment arrangement has been validated.

Withholding must remain separate from generic fees, VAT and commission.

## Security boundaries

- Browser and mobile clients never supply authoritative payable amounts.
- The backend derives exact PHP payment amounts from trusted booking/provider
  request financial snapshots.
- PayMongo redirects are not proof of payment.
- Successful payment remains authoritative only after trusted PayMongo webhook
  verification.
- Commission, VAT, gateway fee, withholding, provider earnings, refunds and
  payouts remain separate auditable financial concepts.

## P12 receipts, statements, and reports

- Customers receive a protected, server-authorized Payment Receipt with
  partial/full refund history and a printable view. It excludes Provider and
  internal finance evidence.
- Providers receive a monthly Provider Earnings Statement using `Asia/Manila`
  periods, refund reversals, print, and CSV.
- Admins receive a read-only Financial Report and Financial Export covering
  commission, VAT, reversals, refunds, Provider earnings, settlements, and
  gateway-fee evidence completeness.
- Incomplete gateway-fee evidence means Net FEASTA platform revenue is not
  derived automatically.

FEASTA-generated documents use those descriptive labels. FEASTA does not
present them as an Official Receipt, Official Invoice, Sales Invoice, BIR
Invoice, or Tax Invoice.

Customer-paid truth is not Provider-paid truth. Refund truth is not payout
truth. Provider earning truth is not settlement truth, and settlement truth is
not payout transport truth. Settlement transport remains fail-closed until
explicitly verified by trusted server policy.
