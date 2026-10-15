import {
  readFileSync,
} from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const servicePath = path.resolve(
  process.cwd(),
  "src/lib/admin/users/admin-user-service.ts",
);

const source = readFileSync(
  servicePath,
  "utf8",
);

describe(
  "admin account-access service contract",
  () => {
    it(
      "exposes only the unified account-access operation",
      () => {
        expect(source).toContain(
          "export async function manageAdminUserAccountAccess",
        );

        expect(source).not.toContain(
          "export async function updateAdminUserAccountStatus",
        );

        expect(source).not.toContain(
          "export async function updateAdminUserBlockedStatus",
        );
      },
    );

    it(
      "uses canonical active, disabled, and blocked states",
      () => {
        expect(source).toMatch(
          /case\s+"disable"[\s\S]*?isActive:\s*false[\s\S]*?isBlocked:\s*false[\s\S]*?accountStatus:\s*"disabled"/u,
        );

        expect(source).toMatch(
          /case\s+"block"[\s\S]*?isActive:\s*false[\s\S]*?isBlocked:\s*true[\s\S]*?accountStatus:\s*"blocked"/u,
        );

        expect(source).toMatch(
          /case\s+"restore"[\s\S]*?isActive:\s*true[\s\S]*?isBlocked:\s*false[\s\S]*?accountStatus:\s*"active"/u,
        );
      },
    );

    it(
      "synchronizes Firebase Authentication and revokes restricted sessions",
      () => {
        expect(source).toContain(
          "adminAuth.updateUser",
        );

        expect(source).toContain(
          "target.authenticationDisabled",
        );

        expect(source).toContain(
          "adminAuth.revokeRefreshTokens",
        );
      },
    );

    it(
      "prevents an administrator from changing their own access",
      () => {
        expect(source).toMatch(
          /userId\s*===\s*administrator\.uid/u,
        );

        expect(source).toContain(
          "Administrators cannot change their own account access.",
        );
      },
    );

    it(
      "validates separate public and private explanations",
      () => {
        expect(source).toContain(
          '"The user explanation"',
        );

        expect(source).toContain(
          '"The internal administrative reason"',
        );

        expect(source).toMatch(
          /userExplanation[\s\S]*?10[\s\S]*?500/u,
        );

        expect(source).toMatch(
          /internalReason[\s\S]*?10[\s\S]*?1000/u,
        );
      },
    );

    it(
      "keeps the private reason out of the user notification",
      () => {
        const notificationStart =
          source.indexOf(
            "NOTIFICATIONS_COLLECTION",
            source.indexOf(
              "export async function manageAdminUserAccountAccess",
            ),
          );

        const auditStart =
          source.indexOf(
            "ADMIN_LOGS_COLLECTION",
            notificationStart,
          );

        expect(
          notificationStart,
        ).toBeGreaterThan(-1);

        expect(
          auditStart,
        ).toBeGreaterThan(
          notificationStart,
        );

        const notificationWrite =
          source.slice(
            notificationStart,
            auditStart,
          );

        expect(
          notificationWrite,
        ).toContain(
          "notification.message",
        );

        expect(
          notificationWrite,
        ).not.toContain(
          "internalReason",
        );
      },
    );

    it(
      "stores the private reason in the administrative audit record",
      () => {
        const operationStart =
          source.indexOf(
            "export async function manageAdminUserAccountAccess",
          );

        const lastAuditWrite =
          source.lastIndexOf(
            "ADMIN_LOGS_COLLECTION",
          );

        const auditSection =
          source.slice(
            Math.max(
              operationStart,
              lastAuditWrite,
            ),
          );

        expect(
          auditSection,
        ).toMatch(
          /reason:\s*internalReason/u,
        );

        expect(
          auditSection,
        ).toContain(
          'source:',
        );

        expect(
          auditSection,
        ).toContain(
          '"admin_user_management"',
        );
      },
    );

    it(
      "avoids duplicate audit entries when the state already matches",
      () => {
        const unchangedReturn =
          source.indexOf(
            "if (!changed)",
          );

        const batchCreation =
          source.indexOf(
            "const batch = adminDb.batch()",
          );

        expect(
          unchangedReturn,
        ).toBeGreaterThan(-1);

        expect(
          batchCreation,
        ).toBeGreaterThan(
          unchangedReturn,
        );

        expect(source).toContain(
          "changed: false",
        );
      },
    );
  },
);