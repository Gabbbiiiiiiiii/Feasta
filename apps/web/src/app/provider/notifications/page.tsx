import {NotificationsPageClient} from "@/components/notifications/notifications-page-client";
import {
  requireProvider,
  requireVerifiedProviderIdentity,
} from "@/lib/auth/session";

export default async function ProviderNotificationsPage() {
  requireVerifiedProviderIdentity(await requireProvider());
  return <NotificationsPageClient role="provider" />;
}
