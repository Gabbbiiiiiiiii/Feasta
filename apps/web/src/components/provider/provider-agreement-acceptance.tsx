"use client";

import type {ReactNode} from "react";

import {formatPhilippineDate} from "@/lib/dates/philippine-date";

export function ProviderAgreementAcceptanceSection({
  businessName,
  representativeName,
  agreementName,
  version,
  effectiveDate,
  accepted,
  children,
}: {
  businessName: string;
  representativeName: string;
  agreementName: string;
  version: string;
  effectiveDate: string;
  accepted: boolean;
  children?: ReactNode;
}) {
  return (
    <section aria-label="Electronic Acceptance" className="grid gap-4">
      <h4 className="font-semibold text-foreground">Electronic Acceptance</h4>
      <dl className="grid gap-4 sm:grid-cols-2">
        <AcceptanceDetail label="Provider / Business" value={businessName} />
        <AcceptanceDetail
          label="Authorized Representative"
          value={representativeName}
        />
        <AcceptanceDetail label="Agreement" value={agreementName} />
        <AcceptanceDetail label="Version" value={version} />
        <AcceptanceDetail
          label="Effective Date"
          value={formatPhilippineDate(effectiveDate)}
        />
        <AcceptanceDetail
          label="Acceptance"
          value={accepted ? "Electronically accepted" : "Not yet accepted"}
        />
      </dl>
      {children}
    </section>
  );
}

function AcceptanceDetail({label, value}: {label: string; value: string}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium leading-6 text-foreground">
        {value.trim() || "Not provided"}
      </dd>
    </div>
  );
}
