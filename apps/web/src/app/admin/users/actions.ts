"use server";

import {
  getAdminUserPage,
  updateAdminUserAccountStatus,
  updateAdminUserBlockedStatus,
} from "@/lib/admin/users/admin-user-service";
import type {
  AdminUserFilters,
  AdminUserPage,
} from "@/lib/admin/users/admin-user-types";
import { requireAdmin } from "@/lib/auth/session";

export async function loadAdminUsersAction(
  filters: AdminUserFilters,
): Promise<AdminUserPage> {
  await requireAdmin();

  return getAdminUserPage(filters);
}

export async function updateAccountStatusAction(input: {
  userId: string;
  isActive: boolean;
}): Promise<void> {
  await requireAdmin();

  await updateAdminUserAccountStatus(input);
}

export async function updateBlockedStatusAction(input: {
  userId: string;
  isBlocked: boolean;
}): Promise<void> {
  await requireAdmin();

  await updateAdminUserBlockedStatus(input);
}