import {getProviderRefundPolicyPage} from "@/lib/provider/refund-policy/provider-refund-policy-service";

import {ProviderRefundPolicyClient} from "./provider-refund-policy-client";

export default async function ProviderRefundPolicyPage() {
  const data = await getProviderRefundPolicyPage();
  return <ProviderRefundPolicyClient data={data} />;
}
