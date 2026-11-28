import {FileMaintenanceClient} from "@/components/admin/file-maintenance/file-maintenance-client";
import {
  ensureDocumentCatalog,
  getAdminAgreementTemplates,
  getAdminAgreementTypes,
  getAdminBusinessDocumentTypes,
} from "@/lib/documents/document-catalog-service";
import {getAdminDefaultCancellationPolicy} from "@/lib/admin/file-maintenance/admin-cancellation-policy-service";
import {getAdminServiceCategories} from "@/lib/admin/file-maintenance/admin-service-category-service";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminFileMaintenancePage() {
  await requireAdmin();
  await ensureDocumentCatalog();
  const [
    categories,
    agreements,
    agreementTypes,
    businessDocuments,
    cancellationPolicy,
  ] = await Promise.all([
    getAdminServiceCategories(),
    getAdminAgreementTemplates(),
    getAdminAgreementTypes(),
    getAdminBusinessDocumentTypes(),
    getAdminDefaultCancellationPolicy(),
  ]);

  return (
    <FileMaintenanceClient
      initialCategories={categories}
      initialAgreements={agreements}
      initialAgreementTypes={agreementTypes}
      initialBusinessDocuments={businessDocuments}
      initialCancellationPolicy={cancellationPolicy}
    />
  );
}
