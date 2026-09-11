import {
  PaymentMonitoringClient,
} from "@/components/admin/payments/payment-monitoring-client";
import {
  getAdminPaymentPage,
} from "@/lib/admin/payments/admin-payment-service";

export default async function AdminPaymentsPage() {
  const initialPage =
    await getAdminPaymentPage({
      search: "",
      status: "all",
      paymentType: "all",
      date: "all",
      issue: "all",
      sortField: "createdAt",
      sortDirection: "descending",
      pageSize: 10,
      cursor: null,
    });

  return (
    <PaymentMonitoringClient
      initialPage={initialPage}
    />
  );
}