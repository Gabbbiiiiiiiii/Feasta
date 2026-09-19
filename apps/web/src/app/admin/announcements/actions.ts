"use server";

import {revalidatePath} from "next/cache";

import {
  archiveAnnouncement,
  createAnnouncement,
  getAdminAnnouncementPage,
  publishAnnouncement,
  updateAnnouncement,
} from "@/lib/admin/announcements/admin-announcement-service";
import type {
  AdminAnnouncementFilters,
  AdminAnnouncementPage,
  CreateAnnouncementResult,
} from "@/lib/admin/announcements/admin-announcement-types";
import {requireAdmin} from "@/lib/auth/session";

export async function loadAdminAnnouncementsAction(
  filters: AdminAnnouncementFilters,
): Promise<AdminAnnouncementPage> {
  await requireAdmin();
  return getAdminAnnouncementPage(filters);
}

export async function createAnnouncementAction(
  input: unknown,
): Promise<CreateAnnouncementResult> {
  await requireAdmin();
  const result = await createAnnouncement(input);
  revalidatePath("/admin/announcements");
  return result;
}

export async function updateAnnouncementAction(input: unknown): Promise<void> {
  await requireAdmin();
  await updateAnnouncement(input);
  revalidatePath("/admin/announcements");
}

export async function publishAnnouncementAction(input: unknown): Promise<void> {
  await requireAdmin();
  await publishAnnouncement(input);
  revalidatePath("/admin/announcements");
}

export async function archiveAnnouncementAction(input: unknown): Promise<void> {
  await requireAdmin();
  await archiveAnnouncement(input);
  revalidatePath("/admin/announcements");
}
