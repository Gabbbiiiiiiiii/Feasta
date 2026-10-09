import {render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
vi.mock("@/app/provider/payments/actions",()=>({loadProviderFinanceOverviewAction:vi.fn()}));
vi.mock("@/lib/provider/payments/provider-payout-client",()=>({refreshProviderPayoutSetup:vi.fn(),startProviderPayoutSetup:vi.fn()}));
import {ProviderFinancePanel} from "@/app/provider/payments/provider-finance-panel";
import type {ProviderFinanceOverview} from "@/lib/provider/payments/provider-finance-types";
function finance(trigger="completed_booking"):ProviderFinanceOverview {return {
 payoutAccount:{setupStatus:"not_started",linkedAccountType:null,invitationStatus:null,activationStatus:null,
 payoutReady:false,relationshipStatus:null,settlementTransportMode:"disabled",settlementTransportReady:false,
 paymongoAccountId:null,childAccountPresent:false,activationProfileComplete:false,identityVerificationStatus:null,
 gatewayLastStatusCode:null,updatedAt:null},earnings:[],earningSummary:{pendingAmountInCentavos:0,availableAmountInCentavos:0,paidAmountInCentavos:0,reversedAmountInCentavos:0},
 settlements:[],settlementSummary:{awaitingAvailabilityAmountInCentavos:0,readyAmountInCentavos:0,reservedAmountInCentavos:0,paidOutAmountInCentavos:0,reconciliationRequiredCount:0},
 disbursements:[{id:"hidden-gateway-id",status:"ready",amountInCentavos:900000,eligibleAt:"2026-10-14T02:00:00Z",trigger}]};}
it("shows banking-day eligibility without promising an exact transfer time",()=>{
 render(<ProviderFinancePanel initialFinance={finance()}/>);
 expect(screen.getByText("Ready for payout")).toBeVisible();expect(screen.getByText(/Expected payout eligibility: Oct 14, 2026/)).toBeVisible();
 expect(screen.getByText(/third banking day after completion/)).toBeVisible();expect(screen.getByText(/Actual transfer timing depends/)).toBeVisible();
 expect(screen.queryByText("hidden-gateway-id")).not.toBeInTheDocument();
});
it("describes the first banking day for finalized compensation",()=>{
 render(<ProviderFinancePanel initialFinance={finance("payment_default_compensation")}/>);
 expect(screen.getByText(/first banking day after refund finalization/)).toBeVisible();
});
