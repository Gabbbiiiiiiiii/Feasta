import type {Metadata} from "next";
import localFont from "next/font/local";

import {FeastaToaster} from "@/components/feedback/toast";
import {FirebaseBrowserInitializer} from "@/components/providers/firebase-browser-initializer";

import "./globals.css";

const plusJakartaSans = localFont({
  src: "./fonts/plus-jakarta-sans.ttf",
  weight: "200 800",
  display: "swap",
  variable: "--font-plus-jakarta",
});

const playfairDisplay = localFont({
  src: [
    {path: "./fonts/playfair-display.ttf", weight: "400 900", style: "normal"},
    {path: "./fonts/playfair-display-italic.ttf", weight: "400 900", style: "italic"},
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
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