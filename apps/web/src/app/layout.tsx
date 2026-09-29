import type {Metadata} from "next";
import {Playfair_Display, Plus_Jakarta_Sans} from "next/font/google";

import {FeastaToaster} from "@/components/feedback/toast";
import {FirebaseBrowserInitializer} from "@/components/providers/firebase-browser-initializer";

import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-playfair",
});

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
      className={`${plusJakartaSans.variable} ${playfairDisplay.variable} h-full antialiased`}
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