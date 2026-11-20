import type {Metadata} from "next";
import type {ReactNode} from "react";

export const metadata: Metadata = {
  title: "Verify Email | FEASTA Provider",
  description:
    "Verify your email address to continue setting up your FEASTA Provider account.",
};

export default function ProviderVerifyEmailLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}