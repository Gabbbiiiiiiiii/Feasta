import type {
  Metadata,
} from "next";
import type {
  ReactNode,
} from "react";

export const metadata: Metadata = {
  title:
    "Verify Mobile | FEASTA",
  description:
    "Verify your mobile number before submitting a FEASTA booking request.",
};

export default function CustomerVerifyPhoneLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}