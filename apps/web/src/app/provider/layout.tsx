import {requireRole} from "@/lib/auth/session";

export default async function ProviderLayout({children}: {children: React.ReactNode}) {
  await requireRole(["provider"]);
  return children;
}
