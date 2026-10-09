export default function ProviderRefundPolicyLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading refund policy">
      <div className="h-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <span className="sr-only" role="status">Loading refund policy</span>
    </div>
  );
}
