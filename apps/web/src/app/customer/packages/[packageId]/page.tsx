import type {Metadata} from "next";
import {notFound} from "next/navigation";

import {PackageDetail} from "@/components/customer/packages/package-detail";
import {getPublicPackageDetail} from "@/lib/customer/discovery/package-detail-service";

type CustomerPackageDetailPageProps = {
  params: Promise<{
    packageId: string;
  }>;
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
}: CustomerPackageDetailPageProps) {
  const {packageId} = await params;

  const detail = await getPublicPackageDetail(packageId);

  if (!detail) {
    notFound();
  }

  return (
    <PackageDetail
      detail={detail}
    />
  );
}