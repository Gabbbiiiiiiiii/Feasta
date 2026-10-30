import {
  PaymentMonitoringClient,
} from "@/components/admin/payments/payment-monitoring-client";
import {
  getAdminFinanceAttentionQueue,
  getAdminPaymentPage,
} from "@/lib/admin/payments/admin-payment-service";

import {requireRole} from "@/lib/auth/session";

export default async function AdminPaymentsPage() {
  await requireRole(["admin"]);
  const [
    initialPage,
    initialAttention,
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
  ]);

  return (
    <PaymentMonitoringClient
      initialPage={initialPage}
      initialAttention={initialAttention}
    />
  );
}