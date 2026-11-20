import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticationGatePresentation,
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

test("web uses canonical cross-platform account-state messages", () => {
  assert.equal(
    authenticationGatePresentation("blocked").message,
    "This account is blocked. Contact FEASTA support for help.",
  );
  assert.equal(
    authenticationGatePresentation("providerResubmissionRequired").label,
    "Resubmission required",
  );
  assert.equal(
    authenticationGatePresentation("sessionExpired").message,
    "Your session ended. Sign in again to continue.",
  );
});
