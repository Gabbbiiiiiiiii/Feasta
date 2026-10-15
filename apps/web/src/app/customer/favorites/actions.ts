"use server";

import {revalidatePath} from "next/cache";

import {
  setCustomerProviderFavorite,
} from "@/lib/customer/favorites/customer-favorite-service";
import {isPublicProviderId} from "@/lib/customer/providers/provider-route-policy";
import {
  requireCustomer,
  requireVerifiedEmail,
} from "@/lib/auth/session";

export async function setProviderFavoriteAction(input: {
  providerId: string;
  favorite: boolean;
}): Promise<{favorited: boolean}> {
  const account = requireVerifiedEmail(await requireCustomer());
  if (
    !isPublicProviderId(input.providerId) ||
    typeof input.favorite !== "boolean"
  ) {
    throw new Error("A valid provider favorite is required.");
  }

  const favorited = await setCustomerProviderFavorite({
    customerId: account.uid,
    providerId: input.providerId,
    favorite: input.favorite,
  });

  revalidatePath("/customer/providers");
  revalidatePath(`/customer/providers/${input.providerId}`);
  revalidatePath("/customer/favorites");
  revalidatePath("/customer");

  return {favorited};
}
