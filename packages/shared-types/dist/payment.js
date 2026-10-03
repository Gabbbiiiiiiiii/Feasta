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
 * These are defaults only. Later phases will load
 * versioned Admin/platform configuration instead
 * of permanently relying on these constants.
 */
export const DEFAULT_PLATFORM_COMMISSION_RATE_BPS = 1_000;
export const DEFAULT_PLATFORM_VAT_RATE_BPS = 1_200;
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