const assert = require("node:assert/strict");
const test = require("node:test");
const media = require("../lib/shared/cloudinary.js");
const {
  parsePackageInput,
  parsePackageImageUrls,
  assertPackagePublishable,
  verifyPackageImages,
} = require("../lib/packages/package-domain.js");

const image = (owner, asset = "poster") =>
  `https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/${owner}/services/${asset}/image.png`;
const legacy = "https://images.example.test/old-package.png";
const input = {
  name: "Birthday package", description: "A birthday celebration package.",
  eventType: "birthday", price: 10000, downPaymentPercentage: 20,
  minimumGuests: 10, maximumGuests: 50, imageUrl: legacy,
  foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
};

test("legacy and zero-image package inputs remain valid without mandatory inclusions", () => {
  const parsed = parsePackageInput(input);
  assert.equal(parsed.imageUrl, legacy);
  assert.equal(parsed.imageUrls, undefined);
  assert.doesNotThrow(() => assertPackagePublishable(input));
  const empty = parsePackageInput({...input, imageUrls: []});
  assert.equal(empty.imageUrl, "");
  assert.deepEqual(empty.imageUrls, []);
});

test("ordered images determine the cover and untrusted input is bounded", () => {
  const urls = [image("owner", "first"), image("owner", "second")];
  const parsed = parsePackageInput({...input, imageUrls: urls});
  assert.equal(parsed.imageUrl, urls[0]);
  assert.deepEqual(parsed.imageUrls, urls);
  for (const invalid of [null, "image", Array(9).fill(urls[0]), [12],
    ["javascript:alert(1)"], ["http://example.test/image.png"],
    ["https://user:password@example.test/image.png"], [urls[0] + "?changed=true"]]) {
    assert.throws(() => parsePackageImageUrls(invalid));
  }
});

test("new images must belong to the authenticated provider", async (context) => {
  const verify = context.mock.method(media, "verifyProviderServiceImage", async () => {});
  await assert.rejects(verifyPackageImages({...input, imageUrls: [image("other")]}, "owner"),
    {code: "permission-denied"});
  await assert.rejects(verifyPackageImages({...input, imageUrls: [legacy]}, "owner"),
    {code: "permission-denied"});
  assert.equal(verify.mock.callCount(), 0);
});

test("each new asset receives trusted Cloudinary verification with the 5 MB limit", async (context) => {
  const verify = context.mock.method(media, "verifyProviderServiceImage", async () => {});
  const urls = [image("owner", "first"), image("owner", "second")];
  await verifyPackageImages({...input, imageUrls: urls}, "owner");
  assert.equal(verify.mock.callCount(), 2);
  assert.deepEqual(verify.mock.calls[0].arguments[0], {
    ownerId: "owner", serviceId: "first", url: urls[0],
    publicId: "feasta/providers/owner/services/first/image", maximumBytes: 5 * 1024 * 1024,
  });
});

test("omitting imageUrls cannot bypass ownership checks through legacy imageUrl", async (context) => {
  const verify = context.mock.method(media, "verifyProviderServiceImage", async () => {});
  await assert.rejects(verifyPackageImages({...input, imageUrl: image("other")}, "owner"),
    {code: "permission-denied"});
  await assert.rejects(verifyPackageImages({...input, imageUrl: "not-a-url"}, "owner"),
    {code: "invalid-argument"});
  await verifyPackageImages({...input, imageUrl: image("owner")}, "owner");
  assert.equal(verify.mock.callCount(), 1);
  await verifyPackageImages(input, "owner", {imageUrl: legacy});
  assert.equal(verify.mock.callCount(), 1);
});

test("only previously stored images bypass new-asset verification", async (context) => {
  const verify = context.mock.method(media, "verifyProviderServiceImage", async () => {});
  await verifyPackageImages({...input, imageUrls: [legacy]}, "owner", {imageUrl: legacy});
  assert.equal(verify.mock.callCount(), 0);
  await verifyPackageImages({...input, imageUrls: [legacy, image("owner")]}, "owner", {imageUrl: legacy});
  assert.equal(verify.mock.callCount(), 1);
});

test("invalid Cloudinary resources reject the mutation", async (context) => {
  context.mock.method(media, "verifyProviderServiceImage", async () => { throw new Error("Invalid resource"); });
  await assert.rejects(verifyPackageImages({...input, imageUrls: [image("owner")]}, "owner"), /Invalid resource/);
});
