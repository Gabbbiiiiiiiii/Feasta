import {
  ProviderRequestsClient,
} from "./provider-requests-client";

import {
  getProviderRequests,
} from "@/lib/provider/requests/provider-request-service";

export default async function ProviderRequestsPage() {
  const result =
    await getProviderRequests();

  return (
    <ProviderRequestsClient
      initialRequests={result.requests}
      initialSummary={result.summary}
    />
  );
}