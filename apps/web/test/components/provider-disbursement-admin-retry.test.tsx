import {beforeEach, expect, it, vi} from "vitest";
import {render, screen, within, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {PaymentMonitoringClient} from "@/components/admin/payments/payment-monitoring-client";
import {PaymentFinanceAttention} from "@/components/admin/payments/payment-finance-attention";
import type {AdminFinanceAttentionItem, AdminPaymentPage} from "@/lib/admin/payments/admin-payment-types";
const mocks=vi.hoisted(()=>({retry:vi.fn(),repair:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/admin/payments/admin-payment-client",()=>({retryFailedProviderDisbursement:mocks.retry,repairAmbiguousProviderPayoutSetup:mocks.repair}));
vi.mock("@/app/admin/payments/actions",()=>({loadAdminPaymentsAction:vi.fn(),loadAdminPaymentDetailsAction:vi.fn(),loadAdminFinanceAttentionQueueAction:mocks.refresh}));
const failed: AdminFinanceAttentionItem={id:"disbursement:payout",kind:"failed_payout",recordState:"valid",
 providerDisbursementId:"payout",canonicalDisbursementStatus:"failed",failedDisbursementRetryEligible:true,
 paymentId:"deposit",providerId:"provider",settlementId:null,payoutAttemptId:null,status:"failed",amountInCentavos:900000,
 formattedAmount:"PHP 9,000",reason:null,updatedAt:null,expectedUpdatedAtMillis:null,payment:null};
const page={payments:[],hasMore:false,nextCursor:null,statistics:{confirmedVolumeFormatted:"PHP 0",pendingProcessingCount:0,
 confirmedVolumeInCentavos:0,failedExpiredCount:0,refundedAmountInCentavos:0,
 failedPaymentCount:0,failedPayoutCount:1,reconciliationRequiredCount:0,refundedAmountFormatted:"PHP 0"}} as AdminPaymentPage;
beforeEach(()=>{vi.clearAllMocks();mocks.retry.mockResolvedValue({prepared:true});mocks.refresh.mockResolvedValue({items:[]});});
it.each(["reconciliation_required","processing","ready","held","ambiguous"])("never offers retry for canonical %s",status=>{
 render(<PaymentFinanceAttention queue={{items:[{...failed,canonicalDisbursementStatus:status}]}} loading={false} repairingItemId={null}
 onRefresh={vi.fn()} onViewPayment={vi.fn()} onRepairPayoutSetup={vi.fn()} onRetryFailedDisbursement={vi.fn()} />);
 expect(screen.queryByRole("button",{name:"Retry failed payout"})).not.toBeInTheDocument();
});
it.each([{recordState:"invalid"},{providerDisbursementId:undefined},{failedDisbursementRetryEligible:false},
 {kind:"ambiguous_payout_setup"},{providerDisbursementId:"unsafe/path"},{canonicalDisbursementStatus:undefined}])("excludes malformed, legacy and setup cases %j",change=>{
 render(<PaymentFinanceAttention queue={{items:[{...failed,...change} as AdminFinanceAttentionItem]}} loading={false} repairingItemId={null}
 onRefresh={vi.fn()} onViewPayment={vi.fn()} onRepairPayoutSetup={vi.fn()} onRetryFailedDisbursement={vi.fn()} />);
 expect(screen.queryByRole("button",{name:"Retry failed payout"})).not.toBeInTheDocument();
});
it("requires confirmation and cancellation performs no retry",async()=>{
 render(<PaymentMonitoringClient initialPage={page} initialAttention={{items:[failed]}} />);
 await userEvent.click(screen.getByRole("button",{name:"Retry failed payout"}));
 const dialog=screen.getByRole("dialog",{name:"Retry failed Provider payout?"});
 expect(within(dialog).getByText(/new payout attempt is created only after financial revalidation/)).toBeInTheDocument();
 expect(mocks.retry).not.toHaveBeenCalled();await userEvent.click(within(dialog).getByRole("button",{name:"Cancel"}));
 expect(mocks.retry).not.toHaveBeenCalled();expect(mocks.repair).not.toHaveBeenCalled();
});
it("invokes only the protected aggregate retry with ID and refreshes issues",async()=>{
 render(<PaymentMonitoringClient initialPage={page} initialAttention={{items:[failed]}} />);
 await userEvent.click(screen.getByRole("button",{name:"Retry failed payout"}));
 await userEvent.click(screen.getByRole("button",{name:"Prepare payout retry"}));
 await waitFor(()=>expect(mocks.retry).toHaveBeenCalledExactlyOnceWith({providerDisbursementId:"payout"}));
 await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(screen.queryByRole("button",{name:"Retry failed payout"})).not.toBeInTheDocument());
 expect(mocks.repair).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:/Check payout status/i})).not.toBeInTheDocument();
});
it("shows safe concurrent status-change feedback",async()=>{
 mocks.retry.mockRejectedValue(new Error("This payout changed or is no longer authoritatively failed. Refresh Provider payout issues."));
 render(<PaymentMonitoringClient initialPage={page} initialAttention={{items:[failed]}} />);
 await userEvent.click(screen.getByRole("button",{name:"Retry failed payout"}));
 await userEvent.click(screen.getByRole("button",{name:"Prepare payout retry"}));
 expect(await screen.findByText(/no longer authoritatively failed/)).toBeInTheDocument();expect(mocks.refresh).not.toHaveBeenCalled();
 expect(mocks.repair).not.toHaveBeenCalled();
});
