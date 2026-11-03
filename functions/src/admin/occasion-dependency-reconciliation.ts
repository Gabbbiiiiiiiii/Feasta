/**
 * Read-only reconciliation of expected registry witnesses.
 *
 * This module does not prove inventory completeness, perform
 * Firestore writes, or authorize occasion transitions.
 */

export interface ReconciliationWitness {
  path: string;
  value: Record<string, unknown>;
}

export interface ReconciliationIssue {
  path: string;
  reason: "missing" | "mismatch" | "duplicate" | "invalid";
}

export interface ReconciliationReport {
  checked: number;
  matched: number;
  issues: ReconciliationIssue[];
  coverageVerified: false;
}

function validWitness(value: unknown): value is ReconciliationWitness {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const witness = value as Record<string, unknown>;

  return typeof witness.path === "string" &&
    witness.path.length > 0 &&
    witness.path.length <= 512 &&
    typeof witness.value === "object" &&
    witness.value !== null &&
    !Array.isArray(witness.value);
}

function equalValue(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) &&
      Object.is(left[key], right[key]));
}

/**
 * Both inputs must be supplied by a trusted inventory reader.
 * Missing witnesses never count as safe or irrelevant dependencies.
 */
export function reconcileOccasionDependencyWitnesses(input: {
  expected: readonly unknown[];
  actual: readonly unknown[];
}): ReconciliationReport {
  const issues: ReconciliationIssue[] = [];
  const actualByPath = new Map<string, Record<string, unknown>>();
  const duplicatePaths = new Set<string>();

  for (const raw of input.actual) {
    if (!validWitness(raw)) {
      issues.push({path: "<invalid>", reason: "invalid"});
      continue;
    }

    if (actualByPath.has(raw.path)) {
      duplicatePaths.add(raw.path);
      issues.push({path: raw.path, reason: "duplicate"});
    } else {
      actualByPath.set(raw.path, raw.value);
    }
  }

  const expectedPaths = new Set<string>();
  let matched = 0;

  for (const raw of input.expected) {
    if (!validWitness(raw)) {
      issues.push({path: "<invalid>", reason: "invalid"});
      continue;
    }

    if (expectedPaths.has(raw.path)) {
      issues.push({path: raw.path, reason: "duplicate"});
      continue;
    }
    expectedPaths.add(raw.path);

    if (duplicatePaths.has(raw.path)) continue;

    const actual = actualByPath.get(raw.path);
    if (!actual) {
      issues.push({path: raw.path, reason: "missing"});
    } else if (!equalValue(actual, raw.value)) {
      issues.push({path: raw.path, reason: "mismatch"});
    } else {
      matched++;
    }
  }

  // Unexpected registry entries require review, not silent omission.
  for (const path of actualByPath.keys()) {
    if (!expectedPaths.has(path)) {
      issues.push({path, reason: "mismatch"});
    }
  }

  return {
    checked: input.expected.length,
    matched,
    issues: issues.sort((a, b) =>
      a.path.localeCompare(b.path) ||
      a.reason.localeCompare(b.reason)),
    coverageVerified: false,
  };
}
