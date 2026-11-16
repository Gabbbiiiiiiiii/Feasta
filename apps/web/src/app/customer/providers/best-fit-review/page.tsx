import CustomerProvidersPage from "../page";

export default function BestFitReviewPage({searchParams}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CustomerProvidersPage searchParams={searchParams.then((params) => ({
    ...params,
    view: "best-fit-review",
  }))} />;
}
