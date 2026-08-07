import {AuditLogBrowserClient} from "@/components/admin/audit-logs/audit-log-browser-client";
import {getAdminAuditLogPage} from "@/lib/admin/audit-logs/admin-audit-log-service";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminAuditLogsPage() {
  await requireAdmin();

  const initialPage = await getAdminAuditLogPage({
    search: "",
    action: "all",
    actorRole: "all",
    source: "all",
    targetCollection: "all",
    fromDate: "",
    toDate: "",
    pageSize: 20,
    cursor: null,
  });

  return <AuditLogBrowserClient initialPage={initialPage} />;
}
