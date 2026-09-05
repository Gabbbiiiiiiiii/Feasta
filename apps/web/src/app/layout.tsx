import type {Metadata} from "next";

import {FeastaToaster} from "@/components/feedback/toast";
import {FirebaseBrowserInitializer} from "@/components/providers/firebase-browser-initializer";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FEASTA",
    template: "%s | FEASTA",
  },
  description:
    "Find event providers, compare packages, and manage FEASTA bookings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col">
        <FirebaseBrowserInitializer />

        {children}

        <FeastaToaster />
      </body>
    </html>
  );
}