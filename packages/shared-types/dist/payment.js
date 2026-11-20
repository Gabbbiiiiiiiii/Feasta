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
export const PACKAGE_PAYMENT_POLICIES = [
    "full_payment",
    "deposit_then_balance",
];
export const CUSTOMER_PAYMENT_CHOICES = [
    "minimum",
    "full",
    "remaining_balance",
];
export const TAX_REGISTRATION_STATUSES = [
    "non_vat",
    "vat_registered",
];
export const CENTAVOS_PER_PESO = 100;
export const BASIS_POINTS_SCALE = 10_000;
export const FULL_PAYMENT_RATE_BPS = BASIS_POINTS_SCALE;
export const MIN_DEPOSIT_RATE_BPS = 2_000;
export const MAX_DEPOSIT_RATE_BPS = 8_000;
export const MIN_BALANCE_DUE_DAYS_BEFORE_EVENT = 1;
export const MAX_BALANCE_DUE_DAYS_BEFORE_EVENT = 30;
/**
 * Initial FEASTA business-policy defaults.
 *
 * These are defaults only. Versioned Admin/platform
 * configuration in `appSettings/platform` is the
 * authority for new financial snapshots.
 */
export const DEFAULT_PLATFORM_COMMISSION_RATE_BPS = 200;
export const DEFAULT_PLATFORM_VAT_RATE_BPS = 1_200;
/**
 * Provider-friendly tiered capped commission model.
 *
 * Configurable base rate (default 2%) with dynamic
 * caps so high-value bookings are not charged a
 * large uncapped percentage.
 */
export const PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1 = "tiered_capped_2pct_v1";
export const DEFAULT_PLATFORM_COMMISSION_MODEL = PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1;
/** ₱25,000 — end of pure 2% band (inclusive). */
export const TIERED_COMMISSION_PURE_RATE_MAX_CENTAVOS = 2_500_000;
/** ₱75,000 — end of fixed ₱500 band (inclusive). */
export const TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS = 7_500_000;
/** ₱100,000 — absolute-cap floor (inclusive). */
export const TIERED_COMMISSION_ABSOLUTE_CAP_MIN_CENTAVOS = 10_000_000;
/** ₱500 standard commission cap. */
export const TIERED_COMMISSION_STANDARD_CAP_CENTAVOS = 50_000;
/** ₱1,000 absolute maximum commission. */
export const TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS = 100_000;
export function parsePackagePaymentPolicy(value) {
    return PACKAGE_PAYMENT_POLICIES.includes(value)
        ? value
        : null;
}
export function parseCustomerPaymentChoice(value) {
    return CUSTOMER_PAYMENT_CHOICES.includes(value)
        ? value
        : null;
}
export function parseTaxRegistrationStatus(value) {
    return TAX_REGISTRATION_STATUSES.includes(value)
        ? value
        : null;
}
export function pesosToCentavos(value) {
    if (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0) {
        return null;
    }
    const centavos = Math.round(value * CENTAVOS_PER_PESO);
    if (!Number.isSafeInteger(centavos)) {
        return null;
    }
    return centavos;
}
export function centavosToPesos(value) {
    if (!isNonNegativeSafeInteger(value)) {
        return null;
    }
    return (value /
        CENTAVOS_PER_PESO);
}
export function percentageToBasisPoints(value) {
    if (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100) {
        return null;
    }
    const basisPoints = Math.round(value * 100);
    if (!Number.isSafeInteger(basisPoints)) {
        return null;
    }
    return basisPoints;
}
export function basisPointsToPercentage(value) {
    if (!isBasisPointRate(value)) {
        return null;
    }
    return value / 100;
}
export function isAllowedDepositRateBps(value) {
    return (isBasisPointRate(value) &&
        value >=
            MIN_DEPOSIT_RATE_BPS &&
        value <=
            MAX_DEPOSIT_RATE_BPS);
}
export function isAllowedBalanceDueDays(value) {
    return (Number.isSafeInteger(value) &&
        value >=
            MIN_BALANCE_DUE_DAYS_BEFORE_EVENT &&
        value <=
            MAX_BALANCE_DUE_DAYS_BEFORE_EVENT);
}
/**
 * Applies a rate to integer centavos using
 * deterministic half-up centavo rounding.
 */
export function applyBasisPoints(amountInCentavos, rateBps) {
    if (!isNonNegativeSafeInteger(amountInCentavos) ||
        !isBasisPointRate(rateBps)) {
        return null;
    }
    const product = amountInCentavos *
        rateBps;
    if (!Number.isSafeInteger(product)) {
        return null;
    }
    return Math.floor((product +
        BASIS_POINTS_SCALE / 2) /
        BASIS_POINTS_SCALE);
}
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
export function allocateCumulativeBasisPoints(input) {
    const { currentBaseInCentavos, cumulativeBaseBeforeInCentavos, alreadyAllocatedInCentavos, rateBps, } = input;
    if (!isNonNegativeSafeInteger(currentBaseInCentavos) ||
        !isNonNegativeSafeInteger(cumulativeBaseBeforeInCentavos) ||
        !isNonNegativeSafeInteger(alreadyAllocatedInCentavos) ||
        !isBasisPointRate(rateBps)) {
        return null;
    }
    const cumulativeBaseAfter = cumulativeBaseBeforeInCentavos +
        currentBaseInCentavos;
    if (!Number.isSafeInteger(cumulativeBaseAfter)) {
        return null;
    }
    const targetAfter = applyBasisPoints(cumulativeBaseAfter, rateBps);
    if (targetAfter === null ||
        targetAfter <
            alreadyAllocatedInCentavos) {
        return null;
    }
    return (targetAfter -
        alreadyAllocatedInCentavos);
}
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
export function computeTieredCappedCommissionInCentavos(grossAmountInCentavos, rateBps = DEFAULT_PLATFORM_COMMISSION_RATE_BPS) {
    if (!isNonNegativeSafeInteger(grossAmountInCentavos)) {
        return null;
    }
    if (!Number.isSafeInteger(rateBps) ||
        rateBps <= 0 ||
        rateBps > BASIS_POINTS_SCALE) {
        return null;
    }
    if (grossAmountInCentavos <=
        TIERED_COMMISSION_PURE_RATE_MAX_CENTAVOS) {
        return applyBasisPoints(grossAmountInCentavos, rateBps);
    }
    if (grossAmountInCentavos <=
        TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS) {
        return TIERED_COMMISSION_STANDARD_CAP_CENTAVOS;
    }
    if (grossAmountInCentavos <
        TIERED_COMMISSION_ABSOLUTE_CAP_MIN_CENTAVOS) {
        const excess = grossAmountInCentavos -
            TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS;
        const progressive = applyBasisPoints(excess, rateBps);
        if (progressive === null) {
            return null;
        }
        const total = TIERED_COMMISSION_STANDARD_CAP_CENTAVOS +
            progressive;
        if (!Number.isSafeInteger(total) ||
            total >
                TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS) {
            return TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS;
        }
        return total;
    }
    return TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS;
}
/**
 * Allocates a frozen booking commission total
 * across cumulative collected gross so split
 * payments reconcile to the snapshotted total.
 */
export function allocateCumulativeFixedTotal(input) {
    const { totalInCentavos, grossAmountInCentavos, cumulativeBaseAfterInCentavos, } = input;
    if (!isNonNegativeSafeInteger(totalInCentavos) ||
        !isNonNegativeSafeInteger(grossAmountInCentavos) ||
        !isNonNegativeSafeInteger(cumulativeBaseAfterInCentavos) ||
        grossAmountInCentavos === 0 ||
        cumulativeBaseAfterInCentavos >
            grossAmountInCentavos) {
        return null;
    }
    if (cumulativeBaseAfterInCentavos ===
        grossAmountInCentavos) {
        return totalInCentavos;
    }
    const product = totalInCentavos *
        cumulativeBaseAfterInCentavos;
    if (!Number.isSafeInteger(product)) {
        return null;
    }
    return Math.floor((product +
        Math.floor(grossAmountInCentavos / 2)) /
        grossAmountInCentavos);
}
export function parsePlatformCommissionModel(value) {
    return value ===
        PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1
        ? PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1
        : null;
}
function isBasisPointRate(value) {
    return (Number.isSafeInteger(value) &&
        value >= 0 &&
        value <=
            BASIS_POINTS_SCALE);
}
function isNonNegativeSafeInteger(value) {
    return (Number.isSafeInteger(value) &&
        value >= 0);
}
//# sourceMappingURL=payment.js.map