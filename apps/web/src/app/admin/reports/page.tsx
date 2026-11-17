import {redirect} from "next/navigation";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminReportsPage() {
  await requireAdmin();
  redirect("/admin/reports/sales");
}
