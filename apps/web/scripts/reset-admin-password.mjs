import {readFile} from "node:fs/promises";
import process from "node:process";
import readline from "node:readline";
import {applicationDefault, cert, getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

async function loadLocalEnvironment() {
  const envUrl = new URL("../.env.local", import.meta.url);

  try {
    const contents = await readFile(envUrl, "utf8");

    for (const line of contents.split(/\r?\n/u)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;

      const key = trimmed.slice(0, separator).trim();

      if (process.env[key] !== undefined) continue;

      let value = trimmed.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function initializeFirebaseAdmin() {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      "FIREBASE_ADMIN_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID is required.",
    );
  }

  const useEmulators =
    process.env.USE_FIREBASE_EMULATORS === "true" ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

  if (useEmulators) {
    throw new Error(
      "Administrator password recovery is disabled while Firebase emulator mode is enabled.",
    );
  }

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();

  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ?.replace(/\\n/g, "\n")
      .trim();

  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    throw new Error(
      "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY must be configured together.",
    );
  }

  const options = {projectId};

  options.credential =
    clientEmail && privateKey
      ? cert({
          projectId,
          clientEmail,
          privateKey,
        })
      : applicationDefault();

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp(options);

  return {
    auth: getAuth(app),
    db: getFirestore(app),
    projectId,
  };
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askSecret(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Password recovery requires an interactive trusted terminal.",
    );
  }

  return new Promise((resolve, reject) => {
    let value = "";

    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Recovery cancelled."));
        return;
      }

      if (character === "\r" || character === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }

      if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        return;
      }

      if (character >= " ") {
        value += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

function maskedEmail(email) {
  const [local, domain] = email.split("@");

  if (!local || !domain) return "administrator";

  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  await loadLocalEnvironment();

  console.log("");
  console.log("====================================");
  console.log(" FEASTA Administrator Recovery");
  console.log("====================================");
  console.log("");

  const {auth, db, projectId} = initializeFirebaseAdmin();

  console.log(`Firebase project: ${projectId}`);
  console.log("");

  const rl = createInterface();

  let email;

  try {
    email = (
      await ask(
        rl,
        "Enter the administrator email to recover: ",
      )
    ).toLowerCase();
  } finally {
    rl.close();
  }

  if (!email || !email.includes("@")) {
    throw new Error("A valid administrator email is required.");
  }

  console.log("");
  console.log("Verifying administrator account...");

  const authUser = await auth.getUserByEmail(email);

  const userSnapshot = await db
    .collection("users")
    .doc(authUser.uid)
    .get();

  if (!userSnapshot.exists) {
    throw new Error(
      "Recovery denied: FEASTA user profile was not found.",
    );
  }

  const profile = userSnapshot.data() ?? {};

  if (profile.role !== "admin") {
    throw new Error(
      "Recovery denied: the account is not a FEASTA administrator.",
    );
  }

  if (authUser.disabled) {
    throw new Error(
      "Recovery denied: the Firebase administrator account is disabled.",
    );
  }

  if (profile.isBlocked === true) {
    throw new Error(
      "Recovery denied: the administrator account is blocked.",
    );
  }

  if (
    profile.accountStatus !== undefined &&
    profile.accountStatus !== "active"
  ) {
    throw new Error(
      "Recovery denied: the administrator account is not active.",
    );
  }

  if (
    profile.isActive !== undefined &&
    profile.isActive !== true
  ) {
    throw new Error(
      "Recovery denied: the administrator account is inactive.",
    );
  }

  console.log(
    `✓ Administrator verified: ${maskedEmail(authUser.email ?? email)}`,
  );

  const newPassword = await askSecret("Enter new password: ");
  const passwordError = validatePassword(newPassword);

  if (passwordError) {
    throw new Error(passwordError);
  }

  const confirmation = await askSecret("Confirm new password: ");

  if (newPassword !== confirmation) {
    throw new Error("Passwords do not match.");
  }

  console.log("");
  console.log("WARNING: This operation will:");
  console.log("- change this administrator's password");
  console.log("- revoke existing Firebase sessions");
  console.log("- record an administrator recovery audit event");
  console.log("");

  const confirmationInterface = createInterface();

  let recoveryConfirmation;

  try {
    recoveryConfirmation = await ask(
      confirmationInterface,
      'Type "RESET" to continue: ',
    );
  } finally {
    confirmationInterface.close();
  }

  if (recoveryConfirmation !== "RESET") {
    throw new Error("Recovery cancelled.");
  }

  console.log("");
  console.log("Updating administrator credentials...");

  await auth.updateUser(authUser.uid, {
    password: newPassword,
  });

  await auth.revokeRefreshTokens(authUser.uid);

  try {
    await db.collection("adminLogs").add({
      action: "admin_password_recovered",
      actorId: authUser.uid,
      actorRole: "admin",
      targetCollection: "users",
      targetId: authUser.uid,
      source: "trusted_cli",
      outcome: "success",
      reasonCode: "administrator_password_recovery",
      summary: "Administrator password recovered through trusted CLI.",
      metadata: {
        method: "trusted_cli",
        sessionsRevoked: true,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (auditError) {
    console.error(
      "WARNING: Password was changed and sessions were revoked, but the audit log could not be written.",
    );
    throw auditError;
  }

  console.log("✓ Password updated.");
  console.log("✓ Existing Firebase sessions revoked.");
  console.log("✓ Recovery event recorded.");
  console.log("");
  console.log("Administrator recovery completed.");
  console.log("Sign in at /admin-login using the new password.");
}

main().catch((error) => {
  console.error("");
  console.error(
    error instanceof Error
      ? `Recovery failed: ${error.message}`
      : "Recovery failed.",
  );

  process.exitCode = 1;
});
