import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Register Business | FEASTA Provider",
  description:
    "Create your FEASTA Provider account and begin the provider onboarding and verification process.",
};

export default function ProviderRegisterLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}
