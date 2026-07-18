import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAccountStatus,
  parseUserRole,
  resolveAuthenticationGate,
} from "@feasta/shared-types";

test("web consumes the shared fail-closed account domain", () => {
  assert.equal(parseUserRole("admin"), "admin");
  assert.equal(parseUserRole("super_admin"), null);
  assert.equal(parseAccountStatus("pendingDeletion"), "pending_deletion");
  assert.equal(resolveAuthenticationGate({
    authenticated: true,
    emailVerified: true,
    userProfile: {
      role: "customer",
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
      isPhoneVerified: true,
    },
    requiredRoles: ["admin"],
  }).kind, "forbiddenRole");
});
