import {LegalAgreementPage} from "@/components/documents/legal-agreement-page";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <LegalAgreementPage purpose="privacy_notice" />;
}
