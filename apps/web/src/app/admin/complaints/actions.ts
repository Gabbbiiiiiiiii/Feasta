"use server";

import {
  getAdminComplaintPage,
  manageAdminComplaint,
} from "@/lib/admin/complaints/admin-complaint-service";
import type {
  AdminComplaintFilters,
  AdminComplaintPage,
  ManageAdminComplaintInput,
  ManageAdminComplaintResult,
} from "@/lib/admin/complaints/admin-complaint-types";
import {requireAdmin} from "@/lib/auth/session";

export async function loadAdminComplaintsAction(
  filters: AdminComplaintFilters,
): Promise<AdminComplaintPage> {
  await requireAdmin();

  return getAdminComplaintPage(filters);
}

export async function manageAdminComplaintAction(
  input: ManageAdminComplaintInput,
): Promise<ManageAdminComplaintResult> {
  await requireAdmin();

  return manageAdminComplaint(input);
}