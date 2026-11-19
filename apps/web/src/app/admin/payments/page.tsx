import {
  PaymentMonitoringClient,
} from "@/components/admin/payments/payment-monitoring-client";
import {
  getAdminFinanceAttentionQueue,
  getAdminPaymentPage,
  getAdminProviderPayoutBoard,
} from "@/lib/admin/payments/admin-payment-service";

import {requireRole} from "@/lib/auth/session";

export default async function AdminPaymentsPage() {
  await requireRole(["admin"]);
  const [
    initialPage,
    initialAttention,
    initialPayoutBoard,
  ] = await Promise.all([
    getAdminPaymentPage({
      search: "",
      status: "all",
      paymentType: "all",
      date: "all",
      issue: "all",
      sortField: "createdAt",
      sortDirection: "descending",
      pageSize: 10,
      cursor: null,
    }),

    getAdminFinanceAttentionQueue(),
    getAdminProviderPayoutBoard(),
  ]);

  return (
    <PaymentMonitoringClient
      initialPage={initialPage}
      initialAttention={initialAttention}
      initialPayoutBoard={initialPayoutBoard}
    />
  );
}
