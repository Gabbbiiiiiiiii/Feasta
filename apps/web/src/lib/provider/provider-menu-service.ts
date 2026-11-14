import "server-only";

import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/lib/firebase/admin";
import {requireApprovedProvider} from "@/lib/auth/session";
import {isPublicProviderRecord} from "@/lib/customer/providers/provider-normalization";
import {providerContentCapabilities} from "./provider-content-capabilities";
import {CATALOG_IMAGE_BYTES} from "./catalog-media";
import {menuAssetPublicId, parseProviderMenu, type ProviderMenu, type ProviderMenuImage} from "./provider-menu";

async function menuAccount() {
  const account = await requireApprovedProvider();
  if (!account.provider || !providerContentCapabilities(account.provider.providerServiceType, account.provider.serviceCategories).catering) {
    throw new Error("Menu management requires a catering service configuration.");
  }
  return {...account, providerId: account.provider.id};
}

export async function loadProviderMenu(): Promise<ProviderMenu> {
  const account = await menuAccount();
  const snapshot = await adminDb.collection("providers").doc(account.providerId).collection("catalog").doc("menu").get();
  const data = snapshot.data();
  return {revision: data?.revision ?? 0, images: data?.images ? parseProviderMenu(data.images, account.uid) : []};
}

export async function saveProviderMenu(input: {revision: number; images: unknown}): Promise<ProviderMenu> {
  const account = await menuAccount();
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("Invalid menu revision.");
  const images = parseProviderMenu(input.images, account.uid);
  const providerRef = adminDb.collection("providers").doc(account.providerId);
  const menuRef = providerRef.collection("catalog").doc("menu");
  // Verify before the transaction, then check ownership and revision atomically.
  const previous = (await menuRef.get()).data();
  const previousImages = previous?.images ? parseProviderMenu(previous.images, account.uid) : [];
  for (const image of images) {
    if (!previousImages.some((saved) => saved.id === image.id && saved.url === image.url)) {
      await verifyMenuAsset(image, account.uid);
    }
  }
  await adminDb.runTransaction(async (transaction) => {
    const [providerSnapshot, userSnapshot, menuSnapshot] = await Promise.all([
      transaction.get(providerRef),
      transaction.get(adminDb.collection("users").doc(account.uid)),
      transaction.get(menuRef),
    ]);
    const provider = providerSnapshot.data() ?? {};
    const owner = userSnapshot.data() ?? {};
    if (provider.ownerId !== account.uid || provider.verificationStatus !== "approved" || provider.isActive !== true ||
      provider.isSuspended === true || provider.isDeleted === true || owner.role !== "provider" ||
      owner.providerId !== account.providerId || owner.accountStatus !== "active" || owner.isActive === false || owner.isBlocked === true ||
      !providerContentCapabilities(provider.providerServiceType, Array.isArray(provider.serviceCategories) ? provider.serviceCategories : []).catering) {
      throw new Error("Your provider account cannot manage this menu.");
    }
    if (images.some((image) => image.isPublished) && !isPublicProviderRecord(account.providerId, provider, owner)) {
      throw new Error("Only approved public providers can publish menu images.");
    }
    const current = menuSnapshot.data();
    if ((current?.revision ?? 0) !== input.revision) throw new Error("This menu changed in another session. Close and reopen the editor before saving.");
    transaction.set(menuRef, {
      providerId: account.providerId,
      images,
      revision: input.revision + 1,
      createdAt: current?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {revision: input.revision + 1, images};
}

async function verifyMenuAsset(image: ProviderMenuImage, ownerId: string): Promise<void> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Menu image verification is not configured. Contact FEASTA support.");
  const publicId = menuAssetPublicId(image.url, ownerId);
  if (!publicId) throw new Error("This image does not belong to your provider account.");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload/${encodeURIComponent(publicId)}`, {
    headers: {Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`},
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("The uploaded menu image could not be verified. Please try again.");
  const resource = await response.json() as Record<string, unknown>;
  if (resource.public_id !== publicId || resource.secure_url !== image.url || resource.resource_type !== "image" ||
    typeof resource.bytes !== "number" || !Number.isSafeInteger(resource.bytes) || resource.bytes <= 0 || resource.bytes > CATALOG_IMAGE_BYTES ||
    !["jpg", "jpeg", "png", "webp"].includes(String(resource.format))) throw new Error("The uploaded menu image is invalid.");
}
