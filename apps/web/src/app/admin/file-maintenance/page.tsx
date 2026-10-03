import {FileMaintenanceClient} from "@/components/admin/file-maintenance/file-maintenance-client";
import {
  ensureDocumentCatalog,
  getAdminAgreementTemplates,
  getAdminAgreementTypes,
  getAdminBusinessDocumentTypes,
} from "@/lib/documents/document-catalog-service";
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
  ] = await Promise.all([
    getAdminServiceCategories(),
    getAdminAgreementTemplates(),
    getAdminAgreementTypes(),
    getAdminBusinessDocumentTypes(),
  ]);

  return (
    <FileMaintenanceClient
      initialCategories={categories}
      initialAgreements={agreements}
      initialAgreementTypes={agreementTypes}
      initialBusinessDocuments={businessDocuments}
    />
  );
}
