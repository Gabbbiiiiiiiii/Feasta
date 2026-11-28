import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Explore Providers",
  description:
    "Discover catering and event service providers available through the FEASTA.",
};

export default function MarketplaceProvidersLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
