import type {Metadata} from "next";
import type {ReactNode} from "react";

export const metadata: Metadata = {
  title: "Verify Mobile | FEASTA Provider",
  description:
    "Verify your registered mobile number to continue your FEASTA Provider onboarding.",
};

export default function ProviderVerifyPhoneLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}