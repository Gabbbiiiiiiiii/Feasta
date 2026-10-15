import "server-only";

import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/lib/firebase/admin";
import {requireApprovedProvider} from "@/lib/auth/session";
import {isPublicProviderRecord} from "@/lib/customer/providers/provider-normalization";
import {isPublicProviderId} from "@/lib/customer/providers/provider-route-policy";
import {providerContentCapabilities} from "./provider-content-capabilities";
import {CATALOG_IMAGE_BYTES} from "./catalog-media";
import {menuAssetPublicId} from "./provider-menu";
import {parseProviderSetups, publicProviderSetups, type ProviderSetup, type ProviderSetupGallery} from "./provider-setup-gallery";

async function setupGalleryAccount() {
  const account = await requireApprovedProvider();
  if (!account.provider || !providerContentCapabilities(account.provider.providerServiceType, account.provider.serviceCategories).catering) {
    throw new Error("Setup gallery management requires a catering service configuration.");
  }
  return {...account, providerId: account.provider.id};
}

export async function loadProviderSetupGallery(): Promise<ProviderSetupGallery> {
  const account = await setupGalleryAccount();
  const snapshot = await adminDb.collection("providers").doc(account.providerId).collection("catalog").doc("setups").get();
  const data = snapshot.data();
  return {
    revision: validRevision(data?.revision),
    setups: data?.setups ? parseProviderSetups(data.setups, account.uid) : [],
  };
}

export async function saveProviderSetupGallery(input: {revision: number; setups: unknown}): Promise<ProviderSetupGallery> {
  const account = await setupGalleryAccount();
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("Invalid setup gallery revision.");
  if (!Array.isArray(input.setups)) throw new Error("Invalid setup gallery.");
  const setups = parseProviderSetups(input.setups, account.uid);
  const providerRef = adminDb.collection("providers").doc(account.providerId);
  const setupRef = providerRef.collection("catalog").doc("setups");
  const previous = (await setupRef.get()).data();
  const previousSetups = previous?.setups ? parseProviderSetups(previous.setups, account.uid) : [];
  const previousUrls = new Set(previousSetups.flatMap((setup) => setup.imageUrls));
  for (const url of setups.flatMap((setup) => setup.imageUrls)) {
    if (!previousUrls.has(url)) await verifySetupAsset(url, account.uid);
  }
  await adminDb.runTransaction(async (transaction) => {
    const [providerSnapshot, userSnapshot, setupSnapshot] = await Promise.all([
      transaction.get(providerRef),
      transaction.get(adminDb.collection("users").doc(account.uid)),
      transaction.get(setupRef),
    ]);
    const provider = providerSnapshot.data() ?? {};
    const owner = userSnapshot.data() ?? {};
    if (provider.ownerId !== account.uid || provider.verificationStatus !== "approved" || provider.isActive !== true ||
      provider.isSuspended === true || provider.isDeleted === true || owner.role !== "provider" ||
      owner.providerId !== account.providerId || owner.accountStatus !== "active" || owner.isActive === false || owner.isBlocked === true ||
      !providerContentCapabilities(provider.providerServiceType, Array.isArray(provider.serviceCategories) ? provider.serviceCategories : []).catering) {
      throw new Error("Your provider account cannot manage this setup gallery.");
    }
    if (setups.some((setup) => setup.isPublished) && !isPublicProviderRecord(account.providerId, provider, owner)) {
      throw new Error("Only approved public providers can publish setups.");
    }
    const current = setupSnapshot.data();
    if ((current?.revision ?? 0) !== input.revision) {
      throw new Error("This setup gallery changed in another session. Reload the page before saving.");
    }
    transaction.set(setupRef, {
      providerId: account.providerId,
      setups,
      revision: input.revision + 1,
      createdAt: current?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {revision: input.revision + 1, setups};
}

export async function readPublishedProviderSetups(providerId: string): Promise<ProviderSetup[]> {
  if (!isPublicProviderId(providerId)) return [];
  const providerSnapshot = await adminDb.collection("providers").doc(providerId).get();
  if (!providerSnapshot.exists) return [];
  const provider = providerSnapshot.data() ?? {};
  const ownerId = typeof provider.ownerId === "string" ? provider.ownerId.trim() : "";
  if (!ownerId || ownerId.includes("/")) return [];
  const ownerSnapshot = await adminDb.collection("users").doc(ownerId).get();
  if (!isPublicProviderRecord(providerId, provider, ownerSnapshot.data() ?? {})) return [];
  const categories = Array.isArray(provider.serviceCategories) ? provider.serviceCategories : [];
  if (!providerContentCapabilities(provider.providerServiceType, categories).catering) return [];
  const snapshot = await providerSnapshot.ref.collection("catalog").doc("setups").get();
  return publicProviderSetups(snapshot.data()?.setups, ownerId);
}

async function verifySetupAsset(url: string, ownerId: string): Promise<void> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Setup photo verification is not configured. Contact FEASTA support.");
  const publicId = menuAssetPublicId(url, ownerId);
  if (!publicId) throw new Error("This setup photo does not belong to your provider account.");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload/${encodeURIComponent(publicId)}`, {
    headers: {Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`},
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("The uploaded setup photo could not be verified. Please try again.");
  const resource = await response.json() as Record<string, unknown>;
  if (resource.public_id !== publicId || resource.secure_url !== url || resource.resource_type !== "image" ||
    typeof resource.bytes !== "number" || !Number.isSafeInteger(resource.bytes) || resource.bytes <= 0 || resource.bytes > CATALOG_IMAGE_BYTES ||
    !["jpg", "jpeg", "png", "webp"].includes(String(resource.format))) throw new Error("The uploaded setup photo is invalid.");
}

function validRevision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
