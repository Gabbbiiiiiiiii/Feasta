"use server";

import {
  getAdminUserDetails,
  getAdminUserPage,
  manageAdminUserAccountAccess,
} from "@/lib/admin/users/admin-user-service";
import type {
  AdminUserDetailsResult,
  AdminUserFilters,
  AdminUserPage,
  ManageAdminAccountAccessInput,
  ManageAdminAccountAccessResult,
} from "@/lib/admin/users/admin-user-types";
import {
  requireAdmin,
} from "@/lib/auth/session";

export async function loadAdminUsersAction(
  filters: AdminUserFilters,
): Promise<AdminUserPage> {
  await requireAdmin();

  return getAdminUserPage(filters);
}

export async function loadAdminUserDetailsAction(
  userId: string,
): Promise<AdminUserDetailsResult> {
  await requireAdmin();

  return getAdminUserDetails(userId);
}

export async function manageAccountAccessAction(
  input: ManageAdminAccountAccessInput,
): Promise<ManageAdminAccountAccessResult> {
  await requireAdmin();

  return manageAdminUserAccountAccess(input);
}