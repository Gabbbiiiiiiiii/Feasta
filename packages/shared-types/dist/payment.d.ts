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
 * These are defaults only. Versioned Admin/platform
 * configuration in `appSettings/platform` is the
 * authority for new financial snapshots.
 */
export declare const DEFAULT_PLATFORM_COMMISSION_RATE_BPS = 200;
export declare const DEFAULT_PLATFORM_VAT_RATE_BPS = 1200;
/**
 * Provider-friendly tiered capped commission model.
 *
 * Configurable base rate (default 2%) with dynamic
 * caps so high-value bookings are not charged a
 * large uncapped percentage.
 */
export declare const PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1: "tiered_capped_2pct_v1";
export type PlatformCommissionModel = typeof PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1;
export declare const DEFAULT_PLATFORM_COMMISSION_MODEL: PlatformCommissionModel;
/** ₱25,000 — end of pure 2% band (inclusive). */
export declare const TIERED_COMMISSION_PURE_RATE_MAX_CENTAVOS = 2500000;
/** ₱75,000 — end of fixed ₱500 band (inclusive). */
export declare const TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS = 7500000;
/** ₱100,000 — absolute-cap floor (inclusive). */
export declare const TIERED_COMMISSION_ABSOLUTE_CAP_MIN_CENTAVOS = 10000000;
/** ₱500 standard commission cap. */
export declare const TIERED_COMMISSION_STANDARD_CAP_CENTAVOS = 50000;
/** ₱1,000 absolute maximum commission. */
export declare const TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS = 100000;
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
/**
 * FEASTA tiered capped commission on booking gross.
 *
 * - ₱0–₱25,000: configured base rate of gross
 * - Above ₱25,000–₱75,000: fixed ₱500
 * - Above ₱75,000–below ₱100,000:
 *   ₱500 + base rate of (gross − ₱75,000)
 * - ₱100,000+: fixed ₱1,000 absolute max
 *
 * Base rate defaults to 2% (200 bps) and may be
 * overridden by platform financial policy.
 */
export declare function computeTieredCappedCommissionInCentavos(grossAmountInCentavos: unknown, rateBps?: number): number | null;
/**
 * Allocates a frozen booking commission total
 * across cumulative collected gross so split
 * payments reconcile to the snapshotted total.
 */
export declare function allocateCumulativeFixedTotal(input: {
    totalInCentavos: number;
    grossAmountInCentavos: number;
    cumulativeBaseAfterInCentavos: number;
}): number | null;
export declare function parsePlatformCommissionModel(value: unknown): PlatformCommissionModel | null;
//# sourceMappingURL=payment.d.ts.map