import Link from "next/link";

﻿import {
  getProviderBusinessProfile,
} from "@/lib/provider/business-profile/provider-business-profile-service";
import {Suspense} from "react";

import {ProviderBusinessAgreementCard} from "@/components/provider/provider-business-agreement-card";
import {requireProvider} from "@/lib/auth/session";
import {loadBusinessAgreementView} from "@/lib/provider/business-profile/provider-business-agreement-service";
import {
  getServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

import {
  ProviderBusinessProfileClient,
} from "./provider-business-profile-client";

export default async function ProviderBusinessProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{tab?: string | string[]}>;
}) {
  const agreementTab = (await searchParams)?.tab === "agreement";
  const tabs = [
    {label: "Business Profile", href: "/provider/business-profile", active: !agreementTab},
    {label: "Provider Agreement", href: "/provider/business-profile?tab=agreement", active: agreementTab},
  ];

  return (
    <div className="grid min-w-0 gap-6">
      <nav aria-label="Business settings" className="flex flex-wrap gap-2">
        {tabs.map(({label, href, active}) => (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {agreementTab ? (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading provider agreement.</p>}>
          <BusinessAgreementSection />
        </Suspense>
      ) : <BusinessProfileSection />}
    </div>
  );
}

async function BusinessProfileSection() {
  const [profile, serviceCategoryOptions] = await Promise.all([
    getProviderBusinessProfile(),
    getServiceCategoryOptions(),
  ]);
  return <ProviderBusinessProfileClient initialProfile={profile} serviceCategoryOptions={serviceCategoryOptions} />;
}

async function BusinessAgreementSection() {
  const account = await requireProvider();
  const view = await loadBusinessAgreementView({uid: account.uid, providerId: account.providerId});
  return <ProviderBusinessAgreementCard view={view} />;
}
