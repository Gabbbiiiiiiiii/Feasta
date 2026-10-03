import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

const argumentsMap = parseArguments(process.argv.slice(2));
const uid = argumentsMap.get("uid")?.trim();
const projectId = argumentsMap.get("project")?.trim();
const confirmation = argumentsMap.get("confirm");
const reason = argumentsMap.get("reason")?.trim() ??
  "Controlled FEASTA administrator provisioning";
const allowEmulator = argumentsMap.has("allow-emulator");

if (!uid || !projectId) {
  throw new Error(
    "Usage: pnpm admin:provision --uid=<uid> --project=<project-id> " +
    "--confirm=PROVISION_FEASTA_ADMIN [--reason=<reason>]",
  );
}
if (confirmation !== "PROVISION_FEASTA_ADMIN") {
  throw new Error("Explicit --confirm=PROVISION_FEASTA_ADMIN is required.");
}
if (
  (process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.FIRESTORE_EMULATOR_HOST) &&
  !allowEmulator
) {
  throw new Error(
    "Emulator variables are set. Remove them or pass --allow-emulator explicitly.",
  );
}

process.env.GCLOUD_PROJECT = projectId;
const app = getApps()[0] ?? initializeApp({projectId});
const auth = getAuth(app);
const db = getFirestore(app);
const authUser = await auth.getUser(uid);
if (!authUser.email) {
  throw new Error("The existing Firebase Auth user must have an email.");
}
if (authUser.disabled) {
  throw new Error("A disabled Firebase Auth user cannot be provisioned.");
}

const userReference = db.collection("users").doc(uid);
const existingProfile = await userReference.get();
const existingRole = existingProfile.data()?.role;
if (
  existingProfile.exists &&
  existingRole !== "admin"
) {
  throw new Error(
    `Refusing to replace an existing ${String(existingRole)} account role.`,
  );
}
if (
  existingProfile.exists &&
  typeof existingProfile.data()?.providerId === "string"
) {
  throw new Error("Refusing to provision an account linked to a provider.");
}

const previousClaims = authUser.customClaims ?? {};
await auth.setCustomUserClaims(uid, {...previousClaims, role: "admin"});
try {
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(userReference);
    const currentRole = current.data()?.role;
    if (current.exists && currentRole !== "admin") {
      throw new Error("The account role changed during provisioning.");
    }
    const timestamp = FieldValue.serverTimestamp();
    transaction.set(userReference, {
      uid,
      email: authUser.email!.trim().toLowerCase(),
      role: "admin",
      providerId: null,
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
      isEmailVerified: authUser.emailVerified,
      isPhoneVerified: false,
      authProvider: authUser.providerData[0]?.providerId ?? "password",
      createdAt: current.exists
        ? current.data()?.createdAt ?? timestamp
        : timestamp,
      updatedAt: timestamp,
    }, {merge: true});
    const auditReference = db.collection("adminLogs").doc();
    transaction.create(auditReference, {
      actorId: "trusted-provisioning-command",
      targetId: uid,
      action: "admin_account_provisioned",
      reason: reason.slice(0, 500),
      createdAt: timestamp,
    });
  });
} catch (error) {
  await auth.setCustomUserClaims(uid, previousClaims).catch(() => undefined);
  throw error;
}

console.log(
  `Provisioned Firebase Auth UID ${uid} as a FEASTA admin in project ${projectId}.`,
);

function parseArguments(values: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const [name, ...remainder] = value.slice(2).split("=");
    result.set(name, remainder.length > 0 ? remainder.join("=") : "true");
  }
  return result;
}
