"use server";

import {
  updateAdminFinancialPolicy,
  updateAdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-service";
import type {
  UpdateAdminFinancialPolicyInput,
  UpdateAdminFinancialPolicyResult,
  UpdateAdminPlatformSettingsInput,
  UpdateAdminPlatformSettingsResult,
} from "@/lib/admin/settings/admin-settings-types";
import {requireAdmin} from "@/lib/auth/session";

export async function updateAdminPlatformSettingsAction(
  input: UpdateAdminPlatformSettingsInput,
): Promise<UpdateAdminPlatformSettingsResult> {
  await requireAdmin();

  return updateAdminPlatformSettings(
    input,
  );
}

export async function updateAdminFinancialPolicyAction(
  input: UpdateAdminFinancialPolicyInput,
): Promise<UpdateAdminFinancialPolicyResult> {
  await requireAdmin();

  return updateAdminFinancialPolicy(
    input,
  );
}
