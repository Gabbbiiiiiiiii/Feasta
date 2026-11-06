import "server-only";

import {requireAdmin} from "@/lib/auth/session";
import {redirect} from "next/navigation";

/** Retired private-draft approval review; protected publication data is retained. */
export default async function AdminProviderOccasionsPage() {
  await requireAdmin();
  redirect("/admin/providers");
}
