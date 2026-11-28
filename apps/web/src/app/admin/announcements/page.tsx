import {AnnouncementManagementClient} from "@/components/admin/announcements/announcement-management-client";
import {getAdminAnnouncementPage} from "@/lib/admin/announcements/admin-announcement-service";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const initialPage = await getAdminAnnouncementPage({
    search: "",
    status: "all",
    audience: "all",
    pageSize: 10,
    cursor: null,
  });

  return <AnnouncementManagementClient initialPage={initialPage} />;
}
