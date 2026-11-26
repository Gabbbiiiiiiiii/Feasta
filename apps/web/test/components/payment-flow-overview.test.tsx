import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {PaymentFlowOverview} from "@/components/shared/payment-flow-overview";
import {parsePaymentDemoEvidence} from "@/lib/payments/payment-demo-evidence";

const reference = "pd_" + "a".repeat(40);
function receipt() {
  return {schemaVersion: 1, testOnly: true, canonicalAccountingChanged: false, status: "confirmed_test_success",
    attempt: {livemode: false, providerDisbursementId: "feasta_demo_fixture", gatewayResourceId: "tr_fixture",
      referenceNumber: reference, amountInCentavos: 90000},
    evidence: {livemode: false, status: "succeeded", currency: "PHP", amount: 90000, id: "tr_fixture",
      reference_number: reference.replace(/^pd_/, "pd-")}, secret: "NEVER_EXPOSE", sourceAccount: "NEVER_EXPOSE"};
}
describe("payment demonstration evidence", () => {
  it("exposes only display fields for confirmed test evidence", () => {
    const evidence = parsePaymentDemoEvidence(receipt());
    expect(evidence).toEqual({amountInCentavos: 90000, transferId: "tr_fixture", gatewayReference: reference.replace(/^pd_/, "pd-")});
    expect(JSON.stringify(evidence)).not.toContain("NEVER_EXPOSE");
  });
  it.each(["live", "unresolved", "accounting_changed", "wrong_amount", "wrong_reference"])("does not claim success for %s receipts", scenario => {
    const data = receipt();
    if (scenario === "live") data.evidence.livemode = true;
    if (scenario === "unresolved") data.status = "unresolved";
    if (scenario === "accounting_changed") data.canonicalAccountingChanged = true;
    if (scenario === "wrong_amount") data.evidence.amount = 1;
    if (scenario === "wrong_reference") data.evidence.reference_number = "pd-" + "b".repeat(40);
    expect(parsePaymentDemoEvidence(data)).toBeNull();
  });
  it("renders the direct-split lifecycle without the capstone demo panel", () => {
    render(<PaymentFlowOverview />);
    expect(screen.getAllByRole("listitem").map((step) => step.firstElementChild?.textContent)).toEqual([
      "1. Customer payment",
      "2. Direct split to provider & FEASTA",
      "3. Cutoff refunds & separate VAT",
    ]);
    expect(screen.queryByText("Separate capstone test demonstration")).not.toBeInTheDocument();
    expect(screen.queryByText("PayMongo simulator transfer confirmed")).not.toBeInTheDocument();
  });
});
