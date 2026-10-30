"use server";

import {
  getPublicProviderDetail,
} from "@/lib/customer/providers/provider-detail-service";
import type {
  ProviderMenuImage,
} from "@/lib/provider/provider-menu";

const SAFE_PROVIDER_ID =
  /^[A-Za-z0-9_-]{1,160}$/u;

const SAFE_MENU_ITEM_ID =
  /^[A-Za-z0-9_-]{1,128}$/u;

export async function loadCustomerMenuItemForEditAction(
  input: {
    providerId: string;
    menuItemId: string;
  },
): Promise<ProviderMenuImage | null> {
  const providerId =
    input.providerId.trim();

  const menuItemId =
    input.menuItemId.trim();

  if (
    !SAFE_PROVIDER_ID.test(
      providerId,
    ) ||
    !SAFE_MENU_ITEM_ID.test(
      menuItemId,
    )
  ) {
    return null;
  }

  const detail =
    await getPublicProviderDetail(
      providerId,
    );

  if (!detail) {
    return null;
  }

  return (
    detail.menuImages?.find(
      (item) =>
        item.isPublished &&
        item.id ===
          menuItemId,
    ) ?? null
  );
}