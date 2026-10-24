"use strict";
/**
 * Numeric dotted version order for one agreement lineage.
 *
 * Legacy labels such as 2026-09-27 are not rewritten and are not compared
 * numerically. They still participate in exact duplicate detection. A new
 * numeric version is allowed beside an incomparable legacy label. Numeric
 * versions must be strictly newer than every other numeric version in that
 * same agreement.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRealCalendarDate = isRealCalendarDate;
exports.isNumericDottedVersion = isNumericDottedVersion;
exports.compareNumericAgreementVersions = compareNumericAgreementVersions;
exports.suggestNextAgreementVersion = suggestNextAgreementVersion;
exports.agreementVersionChoiceError = agreementVersionChoiceError;
const NUMERIC_DOTTED_VERSION = /^\d+(?:\.\d+)*$/u;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;
function isRealCalendarDate(value) {
    if (!CALENDAR_DATE.test(value))
        return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (month < 1 || month > 12 || day < 1)
        return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
}
function isNumericDottedVersion(value) {
    return NUMERIC_DOTTED_VERSION.test(value);
}
function compareNumericAgreementVersions(left, right) {
    if (!isNumericDottedVersion(left) || !isNumericDottedVersion(right)) {
        return null;
    }
    const leftParts = left.split(".").map((part) => Number(part));
    const rightParts = right.split(".").map((part) => Number(part));
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = leftParts[index] ?? 0;
        const rightPart = rightParts[index] ?? 0;
        if (leftPart > rightPart)
            return 1;
        if (leftPart < rightPart)
            return -1;
    }
    return 0;
}
function suggestNextAgreementVersion(current) {
    if (!current || !isNumericDottedVersion(current))
        return "";
    const parts = current.split(".").map((part) => Number(part));
    parts[parts.length - 1] += 1;
    return parts.join(".");
}
function agreementVersionChoiceError(candidate, versions, ignoring) {
    const version = candidate.trim().replace(/\s+/gu, " ");
    if (versions.some((entry) => entry.version === version && entry.version !== ignoring)) {
        return `Version ${version} already exists for this agreement.`;
    }
    if (!isNumericDottedVersion(version))
        return null;
    const numeric = versions
        .map((entry) => entry.version)
        .filter((entry) => entry !== ignoring && isNumericDottedVersion(entry));
    if (numeric.length === 0)
        return null;
    const highest = numeric.reduce((best, entry) => compareNumericAgreementVersions(entry, best) === 1 ? entry : best);
    if (compareNumericAgreementVersions(version, highest) === 1)
        return null;
    const current = versions.find((entry) => entry.status === "current" && entry.version !== ignoring)?.version;
    const baseline = current &&
        isNumericDottedVersion(current) &&
        compareNumericAgreementVersions(version, current) !== 1
        ? current
        : highest;
    return `Enter a version newer than the current version ${baseline}.`;
}
//# sourceMappingURL=agreement-version-order.cjs.map