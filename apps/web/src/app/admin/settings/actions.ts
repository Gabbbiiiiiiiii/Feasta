"use server";

import {updateAdminCancellationRollout} from "@/lib/admin/settings/admin-cancellation-rollout-service";

import {
  updateAdminFinancialPolicy,
  updateAdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-service";
import type {
  UpdateAdminCancellationRolloutInput,
  UpdateAdminCancellationRolloutResult,
  UpdateAdminFinancialPolicyInput,
  UpdateAdminFinancialPolicyResult,
  UpdateAdminPlatformSettingsInput,
  UpdateAdminPlatformSettingsResult,
} from "@/lib/admin/settings/admin-settings-types";
import {requireAdmin} from "@/lib/auth/session";

export async function updateAdminCancellationRolloutAction(
  input: UpdateAdminCancellationRolloutInput,
): Promise<UpdateAdminCancellationRolloutResult> {
  await requireAdmin();
  return updateAdminCancellationRollout(input);
}

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
