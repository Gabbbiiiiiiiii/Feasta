import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const webRoot = process.cwd();

const serviceSource =
  readFileSync(
    join(
      webRoot,
      "src/lib/admin/complaints/admin-complaint-service.ts",
    ),
    "utf8",
  );

const actionSource =
  readFileSync(
    join(
      webRoot,
      "src/app/admin/complaints/actions.ts",
    ),
    "utf8",
  );

const typeSource =
  readFileSync(
    join(
      webRoot,
      "src/lib/admin/complaints/admin-complaint-types.ts",
    ),
    "utf8",
  );

const createComplaintSource =
  readFileSync(
    join(
      webRoot,
      "../../functions/src/content/create-complaint.ts",
    ),
    "utf8",
  );

const indexConfiguration =
  JSON.parse(
    readFileSync(
      join(
        webRoot,
        "../../firebase/firestore.indexes.json",
      ),
      "utf8",
    ),
  ) as {
    indexes?: Array<{
      collectionGroup?: string;
      fields?: Array<{
        fieldPath?: string;
        order?: string;
      }>;
    }>;
  };

describe(
  "admin complaint service contract",
  () => {
    it(
      "requires administrator authorization for reads and mutations",
      () => {
        expect(
          serviceSource,
        ).toMatch(
          /getAdminComplaintPage[\s\S]*?await requireAdmin\(\)/u,
        );

        expect(
          serviceSource,
        ).toMatch(
          /manageAdminComplaint[\s\S]*?await requireAdmin\(\)/u,
        );

        expect(
          actionSource.match(
            /await requireAdmin\(\)/gu,
          ),
        ).toHaveLength(2);
      },
    );

    it(
      "keeps complaint reads bounded",
      () => {
        expect(
          serviceSource,
        ).toContain(
          "SEARCH_SCAN_LIMIT = 200",
        );

        expect(
          serviceSource,
        ).toMatch(
          /\.limit\(\s*filters\.pageSize\s*\+\s*1/u,
        );

        expect(
          serviceSource,
        ).toMatch(
          /\.limit\(SEARCH_SCAN_LIMIT\)/u,
        );

        expect(
          serviceSource,
        ).toContain(
          "ALLOWED_PAGE_SIZES",
        );
      },
    );

    it(
      "uses canonical complaint lifecycle states",
      () => {
        for (
          const status of [
            "submitted",
            "under_review",
            "awaiting_customer",
            "awaiting_provider",
            "resolved",
            "dismissed",
            "escalated",
            "closed",
          ]
        ) {
          expect(
            serviceSource,
          ).toContain(
            `"${status}"`,
          );
        }

        expect(
          serviceSource,
        ).toContain(
          "permittedTransitions",
        );

        expect(
          serviceSource,
        ).toContain(
          "validateTransition",
        );
      },
    );

    it(
      "validates public and private administrative explanations",
      () => {
        expect(
          serviceSource,
        ).toContain(
          "validatePublicResponse",
        );

        expect(
          serviceSource,
        ).toMatch(
          /internalReason[\s\S]*?10[\s\S]*?2000/u,
        );

        expect(
          serviceSource,
        ).toContain(
          "reason: internalReason",
        );
      },
    );

    it(
      "writes complaint decisions and audit evidence atomically",
      () => {
        expect(
          serviceSource,
        ).toContain(
          "adminDb.runTransaction",
        );

        expect(
          serviceSource,
        ).toMatch(
          /transaction\.update\(\s*complaintReference/u,
        );

        expect(
          serviceSource,
        ).toMatch(
          /transaction\.create\(\s*auditReference/u,
        );

        expect(
        serviceSource,
        ).toMatch(
        /targetCollection:\s*COMPLAINTS_COLLECTION/u,
        );

        expect(
          serviceSource,
        ).toContain(
          'source: "web_admin"',
        );
      },
    );

    it(
      "keeps private reasons out of the recipient-readable complaint update",
      () => {
        const updateStart =
          serviceSource.indexOf(
            "const complaintUpdate",
          );

        const updateEnd =
          serviceSource.indexOf(
            "transaction.update(",
            updateStart,
          );

        expect(
          updateStart,
        ).toBeGreaterThan(-1);

        expect(
          updateEnd,
        ).toBeGreaterThan(
          updateStart,
        );

        const complaintUpdateSection =
          serviceSource.slice(
            updateStart,
            updateEnd,
          );

        expect(
          complaintUpdateSection,
        ).not.toContain(
          "internalReason",
        );
      },
    );

    it(
      "creates backend-controlled owned notifications",
      () => {
        expect(
          serviceSource,
        ).toContain(
          "createComplaintNotification",
        );

        expect(
          serviceSource,
        ).toContain(
          "createProviderResponseNotification",
        );

        expect(
          serviceSource,
        ).toContain(
          "userId: recipientId",
        );

        expect(
        serviceSource,
        ).toMatch(
        /relatedCollection:\s*COMPLAINTS_COLLECTION/u,
        );

        expect(
          serviceSource,
        ).toContain(
          "createdAt: timestamp",
        );
      },
    );

    it(
      "does not accept forged administrative fields from the client",
      () => {
        expect(
          typeSource,
        ).toMatch(
          /ManageAdminComplaintInput[\s\S]*?complaintId:[\s\S]*?decision:[\s\S]*?priority:[\s\S]*?publicResponse:[\s\S]*?internalReason:/u,
        );

        const inputStart =
          typeSource.indexOf(
            "export type ManageAdminComplaintInput",
          );

        const inputEnd =
          typeSource.indexOf(
            "};",
            inputStart,
          );

        const inputContract =
          typeSource.slice(
            inputStart,
            inputEnd,
          );

        for (
          const forbiddenField of [
            "actorId",
            "administratorId",
            "createdAt",
            "updatedAt",
            "resolvedAt",
            "resolvedBy",
            "assignedAdminId",
            "assignedAt",
            "recipientId",
          ]
        ) {
          expect(
            inputContract,
          ).not.toContain(
            forbiddenField,
          );
        }
      },
    );

    it(
      "creates new complaints with complete safe defaults",
      () => {
        expect(
          createComplaintSource,
        ).toContain(
          'status: "submitted"',
        );

        expect(
          createComplaintSource,
        ).toContain(
          'priority: "normal"',
        );

        expect(
          createComplaintSource,
        ).toContain(
          "assignedAdminId: null",
        );

        expect(
          createComplaintSource,
        ).toContain(
          "resolution: null",
        );

        expect(
          createComplaintSource,
        ).toContain(
          "isDeleted: false",
        );
      },
    );

    it(
      "declares the composite indexes required by complaint filters",
      () => {
        const complaintIndexes =
          (
            indexConfiguration
              .indexes ?? []
          ).filter(
            (index) =>
              index.collectionGroup ===
              "complaints",
          );

        const fieldSignatures =
          complaintIndexes.map(
            (index) =>
              (
                index.fields ?? []
              )
                .map(
                  (field) =>
                    `${field.fieldPath}:${field.order}`,
                )
                .join("|"),
          );

        expect(
          fieldSignatures,
        ).toContain(
          "isDeleted:ASCENDING|createdAt:DESCENDING",
        );

        expect(
          fieldSignatures,
        ).toContain(
          "priority:ASCENDING|isDeleted:ASCENDING|createdAt:DESCENDING",
        );

        expect(
          fieldSignatures,
        ).toContain(
          "status:ASCENDING|priority:ASCENDING|isDeleted:ASCENDING|createdAt:DESCENDING",
        );
      },
    );
  },
);