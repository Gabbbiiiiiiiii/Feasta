"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withLegacyVersionSummary = withLegacyVersionSummary;
// Older records only stored summary on the lineage. It belongs to the current
// version (or the initial unpublished draft), never to archived versions.
function withLegacyVersionSummary(value, document) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return value;
    const entry = value;
    if ("summary" in entry || typeof document.summary !== "string")
        return entry;
    const versions = Array.isArray(document.versions) ? document.versions : [];
    const ownsSummary = entry.status === "current" ||
        (entry.status === "draft" && entry.version === document.version &&
            !versions.some((version) => version?.status === "current"));
    return ownsSummary ? { ...entry, summary: document.summary } : entry;
}
//# sourceMappingURL=agreement-summary.cjs.map