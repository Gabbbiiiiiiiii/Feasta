import {
  parseAccountStatus,
  parseUserRole,
  type AccountStatus,
  type UserRole,
} from "./constants.js";

export type BackendAccountStateKind =
  | "active"
  | "missingUserProfile"
  | "disabledAuthAccount"
  | "disabledAccount"
  | "blocked"
  | "deactivated"
  | "forbiddenRole"
  | "invalidAccountState";

export interface BackendUserProfileInput {
  role?: unknown;
  accountStatus?: unknown;
  isActive?: unknown;
  isBlocked?: unknown;
}

export interface BackendAccountState {
  kind: BackendAccountStateKind;
  role?: UserRole;
  accountStatus?: AccountStatus;
}

export function resolveBackendAccountState(input: {
  authDisabled: boolean;
  profile?: BackendUserProfileInput | null;
  allowedRoles?: readonly UserRole[];
}): BackendAccountState {
  if (input.authDisabled) return {kind: "disabledAuthAccount"};
  if (!input.profile) return {kind: "missingUserProfile"};

  const role = parseUserRole(input.profile.role);
  const accountStatus = parseAccountStatus(input.profile.accountStatus);
  if (!role) return {kind: "forbiddenRole"};
  if (!accountStatus) return {kind: "invalidAccountState", role};
  if (
    typeof input.profile.isActive !== "boolean" ||
    typeof input.profile.isBlocked !== "boolean"
  ) {
    return {kind: "invalidAccountState", role, accountStatus};
  }

  const context = {role, accountStatus};
  if (input.profile.isBlocked === true || accountStatus === "blocked") {
    return {kind: "blocked", ...context};
  }
  if (accountStatus === "pending_deletion") {
    return {kind: "deactivated", ...context};
  }
  if (accountStatus === "disabled" || input.profile.isActive !== true) {
    return {kind: "disabledAccount", ...context};
  }
  if (accountStatus !== "active") {
    return {kind: "invalidAccountState", ...context};
  }
  if (input.allowedRoles && !input.allowedRoles.includes(role)) {
    return {kind: "forbiddenRole", ...context};
  }
  return {kind: "active", ...context};
}
