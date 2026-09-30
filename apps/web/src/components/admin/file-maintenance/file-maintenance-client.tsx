"use client";

import {useState} from "react";

import {
  AgreementTemplateManagement,
  BusinessDocumentManagement,
} from "@/components/admin/file-maintenance/document-catalog-management-client";
import {ServiceCategoryManagementClient} from "@/components/admin/file-maintenance/service-category-management-client";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentType,
  AgreementTypeRecord,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import type {AdminServiceCategory} from "@/lib/admin/file-maintenance/admin-service-category-types";

const SECTIONS = [
  {id: "service-categories", label: "Service categories"},
  {id: "agreements", label: "Agreements"},
  {id: "business-documents", label: "Business documents"},
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function FileMaintenanceClient({
  initialCategories,
  initialAgreements,
  initialAgreementTypes = [],
  initialBusinessDocuments,
}: {
  initialCategories: AdminServiceCategory[];
  initialAgreements: AdminAgreementTemplate[];
  initialAgreementTypes?: AgreementTypeRecord[];
  initialBusinessDocuments: AdminBusinessDocumentType[];
}) {
  const [section, setSection] =
  useState<SectionId>("service-categories");

  const [categories, setCategories] =
    useState(initialCategories);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="File Maintenance"
        description="Manage service categories, agreements, and business documents. New document types are stored as records and do not require a code change."
      />
      <div
        className="flex min-w-0 gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="File maintenance sections"
      >
        {SECTIONS.map((item) => {
          const selected = section === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              role="tab"
              id={`file-maintenance-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`file-maintenance-panel-${item.id}`}
              variant={selected ? "primary" : "secondary"}
              size="compact"
              className="shrink-0"
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`file-maintenance-panel-${section}`}
        aria-labelledby={`file-maintenance-tab-${section}`}
      >
        {section === "service-categories" ? (
          <ServiceCategoryManagementClient
            categories={categories}
            setCategories={setCategories}
            embedded
          />
        ) : null}
        {section === "agreements" ? (
          <AgreementTemplateManagement
            initialAgreements={initialAgreements}
            agreementTypes={initialAgreementTypes}
          />
        ) : null}
        {section === "business-documents" ? (
          <BusinessDocumentManagement
            initialDocuments={initialBusinessDocuments}
            serviceCategories={categories}
          />
        ) : null}
      </div>
    </div>
  );
}
