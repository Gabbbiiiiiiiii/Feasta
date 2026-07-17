const assert = require("node:assert/strict");
const {after, before, beforeEach, test} = require("node:test");
const {
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} = require("firebase/storage");

const {
  authenticated,
  createRulesTestEnvironment,
  seedDocuments,
  userData,
} = require("./rules-test-helpers.cjs");

let testEnv;

before(async () => {
  testEnv = await createRulesTestEnvironment();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedDocuments(testEnv, {
    "users/customer-owner": userData("customer-owner", "customer"),
    "users/customer-other": userData("customer-other", "customer"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-two",
    }),
    "users/admin-one": userData("admin-one", "admin"),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "draft",
      isActive: false,
    },
    "providers/provider-two": {
      ownerId: "provider-other",
      verificationStatus: "draft",
      isActive: false,
    },
    "bookings/booking-one": {
      customerId: "customer-owner",
      providerId: "provider-one",
      status: "pending",
    },
    "complaints/complaint-one": {
      userId: "customer-owner",
      providerId: "provider-one",
      status: "submitted",
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

function bytes(size = 8) {
  return new Uint8Array(size).fill(7);
}

function imageMetadata() {
  return {contentType: "image/png"};
}

test("profile owner can upload and replace while non-owner is denied", async () => {
  const ownerStorage = authenticated(testEnv, "customer-owner", "customer")
    .storage();
  const otherStorage = authenticated(testEnv, "customer-other", "customer")
    .storage();
  const ownerRef = ref(
    ownerStorage,
    "users/customer-owner/profile/avatar-replace.png",
  );

  await assertSucceeds(uploadBytes(ownerRef, bytes(4), imageMetadata()));
  await assertSucceeds(uploadBytes(ownerRef, bytes(9), imageMetadata()));
  assert.equal((await getBytes(ownerRef)).byteLength, 9);
  await assertFails(uploadBytes(
    ref(otherStorage, "users/customer-owner/profile/intruder.png"),
    bytes(),
    imageMetadata(),
  ));
});

test("profile uploads reject invalid MIME and files over 5 MB", async () => {
  const ownerStorage = authenticated(testEnv, "customer-owner", "customer")
    .storage();

  await assertFails(uploadBytes(
    ref(ownerStorage, "users/customer-owner/profile/not-image.txt"),
    bytes(),
    {contentType: "text/plain"},
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, "users/customer-owner/profile/too-large.png"),
    bytes(5 * 1024 * 1024 + 1),
    imageMetadata(),
  ));
});

test("profile delete is owner-only", async () => {
  const ownerStorage = authenticated(testEnv, "customer-owner", "customer")
    .storage();
  const otherStorage = authenticated(testEnv, "customer-other", "customer")
    .storage();
  const ownerRef = ref(
    ownerStorage,
    "users/customer-owner/profile/avatar-delete.png",
  );
  await uploadBytes(ownerRef, bytes(), imageMetadata());

  await assertFails(deleteObject(ref(
    otherStorage,
    "users/customer-owner/profile/avatar-delete.png",
  )));
  await assertSucceeds(deleteObject(ownerRef));
});

test("provider logo, cover, and package assets resolve provider ownership", async () => {
  const ownerStorage = authenticated(testEnv, "provider-owner", "provider")
    .storage();
  const otherStorage = authenticated(testEnv, "provider-other", "provider")
    .storage();
  const paths = [
    "providers/provider-one/logo/logo.png",
    "providers/provider-one/cover/cover.webp",
    "providers/provider-one/packages/package.jpg",
  ];

  for (const path of paths) {
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, path),
      bytes(),
      imageMetadata(),
    ));
    await assertFails(uploadBytes(
      ref(otherStorage, path.replace(/\.(png|webp|jpg)$/, "-other.png")),
      bytes(),
      imageMetadata(),
    ));
  }
});

test("verification files are owner-uploaded and privately reviewed", async () => {
  const ownerStorage = authenticated(testEnv, "provider-owner", "provider")
    .storage();
  const otherProviderStorage = authenticated(
    testEnv,
    "provider-other",
    "provider",
  ).storage();
  const customerStorage = authenticated(testEnv, "customer-other", "customer")
    .storage();
  const adminStorage = authenticated(testEnv, "admin-one", "admin").storage();
  const path =
    "providers/provider-one/verification/valid_id/private-document.pdf";
  const ownerRef = ref(ownerStorage, path);

  await assertSucceeds(uploadBytes(
    ownerRef,
    bytes(),
    {contentType: "application/pdf"},
  ));
  await assertSucceeds(getBytes(ownerRef));
  await assertFails(getBytes(ref(otherProviderStorage, path)));
  await assertFails(getBytes(ref(customerStorage, path)));
  await assertSucceeds(getBytes(ref(adminStorage, path)));
  await assertFails(deleteObject(ownerRef));
});

test("verification rejects invalid type paths, MIME types, and oversized files", async () => {
  const ownerStorage = authenticated(testEnv, "provider-owner", "provider")
    .storage();

  await assertFails(uploadBytes(
    ref(ownerStorage, "providers/provider-one/verification/not_valid/file.pdf"),
    bytes(),
    {contentType: "application/pdf"},
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, "providers/provider-one/verification/valid_id/file.txt"),
    bytes(),
    {contentType: "text/plain"},
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, "providers/provider-one/verification/valid_id/large.pdf"),
    bytes(10 * 1024 * 1024 + 1),
    {contentType: "application/pdf"},
  ));
});

test("booking attachments are restricted to participants and valid files", async () => {
  const customerStorage = authenticated(testEnv, "customer-owner", "customer")
    .storage();
  const providerStorage = authenticated(testEnv, "provider-owner", "provider")
    .storage();
  const unrelatedStorage = authenticated(testEnv, "customer-other", "customer")
    .storage();
  const customerPath = "bookings/booking-one/attachments/customer.png";
  const providerPath = "bookings/booking-one/attachments/provider.pdf";

  await assertSucceeds(uploadBytes(
    ref(customerStorage, customerPath),
    bytes(),
    imageMetadata(),
  ));
  await assertSucceeds(uploadBytes(
    ref(providerStorage, providerPath),
    bytes(),
    {contentType: "application/pdf"},
  ));
  await assertFails(getBytes(ref(unrelatedStorage, customerPath)));
  await assertFails(uploadBytes(
    ref(unrelatedStorage, "bookings/booking-one/attachments/intruder.png"),
    bytes(),
    imageMetadata(),
  ));
  await assertFails(uploadBytes(
    ref(customerStorage, "bookings/booking-one/attachments/script.js"),
    bytes(),
    {contentType: "application/javascript"},
  ));
  await assertFails(deleteObject(ref(customerStorage, customerPath)));
});

test("complaint evidence follows the documented creator/provider/admin policy", async () => {
  const creatorStorage = authenticated(testEnv, "customer-owner", "customer")
    .storage();
  const providerStorage = authenticated(testEnv, "provider-owner", "provider")
    .storage();
  const unrelatedStorage = authenticated(testEnv, "customer-other", "customer")
    .storage();
  const adminStorage = authenticated(testEnv, "admin-one", "admin").storage();
  const path = "complaints/complaint-one/evidence/evidence.png";

  await assertSucceeds(uploadBytes(
    ref(creatorStorage, path),
    bytes(),
    imageMetadata(),
  ));
  await assertSucceeds(getBytes(ref(providerStorage, path)));
  await assertSucceeds(getBytes(ref(adminStorage, path)));
  await assertFails(getBytes(ref(unrelatedStorage, path)));
  await assertFails(uploadBytes(
    ref(providerStorage, "complaints/complaint-one/evidence/provider.png"),
    bytes(),
    imageMetadata(),
  ));
  await assertFails(uploadBytes(
    ref(creatorStorage, "complaints/complaint-one/evidence/malware.exe"),
    bytes(),
    {contentType: "application/octet-stream"},
  ));
  await assertFails(deleteObject(ref(creatorStorage, path)));
});
