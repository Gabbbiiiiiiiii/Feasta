import {requireRole} from "@/lib/auth/session";

export default async function CustomerLayout({children}: {children: React.ReactNode}) {
  await requireRole(["customer"]);
  return children;
}
