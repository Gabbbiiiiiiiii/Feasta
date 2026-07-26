import {requireApprovedProvider} from "@/lib/auth/session";

export default async function ProviderPackagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireApprovedProvider();
  return children;
}
