import {LegalAgreementPage} from "@/components/documents/legal-agreement-page";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalAgreementPage purpose="platform_terms" />;
}
