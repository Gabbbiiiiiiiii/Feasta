import {
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

export default async function ProviderBusinessProfilePage() {
  const profile = await getProviderBusinessProfile();
  const serviceCategoryOptions =
    await getServiceCategoryOptions();

  return (
    <div className="grid min-w-0 gap-6">
      <ProviderBusinessProfileClient
        initialProfile={profile}
        serviceCategoryOptions={serviceCategoryOptions}
      />
      <Suspense fallback={
        <section aria-busy="true" className="rounded-card border border-border bg-card p-6">
          <h2 className="text-xl font-bold">Provider Agreement</h2>
          <p role="status" className="mt-2 text-sm text-muted-foreground">Loading provider agreement…</p>
        </section>
      }>
        <BusinessAgreementSection />
      </Suspense>
    </div>
  );
}

async function BusinessAgreementSection() {
  const account = await requireProvider();
  const view = await loadBusinessAgreementView({uid: account.uid, providerId: account.providerId});
  return <ProviderBusinessAgreementCard view={view} />;
}
