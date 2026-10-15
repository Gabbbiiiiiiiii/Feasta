"use server";

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
