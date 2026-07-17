import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const expectEmpty = process.argv.includes("--expect-empty");
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

if (!expectEmpty) {
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
