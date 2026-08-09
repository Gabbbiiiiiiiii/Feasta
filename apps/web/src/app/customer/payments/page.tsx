import {CustomerPaymentsClient} from "@/components/customer/payments/customer-payments-client";
import {getCustomerPaymentPage} from "@/lib/customer/payments/customer-payment-service";
import {requireCustomer} from "@/lib/auth/session";

export default async function CustomerPaymentsPage() {
  await requireCustomer();

  const initialPage = await getCustomerPaymentPage({
    search: "",
    status: "all",
    pageSize: 10,
    cursor: null,
  });

  return <CustomerPaymentsClient initialPage={initialPage} />;
}