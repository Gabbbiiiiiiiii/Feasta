"use server";

import {
  loadAdminNotificationMenuSummary,
  loadAdminNotificationPage,
  markOwnedAdminNotificationRead,
  markOwnedAdminNotificationsRead,
  type AdminNotificationMenuSummary,
  type AdminNotificationPage,
} from "@/lib/notifications/admin-notification-service";

export async function loadAdminNotificationsAction(
  requestedLimit: number,
): Promise<AdminNotificationPage> {
  return loadAdminNotificationPage(requestedLimit);
}
export async function loadAdminNotificationMenuAction(): Promise<
  AdminNotificationMenuSummary
> {
  return loadAdminNotificationMenuSummary();
}
export async function markAdminNotificationReadAction(
  notificationId: string,
): Promise<{updated: boolean}> {
  return markOwnedAdminNotificationRead(notificationId);
}

export async function markAdminNotificationsReadAction(
  notificationIds: readonly string[],
): Promise<{updatedCount: number}> {
  return markOwnedAdminNotificationsRead(notificationIds);
}