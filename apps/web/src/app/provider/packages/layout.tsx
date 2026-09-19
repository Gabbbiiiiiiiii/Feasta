import {requireProviderCatalogAccess} from "@/lib/auth/session";

export default async function ProviderPackagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProviderCatalogAccess();
  return children;
}
