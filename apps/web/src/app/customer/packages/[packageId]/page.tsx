import type {Metadata} from "next";
import {notFound} from "next/navigation";

import {PackageDetail} from "@/components/customer/packages/package-detail";
import {getPublicPackageDetail} from "@/lib/customer/discovery/package-detail-service";
import {parseCustomerEventContext} from "@/lib/customer/planning/event-planning-context";

type CustomerPackageDetailPageProps = {
  params: Promise<{
    packageId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: CustomerPackageDetailPageProps): Promise<Metadata> {
  const {packageId} = await params;
  const detail = await getPublicPackageDetail(packageId);

  if (!detail) {
    return {
      title: "Package Not Found | FEASTA Marketplace",
    };
  }

  return {
    title: {
      absolute: `${detail.packageRecord.name} | FEASTA Marketplace`,
    },
    description:
      detail.packageRecord.description ??
      `Explore ${detail.packageRecord.name} from ${detail.provider.businessName} on FEASTA.`,
  };
}

export default async function CustomerPackageDetailPage({
  params,
  searchParams,
}: CustomerPackageDetailPageProps) {
  const [{packageId}, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);

  const detail = await getPublicPackageDetail(packageId);

  if (!detail) {
    notFound();
  }

  return (
    <PackageDetail
      detail={detail}
      eventContext={parseCustomerEventContext(query)}
    />
  );
}
