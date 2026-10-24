import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

import {
  AUTH_FIXTURE_ACCOUNTS,
  AUTH_FIXTURE_MARKER,
  SEEDED_TOP_LEVEL_COLLECTIONS,
} from "./auth-emulator-fixtures.ts";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const expectEmpty = process.argv.includes("--expect-empty");
const createUnrelatedSentinel = process.argv.includes(
  "--create-unrelated-sentinel",
);
const expectFixturesEmpty = process.argv.includes("--expect-fixtures-empty");
for (const [name, fallback] of [
  ["FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:49099"],
  ["FIRESTORE_EMULATOR_HOST", "127.0.0.1:48080"],
  ["FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:49199"],
] as const) {
  process.env[name] ??= fallback;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[name] ?? "")) {
    throw new Error(`${name} must point to a local emulator.`);
  }
}

const app = getApps()[0] ?? initializeApp({
  projectId,
  storageBucket: `${projectId}.appspot.com`,
});
const auth = getAuth(app);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

if (createUnrelatedSentinel) {
  await auth.createUser({
    uid: "tooling-unrelated-sentinel",
    email: "unrelated-sentinel@local.invalid",
    password: ["Local", "Sentinel!", "2026"].join(""),
    emailVerified: true,
  });
  await db.doc("toolingSentinels/unrelated").set({
    purpose: "Proves targeted fixture cleanup preserves unrelated data.",
  });
  console.log("Unrelated emulator sentinel created.");
} else if (expectFixturesEmpty) {
  for (const account of AUTH_FIXTURE_ACCOUNTS) {
    await assertAuthUserMissing(account.uid);
  }
  for (const collectionName of SEEDED_TOP_LEVEL_COLLECTIONS) {
    const fixtureDocuments = await db
      .collection(collectionName)
      .where("emulatorFixture", "==", AUTH_FIXTURE_MARKER)
      .limit(1)
      .get();
    if (!fixtureDocuments.empty) {
      throw new Error(
        `Targeted fixture cleanup left ${collectionName} data behind.`,
      );
    }
  }
  const sentinelUser = await auth.getUser("tooling-unrelated-sentinel");
  const sentinelDocument = await db.doc("toolingSentinels/unrelated").get();
  if (
    sentinelUser.email !== "unrelated-sentinel@local.invalid" ||
    !sentinelDocument.exists
  ) {
    throw new Error("Targeted fixture cleanup removed unrelated emulator data.");
  }
  console.log("Targeted fixture cleanup preserved unrelated emulator data.");
} else if (!expectEmpty) {
  const customer = await auth.getUser("dev-customer");
  if (customer.email !== "customer@feasta.test") {
    throw new Error("Seeded customer Auth account is missing or invalid.");
  }
  const [user, provider, payment] = await Promise.all([
    db.doc("users/dev-customer").get(),
    db.doc("providers/provider-approved").get(),
    db.doc("payments/payment-seed-deposit").get(),
  ]);
  if (!user.exists || !provider.exists || !payment.exists) {
    throw new Error("Required deterministic Firestore seed data is missing.");
  }
  for (const account of AUTH_FIXTURE_ACCOUNTS) {
    const authUser = await auth.getUser(account.uid);
    if (
      authUser.email !== account.email ||
      authUser.emailVerified !== account.emailVerified ||
      authUser.disabled !== (account.disabled ?? false)
    ) {
      throw new Error(`Auth fixture ${account.uid} is out of sync.`);
    }
    const userDocument = await db.doc(`users/${account.uid}`).get();
    if (account.omitFirestoreProfile) {
      if (userDocument.exists) {
        throw new Error(`${account.uid} must remain an Auth-only fixture.`);
      }
      continue;
    }
    const data = userDocument.data();
    if (
      !userDocument.exists ||
      data?.role !== account.role ||
      data?.accountStatus !== (account.accountStatus ?? "active") ||
      data?.isBlocked !== (account.isBlocked ?? false) ||
      data?.isEmailVerified !== account.emailVerified ||
      data?.isPhoneVerified !== (account.isPhoneVerified ?? false)
    ) {
      throw new Error(`Firestore fixture ${account.uid} is out of sync.`);
    }
    if (account.providerId && account.providerVerificationStatus) {
      const provider = await db.doc(`providers/${account.providerId}`).get();
      const verification = await db
        .doc(`providerVerifications/verification-${account.providerId}`)
        .get();
      if (
        provider.data()?.ownerId !== account.uid ||
        provider.data()?.verificationStatus !==
          account.providerVerificationStatus ||
        verification.data()?.status !== account.providerVerificationStatus
      ) {
        throw new Error(`Provider fixture ${account.uid} is out of sync.`);
      }
    }
  }
  await bucket.file("phase3-validation/reset-check.txt").save("reset me", {
    contentType: "text/plain",
  });
  console.log("Seed state validated and Storage reset fixture created.");
} else {
  const [users, userDocuments, files] = await Promise.all([
    auth.listUsers(1),
    db.collection("users").limit(1).get(),
    bucket.getFiles({maxResults: 1}),
  ]);
  if (users.users.length !== 0 || !userDocuments.empty || files[0].length !== 0) {
    throw new Error(
      "Emulator reset left data behind: " +
      `auth=${users.users.length}, firestore=${userDocuments.size}, ` +
      `storage=${files[0].length}.`,
    );
  }
  console.log("Auth, Firestore, and Storage reset state validated.");
}

async function assertAuthUserMissing(uid: string): Promise<void> {
  try {
    await auth.getUser(uid);
    throw new Error(`Auth fixture ${uid} still exists.`);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "auth/user-not-found"
    ) {
      return;
    }
    throw error;
  }
}
