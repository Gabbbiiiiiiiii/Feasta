import type {
  ReviewOccasionSuggestionRequest, SubmitOccasionSuggestionRequest,
} from "@feasta/shared-types/provider-package-v2";
import {occasionId} from "./occasion-v2-validation.js";
import {documentId, exact, invalid, mutationKey, normalizedText, plainText,
  positiveRevision} from "./v2-validation.js";

export function parseOccasionSuggestion(value: unknown): SubmitOccasionSuggestionRequest {
  const r = "INVALID_NAME";
  const v = exact(value, ["name", "idempotencyKey"], ["reason"], r);
  const name = plainText(v.name, 2, 80, r, true).normalize("NFKC");
  plainText(name, 2, 80, r);
  const reason = Object.hasOwn(v, "reason") ? plainText(v.reason, 0, 500, r) : "";
  return {name, idempotencyKey: mutationKey(v.idempotencyKey, r), ...(reason ? {reason} : {})};
}

/** Shape validation only; pending state, admin identity and target revisions need server reads. */
export function parseOccasionReview(value: unknown): ReviewOccasionSuggestionRequest {
  const r = "INVALID_REVIEW_TARGET";
  const base = ["suggestionId", "expectedRevision", "expectedCatalogRevision",
    "idempotencyKey", "reason", "decision"];
  const v = exact(value, base, ["targetOccasionId", "targetExpectedRevision", "newOccasion"], r);
  const common = {
    suggestionId: documentId(v.suggestionId, r),
    expectedRevision: positiveRevision(v.expectedRevision, r),
    expectedCatalogRevision: positiveRevision(v.expectedCatalogRevision, r),
    idempotencyKey: mutationKey(v.idempotencyKey, r),
    reason: plainText(v.reason, 1, 500, "INVALID_REVIEW_REASON"),
  };
  if (v.decision === "reject") {
    exact(value, base, [], r);
    return {...common, decision: "reject"};
  }
  if (v.decision === "map" || v.decision === "approve_existing_inactive") {
    exact(value, [...base, "targetOccasionId", "targetExpectedRevision"], [], r);
    return {...common, decision: v.decision, targetOccasionId: occasionId(v.targetOccasionId, r),
      targetExpectedRevision: positiveRevision(v.targetExpectedRevision, r)};
  }
  if (v.decision !== "approve_new") return invalid(r);
  exact(value, [...base, "newOccasion"], [], r);
  const n = exact(v.newOccasion, ["id", "label", "aliases",
    "applicableServiceCategoryCodes", "sortOrder"], [], r);
  const label = plainText(n.label, 2, 80, r, true);
  if (!Array.isArray(n.aliases) || n.aliases.length > 20 ||
      !Array.isArray(n.applicableServiceCategoryCodes) ||
      !n.applicableServiceCategoryCodes.length ||
      typeof n.sortOrder !== "number" || !Number.isSafeInteger(n.sortOrder)) return invalid(r);
  const aliases = Array.from(n.aliases, (a) => plainText(a, 2, 80, r, true));
  const names = [label, ...aliases].map(normalizedText);
  const categories = Array.from(n.applicableServiceCategoryCodes, (c) => documentId(c, r));
  if (new Set(names).size !== names.length || new Set(categories).size !== categories.length) {
    return invalid(r);
  }
  return {...common, decision: "approve_new", newOccasion: {
    id: occasionId(n.id, r), label, aliases,
    applicableServiceCategoryCodes: categories, sortOrder: n.sortOrder,
  }};
}
