import {AuthCard} from "@/components/auth/auth-card";

export default function TermsPage() {
  return (
    <AuthCard title="FEASTA Terms" description="The approved FEASTA terms must be published here before production enrollment is enabled.">
      <p className="leading-7 text-muted-foreground">
        This local implementation intentionally does not invent legal wording.
        Production enablement remains dependent on an approved, versioned policy.
      </p>
    </AuthCard>
  );
}
