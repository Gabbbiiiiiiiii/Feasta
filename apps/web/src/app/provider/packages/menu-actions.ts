"use server";

import {revalidatePath} from "next/cache";
import {loadProviderMenu, saveProviderMenu} from "@/lib/provider/provider-menu-service";
import {requireApprovedProvider} from "@/lib/auth/session";

export async function loadProviderMenuAction() {
  return loadProviderMenu();
}

export async function saveProviderMenuAction(input: {revision: number; images: unknown}) {
  const account = await requireApprovedProvider();
  try {
    const menu = await saveProviderMenu(input);
    revalidatePath("/provider/packages");
    revalidatePath(`/customer/providers/${account.providerId}`);
    return {ok: true as const, menu};
  } catch (error) {
    return {ok: false as const, error: error instanceof Error ? error.message : "The menu could not be saved."};
  }
}
