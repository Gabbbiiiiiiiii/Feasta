import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Log in | FEASTA Provider",
  description:
    "Log in to your FEASTA Provider account to manage your provider workspace.",
};

export default function ProviderLoginLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}
