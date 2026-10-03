/**
 * Canonical FEASTA payment/business primitives.
 *
 * Money crossing a trust boundary uses integer centavos.
 * Percentage rates use basis points:
 *
 * 10_000 bps = 100%
 * 1_000 bps  = 10%
 * 1_200 bps  = 12%
 */
export declare const PACKAGE_PAYMENT_POLICIES: readonly ["full_payment", "deposit_then_balance"];
export type PackagePaymentPolicy = (typeof PACKAGE_PAYMENT_POLICIES)[number];
export declare const CUSTOMER_PAYMENT_CHOICES: readonly ["minimum", "full", "remaining_balance"];
export type CustomerPaymentChoice = (typeof CUSTOMER_PAYMENT_CHOICES)[number];
export declare const TAX_REGISTRATION_STATUSES: readonly ["non_vat", "vat_registered"];
export type TaxRegistrationStatus = (typeof TAX_REGISTRATION_STATUSES)[number];
export declare const CENTAVOS_PER_PESO = 100;
export declare const BASIS_POINTS_SCALE = 10000;
export declare const FULL_PAYMENT_RATE_BPS = 10000;
export declare const MIN_DEPOSIT_RATE_BPS = 2000;
export declare const MAX_DEPOSIT_RATE_BPS = 8000;
export declare const MIN_BALANCE_DUE_DAYS_BEFORE_EVENT = 1;
export declare const MAX_BALANCE_DUE_DAYS_BEFORE_EVENT = 30;
/**
 * Initial FEASTA business-policy defaults.
 *
 * These are defaults only. Later phases will load
 * versioned Admin/platform configuration instead
 * of permanently relying on these constants.
 */
export declare const DEFAULT_PLATFORM_COMMISSION_RATE_BPS = 1000;
export declare const DEFAULT_PLATFORM_VAT_RATE_BPS = 1200;
export declare function parsePackagePaymentPolicy(value: unknown): PackagePaymentPolicy | null;
export declare function parseCustomerPaymentChoice(value: unknown): CustomerPaymentChoice | null;
export declare function parseTaxRegistrationStatus(value: unknown): TaxRegistrationStatus | null;
export declare function pesosToCentavos(value: unknown): number | null;
export declare function centavosToPesos(value: unknown): number | null;
export declare function percentageToBasisPoints(value: unknown): number | null;
export declare function basisPointsToPercentage(value: unknown): number | null;
export declare function isAllowedDepositRateBps(value: unknown): value is number;
export declare function isAllowedBalanceDueDays(value: unknown): value is number;
/**
 * Applies a rate to integer centavos using
 * deterministic half-up centavo rounding.
 */
export declare function applyBasisPoints(amountInCentavos: unknown, rateBps: unknown): number | null;
/**
 * Allocates a percentage against cumulative
 * collected value.
 *
 * This avoids rounding drift where:
 *
 * deposit commission
 * +
 * balance commission
 *
 * would otherwise differ from the commission
 * calculated on one full payment.
 */
export declare function allocateCumulativeBasisPoints(input: {
    currentBaseInCentavos: number;
    cumulativeBaseBeforeInCentavos: number;
    alreadyAllocatedInCentavos: number;
    rateBps: number;
}): number | null;
//# sourceMappingURL=payment.d.ts.map