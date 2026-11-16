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
  it("distinguishes recorded simulator success from provider accounting", () => {
    render(<PaymentFlowOverview evidence={parsePaymentDemoEvidence(receipt())} />);
    expect(screen.getByText("PayMongo simulator transfer confirmed")).toBeVisible();
    expect(screen.getByText(/no real money moved and no provider earnings were marked paid/)).toBeVisible();
    expect(screen.getByText(/₱900.00/)).toBeVisible();
  });
  it("does not display a success claim when no receipt is available", () => {
    render(<PaymentFlowOverview />);
    expect(screen.queryByText("PayMongo simulator transfer confirmed")).toBeNull();
    expect(screen.getByText(/No confirmed test receipt is loaded/)).toBeVisible();
  });
});
