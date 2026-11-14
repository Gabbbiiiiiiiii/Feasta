"use server";

import {privateGalleryResult} from "@/lib/provider/provider-setup-gallery-private-service";
import type {SavePrivateSetupGalleryV2Request} from "@/lib/provider/provider-setup-gallery-v2-writer";
import {revalidatePath} from "next/cache";
import {requireApprovedProvider} from "@/lib/auth/session";
import {loadProviderSetupGallery, saveProviderSetupGallery} from "@/lib/provider/provider-setup-gallery-service";

export async function loadProviderSetupGalleryAction() {
  return loadProviderSetupGallery();
}

export async function saveProviderSetupGalleryAction(input: {revision: number; setups: unknown}) {
  const account = await requireApprovedProvider();
  try {
    const gallery = await saveProviderSetupGallery(input);
    revalidatePath("/provider/packages");
    revalidatePath(`/customer/providers/${account.providerId}`);
    return {ok: true as const, gallery};
  } catch (error) {
    return {ok: false as const, error: error instanceof Error ? error.message : "The setup gallery could not be saved."};
  }
}

/** Private contract only; never revalidate customer pages for draft changes. */
export async function loadPrivateProviderSetupGalleryV2Action(input: {galleryWriteSchemaVersion: 2}) {
  return privateGalleryResult("load", input);
}

export async function savePrivateProviderSetupGalleryV2Action(input: SavePrivateSetupGalleryV2Request) {
  const result = await privateGalleryResult("save", input);
  if (result.ok) revalidatePath("/provider/packages");
  return result;
}
