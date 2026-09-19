const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(
  __dirname,
  "../src",
);

const source = (relative) =>
  readFileSync(
    path.join(root, relative),
    "utf8",
  );

const domain = source(
  "packages/package-domain.ts",
);

const createPackage = source(
  "packages/create-provider-package.ts",
);

const updatePackage = source(
  "packages/update-provider-package.ts",
);

const publishPackage = source(
  "packages/publish-provider-package.ts",
);

const archivePackage = source(
  "packages/archive-provider-package.ts",
);

const index = source("index.ts");

test(
  "provider package callables remain exported",
  () => {
    for (const name of [
      "createProviderPackage",
      "updateProviderPackage",
      "publishProviderPackage",
      "archiveProviderPackage",
    ]) {
      assert.ok(
        index.includes(name),
        `${name} must remain exported`,
      );
    }
  },
);

test(
  "provider package callables enforce trusted callable controls",
  () => {
    for (const [
      name,
      content,
    ] of [
      [
        "createProviderPackage",
        createPackage,
      ],
      [
        "updateProviderPackage",
        updatePackage,
      ],
      [
        "publishProviderPackage",
        publishPackage,
      ],
      [
        "archiveProviderPackage",
        archivePackage,
      ],
    ]) {
      for (const control of [
        "requireAuth(request)",
        "requireRole",
        "enforceCallableRateLimit",
        "appCheckCallableOptions",
      ]) {
        assert.ok(
          content.includes(control),
          `${name} is missing ${control}`,
        );
      }

      assert.ok(
        content.includes(
          "USER_ROLES.provider",
        ),
        `${name} must require the provider role`,
      );

      assert.ok(
        content.includes(
          "authorizeProviderForPackageManagement",
        ),
        `${name} must authorize provider ownership`,
      );
    }
  },
);

test(
  "new packages are always server-created as private drafts",
  () => {
    for (const projection of [
      'status: "draft"',
      "isActive: false",
      "isPublished: false",
      "providerPubliclyVisible: false",
      "publishedAt: null",
      "isDeleted: false",
    ]) {
      assert.ok(
        createPackage.includes(
          projection,
        ),
        `createProviderPackage must set ${projection}`,
      );
    }
  },
);

test(
  "package creation does not accept trusted lifecycle or ownership fields",
  () => {
    const allowedFields =
      createPackage.slice(
        createPackage.indexOf(
          "const ALLOWED_FIELDS",
        ),
        createPackage.indexOf(
          "] as const",
          createPackage.indexOf(
            "const ALLOWED_FIELDS",
          ),
        ) + "] as const".length,
      );

    for (const forbidden of [
      "providerId",
      "ownerId",
      "status",
      "isActive",
      "isPublished",
      "providerPubliclyVisible",
      "publishedAt",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
      "isDeleted",
      "deletedAt",
      "deletedBy",
      "deletionReason",
    ]) {
      assert.equal(
        allowedFields.includes(
          `"${forbidden}"`,
        ),
        false,
        `${forbidden} must not be client-controlled during package creation`,
      );
    }

    assert.ok(
      createPackage.includes(
        "rejectUnknownFields",
      ),
    );
  },
);

test(
  "draft updates preserve server-owned private lifecycle state",
  () => {
    assert.ok(
      updatePackage.includes(
        "assertDraftPackage",
      ),
    );

    for (const projection of [
      'status: "draft"',
      "isActive: false",
      "isPublished: false",
      "providerPubliclyVisible:",
      "false",
      "publishedAt: null",
    ]) {
      assert.ok(
        updatePackage.includes(
          projection,
        ),
        `draft update must preserve ${projection}`,
      );
    }
  },
);

test(
  "package domain restricts package management to owned operational providers",
  () => {
    assert.ok(
      domain.includes(
        "providerOwnerId",
      ) ||
        domain.includes(
          "ownerId",
        ),
    );

    assert.ok(
      domain.includes(
        "ownerId !== actorUid",
      ),
    );

    assert.ok(
      domain.includes(
        "isApprovedProviderForOperations",
      ),
    );

    assert.ok(
      domain.includes(
        'providerServiceType !== "catering"',
      ),
    );

    assert.ok(
      domain.includes(
        'providerServiceType !== "both"',
      ),
    );
  },
);

test(
  "package domain validates provider event and guest capabilities",
  () => {
    assert.ok(
      domain.includes(
        "eventTypesSupported",
      ),
    );

    assert.ok(
      domain.includes(
        "minGuestsPerEvent",
      ),
    );

    assert.ok(
      domain.includes(
        "maxGuestsPerEvent",
      ),
    );

    assert.ok(
      domain.includes(
        "assertPackageMatchesProviderCapabilities",
      ),
    );
  },
);

test(
  "package input validates guest range and trusted monetary values",
  () => {
    assert.ok(
      domain.includes(
        "maximumGuests < minimumGuests",
      ),
    );

    assert.ok(
      domain.includes(
        "requiredMoney",
      ),
    );

    assert.ok(
      domain.includes(
        "requiredPercentage",
      ),
    );

    assert.ok(
      domain.includes(
        "requiredPositiveInteger",
      ),
    );

    assert.ok(
      domain.includes(
        "inclusionArray",
      ),
    );
  },
);

test(
  "package publication requires a valid draft and public provider eligibility",
  () => {
    for (const control of [
      "assertDraftPackage",
      "assertPackagePublishable",
      "assertPackageMatchesProviderCapabilities",
      "isProviderPubliclyEligible",
    ]) {
      assert.ok(
        publishPackage.includes(
          control,
        ),
        `publishProviderPackage is missing ${control}`,
      );
    }
  },
);

test(
  "package publication creates the complete marketplace visibility projection",
  () => {
    for (const projection of [
      'status: "published"',
      "isActive: true",
      "isPublished: true",
      "providerPubliclyVisible:",
      "true",
      "publishedAt:",
      "serverTimestamp()",
    ]) {
      assert.ok(
        publishPackage.includes(
          projection,
        ),
        `publishProviderPackage must set ${projection}`,
      );
    }
  },
);

test(
  "package archive only accepts published packages and removes public visibility",
  () => {
    assert.ok(
      archivePackage.includes(
        "assertPublishedPackage",
      ),
    );

    for (const projection of [
      'status: "archived"',
      "isActive: false",
      "isPublished: false",
      "providerPubliclyVisible:",
      "false",
      "publishedAt: null",
    ]) {
      assert.ok(
        archivePackage.includes(
          projection,
        ),
        `archiveProviderPackage must set ${projection}`,
      );
    }
  },
);

test(
  "package lifecycle contains only draft published and archived",
  () => {
    const statusBlock =
      domain.slice(
        domain.indexOf(
          "export const PACKAGE_STATUSES",
        ),
        domain.indexOf(
          "] as const",
          domain.indexOf(
            "export const PACKAGE_STATUSES",
          ),
        ) + "] as const".length,
      );

    assert.ok(
      statusBlock.includes(
        '"draft"',
      ),
    );

    assert.ok(
      statusBlock.includes(
        '"published"',
      ),
    );

    assert.ok(
      statusBlock.includes(
        '"archived"',
      ),
    );

    assert.equal(
      statusBlock.includes(
        '"active"',
      ),
      false,
    );

    assert.equal(
      statusBlock.includes(
        '"inactive"',
      ),
      false,
    );
  },
);