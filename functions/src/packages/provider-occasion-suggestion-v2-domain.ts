/**
 * Pure domain decisions for provider occasion suggestions.
 * No Firestore, auth, or network access.
 */

export interface SuggestionCandidate {
  suggestionId: string;
  normalizedName: string;
  status: "pending" | "approved" | "rejected" | "mapped";
}

export interface CatalogCandidate {
  id: string;
  label: string;
  aliases: string[];
  active: boolean;
  moderationState: "approved" | "pending" | "rejected";
}

export interface SubmissionDecisionInput {
  normalizedName: string;
  catalog: readonly CatalogCandidate[];
  ownSuggestions: readonly SuggestionCandidate[];
  pendingCount: number;
  newSubmissionCount24h: number;
  maxPending: number;
  maxNewSubmissions24h: number;
}

export type SubmissionDecision =
  | {kind: "canonical_match"; occasionId: string}
  | {kind: "own_duplicate"; suggestionId: string}
  | {kind: "pending_limit"}
  | {kind: "daily_limit"}
  | {kind: "create"};

export function normalizeSuggestionName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("und");
}

export function decideSuggestionSubmission(
  input: SubmissionDecisionInput,
): SubmissionDecision {
  const normalized = normalizeSuggestionName(input.normalizedName);

  for (const occasion of input.catalog) {
    if (occasion.moderationState !== "approved") continue;

    const names = [occasion.label, ...occasion.aliases];

    if (names.some((name) => normalizeSuggestionName(name) === normalized)) {
      return {kind: "canonical_match", occasionId: occasion.id};
    }
  }

  for (const suggestion of input.ownSuggestions) {
    if (suggestion.normalizedName === normalized) {
      return {
        kind: "own_duplicate",
        suggestionId: suggestion.suggestionId,
      };
    }
  }

  if (input.pendingCount >= input.maxPending) {
    return {kind: "pending_limit"};
  }

  if (input.newSubmissionCount24h >= input.maxNewSubmissions24h) {
    return {kind: "daily_limit"};
  }

  return {kind: "create"};
}