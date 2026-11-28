/**
 * Pure occasion membership planning for package registry integration.
 *
 * No Firestore operations or permission to authorize deactivation.
 * Only complete, specific-scope package memberships are supported.
 * Universal/category-wide membership requires a separate authority.
 */

type PackageMembership = Record<string, unknown>;

export interface PackageMembershipPlan {
  add: string[];
  remove: string[];
  retain: string[];
}

const ID = /^[a-z][a-z0-9_]{1,63}$/u;

function fail(): never {
  throw new Error("OCCASION_PACKAGE_MEMBERSHIP_REQUIRES_REVIEW");
}

function memberships(value: PackageMembership): string[] {
  if (value.occasionSchemaVersion !== 2 ||
      value.occasionScope === "all") {
    if (value.occasionScope === "all") {
      throw new Error("OCCASION_CATEGORY_DEPENDENCY_REGISTRY_REQUIRED");
    }
    return fail();
  }

  if (value.occasionScope !== "specific" ||
      !Array.isArray(value.occasionIds) ||
      !Array.isArray(value.occasionMatchIds)) {
    return fail();
  }

  const ids: unknown[] = value.occasionIds;
  const matches: unknown[] = value.occasionMatchIds;

  if (ids.length === 0 ||
      !ids.every(id => typeof id === "string" && ID.test(id)) ||
      !matches.every(id => typeof id === "string" && ID.test(id)) ||
      new Set(ids).size !== ids.length ||
      new Set(matches).size !== matches.length) {
    return fail();
  }

  const selected = new Set(ids as string[]);
  const matched = new Set(matches as string[]);

  if (selected.size !== matched.size ||
      [...selected].some(id => !matched.has(id)) ||
      typeof value.eventType !== "string" ||
      !selected.has(value.eventType)) {
    return fail();
  }

  return [...selected].sort();
}

/**
 * `previous === null` means a newly created package, not an unknown
 * historical record. Existing packages must supply verified prior data.
 */
export function planSpecificPackageMembership(input: {
  previous: PackageMembership | null;
  next: PackageMembership;
}): PackageMembershipPlan {
  const oldIds = input.previous === null ?
    [] : memberships(input.previous);

  const newIds = memberships(input.next);

  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);

  return {
    add: newIds.filter(id => !oldSet.has(id)),
    remove: oldIds.filter(id => !newSet.has(id)),
    retain: newIds.filter(id => oldSet.has(id)),
  };
}
