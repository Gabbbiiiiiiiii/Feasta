const path = require("node:path");
const {readFileSync} = require("node:fs");
const {
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {doc, setDoc} = require("firebase/firestore");

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";

function emulatorAddress(name, fallbackPort) {
  const value = process.env[name] ?? `127.0.0.1:${fallbackPort}`;
  const normalized = value.replace(/^https?:\/\//, "");
  const separator = normalized.lastIndexOf(":");
  return {
    host: normalized.slice(0, separator),
    port: Number(normalized.slice(separator + 1)),
  };
}

async function createRulesTestEnvironment() {
  const firestore = emulatorAddress("FIRESTORE_EMULATOR_HOST", 38080);
  const storage = emulatorAddress("FIREBASE_STORAGE_EMULATOR_HOST", 39199);
  const repositoryRoot = path.resolve(__dirname, "../../..");

  const configuration = {
    projectId,
    firestore: {
      ...firestore,
      rules: readFileSync(
        path.join(repositoryRoot, "firebase/firestore.rules"),
        "utf8",
      ),
    },
  };
  if (process.env.RULES_FIRESTORE_ONLY !== "true") {
    configuration.storage = {
      ...storage,
      rules: readFileSync(
        path.join(repositoryRoot, "firebase/storage.rules"),
        "utf8",
      ),
    };
  }
  return initializeTestEnvironment(configuration);
}

function authenticated(testEnv, uid, role) {
  return testEnv.authenticatedContext(uid, {
    role,
    email: `${uid}@example.test`,
    email_verified: true,
  });
}

function userData(uid, role, overrides = {}) {
  return {
    uid,
    firstName: uid,
    lastName: "Tester",
    email: `${uid}@example.test`,
    phoneNumber: "+639171234567",
    role,
    accountStatus: "active",
    providerId: role === "provider" ? `${uid}-provider` : null,
    isActive: true,
    isBlocked: false,
    isEmailVerified: true,
    isPhoneVerified: false,
    authProvider: "password",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function seedDocuments(testEnv, documents) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all(Object.entries(documents).map(([documentPath, data]) =>
      setDoc(doc(firestore, documentPath), data),
    ));
  });
}

module.exports = {
  authenticated,
  createRulesTestEnvironment,
  projectId,
  seedDocuments,
  userData,
};
