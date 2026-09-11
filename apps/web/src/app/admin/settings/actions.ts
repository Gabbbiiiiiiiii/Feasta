"use server";

import {
  updateAdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-service";
import type {
  UpdateAdminPlatformSettingsInput,
  UpdateAdminPlatformSettingsResult,
} from "@/lib/admin/settings/admin-settings-types";
import {requireAdmin} from "@/lib/auth/session";

export async function updateAdminPlatformSettingsAction(
  input: UpdateAdminPlatformSettingsInput,
): Promise<UpdateAdminPlatformSettingsResult> {
  await requireAdmin();

  return updateAdminPlatformSettings(input);
}