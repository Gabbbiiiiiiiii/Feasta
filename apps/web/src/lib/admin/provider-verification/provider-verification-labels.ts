export function providerVerificationLabel(status: string): string {
  const labels: Record<string, string> = {
    all: "All verification statuses", pending: "Pending", draft: "Draft",
    submitted: "Submitted", under_review: "Under review", approved: "Approved",
    rejected: "Rejected", resubmission_required: "Updated documents needed", suspended: "Suspended",
  };
  return labels[status] ?? "Unknown status";
}
