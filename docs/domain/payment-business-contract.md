# FEASTA payment business contract

This document records the approved capstone payment rules.

It is a product and engineering contract. It does not claim that the FEASTA
capstone is currently a registered financial institution or VAT-registered
operating business.

## Customer payment policy

- A package uses either `full_payment` or `deposit_then_balance`.
- For `deposit_then_balance`, the provider chooses a minimum deposit from 20%
  to 80%.
- The provider chooses a remaining-balance deadline from 1 to 30 days before
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

## Commission

- The initial platform commission policy is 10%.
- The rate will later be versioned/configurable rather than treated as a
  permanent hard-coded business rule.
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
- The initial demonstration VAT rate is 12%.
- FEASTA tax status and VAT rate must later be versioned configuration.

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
