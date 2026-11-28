import {SpecialRequestDetails} from "../special-request-details";

export default async function SpecialRequestDetailsPage({
  params,
}: {
  params: Promise<{requestId: string}>;
}) {
  const {requestId} = await params;
  return <SpecialRequestDetails requestId={requestId} />;
}
