export default function PublicProviderDetailLoading() {
  return (
    <div
      className="grid min-w-0 gap-5 sm:gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading provider profile"
    >
      <h1 className="sr-only">Provider profile</h1>
      <div className="h-11 w-56 max-w-full animate-pulse rounded-lg bg-primary-tint-strong motion-reduce:animate-none" />
      <div className="overflow-hidden rounded-2xl border border-feasta-border-strong/80 bg-white">
        <div className="h-[clamp(11.5rem,28vw,20rem)] animate-pulse bg-primary-tint motion-reduce:animate-none" />
        <div className="relative flex min-w-0 flex-col gap-4 px-4 pb-5 sm:flex-row sm:px-6 sm:pb-7 md:px-8 md:pb-8">
          <div className="-mt-12 size-24 shrink-0 animate-pulse rounded-2xl border-4 border-white bg-primary-tint shadow-sm motion-reduce:animate-none sm:-mt-14 sm:size-28" />
          <div className="grid min-w-0 flex-1 gap-3 sm:pt-16">
            <div className="h-4 w-40 max-w-full animate-pulse rounded bg-primary-tint motion-reduce:animate-none" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-primary-tint-strong motion-reduce:animate-none" />
            <div className="h-5 w-56 max-w-full animate-pulse rounded bg-primary-tint motion-reduce:animate-none" />
          </div>
        </div>
      </div>
      <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          {Array.from({length: 2}, (_, index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-2xl border border-feasta-border-strong/80 bg-white motion-reduce:animate-none"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-feasta-border-strong/80 bg-white motion-reduce:animate-none" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-feasta-border-strong/80 bg-white motion-reduce:animate-none" />
      <div className="h-36 animate-pulse rounded-2xl bg-feasta-surface-strong/90 motion-reduce:animate-none" />
    </div>
  );
}
